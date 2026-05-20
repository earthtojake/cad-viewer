import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import {
  normalizeStepModuleDefinition,
  normalizeStepModuleParameterValues,
  resolveStepModuleFeatures
} from "./stepModule.js";
import {
  normalizeStepModuleRenderParams,
  stepModuleRenderFrameProgress,
  stepModuleRenderFrameValues
} from "../../common/stepModuleParams.js";
import {
  createStepModuleEffectsApi,
  displayTransformForPart
} from "../../common/stepModuleEffects.js";

test("STEP modules normalize controls, defaults, and animation metadata", () => {
  const definition = normalizeStepModuleDefinition({
    manifest: {
      schemaVersion: 1,
      parameters: {
        open: { type: "number", min: 0, max: 90, default: 120 },
        visible: { type: "boolean", default: true },
        color: { type: "color", default: "#f97316" },
        mode: { type: "select", options: ["mesh", "ghost"], default: "ghost" }
      },
      animations: {
        spin: { duration: 3, loop: false }
      }
    }
  });

  assert.deepEqual(definition.defaultParameterValues, {
    open: 90,
    visible: true,
    color: "#f97316",
    mode: "ghost"
  });
  assert.equal(definition.parameters[3].type, "enum");
  assert.equal(definition.animations[0].duration, 3);
  assert.equal(definition.animations[0].loop, false);
  assert.deepEqual(normalizeStepModuleParameterValues(definition, {
    open: -5,
    visible: false,
    color: "orange",
    mode: "unknown"
  }), {
    open: 0,
    visible: false,
    color: "#ffffff",
    mode: "mesh"
  });
});

test("STEP module features resolve CAD occurrence refs to render part ids and bounds", () => {
  const definition = normalizeStepModuleDefinition({
    manifest: {
      schemaVersion: 1,
      features: {
        planet: {
          ref: "@cad[models/fun/planetary_gear_assembly#o1.4]"
        }
      }
    }
  });
  const features = resolveStepModuleFeatures(definition, {
    meshData: {
      parts: [
        {
          id: "o1.4.1",
          occurrenceId: "o1.4.1",
          bounds: { min: [20, -10, 0], max: [60, 10, 8] }
        }
      ]
    }
  });

  assert.deepEqual(features.planet.partIds, ["o1.4.1"]);
  assert.deepEqual(features.planet.center, [40, 0, 4]);
  assert.equal(features.planet.missing, false);
});

test("STEP module local feature refs resolve against the sidecar parent CAD path", () => {
  const definition = normalizeStepModuleDefinition({
    manifest: {
      schemaVersion: 1,
      features: {
        lid: {
          ref: "#o1.2"
        },
        hinges: {
          ref: "@cad[#o1.3,o1.4]"
        },
        latch: {
          selectors: ["o1.5"]
        }
      }
    }
  }, {
    url: "/models/mechanisms/.box.step.js?v=abc",
    cadPath: "models/mechanisms/box"
  });

  assert.equal(definition.cadPath, "models/mechanisms/box");
  assert.equal(definition.features[0].ref, "@cad[models/mechanisms/box#o1.2]");
  assert.equal(definition.features[1].ref, "@cad[models/mechanisms/box#o1.3,o1.4]");
  assert.equal(definition.features[2].ref, "@cad[models/mechanisms/box#o1.5]");
});

test("STEP module CAD path can be inferred from sidecar URL", () => {
  const definition = normalizeStepModuleDefinition({
    manifest: {
      schemaVersion: 1,
      features: {
        lid: {
          ref: "#o1.2"
        }
      }
    }
  }, {
    url: "/models/fun/.gearbox.step.js?v=abc"
  });

  assert.equal(definition.cadPath, "models/fun/gearbox");
  assert.equal(definition.features[0].ref, "@cad[models/fun/gearbox#o1.2]");
});

test("STEP module display transforms respect baked assembly part transforms", () => {
  const transform = [
    1, 0, 0, 12,
    0, 1, 0, 34,
    0, 0, 1, 56,
    0, 0, 0, 1
  ];
  const part = { id: "o1.2", transform };

  assert.equal(displayTransformForPart({ partTransformsBaked: true }, part, true), null);
  assert.equal(displayTransformForPart({}, part, false), null);
  assert.deepEqual(displayTransformForPart({}, part, true), transform);
});

test("STEP module effects report only non-identity transforms", () => {
  const effectsByPartId = new Map();
  const transforms = [];
  const effects = createStepModuleEffectsApi(THREE, {
    meshData: {
      parts: [{ id: "arm", occurrenceId: "arm" }]
    },
    features: {
      arm: { partIds: ["arm"] }
    },
    runtime: { displayRecords: [] },
    effectsByPartId,
    onTransformEffect: (event) => transforms.push(event)
  });

  effects.transform("arm", { translate: [0, 0, 0] });
  assert.equal(transforms.length, 0);

  effects.transform("arm", { translate: [2, 0, 0] });
  assert.equal(transforms.length, 1);
  assert.deepEqual(transforms[0].partIds, ["arm"]);
  assert.ok(effectsByPartId.get("arm").matrix instanceof THREE.Matrix4);
});

test("STEP render params normalize static values and animated numeric ranges", () => {
  const definition = normalizeStepModuleDefinition({
    manifest: {
      schemaVersion: 1,
      parameters: {
        drive: { type: "number", min: 0, max: 360, default: 0 },
        visible: { type: "boolean", default: true },
        mode: { type: "select", options: ["mesh", "ghost"], default: "mesh" }
      }
    }
  });
  const params = normalizeStepModuleRenderParams(definition, {
    values: {
      visible: false,
      mode: "ghost"
    },
    animate: {
      drive: { from: 0, to: 360 }
    },
    durationSeconds: 2,
    fps: 4
  });

  assert.equal(params.animated, true);
  assert.equal(params.frameCount, 8);
  assert.deepEqual(stepModuleRenderFrameValues(definition, params, 0), {
    drive: 0,
    visible: false,
    mode: "ghost"
  });
  assert.deepEqual(stepModuleRenderFrameValues(definition, params, 4), {
    drive: 180,
    visible: false,
    mode: "ghost"
  });
  assert.equal(stepModuleRenderFrameProgress(params, 7), 7 / 8);
});

test("non-looping STEP render params include the final animated endpoint", () => {
  const definition = normalizeStepModuleDefinition({
    manifest: {
      schemaVersion: 1,
      parameters: {
        drive: { type: "number", min: 0, max: 360, default: 0 }
      }
    }
  });
  const params = normalizeStepModuleRenderParams(definition, {
    animate: {
      drive: { from: 0, to: 360 }
    },
    durationSeconds: 1,
    fps: 4,
    loop: false
  });

  assert.equal(params.frameCount, 4);
  assert.equal(stepModuleRenderFrameProgress(params, 3), 1);
  assert.deepEqual(stepModuleRenderFrameValues(definition, params, 3), {
    drive: 360
  });
});

test("STEP render params reject unknown ids and non-number animation ranges", () => {
  const definition = normalizeStepModuleDefinition({
    manifest: {
      schemaVersion: 1,
      parameters: {
        drive: { type: "number", min: 0, max: 360, default: 0 },
        visible: { type: "boolean", default: true }
      }
    }
  });

  assert.throws(
    () => normalizeStepModuleRenderParams(definition, { missing: 1 }),
    /Unknown STEP module parameter/
  );
  assert.throws(
    () => normalizeStepModuleRenderParams(definition, {
      animate: {
        visible: { from: 0, to: 1 }
      }
    }),
    /must be numeric/
  );
});
