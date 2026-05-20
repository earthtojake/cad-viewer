import path from "node:path";

export function isPerStepExplorerDirectoryName(name) {
  const normalized = String(name || "").toLowerCase();
  return normalized.startsWith(".") && (normalized.endsWith(".step") || normalized.endsWith(".stp"));
}

export function isInlineStepGlbArtifactPath(filePath) {
  const name = path.basename(String(filePath || "")).toLowerCase();
  return name.startsWith(".") && (name.endsWith(".step.glb") || name.endsWith(".stp.glb"));
}

export function isInlineStepModulePath(filePath) {
  const name = path.basename(String(filePath || "")).toLowerCase();
  return name.startsWith(".") && name.endsWith(".step.js");
}

export function isPathInsidePerStepExplorerDirectory(filePath) {
  return String(filePath || "")
    .split(path.sep)
    .some((part) => isPerStepExplorerDirectoryName(part));
}

export function inlineStepGlbArtifactPathForSource(sourcePath) {
  return path.join(path.dirname(sourcePath), `.${path.basename(sourcePath)}.glb`);
}

export function legacyStepGlbArtifactPathForSource(sourcePath) {
  return path.join(path.dirname(sourcePath), `.${path.basename(sourcePath)}`, "model.glb");
}

export function stepGlbArtifactPathForSource(sourcePath, { existsSync = null } = {}) {
  const inlinePath = inlineStepGlbArtifactPathForSource(sourcePath);
  if (!existsSync || existsSync(inlinePath)) {
    return inlinePath;
  }
  return legacyStepGlbArtifactPathForSource(sourcePath);
}

export function stepModulePathForStepSource(sourcePath) {
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(path.dirname(sourcePath), `.${stem}.step.js`);
}
