import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneThemePresetSettings,
  DEFAULT_THEME_PRESET_ID,
  DEFAULT_THEME_SETTINGS,
  getThemePresetIdForSettings,
  inferThemeSettingsSceneTone,
  THEME_DISPLAY_MODES,
  THEME_EDGE_SOURCES,
  THEME_PRESETS,
  THEME_TOPOLOGY_EDGE_FILTERS,
  MAX_THEME_FILL_COLORS,
  normalizeThemeFillColors,
  normalizeThemeSettings,
  resolveThemeFillColor,
  resolveThemeSettingsDisplayEdgeSettings,
  resolveThemeSettingsDisplayMode,
  resolveSystemThemePresetId
} from "./themeSettings.js";

const WORKBENCH_FILL_COLORS = Object.freeze([
  "#b6c4ce",
  "#f4a7a7",
  "#f8c77e",
  "#f7e38d",
  "#b9e88f",
  "#8fe3c0",
  "#92d7f5",
  "#a9b8ff",
  "#c7a8ff",
  "#f2a7d9"
]);

const BLUE_FILL_COLORS = Object.freeze(["#58d6ff", "#92e5ff", "#35b8ff", "#3f8dff"]);
const MAGENTA_FILL_COLORS = Object.freeze(["#ff8bd2", "#ffb1e1", "#ff63bd", "#d889ff"]);
const CLAY_FILL_COLORS = Object.freeze(["#ffd6a8", "#f6b77f", "#d98a5d", "#b66b4f"]);
const TERMINAL_FILL_COLORS = Object.freeze(["#48ff8b", "#9dffbd", "#22d86f", "#14c9a2"]);
const DARKOAL_FILL_COLORS = Object.freeze([
  "#b6c4ce",
  "#c2a1a5",
  "#e6d1af",
  "#b0ab85",
  "#91ae86",
  "#7cab9f",
  "#7da5b9",
  "#8996be",
  "#988ebe",
  "#ad8dab"
]);
const DIAGNOSTIC_FILL_COLORS = Object.freeze(["#d7dce0", "#cdd3d8", "#e4e7ea", "#bfc7ce"]);

test("theme presets expose a default material color", () => {
  const blue = cloneThemePresetSettings("blue");
  const pink = cloneThemePresetSettings("pink");

  assert.equal(THEME_PRESETS.find((preset) => preset.id === "pink")?.label, "Magenta");
  assert.equal(blue.materials.defaultColor, "#58d6ff");
  assert.deepEqual(blue.materials.fillColors, BLUE_FILL_COLORS);
  assert.equal(blue.materials.cycleColors, true);
  assert.equal(pink.materials.defaultColor, "#ff8bd2");
  assert.deepEqual(pink.materials.fillColors, MAGENTA_FILL_COLORS);
  assert.equal(pink.materials.cycleColors, true);
  assert.equal(getThemePresetIdForSettings(blue), "blue");
  assert.equal(getThemePresetIdForSettings(pink), "pink");
});

test("light is the default theme preset", () => {
  assert.equal(DEFAULT_THEME_PRESET_ID, "light");
  assert.equal(THEME_PRESETS[0]?.id, "light");
  assert.equal(THEME_PRESETS[0]?.label, "Light");
  assert.equal(getThemePresetIdForSettings(DEFAULT_THEME_SETTINGS), "light");
  assert.deepEqual(cloneThemePresetSettings("cinematic"), cloneThemePresetSettings("light"));
});

