import assert from "node:assert/strict";
import test from "node:test";

import { screenLimitedPickThreshold, worldUnitsPerPixelAtDistance } from "cadjs/lib/viewer/pickingThresholds.js";
import {
  classifyMeasurePick,
  measurementFromPicks
} from "cadjs/lib/viewer/measurement.js";
import {
  createViewerContextMenuGestureState,
  VIEWER_CONTEXT_MENU_SUPPRESSION_MS
} from "./viewerContextMenuGesture.js";
import {
  measureHitPointFromWorldIntersection,
  measurePickForPosition
} from "./useViewerPicking.js";
import { partIdFromIntersection, shouldRaycastRecordForPick } from "./partPicking.js";

test("worldUnitsPerPixelAtDistance converts perspective depth to screen scale", () => {
  const camera = {
    isPerspectiveCamera: true,
    fov: 60
  };
  const unitsPerPixel = worldUnitsPerPixelAtDistance(camera, 600, 300);
  assert.ok(Number.isFinite(unitsPerPixel));
  assert.ok(Math.abs(unitsPerPixel - 0.5773502691896257) < 1e-9);
});

test("screenLimitedPickThreshold preserves the base threshold until zoom would make it too wide on screen", () => {
  const camera = {
    isPerspectiveCamera: true,
    fov: 60
  };
  const farThreshold = screenLimitedPickThreshold({
    baseThreshold: 1.5,
    thresholdScale: 1,
    maxScreenDistancePx: 10,
    camera,
    viewportHeightPx: 600,
    distance: 300
  });
  const nearThreshold = screenLimitedPickThreshold({
    baseThreshold: 1.5,
    thresholdScale: 1,
    maxScreenDistancePx: 10,
    camera,
    viewportHeightPx: 600,
    distance: 30
  });

  assert.equal(farThreshold, 1.5);
  assert.ok(nearThreshold < farThreshold);
  assert.ok(Math.abs(nearThreshold - 0.5773502691896257) < 1e-9);
});

test("screenLimitedPickThreshold falls back to the scaled base threshold when screen scaling is unavailable", () => {
  const threshold = screenLimitedPickThreshold({
    baseThreshold: 0.9,
    thresholdScale: 0.5,
    maxScreenDistancePx: 5,
    camera: null,
    viewportHeightPx: 600,
    distance: 30
  });
  assert.equal(threshold, 0.45);
});

test("viewer context menu gesture suppression blocks one menu event", () => {
  let time = 1000;
  const gesture = createViewerContextMenuGestureState({
    now: () => time
  });

  gesture.suppressNextContextMenu();
  assert.equal(gesture.isSuppressed(), true);
  assert.equal(gesture.consumeSuppression(), true);
  assert.equal(gesture.isSuppressed(), false);
  assert.equal(gesture.consumeSuppression(), false);
});

test("viewer context menu gesture suppression expires", () => {
  let time = 2000;
  const gesture = createViewerContextMenuGestureState({
    now: () => time
  });

  gesture.suppressNextContextMenu();
  assert.equal(gesture.isSuppressed(), true);

  time += VIEWER_CONTEXT_MENU_SUPPRESSION_MS + 1;

  assert.equal(gesture.isSuppressed(), false);
  assert.equal(gesture.consumeSuppression(), false);
});

test("measure hit point stays in world space and never converts through the mesh local frame", () => {
  const intersection = {
    point: { x: 3.25, y: -4.5, z: 10.75 },
    object: {
      worldToLocal() {
        throw new Error("worldToLocal must not be called for measure hits");
      }
    }
  };
  assert.deepEqual(measureHitPointFromWorldIntersection(intersection), [3.25, -4.5, 10.75]);
  assert.equal(measureHitPointFromWorldIntersection({ point: { x: NaN, y: 0, z: 0 } }), null);
  assert.equal(measureHitPointFromWorldIntersection({}), null);
  assert.equal(measureHitPointFromWorldIntersection(null), null);
});

