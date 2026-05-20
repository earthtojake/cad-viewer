import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStepClipSettings
} from "../../lib/explorer/clipPlane.js";
import {
  cloneThemePresetSettings,
  normalizeThemeSettings,
  THEME_DISPLAY_MODES
} from "../../lib/themeSettings.js";
import {
  normalizeViewerRenderState
} from "./renderState.js";

test("viewer render-state normalization preserves current theme and display behavior", () => {
  const themeSettings = {
    ...cloneThemePresetSettings("dark"),
    display: { mode: THEME_DISPLAY_MODES.WIREFRAME }
  };
  const state = normalizeViewerRenderState({
    themeSettings,
    clipSettings: {
      enabled: true,
      axis: "z",
      offset: 0.4,
      invert: true
    }
  });

  assert.deepEqual(state.themeSettings, normalizeThemeSettings(themeSettings));
  assert.equal(state.displayMode, THEME_DISPLAY_MODES.WIREFRAME);
  assert.deepEqual(state.clipSettings, normalizeStepClipSettings({
    enabled: true,
    axis: "z",
    offset: 0.4,
    invert: true
  }));
});

test("viewer render-state normalization keeps viewer-side defaults local", () => {
  const state = normalizeViewerRenderState();

  assert.deepEqual(state.themeSettings, normalizeThemeSettings({}));
  assert.equal(state.displayMode, "solid");
  assert.deepEqual(state.clipSettings, normalizeStepClipSettings(null));
});
