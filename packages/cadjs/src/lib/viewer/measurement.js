const PLANAR_SURFACE_TYPES = new Set(["plane", "planar"]);
const PARALLEL_NORMAL_TOLERANCE = 0.999;
const EPSILON = 1e-9;

export function normalizeVector3(value) {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  const magnitude = Math.hypot(x, y, z);
  if (!(magnitude > 0)) {
    return null;
  }
  return [x / magnitude, y / magnitude, z / magnitude];
}

function pointVector(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) {
    return null;
  }
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}

export function isFinitePoint(value) {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Number.isFinite(value[2])
  );
}

export function distanceBetweenPoints(a, b) {
  const vector = pointVector(a, b);
  if (!vector) {
    return null;
  }
  const distance = Math.hypot(vector[0], vector[1], vector[2]);
  return distance < EPSILON ? 0 : distance;
}

export function closestPointOnSegment(point, start, end) {
  if (!isFinitePoint(point) || !isFinitePoint(start) || !isFinitePoint(end)) {
    return null;
  }
  const direction = pointVector(start, end);
  if (!direction) {
    return null;
  }
  const lengthSquared = (direction[0] ** 2) + (direction[1] ** 2) + (direction[2] ** 2);
  if (lengthSquared <= 0) {
    return start;
  }
  const relative = pointVector(start, point);
  if (!relative) {
    return null;
  }
  const t = clamp(
    ((relative[0] * direction[0]) + (relative[1] * direction[1]) + (relative[2] * direction[2])) / lengthSquared,
    0,
    1
  );
  return [
    start[0] + (direction[0] * t),
    start[1] + (direction[1] * t),
    start[2] + (direction[2] * t)
  ];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function closestPointOnPolyline(points, point) {
  if (!Array.isArray(points) || !Array.isArray(point)) {
    return null;
  }
  let bestPoint = null;
  let bestDistance = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = closestPointOnSegment(point, points[index - 1], points[index]);
    if (!candidate) {
      continue;
    }
    const candidateDistance = distanceBetweenPoints(point, candidate);
    if (candidateDistance !== null && candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestPoint = candidate;
    }
  }
  return bestPoint;
}

export function isPlanarFace(reference) {
  const pickData = reference?.pickData;
  if (!pickData) {
    return false;
  }
  const surfaceType = String(pickData.surfaceType || pickData.surface?.type || "").trim().toLowerCase();
  if (!surfaceType || !PLANAR_SURFACE_TYPES.has(surfaceType)) {
    return false;
  }
  return normalizeVector3(pickData.normal) !== null;
}

export function classifyMeasurePick({ reference = null, hitPoint = null, referenceId = "" } = {}) {
  const normalizedHit = isFinitePoint(hitPoint) ? hitPoint.slice(0, 3) : null;
  const pickData = reference?.pickData || {};
  const selectorType = String(pickData.selectorType || reference?.selectorType || "").trim().toLowerCase();
  const snapKind = classifyMeasureSnapKind({ pickData, selectorType, hitPoint: normalizedHit });
  if (!snapKind) {
    return null;
  }
  const point = measurePointFromReference({ snapKind, reference, hitPoint: normalizedHit });
  if (!point) {
    return null;
  }
  return {
    referenceId: String(referenceId || "").trim(),
    reference: reference || null,
    snapKind,
    point
  };
}

export function classifyMeasureSnapKind({ pickData = null, selectorType = "", hitPoint = null } = {}) {
  if (!pickData) {
    return isFinitePoint(hitPoint) ? "free" : null;
  }
  const normalizedSelectorType = String(pickData.selectorType || selectorType || "").trim().toLowerCase();
  if (normalizedSelectorType === "vertex" && isFinitePoint(pickData.center)) {
    return "vertex";
  }
  if (
    Array.isArray(pickData.points) &&
    pickData.points.length >= 2 &&
    pickData.points.every((point) => isFinitePoint(point))
  ) {
    return "edge";
  }
  if (normalizedSelectorType === "face") {
    return "face";
  }
  return isFinitePoint(hitPoint) ? "free" : null;
}

