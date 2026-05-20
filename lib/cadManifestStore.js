import initialCadCatalog from "virtual:cad-catalog";

const DEFAULT_EXPLORER_ROOT_DIR = "";

function normalizeExplorerRootDir(value = DEFAULT_EXPLORER_ROOT_DIR) {
  const rawValue = String(value ?? "").trim();
  return rawValue.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function normalizeCadManifest(manifest, fallbackDir = DEFAULT_EXPLORER_ROOT_DIR) {
  if (!manifest || typeof manifest !== "object") {
    const normalizedFallbackDir = normalizeExplorerRootDir(fallbackDir);
    return {
      schemaVersion: 3,
      root: {
        dir: normalizedFallbackDir,
        name: normalizedFallbackDir.split("/").filter(Boolean).pop() || "",
        path: normalizedFallbackDir,
      },
      entries: [],
    };
  }

  const normalizedFallbackDir = normalizeExplorerRootDir(fallbackDir);
  return {
    ...manifest,
    root: manifest.root && typeof manifest.root === "object"
      ? manifest.root
      : {
          dir: normalizedFallbackDir,
          name: normalizedFallbackDir.split("/").filter(Boolean).pop() || "",
          path: normalizedFallbackDir,
        },
    entries: Array.isArray(manifest.entries) ? manifest.entries : [],
  };
}

const listeners = new Set();
let currentSnapshot = {
  manifest: normalizeCadManifest(initialCadCatalog),
  revision: 0,
};
let refreshRequestId = 0;

function publishCadManifest(nextManifest) {
  currentSnapshot = {
    manifest: normalizeCadManifest(nextManifest),
    revision: currentSnapshot.revision + 1,
  };
  for (const listener of listeners) {
    listener();
  }
}

async function refreshCadCatalog() {
  if (typeof window === "undefined" || !import.meta.env.DEV) {
    return;
  }
  const requestId = ++refreshRequestId;
  const response = await fetch("/__cad/catalog", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to scan Explorer root: ${response.status} ${response.statusText}`);
  }
  const catalog = await response.json();
  if (requestId === refreshRequestId) {
    publishCadManifest(catalog);
  }
}

export function getCadManifestSnapshot() {
  return currentSnapshot;
}

export function subscribeCadManifest(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (import.meta.hot) {
  import.meta.hot.accept("virtual:cad-catalog", (nextModule) => {
    publishCadManifest(nextModule?.default);
  });
  import.meta.hot.on("cad-catalog:changed", () => {
    refreshCadCatalog().catch((error) => {
      console.warn("Failed to refresh CAD catalog", error);
    });
  });
}

if (typeof window !== "undefined" && import.meta.env.DEV) {
  refreshCadCatalog().catch((error) => {
    console.warn("Failed to refresh CAD catalog", error);
  });
}
