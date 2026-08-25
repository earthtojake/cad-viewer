"""The scanner is standalone, and its vendored cadgen constants stay pinned to cadgen.

scanner.py imports cadgen's package-path constants when the package is importable, but
falls back to vendored literals so the scanner (and the whole viewer server) loads
without cadgen on the path. This file pins two things:

1. drift-guard: when cadgen IS importable, the vendored fallback literals must match
   cadgen's values exactly -- renaming ``drawing.json`` in cadgen must break a test
   again, which the deleted mirror test used to do.
2. scan behavior: the raw catalog shape (root-relative ``file``, ``hash``, ``bytes``,
   ``?v=`` token) and the served-asset gate that the backend containment check leans on.
"""

import contextlib
import importlib
import os
import pathlib
import re
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from server_py import scanner  # noqa: E402

_CADGEN_CONSTANTS = (
    "CADGEN_DIRNAME",
    "CADGEN_MODELS_DIRNAME",
    "DRAWING_DESCRIPTOR_NAME",
    "DRAWING_PACKAGE_KIND",
    "IMPLICIT_DESCRIPTOR_NAME",
    "IMPLICIT_PACKAGE_KIND",
)


def _cadgen_constant_values():
    from cadgen.catalog import CADGEN_DIRNAME, CADGEN_MODELS_DIRNAME  # noqa: PLC0415
    from cadgen._internal.drawing_package import (  # noqa: PLC0415
        DRAWING_DESCRIPTOR_NAME,
        DRAWING_PACKAGE_KIND,
    )
    from cadgen._internal.implicit_package import (  # noqa: PLC0415
        IMPLICIT_DESCRIPTOR_NAME,
        IMPLICIT_PACKAGE_KIND,
    )
    return {
        "CADGEN_DIRNAME": CADGEN_DIRNAME,
        "CADGEN_MODELS_DIRNAME": CADGEN_MODELS_DIRNAME,
        "DRAWING_DESCRIPTOR_NAME": DRAWING_DESCRIPTOR_NAME,
        "DRAWING_PACKAGE_KIND": DRAWING_PACKAGE_KIND,
        "IMPLICIT_DESCRIPTOR_NAME": IMPLICIT_DESCRIPTOR_NAME,
        "IMPLICIT_PACKAGE_KIND": IMPLICIT_PACKAGE_KIND,
    }


def _reload_scanner():
    return importlib.reload(scanner)


class ScannerStandaloneTests(unittest.TestCase):
    def test_scanner_imports_without_cadgen_and_drifts_with_it(self):
        try:
            expected = _cadgen_constant_values()
        except ImportError:
            self.skipTest("cadgen is not importable here")
        saved = sys.modules.pop("cadgen", None)
        try:
            # A None sys.modules entry makes `import cadgen` (and therefore the
            # `from cadgen.* import ...` lines) raise ImportError, exercising the
            # vendored-fallback branch of scanner.py's guarded import.
            sys.modules["cadgen"] = None
            _reload_scanner()
        finally:
            if saved is not None:
                sys.modules["cadgen"] = saved
            else:
                sys.modules.pop("cadgen", None)
        try:
            for name in _CADGEN_CONSTANTS:
                with self.subTest(name=name):
                    self.assertEqual(getattr(scanner, name), expected[name])
        finally:
            # Restore the live (cadgen-backed) module state for any later tests.
            _reload_scanner()

    def test_raw_scan_shape_and_hidden_directory_skip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "part.step").write_text("solid", encoding="utf-8")
            (root / "part.step.glb").write_bytes(b"glb")
            hidden = root / ".review"
            hidden.mkdir()
            (hidden / "draft.step").write_text("hidden", encoding="utf-8")

            raw = scanner.scan_cad_directory(str(root), include_artifact_status=False)
            self.assertEqual(raw["schemaVersion"], scanner.CAD_CATALOG_SCHEMA_VERSION)
            entries = {entry["file"]: entry for entry in raw["entries"]}
            self.assertIn("part.step", entries)
            self.assertIn("part.step.glb", entries)
            self.assertNotIn(".review/draft.step", entries)
            for entry in raw["entries"]:
                with self.subTest(file=entry["file"]):
                    self.assertIsInstance(entry["hash"], str)
                    self.assertIsInstance(entry["bytes"], int)
                    # A render-package source points at its __cadgen__ package dir (the
                    # backend rewrites it into the /__cad/asset?file=..&dir=.. form); a
                    # direct library asset (a generic .glb) is the file itself plus a
                    # `?v=<size>-<mtime_ns>` token.
                    package_form = entry["url"].endswith(f"__cadgen__/models/{entry['file']}")
                    direct_form = re.fullmatch(
                        rf"/{re.escape(entry['file'])}\?v=[0-9a-z]+-[0-9a-z]+", entry["url"]
                    )
                    self.assertTrue(
                        package_form or direct_form,
                        f"unexpected raw url: {entry['url']}",
                    )

    def test_served_asset_gate_used_by_containment(self):
        self.assertTrue(scanner.is_served_cad_asset("/m/part.step"))
        self.assertTrue(scanner.is_served_cad_asset("/m/drawing.dxf"))
        self.assertTrue(scanner.is_served_cad_asset("/m/__cadgen__/models/part.step/package.glb"))
        self.assertFalse(scanner.is_served_cad_asset("/m/package.glb.lock"))
        self.assertFalse(scanner.is_served_cad_asset("/m/.part.step.glb"))


