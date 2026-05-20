import { clonePerspectiveSnapshot, perspectiveSnapshotEqual } from "../perspective.js";
import {
  cloneThemePresetSettings,
  DEFAULT_THEME_PRESET,
  DEFAULT_THEME_PRESET_ID,
  getThemePresetIdForSettings,
  inferThemeSettingsSceneTone,
  THEME_PRESETS,
  normalizeThemePresetId,
  normalizeThemeSettings,
  resolveSystemThemePresetId
} from "../themeSettings.js";
import { THEME_STORAGE_KEY } from "../colorScheme.js";
import {
  DEFAULT_STEP_CLIP_SETTINGS,
  normalizeStepClipSettings,
  stepClipSettingsEqual
} from "../explorer/clipPlane.js";
import { DRAWING_TOOL, RENDER_FORMAT, TAB_TOOL_MODE } from "./constants.js";

export { THEME_STORAGE_KEY };
const THEME_STORAGE_VERSION = 2;
const CUSTOM_THEME_PRESET_ID_PREFIX = "custom:";

export const CAD_WORKSPACE_DEFAULT_SIDEBAR_WIDTH = 260;
export const CAD_WORKSPACE_DEFAULT_TAB_TOOLS_WIDTH = 260;
export const CAD_WORKSPACE_DEFAULT_GLASS_TONE = inferThemeSettingsSceneTone(DEFAULT_THEME_PRESET.settings);
const STALE_CINEMATIC_DEFAULT_COLORS = new Set([
  "#aeb9c3",
  "#bcc8d4",
  "#748899",
  "#556c7f"
]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function normalizeUniqueStringList(value) {
  return [...new Set(normalizeStringList(value))];
}

function normalizeNumber(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function cloneStringList(value) {
  return Array.isArray(value) ? [...value] : [];
}

function cloneStepClipSettings(value) {
  return { ...normalizeStepClipSettings(value) };
}

function isLegacyZeroStepClipDefault(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const axis = String(value.axis || "x").toLowerCase();
  if (axis !== "x" || value.enabled !== true || value.invert === true) {
    return false;
  }
  const offsets = value.offsets && typeof value.offsets === "object" ? value.offsets : null;
  if (!offsets) {
    return Number(value.offset) === 0;
  }
  return (
    (!hasOwn(value, "offset") || Number(value.offset) === 0) &&
    Number(offsets.x) === 0 &&
    Number(offsets.y) === 0 &&
    Number(offsets.z) === 0
  );
}

function normalizeTabStepClipSettings(value) {
  return normalizeStepClipSettings(
    isLegacyZeroStepClipDefault(value) ? DEFAULT_STEP_CLIP_SETTINGS : value
  );
}

function stringListEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

function cloneDrawingPoint(point) {
  return {
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0
  };
}

function clonePoint3(point) {
  return Array.isArray(point) ? [
    Number(point[0]) || 0,
    Number(point[1]) || 0,
    Number(point[2]) || 0
  ] : null;
}

function clonePoint2(point) {
  return Array.isArray(point) ? [
    Number(point[0]) || 0,
    Number(point[1]) || 0
  ] : null;
}

function normalizeDrawingTool(value) {
  const normalized = normalizeString(value || DRAWING_TOOL.FREEHAND);
  switch (normalized) {
    case DRAWING_TOOL.LINE:
    case DRAWING_TOOL.ARROW:
    case DRAWING_TOOL.DOUBLE_ARROW:
    case DRAWING_TOOL.RECTANGLE:
    case DRAWING_TOOL.CIRCLE:
    case DRAWING_TOOL.FILL:
    case DRAWING_TOOL.ERASE:
    case DRAWING_TOOL.FREEHAND:
      return normalized;
    default:
      return DRAWING_TOOL.FREEHAND;
  }
}

function normalizeTabToolMode(value) {
  const normalized = normalizeString(value || TAB_TOOL_MODE.REFERENCES);
  return normalized === TAB_TOOL_MODE.DRAW ? TAB_TOOL_MODE.DRAW : TAB_TOOL_MODE.REFERENCES;
}

function pointsEqualN(a, b, length) {
  if (a === b) {
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < length || b.length < length) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

function cloneSurfaceLineData(surfaceLine) {
  if (!surfaceLine || typeof surfaceLine !== "object") {
    return null;
  }
  return {
    referenceId: String(surfaceLine.referenceId || ""),
    selector: String(surfaceLine.selector || ""),
    normalizedSelector: String(surfaceLine.normalizedSelector || ""),
    faceToken: String(surfaceLine.faceToken || ""),
    partId: String(surfaceLine.partId || ""),
    surfaceType: String(surfaceLine.surfaceType || ""),
    startPoint: clonePoint3(surfaceLine.startPoint),
    endPoint: clonePoint3(surfaceLine.endPoint),
    startUv: clonePoint2(surfaceLine.startUv),
    endUv: clonePoint2(surfaceLine.endUv)
  };
}

function surfaceLineEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.referenceId === b.referenceId &&
    a.selector === b.selector &&
    a.normalizedSelector === b.normalizedSelector &&
    a.faceToken === b.faceToken &&
    a.partId === b.partId &&
    a.surfaceType === b.surfaceType &&
    pointsEqualN(a.startPoint, b.startPoint, 3) &&
    pointsEqualN(a.endPoint, b.endPoint, 3) &&
    pointsEqualN(a.startUv, b.startUv, 2) &&
    pointsEqualN(a.endUv, b.endUv, 2)
  );
}

function drawingPointsEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]?.x !== b[index]?.x || a[index]?.y !== b[index]?.y) {
      return false;
    }
  }
  return true;
}

