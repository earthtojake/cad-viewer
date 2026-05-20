import { buildCadRefToken, parseCadRefToken } from "../cadRefs.js";
import { normalizeExplorerDefaultFile } from "../explorerConfig.mjs";

const CAD_QUERY_PARAM = "file";
const CAD_REF_QUERY_PARAM = "refs";

export function fileKey(entry) {
  return String(entry?.file || "").trim();
}

export function cadPathForEntry(entry) {
  return String(entry?.cadPath || "").trim();
}

function replaceUrl(url) {
  const nextSearch = url.searchParams.toString();
  window.history.replaceState({}, "", `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`);
}

function normalizeUrlPath(value) {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function normalizeCadFileQueryParam(value) {
  return normalizeUrlPath(value);
}

export function readDefaultCadParam() {
  return normalizeExplorerDefaultFile(import.meta.env?.EXPLORER_DEFAULT_FILE) || null;
}

export function normalizeCadRefQueryParams(values) {
  const sourceValues = Array.isArray(values) ? values : [values];
  const seenTokens = new Set();
  const tokens = [];

  for (const sourceValue of sourceValues) {
    const lines = String(sourceValue || "").split(/\r?\n/);
    for (const line of lines) {
      const normalizedLine = String(line || "").trim();
      const parsedToken = parseCadRefToken(normalizedLine) || parseCadRefToken(`@cad[${normalizedLine}]`);
      const token = String(
        parsedToken
          ? buildCadRefToken({ cadPath: parsedToken.cadPath, selectors: parsedToken.selectors })
          : ""
      ).trim();
      if (!token || seenTokens.has(token)) {
        continue;
      }
      seenTokens.add(token);
      tokens.push(token);
    }
  }

  return tokens;
}

function cadRefQueryValueFromToken(token) {
  const parsedToken = parseCadRefToken(token);
  return parsedToken?.token
    ? parsedToken.token.slice("@cad[".length, -1)
    : "";
}

export function readCadParam() {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const value = params.get(CAD_QUERY_PARAM);
  const normalizedValue = typeof value === "string"
    ? normalizeCadFileQueryParam(value)
    : "";
  return normalizedValue || null;
}

export function readCadRefQueryParams() {
  if (typeof window === "undefined") {
    return [];
  }
  const params = new URLSearchParams(window.location.search);
  return normalizeCadRefQueryParams(params.getAll(CAD_REF_QUERY_PARAM));
}

export function findEntryByUrlPath(entries, urlPath) {
  if (!urlPath) {
    return null;
  }
  return entries.find((entry) => fileKey(entry) === urlPath) || null;
}

export function findEntryByCadRefParams(entries, cadRefs = readCadRefQueryParams()) {
  for (const cadRef of Array.isArray(cadRefs) ? cadRefs : [cadRefs]) {
    const cadPath = String(parseCadRefToken(cadRef)?.cadPath || "").trim();
    if (!cadPath) {
      continue;
    }
    const match = entries.find((entry) => cadPathForEntry(entry) === cadPath);
    if (match) {
      return match;
    }
  }
  return null;
}

export function selectedEntryKeyFromUrl(entries, { cadRefs = readCadRefQueryParams(), defaultFile = readDefaultCadParam() } = {}) {
  const explicitFilePath = readCadParam();
  if (explicitFilePath) {
    const match = findEntryByUrlPath(entries, explicitFilePath);
    return match ? fileKey(match) : "";
  }

  const match = findEntryByCadRefParams(entries, cadRefs) || findEntryByUrlPath(entries, normalizeCadFileQueryParam(defaultFile));
  return match ? fileKey(match) : "";
}

export function writeCadParam(urlPath) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (urlPath) {
    url.searchParams.set(CAD_QUERY_PARAM, urlPath);
  } else {
    url.searchParams.delete(CAD_QUERY_PARAM);
  }
  replaceUrl(url);
}

export function writeCadRefQueryParams(cadRefs) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete(CAD_REF_QUERY_PARAM);
  for (const token of Array.isArray(cadRefs) ? cadRefs : [cadRefs]) {
    const queryValue = cadRefQueryValueFromToken(token);
    if (queryValue) {
      url.searchParams.append(CAD_REF_QUERY_PARAM, queryValue);
    }
  }
  replaceUrl(url);
}

