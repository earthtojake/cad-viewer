import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSidebarDirectoryTree,
  findSidebarDirectoryById,
  selectedEntryKeyFromUrl,
  listSidebarItems,
  filenameLabelForEntry,
  normalizeCadFileQueryParam,
  normalizeCadRefQueryParams,
  sidebarDirectoryPath,
  sidebarDirectoryIdForEntry,
  sidebarLabelForEntry
} from "./sidebar.js";
import {
  buildAvailableThemePresets,
  getAvailableThemePresetIdForSettings,
  readCadWorkspaceGlassTone,
  readCustomThemePresets,
  readThemeSettings,
  readThemeSettingsState,
  saveCustomThemePreset,
  serializeThemeSettingsForStorage,
  THEME_STORAGE_KEY,
  writeThemeSettings
} from "./persistence.js";
import {
  cloneThemePresetSettings,
  normalizeThemeSettings
} from "../themeSettings.js";
import {
  CAD_WORKSPACE_MIN_MODEL_VIEWPORT_WIDTH,
  canFitDesktopPanels,
  maxPanelWidthForViewport,
  preferredPanelWidthAfterViewportSync,
  resolveDesktopPanelWidths
} from "../../components/workbench/hooks/useCadWorkspaceLayout.js";
import {
  shouldActivateUrlSelection
} from "../../components/workbench/hooks/useCadWorkspaceSession.js";
import {
  CAD_WORKSPACE_LAYOUT_MODE,
  CAD_WORKSPACE_DESKTOP_BREAKPOINT_PX,
  CAD_WORKSPACE_FILE_EXPLORER_DEFAULT_OPEN_BREAKPOINT_PX,
  CAD_WORKSPACE_FILE_SETTINGS_DEFAULT_OPEN_BREAKPOINT_PX,
  CAD_WORKSPACE_MOBILE_BREAKPOINT_PX,
  getCadWorkspaceLayoutMode,
  isCadWorkspaceDesktopViewport,
  isCadWorkspaceMobileViewport,
  shouldCadWorkspaceDefaultFileExplorerOpen,
  shouldCadWorkspaceDefaultFileSettingsOpen
} from "./breakpoints.js";
function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, String(value));
    },
    removeItem: (key) => {
      values.delete(key);
    }
  };
}

test("workspace breakpoints split mobile and desktop layouts", () => {
  assert.equal(CAD_WORKSPACE_DESKTOP_BREAKPOINT_PX, CAD_WORKSPACE_MOBILE_BREAKPOINT_PX);
  assert.equal(getCadWorkspaceLayoutMode(CAD_WORKSPACE_MOBILE_BREAKPOINT_PX - 1), CAD_WORKSPACE_LAYOUT_MODE.MOBILE);
  assert.equal(isCadWorkspaceMobileViewport(CAD_WORKSPACE_MOBILE_BREAKPOINT_PX - 1), true);
  assert.equal(isCadWorkspaceDesktopViewport(CAD_WORKSPACE_MOBILE_BREAKPOINT_PX - 1), false);

  assert.equal(getCadWorkspaceLayoutMode(CAD_WORKSPACE_MOBILE_BREAKPOINT_PX), CAD_WORKSPACE_LAYOUT_MODE.DESKTOP);
  assert.equal(isCadWorkspaceMobileViewport(CAD_WORKSPACE_MOBILE_BREAKPOINT_PX), false);
  assert.equal(isCadWorkspaceDesktopViewport(CAD_WORKSPACE_MOBILE_BREAKPOINT_PX), true);

  assert.equal(getCadWorkspaceLayoutMode(CAD_WORKSPACE_FILE_EXPLORER_DEFAULT_OPEN_BREAKPOINT_PX), CAD_WORKSPACE_LAYOUT_MODE.DESKTOP);
});

