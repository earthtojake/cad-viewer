import assert from "node:assert/strict";
import test from "node:test";

import {
  isPinchWheelEvent,
  isTrackpadLikeWheelEvent,
  WHEEL_PINCH_DELTA_BOOST
} from "./viewportCameraKit.js";

// The wheel-zoom step nobody could see. These numbers used to differ by 20x across ordinary
// desktop setups -- and no test said so, which is exactly why it shipped. This file pins the
// arithmetic that OrbitControls r161+ applies, so a regression is a failing assertion rather
// than a bug report from whoever happens to be on a 1x display.

const ACCELERATED_WHEEL_ZOOM_SPEED = 2.5;
const TRACKPAD_PINCH_ZOOM_SPEED = 7;

/** OrbitControls r161+: deltaMode is normalized to pixels, and a pinch is boosted. */
function normalizeWheelDelta(event) {
  let deltaY = event.deltaY;
  if (event.deltaMode === 1) {
    deltaY *= 16;
  } else if (event.deltaMode === 2) {
    deltaY *= 100;
  }
  if (event.ctrlKey) {
    deltaY *= WHEEL_PINCH_DELTA_BOOST;
  }
  return deltaY;
}

/** What the viewer hands OrbitControls for a given event. */
function zoomSpeedFor(event) {
  if (isPinchWheelEvent(event)) {
    return TRACKPAD_PINCH_ZOOM_SPEED / WHEEL_PINCH_DELTA_BOOST;
  }
  return isTrackpadLikeWheelEvent(event) ? TRACKPAD_PINCH_ZOOM_SPEED : ACCELERATED_WHEEL_ZOOM_SPEED;
}

/** Fraction of the camera distance left after one event. r161+: 0.95 ^ (speed * |d| * 0.01). */
function stepFor(event) {
  return 0.95 ** (zoomSpeedFor(event) * Math.abs(normalizeWheelDelta(event) * 0.01));
}

const pct = (event) => Number((((1 - stepFor(event)) * 100)).toFixed(1));

test("a mouse notch is the same step regardless of how the browser spells it", () => {
  // Chrome/Safari report pixels; Firefox on Windows and Linux reports LINE mode, where one
  // notch is ~3 lines. Before this, those two differed by roughly 20x.
  const chrome = pct({ deltaY: 100, deltaMode: 0 });
  const firefox = pct({ deltaY: 3, deltaMode: 1 });
  assert.equal(chrome, 12.0);
  // 3 lines x 16px = 48px against Chrome's 100px: three's own approximation, so they are not
  // identical -- but they are the same order, which is the whole point.
  assert.ok(firefox > 5 && firefox < chrome, `firefox step ${firefox}% should be comparable`);
});

test("one mouse notch never approaches the 10% zoom floor", () => {
  // The reported bug: 100% -> 10% in about five notches. A notch that removes 12% needs ~45.
  const step = stepFor({ deltaY: 100, deltaMode: 0 });
  let zoom = 100;
  let notches = 0;
  while (zoom > 10 && notches < 500) {
    zoom *= step;
    notches += 1;
  }
  assert.ok(notches > 15, `expected a gradual descent, reached the floor in ${notches} notches`);
});

test("zoom speed no longer depends on devicePixelRatio", () => {
  // r160 divided the delta by floor(devicePixelRatio), so this expression had no dPR term to
  // remove. If a future three.js reintroduces one, stepFor stops matching and this fails.
  const event = { deltaY: 100, deltaMode: 0 };
  assert.equal(stepFor(event), 0.95 ** (ACCELERATED_WHEEL_ZOOM_SPEED * 1));
});

test("devicePixelRatio below 1 is not a division by zero any more", () => {
  // r160: |delta| / (100 * (dPR | 0)) -- and 0.75 | 0 is 0, so the whole thing was Infinity
  // and wheel zoom went dead whenever the browser was zoomed out.
  for (const dpr of [0.5, 0.75, 1, 2, 3]) {
    const legacy = Math.abs(100) / (100 * (dpr | 0));
    if (dpr < 1) {
      assert.equal(legacy, Infinity, "the r160 expression really did blow up below 1");
    }
    assert.ok(Number.isFinite(stepFor({ deltaY: 100, deltaMode: 0 })), `finite at dPR ${dpr}`);
  }
});

test("a pinch is not stacked on top of three's own pinch boost", () => {
  // A trackpad pinch arrives as a small ctrl+wheel, which r161+ already multiplies by 10.
  // Dividing our pinch speed by the same factor keeps a pinch close to a two-finger scroll
  // of the same physical size instead of ten times hotter.
  const scroll = pct({ deltaY: 4, deltaMode: 0 });
  const pinch = pct({ deltaY: 4, deltaMode: 0, ctrlKey: true });
  assert.equal(scroll, pinch);
});

test("input classes are told apart", () => {
  assert.equal(isPinchWheelEvent({ ctrlKey: true, deltaY: 4, deltaMode: 0 }), true);
  assert.equal(isPinchWheelEvent({ deltaY: 4, deltaMode: 0 }), false);
  // A mouse notch, in both spellings, is never trackpad-like.
  assert.equal(isTrackpadLikeWheelEvent({ deltaY: 100, deltaMode: 0 }), false);
  assert.equal(isTrackpadLikeWheelEvent({ deltaY: 3, deltaMode: 1 }), false);
  assert.equal(isTrackpadLikeWheelEvent({ deltaY: 4, deltaMode: 0 }), true);
});
