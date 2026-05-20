import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isServedCadAsset,
  normalizeExplorerRootDir,
  resolveExplorerRoot,
  scanCadDirectory,
} from "./cadDirectoryScanner.mjs";

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cad-explorer-scan-"));
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function writeStep(filePath, content = "ISO-10303-21;\nEND-ISO-10303-21;\n") {
  writeFile(filePath, content);
  return sha256Buffer(Buffer.from(content));
}

function pad4(buffer, byte = 0) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, byte)]) : buffer;
}

function topologyGlb(manifest, { selector = true, extensionSchemaVersion = 1 } = {}) {
  let binary = Buffer.alloc(0);
  const bufferViews = [];
  function addBufferView(payload) {
    binary = pad4(binary);
    const byteOffset = binary.length;
    binary = Buffer.concat([binary, payload]);
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: payload.length });
    return index;
  }
  const indexManifest = { schemaVersion: 1, profile: "index", entryKind: manifest.entryKind || (manifest.assembly ? "assembly" : "part"), ...manifest };
  const indexView = addBufferView(Buffer.from(JSON.stringify(indexManifest), "utf8"));
  const selectorView = selector
    ? addBufferView(Buffer.from(JSON.stringify({ schemaVersion: 1, profile: "selector", ...manifest }), "utf8"))
    : null;
  binary = pad4(binary);
  const extension = { schemaVersion: extensionSchemaVersion, entryKind: indexManifest.entryKind, indexView, encoding: "utf-8" };
  if (selectorView !== null) {
    extension.selectorView = selectorView;
  }
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    extensionsUsed: ["STEP_topology"],
    extensions: { STEP_topology: extension },
  };
  const jsonChunk = pad4(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
  const header = Buffer.alloc(12);
  const jsonHeader = Buffer.alloc(8);
  const binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binary.length, 8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.write("JSON", 4, "latin1");
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.write("BIN\0", 4, "latin1");
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binary]);
}

function entryByFile(catalog, file) {
  return catalog.entries.find((entry) => entry.file === file);
}

function assertStepArtifactError(entry, code) {
  assert.equal(entry.stepArtifact.ok, false);
  assert.equal(entry.stepArtifact.error.code, code);
  assert.match(entry.stepArtifact.error.message, /\.\nRegenerate STEP artifacts with the following command using the CAD skill:/);
  assert.equal(entry.stepArtifact.error.regenerateCommand, "python skills/cad/scripts/step");
  assert.deepEqual(entry.assets, {});
}

