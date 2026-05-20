export const DEFAULT_EXPLORER_GITHUB_URL = "https://github.com/earthtojake/text-to-cad";

export function normalizeExplorerDefaultFile(value = "") {
  const rawValue = String(value ?? "").trim();
  return rawValue.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function normalizeExplorerGithubUrl(value = "", fallback = DEFAULT_EXPLORER_GITHUB_URL) {
  const rawValue = String(value ?? "").trim();
  const fallbackValue = String(fallback || DEFAULT_EXPLORER_GITHUB_URL).trim() || DEFAULT_EXPLORER_GITHUB_URL;
  const candidate = rawValue || fallbackValue;
  const urlValue = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate.replace(/^\/+/, "")}`;

  try {
    const url = new URL(urlValue);
    return ["http:", "https:"].includes(url.protocol) ? url.href : fallbackValue;
  } catch {
    return fallbackValue;
  }
}