test("light preset tracks the CAD render cinematic material treatment", () => {
  const cinematic = cloneThemePresetSettings("light");

  assert.equal(cinematic.materials.defaultColor, "#b6c4ce");
  assert.deepEqual(cinematic.materials.fillColors, WORKBENCH_FILL_COLORS);
  assert.equal(cinematic.materials.cycleColors, false);
  assert.equal(resolveThemeFillColor(cinematic.materials, 3), "#b6c4ce");
  assert.equal(cinematic.materials.overrideSourceColors, false);
  assert.equal(cinematic.materials.tintMode, "blend");
  assert.equal(cinematic.materials.tintStrength, 0);
  assert.equal(cinematic.materials.saturation, 1.18);
  assert.equal(cinematic.materials.contrast, 1.12);
  assert.equal(cinematic.materials.brightness, 1.02);
  assert.equal(cinematic.materials.roughness, 0.58);
  assert.equal(cinematic.materials.clearcoat, 0.12);
  assert.equal(cinematic.materials.envMapIntensity, 0.42);
  assert.equal(cinematic.materials.emissiveIntensity, 0.02);
  assert.equal(cinematic.edges.enabled, true);
  assert.equal(cinematic.edges.contrastMode, "auto");
  assert.equal(cinematic.edges.source, THEME_EDGE_SOURCES.DERIVED);
  assert.equal(cinematic.edges.color, "#132232");
  assert.equal(cinematic.edges.opacity, 0.2);
  assert.equal(cinematic.edges.thickness, 0.85);
  assert.equal(cinematic.environment.enabled, true);
  assert.equal(cinematic.environment.intensity, 0.32);
  assert.equal(cinematic.background.solidColor, "#edf5fb");
  assert.equal(cinematic.background.linearStart, "#fbfdff");
  assert.equal(cinematic.background.linearEnd, "#b8cadb");
  assert.equal(cinematic.floor.reflectivity, 0.14);
  assert.equal(cinematic.lighting.toneMappingExposure, 1.16);
  assert.equal(cinematic.lighting.ambient.intensity, 0.4);
  assert.equal(cinematic.lighting.hemisphere.intensity, 1.12);
});

test("studio showroom preset exposes realistic studio settings", () => {
  const studio = cloneThemePresetSettings("studio-showroom");
  const studioPreset = THEME_PRESETS.find((preset) => preset.id === "studio-showroom");

  assert.equal(studioPreset?.label, "Studio");
  assert.equal(studioPreset?.glassTone, "light");
  assert.equal(studio.materials.defaultColor, "#111111");
  assert.deepEqual(studio.materials.fillColors, ["#111111"]);
  assert.equal(studio.materials.cycleColors, false);
  assert.equal(studio.materials.overrideSourceColors, false);
  assert.equal(studio.materials.tintStrength, 0);
  assert.equal(studio.materials.roughness, 0.82);
  assert.equal(studio.materials.metalness, 0);
  assert.equal(studio.materials.clearcoat, 0.02);
  assert.equal(studio.materials.envMapIntensity, 0.55);
  assert.equal(studio.environment.enabled, true);
  assert.equal(studio.environment.presetId, "studio-hdri-41");
  assert.equal(studio.environment.intensity, 0.85);
  assert.equal(studio.floor.mode, "stage");
  assert.equal(studio.floor.reflectivity, 0.22);
  assert.equal(studio.edges.enabled, false);
  assert.equal(studio.edges.contrastMode, "manual");
  assert.equal(studio.edges.color, "#111827");
  assert.equal(studio.lighting.directional.intensity, 1.55);
  assert.equal(inferThemeSettingsSceneTone(studio), "light");
  assert.equal(getThemePresetIdForSettings(studio), "studio-showroom");
});

test("dark preset uses the darkoal midpoint treatment", () => {
  const dark = cloneThemePresetSettings("dark");
  const darkPreset = THEME_PRESETS.find((preset) => preset.id === "dark");

  assert.equal(darkPreset?.label, "Dark");
  assert.equal(dark.materials.defaultColor, "#b6c4ce");
  assert.deepEqual(dark.materials.fillColors, DARKOAL_FILL_COLORS);
  assert.equal(dark.materials.cycleColors, false);
  assert.equal(resolveThemeFillColor(dark.materials, 3), "#b6c4ce");
  assert.equal(dark.materials.tintMode, "blend");
  assert.equal(dark.materials.tintStrength, 0);
  assert.equal(dark.materials.saturation, 1.2);
  assert.equal(dark.materials.contrast, 1.14);
  assert.equal(dark.materials.brightness, 1.06);
  assert.equal(dark.edges.enabled, true);
  assert.equal(dark.edges.contrastMode, "auto");
  assert.equal(dark.edges.color, "#132232");
  assert.equal(dark.environment.enabled, true);
  assert.equal(dark.environment.intensity, 0.18);
  assert.equal(dark.background.solidColor, "#0f1922");
  assert.equal(dark.background.linearStart, "#212e3c");
  assert.equal(dark.background.linearEnd, "#05090f");
  assert.equal(dark.background.radialInner, "#243a4d");
  assert.equal(dark.background.radialOuter, "#05090f");
  assert.equal(dark.floor.color, "#111d29");
  assert.equal(dark.floor.roughness, 0.38);
  assert.equal(dark.floor.reflectivity, 0.1);
  assert.equal(dark.floor.shadowOpacity, 0.42);
  assert.equal(dark.floor.horizonBlend, 0.1);
  assert.equal(dark.lighting.toneMappingExposure, 1.22);
  assert.equal(dark.lighting.spot.enabled, true);
  assert.equal(dark.lighting.spot.color, "#70c4ff");
  assert.equal(dark.lighting.spot.intensity, 0.24);
  assert.equal(dark.lighting.point.color, "#9bd0ff");
  assert.equal(dark.lighting.ambient.intensity, 0.24);
  assert.equal(dark.lighting.hemisphere.groundColor, "#020713");
  assert.equal(dark.lighting.hemisphere.intensity, 0.98);
  assert.equal(getThemePresetIdForSettings(dark), "dark");
});

