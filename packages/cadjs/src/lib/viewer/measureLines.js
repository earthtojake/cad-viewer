import { createScreenSpaceLineSegments } from "../../common/renderEdges.js";
import { isFinitePoint, normalizeVector3 } from "./measurement.js";

// Keep dimensions visually distinct from selection blue.  Amber also remains readable
// against the neutral model material used by the viewer.
export const MEASURE_LINE_COLOR = "#f59e0b";
export const MEASURE_LINE_WIDTH = 2.4;
export const MEASURE_LINE_OPACITY = 0.96;
export const MEASURE_LINE_DRAFT_OPACITY = 0.72;
export const MEASURE_LINE_DRAFT_WIDTH = 2;
export const MEASURE_LINE_DRAFT_ID = "draft";
export const MEASURE_LINE_RENDER_ORDER = 27;

const MIN_DIMENSION_OFFSET = 0.75;
const DIMENSION_OFFSET_RATIO = 0.12;
const TICK_LENGTH_RATIO = 0.075;

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector, amount) {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function cross(a, b) {
  return [
    (a[1] * b[2]) - (a[2] * b[1]),
    (a[2] * b[0]) - (a[0] * b[2]),
    (a[0] * b[1]) - (a[1] * b[0])
  ];
}

function dot(a, b) {
  return (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
}

function vectorLength(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function cameraPoint(camera) {
  const position = camera?.position;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    return null;
  }
  return [position.x, position.y, position.z];
}

function faceNormal(pick) {
  return normalizeVector3(pick?.reference?.pickData?.normal);
}

export function dimensionEndpoints(pickA, pickB, measurement) {
  const pointA = pickA?.point;
  const pointB = pickB?.point;
  if (!isFinitePoint(pointA) || !isFinitePoint(pointB)) {
    return null;
  }
  // A face-to-face result is a normal distance.  Draw that normal distance, not
  // the potentially diagonal distance between the two click locations.
  const normal = measurement?.perpendicular !== null && measurement?.perpendicular !== undefined
    ? faceNormal(pickA)
    : null;
  if (!normal) {
    return { start: pointA, end: pointB };
  }
  const signedDistance = dot(subtract(pointB, pointA), normal);
  return {
    start: pointA,
    end: add(pointA, scale(normal, signedDistance))
  };
}

/**
 * Produces a conventional dimension construction in world space: witness lines,
 * an offset dimension line, and ticks.  The offset is camera-aware so labels and
 * lines are not buried in the picked surface.
 */
export function measureDimensionSegments(pickA, pickB, measurement = null, { camera = null } = {}) {
  const endpoints = dimensionEndpoints(pickA, pickB, measurement);
  if (!endpoints) {
    return null;
  }
  const directionRaw = subtract(endpoints.end, endpoints.start);
  const length = vectorLength(directionRaw);
  if (!(length > 1e-9)) {
    return null;
  }
  const direction = scale(directionRaw, 1 / length);
  const midpoint = midpointOfPoints(endpoints.start, endpoints.end);
  const eyeDirection = midpoint && cameraPoint(camera)
    ? normalizeVector3(subtract(cameraPoint(camera), midpoint))
    : null;
  const cameraUp = normalizeVector3(camera?.up ? [camera.up.x, camera.up.y, camera.up.z] : null);
  const offsetDirection = normalizeVector3(cross(eyeDirection || cameraUp || [0, 0, 1], direction)) ||
    normalizeVector3(cross(cameraUp || [0, 1, 0], direction)) ||
    [0, 1, 0];
  const offset = Math.max(MIN_DIMENSION_OFFSET, length * DIMENSION_OFFSET_RATIO);
  const tickLength = Math.max(MIN_DIMENSION_OFFSET * 0.55, length * TICK_LENGTH_RATIO);
  const witnessStart = add(endpoints.start, scale(offsetDirection, offset));
  const witnessEnd = add(endpoints.end, scale(offsetDirection, offset));
  const tickDirection = direction;
  const tick = (point) => {
    const half = scale(tickDirection, tickLength / 2);
    return [subtract(point, half), add(point, half)];
  };
  return {
    start: endpoints.start,
    end: endpoints.end,
    witnessStart,
    witnessEnd,
    labelPoint: midpointOfPoints(witnessStart, witnessEnd),
    ticks: [tick(witnessStart), tick(witnessEnd)],
    segments: [
      [endpoints.start, witnessStart],
      [endpoints.end, witnessEnd],
      [witnessStart, witnessEnd],
      tick(witnessStart),
      tick(witnessEnd)
    ]
  };
}

export function createMeasureLineSegments(runtime, state, { materials = null } = {}) {
  if (!runtime?.THREE) {
    return { committed: null, draft: null };
  }
  const segments = measureRulerLineSegments(state, { camera: runtime.camera });
  const committedPoints = [];
  const draftPoints = [];
  for (const segment of segments) {
    const target = segment.committed ? committedPoints : draftPoints;
    for (const [start, end] of segment.segments) {
      target.push(...start, ...end);
    }
  }
  const options = {
    color: MEASURE_LINE_COLOR,
    // The construction is offset from the surface; retain depth testing so it
    // cannot appear as an unrelated line through a solid.
    depthTest: true,
    depthWrite: false,
    depthBias: 0.006,
    renderOrder: MEASURE_LINE_RENDER_ORDER
  };
  return {
    committed: committedPoints.length
      ? createScreenSpaceLineSegments(runtime, committedPoints, {
        ...options,
        opacity: MEASURE_LINE_OPACITY,
        lineWidth: MEASURE_LINE_WIDTH
      }, materials)
      : null,
    draft: draftPoints.length
      ? createScreenSpaceLineSegments(runtime, draftPoints, {
        ...options,
        opacity: MEASURE_LINE_DRAFT_OPACITY,
        lineWidth: MEASURE_LINE_DRAFT_WIDTH
      }, materials)
      : null
  };
}

export function clearMeasureLineGroup(runtime, group) {
  if (!group) {
    return;
  }
  while (group.children?.length) {
    const child = group.children[0];
    group.remove(child);
    disposeMeasureLineChild(child);
  }
  group.visible = false;
}

function disposeMeasureLineChild(child) {
  while (child.children?.length) {
    const nested = child.children[0];
    child.remove(nested);
    disposeMeasureLineChild(nested);
  }
  if (typeof child.userData?.beforeDispose === "function") {
    child.userData.beforeDispose(child);
    delete child.userData.beforeDispose;
  }
  if (child.userData?.disposeGeometry !== false) {
    child.geometry?.dispose?.();
  }
  if (child.userData?.disposeMaterial !== false) {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material?.dispose?.();
    }
  }
}

export function measureRulerLineSegments(state, { camera = null } = {}) {
  if (!state) {
    return [];
  }
  const segments = [];
  for (const item of state.measurements || []) {
    const dimension = measureDimensionSegments(item?.pickA, item?.pickB, item?.measurement, { camera });
    if (dimension) {
      segments.push({ id: item.id, ...dimension, committed: true });
    }
  }
  const draft = state.draft;
  if (draft?.anchor && draft?.hover) {
    const dimension = measureDimensionSegments(draft.anchor, draft.hover, null, { camera });
    if (dimension) {
      segments.push({ id: MEASURE_LINE_DRAFT_ID, ...dimension, committed: false });
    }
  }
  return segments;
}

export function midpointOfPoints(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) {
    return null;
  }
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

export function clampMeasureChipPosition(position, bounds, { width = 180, height = 44 } = {}) {
  if (!position || !bounds || !(Number(bounds.width) > 0) || !(Number(bounds.height) > 0)) {
    return null;
  }
  const viewportWidth = Number(bounds.width);
  const viewportHeight = Number(bounds.height);
  const halfWidth = Number(width) / 2;
  const halfHeight = Number(height) / 2;
  const minX = halfWidth;
  const maxX = Math.max(minX, viewportWidth - halfWidth);
  const minY = halfHeight;
  const maxY = Math.max(minY, viewportHeight - halfHeight);
  return {
    x: Math.min(Math.max(Number(position.x) || 0, minX), maxX),
    y: Math.min(Math.max(Number(position.y) || 0, minY), maxY)
  };
}

export function layoutMeasureChipPositions(chips, bounds, { width = 188, height = 52, gap = 8 } = {}) {
  const laidOut = [];
  for (const chip of chips || []) {
    let candidate = clampMeasureChipPosition(chip, bounds, { width, height });
    if (!candidate) {
      continue;
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const collides = laidOut.some((placed) => (
        Math.abs(placed.x - candidate.x) < width && Math.abs(placed.y - candidate.y) < height
      ));
      if (!collides) {
        break;
      }
      candidate = clampMeasureChipPosition({ x: candidate.x, y: candidate.y + height + gap }, bounds, { width, height });
    }
    laidOut.push({ ...chip, ...candidate });
  }
  return laidOut;
}
