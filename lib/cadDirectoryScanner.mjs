import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  inlineStepGlbArtifactPathForSource,
  isInlineStepGlbArtifactPath,
  isInlineStepModulePath,
  isPathInsidePerStepExplorerDirectory,
  isPerStepExplorerDirectoryName,
  stepModulePathForStepSource
} from "../common/stepSidecars.mjs";
import { toPosixPath } from "./pathUtils.mjs";

export const DEFAULT_EXPLORER_ROOT_DIR = "";

const SOURCE_EXTENSIONS = new Set([".step", ".stp", ".stl", ".3mf", ".glb", ".dxf", ".urdf", ".srdf", ".sdf"]);
const STEP_TOPOLOGY_EXTENSION = "STEP_topology";
const REGENERATE_STEP_COMMAND = "python skills/cad/scripts/step";
const REGENERATE_STEP_PROMPT = "Regenerate STEP artifacts with the following command using the CAD skill:";
export const EXPLORER_SKIPPED_DIRECTORIES = new Set([
  ".agents",
  ".cache",
  ".explorer",
  ".git",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "viewer",
]);
const EXPLORER_URDF_METADATA_PATTERN = /<\s*explorer:urdf\b[^>]*\bpath\s*=\s*["']([^"']+)["'][^>]*>/i;

function encodeUrlPath(repoRelativePath) {
  return `/${repoRelativePath.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

export function normalizeExplorerRootDir(value = DEFAULT_EXPLORER_ROOT_DIR) {
  const rawValue = String(value ?? "").trim();
  const slashNormalized = rawValue.replace(/\\/g, "/");
  const normalized = path.posix.normalize(slashNormalized);
  if (!normalized || normalized === ".") {
    return DEFAULT_EXPLORER_ROOT_DIR;
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Explorer root directory must stay inside the workspace: ${rawValue}`);
  }
  return normalized.replace(/(?!^\/)\/+$/, "");
}