export function measurePointFromReference({
  snapKind = "",
  reference = null,
  hitPoint = null
} = {}) {
  const normalizedKind = String(snapKind || "").trim();
  const pickData = reference?.pickData;
  if (normalizedKind === "vertex") {
    return isFinitePoint(pickData?.center) ? pickData.center.slice(0, 3) : null;
  }
  if (normalizedKind === "edge") {
    if (!isFinitePoint(hitPoint)) {
      return null;
    }
    return closestPointOnPolyline(pickData?.points, hitPoint);
  }
  if (normalizedKind === "face" || normalizedKind === "free") {
    return isFinitePoint(hitPoint) ? hitPoint.slice(0, 3) : null;
  }
  return null;
}

export function measurementFromPicks(pickA, pickB) {
  const pointA = isFinitePoint(pickA?.point) ? pickA.point : null;
  const pointB = isFinitePoint(pickB?.point) ? pickB.point : null;
  if (!pointA || !pointB) {
    return null;
  }
  const euclidean = distanceBetweenPoints(pointA, pointB);
  if (euclidean === null) {
    return null;
  }
  const delta = [
    pointB[0] - pointA[0],
    pointB[1] - pointA[1],
    pointB[2] - pointA[2]
  ];
  const result = {
    euclidean,
    perpendicular: null,
    delta,
    unit: "mm"
  };
  const perpendicular = perpendicularDistanceBetweenFaces(pickA, pickB);
  if (perpendicular !== null) {
    result.perpendicular = perpendicular < EPSILON ? 0 : perpendicular;
  }
  return result;
}

function perpendicularDistanceBetweenFaces(pickA, pickB) {
  if (!isPlanarFace(pickA?.reference) || !isPlanarFace(pickB?.reference)) {
    return null;
  }
  const normalA = normalizeVector3(pickA.reference.pickData.normal);
  const normalB = normalizeVector3(pickB.reference.pickData.normal);
  if (!normalA || !normalB) {
    return null;
  }
  const dot = (normalA[0] * normalB[0]) + (normalA[1] * normalB[1]) + (normalA[2] * normalB[2]);
  if (Math.abs(dot) < PARALLEL_NORMAL_TOLERANCE) {
    return null;
  }
  const pointA = pickA.point;
  const pointB = pickB.point;
  const distance = Math.abs(
    ((pointB[0] - pointA[0]) * normalA[0]) +
    ((pointB[1] - pointA[1]) * normalA[1]) +
    ((pointB[2] - pointA[2]) * normalA[2])
  );
  return distance;
}

export function formatMeasurement(measurement, { precision = 2 } = {}) {
  if (!measurement || !Number.isFinite(Number(measurement.euclidean))) {
    return "";
  }
  const value = measurement.perpendicular !== null ? measurement.perpendicular : measurement.euclidean;
  const normalizedPrecision = Number.isInteger(Number(precision)) ? Number(precision) : 2;
  const formattedValue = value.toFixed(normalizedPrecision);
  return `${formattedValue} ${measurement.unit || "mm"}`;
}

export function formatMeasurementDelta(measurement, { precision = 2 } = {}) {
  if (!Array.isArray(measurement?.delta) || measurement.delta.length < 3) {
    return "";
  }
  const values = measurement.delta.slice(0, 3).map((component) => Number(component));
  if (!values.every((component) => Number.isFinite(component))) {
    return "";
  }
  const normalizedPrecision = Number.isInteger(Number(precision)) ? Number(precision) : 2;
  const formatComponent = (component) => {
    const formatted = component.toFixed(normalizedPrecision);
    return formatted === `-${(0).toFixed(normalizedPrecision)}` ? (0).toFixed(normalizedPrecision) : formatted;
  };
  return `ΔX ${formatComponent(values[0])}  ΔY ${formatComponent(values[1])}  ΔZ ${formatComponent(values[2])}`;
}
