import path from "node:path";

export function toPosixPath(value) {
  return String(value || "").split(path.sep).join("/");
}

export function encodePathParam(value) {
  return toPosixPath(value)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function pathIsInside(childPath, parentPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

export function pathIsInsideOrEqual(childPath, parentPath) {
  return path.resolve(childPath) === path.resolve(parentPath) || pathIsInside(childPath, parentPath);
}

export function resolveWorkspaceRoot({
  workspaceRoot = "",
  env = process.env,
  cwd = process.cwd(),
  appRoot = "",
  defaultWorkspaceRoot = "",
} = {}) {
  const explicitRoot = workspaceRoot || env.EXPLORER_WORKSPACE_ROOT || "";
  if (explicitRoot) {
    return path.resolve(cwd, explicitRoot);
  }

  const resolvedAppRoot = appRoot ? path.resolve(appRoot) : "";
  for (const candidate of [env.INIT_CWD, cwd]) {
    if (!candidate) {
      continue;
    }
    const resolvedCandidate = path.resolve(candidate);
    if (!resolvedAppRoot || (resolvedCandidate !== resolvedAppRoot && !pathIsInside(resolvedCandidate, resolvedAppRoot))) {
      return resolvedCandidate;
    }
  }

  return defaultWorkspaceRoot ? path.resolve(defaultWorkspaceRoot) : path.resolve(cwd);
}