test("scanCadDirectory discovers CAD files directly and infers STEP assets", () => {
  const repoRoot = makeTempRepo();
  const stepHash = writeStep(path.join(repoRoot, "workspace/sample_part/sample_part.step"));
  writeFile(path.join(repoRoot, "workspace/sample_part/.sample_part.step.glb"), topologyGlb({
    stepHash,
    assembly: {
      mesh: { addressing: "gltf-node-extras" },
      root: { nodeType: "assembly" }
    },
  }));
  writeFile(path.join(repoRoot, "workspace/sample_part/.sample_part.step.js"), "export default { manifest: { schemaVersion: 1 } };\n");
  writeFile(path.join(repoRoot, "workspace/sample_part/.sample_part.step/ignored.step"), "ignored\n");
  writeFile(path.join(repoRoot, "workspace/sample_part/sample_part.stl"), "solid sample_part\nendsolid sample_part\n");
  writeFile(path.join(repoRoot, "workspace/sample_part/sample_part.3mf"), "3mf\n");
  writeFile(path.join(repoRoot, "workspace/sample_part/sample_part.glb"), "native glb\n");
  writeFile(path.join(repoRoot, "workspace/sheets/bracket.dxf"), "0\nEOF\n");
  writeFile(path.join(repoRoot, "workspace/robots/sample_robot.urdf"), "<robot name=\"sample_robot\" />\n");
  writeFile(path.join(repoRoot, "workspace/robots/sample_robot.srdf"), "<robot name=\"sample_robot\" xmlns:explorer=\"https://text-to-cad.dev/explorer\"><explorer:urdf path=\"sample_robot.urdf\"/></robot>\n");
  writeFile(path.join(repoRoot, "workspace/robots/sample_robot.sdf"), "<sdf version=\"1.12\"><model name=\"sample_robot\" /></sdf>\n");
  writeFile(path.join(repoRoot, "workspace/robots/.sample_robot.urdf/ignored.urdf"), "<robot name=\"ignored\" />\n");
  writeFile(path.join(repoRoot, "workspace/sample_part/sample_part.py"), "print('ignored')\n");
  writeFile(path.join(repoRoot, "workspace/.hidden/hidden.step"), "ISO-10303-21;\nEND-ISO-10303-21;\n");

  const catalog = scanCadDirectory({ repoRoot, rootDir: "workspace" });

  assert.equal(catalog.root.dir, "workspace");
  const stepEntry = entryByFile(catalog, "sample_part/sample_part.step");
  assert.equal(stepEntry.kind, "assembly");
  assert.equal(stepEntry.cadPath, "workspace/sample_part/sample_part");
  assert.equal(stepEntry.step.hash, stepHash);
  assert.deepEqual(stepEntry.stepArtifact, {
    ok: true,
    stepHash,
    glbPath: "workspace/sample_part/.sample_part.step.glb"
  });
  assert.ok(stepEntry.assets.glb.url.startsWith("/workspace/sample_part/.sample_part.step.glb?v="));
  assert.ok(stepEntry.assets.stepModule.url.startsWith("/workspace/sample_part/.sample_part.step.js?v="));
  assert.equal(stepEntry.assets.topology.hash, stepEntry.assets.glb.hash);
  assert.equal(stepEntry.assets.selectorTopology.hash, stepEntry.assets.glb.hash);
  assert.equal(entryByFile(catalog, "sample_part/sample_part.stl").kind, "stl");
  assert.equal(entryByFile(catalog, "sample_part/sample_part.3mf").kind, "3mf");
  assert.equal(entryByFile(catalog, "sample_part/sample_part.glb").kind, "glb");
  assert.equal(entryByFile(catalog, "sheets/bracket.dxf").kind, "dxf");
  assert.equal(entryByFile(catalog, "robots/sample_robot.urdf").kind, "urdf");
  assert.equal(entryByFile(catalog, "robots/sample_robot.srdf").kind, "srdf");
  assert.equal(entryByFile(catalog, "robots/sample_robot.sdf").kind, "sdf");
  assert.ok(entryByFile(catalog, "robots/sample_robot.sdf").assets.sdf.url.startsWith("/workspace/robots/sample_robot.sdf?v="));
  assert.ok(entryByFile(catalog, "robots/sample_robot.srdf").assets.srdf.url.startsWith("/workspace/robots/sample_robot.srdf?v="));
  assert.ok(entryByFile(catalog, "robots/sample_robot.srdf").assets.urdf.url.startsWith("/workspace/robots/sample_robot.urdf?v="));
  assert.equal(entryByFile(catalog, "robots/sample_robot.srdf").srdf.urdf, "robots/sample_robot.urdf");
  assert.equal(entryByFile(catalog, "sample_part/sample_part.py"), undefined);
  assert.equal(entryByFile(catalog, "sample_part/.sample_part.step.glb"), undefined);
  assert.equal(entryByFile(catalog, "sample_part/.sample_part.step.js"), undefined);
  assert.equal(entryByFile(catalog, "sample_part/.sample_part.step/ignored.step"), undefined);
  assert.equal(entryByFile(catalog, "robots/.sample_robot.urdf/ignored.urdf"), undefined);
  assert.equal(entryByFile(catalog, ".hidden/hidden.step"), undefined);
});

test("scanCadDirectory ignores legacy STEP artifact folders and reports missing canonical GLB", () => {
  const repoRoot = makeTempRepo();
  const stepHash = writeStep(path.join(repoRoot, "workspace/sample_part/sample_part.step"));
  writeFile(path.join(repoRoot, "workspace/sample_part/.sample_part.step/model.glb"), topologyGlb({
    cadRef: "workspace/sample_part/sample_part",
    stepHash,
    entryKind: "part",
    stats: { shapeCount: 1 },
  }));

  const catalog = scanCadDirectory({ repoRoot, rootDir: "workspace" });
  const entry = entryByFile(catalog, "sample_part/sample_part.step");

  assert.equal(entry.kind, "part");
  assertStepArtifactError(entry, "missing_glb");
  assert.equal(entry.stepArtifact.error.glbPath, "workspace/sample_part/.sample_part.step.glb");
});

