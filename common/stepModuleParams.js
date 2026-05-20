import {
  normalizeParameterValue,
  normalizeStepModuleParameterValues
} from "./stepModule.js";

export const DEFAULT_STEP_MODULE_PARAM_FPS = 18;
export const DEFAULT_STEP_MODULE_PARAM_DURATION_SECONDS = 4;
export const MAX_STEP_MODULE_PARAM_FRAMES = 720;

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function positiveInteger(value, fallback) {
  const parsed = Math.round(Number(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function rawParamsUseEnvelope(rawParams) {
  return isObject(rawParams) && (
    isObject(rawParams.values)
    || isObject(rawParams.animate)
    || Object.hasOwn(rawParams, "durationSeconds")
    || Object.hasOwn(rawParams, "duration")
    || Object.hasOwn(rawParams, "fps")
    || Object.hasOwn(rawParams, "loop")
  );
}

export function hasStepModuleRenderParams(value) {
  return value !== undefined && value !== null;
}

export function stepModuleRenderParamsAreAnimated(rawParams) {
  return isObject(rawParams) && isObject(rawParams.animate) && Object.keys(rawParams.animate).length > 0;
}

function parameterMapForDefinition(definition) {
  return definition?.parameterMap && typeof definition.parameterMap === "object"
    ? definition.parameterMap
    : {};
}

function assertKnownParameterIds(definition, values, label) {
  const parameterMap = parameterMapForDefinition(definition);
  for (const key of Object.keys(isObject(values) ? values : {})) {
    if (!parameterMap[key]) {
      throw new Error(`Unknown STEP module parameter in ${label}: ${key}`);
    }
  }
}

function normalizeRange(definition, parameterId, rawRange) {
  const parameter = parameterMapForDefinition(definition)[parameterId];
  if (!parameter) {
    throw new Error(`Unknown STEP module animated parameter: ${parameterId}`);
  }
  if (parameter.type !== "number") {
    throw new Error(`STEP module animated parameter must be numeric: ${parameterId}`);
  }
  if (!isObject(rawRange)) {
    throw new Error(`STEP module animated parameter range must be an object: ${parameterId}`);
  }
  const from = Number(rawRange.from);
  const to = Number(rawRange.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new Error(`STEP module animated parameter range requires finite from/to values: ${parameterId}`);
  }
  return {
    parameterId,
    from,
    to
  };
}

function normalizeAnimationRanges(definition, rawAnimate) {
  return Object.fromEntries(
    Object.entries(isObject(rawAnimate) ? rawAnimate : {})
      .map(([parameterId, rawRange]) => {
        const normalizedId = String(parameterId || "").trim();
        if (!normalizedId) {
          return null;
        }
        const range = normalizeRange(definition, normalizedId, rawRange);
        return [normalizedId, range];
      })
      .filter(Boolean)
  );
}

export function normalizeStepModuleRenderParams(definition, rawParams = {}) {
  if (!isObject(rawParams)) {
    throw new Error("STEP module params must be a JSON object");
  }
  const usesEnvelope = rawParamsUseEnvelope(rawParams);
  const rawValues = usesEnvelope ? (rawParams.values || {}) : rawParams;
  if (!isObject(rawValues)) {
    throw new Error("STEP module params.values must be a JSON object");
  }
  assertKnownParameterIds(definition, rawValues, "params");

  const values = normalizeStepModuleParameterValues(definition, rawValues);
  const animate = usesEnvelope ? normalizeAnimationRanges(definition, rawParams.animate) : {};
  const animated = Object.keys(animate).length > 0;
  const fps = clamp(positiveInteger(rawParams.fps, DEFAULT_STEP_MODULE_PARAM_FPS), 1, 60);
  const durationSeconds = clamp(
    toFiniteNumber(rawParams.durationSeconds ?? rawParams.duration, DEFAULT_STEP_MODULE_PARAM_DURATION_SECONDS),
    0.1,
    60
  );
  const frameCount = animated
    ? Math.max(2, Math.min(Math.round(fps * durationSeconds), MAX_STEP_MODULE_PARAM_FRAMES))
    : 1;
  return {
    values,
    animate,
    animated,
    fps,
    durationSeconds,
    frameCount,
    loop: rawParams.loop !== false
  };
}

export function stepModuleRenderFrameProgress(params, frameIndex) {
  const frameCount = Math.max(Math.floor(Number(params?.frameCount) || 1), 1);
  const index = clamp(Math.floor(Number(frameIndex) || 0), 0, frameCount - 1);
  if (frameCount <= 1) {
    return 0;
  }
  return params?.loop === false
    ? index / (frameCount - 1)
    : index / frameCount;
}

export function stepModuleRenderFrameValues(definition, params, frameIndex) {
  const progress = stepModuleRenderFrameProgress(params, frameIndex);
  const values = { ...(params?.values || {}) };
  for (const [parameterId, range] of Object.entries(isObject(params?.animate) ? params.animate : {})) {
    const parameter = parameterMapForDefinition(definition)[parameterId];
    if (!parameter) {
      continue;
    }
    values[parameterId] = normalizeParameterValue(
      parameter,
      range.from + ((range.to - range.from) * progress)
    );
  }
  return values;
}

export function stepModuleRenderFrameState(params, frameIndex) {
  const progress = stepModuleRenderFrameProgress(params, frameIndex);
  const duration = Math.max(Number(params?.durationSeconds) || 0, 0);
  const elapsedSec = progress * duration;
  return {
    activeId: "params",
    playing: Boolean(params?.animated),
    elapsedSec,
    duration,
    speed: 1,
    loop: params?.loop !== false
  };
}
