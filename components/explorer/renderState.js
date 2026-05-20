import {
  normalizeStepClipSettings
} from "../../lib/explorer/clipPlane.js";
import {
  normalizeThemeSettings,
  resolveThemeDisplayMode
} from "../../lib/themeSettings.js";

export function normalizeViewerRenderState({
  themeSettings = {},
  clipSettings = null
} = {}) {
  const normalizedThemeSettings = normalizeThemeSettings(themeSettings);
  return {
    themeSettings: normalizedThemeSettings,
    displayMode: resolveThemeDisplayMode(normalizedThemeSettings),
    clipSettings: normalizeStepClipSettings(clipSettings)
  };
}