test("technical preset uses flat neutral diagnostic review styling", () => {
  const technical = cloneThemePresetSettings("technical");
  const technicalPreset = THEME_PRESETS.find((preset) => preset.id === "technical");
  const studioPreset = THEME_PRESETS.find((preset) => preset.id === "studio-showroom");

  assert.equal(technicalPreset?.label, "Technical");
  assert.equal(THEME_PRESETS.indexOf(technicalPreset) < THEME_PRESETS.indexOf(studioPreset), true);
  assert.equal(technical.materials.defaultColor, DIAGNOSTIC_FILL_COLORS[0]);
  assert.deepEqual(technical.materials.fillColors, DIAGNOSTIC_FILL_COLORS);
  assert.equal(technical.materials.cycleColors, true);
  assert.equal(resolveThemeFillColor(technical.materials, 0), "#d7dce0");
  assert.equal(resolveThemeFillColor(technical.materials, 3), "#bfc7ce");
  assert.equal(resolveThemeFillColor(technical.materials, 4), "#d7dce0");
  assert.equal(technical.materials.overrideSourceColors, false);
  assert.equal(technical.materials.tintMode, "blend");
  assert.equal(technical.materials.saturation, 0);
  assert.equal(technical.materials.contrast, 1);
  assert.equal(technical.materials.roughness, 0.92);
  assert.equal(technical.materials.clearcoat, 0);
  assert.equal(technical.edges.contrastMode, "manual");
  assert.equal(technical.edges.source, THEME_EDGE_SOURCES.TOPOLOGY);
  assert.equal(technical.edges.topologyFilter, THEME_TOPOLOGY_EDGE_FILTERS.FEATURE);
  assert.equal(technical.edges.topologyMinRelevance, 1);
  assert.equal(technical.edges.color, "#111827");
  assert.equal(technical.edges.opacity, 0.96);
  assert.equal(technical.edges.thickness, 1);
  assert.equal(technical.edges.silhouette, true);
  assert.equal(technical.edges.silhouetteScale, 0.0025);
  assert.equal(technical.background.type, "solid");
  assert.equal(technical.background.solidColor, "#f7f7f7");
  assert.equal(technical.floor.mode, "none");
  assert.equal(technical.environment.enabled, false);
  assert.equal(technical.lighting.ambient.intensity, 0.82);
  assert.equal(getThemePresetIdForSettings(technical), "technical");
});

test("beach preset keeps light materials with sunlit sand presentation styling", () => {
  const beach = cloneThemePresetSettings("beach");
  const light = cloneThemePresetSettings("light");
  const beachPreset = THEME_PRESETS.find((preset) => preset.id === "beach");

  assert.equal(beachPreset?.label, "Beach");
  assert.equal(beachPreset?.glassTone, "light");
  assert.deepEqual(beach.materials, light.materials);
  assert.equal(beach.edges.enabled, true);
  assert.equal(beach.edges.contrastMode, "auto");
  assert.equal(beach.edges.color, "#0d5961");
  assert.equal(beach.background.type, "linear");
  assert.equal(beach.background.solidColor, "#dff7f7");
  assert.equal(beach.background.linearStart, "#fff4d6");
  assert.equal(beach.background.linearEnd, "#47c5d6");
  assert.equal(beach.floor.mode, "stage");
  assert.equal(beach.floor.color, "#f2d59b");
  assert.equal(beach.floor.reflectivity, 0.18);
  assert.equal(beach.environment.enabled, true);
  assert.equal(beach.environment.presetId, "studio-hdri-12");
  assert.equal(beach.lighting.directional.color, "#fff7df");
  assert.equal(beach.lighting.point.color, "#ffd08a");
  assert.equal(beach.lighting.hemisphere.skyColor, "#bff8ff");
  assert.equal(inferThemeSettingsSceneTone(beach), "light");
  assert.equal(getThemePresetIdForSettings(beach), "beach");
});