test("scanCadDirectory reports malformed canonical GLBs as missing STEP topology", () => {
  const repoRoot = makeTempRepo();
  writeStep(path.join(repoRoot, "workspace/sample_part/sample_part.step"));
  writeFile(path.join(repoRoot, "workspace/sample_part/.sample_part.step.glb"), "not a glb");

  const catalog = scanCadDirectory({ repoRoot, rootDir: "workspace" });
  const entry = entryByFile(catalog, "sample_part/sample_part.step");

  assertStepArtifactError(entry, "missing_step_topology");
});

test("scanCadDirectory reports unsupported STEP_topology schema versions", () => {
  const repoRoot = makeTempRepo();
  const stepHash = writeStep(path.join(repoRoot, "workspace/sample_part/sample_part.step"));
  writeFile(path.join(repoRoot, "workspace/sample_part/.sample_part.step.glb"), topologyGlb({
    stepHash,
    entryKind: "part",
  }, { extensionSchemaVersion: 2 }));

  const catalog = scanCadDirectory({ repoRoot, rootDir: "workspace" });
  const entry = entryByFile(catalog, "sample_part/sample_part.step");

  assertStepArtifactError(entry, "unsupported_step_topology");
});

test("scanCadDirectory reports stale STEP_topology hashes", () => {
  const repoRoot = makeTempRepo();
  writeStep(path.join(repoRoot, "workspace/sample_part/sample_part.step"));
  writeFile(path.join(repoRoot, "workspace/sample_part/.sample_part.step.glb"), topologyGlb({
    stepHash: "old-step-hash",
    entryKind: "part",
  }));

  const catalog = scanCadDirectory({ repoRoot, rootDir: "workspace" });
  const entry = entryByFile(catalog, "sample_part/sample_part.step");

  assertStepArtifactError(entry, "stale_step_topology");
});

test("scanCadDirectory accepts legacy STEP_topology CAD refs when the colocated STEP hash matches", () => {
  const repoRoot = makeTempRepo();
  const stepHash = writeStep(path.join(repoRoot, "workspace/sample_part/sample_part.step"));
  writeFile(path.join(repoRoot, "workspace/sample_part/.sample_part.step.glb"), topologyGlb({
    cadRef: "workspace/other_part",
    stepHash,
    entryKind: "part",
  }));

  const catalog = scanCadDirectory({ repoRoot, rootDir: "workspace" });
  const entry = entryByFile(catalog, "sample_part/sample_part.step");

  assert.equal(entry.stepArtifact.ok, true);
  assert.deepEqual(Object.keys(entry.assets).sort(), ["glb", "selectorTopology", "topology"]);
});

test("isServedCadAsset allows hidden STEP runtime modules only by convention", () => {
  assert.equal(isServedCadAsset("/workspace/sample/.gearbox.step.js"), true);
  assert.equal(isServedCadAsset("/workspace/sample/.gearbox.stp.js"), false);
  assert.equal(isServedCadAsset("/workspace/sample/gearbox.step.js"), false);
  assert.equal(isServedCadAsset("/workspace/sample/gearbox.js"), false);
});

test("scanCadDirectory reports missing selector topology", () => {
  const repoRoot = makeTempRepo();
  const stepHash = writeStep(path.join(repoRoot, "workspace/sample_part/sample_part.step"));
  writeFile(path.join(repoRoot, "workspace/sample_part/.sample_part.step.glb"), topologyGlb({
    stepHash,
    entryKind: "part",
  }, { selector: false }));

  const catalog = scanCadDirectory({ repoRoot, rootDir: "workspace" });
  const entry = entryByFile(catalog, "sample_part/sample_part.step");

  assertStepArtifactError(entry, "missing_selector_topology");
});

