import assert from "node:assert/strict";
import test from "node:test";

import { screenLimitedPickThreshold, worldUnitsPerPixelAtDistance } from "../../../lib/explorer/pickingThresholds.js";

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
