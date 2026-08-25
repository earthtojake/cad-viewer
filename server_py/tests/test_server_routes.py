"""Route-level security invariants for the runnable Python backend.

The L2 finding these pin down: file routes accepted requests with NO ?dir= and then let
the backend skip its containment check entirely, so any local process could read arbitrary
CAD files with `?file=<absolute path>`; and unknown /__cad/* GETs fell through to the SPA
index.html as if they were directories. Now a file route without a directory is 400, the
containment gate always runs, and unrecognized /__cad/* paths answer 404 JSON.
"""

import contextlib
import http.client
import json
import os
import pathlib
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from server_py import backend as backend_mod  # noqa: E402
from server_py import server as server_mod  # noqa: E402


def _request(method, port, path, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        conn.request(method, path, headers=headers or {})
        response = conn.getresponse()
        body = response.read()
        return response.status, dict(response.getheaders()), body
    finally:
        conn.close()


class ServerRouteSecurityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server_mod._Ctx.backend = backend_mod.LocalAssetBackend()
        server_mod._Ctx.dist_root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server_mod.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=10)

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self._tmp.name)
        self.inside = self.root / "part.step"
        self.inside.write_text("solid part", encoding="utf-8")
        self.outside = pathlib.Path(tempfile.gettempdir()) / "outside-secret.step"
        self.outside.write_text("secret", encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()
        with contextlib.suppress(OSError):
            self.outside.unlink()

    def _assets_url(self, file_ref="", dir_ref=""):
        query = []
        if file_ref:
            query.append(f"file={os.path.abspath(file_ref)}")
        if dir_ref:
            query.append(f"dir={os.path.abspath(dir_ref)}")
        return "/__cad/asset?" + "&".join(query)

    def test_asset_without_directory_is_400_not_a_file(self):
        status, headers, body = _request("GET", self.port, self._assets_url(self.inside))
        self.assertEqual(status, 400)
        self.assertTrue(headers.get("content-type", "").startswith("application/json"))
        self.assertEqual(json.loads(body)["error"], "Missing directory")

    def test_asset_outside_the_directory_is_forbidden(self):
        status, _, body = _request("GET", self.port, self._assets_url(self.outside, self.root))
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(body)["error"], "Forbidden")

    def test_asset_inside_the_directory_still_serves(self):
        status, _, body = _request("GET", self.port, self._assets_url(self.inside, self.root))
        self.assertEqual(status, 200)
        self.assertEqual(body, b"solid part")

    def test_missing_file_inside_the_directory_is_404(self):
        missing = self.root / "nope.step"
        status, _, body = _request("GET", self.port, self._assets_url(missing, self.root))
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body)["error"], "Not found")

    def test_asset_in_hidden_directory_below_the_root_is_not_served(self):
        hidden_dir = self.root / ".secret"
        hidden_dir.mkdir()
        hidden_file = hidden_dir / "part.step"
        hidden_file.write_text("hidden", encoding="utf-8")
        status, _, body = _request("GET", self.port, self._assets_url(hidden_file, self.root))
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body)["error"], "Not found")

    def test_symlinked_file_pointing_outside_the_root_still_serves(self):
        # Symlinked model content is a feature: a link inside the open directory is
        # contained LEXICALLY and serves even when its target lives elsewhere. The
        # viewer opens any absolute directory named in the URL, so a link out of the
        # root grants no reach a direct request did not already have.
        outside = pathlib.Path(tempfile.gettempdir()) / "escape-target.step"
        outside.write_text("escape", encoding="utf-8")
        try:
            link = self.root / "escape.step"
            link.symlink_to(outside)
        except OSError:
            self.skipTest("symlinks unavailable")
        try:
            status, _, body = _request("GET", self.port, self._assets_url(link, self.root))
            self.assertEqual(status, 200)
            self.assertEqual(body, b"escape")
        finally:
            with contextlib.suppress(OSError):
                outside.unlink()

    def test_symlinked_file_inside_the_root_still_serves(self):
        try:
            link = self.root / "alias.step"
            link.symlink_to(self.inside)
        except OSError:
            self.skipTest("symlinks unavailable")
        status, _, body = _request("GET", self.port, self._assets_url(link, self.root))
        self.assertEqual(status, 200)
        self.assertEqual(body, b"solid part")

    def test_unknown_cad_api_path_is_404_json_not_spa(self):
        for method in ("GET", "HEAD"):
            with self.subTest(method=method):
                status, headers, body = _request(method, self.port, "/__cad/nope")
                self.assertEqual(status, 404)
                self.assertTrue(headers.get("content-type", "").startswith("application/json"))
                if method == "GET":  # HEAD carries headers only, by design
                    self.assertEqual(json.loads(body)["error"], "Not found")

    def test_legacy_cad_asset_without_directory_is_400(self):
        status, _, body = _request(
            "GET", self.port, "/__cad/mesh.stl", {"Referer": f"http://127.0.0.1:{self.port}/x?file=/a/b.step"}
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "Missing directory")

    def test_reveal_requires_directory_and_respects_containment(self):
        status, _, body = _request("POST", self.port, "/__cad/reveal?file=%2Ftmp%2Fwhatever.step")
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "Missing directory")

        with mock.patch.object(server_mod, "reveal_command_for_path", return_value=None) as reveal, \
                mock.patch.object(server_mod.subprocess, "run") as run:
            status, _, body = _request(
                "POST", self.port, f"/__cad/reveal?file={os.path.abspath(self.outside)}&dir={os.path.abspath(self.root)}"
            )
            self.assertEqual(status, 403)
            self.assertEqual(json.loads(body)["error"], "Forbidden")
            reveal.assert_not_called()
            run.assert_not_called()

    def test_reveal_reveals_the_entry_file_in_the_file_manager(self):
        with mock.patch.object(server_mod, "reveal_command_for_path", return_value=["echo", "reveal"]) as reveal, \
                mock.patch.object(server_mod.subprocess, "run") as run:
            status, _, body = _request(
                "POST", self.port, f"/__cad/reveal?file={os.path.abspath(self.inside)}&dir={os.path.abspath(self.root)}"
            )
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["ok"], True)
            reveal.assert_called_once_with(os.path.abspath(self.inside))
            run.assert_called_once_with(["echo", "reveal"], check=False)

    def test_reveal_missing_file_is_404(self):
        missing = self.root / "missing.step"
        with mock.patch.object(server_mod, "reveal_command_for_path", return_value=["echo", "reveal"]), \
                mock.patch.object(server_mod.subprocess, "run") as run:
            status, _, _ = _request(
                "POST", self.port, f"/__cad/reveal?file={os.path.abspath(missing)}&dir={os.path.abspath(self.root)}"
            )
            self.assertEqual(status, 404)
            run.assert_not_called()


if __name__ == "__main__":
    unittest.main()