export const CAD_WORKSPACE_MOBILE_BREAKPOINT_PX = 520;
export const CAD_WORKSPACE_DESKTOP_BREAKPOINT_PX = CAD_WORKSPACE_MOBILE_BREAKPOINT_PX;
export const CAD_WORKSPACE_FILE_SETTINGS_DEFAULT_OPEN_BREAKPOINT_PX = 700;
export const CAD_WORKSPACE_FILE_EXPLORER_DEFAULT_OPEN_BREAKPOINT_PX = 1024;
export const CAD_WORKSPACE_BREAKPOINT_PX = CAD_WORKSPACE_DESKTOP_BREAKPOINT_PX;

export const CAD_WORKSPACE_DESKTOP_MEDIA_QUERY = `(min-width: ${CAD_WORKSPACE_MOBILE_BREAKPOINT_PX}px)`;
export const CAD_WORKSPACE_MOBILE_MEDIA_QUERY = `(max-width: ${CAD_WORKSPACE_MOBILE_BREAKPOINT_PX - 1}px)`;

export const CAD_WORKSPACE_LAYOUT_MODE = Object.freeze({
  DESKTOP: "desktop",
  MOBILE: "mobile"
});

export function getCadWorkspaceLayoutMode(width) {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth)) {
    return CAD_WORKSPACE_LAYOUT_MODE.DESKTOP;
  }
  return numericWidth >= CAD_WORKSPACE_DESKTOP_BREAKPOINT_PX
    ? CAD_WORKSPACE_LAYOUT_MODE.DESKTOP
    : CAD_WORKSPACE_LAYOUT_MODE.MOBILE;
}

export function isCadWorkspaceMobileViewport(width) {
  return getCadWorkspaceLayoutMode(width) === CAD_WORKSPACE_LAYOUT_MODE.MOBILE;
}

export function isCadWorkspaceDesktopViewport(width) {
  return getCadWorkspaceLayoutMode(width) === CAD_WORKSPACE_LAYOUT_MODE.DESKTOP;
}

function widthIsAtLeast(width, breakpoint) {
  const numericWidth = Number(width);
  return Number.isFinite(numericWidth) ? numericWidth >= breakpoint : true;
}

export function shouldCadWorkspaceDefaultFileExplorerOpen(width, { hasSelectedFile = true } = {}) {
  if (!hasSelectedFile) {
    return true;
  }
  return widthIsAtLeast(width, CAD_WORKSPACE_FILE_EXPLORER_DEFAULT_OPEN_BREAKPOINT_PX);
}

export function shouldCadWorkspaceDefaultFileSettingsOpen(width) {
  return widthIsAtLeast(width, CAD_WORKSPACE_FILE_SETTINGS_DEFAULT_OPEN_BREAKPOINT_PX);
}
