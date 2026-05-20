import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import {
  THEME_TOPOLOGY_EDGE_FILTERS
} from "./themeSettings.js";
import {
  createDisplayEdgeObject,
  createTopologyDisplayEdgeObject,
  lineSegmentPositionsFromGeometry,
  syncLineMaterialOpacity,
  syncScreenSpaceLineMaterialResolution
} from "./renderEdges.js";

function edgeContext(materials = new Set()) {
  return {
    THREE,
    LineSegments2,
    LineSegmentsGeometry,
    LineMaterial,
    registerScreenSpaceLineMaterial: (material) => materials.add(material),
    unregisterScreenSpaceLineMaterial: (material) => materials.delete(material)
  };
}

function twoPointGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
    0, 0, 0,
    1, 0, 0
  ]), 3));
  return geometry;
}

test("line segment extraction uses the geometry position buffer unchanged", () => {
  const geometry = twoPointGeometry();
  const positions = geometry.getAttribute("position").array;

  assert.equal(lineSegmentPositionsFromGeometry(geometry), positions);
});

test("screen-space display edge creation registers material settings", () => {
  const materials = new Set();
  const { edgeMesh, edgeMaterial } = createDisplayEdgeObject(edgeContext(materials), {
    geometry: twoPointGeometry(),
    edgeSettings: {
      color: "#123456",
      opacity: 0.42,
      thickness: 2
    },
    baseTheme: {
      edge: "#000000",
      edgeOpacity: 0.84
    },
    partId: "part-a",
    displayMode: "solid",
    thickness: 2
  }, materials);

  assert.equal(edgeMesh.userData.partId, "part-a");
  assert.equal(edgeMaterial.opacity, 0.42);
  assert.equal(edgeMaterial.linewidth, 2);
  assert.equal(materials.has(edgeMaterial), true);

  syncScreenSpaceLineMaterialResolution(materials, 640, 480);
  assert.equal(edgeMaterial.resolution.x, 640);
  assert.equal(edgeMaterial.resolution.y, 480);
});

test("wireframe display edges preserve high opacity and basic line material", () => {
  const { edgeMesh, edgeMaterial } = createDisplayEdgeObject(edgeContext(), {
    geometry: twoPointGeometry(),
    edgeSettings: {
      color: "#123456",
      opacity: 0.2
    },
    baseTheme: {
      edge: "#000000",
      edgeOpacity: 0.84
    },
    partId: "wire-a",
    displayMode: "wireframe",
    wireframeEdgeColor: "#abcdef"
  });

  assert.equal(edgeMesh.userData.partId, "wire-a");
  assert.equal(edgeMaterial.isLineBasicMaterial, true);
  assert.equal(edgeMaterial.opacity, 0.9);
  assert.equal(edgeMaterial.depthTest, false);
});

test("topology display edge helper builds filtered screen-space edges", () => {
  const materials = new Set();
  const line = createTopologyDisplayEdgeObject(
    edgeContext(materials),
    {
      proxy: {
        edgePositions: new Float32Array([0, 0, 0, 1, 0, 0]),
        edgeIndices: new Uint32Array([0, 1])
      }
    },
    {
      color: "#654321",
      opacity: 0.66,
      thickness: 1.5,
      topologyFilter: THEME_TOPOLOGY_EDGE_FILTERS.ALL
    },
    {
      edge: "#000000",
      edgeOpacity: 0.84,
      edgeThickness: 1
    },
    materials
  );

  assert.equal(line.name, "TopologyDisplayEdges");
  assert.equal(line.userData.partId, "__topology__");
  assert.equal(line.material.opacity, 0.66);
  assert.equal(line.material.linewidth, 1.5);
});

test("line material opacity helper clamps transparency consistently", () => {
  const material = new THREE.LineBasicMaterial({ opacity: 1, transparent: false });

  syncLineMaterialOpacity(material, 0.25);
  assert.equal(material.opacity, 0.25);
  assert.equal(material.transparent, true);

  syncLineMaterialOpacity(material, 5);
  assert.equal(material.opacity, 1);
  assert.equal(material.transparent, false);
});