export function resolveExplorerRoot(repoRoot, rootDir = DEFAULT_EXPLORER_ROOT_DIR) {
  const normalizedDir = normalizeExplorerRootDir(rootDir);
  const resolvedRepoRoot = path.resolve(repoRoot);
  const rootPath = normalizedDir
    ? path.resolve(resolvedRepoRoot, normalizedDir)
    : resolvedRepoRoot;
  const relativePath = path.relative(resolvedRepoRoot, rootPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Explorer root directory must stay inside the workspace: ${normalizedDir}`);
  }
  return {
    dir: normalizedDir,
    rootPath,
    rootName: normalizedDir ? path.basename(rootPath) : path.basename(resolvedRepoRoot),
  };
}

export function repoRelativePath(repoRoot, filePath) {
  return toPosixPath(path.relative(path.resolve(repoRoot), path.resolve(filePath)));
}

function scanRelativePath(rootPath, filePath) {
  return toPosixPath(path.relative(path.resolve(rootPath), path.resolve(filePath)));
}

function fileStats(filePath) {
  try {
    const stats = fs.statSync(filePath, { bigint: true });
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}

function fileVersion(filePath) {
  const stats = fileStats(filePath);
  if (!stats) {
    return "";
  }
  return `${stats.size.toString(36)}-${stats.mtimeNs.toString(36)}`;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function assetForPath(repoRoot, filePath) {
  const version = fileVersion(filePath);
  if (!version) {
    return null;
  }
  const repoPath = repoRelativePath(repoRoot, filePath);
  return {
    url: `${encodeUrlPath(repoPath)}?v=${encodeURIComponent(version)}`,
    hash: version,
  };
}

function readExact(fd, length, position) {
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(fd, buffer, 0, length, position);
  return bytesRead === length ? buffer : null;
}

function glbBufferViewRange(gltf, binOffset, binLength, viewIndex) {
  const view = Array.isArray(gltf?.bufferViews) ? gltf.bufferViews[Number(viewIndex)] : null;
  if (!view || Number(view.buffer || 0) !== 0) {
    return null;
  }
  const byteOffset = binOffset + Number(view.byteOffset || 0);
  const byteLength = Number(view.byteLength || 0);
  if (!Number.isFinite(byteOffset) || !Number.isFinite(byteLength) || byteLength < 0) {
    return null;
  }
  if (byteOffset < binOffset || byteOffset + byteLength > binOffset + binLength) {
    return null;
  }
  return { byteOffset, byteLength };
}

function parseJsonBufferView(fd, gltf, binOffset, binLength, viewIndex, encoding = "utf-8") {
  const range = glbBufferViewRange(gltf, binOffset, binLength, viewIndex);
  if (!range) {
    throw new Error("STEP topology buffer view range is invalid");
  }
  const bytes = readExact(fd, range.byteLength, range.byteOffset);
  if (!bytes) {
    throw new Error("STEP topology buffer view range is invalid");
  }
  const payload = JSON.parse(bytes.toString(String(encoding || "utf-8")));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("STEP topology JSON buffer view is not an object");
  }
  return payload;
}

function readGlbTopologyContainer(filePath) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, "r");
    const header = readExact(fd, 12, 0);
    if (!header || header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(4) !== 2) {
      throw new Error("Not a GLB v2 file");
    }
    const totalLength = Math.min(header.readUInt32LE(8), fs.fstatSync(fd).size);
    let offset = 12;
    let gltf = null;
    let binOffset = 0;
    let binLength = 0;
    while (offset + 8 <= totalLength) {
      const chunkHeader = readExact(fd, 8, offset);
      if (!chunkHeader) {
        throw new Error("Invalid GLB chunk header");
      }
      const chunkLength = chunkHeader.readUInt32LE(0);
      const chunkType = chunkHeader.toString("latin1", 4, 8);
      offset += 8;
      if (offset + chunkLength > totalLength) {
        throw new Error("Invalid GLB chunk length");
      }
      if (chunkType === "JSON") {
        const jsonBytes = readExact(fd, chunkLength, offset);
        if (!jsonBytes) {
          throw new Error("GLB is missing JSON chunk");
        }
        gltf = JSON.parse(jsonBytes.toString("utf8").trim());
      } else if (chunkType === "BIN\u0000") {
        binOffset = offset;
        binLength = chunkLength;
      }
      offset += chunkLength;
    }
    return {
      fd,
      gltf,
      binOffset,
      binLength,
    };
  } catch {
    if (fd !== null) {
      fs.closeSync(fd);
    }
    throw new Error("Invalid GLB topology container");
  }
}

function stepArtifactError({ code, reason, repoRoot, cadPath, sourcePath, glbPath }) {
  const glbRelPath = repoRelativePath(repoRoot, glbPath);
  return {
    ok: false,
    error: {
      code,
      message: `${reason}: ${glbRelPath}.\n${REGENERATE_STEP_PROMPT}`,
      cadPath,
      stepPath: repoRelativePath(repoRoot, sourcePath),
      glbPath: glbRelPath,
      regenerateCommand: REGENERATE_STEP_COMMAND,
    },
  };
}

function validateStepTopologyArtifact({ repoRoot, sourcePath, cadPath }) {
  const glbPath = inlineStepGlbArtifactPathForSource(sourcePath);
  const stepHash = sha256File(sourcePath);
  const fail = (code, reason) => ({
    topology: null,
    stepArtifact: stepArtifactError({ code, reason, repoRoot, cadPath, sourcePath, glbPath }),
    glbPath,
    stepHash,
  });

  if (!fileStats(glbPath)) {
    return fail(
      "missing_glb",
      "STEP topology validation requires the generated GLB artifact, but it is missing"
    );
  }

  let container = null;
  try {
    container = readGlbTopologyContainer(glbPath);
    const extension = container.gltf?.extensions?.[STEP_TOPOLOGY_EXTENSION];
    if (!extension || typeof extension !== "object" || Array.isArray(extension)) {
      return fail(
        "missing_step_topology",
        "STEP topology validation requires readable STEP_topology indexView in the GLB"
      );
    }
    if (Number(extension.schemaVersion) !== 1) {
      return fail(
        "unsupported_step_topology",
        "STEP topology validation requires STEP_topology schemaVersion 1 in the GLB"
      );
    }
    const manifest = parseJsonBufferView(
      container.fd,
      container.gltf,
      container.binOffset,
      container.binLength,
      extension.indexView,
      extension.encoding
    );
    const topology = {
      index: manifest,
      entryKind: String(extension.entryKind || manifest.entryKind || "").trim().toLowerCase(),
      hasSelector: false,
    };
    if (Number(manifest.schemaVersion) !== 1) {
      return {
        topology,
        stepArtifact: stepArtifactError({
          code: "unsupported_step_topology",
          reason: "STEP topology validation requires STEP_topology schemaVersion 1 in the GLB",
          repoRoot,
          cadPath,
          sourcePath,
          glbPath,
        }),
        glbPath,
        stepHash,
      };
    }
    if (String(manifest.stepHash || "").trim() !== stepHash) {
      return {
        topology,
        stepArtifact: stepArtifactError({
          code: "stale_step_topology",
          reason: "GLB STEP_topology is stale for the current STEP file",
          repoRoot,
          cadPath,
          sourcePath,
          glbPath,
        }),
        glbPath,
        stepHash,
      };
    }
    try {
      parseJsonBufferView(
        container.fd,
        container.gltf,
        container.binOffset,
        container.binLength,
        extension.selectorView,
        extension.encoding
      );
    } catch {
      return {
        topology,
        stepArtifact: stepArtifactError({
          code: "missing_selector_topology",
          reason: "STEP topology validation requires readable STEP_topology selectorView in the GLB",
          repoRoot,
          cadPath,
          sourcePath,
          glbPath,
        }),
        glbPath,
        stepHash,
      };
    }
    topology.hasSelector = true;
    return {
      topology,
      stepArtifact: {
        ok: true,
        stepHash,
        glbPath: repoRelativePath(repoRoot, glbPath),
      },
      glbPath,
      stepHash,
    };
  } catch {
    return fail(
      "missing_step_topology",
      "STEP topology validation requires readable STEP_topology indexView in the GLB"
    );
  } finally {
    if (container?.fd !== null && container?.fd !== undefined) {
      try {
        fs.closeSync(container.fd);
      } catch {
        // Ignore close failures during catalog scanning.
      }
    }
  }
}

function stepKindFromTopology(topology) {
  const index = topology?.index && typeof topology.index === "object" ? topology.index : topology;
  if (topology?.entryKind === "assembly" || index?.entryKind === "assembly") {
    return "assembly";
  }
  return index?.assembly?.root && typeof index.assembly.root === "object"
    ? "assembly"
    : "part";
}

function sourceFormatFromExtension(extension) {
  const normalized = extension.toLowerCase().replace(/^\./, "");
  return normalized === "stp" ? "stp" : normalized;
}

function isPerUrdfExplorerDirectoryName(name) {
  const normalized = String(name || "").toLowerCase();
  return normalized.startsWith(".") && normalized.endsWith(".urdf");
}

function isHiddenDirectoryName(name) {
  return String(name || "").startsWith(".");
}

function isPathInsidePerUrdfExplorerDirectory(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .some((part) => isPerUrdfExplorerDirectoryName(part));
}

function fileRefForSource(rootPath, sourcePath) {
  return scanRelativePath(rootPath, sourcePath);
}

function cadPathForStepSource(repoRoot, sourcePath, extension) {
  const relativePath = repoRelativePath(repoRoot, sourcePath);
  return relativePath.slice(0, -extension.length);
}

function createStepEntry({ repoRoot, rootPath, sourcePath, extension }) {
  const cadPath = cadPathForStepSource(repoRoot, sourcePath, extension);
  const { topology, stepArtifact, glbPath, stepHash } = validateStepTopologyArtifact({
    repoRoot,
    sourcePath,
    cadPath,
  });
  const assets = {};

  const glbAsset = stepArtifact.ok ? assetForPath(repoRoot, glbPath) : null;
  if (glbAsset && topology?.hasSelector) {
    assets.glb = glbAsset;
    assets.topology = glbAsset;
    assets.selectorTopology = glbAsset;
  }
  const stepModuleAsset = assetForPath(repoRoot, stepModulePathForStepSource(sourcePath));
  if (stepModuleAsset) {
    assets.stepModule = stepModuleAsset;
  }

  const sourceRelPath = fileRefForSource(rootPath, sourcePath);
  return {
    file: fileRefForSource(rootPath, sourcePath),
    cadPath,
    kind: stepKindFromTopology(topology),
    name: path.basename(sourcePath),
    source: {
      kind: "file",
      format: sourceFormatFromExtension(extension),
      path: sourceRelPath,
    },
    assets,
    step: {
      path: sourceRelPath,
      hash: stepHash,
    },
    stepArtifact,
  };
}

function linkedUrdfPathForSrdf(sourcePath, repoRoot) {
  let xmlText = "";
  try {
    xmlText = fs.readFileSync(sourcePath, "utf-8");
  } catch {
    return null;
  }
  const match = EXPLORER_URDF_METADATA_PATTERN.exec(xmlText);
  const rawRef = String(match?.[1] || "").trim();
  if (!rawRef || rawRef.includes("\\") || rawRef.startsWith("/")) {
    return null;
  }
  const resolved = path.resolve(path.dirname(sourcePath), rawRef);
  const relativeToRepo = path.relative(path.resolve(repoRoot), resolved);
  if (relativeToRepo.startsWith("..") || path.isAbsolute(relativeToRepo) || path.extname(resolved).toLowerCase() !== ".urdf") {
    return null;
  }
  return fileStats(resolved) ? resolved : null;
}

function createSingleAssetEntry({ repoRoot, rootPath, sourcePath, extension }) {
  const kind = sourceFormatFromExtension(extension);
  const asset = assetForPath(repoRoot, sourcePath);
  const assets = asset ? { [kind]: asset } : {};
  const entry = {
    file: fileRefForSource(rootPath, sourcePath),
    kind,
    name: path.basename(sourcePath),
    source: {
      kind: "file",
      format: kind,
      path: repoRelativePath(repoRoot, sourcePath),
    },
    assets,
  };
  if (kind === "srdf") {
    const linkedUrdfPath = linkedUrdfPathForSrdf(sourcePath, repoRoot);
    if (linkedUrdfPath) {
      const urdfAsset = assetForPath(repoRoot, linkedUrdfPath);
      if (urdfAsset) {
        assets.urdf = urdfAsset;
        entry.srdf = {
          urdf: fileRefForSource(rootPath, linkedUrdfPath),
        };
      }
    }
  }
  return entry;
}

function shouldSkipDirectory(name) {
  return EXPLORER_SKIPPED_DIRECTORIES.has(name) || isHiddenDirectoryName(name) || isPerStepExplorerDirectoryName(name) || isPerUrdfExplorerDirectoryName(name);
}

function collectCadSourceFiles(rootPath, result = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) {
        collectCadSourceFiles(entryPath, result);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (SOURCE_EXTENSIONS.has(extension) && !isInlineStepGlbArtifactPath(entryPath)) {
      result.push(entryPath);
    }
  }
  return result;
}

function compareEntries(a, b) {
  return String(a.file || "").localeCompare(String(b.file || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function scanCadDirectory({ repoRoot, rootDir = DEFAULT_EXPLORER_ROOT_DIR } = {}) {
  if (!repoRoot) {
    throw new Error("repoRoot is required");
  }
  const resolved = resolveExplorerRoot(repoRoot, rootDir);
  const entries = collectCadSourceFiles(resolved.rootPath)
    .map((sourcePath) => {
      const extension = path.extname(sourcePath).toLowerCase();
      if (extension === ".step" || extension === ".stp") {
        return createStepEntry({
          repoRoot,
          rootPath: resolved.rootPath,
          sourcePath,
          extension,
        });
      }
      return createSingleAssetEntry({
        repoRoot,
        rootPath: resolved.rootPath,
        sourcePath,
        extension,
      });
    })
    .sort(compareEntries);

  return {
    schemaVersion: 3,
    root: {
      dir: resolved.dir,
      name: resolved.rootName,
      path: resolved.dir,
    },
    entries,
  };
}

export function isServedCadAsset(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (isInlineStepGlbArtifactPath(filePath)) {
    return true;
  }
  if (isInlineStepModulePath(filePath)) {
    return true;
  }
  if (isPathInsidePerStepExplorerDirectory(filePath)) {
    return false;
  }
  if (isPathInsidePerUrdfExplorerDirectory(filePath)) {
    return false;
  }
  if (SOURCE_EXTENSIONS.has(extension)) {
    return true;
  }
  return false;
}

export function isCatalogRelevantPath(filePath) {
  return isServedCadAsset(filePath);
}
