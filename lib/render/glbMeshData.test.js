import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMeshDataFromGlbBuffer } from "./glbMeshData.js";

function pad4(buffer, padByte = 0) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, padByte)]) : buffer;
}

function floatBuffer(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function uint32Buffer(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32LE(value, index * 4));
  return buffer;
}

function makeOccurrenceGlb({
  cadExtras = true,
  stepTopology = false,
  materialBaseColor = null
} = {}) {
  const positions = floatBuffer([
    0, 0, 0,
    0.001, 0, 0,
    0, 0.001, 0
  ]);
  const indices = uint32Buffer([0, 1, 2]);
  const binary = pad4(Buffer.concat([positions, indices]));
  const primitive = {
    attributes: {
      POSITION: 0
    },
    indices: 1,
    mode: 4,
    ...(Array.isArray(materialBaseColor) ? { material: 0 } : {})
  };
  const gltf = {
    asset: {
      version: "2.0"
    },
    ...(stepTopology
      ? {
          extensionsUsed: ["STEP_topology"],
          extensions: {
            STEP_topology: {}
          }
        }
      : {}),
    scenes: [
      {
        nodes: [0]
      }
    ],
    nodes: [
      {
        name: "leaf",
        mesh: 0,
        ...(cadExtras ? { extras: { cadOccurrenceId: "o1.2" } } : {})
      }
    ],
    meshes: [
      {
        primitives: [primitive]
      }
    ],
    ...(Array.isArray(materialBaseColor)
      ? {
          materials: [
            {
              pbrMetallicRoughness: {
                baseColorFactor: materialBaseColor
              }
            }
          ]
        }
      : {}),
    buffers: [
      {
        byteLength: binary.length
      }
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.length,
        target: 34962
      },
      {
        buffer: 0,
        byteOffset: positions.length,
        byteLength: indices.length,
        target: 34963
      }
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [0.001, 0.001, 0]
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5125,
        count: 3,
        type: "SCALAR",
        min: [0],
        max: [2]
      }
    ]
  };
  const json = pad4(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const glb = Buffer.concat([header, jsonHeader, json, binHeader, binary]);
  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
}

function makeTwoPrimitiveOccurrenceGlb({
  stepTopology = false,
  materialBaseColors = [
    [1, 0, 0, 1],
    [0, 0, 1, 1]
  ]
} = {}) {
  const positions = floatBuffer([
    0, 0, 0,
    0.001, 0, 0,
    0, 0.001, 0,
    0.002, 0, 0,
    0.003, 0, 0,
    0.002, 0.001, 0
  ]);
  const firstIndices = uint32Buffer([0, 1, 2]);
  const secondIndices = uint32Buffer([3, 4, 5]);
  const binary = pad4(Buffer.concat([positions, firstIndices, secondIndices]));
  const secondIndexOffset = positions.length + firstIndices.length;
  const gltf = {
    asset: {
      version: "2.0"
    },
    ...(stepTopology
      ? {
          extensionsUsed: ["STEP_topology"],
          extensions: {
            STEP_topology: {}
          }
        }
      : {}),
    scenes: [
      {
        nodes: [0]
      }
    ],
    nodes: [
      {
        name: "leaf",
        mesh: 0,
        extras: {
          cadOccurrenceId: "o1.2"
        }
      }
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0
            },
            indices: 1,
            material: 0,
            mode: 4
          },
          {
            attributes: {
              POSITION: 0
            },
            indices: 2,
            material: 1,
            mode: 4
          }
        ]
      }
    ],
    materials: materialBaseColors.map((baseColorFactor) => ({
      pbrMetallicRoughness: {
        baseColorFactor
      }
    })),
    buffers: [
      {
        byteLength: binary.length
      }
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.length,
        target: 34962
      },
      {
        buffer: 0,
        byteOffset: positions.length,
        byteLength: firstIndices.length,
        target: 34963
      },
      {
        buffer: 0,
        byteOffset: secondIndexOffset,
        byteLength: secondIndices.length,
        target: 34963
      }
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: 6,
        type: "VEC3",
        min: [0, 0, 0],
        max: [0.003, 0.001, 0]
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5125,
        count: 3,
        type: "SCALAR",
        min: [0],
        max: [2]
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5125,
        count: 3,
        type: "SCALAR",
        min: [3],
        max: [5]
      }
    ]
  };
  const json = pad4(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const glb = Buffer.concat([header, jsonHeader, json, binHeader, binary]);
  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
}

