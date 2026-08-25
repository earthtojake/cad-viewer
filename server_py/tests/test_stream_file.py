"""Large asset/download responses stream in chunks instead of buffering whole files."""

import pathlib
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from server_py import server as server_mod  # noqa: E402


class StreamFileTests(unittest.TestCase):
    def _handler(self):
        handler = mock.MagicMock(spec=server_mod.Handler)
        handler.command = "GET"
        written = bytearray()
        handler.wfile = mock.MagicMock()
        handler.wfile.write.side_effect = lambda data: written.extend(data)
        return handler, written

    def test_stream_file_serves_chunks(self):
        with tempfile.TemporaryDirectory() as tmp:
            test_file = pathlib.Path(tmp) / "large.bin"
            payload = b"X" * (128 * 1024)  # 128 KiB, spans several 64 KiB chunks
            test_file.write_bytes(payload)
            handler, written = self._handler()

            ok = server_mod.Handler._stream_file(handler, str(test_file), "application/octet-stream")

            self.assertTrue(ok)
            handler.send_response.assert_called_once_with(200)
            handler.send_header.assert_any_call("content-length", str(len(payload)))
            handler.send_header.assert_any_call("content-type", "application/octet-stream")
            self.assertEqual(bytes(written), payload)

    def test_stream_file_carries_a_download_disposition(self):
        with tempfile.TemporaryDirectory() as tmp:
            test_file = pathlib.Path(tmp) / "part.step"
            test_file.write_bytes(b"solid")
            handler, _ = self._handler()

            ok = server_mod.Handler._stream_file(
                handler, str(test_file), "application/octet-stream", disposition="attachment; filename=x"
            )

            self.assertTrue(ok)
            handler.send_header.assert_any_call("content-disposition", "attachment; filename=x")

    def test_a_broken_client_connection_does_not_raise(self):
        # A browser cancelling a multi-GB download must not spam tracebacks from the
        # handler thread; the socket is going away either way.
        with tempfile.TemporaryDirectory() as tmp:
            test_file = pathlib.Path(tmp) / "large.bin"
            test_file.write_bytes(b"Z" * (256 * 1024))
            handler, _ = self._handler()
            handler.wfile.write.side_effect = BrokenPipeError("client gone")

            ok = server_mod.Handler._stream_file(handler, str(test_file), None)

            self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
