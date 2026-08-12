import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMeasurePick,
  classifyMeasureSnapKind,
  closestPointOnPolyline,
  closestPointOnSegment,
  distanceBetweenPoints,
  formatMeasurement,
  formatMeasurementDelta,
  isFinitePoint,
  isPlanarFace,
  measurePointFromReference,
  measurementFromPicks,
  normalizeVector3
} from "./measurement.js";


test("isFinitePoint accepts finite length-3 points and rejects malformed inputs", () => {
  assert.equal(isFinitePoint([1, 2, 3]), true);
  assert.equal(isFinitePoint([1, 2]), false);
  assert.equal(isFinitePoint([1, 2, NaN]), false);
  assert.equal(isFinitePoint([1, 2, Infinity]), false);
  assert.equal(isFinitePoint(null), false);
  assert.equal(isFinitePoint("1,2,3"), false);
});

test("normalizeVector3 normalizes unit and scales and rejects unusable input", () => {
  assert.deepEqual(normalizeVector3([3, 0, 0]), [1, 0, 0]);
  const normalized = normalizeVector3([1, 1, 1]);
  assert.ok(Math.abs(Math.hypot(...normalized) - 1) < 1e-9);
  assert.equal(normalizeVector3([0, 0, 0]), null);
  assert.equal(normalizeVector3([NaN, 1, 0]), null);
  assert.equal(normalizeVector3("x"), null);
});

test("distanceBetweenPoints measures euclidean distance and clamps tiny values to zero", () => {
  assert.equal(distanceBetweenPoints([0, 0, 0], [3, 4, 0]), 5);
  assert.equal(distanceBetweenPoints([0, 0, 0], [0, 0, 0]), 0);
  assert.equal(distanceBetweenPoints([0, 0, 0], [1e-12, 0, 0]), 0);
  assert.equal(distanceBetweenPoints([0, 0], [1, 0, 0]), null);
});

test("closestPointOnSegment projects onto the segment interior and clamps to endpoints", () => {
  assert.deepEqual(closestPointOnSegment([0, 1, 0], [0, 0, 0], [0, 2, 0]), [0, 1, 0]);
  assert.deepEqual(closestPointOnSegment([0, 5, 0], [0, 0, 0], [0, 2, 0]), [0, 2, 0]);
  assert.deepEqual(closestPointOnSegment([0, -2, 0], [0, 0, 0], [0, 2, 0]), [0, 0, 0]);
  assert.deepEqual(closestPointOnSegment([1, 0, 0], [0, 0, 0], [0, 0, 0]), [0, 0, 0]);
  assert.equal(closestPointOnSegment([0, 0], [0, 0, 0], [0, 2, 0]), null);
});

test("closestPointOnPolyline returns the nearest segment-projected point", () => {
  const polyline = [[0, 0, 0], [4, 0, 0], [4, 4, 0]];
  const hit = closestPointOnPolyline(polyline, [2, 1, 0]);
  assert.deepEqual(hit, [2, 0, 0]);
  const corner = closestPointOnPolyline(polyline, [5, 2, 0]);
  assert.deepEqual(corner, [4, 2, 0]);
  assert.equal(closestPointOnPolyline(polyline, null), null);
  assert.equal(closestPointOnPolyline([], [0, 0, 0]), null);
});

test("isPlanarFace accepts stable surfaceType tokens and requires a finite normal", () => {
  assert.equal(isPlanarFace({ pickData: { surfaceType: "PLANE", normal: [0, 0, 1] } }), true);
  assert.equal(isPlanarFace({ pickData: { surfaceType: "planar", normal: [0, 0, 1] } }), true);
  assert.equal(isPlanarFace({ pickData: { surface: { type: "PLANE" }, normal: [0, 0, 1] } }), true);
  assert.equal(isPlanarFace({ pickData: { surfaceType: "CYLINDRICAL_SURFACE", normal: [0, 0, 1] } }), false);
  assert.equal(isPlanarFace({ pickData: { surfaceType: "PLANE" } }), false);
  assert.equal(isPlanarFace({ pickData: { surfaceType: "PLANE", normal: [0, 0, 0] } }), false);
  assert.equal(isPlanarFace({}), false);
  assert.equal(isPlanarFace(null), false);
});

test("measurePointFromReference resolves vertex center, edge snap, and hit points", () => {
  const edgeReference = {
    pickData: { points: [[0, 0, 0], [4, 0, 0]] }
  };
  assert.deepEqual(
    measurePointFromReference({ snapKind: "vertex", reference: { pickData: { center: [1, 2, 3] } }, hitPoint: [0, 0, 0] }),
    [1, 2, 3]
  );
  assert.deepEqual(
    measurePointFromReference({ snapKind: "edge", reference: edgeReference, hitPoint: [2, 1, 0] }),
    [2, 0, 0]
  );
  assert.deepEqual(
    measurePointFromReference({ snapKind: "face", reference: {}, hitPoint: [1, 1, 1] }),
    [1, 1, 1]
  );
  assert.deepEqual(
    measurePointFromReference({ snapKind: "free", hitPoint: [2, 2, 2] }),
    [2, 2, 2]
  );
  assert.equal(measurePointFromReference({ snapKind: "edge", reference: edgeReference }), null);
  assert.equal(measurePointFromReference({ snapKind: "unknown" }), null);
  assert.equal(measurePointFromReference({ snapKind: "vertex", reference: { pickData: {} } }), null);
});