test("GLB mesh data preserves cadOccurrenceId node extras", async () => {
  const meshData = await buildMeshDataFromGlbBuffer(makeOccurrenceGlb());

  assert.equal(meshData.parts.length, 1);
  assert.equal(meshData.parts[0].id, "o1.2");
  assert.equal(meshData.parts[0].occurrenceId, "o1.2");
  assert.equal(meshData.parts[0].primitiveIndex, 0);
  assert.deepEqual(Array.from(meshData.vertices, (value) => Object.is(value, -0) ? 0 : value), [
    0, 0, 0,
    1, 0, 0,
    0, 1, 0
  ]);
});

test("native GLB mesh data converts Y-up meters to CAD Z-up millimeters", async () => {
  const meshData = await buildMeshDataFromGlbBuffer(makeOccurrenceGlb({ cadExtras: false }));

  assert.equal(meshData.parts.length, 1);
  assert.equal(meshData.parts[0].id, "glb:0");
  assert.equal(meshData.parts[0].label, "leaf");
  assert.deepEqual(Array.from(meshData.vertices, (value) => Object.is(value, -0) ? 0 : value), [
    0, 0, 0,
    1, 0, 0,
    0, 0, 1
  ]);
});

test("STEP GLB mesh data ignores neutral gray material colors", async () => {
  const meshData = await buildMeshDataFromGlbBuffer(makeOccurrenceGlb({
    stepTopology: true,
    materialBaseColor: [0.62, 0.62, 0.62, 1]
  }));

  assert.equal(meshData.has_source_colors, false);
  assert.equal(meshData.sourceColor, "");
  assert.deepEqual([...meshData.colors], []);
  assert.equal(meshData.parts[0].color, "");
  assert.equal(meshData.parts[0].hasSourceColors, false);
});

test("STEP GLB mesh data preserves non-gray material colors", async () => {
  const meshData = await buildMeshDataFromGlbBuffer(makeOccurrenceGlb({
    stepTopology: true,
    materialBaseColor: [1, 0, 0, 1]
  }));

  assert.equal(meshData.has_source_colors, true);
  assert.equal(meshData.sourceColor, "#ff0000");
  assert.equal(meshData.colors.length, meshData.vertices.length);
  assert.equal(meshData.parts[0].color, "#ff0000");
  assert.equal(meshData.parts[0].hasSourceColors, true);
});

test("STEP GLB mesh data preserves colored primitives when neutral gray colors are ignored", async () => {
  const meshData = await buildMeshDataFromGlbBuffer(makeTwoPrimitiveOccurrenceGlb({
    stepTopology: true,
    materialBaseColors: [
      [0.62, 0.62, 0.62, 1],
      [0.05, 0.33, 0.86, 1]
    ]
  }));

  assert.equal(meshData.has_source_colors, true);
  assert.equal(meshData.sourceColor, "#3f9bef");
  assert.equal(meshData.colors.length, meshData.vertices.length);
  assert.equal(meshData.parts[0].color, "");
  assert.equal(meshData.parts[0].hasSourceColors, false);
  assert.equal(meshData.parts[1].color, "#3f9bef");
  assert.equal(meshData.parts[1].hasSourceColors, true);
  assert.deepEqual(Array.from(meshData.colors.slice(0, 3)), [1, 1, 1]);
  assert.deepEqual(
    Array.from(meshData.colors.slice(9, 12), (value) => Number(value.toFixed(2))),
    [0.05, 0.33, 0.86]
  );
});

test("GLB mesh data assigns stable primitive indexes per occurrence", async () => {
  const meshData = await buildMeshDataFromGlbBuffer(makeTwoPrimitiveOccurrenceGlb());

  assert.equal(meshData.parts.length, 2);
  assert.deepEqual(meshData.parts.map((part) => part.occurrenceId), ["o1.2", "o1.2"]);
  assert.deepEqual(meshData.parts.map((part) => part.primitiveIndex), [0, 1]);
  assert.deepEqual(meshData.parts.map((part) => part.triangleCount), [1, 1]);
});