function cloneDrawingStroke(stroke) {
  const rawTool = normalizeString(stroke?.tool || DRAWING_TOOL.FREEHAND);
  if (rawTool === DRAWING_TOOL.SURFACE_LINE) {
    return null;
  }
  return {
    id: String(stroke?.id || ""),
    tool: normalizeDrawingTool(rawTool),
    points: Array.isArray(stroke?.points) ? stroke.points.map(cloneDrawingPoint) : [],
    fillPoints: Array.isArray(stroke?.fillPoints) ? stroke.fillPoints.map(cloneDrawingPoint) : [],
    guessed: stroke?.guessed === true,
    surfaceLine: cloneSurfaceLineData(stroke?.surfaceLine)
  };
}

export function cloneDrawingStrokes(strokes) {
  return Array.isArray(strokes) ? strokes.map(cloneDrawingStroke).filter(Boolean) : [];
}

export function drawingStrokesEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (
      a[index]?.id !== b[index]?.id ||
      a[index]?.tool !== b[index]?.tool ||
      a[index]?.guessed !== b[index]?.guessed ||
      !surfaceLineEqual(a[index]?.surfaceLine, b[index]?.surfaceLine) ||
      !drawingPointsEqual(a[index]?.points, b[index]?.points) ||
      !drawingPointsEqual(a[index]?.fillPoints, b[index]?.fillPoints)
    ) {
      return false;
    }
  }
  return true;
}

function cloneDrawingHistoryStack(stack) {
  return Array.isArray(stack) ? stack.map(cloneDrawingStrokes) : [];
}

function drawingHistoryStackEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (!drawingStrokesEqual(a[index], b[index])) {
      return false;
    }
  }
  return true;
}

