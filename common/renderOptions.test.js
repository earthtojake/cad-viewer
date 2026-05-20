import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import {
  cloneThemeSettings,
  normalizeThemeSettings
} from "./themeSettings.js";
import {
  createSharedRenderOptions,
  RENDER_SCENE_SCALE,
  boundsFromVertices,
  centerAndRadiusFromBounds,
  fitOrthographicCamera,
  frameHalfHeightForView,
  framePadding,
  inferRenderSceneScale,
  outputSize,
  resolveRenderView,
  resolveThemeJobConfig,
  resolveThemeSettings
} from "./renderOptions.js";

const SCALE_SETTINGS = Object.freeze({
  [RENDER_SCENE_SCALE.CAD]: Object.freeze({
    minBoundsSpan: 1,
    minModelRadius: 1,
    minFloorSize: 100,
    minCameraDistance: 10,
    minCameraFar: 1000
  }),
  [RENDER_SCENE_SCALE.URDF]: Object.freeze({
    minBoundsSpan: 0.05,
    minModelRadius: 0.05,
    minFloorSize: 0.05,
    minCameraDistance: 0.5,
    minCameraFar: 10
  })
});

function assertClose(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !== ${expected}`);
}

test("shared render options preserve explicit caller-owned values without defaults", () => {
  const options = createSharedRenderOptions({
    displayMode: "wireframe",
    background: false,
    renderScale: 0
  });

  assert.equal(options.themeSettings, null);
  assert.equal(Object.hasOwn(options, "displayMode"), false);
  assert.equal(options.background, false);
  assert.equal(options.renderScale, 0);
});

test("theme resolution uses only explicit theme inputs and the caller-provided default", () => {
  assert.deepEqual(
    resolveThemeSettings({}, { defaultThemeId: "technical" }),
    normalizeThemeSettings(cloneThemeSettings("technical"))
  );
  assert.deepEqual(
    resolveThemeSettings({ theme: "dark" }, { defaultThemeId: "technical" }),
    normalizeThemeSettings(cloneThemeSettings("dark"))
  );
  assert.deepEqual(
    resolveThemeJobConfig({
      theme: {
        id: "inline",
        settings: { materials: { defaultColor: "#123456" } }
      }
    }, { defaultThemeId: "technical" }),
    {
      id: "inline",
      settings: { materials: { defaultColor: "#123456" } }
    }
  );
});

test("view presets and azimuth/elevation camera parsing remain stable", () => {
  const top = resolveRenderView("top");
  assert.equal(top.name, "top");
  assert.deepEqual(top.direction, [0, 0, 1]);
  assert.deepEqual(top.up, [0, 1, 0]);

  const custom = resolveRenderView("45:30");
  assert.equal(custom.name, "45:30");
  assertClose(custom.direction[0], Math.SQRT1_2 * Math.cos(Math.PI / 6));
  assertClose(custom.direction[1], -Math.SQRT1_2 * Math.cos(Math.PI / 6));
  assertClose(custom.direction[2], 0.5);
});

test("scene scale inference, bounds, and camera framing are policy-free helpers", () => {
  assert.equal(inferRenderSceneScale({ explicit: "urdf" }), RENDER_SCENE_SCALE.URDF);
  assert.equal(inferRenderSceneScale({ kind: "sdf" }), RENDER_SCENE_SCALE.URDF);
  assert.equal(inferRenderSceneScale({ parts: [{ linkName: "base_link" }] }), RENDER_SCENE_SCALE.URDF);
  assert.equal(inferRenderSceneScale({ kind: "glb", parts: [] }), RENDER_SCENE_SCALE.CAD);

  const bounds = boundsFromVertices(new Float32Array([0, 0, 0, 2, 4, 6]));
  assert.deepEqual(bounds, { min: [0, 0, 0], max: [2, 4, 6] });

  const { center, radius } = centerAndRadiusFromBounds(bounds, RENDER_SCENE_SCALE.CAD, SCALE_SETTINGS);
  assert.deepEqual(center.toArray(), [1, 2, 3]);
  assertClose(radius, Math.sqrt(56) / 2);

  const view = resolveRenderView("iso");
  const halfHeight = frameHalfHeightForView(view, bounds, 800, 600, 0.12, RENDER_SCENE_SCALE.CAD, SCALE_SETTINGS);
  assert.ok(halfHeight > 0);

  const camera = new THREE.OrthographicCamera();
  fitOrthographicCamera(camera, view, bounds, 800, 600, {
    padding: 0.12,
    sceneScale: RENDER_SCENE_SCALE.CAD,
    settingsByScale: SCALE_SETTINGS
  });
  assertClose(camera.top, halfHeight);
  assertClose(camera.bottom, -halfHeight);
  assertClose(camera.left, -halfHeight * (800 / 600));
  assertClose(camera.right, halfHeight * (800 / 600));
  assert.equal(camera.near, 0.01);
  assert.equal(camera.far >= 1000, true);
});

test("output sizing and padding helpers preserve snapshot fallback semantics", () => {
  assert.deepEqual(outputSize({}, {}), { width: 1400, height: 900 });
  assert.deepEqual(outputSize({ width: 320, height: 240 }, { width: 1400, height: 900 }), { width: 320, height: 240 });
  assert.deepEqual(outputSize({}, { width: 1600, height: 1200 }), { width: 1600, height: 1200 });
  assert.equal(framePadding({ render: { padding: 0.02 } }), 0.1);
  assert.equal(framePadding({ paddingPercent: 0.25 }), 0.15);
  assert.equal(framePadding({ render: { paddingPercent: 0.13 } }), 0.13);
});