test("only technical enables topology display edges by default", () => {
  const topologyPresetIds = THEME_PRESETS
    .filter((preset) => normalizeThemeSettings(preset.settings).edges.source === THEME_EDGE_SOURCES.TOPOLOGY)
    .map((preset) => preset.id);

  assert.deepEqual(topologyPresetIds, ["technical"]);
});

test("legacy technical edge settings migrate to topology display edges", () => {
  const legacyTechnical = cloneThemePresetSettings("technical");
  delete legacyTechnical.edges.source;
  delete legacyTechnical.edges.topologyFilter;
  delete legacyTechnical.edges.topologyMinRelevance;
  const normalized = normalizeThemeSettings(legacyTechnical);

  assert.equal(normalized.edges.source, THEME_EDGE_SOURCES.TOPOLOGY);
  assert.equal(normalized.edges.topologyFilter, THEME_TOPOLOGY_EDGE_FILTERS.FEATURE);
  assert.equal(normalized.edges.topologyMinRelevance, 1);
});

test("diagnostic theme id resolves to technical", () => {
  const diagnostic = cloneThemePresetSettings("diagnostic");

  assert.equal(THEME_PRESETS.some((preset) => preset.id === "diagnostic"), false);
  assert.deepEqual(diagnostic, cloneThemePresetSettings("technical"));
  assert.equal(getThemePresetIdForSettings(diagnostic), "technical");
});

test("legacy darkoal and charcoal ids resolve to dark", () => {
  const dark = cloneThemePresetSettings("dark");

  assert.equal(THEME_PRESETS.some((preset) => preset.id === "darkoal"), false);
  assert.equal(THEME_PRESETS.some((preset) => preset.id === "charcoal"), false);
  assert.deepEqual(cloneThemePresetSettings("darkoal"), dark);
  assert.deepEqual(cloneThemePresetSettings("charcoal"), dark);
  assert.deepEqual(cloneThemePresetSettings("dark-2"), dark);
});

test("stylized dark presets keep their palettes but share dark studio lighting", () => {
  const dark = cloneThemePresetSettings("dark");
  const paletteExpectations = [
    {
      presetId: "blue",
      materialColor: "#58d6ff",
      fillColors: BLUE_FILL_COLORS,
      edgeColor: "#063d61",
      backgroundColor: "#04131f",
      floorColor: "#06324f"
    },
    {
      presetId: "pink",
      materialColor: "#ff8bd2",
      fillColors: MAGENTA_FILL_COLORS,
      edgeColor: "#ff8ac7",
      backgroundColor: "#281323",
      floorColor: "#4a1833"
    },
    {
      presetId: "clay-sunrise",
      materialColor: "#ffd6a8",
      fillColors: CLAY_FILL_COLORS,
      edgeColor: "#000000",
      backgroundColor: "#f3eadc",
      floorColor: "#d4a070"
    },
    {
      presetId: "terminal",
      materialColor: "#48ff8b",
      fillColors: TERMINAL_FILL_COLORS,
      edgeColor: "#66ff99",
      backgroundColor: "#020403",
      floorColor: "#020403"
    }
  ];

  for (const expectation of paletteExpectations) {
    const settings = cloneThemePresetSettings(expectation.presetId);
    assert.deepEqual({
      ...settings.materials,
      defaultColor: dark.materials.defaultColor,
      fillColors: dark.materials.fillColors,
      cycleColors: dark.materials.cycleColors
    }, dark.materials);
    assert.deepEqual({
      ...settings.edges,
      color: dark.edges.color
    }, dark.edges);
    assert.deepEqual(settings.environment, dark.environment);
    assert.deepEqual(settings.lighting, dark.lighting);
    assert.equal(settings.materials.defaultColor, expectation.materialColor);
    assert.deepEqual(settings.materials.fillColors, expectation.fillColors);
    assert.equal(settings.materials.cycleColors, true);
    assert.equal(settings.edges.color, expectation.edgeColor);
    assert.equal(settings.background.solidColor, expectation.backgroundColor);
    assert.equal(settings.floor.color, expectation.floorColor);
    assert.equal(getThemePresetIdForSettings(settings), expectation.presetId);
  }
});