const TAB_STATE_SCHEMA = [
  {
    key: "renderFormat",
    defaultValue: RENDER_FORMAT.STEP,
    normalize: (value) => {
      const normalized = normalizeString(value || RENDER_FORMAT.STEP).toLowerCase();
      if (normalized === RENDER_FORMAT.DXF) {
        return RENDER_FORMAT.DXF;
      }
      if (normalized === RENDER_FORMAT.STL) {
        return RENDER_FORMAT.STL;
      }
      if (normalized === RENDER_FORMAT.THREE_MF) {
        return RENDER_FORMAT.THREE_MF;
      }
      if (normalized === RENDER_FORMAT.GLB) {
        return RENDER_FORMAT.GLB;
      }
      if (normalized === RENDER_FORMAT.URDF) {
        return RENDER_FORMAT.URDF;
      }
      if (normalized === RENDER_FORMAT.SDF) {
        return RENDER_FORMAT.SDF;
      }
      return RENDER_FORMAT.STEP;
    }
  },
  {
    key: "dxfThicknessMm",
    defaultValue: 0,
    normalize: (value) => {
      const numericValue = normalizeNumber(value, 0);
      return numericValue > 0 ? numericValue : 0;
    }
  },
  {
    key: "referenceQuery",
    defaultValue: "",
    normalize: normalizeString
  },
  {
    key: "selectedReferenceIds",
    defaultValue: [],
    normalize: normalizeStringList,
    clone: cloneStringList,
    equals: stringListEqual
  },
  {
    key: "selectedPartIds",
    defaultValue: [],
    normalize: normalizeStringList,
    clone: cloneStringList,
    equals: stringListEqual
  },
  {
    key: "expandedAssemblyPartIds",
    defaultValue: [],
    normalize: normalizeStringList,
    clone: cloneStringList,
    equals: stringListEqual
  },
  {
    key: "expandedStepTreeNodeIds",
    defaultValue: [],
    normalize: normalizeUniqueStringList,
    clone: cloneStringList,
    equals: stringListEqual
  },
  {
    key: "hiddenPartIds",
    defaultValue: [],
    normalize: normalizeStringList,
    clone: cloneStringList,
    equals: stringListEqual
  },
  {
    key: "stepClipSettings",
    defaultValue: DEFAULT_STEP_CLIP_SETTINGS,
    normalize: normalizeTabStepClipSettings,
    clone: cloneStepClipSettings,
    equals: stepClipSettingsEqual
  },
  {
    key: "perspective",
    defaultValue: null,
    normalize: clonePerspectiveSnapshot,
    clone: clonePerspectiveSnapshot,
    equals: perspectiveSnapshotEqual
  },
  {
    key: "drawingTool",
    defaultValue: DRAWING_TOOL.FREEHAND,
    normalize: normalizeDrawingTool
  },
  {
    key: "tabToolMode",
    defaultValue: TAB_TOOL_MODE.REFERENCES,
    normalize: normalizeTabToolMode
  },
  {
    key: "drawingStrokes",
    defaultValue: [],
    normalize: cloneDrawingStrokes,
    clone: cloneDrawingStrokes,
    equals: drawingStrokesEqual
  },
  {
    key: "drawingUndoStack",
    defaultValue: [],
    normalize: cloneDrawingHistoryStack,
    clone: cloneDrawingHistoryStack,
    equals: drawingHistoryStackEqual
  },
  {
    key: "drawingRedoStack",
    defaultValue: [],
    normalize: cloneDrawingHistoryStack,
    clone: cloneDrawingHistoryStack,
    equals: drawingHistoryStackEqual
  }
];

function normalizeSchemaState(schema, source = {}) {
  const normalized = {};
  for (const field of schema) {
    const value = hasOwn(source || {}, field.key) ? source[field.key] : field.defaultValue;
    normalized[field.key] = field.normalize ? field.normalize(value, field.defaultValue) : value;
  }
  return normalized;
}

function cloneSchemaState(schema, source = {}) {
  const normalized = normalizeSchemaState(schema, source);
  const cloned = {};
  for (const field of schema) {
    const value = normalized[field.key];
    cloned[field.key] = field.clone ? field.clone(value) : value;
  }
  return cloned;
}

function schemaStateEqual(schema, a = {}, b = {}) {
  for (const field of schema) {
    const left = hasOwn(a || {}, field.key) ? a[field.key] : field.defaultValue;
    const right = hasOwn(b || {}, field.key) ? b[field.key] : field.defaultValue;
    const equals = field.equals || Object.is;
    if (!equals(left, right)) {
      return false;
    }
  }
  return true;
}

function normalizeTabKey(value) {
  return String(value || "").trim();
}

function readStorageJson(storage, key) {
  try {
    const rawValue = storage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function reportStorageWriteFailure(key, error, options = {}) {
  if (typeof options.onWriteError === "function") {
    options.onWriteError({ key, error });
  }
}

function writeStorageJson(storage, key, value, options = {}) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    reportStorageWriteFailure(key, error, options);
    return false;
  }
}

function removeStorageItem(storage, key, options = {}) {
  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    reportStorageWriteFailure(key, error, options);
    return false;
  }
}

function normalizeCustomThemePresetId(value) {
  const normalized = String(value || "").trim();
  return normalized.startsWith(CUSTOM_THEME_PRESET_ID_PREFIX) ? normalized : "";
}

function normalizeThemePresetStorageId(value, customPresets = []) {
  const builtinPresetId = normalizeThemePresetId(value);
  if (builtinPresetId) {
    return builtinPresetId;
  }
  const customPresetId = normalizeCustomThemePresetId(value);
  return customPresets.some((preset) => preset.id === customPresetId) ? customPresetId : "";
}

function readSystemPrefersDark() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches === true;
  } catch {
    return false;
  }
}

function slugifyCustomThemePresetName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "theme";
}

function normalizeCustomThemePresetLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function createCustomThemePresetId(label) {
  return `${CUSTOM_THEME_PRESET_ID_PREFIX}${slugifyCustomThemePresetName(label)}`;
}

function backgroundPreviewForThemeSettings(settings) {
  const background = settings?.background || {};
  const type = String(background.type || "").trim().toLowerCase();
  if (type === "radial") {
    return `radial-gradient(circle at 32% 24%, ${background.radialInner || background.solidColor || "#111827"} 0%, ${background.radialOuter || background.solidColor || "#030712"} 100%)`;
  }
  if (type === "linear") {
    return `linear-gradient(135deg, ${background.linearStart || background.solidColor || "#111827"} 0%, ${background.solidColor || background.linearStart || "#111827"} 52%, ${background.linearEnd || background.solidColor || "#030712"} 100%)`;
  }
  const color = background.solidColor || settings?.floor?.color || "#111827";
  return `linear-gradient(135deg, ${color} 0%, ${color} 100%)`;
}

function createCustomThemePresetPreview(settings) {
  const modelColor = settings?.materials?.fillColors?.[0] ||
    settings?.materials?.defaultColor ||
    DEFAULT_THEME_PRESET.settings.materials.defaultColor;
  return {
    background: backgroundPreviewForThemeSettings(settings),
    modelColor,
    accentColor: settings?.floor?.color || modelColor || DEFAULT_THEME_PRESET.settings.floor.color
  };
}

function normalizeStoredCustomThemePreset(value) {
  const label = normalizeCustomThemePresetLabel(value?.label || value?.name);
  const rawTheme = value?.theme && typeof value.theme === "object" ? value.theme : value?.settings;
  if (!label || !rawTheme || typeof rawTheme !== "object") {
    return null;
  }
  const settings = normalizeThemeSettings(rawTheme);
  const id = normalizeCustomThemePresetId(value?.id) || createCustomThemePresetId(label);
  return {
    id,
    label,
    description: String(value?.description || "Saved custom theme"),
    preview: createCustomThemePresetPreview(settings),
    settings
  };
}

function normalizeCustomThemePresetsPayload(rawValue) {
  const values = Array.isArray(rawValue) ? rawValue : (rawValue?.customThemes || rawValue?.presets);
  if (!Array.isArray(values)) {
    return [];
  }
  const seenIds = new Set();
  const presets = [];
  for (const value of values) {
    const preset = normalizeStoredCustomThemePreset(value);
    if (!preset || seenIds.has(preset.id)) {
      continue;
    }
    seenIds.add(preset.id);
    presets.push(preset);
  }
  return presets;
}

function storedCustomThemePresetPayload(preset) {
  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    theme: preset.settings
  };
}

function buildThemeStoragePayload({ activeThemeId = "", themeId = "", customPresets = [] } = {}) {
  const presets = normalizeCustomThemePresetsPayload(customPresets);
  const normalizedThemeId = normalizeThemePresetStorageId(activeThemeId || themeId, presets);
  const payload = {
    version: THEME_STORAGE_VERSION
  };
  if (normalizedThemeId) {
    payload.activeThemeId = normalizedThemeId;
  }
  if (presets.length) {
    payload.customThemes = presets.map(storedCustomThemePresetPayload);
  }
  return Object.keys(payload).length > 1 ? payload : null;
}

function themeStorageNeedsMigration(rawValue) {
  return Boolean(
    rawValue &&
    typeof rawValue === "object" &&
    (
      rawValue.version !== THEME_STORAGE_VERSION ||
      hasOwn(rawValue, "themeId") ||
      hasOwn(rawValue, "presets") ||
      hasOwn(rawValue, "settings")
    )
  );
}

function readThemeStorageState() {
  if (typeof window === "undefined") {
    return {
      customPresets: [],
      themeId: ""
    };
  }
  const rawValue = readStorageJson(window.localStorage, THEME_STORAGE_KEY);
  const customPresets = normalizeCustomThemePresetsPayload(rawValue);
  const state = {
    customPresets,
    themeId: readThemeStorageThemeId(rawValue, customPresets)
  };
  if (themeStorageNeedsMigration(rawValue)) {
    writeThemeStorageState(state);
  }
  return state;
}

function writeThemeStorageState(state = {}, options = {}) {
  if (typeof window === "undefined") {
    return true;
  }
  const payload = buildThemeStoragePayload(state);
  if (!payload) {
    return removeStorageItem(window.localStorage, THEME_STORAGE_KEY, options);
  }
  return writeStorageJson(window.localStorage, THEME_STORAGE_KEY, payload, options);
}

