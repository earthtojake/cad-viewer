"""POSIX advisory locking for artifact coordination.

The KERNEL owns the lock state: it is released when the holding file descriptor closes,
including when the process crashes or is killed. That is the whole reason this is a
``flock`` and not a status file -- it replaced a ``{pid, status, startedAt, updatedAt}``
JSON file refreshed by a 1s heartbeat thread, which had three defects a real lock does not:

* It was never acquired, only written. Two concurrent builds of the same model both
  proceeded, and whichever finished first unlinked the shared file while the other was
  still writing -- so a reader saw "no build in flight" over a half-written package.
* Liveness was inferred from ``os.kill(pid, 0)`` plus a 30s heartbeat window. OCP meshing
  holds the GIL inside C for long stretches, so the heartbeat thread could starve and a
  healthy build would read as dead.
* Producers never waited for each other; only the viewer waited.

**No liveness inference lives here, and none may be added.** No pid checks, no heartbeats,
no age windows. The kernel is the sole authority on "a run is in flight"; the run id in the
sentinel is for ATTRIBUTING a status record to a run, never for deciding one is alive.

Sentinels are never unlinked. Unlinking races: a waiter that already opened the file would
hold a descriptor to an unlinked inode and "acquire" a lock nobody else can see. They are
zero-to-32-byte files under gitignored ``__cadgen__``.

Readers probe with ``LOCK_SH``, writers take ``LOCK_EX``. That asymmetry matters: ``flock``
conflicts per open file description, not per process, so two concurrent ``LOCK_EX`` probes
of an UNHELD sentinel conflict with each other and one of them wrongly reports a build in
flight. Measured at ~6% false positives with four threads before this was fixed.

On Windows there is no ``fcntl``; :mod:`msvcrt` provides byte-range locks (``locking``)
instead. Kernel-ownership on close behaves the same, but the model differs in two ways
that matter: ``msvcrt.locking`` locks a byte region at the CURRENT file position (not the
whole descriptor), and it has no shared mode -- every operation, probes included, takes an
exclusive region lock. A sentinel therefore must hold a byte before it can be locked at
all, and two concurrent Windows probes of the same sentinel can false-positive "held"
(the very race the POSIX shared-probe asymmetry exists to avoid). Locking past EOF is an
error on Windows, so an EMPTY sentinel is reported as degraded rather than held -- a
crash between ``open()`` and stamping must not wedge every later build forever.
"""

from __future__ import annotations

import contextlib
import errno
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Callable, Iterator, NamedTuple

try:  # POSIX only; on a platform without fcntl every operation uses the windows backend
    # or degrades to a no-op.
    import fcntl
except ImportError:  # pragma: no cover - not reachable on darwin/linux CI
    fcntl = None  # type: ignore[assignment]

try:  # Windows only; msvcrt.locking is a byte-range lock, not a whole-descriptor lock.
    import msvcrt
except ImportError:  # pragma: no cover - not reachable on darwin/linux CI
    msvcrt = None  # type: ignore[assignment]


# errnos that mean "a peer holds the lock right now", per backend. POSIX flock raises
# EWOULDBLOCK/EAGAIN for a contended LOCK_NB; Windows msvcrt raises EACCES instead. Folding
# EACCES into the POSIX set would misread one of flock's "the filesystem refused this"
# errors as contention, so the sets stay separate.
_FCNTL_BUSY_ERRNOS = (errno.EWOULDBLOCK, errno.EAGAIN)
_MSVCRT_BUSY_ERRNOS = (errno.EWOULDBLOCK, errno.EAGAIN, errno.EACCES)


_HELD = threading.local()
_RUN_ID_BYTES = 32
_POLL_INTERVAL_S = 0.02

# How long a wait has to last before it is worth announcing, and how often to repeat the
# announcement afterwards. A wait is normally either instant or long: the grace keeps the
# common instant acquire silent, and the repeat is what stops a long one from reading as a
# hung process to whoever (or whatever) is watching the stream.
_WAIT_NOTICE_GRACE_S = 0.25
_WAIT_NOTICE_INTERVAL_S = 30.0


class Contended(RuntimeError):
    """A bounded acquire hit its deadline while a peer held the lock."""

    def __init__(self, lock_path: Path | str) -> None:
        super().__init__(f"generation lock is held by another run: {lock_path}")
        self.lock_path = str(lock_path)


