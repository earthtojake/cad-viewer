import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import {
  createUrdfPosePickerCellGeometry,
  createUrdfPosePickerCellOutlinePositions,
  createUrdfPosePickerHoverCellMesh,
  createUrdfPosePickerShell,
  createUrdfPosePickerShellGridGeometry,
  intersectUrdfPosePickerShell,
  isValidUrdfPosePickerCell,
  normalizeUrdfPosePickerCenter,
  resolveUrdfPosePickerHoverCell,
  resolveUrdfPosePickerShell,
  syncUrdfPosePickerHoverMesh,
  urdfPosePickerCellForModelPoint,
  urdfPosePickerCellKey,
  URDF_POSE_PICKER_SHELL_HEIGHT_SEGMENTS,
  URDF_POSE_PICKER_SHELL_WIDTH_SEGMENTS
} from "./urdfPosePicker.js";

const EPSILON = 1e-6;

function assertNear(actual, expected, message = "") {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${message} expected ${expected}, received ${actual}`);
}

function createRuntime({
  cameraPosition = [0, 0, 10],
  target = [0, 0, 0],
  modelRadius = 1
} = {}) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(...cameraPosition);
  camera.lookAt(...target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const modelGroup = new THREE.Group();
  modelGroup.updateMatrixWorld(true);

  return {
    THREE,
    camera,
    modelGroup,
    controls: {
      target: new THREE.Vector3(...target)
    },
    modelRadius
  };
}

test("URDF pose picker center and shell resolution preserve viewer sizing rules", () => {
  assert.deepEqual(normalizeUrdfPosePickerCenter({ center: [1, "bad", 3] }), [0, 0, 0]);
  assert.deepEqual(normalizeUrdfPosePickerCenter({ center: [1, 2, 3] }), [1, 2, 3]);

  const runtime = createRuntime({
    cameraPosition: [0, 0, 10],
    target: [2, 3, 4],
    modelRadius: 2
  });
  runtime.modelGroup.position.set(1, 2, 3);
  runtime.modelGroup.updateMatrixWorld(true);

  const shell = resolveUrdfPosePickerShell(runtime, { center: [9, 9, 9] });
  assert.deepEqual(shell.centerLocal, [1, 1, 1]);
  assertNear(shell.centerWorld.x, 2, "center x");
  assertNear(shell.centerWorld.y, 3, "center y");
  assertNear(shell.centerWorld.z, 4, "center z");
  assertNear(shell.radius, Math.sqrt(49) * 0.238, "radius");
});

test("URDF pose picker maps shell intersections to stable spherical cells", () => {
  const runtime = createRuntime();
  const shell = resolveUrdfPosePickerShell(runtime, {});
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1));
  const pick = intersectUrdfPosePickerShell(runtime, {}, ray);

  assert.equal(pick.source, "sphere");
  assertNear(pick.point[0], 0, "pick x");
  assertNear(pick.point[1], 0, "pick y");
  assertNear(pick.point[2], shell.radius, "pick z");
  assert.deepEqual(urdfPosePickerCellForModelPoint(runtime, {}, [-1, 0, 0]), { x: 0, y: 25 });
  assert.equal(urdfPosePickerCellKey({ x: 0, y: 25 }), "0:25");
  assert.equal(isValidUrdfPosePickerCell({ x: 99, y: 49 }), true);
  assert.equal(isValidUrdfPosePickerCell({ x: 100, y: 49 }), false);
});

test("URDF pose picker geometry helpers expose deterministic mesh shapes", () => {
  const runtime = createRuntime();
  const gridGeometry = createUrdfPosePickerShellGridGeometry(THREE);
  assert.equal(
    gridGeometry.getAttribute("position").count,
    ((URDF_POSE_PICKER_SHELL_HEIGHT_SEGMENTS - 1) * URDF_POSE_PICKER_SHELL_WIDTH_SEGMENTS * 2) +
      (URDF_POSE_PICKER_SHELL_WIDTH_SEGMENTS * URDF_POSE_PICKER_SHELL_HEIGHT_SEGMENTS * 2)
  );

  const cell = { x: 25, y: 25 };
  const cellGeometry = createUrdfPosePickerCellGeometry(runtime, cell);
  const outlinePositions = createUrdfPosePickerCellOutlinePositions(runtime, cell);
  assert.equal(cellGeometry.getAttribute("position").count, 6);
  assert.equal(outlinePositions.length, 24);
  assert.equal(createUrdfPosePickerCellGeometry(runtime, { x: -1, y: 0 }), null);
  assert.equal(createUrdfPosePickerCellOutlinePositions(runtime, { x: 0, y: 50 }), null);
});

test("URDF pose picker scene objects update hover visibility and cached cell geometry", () => {
  const runtime = createRuntime();
  runtime.urdfPosePickerPointerNdc = { x: 0, y: 0 };

  const shellObject = createUrdfPosePickerShell(runtime, {});
  assert.equal(shellObject.type, "LineSegments");
  assert.equal(shellObject.userData.disposeGeometry, true);
  assert.equal(shellObject.userData.disposeMaterial, true);

  const hoverCell = resolveUrdfPosePickerHoverCell(runtime, {});
  assert.deepEqual(hoverCell, { x: 25, y: 25 });

  const mesh = createUrdfPosePickerHoverCellMesh(runtime, {});
  assert.equal(mesh.visible, true);
  assert.equal(mesh.userData.lastHoverCellKey, "25:25");

  runtime.urdfPosePickerPointerNdc = null;
  assert.equal(syncUrdfPosePickerHoverMesh(runtime, mesh, {}), false);
  assert.equal(mesh.visible, null);
  assert.equal(mesh.userData.lastHoverCellKey, "");
});