export function readCustomThemePresets() {
  return readThemeStorageState().customPresets;
}

export function writeCustomThemePresets(customPresets, options = {}) {
  const currentThemeState = readThemeStorageState();
  const presets = normalizeCustomThemePresetsPayload(customPresets);
  return writeThemeStorageState({
    themeId: currentThemeState.themeId,
    customPresets: presets
  }, options);
}

export function saveCustomThemePreset(label, themeSettings, options = {}) {
  const normalizedLabel = normalizeCustomThemePresetLabel(label);
  if (!normalizedLabel) {
    return null;
  }
  const existingPresets = readCustomThemePresets();
  const settings = normalizeThemeSettings(themeSettings);
  const preset = normalizeStoredCustomThemePreset({
    id: createCustomThemePresetId(normalizedLabel),
    label: normalizedLabel,
    settings
  });
  const nextPresets = [
    ...existingPresets.filter((existingPreset) => existingPreset.id !== preset.id),
    preset
  ];
  if (!writeCustomThemePresets(nextPresets, options)) {
    return null;
  }
  return preset;
}

export function buildAvailableThemePresets(customPresets = readCustomThemePresets()) {
  const normalizedCustomPresets = normalizeCustomThemePresetsPayload(customPresets);
  return [...THEME_PRESETS, ...normalizedCustomPresets];
}

export function getAvailableThemePresetById(presetId, customPresets = readCustomThemePresets()) {
  const normalizedPresetId = normalizeThemePresetStorageId(presetId, customPresets);
  return buildAvailableThemePresets(customPresets).find((preset) => preset.id === normalizedPresetId) || null;
}

export function cloneAvailableThemePresetSettings(presetId, customPresets = readCustomThemePresets()) {
  const preset = getAvailableThemePresetById(presetId, customPresets);
  return normalizeThemeSettings(preset?.settings || cloneThemePresetSettings(presetId));
}

export function getAvailableThemePresetIdForSettings(themeSettings, customPresets = readCustomThemePresets()) {
  const builtInPresetId = getThemePresetIdForSettings(themeSettings);
  if (builtInPresetId) {
    return builtInPresetId;
  }
  const normalizedSettings = normalizeThemeSettings(themeSettings);
  const normalizedSignature = JSON.stringify(normalizedSettings);
  for (const preset of normalizeCustomThemePresetsPayload(customPresets)) {
    if (JSON.stringify(normalizeThemeSettings(preset.settings)) === normalizedSignature) {
      return preset.id;
    }
  }
  return null;
}

function readThemeStorageThemeId(rawValue, customPresets = []) {
  return normalizeThemePresetStorageId(
    rawValue?.activeThemeId ||
      rawValue?.themeId ||
      rawValue?.presetId ||
      rawValue?.themePresetId ||
      rawValue?.lookPresetId,
    customPresets
  );
}

function cloneThemeSettingsState(
  presetId = "",
  settings = null,
  customPresets = readCustomThemePresets()
) {
  const fallbackPresetId = resolveSystemThemePresetId({ prefersDark: readSystemPrefersDark() });
  const normalizedPresetId = normalizeThemePresetStorageId(presetId || fallbackPresetId, customPresets) || DEFAULT_THEME_PRESET_ID;
  return {
    presetId: normalizedPresetId,
    settings: normalizeThemeSettings(settings || cloneAvailableThemePresetSettings(normalizedPresetId, customPresets))
  };
}

function isPlainStorageObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function storageValuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildCustomThemeSettingsOverride(baseSettings, customSettings) {
  if (!isPlainStorageObject(baseSettings) || !isPlainStorageObject(customSettings)) {
    return storageValuesEqual(baseSettings, customSettings) ? undefined : customSettings;
  }

  const override = {};
  for (const key of Object.keys(customSettings)) {
    const childOverride = buildCustomThemeSettingsOverride(baseSettings[key], customSettings[key]);
    if (childOverride !== undefined) {
      override[key] = childOverride;
    }
  }
  return Object.keys(override).length ? override : undefined;
}