class ProbeResult(NamedTuple):
    """``held`` -- a peer holds the lock right now. ``degraded`` -- we could not tell,
    because locking is unavailable here (no ``fcntl``/``msvcrt``, or a filesystem that
    refuses it)."""

    held: bool
    degraded: bool


def locking_available() -> bool:
    return fcntl is not None or msvcrt is not None


def _unlock(handle) -> None:
    """Release whatever backend lock ``handle`` holds; the caller owns error policy."""
    if fcntl is not None:
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    else:
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def _pad_sentinel(handle) -> None:
    """Ensure the sentinel holds at least one byte, so a Windows region lock is legal.

    Locking past EOF is an error on Windows, and a brand-new sentinel is 0 bytes.
    Sentinels are never unlinked, so this pad happens at most once in the file's life and
    writes nothing visible to ``read_run_id`` (which strips whitespace)."""
    if handle.seek(0, os.SEEK_END) == 0:
        handle.write(b" ")
        handle.flush()
    handle.seek(0)


def new_run_id() -> str:
    return uuid.uuid4().hex


def probe(lock_path: Path | str) -> ProbeResult:
    """Is a peer holding ``lock_path``? Never blocks, never creates the file.

    Opened READ-ONLY on purpose: the old probe opened ``a+b``, which materialised a
    sentinel under ``__cadgen__`` for a model that had never been built, as a side effect
    of a status GET. A missing sentinel means no run has ever held it, which is idle.
    """
    if fcntl is None and msvcrt is None:
        return ProbeResult(held=False, degraded=True)
    path = Path(lock_path)
    try:
        handle = path.open("rb")
    except FileNotFoundError:
        return ProbeResult(held=False, degraded=False)
    except OSError:
        # Unreadable sentinel: we cannot tell, and must not claim a build is running.
        return ProbeResult(held=False, degraded=True)
    try:
        if fcntl is not None:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_SH | fcntl.LOCK_NB)
            except OSError as exc:
                if exc.errno in _FCNTL_BUSY_ERRNOS:
                    return ProbeResult(held=True, degraded=False)
                # ENOLCK / EOPNOTSUPP -- the filesystem does not do advisory locks (NFS,
                # SMB, some bind mounts). Report degraded rather than inventing a state.
                return ProbeResult(held=False, degraded=True)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
                return ProbeResult(held=False, degraded=False)
        # Windows backend: a 1-byte EXCLUSIVE region lock (msvcrt has no shared mode).
        # An empty sentinel cannot be locked at all (lock-past-EOF is an error), and it
        # must read as UNKNOWN, never held: see the module docstring.
        if handle.seek(0, os.SEEK_END) == 0:
            return ProbeResult(held=False, degraded=True)
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as exc:
            if exc.errno in _MSVCRT_BUSY_ERRNOS:
                return ProbeResult(held=True, degraded=False)
            return ProbeResult(held=False, degraded=True)
        else:
            _unlock(handle)
            return ProbeResult(held=False, degraded=False)
    finally:
        handle.close()


def read_run_id(lock_path: Path | str) -> str | None:
    """The run id the current (or most recent) holder wrote into the sentinel.

    ATTRIBUTION ONLY. A run id present in a sentinel says nothing about whether that run is
    still alive -- ``probe()`` is the only thing that answers that.
    """
    try:
        raw = Path(lock_path).read_bytes()[:_RUN_ID_BYTES]
    except OSError:
        return None
    text = raw.decode("ascii", "ignore").strip()
    return text or None