test("workspace panel default-open breakpoints keep settings open longer than file explorer", () => {
  assert.ok(
    CAD_WORKSPACE_FILE_SETTINGS_DEFAULT_OPEN_BREAKPOINT_PX <
    CAD_WORKSPACE_FILE_EXPLORER_DEFAULT_OPEN_BREAKPOINT_PX
  );
  assert.equal(
    shouldCadWorkspaceDefaultFileSettingsOpen(CAD_WORKSPACE_FILE_SETTINGS_DEFAULT_OPEN_BREAKPOINT_PX - 1),
    false
  );
  assert.equal(
    shouldCadWorkspaceDefaultFileSettingsOpen(CAD_WORKSPACE_FILE_SETTINGS_DEFAULT_OPEN_BREAKPOINT_PX),
    true
  );
  assert.equal(
    shouldCadWorkspaceDefaultFileExplorerOpen(CAD_WORKSPACE_FILE_EXPLORER_DEFAULT_OPEN_BREAKPOINT_PX - 1),
    false
  );
  assert.equal(
    shouldCadWorkspaceDefaultFileExplorerOpen(CAD_WORKSPACE_FILE_EXPLORER_DEFAULT_OPEN_BREAKPOINT_PX),
    true
  );
  assert.equal(
    shouldCadWorkspaceDefaultFileExplorerOpen(320, { hasSelectedFile: false }),
    true
  );
  assert.equal(
    shouldCadWorkspaceDefaultFileExplorerOpen(
      CAD_WORKSPACE_FILE_EXPLORER_DEFAULT_OPEN_BREAKPOINT_PX - 1,
      { hasSelectedFile: true }
    ),
    false
  );
});

test("filenameLabelForEntry shows canonical step, stl, 3mf, glb, dxf, urdf, srdf, and sdf suffixes", () => {
  assert.equal(
    filenameLabelForEntry({
      file: "sample_mount.step",
      kind: "part",
      source: { format: "step", path: "parts/sample_mount.step" }
    }),
    "sample_mount.step"
  );

  assert.equal(
    filenameLabelForEntry({
      file: "sample_assembly.step",
      kind: "assembly",
      source: { format: "step", path: "assemblies/sample_assembly.step" }
    }),
    "sample_assembly.step"
  );

  assert.equal(
    filenameLabelForEntry({
      file: "imports/vendor/widget.stp",
      kind: "part",
      source: { format: "stp", path: "imports/vendor/widget.stp" },
      step: { path: "imports/vendor/widget.stp" }
    }),
    "widget.stp"
  );

  assert.equal(
    filenameLabelForEntry({
      file: "sample_robot.urdf",
      kind: "urdf",
      source: { format: "urdf", path: "sample_robot.urdf" },
      name: "sample_robot (URDF)"
    }),
    "sample_robot.urdf"
  );

  assert.equal(
    filenameLabelForEntry({
      file: "sample_robot.srdf",
      kind: "srdf",
      source: { format: "srdf", path: "sample_robot.srdf" },
      name: "sample_robot (SRDF)"
    }),
    "sample_robot.srdf"
  );

  assert.equal(
    filenameLabelForEntry({
      file: "sample_robot.sdf",
      kind: "sdf",
      source: { format: "sdf", path: "sample_robot.sdf" },
      name: "sample_robot (SDF)"
    }),
    "sample_robot.sdf"
  );

  assert.equal(
    filenameLabelForEntry({
      file: "sample_plate.dxf",
      kind: "dxf",
      source: { format: "dxf", path: "drawings/sample_plate.dxf" }
    }),
    "sample_plate.dxf"
  );

  assert.equal(
    filenameLabelForEntry({
      file: "fixtures/bracket.stl",
      kind: "stl",
      source: { format: "stl", path: "fixtures/bracket.stl" }
    }),
    "bracket.stl"
  );

  assert.equal(
    filenameLabelForEntry({
      file: "fixtures/bracket.3mf",
      kind: "3mf",
      source: { format: "3mf", path: "fixtures/bracket.3mf" }
    }),
    "bracket.3mf"
  );

  assert.equal(
    filenameLabelForEntry({
      file: "fixtures/bracket.glb",
      kind: "glb",
      source: { format: "glb", path: "fixtures/bracket.glb" }
    }),
    "bracket.glb"
  );
});