test("fill color normalization keeps up to fifty colors and syncs the default fill", () => {
  assert.deepEqual(normalizeThemeFillColors(["#ABC", "nope", "#123456"], "#ffffff"), ["#aabbcc", "#123456"]);
  assert.deepEqual(normalizeThemeFillColors([], "#abc123"), ["#abc123"]);
  const fillColors = Array.from({ length: MAX_THEME_FILL_COLORS + 1 }, (_, index) => {
    return `#${String(index + 1).padStart(6, "0")}`;
  });

  const normalized = normalizeThemeSettings({
    ...cloneThemePresetSettings("dark"),
    materials: {
      ...cloneThemePresetSettings("dark").materials,
      defaultColor: "#111111",
      fillColors,
      cycleColors: true,
      overrideSourceColors: true
    }
  });

  assert.equal(normalized.materials.defaultColor, "#000001");
  assert.equal(normalized.materials.fillColors.length, MAX_THEME_FILL_COLORS);
  assert.equal(normalized.materials.fillColors.at(-1), "#000050");
  assert.equal(normalized.materials.cycleColors, true);
  assert.equal(normalized.materials.overrideSourceColors, true);
  assert.equal(resolveThemeFillColor(normalized.materials, 51), "#000002");
});

test("disabled color cycling preserves palettes without rotating fills", () => {
  const normalized = normalizeThemeSettings({
    materials: {
      defaultColor: "#111111",
      fillColors: ["#111111", "#222222", "#333333"],
      cycleColors: false
    }
  });

  assert.deepEqual(normalized.materials.fillColors, ["#111111", "#222222", "#333333"]);
  assert.equal(resolveThemeFillColor(normalized.materials, 0), "#111111");
  assert.equal(resolveThemeFillColor(normalized.materials, 2), "#111111");
});

test("auto edge contrast resolves display line styles from surface luminance", () => {
  const lightEdges = resolveThemeSettingsDisplayEdgeSettings(cloneThemePresetSettings("light"));
  const darkEdges = resolveThemeSettingsDisplayEdgeSettings(cloneThemePresetSettings("dark"));
  const darkSurfaceEdges = resolveThemeSettingsDisplayEdgeSettings({
    ...cloneThemePresetSettings("dark"),
    materials: {
      ...cloneThemePresetSettings("dark").materials,
      defaultColor: "#141821",
      fillColors: ["#141821"]
    }
  });
  const technicalEdges = resolveThemeSettingsDisplayEdgeSettings(cloneThemePresetSettings("technical"));

  assert.equal(lightEdges.color, "#132232");
  assert.equal(lightEdges.opacity, 0.2);
  assert.equal(lightEdges.thickness, 0.85);
  assert.equal(darkEdges.color, "#132232");
  assert.equal(darkEdges.opacity, 0.2);
  assert.equal(darkEdges.thickness, 0.85);
  assert.equal(darkSurfaceEdges.color, "#d8e7f2");
  assert.equal(darkSurfaceEdges.opacity, 0.2);
  assert.equal(technicalEdges.contrastMode, "manual");
  assert.equal(technicalEdges.color, "#111827");
  assert.equal(technicalEdges.opacity, 0.96);
  assert.equal(technicalEdges.thickness, 1);
});

test("display mode belongs to theme settings", () => {
  const technical = cloneThemePresetSettings("technical");
  assert.equal(resolveThemeSettingsDisplayMode(technical), THEME_DISPLAY_MODES.SOLID);
  assert.equal(
    resolveThemeSettingsDisplayMode({
      ...technical,
      display: { mode: THEME_DISPLAY_MODES.WIREFRAME }
    }),
    THEME_DISPLAY_MODES.WIREFRAME
  );
  assert.equal(
    resolveThemeSettingsDisplayMode({
      ...technical,
      displayMode: THEME_DISPLAY_MODES.WIREFRAME
    }),
    THEME_DISPLAY_MODES.SOLID
  );
});

