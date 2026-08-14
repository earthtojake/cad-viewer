"""The one atomic rename every artifact writer uses.

Every cached artifact is written to a temp file and renamed into place, so a reader never sees
a half-written payload. On a Windows SMB share that rename is not reliably atomic-and-instant:
the redirector can still hold the handle Python just closed, and the rename loses with
``WinError 32`` (ERROR_SHARING_VIOLATION, "file is being used by another process"). Under a
parallel component build it happens reliably -- see issue #241, where 8 workers failed every
time on a NAS and ``CADGEN_COMPONENT_WORKERS=1`` succeeded.

The remedy is a short bounded retry, and the reason it lives here rather than at each writer is
that there are seven of these renames in a build's write path. Hardening one moves the failure
to the next: the reporter's traceback caught the GLB writer's inner rename, with the outer
component rename one frame away.

Deliberately narrow:

* only ``WinError 32`` retries. A denial (5) or a missing directory is a real error and must
  surface at once, not 350 ms later.
* the attribute does not exist off Windows, so this is exactly ``os.replace`` on POSIX.
* four attempts over 350 ms, then the original error propagates. A rename that cannot win in
  that window is not a deferred close, and a build that hangs retrying is worse than one that
  says what happened.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

# ERROR_SHARING_VIOLATION: the file is open in another process -- or, on SMB, was open a moment
# ago and the server has not caught up.
WINDOWS_SHARING_VIOLATION = 32
RETRY_DELAYS_SECONDS = (0.05, 0.1, 0.2)


def replace_atomic(temp_path: Path | str, target_path: Path | str) -> None:
    """``os.replace`` with a bounded retry for the SMB sharing violation."""
    for delay in (*RETRY_DELAYS_SECONDS, None):
        try:
            os.replace(temp_path, target_path)
            return
        except OSError as error:
            if getattr(error, "winerror", None) != WINDOWS_SHARING_VIOLATION or delay is None:
                raise
            time.sleep(delay)


def write_bytes_atomic(target_path: Path, payload: bytes) -> None:
    """Write ``payload`` to ``target_path`` through a temp file in the same directory.

    Same directory on purpose: a rename across filesystems is not atomic, and a temp dir on
    another volume would silently turn this into a copy.
    """
    resolved = Path(target_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    temp_path = resolved.with_name(f"{resolved.name}.{os.getpid()}.{time.time_ns()}.tmp")
    try:
        temp_path.write_bytes(payload)
        replace_atomic(temp_path, resolved)
    finally:
        temp_path.unlink(missing_ok=True)