test("sidebarLabelForEntry uses the same suffix-aware filename labels", () => {
  const entry = {
    file: "sample_assembly.step",
    kind: "assembly",
    source: { format: "step", path: "assemblies/sample_assembly.step" }
  };

  assert.equal(sidebarLabelForEntry(entry), "sample_assembly.step");
});

test("sidebarDirectoryIdForEntry keeps exact CAD file folders", () => {
  assert.equal(
    sidebarDirectoryIdForEntry({
      file: "parts/sample_plate.step",
      kind: "part",
      source: { format: "step", path: "parts/sample_plate.step" }
    }),
    "parts"
  );

  assert.equal(
    sidebarDirectoryIdForEntry({
      file: "drawings/sample_plate.dxf",
      kind: "dxf",
      source: { format: "dxf", path: "drawings/sample_plate.dxf" }
    }),
    "drawings"
  );

  assert.equal(
    sidebarDirectoryIdForEntry({
      file: "sample_robot.urdf",
      kind: "urdf",
      source: { format: "urdf", path: "sample_robot.urdf" }
    }),
    ""
  );

  assert.equal(
    sidebarDirectoryIdForEntry({
      file: "sample_robot.sdf",
      kind: "sdf",
      source: { format: "sdf", path: "sample_robot.sdf" }
    }),
    ""
  );

  assert.equal(
    sidebarDirectoryIdForEntry({
      file: "meshes/fixture.stl",
      kind: "stl",
      source: { format: "stl", path: "meshes/fixture.stl" }
    }),
    "meshes"
  );

  assert.equal(
    sidebarDirectoryIdForEntry({
      file: "meshes/fixture.3mf",
      kind: "3mf",
      source: { format: "3mf", path: "meshes/fixture.3mf" }
    }),
    "meshes"
  );

  assert.equal(
    sidebarDirectoryIdForEntry({
      file: "parts/mount.step",
      kind: "part",
      source: { format: "step", path: "parts/mount.step" }
    }),
    "parts"
  );
});

test("buildSidebarDirectoryTree lists CAD files in their exact source directory", () => {
  const tree = buildSidebarDirectoryTree([
    {
      file: "parts/sample_plate.step",
      kind: "part",
      source: { format: "step", path: "parts/sample_plate.step" }
    },
    {
      file: "drawings/sample_plate.dxf",
      kind: "dxf",
      source: { format: "dxf", path: "drawings/sample_plate.dxf" }
    }
  ]);

  const partsDirectory = tree.directories.find((directory) => directory.id === "parts");
  assert.ok(partsDirectory);
  const drawingsDirectory = tree.directories.find((directory) => directory.id === "drawings");
  assert.ok(drawingsDirectory);
  assert.deepEqual(
    [
      ...listSidebarItems(drawingsDirectory).map((item) => `${item.type}:${item.label}`),
      ...listSidebarItems(partsDirectory).map((item) => `${item.type}:${item.label}`),
    ],
    ["entry:sample_plate.dxf", "entry:sample_plate.step"]
  );
});

test("sidebar directory helpers find nested folders and ancestor paths", () => {
  const tree = buildSidebarDirectoryTree([
    {
      file: "assemblies/robot/arm/base.step",
      kind: "part",
      source: { format: "step", path: "assemblies/robot/arm/base.step" }
    },
    {
      file: "assemblies/robot/wrist.step",
      kind: "part",
      source: { format: "step", path: "assemblies/robot/wrist.step" }
    }
  ], { rootName: "models" });

  const armDirectory = findSidebarDirectoryById(tree, "assemblies/robot/arm");
  assert.equal(armDirectory?.name, "arm");
  assert.equal(findSidebarDirectoryById(tree, "missing"), null);
  assert.deepEqual(
    sidebarDirectoryPath(tree, "assemblies/robot/arm").map((directory) => directory.id),
    ["", "assemblies", "assemblies/robot", "assemblies/robot/arm"]
  );
  assert.deepEqual(sidebarDirectoryPath(tree, "missing"), []);
});