test("system theme preset resolves from the OS color scheme", () => {
  assert.equal(resolveSystemThemePresetId({ prefersDark: false }), "light");
  assert.equal(resolveSystemThemePresetId({ prefersDark: true }), "dark");
});

test("scene tone is inferred from the active floor color", () => {
  assert.equal(inferThemeSettingsSceneTone(cloneThemePresetSettings("light")), "light");
  assert.equal(inferThemeSettingsSceneTone(cloneThemePresetSettings("dark")), "dark");
  assert.equal(inferThemeSettingsSceneTone(cloneThemePresetSettings("charcoal")), "dark");
  assert.equal(inferThemeSettingsSceneTone(cloneThemePresetSettings("technical")), "light");
  assert.equal(inferThemeSettingsSceneTone(cloneThemePresetSettings("diagnostic")), "light");
  assert.equal(inferThemeSettingsSceneTone(cloneThemePresetSettings("blue")), "dark");
  assert.equal(inferThemeSettingsSceneTone(cloneThemePresetSettings("clay-sunrise")), "light");
  assert.equal(inferThemeSettingsSceneTone({
    ...cloneThemePresetSettings("dark"),
    background: {
      ...cloneThemePresetSettings("dark").background,
      type: "solid",
      solidColor: "#f8fafc"
    }
  }), "dark");
  assert.equal(inferThemeSettingsSceneTone({
    ...cloneThemePresetSettings("dark"),
    background: {
      ...cloneThemePresetSettings("dark").background,
      type: "solid",
      solidColor: "#030914"
    },
    floor: {
      ...cloneThemePresetSettings("dark").floor,
      color: "#f8fafc"
    }
  }), "light");
});

test("normalizeThemeSettings migrates legacy tint color into default color", () => {
  const normalized = normalizeThemeSettings({
    materials: {
      tintColor: "#abc123"
    }
  });

  assert.equal(normalized.materials.defaultColor, "#abc123");
  assert.equal(Object.hasOwn(normalized.materials, "tintColor"), false);
});

test("normalizeThemeSettings migrates persisted legacy cinematic preset values", () => {
  const legacyCinematic = cloneThemePresetSettings("cinematic");
  delete legacyCinematic.materials.fillColors;
  delete legacyCinematic.materials.overrideSourceColors;
  delete legacyCinematic.materials.tintMode;
  delete legacyCinematic.materials.emissiveIntensity;
  legacyCinematic.materials.defaultColor = "#aeb9c3";
  legacyCinematic.materials.tintStrength = 0.28;
  legacyCinematic.materials.saturation = 0.42;
  legacyCinematic.materials.contrast = 1.02;
  legacyCinematic.materials.brightness = 0.94;
  legacyCinematic.materials.roughness = 0.46;
  legacyCinematic.materials.metalness = 0.02;
  legacyCinematic.materials.clearcoat = 0.18;
  legacyCinematic.materials.clearcoatRoughness = 0.34;
  legacyCinematic.materials.envMapIntensity = 0.58;
  legacyCinematic.edges.enabled = false;
  legacyCinematic.edges.color = "#8fa1b5";
  legacyCinematic.edges.opacity = 0.1;
  legacyCinematic.edges.thickness = 1;
  legacyCinematic.background.solidColor = "#050711";
  legacyCinematic.background.linearStart = "#02040b";
  legacyCinematic.background.linearEnd = "#252f47";
  legacyCinematic.background.linearAngle = 90;
  legacyCinematic.background.radialInner = "#171d30";
  legacyCinematic.background.radialOuter = "#02040b";
  legacyCinematic.floor.color = "#141a29";
  legacyCinematic.floor.roughness = 0.62;
  legacyCinematic.floor.reflectivity = 0.22;
  legacyCinematic.floor.shadowOpacity = 0.24;
  legacyCinematic.floor.horizonBlend = 0.28;
  legacyCinematic.environment.enabled = true;
  legacyCinematic.environment.intensity = 0.46;
  legacyCinematic.environment.rotationY = -0.35;
  legacyCinematic.lighting.toneMappingExposure = 1.2;
  legacyCinematic.lighting.directional.color = "#f1f6fb";
  legacyCinematic.lighting.directional.intensity = 2.45;
  legacyCinematic.lighting.directional.position = { x: -190, y: 300, z: 210 };
  legacyCinematic.lighting.spot.color = "#dbeafe";
  legacyCinematic.lighting.spot.intensity = 1.34;
  legacyCinematic.lighting.spot.angle = 0.72;
  legacyCinematic.lighting.spot.position = { x: 160, y: 245, z: 126 };
  legacyCinematic.lighting.point.color = "#8fb6d8";
  legacyCinematic.lighting.point.intensity = 0.34;
  legacyCinematic.lighting.point.position = { x: -260, y: 95, z: -220 };
  legacyCinematic.lighting.ambient.color = "#1e293b";
  legacyCinematic.lighting.ambient.intensity = 0.2;
  legacyCinematic.lighting.hemisphere.skyColor = "#dbe7f3";
  legacyCinematic.lighting.hemisphere.groundColor = "#070a14";
  legacyCinematic.lighting.hemisphere.intensity = 0.68;

  assert.deepEqual(normalizeThemeSettings(legacyCinematic), cloneThemePresetSettings("light"));
});

