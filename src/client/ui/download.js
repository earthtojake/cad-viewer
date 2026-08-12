const DOWNLOAD_BLOCKED_MESSAGE = "Download was blocked by the browser";

function normalizeFilename(value) {
  return String(value || "").trim();
}

function downloadRequestedMessage(filename) {
  const normalizedFilename = normalizeFilename(filename);
  return normalizedFilename ? `Downloading ${normalizedFilename}` : "Downloading file";
}

function getDownloadDocument() {
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("Downloads are not available in this browser");
  }
  return doc;
}

function clickDownloadLink(link) {
  if (typeof link.click !== "function") {
    throw new Error("Downloads are not available in this browser");
  }

  try {
    link.click();
  } catch (error) {
    throw error instanceof Error ? error : new Error(DOWNLOAD_BLOCKED_MESSAGE);
  }
}

export function triggerUrlDownload(url, { filename = "" } = {}) {
  const href = String(url || "").trim();
  if (!href) {
    throw new Error("No download URL is available");
  }

  const doc = getDownloadDocument();
  const link = doc.createElement("a");
  link.href = href;
  link.rel = "noopener";
  const normalizedFilename = normalizeFilename(filename);
  if (normalizedFilename) {
    link.download = normalizedFilename;
  }
  if (link.style) {
    link.style.display = "none";
  }

  doc.body?.appendChild?.(link);
  try {
    clickDownloadLink(link);
  } finally {
    doc.body?.removeChild?.(link);
  }

  return {
    filename: normalizedFilename,
    message: downloadRequestedMessage(normalizedFilename),
    status: "requested"
  };
}

export function triggerBlobDownload(blob, { filename = "" } = {}) {
  if (!blob || typeof blob !== "object") {
    throw new Error("No download data is available");
  }
  const urlApi = globalThis.URL;
  if (typeof urlApi?.createObjectURL !== "function") {
    throw new Error("Downloads are not available in this browser");
  }

  const downloadUrl = urlApi.createObjectURL(blob);
  try {
    return triggerUrlDownload(downloadUrl, { filename });
  } finally {
    const revoke = () => {
      urlApi.revokeObjectURL?.(downloadUrl);
    };
    if (typeof globalThis.setTimeout === "function") {
      globalThis.setTimeout(revoke, 1000);
    } else {
      revoke();
    }
  }
}
