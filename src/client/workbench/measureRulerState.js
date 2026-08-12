import { isFinitePoint, measurementFromPicks } from "cadjs/lib/viewer/measurement.js";

export const MEASURE_RULER_MAX_MEASUREMENTS = 20;

let measureMeasurementCounter = 0;

export function createMeasureMeasurementId() {
  measureMeasurementCounter += 1;
  return `measurement-${measureMeasurementCounter}`;
}

export function applyMeasureRulerPick(state, pick, { createId = createMeasureMeasurementId } = {}) {
  if (!pick || !isFinitePoint(pick?.point)) {
    return state || null;
  }
  if (!state?.draft) {
    return {
      draft: { anchor: pick, hover: null },
      measurements: state?.measurements || []
    };
  }
  const measurement = measurementFromPicks(state.draft.anchor, pick);
  if (!measurement) {
    return {
      draft: { anchor: pick, hover: null },
      measurements: state.measurements || []
    };
  }
  const item = {
    id: createId(),
    pickA: state.draft.anchor,
    pickB: pick,
    measurement
  };
  let measurements = [...(state.measurements || []), item];
  if (measurements.length > MEASURE_RULER_MAX_MEASUREMENTS) {
    measurements = measurements.slice(measurements.length - MEASURE_RULER_MAX_MEASUREMENTS);
  }
  return {
    draft: null,
    measurements
  };
}

export function applyMeasureRulerHover(state, hover) {
  if (!state?.draft) {
    return state || null;
  }
  return {
    ...state,
    draft: {
      anchor: state.draft.anchor,
      hover: hover && isFinitePoint(hover?.point) ? hover : null
    }
  };
}

export function applyMeasureRulerDelete(state, measurementId) {
  if (!state || !measurementId) {
    return state || null;
  }
  const measurements = (state.measurements || []).filter((item) => item.id !== measurementId);
  if (measurements.length === (state.measurements || []).length) {
    return state;
  }
  return {
    draft: state.draft || null,
    measurements
  };
}

export function measureRulerDraftMeasurement(state) {
  const draft = state?.draft;
  if (!draft?.anchor || !draft.hover) {
    return null;
  }
  return measurementFromPicks(draft.anchor, draft.hover);
}

export function measureRulerStateForChange(state, { entryChanged = false, toolActive = true } = {}) {
  if (!state) {
    return null;
  }
  if (!toolActive) {
    return null;
  }
  if (entryChanged) {
    return {
      draft: null,
      measurements: state.measurements || []
    };
  }
  return state;
}

export function resetMeasureRulerState() {
  return null;
}