test("measurementFromPicks measures euclidean distance and per-axis delta", () => {
  const result = measurementFromPicks(
    { point: [0, 0, 0] },
    { point: [3, 4, 0] }
  );
  assert.equal(result.euclidean, 5);
  assert.deepEqual(result.delta, [3, 4, 0]);
  assert.equal(result.unit, "mm");
  assert.equal(result.perpendicular, null);
  assert.equal(measurementFromPicks({ }, { point: [1, 0, 0] }), null);
});

test("measurementFromPicks reports perpendicular distance for parallel planar faces", () => {
  const faceA = {
    point: [0, 0, 0],
    reference: { pickData: { surfaceType: "PLANE", normal: [0, 0, 1] } }
  };
  const faceB = {
    point: [0, 0, 2.5],
    reference: { pickData: { surfaceType: "PLANE", normal: [0, 0, 1] } }
  };
  assert.equal(measurementFromPicks(faceA, faceB).perpendicular, 2.5);
});

test("measurementFromPicks treats anti-parallel planar faces as perpendicular", () => {
  const faceA = {
    point: [0, 0, 0],
    reference: { pickData: { surfaceType: "PLANE", normal: [0, 0, 1] } }
  };
  const faceB = {
    point: [0, 0, 4],
    reference: { pickData: { surfaceType: "PLANE", normal: [0, 0, -1] } }
  };
  assert.equal(measurementFromPicks(faceA, faceB).perpendicular, 4);
});

test("measurementFromPicks falls back to euclidean for non-parallel faces", () => {
  const faceA = {
    point: [0, 0, 0],
    reference: { pickData: { surfaceType: "PLANE", normal: [1, 0, 0] } }
  };
  const faceB = {
    point: [0, 0, 1],
    reference: { pickData: { surfaceType: "PLANE", normal: [0, 1, 0] } }
  };
  const result = measurementFromPicks(faceA, faceB);
  assert.equal(result.perpendicular, null);
  assert.equal(result.euclidean, 1);
});

test("measurementFromPicks refuses perpendicular distance for non-planar picks", () => {
  const cylinder = {
    point: [0, 0, 0],
    reference: { pickData: { surfaceType: "CYLINDRICAL_SURFACE", normal: [0, 1, 0] } }
  };
  const face = {
    point: [0, 0, 5],
    reference: { pickData: { surfaceType: "PLANE", normal: [0, 0, 1] } }
  };
  const result = measurementFromPicks(cylinder, face);
  assert.equal(result.perpendicular, null);
  assert.equal(result.euclidean, 5);
});

test("measurementFromPicks clamps near-zero perpendicular distances to zero", () => {
  const faceA = {
    point: [0, 0, 0],
    reference: { pickData: { surfaceType: "PLANE", normal: [0, 0, 1] } }
  };
  const faceB = {
    point: [0, 0, 1e-12],
    reference: { pickData: { surfaceType: "PLANE", normal: [0, 0, 1] } }
  };
  assert.equal(measurementFromPicks(faceA, faceB).perpendicular, 0);
});

test("classifyMeasureSnapKind classifies references deterministically", () => {
  assert.equal(
    classifyMeasureSnapKind({ pickData: { selectorType: "vertex", center: [1, 2, 3] }, hitPoint: [0, 0, 0] }),
    "vertex"
  );
  assert.equal(
    classifyMeasureSnapKind({ pickData: { selectorType: "edge", points: [[0, 0, 0], [1, 0, 0]] }, hitPoint: [0, 0, 0] }),
    "edge"
  );
  assert.equal(
    classifyMeasureSnapKind({ pickData: { selectorType: "face", normal: [0, 0, 1], center: [0, 0, 1] }, hitPoint: [0, 0, 1] }),
    "face"
  );
  assert.equal(
    classifyMeasureSnapKind({ pickData: { selectorType: "occurrence", name: "part" }, hitPoint: [1, 2, 3] }),
    "free"
  );
  assert.equal(classifyMeasureSnapKind({ pickData: null, hitPoint: [1, 2, 3] }), "free");
  assert.equal(classifyMeasureSnapKind({ pickData: {} }), null);
  assert.equal(classifyMeasureSnapKind({ pickData: { selectorType: "face" } }), "face");
});

