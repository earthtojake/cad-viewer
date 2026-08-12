import assert from "node:assert/strict";
import test from "node:test";

import {
  MEASURE_RULER_MAX_MEASUREMENTS,
  applyMeasureRulerDelete,
  applyMeasureRulerHover,
  applyMeasureRulerPick,
  measureRulerDraftMeasurement,
  measureRulerStateForChange,
  resetMeasureRulerState
} from "./measureRulerState.js";

const FIRST_PICK = { point: [0, 0, 0] };
const SECOND_PICK = { point: [3, 4, 0] };

function counterIds() {
  let count = 0;
  return () => {
    count += 1;
    return `m-${count}`;
  };
}

test("measure ruler starts a draft with the first pick", () => {
  const state = applyMeasureRulerPick(null, FIRST_PICK);
  assert.deepEqual(state, {
    draft: { anchor: FIRST_PICK, hover: null },
    measurements: []
  });
});

test("measure ruler commits a measurement with the second pick", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  const state = applyMeasureRulerPick(draft, SECOND_PICK, { createId: counterIds() });
  assert.equal(state.draft, null);
  assert.equal(state.measurements.length, 1);
  assert.equal(state.measurements[0].id, "m-1");
  assert.equal(state.measurements[0].pickA, FIRST_PICK);
  assert.equal(state.measurements[0].pickB, SECOND_PICK);
  assert.equal(state.measurements[0].measurement.euclidean, 5);
});

test("measure ruler accumulates multiple committed measurements", () => {
  const createId = counterIds();
  let state = applyMeasureRulerPick(null, FIRST_PICK, { createId });
  state = applyMeasureRulerPick(state, SECOND_PICK, { createId });
  state = applyMeasureRulerPick(state, SECOND_PICK, { createId });
  state = applyMeasureRulerPick(state, FIRST_PICK, { createId });
  assert.equal(state.measurements.length, 2);
  assert.deepEqual(state.measurements.map((item) => item.id), ["m-1", "m-2"]);
});

test("measure ruler caps the committed collection at the maximum", () => {
  const createId = counterIds();
  let state = null;
  for (let index = 0; index < MEASURE_RULER_MAX_MEASUREMENTS + 3; index += 1) {
    state = applyMeasureRulerPick(state, index % 2 === 0 ? FIRST_PICK : SECOND_PICK, { createId });
    state = applyMeasureRulerPick(state, index % 2 === 0 ? SECOND_PICK : FIRST_PICK, { createId });
  }
  assert.equal(state.measurements.length, MEASURE_RULER_MAX_MEASUREMENTS);
  assert.equal(state.measurements[0].id, "m-4");
  assert.equal(state.measurements[state.measurements.length - 1].id, `m-${MEASURE_RULER_MAX_MEASUREMENTS + 3}`);
});

test("measure ruler ignores invalid picks", () => {
  assert.equal(applyMeasureRulerPick(null, null), null);
  assert.equal(applyMeasureRulerPick(null, { point: null }), null);
  assert.equal(applyMeasureRulerPick(null, { point: [NaN, 0, 0] }), null);
});

test("measure ruler keeps the existing state for invalid picks while drafting", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  assert.equal(applyMeasureRulerPick(draft, null), draft);
});

test("measure ruler stores hover while drafting", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  const hovered = applyMeasureRulerHover(draft, { point: [2, 0, 0] });
  assert.deepEqual(hovered.draft.hover, { point: [2, 0, 0] });
  assert.equal(hovered.draft.anchor, FIRST_PICK);
});

test("measure ruler drops invalid hover", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  const hovered = applyMeasureRulerHover(draft, { point: [2, 0] });
  assert.equal(hovered.draft.hover, null);
});

test("measure ruler ignores hover without a draft", () => {
  const committed = applyMeasureRulerPick(
    applyMeasureRulerPick(null, FIRST_PICK),
    SECOND_PICK
  );
  assert.equal(applyMeasureRulerHover(committed, { point: [1, 1, 1] }), committed);
});

test("measure ruler previews the live draft measurement", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  const hovered = applyMeasureRulerHover(draft, { point: [3, 4, 0] });
  assert.equal(measureRulerDraftMeasurement(hovered).euclidean, 5);
});

test("measure ruler draft preview returns null without a draft or hover", () => {
  assert.equal(measureRulerDraftMeasurement(null), null);
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  assert.equal(measureRulerDraftMeasurement(draft), null);
});

test("measure ruler deletes a committed measurement by id", () => {
  const createId = counterIds();
  let state = applyMeasureRulerPick(null, FIRST_PICK, { createId });
  state = applyMeasureRulerPick(state, SECOND_PICK, { createId });
  state = applyMeasureRulerPick(state, FIRST_PICK, { createId });
  state = applyMeasureRulerPick(state, SECOND_PICK, { createId });
  const deleted = applyMeasureRulerDelete(state, "m-1");
  assert.deepEqual(deleted.measurements.map((item) => item.id), ["m-2"]);
  assert.equal(deleted.draft, null);
});

test("measure ruler delete keeps the draft untouched", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  const deleted = applyMeasureRulerDelete(draft, "m-1");
  assert.equal(deleted, draft);
});

test("measure ruler delete with unknown id returns the state unchanged", () => {
  const createId = counterIds();
  let state = applyMeasureRulerPick(null, FIRST_PICK, { createId });
  state = applyMeasureRulerPick(state, SECOND_PICK, { createId });
  assert.equal(applyMeasureRulerDelete(state, "missing"), state);
});

test("measure ruler survives unrelated state changes", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  assert.equal(measureRulerStateForChange(draft), draft);
});

test("measure ruler clears when the tool deactivates", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  assert.equal(measureRulerStateForChange(draft, { toolActive: false }), null);
});

test("measure ruler clears draft on entry change while keeping committed measurements", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  assert.deepEqual(measureRulerStateForChange(draft, { entryChanged: true }), {
    draft: null,
    measurements: []
  });

  const committed = applyMeasureRulerPick(draft, SECOND_PICK);
  assert.deepEqual(
    measureRulerStateForChange(committed, { entryChanged: true, toolActive: true }),
    { draft: null, measurements: committed.measurements }
  );
});

test("measure ruler entry-change gate stays null without state", () => {
  assert.equal(measureRulerStateForChange(null, { entryChanged: true }), null);
  assert.equal(measureRulerStateForChange(null), null);
});

test("measure ruler reset returns null", () => {
  const draft = applyMeasureRulerPick(null, FIRST_PICK);
  assert.equal(resetMeasureRulerState(draft), null);
});
