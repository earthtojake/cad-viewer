import assert from "node:assert/strict";
import test from "node:test";

import {
  annotatePerspectiveSnapshot,
  perspectiveSnapshotMatchesScene,
  resolvePerspectiveSnapshot
} from "./perspective.js";

const PERSPECTIVE_A = Object.freeze({
  position: [10, 20, 30],
  target: [1, 2, 3],
  up: [0, 1, 0]
});

const PERSPECTIVE_B = Object.freeze({
  position: [40, 50, 60],
  target: [4, 5, 6],
  up: [0, 0, 1]
});

test("resolvePerspectiveSnapshot uses the fallback only when the primary value is undefined", () => {
  assert.deepEqual(resolvePerspectiveSnapshot(undefined, PERSPECTIVE_A), PERSPECTIVE_A);
  assert.equal(resolvePerspectiveSnapshot(null, PERSPECTIVE_A), null);
  assert.deepEqual(resolvePerspectiveSnapshot(PERSPECTIVE_B, PERSPECTIVE_A), PERSPECTIVE_B);
});

test("perspective snapshots only match the scene they were captured from", () => {
  const taggedSnapshot = annotatePerspectiveSnapshot(PERSPECTIVE_A, {
    modelKey: "sample_robot.urdf",
    sceneScaleMode: "urdf",
    coordinateSystem: "cad-z-up-v1"
  });

  assert.deepEqual(taggedSnapshot, {
    ...PERSPECTIVE_A,
    modelKey: "sample_robot.urdf",
    sceneScaleMode: "urdf",
    coordinateSystem: "cad-z-up-v1"
  });
  assert.equal(
    perspectiveSnapshotMatchesScene(taggedSnapshot, {
      modelKey: "sample_robot.urdf",
      sceneScaleMode: "urdf",
      coordinateSystem: "cad-z-up-v1"
    }),
    true
  );
  assert.equal(
    perspectiveSnapshotMatchesScene(taggedSnapshot, {
      modelKey: "sample_robot",
      sceneScaleMode: "cad"
    }),
    false
  );
  assert.equal(
    perspectiveSnapshotMatchesScene(taggedSnapshot, {
      modelKey: "sample_robot.urdf",
      sceneScaleMode: "urdf",
      coordinateSystem: "cad-y-up-v1"
    }),
    false
  );
  assert.equal(
    perspectiveSnapshotMatchesScene(PERSPECTIVE_A, {
      modelKey: "sample_robot.urdf",
      coordinateSystem: "cad-z-up-v1"
    }),
    false
  );
});