test("measure picks snap onto transformed world-space references with world-space hits", () => {
  const baseEdge = [[0, 0, 0], [4, 0, 0]];
  const worldEdge = baseEdge.map(([x, y, z]) => [-y + 10, x + 20, z - 5]);
  const reference = {
    id: "topology|1|edge|2",
    selectorType: "edge",
    pickData: { selectorType: "edge", points: worldEdge }
  };
  const pick = measurePickForPosition({
    reference,
    worldHitPoint: [10, 22, -5],
    referenceId: "topology|1|edge|2",
    bypassTopology: false
  });
  assert.deepEqual(pick, {
    referenceId: "topology|1|edge|2",
    reference,
    snapKind: "edge",
    point: [10, 22, -5]
  });
});

test("shift bypasses topology and classifies the tap as a free point", () => {
  const reference = {
    id: "topology|1|face|3",
    selectorType: "face",
    pickData: { selectorType: "face", surfaceType: "plane", normal: [0, 0, 1] }
  };
  const pick = measurePickForPosition({
    reference,
    worldHitPoint: [1, 2, 3],
    referenceId: "topology|1|face|3",
    bypassTopology: true
  });
  assert.deepEqual(pick, {
    referenceId: "",
    reference: null,
    snapKind: "free",
    point: [1, 2, 3]
  });
});

test("measure taps without a reference classify the surface point as free", () => {
  const pick = measurePickForPosition({
    reference: null,
    worldHitPoint: [0.5, 2, -2.25],
    referenceId: "",
    bypassTopology: false
  });
  assert.deepEqual(pick, {
    referenceId: "",
    reference: null,
    snapKind: "free",
    point: [0.5, 2, -2.25]
  });
  assert.equal(measurePickForPosition({ reference: null, worldHitPoint: null }), null);
});

test("measure clicks on empty space produce no pick", () => {
  const emptyHit = measurePickForPosition({
    reference: null,
    worldHitPoint: null,
    referenceId: "",
    bypassTopology: false
  });
  assert.equal(emptyHit, null);
  assert.equal(
    measurePickForPosition({
      reference: null,
      worldHitPoint: null,
      referenceId: "",
      bypassTopology: true
    }),
    null
  );
});

test("measure tap payload keeps the resolved reference for face-to-face distance", () => {
  const faceReference = {
    id: "topology|1|face|3",
    selectorType: "face",
    pickData: {
      selectorType: "face",
      surfaceType: "plane",
      normal: [0, 0, 1],
      center: [0, 0, 2]
    }
  };
  const pickA = measurePickForPosition({
    reference: faceReference,
    worldHitPoint: [0, 0, 2],
    referenceId: faceReference.id
  });
  assert.equal(pickA.snapKind, "face");
  assert.equal(pickA.reference, faceReference);

  const pickB = classifyMeasurePick({
    reference: faceReference,
    hitPoint: [0, 0, 7],
    referenceId: faceReference.id
  });
  const measurement = measurementFromPicks(pickA, pickB);
  assert.equal(measurement.perpendicular, 5);
  assert.equal(measurement.euclidean, 5);
});


test("partIdFromIntersection reads a per-occurrence mesh's partId", () => {
  const hit = { object: { userData: { partId: "o1.5" } } };
  assert.equal(partIdFromIntersection(hit), "o1.5");
});

test("partIdFromIntersection returns the mesh's userData.partId, else null", () => {
  assert.equal(partIdFromIntersection({ object: { userData: { partId: "o1.2" } } }), "o1.2");
  assert.equal(partIdFromIntersection({ object: { userData: {} } }), null);
  assert.equal(partIdFromIntersection({}), null);
});

test("shouldRaycastRecordForPick applies bucket-level focus/hidden to per-mesh records", () => {
  const focusIds = new Set(["o1.5"]);
  // in focus -> kept; out of focus -> dropped
  assert.equal(shouldRaycastRecordForPick({ mesh: { visible: true }, partId: "o1.5" }, { focusIds, hiddenIds: new Set() }), true);
  assert.equal(shouldRaycastRecordForPick({ mesh: { visible: true }, partId: "o1.9" }, { focusIds, hiddenIds: new Set() }), false);
  // hidden -> dropped even with no focus
  assert.equal(
    shouldRaycastRecordForPick({ mesh: { visible: true }, partId: "o1.5" }, { focusIds: new Set(), hiddenIds: new Set(["o1.5"]) }),
    false
  );
  // invisible -> dropped
  assert.equal(shouldRaycastRecordForPick({ mesh: { visible: false }, partId: "o1.5" }, { focusIds: new Set(), hiddenIds: new Set() }), false);
});
