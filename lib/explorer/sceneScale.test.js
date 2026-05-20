import assert from "node:assert/strict";
import test from "node:test";

import {
  clampSceneModelRadius,
  defaultSceneGridRadius,
  getLightingScopeRadius,
  getShadowCameraSettings,
  getSceneScaleSettings,
  normalizeSceneScaleMode,
  EXPLORER_SCENE_SCALE
} from "./sceneScale.js";

test("CAD scenes keep the existing large minimum framing scale", () => {
  assert.equal(normalizeSceneScaleMode("anything-else"), EXPLORER_SCENE_SCALE.CAD);
  assert.equal(clampSceneModelRadius(0.14, EXPLORER_SCENE_SCALE.CAD), 1);
  assert.equal(defaultSceneGridRadius(EXPLORER_SCENE_SCALE.CAD), 140);
  assert.equal(getLightingScopeRadius(EXPLORER_SCENE_SCALE.CAD), 140);
  assert.deepEqual(getSceneScaleSettings(EXPLORER_SCENE_SCALE.CAD), {
    minModelRadius: 1,
    minGridSize: 280,
    lightingScopeRadius: 140
  });
});

test("URDF scenes use meter-appropriate framing minimums with CAD lighting scope", () => {
  assert.equal(normalizeSceneScaleMode(EXPLORER_SCENE_SCALE.URDF), EXPLORER_SCENE_SCALE.URDF);
  assert.equal(clampSceneModelRadius(0.14, EXPLORER_SCENE_SCALE.URDF), 0.14);
  assert.equal(clampSceneModelRadius(0.01, EXPLORER_SCENE_SCALE.URDF), 0.05);
  assert.equal(defaultSceneGridRadius(EXPLORER_SCENE_SCALE.URDF), 0.25);
  assert.equal(getLightingScopeRadius(EXPLORER_SCENE_SCALE.URDF), 140);
  assert.deepEqual(getSceneScaleSettings(EXPLORER_SCENE_SCALE.URDF), {
    minModelRadius: 0.05,
    minGridSize: 0.5,
    lightingScopeRadius: 140
  });
});

test("shadow camera settings keep CAD lighting but preserve scene-unit shadow resolution", () => {
  assert.deepEqual(getShadowCameraSettings(EXPLORER_SCENE_SCALE.CAD, {
    radius: 100,
    keyLightDistance: 420
  }), {
    scopeRadius: 100,
    extent: 280,
    far: 800,
    normalBias: 0.012,
    radius: 14
  });

  assert.deepEqual(getShadowCameraSettings(EXPLORER_SCENE_SCALE.URDF, {
    radius: 0.1,
    keyLightDistance: 420
  }), {
    scopeRadius: 0.1,
    extent: 0.55,
    far: 421.6,
    normalBias: 0.000012,
    radius: 14
  });
});
