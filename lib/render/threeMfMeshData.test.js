import assert from "node:assert/strict";
import test from "node:test";

import { buildMeshDataFromThreeMfGroup } from "./threeMfMeshData.js";

class FakeVector3 {
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  applyMatrix4() {
    return this;
  }

  applyMatrix3() {
    return this;
  }

  normalize() {
    return this;
  }
}

class FakeMatrix3 {
  getNormalMatrix() {
    return this;
  }
}

function fakeAttribute(values) {
  return {
    itemSize: 3,
    count: values.length / 3,
    getX: (index) => values[index * 3],
    getY: (index) => values[index * 3 + 1],
    getZ: (index) => values[index * 3 + 2],
  };
}

test("buildMeshDataFromThreeMfGroup normalizes 3MF meshes to explorer mesh data", () => {
  const mesh = {
    isMesh: true,
    name: "fixture",
    material: null,
    matrixWorld: null,
    updateWorldMatrix() {},
    geometry: {
      getIndex: () => null,
      getAttribute: (name) => {
        if (name === "position") {
          return fakeAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        }
        if (name === "normal") {
          return fakeAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1]);
        }
        return null;
      },
      computeVertexNormals() {},
    },
  };
  const group = {
    updateWorldMatrix() {},
    traverse(callback) {
      callback(mesh);
    },
  };

  const meshData = buildMeshDataFromThreeMfGroup(
    { Matrix3: FakeMatrix3, Vector3: FakeVector3 },
    group
  );

  assert.deepEqual([...meshData.vertices], [0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.deepEqual([...meshData.indices], [0, 1, 2]);
  assert.deepEqual([...meshData.normals], [0, 0, 1, 0, 0, 1, 0, 0, 1]);
  assert.deepEqual([...meshData.colors], []);
  assert.deepEqual(meshData.bounds, { min: [0, 0, 0], max: [1, 1, 0] });
  assert.equal(meshData.parts.length, 1);
  assert.equal(meshData.parts[0].name, "fixture");
  assert.equal(meshData.has_source_colors, false);
});

test("buildMeshDataFromThreeMfGroup preserves 3MF material colors", () => {
  const mesh = {
    isMesh: true,
    name: "colored fixture",
    material: {
      color: {
        r: 0.25,
        g: 0.5,
        b: 0.75,
        getHexString: () => "4080bf",
      },
    },
    matrixWorld: null,
    updateWorldMatrix() {},
    geometry: {
      getIndex: () => null,
      getAttribute: (name) => {
        if (name === "position") {
          return fakeAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        }
        if (name === "normal") {
          return fakeAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1]);
        }
        return null;
      },
      computeVertexNormals() {},
    },
  };
  const group = {
    updateWorldMatrix() {},
    traverse(callback) {
      callback(mesh);
    },
  };

  const meshData = buildMeshDataFromThreeMfGroup(
    { Matrix3: FakeMatrix3, Vector3: FakeVector3 },
    group
  );

  assert.deepEqual([...meshData.colors], [0.25, 0.5, 0.75, 0.25, 0.5, 0.75, 0.25, 0.5, 0.75]);
  assert.equal(meshData.has_source_colors, true);
  assert.equal(meshData.sourceColor, "#4080bf");
  assert.equal(meshData.parts[0].color, "#4080bf");
});