test("normalizeThemeSettings migrates previous cinematic preset values", () => {
  const transitionalCinematic = cloneThemePresetSettings("cinematic");
  delete transitionalCinematic.materials.fillColors;
  delete transitionalCinematic.materials.overrideSourceColors;
  transitionalCinematic.materials.defaultColor = "#aeb9c3";
  transitionalCinematic.materials.tintStrength = 0.08;
  transitionalCinematic.materials.saturation = 1;
  transitionalCinematic.materials.contrast = 1.04;
  transitionalCinematic.materials.brightness = 1.02;
  transitionalCinematic.materials.roughness = 0.46;
  transitionalCinematic.materials.metalness = 0.02;
  transitionalCinematic.materials.clearcoat = 0.18;
  transitionalCinematic.materials.clearcoatRoughness = 0.34;
  transitionalCinematic.materials.envMapIntensity = 0.58;
  transitionalCinematic.materials.emissiveIntensity = 0.06;
  transitionalCinematic.edges.enabled = true;
  transitionalCinematic.edges.color = "#8fa1b5";
  transitionalCinematic.edges.opacity = 1;
  transitionalCinematic.edges.thickness = 1.65;
  transitionalCinematic.background.solidColor = "#050711";
  transitionalCinematic.background.linearStart = "#02040b";
  transitionalCinematic.background.linearEnd = "#252f47";
  transitionalCinematic.background.linearAngle = 90;
  transitionalCinematic.background.radialInner = "#171d30";
  transitionalCinematic.background.radialOuter = "#02040b";
  transitionalCinematic.floor.color = "#141a29";
  transitionalCinematic.floor.roughness = 0.62;
  transitionalCinematic.floor.reflectivity = 0.06;
  transitionalCinematic.floor.shadowOpacity = 0.24;
  transitionalCinematic.floor.horizonBlend = 0.12;
  transitionalCinematic.lighting.toneMappingExposure = 1.2;
  transitionalCinematic.lighting.directional.color = "#f1f6fb";
  transitionalCinematic.lighting.directional.intensity = 2.45;
  transitionalCinematic.lighting.directional.position = { x: -190, y: 300, z: 210 };
  transitionalCinematic.lighting.spot.color = "#dbeafe";
  transitionalCinematic.lighting.spot.intensity = 1.34;
  transitionalCinematic.lighting.spot.angle = 0.72;
  transitionalCinematic.lighting.spot.position = { x: 160, y: 245, z: 126 };
  transitionalCinematic.lighting.point.color = "#8fb6d8";
  transitionalCinematic.lighting.point.intensity = 0.34;
  transitionalCinematic.lighting.point.position = { x: -260, y: 95, z: -220 };
  transitionalCinematic.lighting.ambient.color = "#1e293b";
  transitionalCinematic.lighting.ambient.intensity = 0.2;
  transitionalCinematic.lighting.hemisphere.skyColor = "#dbe7f3";
  transitionalCinematic.lighting.hemisphere.groundColor = "#070a14";
  transitionalCinematic.lighting.hemisphere.intensity = 0.68;

  assert.deepEqual(normalizeThemeSettings(transitionalCinematic), cloneThemePresetSettings("light"));
});