class ScannerPathTests(unittest.TestCase):
    def test_path_is_inside_rejects_escapes(self):
        self.assertTrue(scanner.path_is_inside("/a/b/x.step", "/a/b"))
        self.assertFalse(scanner.path_is_inside("/a/bc/x.step", "/a/b"))
        self.assertFalse(scanner.path_is_inside("/a/x.step", "/a/b"))
        self.assertTrue(scanner.path_is_inside("/a/b", "/a/b"))

    def test_path_is_inside_never_refuses_a_lexically_contained_link(self):
        # realpath exists for ALIAS EQUALITY, never refusal: a link inside the root
        # is contained even when its target lives elsewhere (symlinked model folders
        # are a feature), and macOS's /var vs /private/var compares equal.
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            outside_dir = pathlib.Path(tempfile.gettempdir()) / "scan-alias-target"
            outside_dir.mkdir(exist_ok=True)
            try:
                link = root / "library"
                link.symlink_to(outside_dir, target_is_directory=True)
            except OSError:
                self.skipTest("symlinks unavailable")
            try:
                self.assertTrue(scanner.path_is_inside(str(link / "part.step"), tmp))
                self.assertTrue(scanner.path_is_inside(str(root / "part.step"), tmp))
                # Alias equality: the same directory by either spelling.
                self.assertTrue(scanner.path_is_inside(str(outside_dir / "part.step"), str(outside_dir)))
                self.assertFalse(scanner.path_is_inside(str(outside_dir / "part.step"), tmp))
            finally:
                with contextlib.suppress(OSError):
                    outside_dir.rmdir()

    def test_directory_symlink_loop_terminates_the_walk(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "part.step").write_text("solid", encoding="utf-8")
            try:
                (root / "loop").symlink_to(root, target_is_directory=True)
            except OSError:
                self.skipTest("symlinks unavailable")
            raw = scanner.scan_cad_directory(str(root), include_artifact_status=False)
            self.assertEqual({entry["file"] for entry in raw["entries"]}, {"part.step"})

    def test_directory_symlink_pointing_outside_the_root_is_scanned(self):
        # Symlinked model folders are a feature: a link to content elsewhere joins
        # the catalog like any other subfolder. Only loops are guarded (visited set).
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            outside_dir = pathlib.Path(tempfile.gettempdir()) / "scan-include-link"
            outside_dir.mkdir(exist_ok=True)
            (outside_dir / "linked.step").write_text("linked", encoding="utf-8")
            try:
                (root / "link").symlink_to(outside_dir, target_is_directory=True)
            except OSError:
                self.skipTest("symlinks unavailable")
            try:
                raw = scanner.scan_cad_directory(str(root), include_artifact_status=False)
                self.assertIn("link/linked.step", {entry["file"] for entry in raw["entries"]})
            finally:
                with contextlib.suppress(OSError):
                    outside_dir.rmdir()


if __name__ == "__main__":
    unittest.main()