function compareSidebarLabels(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function entryLeafName(entry) {
  const sourceRelPath = String(
    (["part", "assembly"].includes(String(entry?.kind || "").trim().toLowerCase()) && entry?.step?.path)
      ? entry.step.path
      : (entry?.source?.path || entry?.step?.path || "")
  );
  if (sourceRelPath) {
    const parts = sourceRelPath.split("/");
    return parts[parts.length - 1] || sourceRelPath;
  }

  const file = fileKey(entry);
  if (!file) {
    return "";
  }
  const parts = file.split("/");
  return parts[parts.length - 1] || file;
}

function normalizedEntryStem(entry) {
  return entryLeafName(entry)
    .replace(/\.step\.json$/i, "")
    .replace(/\.urdf\.json$/i, "")
    .replace(/\.(step|stp|stl|3mf|glb|dxf|urdf|srdf|sdf|py)$/i, "");
}

export function sidebarDirectoryIdForEntry(entry) {
  const file = fileKey(entry);
  const parts = file.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function sourceExtensionForEntry(entry) {
  const leafName = entryLeafName(entry);
  const match = /\.([^.]+)$/.exec(leafName);
  return String(match?.[1] || "").trim().toLowerCase();
}

export function filenameLabelForEntry(entry) {
  const stem = normalizedEntryStem(entry);
  if (!stem) {
    return "";
  }
  const kind = String(entry?.kind || "").trim().toLowerCase();
  const directSourceFormats = new Set(["dxf", "urdf", "srdf", "sdf", "stl", "3mf", "glb"]);
  const sourceFormat = directSourceFormats.has(kind)
    ? kind
    : String(sourceExtensionForEntry(entry) || "step").trim().toLowerCase();

  if (sourceFormat === "dxf") {
    return `${stem}.dxf`;
  }
  if (sourceFormat === "urdf" || entry?.kind === "urdf") {
    return `${stem}.urdf`;
  }
  if (sourceFormat === "srdf" || entry?.kind === "srdf") {
    return `${stem}.srdf`;
  }
  if (sourceFormat === "sdf" || entry?.kind === "sdf") {
    return `${stem}.sdf`;
  }
  if (sourceFormat === "stl" || entry?.kind === "stl") {
    return `${stem}.stl`;
  }
  if (sourceFormat === "3mf" || entry?.kind === "3mf") {
    return `${stem}.3mf`;
  }
  if (sourceFormat === "glb" || entry?.kind === "glb") {
    return `${stem}.glb`;
  }
  return `${stem}.${sourceFormat === "stp" ? "stp" : "step"}`;
}

export function sidebarLabelForEntry(entry) {
  return filenameLabelForEntry(entry);
}

function compareSidebarEntries(a, b) {
  const nameDiff = sidebarLabelForEntry(a).localeCompare(sidebarLabelForEntry(b), undefined, {
    numeric: true,
    sensitivity: "base"
  });
  if (nameDiff !== 0) {
    return nameDiff;
  }
  return fileKey(a).localeCompare(fileKey(b), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function createSidebarDirectoryNode(id, name) {
  return {
    id,
    name,
    entries: [],
    children: new Map()
  };
}

function finalizeSidebarDirectoryNode(node) {
  return {
    id: node.id,
    name: node.name,
    entries: [...node.entries].sort(compareSidebarEntries),
    directories: [...node.children.values()]
      .map(finalizeSidebarDirectoryNode)
      .sort((a, b) => compareSidebarLabels(a.name, b.name))
  };
}

export function buildSidebarDirectoryTree(entries, { rootName = "Workspace" } = {}) {
  const root = createSidebarDirectoryNode("", String(rootName || "Workspace"));

  for (const entry of entries) {
    const directoryId = sidebarDirectoryIdForEntry(entry);
    const directoryParts = directoryId ? directoryId.split("/") : [];
    let currentNode = root;
    let currentId = "";

    for (const part of directoryParts) {
      currentId = currentId ? `${currentId}/${part}` : part;
      const childNode = currentNode.children.get(part) || createSidebarDirectoryNode(currentId, part);
      currentNode.children.set(part, childNode);
      currentNode = childNode;
    }

    currentNode.entries.push(entry);
  }

  return finalizeSidebarDirectoryNode(root);
}

export function collectSidebarDirectoryIds(directoryNode, result = []) {
  for (const directory of directoryNode.directories || []) {
    result.push(directory.id);
    collectSidebarDirectoryIds(directory, result);
  }
  return result;
}

export function findSidebarDirectoryById(directoryNode, directoryId) {
  const targetId = String(directoryId || "").trim();
  if (!directoryNode) {
    return null;
  }
  if (String(directoryNode.id || "") === targetId) {
    return directoryNode;
  }

  for (const childDirectory of directoryNode.directories || []) {
    const match = findSidebarDirectoryById(childDirectory, targetId);
    if (match) {
      return match;
    }
  }

  return null;
}

export function sidebarDirectoryPath(directoryNode, directoryId) {
  const targetId = String(directoryId || "").trim();
  if (!directoryNode) {
    return [];
  }
  if (!targetId) {
    return [directoryNode];
  }

  const result = [];
  const visit = (node) => {
    result.push(node);
    if (String(node.id || "") === targetId) {
      return true;
    }

    for (const childDirectory of node.directories || []) {
      if (visit(childDirectory)) {
        return true;
      }
    }

    result.pop();
    return false;
  };

  return visit(directoryNode) ? result : [];
}

export function listSidebarItems(directory) {
  return [
    ...(directory.directories || []).map((childDirectory) => ({
      type: "directory",
      key: `directory:${childDirectory.id}`,
      label: childDirectory.name,
      value: childDirectory
    })),
    ...(directory.entries || []).map((entry) => ({
      type: "entry",
      key: `entry:${fileKey(entry)}`,
      label: sidebarLabelForEntry(entry),
      value: entry
    }))
  ].sort((a, b) => {
    const labelDiff = compareSidebarLabels(a.label, b.label);
    if (labelDiff !== 0) {
      return labelDiff;
    }
    return a.key.localeCompare(b.key, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}

export function collectAncestorDirectoryIds(directoryId) {
  if (!directoryId) {
    return [];
  }

  const parts = String(directoryId).split("/").filter(Boolean);
  const ancestorIds = [];
  let currentId = "";

  for (const part of parts) {
    currentId = currentId ? `${currentId}/${part}` : part;
    ancestorIds.push(currentId);
  }

  return ancestorIds;
}