test("scanCadDirectory uses the requested root directory as the displayed root", () => {
  const repoRoot = makeTempRepo();
  writeFile(path.join(repoRoot, "workspace/imports/sample_part.step"), "ISO-10303-21;\nEND-ISO-10303-21;\n");

  const catalog = scanCadDirectory({ repoRoot, rootDir: "workspace/imports" });

  assert.equal(catalog.root.dir, "workspace/imports");
  assert.equal(catalog.root.name, "imports");
  assert.deepEqual(catalog.entries.map((entry) => entry.file), ["sample_part.step"]);
});

test("scanCadDirectory defaults to the workspace root", () => {
  const repoRoot = makeTempRepo();
  writeFile(path.join(repoRoot, "workspace/imports/sample_part.step"), "ISO-10303-21;\nEND-ISO-10303-21;\n");
  writeFile(path.join(repoRoot, ".agents/ignored.step"), "ISO-10303-21;\nEND-ISO-10303-21;\n");

  const catalog = scanCadDirectory({ repoRoot });

  assert.equal(catalog.root.dir, "");
  assert.equal(catalog.root.name, path.basename(repoRoot));
  assert.deepEqual(catalog.entries.map((entry) => entry.file), ["workspace/imports/sample_part.step"]);
});

test("normalizeExplorerRootDir rejects traversal", () => {
  assert.equal(normalizeExplorerRootDir(""), "");
  assert.equal(normalizeExplorerRootDir("workspace/samples"), "workspace/samples");
  assert.throws(() => normalizeExplorerRootDir("../workspace"), /inside the workspace/);
});

test("normalizeExplorerRootDir preserves absolute paths", () => {
  assert.equal(normalizeExplorerRootDir("/abs/path/exports"), "/abs/path/exports");
  assert.equal(normalizeExplorerRootDir("/abs/path/exports/"), "/abs/path/exports");
  assert.equal(normalizeExplorerRootDir("/"), "/");
});

test("resolveExplorerRoot accepts an absolute path inside the workspace", () => {
  const repo = makeTempRepo();
  try {
    const absoluteDir = path.join(repo, "exports");
    fs.mkdirSync(absoluteDir, { recursive: true });
    const resolved = resolveExplorerRoot(repo, absoluteDir);
    assert.equal(resolved.rootPath, path.resolve(absoluteDir));
    assert.equal(resolved.rootName, "exports");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("resolveExplorerRoot rejects an absolute path outside the workspace", () => {
  const repo = makeTempRepo();
  try {
    assert.throws(
      () => resolveExplorerRoot(repo, "/elsewhere/outside"),
      /inside the workspace/,
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("isServedCadAsset does not serve hidden per-URDF directories", () => {
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_robot.urdf", "metadata.json")), false);
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_robot.urdf", "srdf", "metadata.json")), false);
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_robot.urdf", "srdf", "moveit2_server.json")), false);
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_robot.urdf", "ignored.urdf")), false);
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_robot.urdf", "other.json")), false);
});

test("isServedCadAsset serves standalone 3MF entries", () => {
  assert.equal(isServedCadAsset(path.join("workspace", "meshes", "sample_part.3mf")), true);
});

test("isServedCadAsset serves standalone native GLB entries", () => {
  assert.equal(isServedCadAsset(path.join("workspace", "meshes", "sample_part.glb")), true);
});

test("isServedCadAsset serves standalone SDF entries", () => {
  assert.equal(isServedCadAsset(path.join("workspace", "robots", "sample_robot.sdf")), true);
});

test("isServedCadAsset serves inline GLBs and ignores legacy STEP artifact files", () => {
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_part.step.glb")), true);
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_part.step", "model.glb")), false);
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_part.step", "topology.json")), false);
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_part.step", "topology.bin")), false);
  assert.equal(isServedCadAsset(path.join("workspace", ".sample_part.step", "other.json")), false);
});

test("isServedCadAsset does not expose workspace-local JavaScript files", () => {
  assert.equal(isServedCadAsset(path.join("workspace", "sample_robot.js")), false);
});