@contextlib.contextmanager
def exclusive(
    lock_path: Path | str | None,
    *,
    run_id: str | None = None,
    deadline_ms: float | None = None,
    on_wait: Callable[[float], None] | None = None,
) -> Iterator[str | None]:
    """Hold ``lock_path`` exclusively for the body. Yields the run id actually recorded.

    Blocking by default -- a concurrent run of the same artifact waits here rather than
    writing the same directory underneath its peer. With ``deadline_ms`` the wait is
    bounded and raises :class:`Contended` instead, which is what lets a request handler
    refuse to block.

    ``on_wait(elapsed_seconds)`` is called once the wait passes a short grace period and
    every :data:`_WAIT_NOTICE_INTERVAL_S` after that, so a caller can say WHY it is
    stalled. Without it a contended acquire is indistinguishable from a hang: the process
    sits in ``flock`` emitting nothing for as long as the peer holds the lock.

    ``None`` (a producer with no coordinated output dir) is a no-op, and so is every
    failure to lock: an unwritable ``__cadgen__``, a filesystem without advisory locks, or
    a platform without ``fcntl`` or ``msvcrt`` degrades to "no coordination" and yields
    None. A build must never fail because a lock was unavailable.
    """
    if lock_path is None or (fcntl is None and msvcrt is None):
        yield None
        return

    path = Path(lock_path)
    # Re-entrancy is per-thread AND per-path: a parent build that triggers a child build of
    # the SAME artifact in-process must not deadlock against itself (flock is per-fd, so a
    # second open in this process would block forever on our own lock). A different artifact
    # in the same thread still takes its own lock.
    held: set[str] = getattr(_HELD, "paths", None) or set()
    _HELD.paths = held
    key = str(path)
    if key in held:
        yield read_run_id(path)
        return

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        handle = path.open("a+b")
    except OSError:
        yield None
        return

    held.add(key)
    try:
        try:
            _acquire(handle, path, deadline_ms=deadline_ms, on_wait=on_wait)
        except OSError:
            # ENOLCK/EOPNOTSUPP and friends. The old code left this call OUTSIDE its
            # try/except, so such a filesystem turned advisory coordination into a hard
            # build failure. Degrade instead -- which is what the policy always claimed.
            # Contended is a RuntimeError, so a bounded acquire's timeout passes straight
            # through here to the caller rather than being swallowed as a degradation.
            yield None
            return
        recorded = (run_id or new_run_id())[:_RUN_ID_BYTES]
        _write_run_id(handle, recorded)
        try:
            yield recorded
        finally:
            with contextlib.suppress(OSError):
                _unlock(handle)
    finally:
        held.discard(key)
        with contextlib.suppress(OSError):
            handle.close()


def _acquire(
    handle,
    path: Path,
    *,
    deadline_ms: float | None,
    on_wait: Callable[[float], None] | None,
) -> None:
    """Take the exclusive lock, honouring an optional deadline and an optional wait notice.

    POSIX, with neither: a plain blocking ``flock`` -- the kernel queues us and the hot
    path costs one syscall. Every other case POLLS: ``flock`` has no timeout and
    alarm-based interruption is not thread-safe, and ``msvcrt.LK_LOCK`` (the Windows
    blocking mode) retries only ten times at one-second intervals before raising, so it
    would turn a genuinely long wait into a spurious degradation. Polling gives the
    deadline and the wait notice meaning on both backends. The interval is short enough
    to be imperceptible against a wait long enough to be worth reporting.

    Raises :class:`Contended` when ``deadline_ms`` elapses with a peer still holding it.
    """
    if fcntl is not None and deadline_ms is None and on_wait is None:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        return

    if fcntl is None:
        # Windows region locks need a byte to lock; pad once (sentinels are never unlinked,
        # so this runs at most once in the file's life).
        _pad_sentinel(handle)
    started = time.monotonic()
    deadline = None if deadline_ms is None else started + (max(0.0, deadline_ms) / 1000.0)
    next_notice_at = _WAIT_NOTICE_GRACE_S
    while True:
        try:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            return
        except OSError as exc:
            busy = _FCNTL_BUSY_ERRNOS if fcntl is not None else _MSVCRT_BUSY_ERRNOS
            if exc.errno not in busy:
                raise
        now = time.monotonic()
        if deadline is not None and now >= deadline:
            raise Contended(path)
        elapsed = now - started
        if on_wait is not None and elapsed >= next_notice_at:
            next_notice_at = elapsed + _WAIT_NOTICE_INTERVAL_S
            # A reporting callback must never be able to fail an acquire.
            with contextlib.suppress(Exception):
                on_wait(elapsed)
        time.sleep(_POLL_INTERVAL_S)


def _write_run_id(handle, run_id: str) -> None:
    """Stamp the sentinel with the holder's run id, under the lock we just took."""
    with contextlib.suppress(OSError):
        handle.seek(0)
        handle.truncate(0)
        handle.write(run_id.encode("ascii", "ignore"))
        handle.flush()
        os.fsync(handle.fileno())