test("workspace URL selection does not override a valid sidebar selection", () => {
  assert.equal(
    shouldActivateUrlSelection({
      selectedKey: "robots/sample.srdf",
      selectedKeyExists: true,
      urlSelectionRequested: true,
      nextSelectedKey: "robots/sample.urdf"
    }),
    false
  );

  assert.equal(
    shouldActivateUrlSelection({
      selectedKey: "robots/sample.srdf",
      selectedKeyExists: false,
      urlSelectionRequested: true,
      nextSelectedKey: "robots/sample.urdf"
    }),
    true
  );
});

test("workspace resize sync preserves wider preferred sidebar widths", () => {
  assert.equal(preferredPanelWidthAfterViewportSync(420, 150), 420);
  assert.equal(preferredPanelWidthAfterViewportSync(120, 150), 150);
});

test("workspace panel default width budgets reserve at least 700px for the model viewport", () => {
  assert.equal(CAD_WORKSPACE_MIN_MODEL_VIEWPORT_WIDTH, 700);
  assert.equal(maxPanelWidthForViewport(1024, 520, { openPanelCount: 2 }), 162);
  assert.equal(maxPanelWidthForViewport(900, 560, { openPanelCount: 2 }), 100);
  assert.equal(maxPanelWidthForViewport(900, 560, { openPanelCount: 1 }), 200);
  assert.equal(canFitDesktopPanels(850, [150]), true);
  assert.equal(canFitDesktopPanels(849, [150]), false);
  assert.equal(canFitDesktopPanels(1090, [150, 240]), true);
  assert.equal(canFitDesktopPanels(1089, [150, 240]), false);
});

test("workspace manual panel widths can open below the model viewport reserve", () => {
  assert.deepEqual(
    resolveDesktopPanelWidths({
      viewportWidth: 900,
      sidebarOpen: true,
      sheetOpen: false,
      sidebarWidth: 260,
      sheetWidth: 0,
      sidebarMinWidth: 150,
      sheetMinWidth: 240,
      sidebarMaxWidth: 520,
      sheetMaxWidth: 560
    }),
    {
      sidebarWidth: 260,
      sheetWidth: 0
    }
  );
  assert.deepEqual(
    resolveDesktopPanelWidths({
      viewportWidth: 900,
      sidebarOpen: true,
      sheetOpen: true,
      sidebarWidth: 260,
      sheetWidth: 260,
      sidebarMinWidth: 150,
      sheetMinWidth: 240,
      sidebarMaxWidth: 520,
      sheetMaxWidth: 560
    }),
    {
      sidebarWidth: 260,
      sheetWidth: 260
    }
  );
});

test("workspace glass tone defaults to inferred light tone", () => {
  assert.equal(readCadWorkspaceGlassTone(), "light");
});