test("normalizeThemeSettings migrates dim cinematic preset values", () => {
  const dimCinematic = cloneThemePresetSettings("cinematic");
  delete dimCinematic.materials.fillColors;
  delete dimCinematic.materials.overrideSourceColors;
  dimCinematic.materials.defaultColor = "#aeb9c3";
  dimCinematic.materials.tintMode = "blend";
  dimCinematic.materials.tintStrength = 0;
  dimCinematic.materials.saturation = 1.34;
  dimCinematic.materials.contrast = 1.02;
  dimCinematic.materials.brightness = 0.82;
  dimCinematic.materials.roughness = 0.76;
  dimCinematic.materials.metalness = 0;
  dimCinematic.materials.clearcoat = 0;
  dimCinematic.materials.clearcoatRoughness = 0.72;
  dimCinematic.materials.envMapIntensity = 0.08;
  dimCinematic.materials.emissiveIntensity = 0.01;
  dimCinematic.edges.enabled = false;
  dimCinematic.edges.color = "#8fa1b5";
  dimCinematic.edges.opacity = 0.1;
  dimCinematic.edges.thickness = 1;
  dimCinematic.background.solidColor = "#0a0f18";
  dimCinematic.background.linearStart = "#08111c";
  dimCinematic.background.linearEnd = "#1f2c3d";
  dimCinematic.background.linearAngle = 90;
  dimCinematic.background.radialInner = "#182337";
  dimCinematic.background.radialOuter = "#08111c";
  dimCinematic.floor.color = "#121a24";
  dimCinematic.floor.roughness = 0.86;
  dimCinematic.floor.reflectivity = 0.06;
  dimCinematic.floor.shadowOpacity = 0.24;
  dimCinematic.floor.horizonBlend = 0.28;
  dimCinematic.environment.enabled = false;
  dimCinematic.environment.intensity = 0;
  dimCinematic.environment.rotationY = -0.35;
  dimCinematic.lighting.toneMappingExposure = 1.03;
  dimCinematic.lighting.directional.color = "#f1f6fb";
  dimCinematic.lighting.directional.intensity = 1.28;
  dimCinematic.lighting.directional.position = { x: -190, y: 300, z: 210 };
  dimCinematic.lighting.spot.color = "#dbeafe";
  dimCinematic.lighting.spot.intensity = 0.18;
  dimCinematic.lighting.spot.angle = 0.72;
  dimCinematic.lighting.spot.position = { x: 160, y: 245, z: 126 };
  dimCinematic.lighting.point.color = "#8fb6d8";
  dimCinematic.lighting.point.intensity = 0.08;
  dimCinematic.lighting.point.position = { x: -260, y: 95, z: -220 };
  dimCinematic.lighting.ambient.color = "#1e293b";
  dimCinematic.lighting.ambient.intensity = 0.42;
  dimCinematic.lighting.hemisphere.skyColor = "#dbe7f3";
  dimCinematic.lighting.hemisphere.groundColor = "#070a14";
  dimCinematic.lighting.hemisphere.intensity = 0.92;

  assert.deepEqual(normalizeThemeSettings(dimCinematic), cloneThemePresetSettings("light"));
});

test("normalizeThemeSettings preserves non-cinematic legacy material defaults", () => {
  const legacyTechnical = cloneThemePresetSettings("technical");
  delete legacyTechnical.materials.tintMode;
  delete legacyTechnical.materials.emissiveIntensity;
  const normalized = normalizeThemeSettings(legacyTechnical);

  assert.equal(normalized.materials.tintMode, "multiply");
  assert.equal(normalized.materials.emissiveIntensity, 0);
  assert.notDeepEqual(normalized, cloneThemePresetSettings("light"));
});

test("render-style presets keep edges by default except studio showroom", () => {
  assert.equal(THEME_PRESETS.find((preset) => preset.id === "clay-sunrise")?.label, "Clay");

  for (const preset of THEME_PRESETS) {
    assert.equal(
      preset.settings.edges.enabled,
      preset.id !== "studio-showroom",
      `${preset.id} edge default`
    );
  }
});

test("built-in theme presets do not override source colors by default", () => {
  for (const preset of THEME_PRESETS) {
    assert.equal(
      preset.settings.materials.overrideSourceColors,
      false,
      `${preset.id} source color override default`
    );
  }
});
