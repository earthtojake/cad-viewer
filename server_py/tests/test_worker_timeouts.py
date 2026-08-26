"""Worker and cold-subprocess watchdogs kill IDLENESS, not work in progress.

A hung worker (deadlocked pipe, wedged native call) goes silent; a healthy build
keeps narrating phases on stderr for as long as it needs. The deadline slides with
observed output, which is what lets a multi-minute build survive a short budget --
the property a wall-clock cap can never have.
"""

import json
import os
import pathlib
import sys
import tempfile
import textwrap
import threading
import time
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from server_py import cadgen_bridge  # noqa: E402
from server_py import worker_client  # noqa: E402


class WorkerIdleWatchdogTests(unittest.TestCase):
    def test_a_silent_worker_is_declared_dead_after_the_idle_budget(self):
        worker = worker_client.CadWorker()
        proc = worker_client.subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(10)"],
            stdout=worker_client.subprocess.PIPE,
            stderr=worker_client.subprocess.DEVNULL,
            stdin=worker_client.subprocess.PIPE,
            text=True,
        )
        try:
            with self.assertRaises(worker_client._WorkerTransportError) as ctx:
                worker._read_line(proc, timeout=0.25)
            self.assertIn("silent", str(ctx.exception))
        finally:
            if proc.poll() is None:
                proc.kill()
            for stream in (proc.stdin, proc.stdout):
                if stream:
                    stream.close()
            proc.wait()

    def test_the_deadline_slides_while_the_worker_narrates(self):
        # Narrates on stderr every 0.15s for ~1s before answering. A wall-clock cap of
        # 0.4s would kill it; the idle rule must not.
        script = (
            "import sys, time, json\n"
            "for i in range(6):\n"
            "    sys.stderr.write(f'tick {i}\\n'); sys.stderr.flush()\n"
            "    time.sleep(0.15)\n"
            "sys.stdout.write(json.dumps({'ok': True}) + '\\n'); sys.stdout.flush()\n"
        )
        worker = worker_client.CadWorker()
        proc = worker_client.subprocess.Popen(
            [sys.executable, "-c", script],
            stdout=worker_client.subprocess.PIPE,
            stderr=worker_client.subprocess.PIPE,
            stdin=worker_client.subprocess.PIPE,
            text=True,
        )
        try:
            worker._start_stderr_drain(proc.stderr)
            line = worker._read_line(proc, timeout=0.4)
            self.assertEqual({"ok": True}, json.loads(line))
        finally:
            if proc.poll() is None:
                proc.kill()
            for stream in (proc.stdin, proc.stdout, proc.stderr):
                if stream:
                    stream.close()
            proc.wait()

    def test_worker_request_timeout_reaps_and_recovers(self):
        worker = worker_client.CadWorker()
        try:
            res = worker.ping(timeout=5.0)
            self.assertEqual(res.get("ok"), True)
            self.assertTrue(worker._alive())
            first_pid = worker._proc.pid if worker._proc else None

            original_read_line = worker._read_line
            call_count = [0]

            def mock_read_line(proc, timeout=None):
                call_count[0] += 1
                if call_count[0] == 1:
                    raise worker_client._WorkerTransportError("simulated timeout")
                return original_read_line(proc, timeout)

            with mock.patch.object(worker, "_read_line", side_effect=mock_read_line):
                res = worker.ping(timeout=5.0)
                self.assertEqual(res.get("ok"), True)
                second_pid = worker._proc.pid if worker._proc else None
                self.assertNotEqual(first_pid, second_pid)
        finally:
            worker.close()

    def test_worker_stderr_drain_keeps_activity_fresh(self):
        # The drainer is what feeds the watchdog: every narrated line must move the
        # activity stamp forward. The producer is a real subprocess so the drain runs
        # against the same kind of pipe it sees in production.
        worker = worker_client.CadWorker()
        proc = worker_client.subprocess.Popen(
            [
                sys.executable,
                "-c",
                "import sys, time\n"
                "time.sleep(0.1)\n"
                "sys.stderr.write('phase: meshing\\n'); sys.stderr.flush()\n"
                "time.sleep(5)\n",
            ],
            stdout=worker_client.subprocess.DEVNULL,
            stderr=worker_client.subprocess.PIPE,
            stdin=worker_client.subprocess.DEVNULL,
            text=True,
        )
        try:
            before = worker._last_worker_activity
            worker._start_stderr_drain(proc.stderr)
            deadline = time.monotonic() + 3
            while worker._last_worker_activity == before and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertGreater(worker._last_worker_activity, before)
        finally:
            if proc.poll() is None:
                proc.kill()
            if proc.stderr:
                proc.stderr.close()
            proc.wait()


class ColdProcessIdleWatchdogTests(unittest.TestCase):
    def _module_dir(self, body: str) -> str:
        tmp = tempfile.mkdtemp(prefix="cadgen-cold-idle-")
        (pathlib.Path(tmp) / "cold_probe.py").write_text(textwrap.dedent(body), encoding="utf-8")
        return tmp

    def setUp(self):
        self._old_pythonpath = os.environ.get("PYTHONPATH")

    def tearDown(self):
        if self._old_pythonpath is None:
            os.environ.pop("PYTHONPATH", None)
        else:
            os.environ["PYTHONPATH"] = self._old_pythonpath

    def test_a_silent_cold_subprocess_is_killed_after_the_idle_budget(self):
        tmp = self._module_dir("import time\n\ntime.sleep(5)\n")
        os.environ["PYTHONPATH"] = tmp
        started = time.monotonic()
        result = cadgen_bridge.run_cadgen_cold("cold_probe", [], tmp, timeout=0.3)
        elapsed = time.monotonic() - started
        self.assertFalse(result.get("ok"))
        self.assertIn("silent", result.get("error", ""))
        self.assertLess(elapsed, 3, "a silent subprocess should die at the budget, not at its own end")

    def test_a_cold_exit_without_a_json_line_still_returns_an_error_dict(self):
        # Regression: the idle-watchdog rewrite dropped the function's terminal return,
        # so every subprocess that exited without printing a JSON line (argparse usage
        # errors are the routine case) returned None and crashed the caller.
        tmp = self._module_dir(
            'import sys\n\nsys.stderr.write("cold_probe: required argument missing: --step\\n")\n'
            "sys.exit(2)\n"
        )
        os.environ["PYTHONPATH"] = tmp

        result = cadgen_bridge.run_cadgen_cold("cold_probe", [], tmp)

        self.assertIsNotNone(result, "a non-JSON exit must still return the error dict")
        self.assertFalse(result.get("ok"))
        self.assertEqual(result.get("exitCode"), 2)
        self.assertIn("--step", result.get("error", ""))

    def test_the_cold_deadline_slides_while_the_subprocess_narrates(self):
        body = """
            import sys, time, json
            for i in range(5):
                sys.stderr.write(f"tick {i}\\n"); sys.stderr.flush()
                time.sleep(0.2)
            print(json.dumps({"ok": True}))
        """
        tmp = self._module_dir(body)
        os.environ["PYTHONPATH"] = tmp
        started = time.monotonic()
        result = cadgen_bridge.run_cadgen_cold("cold_probe", [], tmp, timeout=0.35)
        elapsed = time.monotonic() - started
        self.assertTrue(result.get("ok"), f"narrating subprocess was killed: {result}")
        self.assertGreater(elapsed, 0.8)


if __name__ == "__main__":
    unittest.main()
