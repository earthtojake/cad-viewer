import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  buildCadScene,
  CAD_DISPLAY_MODE,
  normalizeDisplayMode
} from "./cadScene.js";
import { cloneThemeSettings } from "./themeSettings.js";

function sampleMeshData() {
  return {
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      2, 0, 0,
      3, 0, 0,
      2, 1, 0
    ]),
    indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]),
    bounds: {
      min: [0, 0, 0],
      max: [3, 1, 0]
    },
    parts: [
      {
        id: "left",
        vertexOffset: 0,
        vertexCount: 3,
        triangleOffset: 0,
        triangleCount: 1,
        bounds: { min: [0, 0, 0], max: [1, 1, 0] }
      },
      {
        id: "right",
        vertexOffset: 3,
        vertexCount: 3,
        triangleOffset: 1,
        triangleCount: 1,
        bounds: { min: [2, 0, 0], max: [3, 1, 0] }
      }
    ]
  };
}

test("buildCadScene renders solid part records and updates theme without rebuilding geometry", () => {
  const theme = cloneThemeSettings("technical");
  const scene = buildCadScene(THREE, sampleMeshData(), {
    theme,
    renderPartsIndividually: true
  });
  const firstMesh = scene.displayRecords[0].mesh;
  const firstGeometry = firstMesh.geometry;

  assert.equal(scene.displayRecords.length, 2);
  assert.equal(scene.displayRecords[0].partId, "left");
  assert.equal(scene.displayRecords[0].edges.visible, true);

  scene.update({
    theme: {
      ...theme,
      materials: {
        ...theme.materials,
        defaultColor: "#ff0000",
        fillColors: ["#ff0000"]
      }
    }
  });

  assert.equal(scene.displayRecords[0].mesh, firstMesh);
  assert.equal(scene.displayRecords[0].mesh.geometry, firstGeometry);
  assert.equal(scene.displayRecords[0].material.color.getHexString(), "ff0000");
  scene.dispose();
});

test("buildCadScene reuses cached geometry for posed wrappers with the same geometry source", () => {
  const geometrySource = sampleMeshData();
  const posedMeshData = {
    ...geometrySource,
    geometrySource,
    parts: geometrySource.parts.map((part) => ({
      ...part,
      transform: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]
    }))
  };
  const movedMeshData = {
    ...geometrySource,
    geometrySource,
    parts: geometrySource.parts.map((part, index) => ({
      ...part,
      bounds: {
        min: [part.bounds.min[0] + index, part.bounds.min[1], part.bounds.min[2]],
        max: [part.bounds.max[0] + index, part.bounds.max[1], part.bounds.max[2]]
      },
      transform: [
        1, 0, 0, index,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]
    }))
  };
  const scene = buildCadScene(THREE, posedMeshData, {
    theme: cloneThemeSettings("technical"),
    renderPartsIndividually: true
  });
  const firstGeometry = scene.displayRecords[0].mesh.geometry;
  const movedScene = buildCadScene(THREE, movedMeshData, {
    theme: cloneThemeSettings("technical"),
    renderPartsIndividually: true
  });

  assert.equal(movedScene.displayRecords[0].mesh.geometry, firstGeometry);
  scene.dispose();
  movedScene.dispose();
});

test("buildCadScene wireframe mode keeps a translucent surface and wire edges", () => {
  const theme = cloneThemeSettings("technical");
  const scene = buildCadScene(THREE, sampleMeshData(), {
    theme: {
      ...theme,
      display: { mode: CAD_DISPLAY_MODE.WIREFRAME }
    },
    renderPartsIndividually: true
  });

  assert.equal(normalizeDisplayMode("wireframe"), CAD_DISPLAY_MODE.WIREFRAME);
  assert.equal(scene.displayRecords.length, 2);
  assert.equal(scene.displayRecords[0].material.type, "MeshBasicMaterial");
  assert.equal(scene.displayRecords[0].material.opacity, 0.035);
  assert.equal(scene.displayRecords[0].edges.geometry.type, "WireframeGeometry");
  scene.dispose();
});

test("buildCadScene applies selection, clipping, and STEP module parameter effects", () => {
  const scene = buildCadScene(THREE, sampleMeshData(), {
    theme: cloneThemeSettings("technical"),
    renderPartsIndividually: true,
    selection: {
      selectedPartIds: ["left"],
      hiddenPartIds: ["right"]
    },
    clip: {
      enabled: true,
      axis: "x",
      offset: 0.5
    },
    parameters: {
      definition: {
        module: {
          render(ctx) {
            if (ctx.params.hideLeft) {
              ctx.effects.visible("left", false);
            }
          }
        },
        manifest: {},
        cadPath: "part.step"
      },
      parameterValues: {
        hideLeft: true
      }
    }
  });

  const left = scene.displayRecords.find((record) => record.partId === "left");
  const right = scene.displayRecords.find((record) => record.partId === "right");

  assert.equal(left.mesh.visible, false);
  assert.equal(right.mesh.visible, false);
  assert.equal(left.material.clippingPlanes.length, 1);
  assert.equal(scene.bounds.min[0], 2);
  assert.equal(scene.bounds.max[0], 3);
  scene.dispose();
});