test("theme persistence stores only non-default theme ids", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage()
  };

  try {
    assert.equal(writeThemeSettings(cloneThemePresetSettings("blue")), true);
    assert.deepEqual(
      JSON.parse(globalThis.window.localStorage.getItem(THEME_STORAGE_KEY)),
      {
        version: 2,
        activeThemeId: "blue"
      }
    );
    assert.deepEqual(readThemeSettings(), cloneThemePresetSettings("blue"));

    assert.equal(writeThemeSettings(cloneThemePresetSettings("light"), { presetId: "light" }), true);

    assert.deepEqual(
      globalThis.window.localStorage.getItem(THEME_STORAGE_KEY),
      null
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("theme default follows system dark mode", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage(),
    matchMedia: () => ({ matches: true })
  };

  try {
    assert.deepEqual(readThemeSettingsState(), {
      presetId: "dark",
      settings: cloneThemePresetSettings("dark")
    });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("theme persistence does not store customized overrides", () => {
  const blueThemeSettings = cloneThemePresetSettings("blue");
  const customThemeSettings = normalizeThemeSettings({
    ...blueThemeSettings,
    materials: {
      ...blueThemeSettings.materials,
      brightness: 1.17
    }
  });

  assert.deepEqual(serializeThemeSettingsForStorage(customThemeSettings, { presetId: "blue" }), {
    version: 2,
    activeThemeId: "blue"
  });
});

test("theme persistence ignores stored custom settings and uses the selected theme id", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage()
  };

  try {
    globalThis.window.localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        themeId: "blue",
        customSettings: {
          materials: {
            brightness: 1.17
          }
        }
      })
    );

    assert.deepEqual(readThemeSettingsState(), {
      presetId: "blue",
      settings: cloneThemePresetSettings("blue")
    });
    assert.deepEqual(
      JSON.parse(globalThis.window.localStorage.getItem(THEME_STORAGE_KEY)),
      {
        version: 2,
        activeThemeId: "blue"
      }
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("custom themes save to local storage and can be selected by id", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage()
  };

  try {
    const customThemeSettings = normalizeThemeSettings({
      ...cloneThemePresetSettings("blue"),
      background: {
        ...cloneThemePresetSettings("blue").background,
        solidColor: "#101418"
      }
    });
    const savedPreset = saveCustomThemePreset("Shop dark", customThemeSettings);

    assert.equal(savedPreset.label, "Shop dark");
    assert.equal(savedPreset.id, "custom:shop-dark");
    assert.equal(readCustomThemePresets().length, 1);
    const availableThemePresets = buildAvailableThemePresets(readCustomThemePresets());
    assert.equal(availableThemePresets.some((preset) => preset.id === savedPreset.id), true);
    assert.equal(availableThemePresets.at(-1)?.id, savedPreset.id);
    assert.equal(getAvailableThemePresetIdForSettings(customThemeSettings, readCustomThemePresets()), savedPreset.id);

    assert.equal(writeThemeSettings(savedPreset.settings, {
      presetId: savedPreset.id,
      customPresets: readCustomThemePresets()
    }), true);
    const storedTheme = JSON.parse(globalThis.window.localStorage.getItem(THEME_STORAGE_KEY));
    assert.equal(storedTheme.version, 2);
    assert.equal(storedTheme.activeThemeId, savedPreset.id);
    assert.equal(storedTheme.customThemes.length, 1);
    assert.equal(storedTheme.customThemes[0].id, savedPreset.id);
    assert.deepEqual(storedTheme.customThemes[0].theme, savedPreset.settings);
    assert.deepEqual(readThemeSettingsState(readCustomThemePresets()), {
      presetId: savedPreset.id,
      settings: savedPreset.settings
    });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("theme persistence ignores legacy full preset payloads", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage()
  };

  try {
    const legacyCinematic = cloneThemePresetSettings("light");
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

    globalThis.window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(legacyCinematic));

    assert.deepEqual(readThemeSettings(), cloneThemePresetSettings("light"));
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("normalizeCadRefQueryParams accepts relative refs", () => {
  assert.deepEqual(
    normalizeCadRefQueryParams(["parts/sample_plate#f2", "@cad[parts/sample_base#e1]"]),
    ["@cad[parts/sample_plate#f2]", "@cad[parts/sample_base#e1]"]
  );
});

test("selectedEntryKeyFromUrl restores the selected file query param", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "?file=parts%2Fsample_plate.step"
    }
  };

  try {
    assert.equal(
      selectedEntryKeyFromUrl([
        {
          file: "parts/sample_base.step",
          cadPath: "parts/sample_base",
          kind: "part"
        },
        {
          file: "parts/sample_plate.step",
          cadPath: "parts/sample_plate",
          kind: "part"
        }
      ]),
      "parts/sample_plate.step"
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("selectedEntryKeyFromUrl uses EXPLORER_DEFAULT_FILE when no file query param exists", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: ""
    }
  };

  try {
    assert.equal(
      selectedEntryKeyFromUrl([
        {
          file: "parts/sample_base.step",
          cadPath: "parts/sample_base",
          kind: "part"
        },
        {
          file: "parts/sample_plate.step",
          cadPath: "parts/sample_plate",
          kind: "part"
        }
      ], { defaultFile: "parts/sample_plate.step" }),
      "parts/sample_plate.step"
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("selectedEntryKeyFromUrl does not fall back to EXPLORER_DEFAULT_FILE for missing explicit file params", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "?file=parts%2Fmissing.step"
    }
  };

  try {
    assert.equal(
      selectedEntryKeyFromUrl([
        {
          file: "parts/sample_base.step",
          cadPath: "parts/sample_base",
          kind: "part"
        },
        {
          file: "parts/sample_plate.step",
          cadPath: "parts/sample_plate",
          kind: "part"
        }
      ], { defaultFile: "parts/sample_plate.step" }),
      ""
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("selectedEntryKeyFromUrl does not use refs to mask a missing explicit file param", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "?file=parts%2Fmissing.step&refs=parts%2Fsample_plate%23f2"
    }
  };

  try {
    assert.equal(
      selectedEntryKeyFromUrl([
        {
          file: "parts/sample_plate.step",
          cadPath: "parts/sample_plate",
          kind: "part"
        }
      ], { defaultFile: "parts/sample_plate.step" }),
      ""
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("selectedEntryKeyFromUrl prefers explicit refs over EXPLORER_DEFAULT_FILE when no file param exists", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "?refs=parts%2Fsample_plate%23f2"
    }
  };

  try {
    assert.equal(
      selectedEntryKeyFromUrl([
        {
          file: "parts/sample_base.step",
          cadPath: "parts/sample_base",
          kind: "part"
        },
        {
          file: "parts/sample_plate.step",
          cadPath: "parts/sample_plate",
          kind: "part"
        }
      ], { defaultFile: "parts/sample_base.step" }),
      "parts/sample_plate.step"
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("selectedEntryKeyFromUrl restores workspace-relative file params", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "?file=workspace%2Fparts%2Fsample_plate.step"
    }
  };

  try {
    assert.equal(
      selectedEntryKeyFromUrl([
        {
          file: "workspace/parts/sample_base.step",
          cadPath: "workspace/parts/sample_base",
          kind: "part"
        },
        {
          file: "workspace/parts/sample_plate.step",
          cadPath: "workspace/parts/sample_plate",
          kind: "part"
        }
      ]),
      "workspace/parts/sample_plate.step"
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("normalizeCadFileQueryParam keeps scan-relative file params unchanged", () => {
  assert.equal(normalizeCadFileQueryParam("parts/sample_plate.step"), "parts/sample_plate.step");
  assert.equal(normalizeCadFileQueryParam("workspace/parts/sample_plate.step"), "workspace/parts/sample_plate.step");
  assert.equal(normalizeCadFileQueryParam("/workspace/imports/widget.step/"), "workspace/imports/widget.step");
});

test("selectedEntryKeyFromUrl restores the selected canonical ref query param", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "?refs=parts%2Fsample_plate%23f2"
    }
  };

  try {
    assert.equal(
      selectedEntryKeyFromUrl([
        {
          file: "parts/sample_base.step",
          cadPath: "parts/sample_base",
          kind: "part"
        },
        {
          file: "parts/sample_plate.step",
          cadPath: "parts/sample_plate",
          kind: "part"
        }
      ]),
      "parts/sample_plate.step"
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