test("classifyMeasurePick resolves the reference to a snap point and returns the reference", () => {
  const classify = (reference, hitPoint) => classifyMeasurePick({
    reference,
    hitPoint,
    referenceId: reference?.id || ""
  });
  const edgeReference = { id: "topology|1|edge|2", selectorType: "edge", pickData: { selectorType: "edge", points: [[0, 0, 0], [4, 0, 0]] } };
  assert.deepEqual(
    classify(edgeReference, [5, 1, 0]),
    { referenceId: "topology|1|edge|2", reference: edgeReference, snapKind: "edge", point: [4, 0, 0] }
  );
  const vertexReference = { id: "v1", selectorType: "vertex", pickData: { selectorType: "vertex", center: [1.5, 2.5, 3.5] } };
  assert.deepEqual(
    classify(vertexReference, [0, 0, 0]),
    { referenceId: "v1", reference: vertexReference, snapKind: "vertex", point: [1.5, 2.5, 3.5] }
  );
  const faceReference = { id: "f1", selectorType: "face", pickData: { selectorType: "face", normal: [0, 0, 1], center: [0, 0, 0] } };
  assert.deepEqual(
    classify(faceReference, [2, 2, 0]),
    { referenceId: "f1", reference: faceReference, snapKind: "face", point: [2, 2, 0] }
  );
  const freeReference = { id: "p1", selectorType: "occurrence", pickData: { selectorType: "occurrence", name: "part" } };
  assert.deepEqual(
    classify(freeReference, [1, 2, 3]),
    { referenceId: "p1", reference: freeReference, snapKind: "free", point: [1, 2, 3] }
  );
  assert.equal(classify({}, null), null);
  assert.equal(classify({ pickData: { selectorType: "face", normal: [0, 0, 1] } }, null), null);
});

test("classifyMeasurePick keeps world-space coordinates for transformed references", () => {
  const baseEdge = [[0, 0, 0], [4, 0, 0]];
  const worldEdge = baseEdge.map((point) => {
    const rotated = [-point[1], point[0], point[2]];
    return [rotated[0] + 10, rotated[1] + 20, rotated[2] - 5];
  });
  const reference = {
    id: "world-edge",
    selectorType: "edge",
    pickData: { selectorType: "edge", points: worldEdge }
  };
  const result = classifyMeasurePick({
    reference,
    hitPoint: [10, 22, -5],
    referenceId: "world-edge"
  });
  assert.deepEqual(result.point, [10, 22, -5]);
  assert.equal(result.snapKind, "edge");
  assert.equal(result.reference, reference);
});

test("classifyMeasurePick keeps float precision in hit coordinates", () => {
  const result = classifyMeasurePick({
    reference: { pickData: { selectorType: "face", normal: [0, 0, 1] } },
    hitPoint: [1.2345678, -2.3456789, 3.4567891]
  });
  assert.deepEqual(result.point, [1.2345678, -2.3456789, 3.4567891]);
  assert.equal(result.snapKind, "face");
});

test("classifyMeasurePick rejects non-finite hit points for free/face picks", () => {
  assert.equal(classifyMeasurePick({ hitPoint: [NaN, 0, 0] }), null);
  assert.equal(classifyMeasurePick({ hitPoint: [0, 0] }), null);
});

test("formatMeasurement renders the preferred distance with units and precision", () => {
  assert.equal(formatMeasurement({ euclidean: 12.345, perpendicular: null, unit: "mm" }), "12.35 mm");
  assert.equal(formatMeasurement({ euclidean: 5, perpendicular: 2.5, unit: "mm" }), "2.50 mm");
  assert.equal(formatMeasurement({ euclidean: 10, perpendicular: 10, unit: "mm" }, { precision: 0 }), "10 mm");
  assert.equal(formatMeasurement(null), "");
  assert.equal(formatMeasurement({ euclidean: NaN }), "");
});
test("formatMeasurementDelta renders per-axis deltas with units-free labels", () => {
  assert.equal(
    formatMeasurementDelta({ delta: [1.234, -5.5, 0] }),
    "ΔX 1.23  ΔY -5.50  ΔZ 0.00"
  );
  assert.equal(
    formatMeasurementDelta({ delta: [10, 20, 30] }, { precision: 0 }),
    "ΔX 10  ΔY 20  ΔZ 30"
  );
});

test("formatMeasurementDelta normalizes negative zero components", () => {
  assert.equal(formatMeasurementDelta({ delta: [-0.0001, 0, -0] }), "ΔX 0.00  ΔY 0.00  ΔZ 0.00");
  assert.equal(formatMeasurementDelta({ delta: [0, 0, 0] }), "ΔX 0.00  ΔY 0.00  ΔZ 0.00");
});

test("formatMeasurementDelta rejects invalid deltas", () => {
  assert.equal(formatMeasurementDelta(null), "");
  assert.equal(formatMeasurementDelta({}), "");
  assert.equal(formatMeasurementDelta({ delta: null }), "");
  assert.equal(formatMeasurementDelta({ delta: [1, 2] }), "");
  assert.equal(formatMeasurementDelta({ delta: [NaN, 0, 0] }), "");
});