function mergeCustomThemeSettings(baseSettings, customSettings) {
  if (!isPlainStorageObject(customSettings)) {
    return baseSettings;
  }
  if (!isPlainStorageObject(baseSettings)) {
    return customSettings;
  }

  const merged = { ...baseSettings };
  for (const [key, value] of Object.entries(customSettings)) {
    merged[key] = isPlainStorageObject(value) && isPlainStorageObject(baseSettings[key])
      ? mergeCustomThemeSettings(baseSettings[key], value)
      : value;
  }
  return merged;
}

function normalizeStoredHexColor(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return "";
}

function dropStaleCinematicCustomSettings(presetId, customSettings) {
  if (presetId !== DEFAULT_THEME_PRESET_ID || !isPlainStorageObject(customSettings)) {
    return customSettings;
  }

  const materials = customSettings.materials;
  if (!isPlainStorageObject(materials)) {
    return customSettings;
  }

  const defaultColor = normalizeStoredHexColor(materials.defaultColor);
  if (!STALE_CINEMATIC_DEFAULT_COLORS.has(defaultColor)) {
    return customSettings;
  }

  const nextMaterials = { ...materials };
  delete nextMaterials.defaultColor;
  const nextSettings = { ...customSettings };
  if (Object.keys(nextMaterials).length) {
    nextSettings.materials = nextMaterials;
  } else {
    delete nextSettings.materials;
  }
  return Object.keys(nextSettings).length ? nextSettings : undefined;
}

export function serializeThemeSettingsForStorage(themeSettings, options = {}) {
  const customPresets = normalizeCustomThemePresetsPayload(options.customPresets || readCustomThemePresets());
  const presetId = normalizeThemePresetStorageId(
    options.presetId || getAvailableThemePresetIdForSettings(themeSettings, customPresets),
    customPresets
  );
  const systemDefaultPresetId = resolveSystemThemePresetId({ prefersDark: readSystemPrefersDark() });
  const themeId = presetId && presetId !== systemDefaultPresetId ? presetId : "";
  return buildThemeStoragePayload({
    themeId,
    customPresets
  });
}

export function parseThemeSettingsStateFromStorage(rawValue, customPresets = normalizeCustomThemePresetsPayload(rawValue)) {
  if (!rawValue || typeof rawValue !== "object") {
    return cloneThemeSettingsState("", null, customPresets);
  }

  const storedPresetId = readThemeStorageThemeId(rawValue, customPresets);
  if (storedPresetId) {
    return cloneThemeSettingsState(
      storedPresetId,
      cloneAvailableThemePresetSettings(storedPresetId, customPresets),
      customPresets
    );
  }

  return cloneThemeSettingsState("", null, customPresets);
}

export function parseThemeSettingsFromStorage(rawValue) {
  return parseThemeSettingsStateFromStorage(rawValue).settings;
}

export function readThemeSettingsState(customPresets = readCustomThemePresets()) {
  if (typeof window === "undefined") {
    return cloneThemeSettingsState("", null, customPresets);
  }
  return parseThemeSettingsStateFromStorage(
    readStorageJson(window.localStorage, THEME_STORAGE_KEY),
    customPresets
  );
}

export function readThemeSettings() {
  return readThemeSettingsState().settings;
}

export function writeThemeSettings(themeSettings, options = {}) {
  if (typeof window === "undefined") {
    return true;
  }
  const serialized = serializeThemeSettingsForStorage(themeSettings, options);
  if (!serialized) {
    return removeStorageItem(window.localStorage, THEME_STORAGE_KEY, options);
  }
  return writeStorageJson(window.localStorage, THEME_STORAGE_KEY, serialized, options);
}

export function normalizeCadWorkspaceGlassTone(value, fallback = CAD_WORKSPACE_DEFAULT_GLASS_TONE) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "dark" || normalized === "light") {
    return normalized;
  }
  return fallback === "light" ? "light" : "dark";
}

export function readCadWorkspaceGlassTone() {
  return CAD_WORKSPACE_DEFAULT_GLASS_TONE;
}

export function createTabSnapshot(overrides = {}) {
  return normalizeSchemaState(TAB_STATE_SCHEMA, overrides || {});
}

export function cloneTabSnapshot(snapshot) {
  return cloneSchemaState(TAB_STATE_SCHEMA, snapshot || {});
}

export function tabSnapshotEqual(a, b) {
  return schemaStateEqual(TAB_STATE_SCHEMA, a || {}, b || {});
}

export function createTabRecord(key, overrides = {}) {
  return {
    key: normalizeTabKey(key),
    ...cloneTabSnapshot(overrides)
  };
}
