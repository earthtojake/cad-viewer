import assert from "node:assert/strict";
import test from "node:test";

import {
  MEASURE_LINE_DRAFT_ID,
  clampMeasureChipPosition,
  createMeasureLineSegments,
  layoutMeasureChipPositions,
  measureDimensionSegments,
  measureRulerLineSegments,
  midpointOfPoints
} from "./measureLines.js";

const PICK_A = { point: [0, 0, 0] };
const PICK_B = { point: [3, 4, 0] };

test("measureRulerLineSegments returns an offset dimension construction", () => {
  const segments = measureRulerLineSegments({
    measurements: [
      { id: "m1", pickA: PICK_A, pickB: PICK_B, measurement: { euclidean: 5 } }
    ]
  });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].id, "m1");
  assert.equal(segments[0].committed, true);
  assert.equal(segments[0].segments.length, 5);
  assert.notDeepEqual(segments[0].segments[2], [PICK_A, PICK_B]);
  assert.ok(Array.isArray(segments[0].labelPoint));
});

test("measureRulerLineSegments includes a draft dimension construction", () => {
  const segments = measureRulerLineSegments({
    draft: { anchor: PICK_A, hover: PICK_B },
    measurements: []
  });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].id, MEASURE_LINE_DRAFT_ID);
  assert.equal(segments[0].committed, false);
  assert.equal(segments[0].segments.length, 5);
});

test("measureRulerLineSegments skips malformed entries", () => {
  const segments = measureRulerLineSegments({
    measurements: [
      { id: "bad", pickA: null, pickB: PICK_B, measurement: { euclidean: 1 } },
      { id: "bad2", pickA: PICK_A, pickB: { point: [NaN, 0, 0] }, measurement: { euclidean: 1 } }
    ],
    draft: { anchor: null, hover: PICK_B }
  });
  assert.deepEqual(segments, []);
});

test("measureRulerLineSegments returns an empty list without state", () => {
  assert.deepEqual(measureRulerLineSegments(null), []);
  assert.deepEqual(measureRulerLineSegments({}), []);
});

test("midpointOfPoints averages finite point pairs", () => {
  assert.deepEqual(midpointOfPoints([0, 0, 0], [2, 4, 6]), [1, 2, 3]);
  assert.equal(midpointOfPoints(null, [1, 2, 3]), null);
  assert.equal(midpointOfPoints([0, 0, 0], [1, 2]), null);
});

test("clampMeasureChipPosition keeps chips inside the viewport", () => {
  const clamped = clampMeasureChipPosition({ x: -50, y: 500 }, { width: 400, height: 300 }, { width: 100, height: 40 });
  assert.equal(clamped.x, 50);
  assert.equal(clamped.y, 300 - 20);
  assert.deepEqual(clampMeasureChipPosition({ x: 200, y: 150 }, { width: 400, height: 300 }, { width: 100, height: 40 }), { x: 200, y: 150 });
});

test("clampMeasureChipPosition rejects invalid inputs", () => {
  assert.equal(clampMeasureChipPosition(null, { width: 400, height: 300 }), null);
  assert.equal(clampMeasureChipPosition({ x: 1, y: 1 }, null), null);
  assert.equal(clampMeasureChipPosition({ x: 1, y: 1 }, { width: 0, height: 300 }), null);
});

test("layoutMeasureChipPositions separates overlapping labels", () => {
  const chips = layoutMeasureChipPositions([
    { id: "a", x: 200, y: 100 },
    { id: "b", x: 200, y: 100 }
  ], { width: 500, height: 400 });
  assert.equal(chips.length, 2);
  assert.notEqual(chips[0].y, chips[1].y);
});

test("measureDimensionSegments uses the face normal for perpendicular labels", () => {
  const reference = { pickData: { normal: [0, 0, 1] } };
  const dimension = measureDimensionSegments(
    { point: [0, 0, 0], reference },
    { point: [4, 3, 5], reference },
    { perpendicular: 5 }
  );
  assert.deepEqual(dimension.start, [0, 0, 0]);
  assert.deepEqual(dimension.end, [0, 0, 5]);
  assert.equal(dimension.segments.length, 5);
});

test("createMeasureLineSegments tolerates runtimes without three line primitives", () => {
  assert.deepEqual(createMeasureLineSegments({}, null), { committed: null, draft: null });
  assert.deepEqual(
    createMeasureLineSegments({ THREE: {} }, { measurements: [], draft: null }),
    { committed: null, draft: null }
  );
});
