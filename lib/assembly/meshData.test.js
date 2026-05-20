import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assemblyBreadcrumb,
  buildAssemblyLeafToNodePickMap,
  buildSelfContainedAssemblyMeshData,
  descendantLeafPartIds,
  findAssemblyNode,
  flattenAssemblyNodes,
  flattenAssemblyLeafParts,
  leafPartIdsForAssemblySelection,
  representativeAssemblyLeafPartId,
  resolveAssemblyPickedPartId
} from "./meshData.js";

test("self-contained assembly mesh data maps GLB node parts by occurrence id", () => {
  const topology = {
    assembly: {
      mesh: {
        url: ".assembly.step.glb?v=abc",
        addressing: "gltf-node-extras",
        occurrenceIdKey: "cadOccurrenceId"
      },
      root: {
        id: "root",
        nodeType: "assembly",
        children: [
          {
            id: "o1.2",
            occurrenceId: "o1.2",
            nodeType: "part",
            displayName: "sample_part",
            sourcePath: "parts/sample_part.step",
            worldTransform: [
              1, 0, 0, 10,
              0, 1, 0, 20,
              0, 0, 1, 30,
              0, 0, 0, 1
            ],
            bbox: {
              min: [10, 20, 30],
              max: [11, 21, 30]
            },
            children: []
          }
        ]
      }
    }
  };
  const parsedGlbMeshData = {
    vertices: new Float32Array([
      10, 20, 30,
      11, 20, 30,
      10, 21, 30
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]),
    indices: new Uint32Array([0, 1, 2]),
    colors: new Float32Array(0),
    edge_indices: new Uint32Array(0),
    bounds: {
      min: [10, 20, 30],
      max: [11, 21, 30]
    },
    parts: [
      {
        id: "o1.2",
        occurrenceId: "o1.2",
        vertexOffset: 0,
        vertexCount: 3,
        triangleOffset: 0,
        triangleCount: 1,
        bounds: {
          min: [10, 20, 30],
          max: [11, 21, 30]
        }
      }
    ]
  };

  const meshData = buildSelfContainedAssemblyMeshData(topology, parsedGlbMeshData);

  assert.equal(meshData.parts.length, 1);
  assert.equal(meshData.partTransformsBaked, true);
  assert.equal(meshData.parts[0].id, "o1.2");
  assert.equal(meshData.parts[0].label, "sample_part");
  assert.equal(meshData.parts[0].partSourcePath, "parts/sample_part.step");
  assert.equal(meshData.parts[0].vertexOffset, 0);
  assert.deepEqual(meshData.parts[0].bounds, {
    min: [10, 20, 30],
    max: [11, 21, 30]
  });
  assert.deepEqual(Array.from(meshData.vertices), [
    10, 20, 30,
    11, 20, 30,
    10, 21, 30
  ]);
});

test("self-contained assembly mesh data groups descendant GLB nodes under topology leaves", () => {
  const topology = {
    assembly: {
      mesh: {
        url: ".assembly.step.glb?v=abc",
        addressing: "gltf-node-extras",
        occurrenceIdKey: "cadOccurrenceId"
      },
      root: {
        id: "root",
        nodeType: "assembly",
        children: [
          {
            id: "o1.2",
            occurrenceId: "o1.2",
            nodeType: "part",
            displayName: "compound_part",
            children: []
          }
        ]
      }
    }
  };
  const parsedGlbMeshData = {
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      10, 0, 0,
      11, 0, 0,
      10, 1, 0
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]),
    indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    colors: new Float32Array(0),
    edge_indices: new Uint32Array(0),
    bounds: {
      min: [0, 0, 0],
      max: [11, 1, 0]
    },
    parts: [
      {
        id: "o1.2.1",
        occurrenceId: "o1.2.1",
        vertexOffset: 0,
        vertexCount: 3,
        triangleOffset: 0,
        triangleCount: 1,
        primitiveIndex: 0,
        bounds: {
          min: [0, 0, 0],
          max: [1, 1, 0]
        }
      },
      {
        id: "o1.2.2",
        occurrenceId: "o1.2.2",
        vertexOffset: 3,
        vertexCount: 3,
        triangleOffset: 1,
        triangleCount: 1,
        primitiveIndex: 2,
        bounds: {
          min: [10, 0, 0],
          max: [11, 1, 0]
        }
      }
    ]
  };

  const meshData = buildSelfContainedAssemblyMeshData(topology, parsedGlbMeshData);

  assert.equal(meshData.parts.length, 1);
  assert.equal(meshData.parts[0].id, "o1.2");
  assert.equal(meshData.parts[0].vertexCount, 6);
  assert.equal(meshData.parts[0].triangleCount, 2);
  assert.deepEqual(meshData.parts[0].sourcePartRanges, [
    {
      occurrenceId: "o1.2.1",
      primitiveIndex: 0,
      triangleOffset: 0,
      triangleCount: 1
    },
    {
      occurrenceId: "o1.2.2",
      primitiveIndex: 2,
      triangleOffset: 1,
      triangleCount: 1
    }
  ]);
  assert.deepEqual(Array.from(meshData.indices), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(meshData.parts[0].sourceBounds, {
    min: [0, 0, 0],
    max: [11, 1, 0]
  });
});

test("self-contained assembly mesh data skips topology leaves without GLB triangles", () => {
  const topology = {
    assembly: {
      mesh: {
        url: ".assembly.step.glb?v=abc",
        addressing: "gltf-node-extras",
        occurrenceIdKey: "cadOccurrenceId"
      },
      root: {
        id: "root",
        nodeType: "assembly",
        children: [
          {
            id: "o1.1",
            occurrenceId: "o1.1",
            nodeType: "part",
            displayName: "rendered_part",
            children: []
          },
          {
            id: "o1.2",
            occurrenceId: "o1.2",
            nodeType: "part",
            displayName: "wire_only_part",
            children: []
          }
        ]
      }
    }
  };
  const parsedGlbMeshData = {
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]),
    indices: new Uint32Array([0, 1, 2]),
    colors: new Float32Array(0),
    edge_indices: new Uint32Array(0),
    bounds: {
      min: [0, 0, 0],
      max: [1, 1, 0]
    },
    parts: [
      {
        id: "o1.1",
        occurrenceId: "o1.1",
        vertexOffset: 0,
        vertexCount: 3,
        triangleOffset: 0,
        triangleCount: 1,
        bounds: {
          min: [0, 0, 0],
          max: [1, 1, 0]
        }
      }
    ]
  };

  const meshData = buildSelfContainedAssemblyMeshData(topology, parsedGlbMeshData);

  assert.deepEqual(meshData.parts.map((part) => part.id), ["o1.1"]);
  assert.deepEqual(meshData.meshlessLeafPartIds, ["o1.2"]);
  assert.equal(meshData.indices.length, 3);
});

test("assembly helpers navigate nested assemblies down to leaf parts", () => {
  const root = {
    id: "root",
    nodeType: "assembly",
    displayName: "sample_root",
    children: [
      {
        id: "sample_module",
        nodeType: "assembly",
        displayName: "sample_module",
        children: [
          {
            id: "sample_part",
            nodeType: "part",
            displayName: "sample_part",
            children: []
          }
        ]
      }
    ]
  };

  assert.deepEqual(flattenAssemblyLeafParts(root).map((part) => part.id), ["sample_part"]);
  assert.deepEqual(flattenAssemblyNodes(root).map((node) => node.id), ["root", "sample_module", "sample_part"]);
  assert.equal(findAssemblyNode(root, "sample_module")?.displayName, "sample_module");
  assert.deepEqual(assemblyBreadcrumb(root, "sample_part").map((node) => node.id), ["root", "sample_module", "sample_part"]);
  assert.deepEqual(descendantLeafPartIds(root.children[0]), ["sample_part"]);
  assert.equal(representativeAssemblyLeafPartId(root.children[0]), "sample_part");
});

test("assembly picking maps use only descendant leaves", () => {
  const root = {
    id: "root",
    nodeType: "assembly",
    children: [
      {
        id: "module",
        occurrenceId: "o1.1",
        nodeType: "assembly",
        leafPartIds: ["leaf_a", "leaf_b"],
        children: [
          {
            id: "leaf_a",
            occurrenceId: "o1.1.1",
            nodeType: "part",
            sourcePath: "parts/a.step",
            children: []
          },
          {
            id: "leaf_b",
            occurrenceId: "o1.1.2",
            nodeType: "part",
            children: []
          }
        ]
      }
    ]
  };

  const pickPartIdMap = buildAssemblyLeafToNodePickMap(root.children);
  assert.deepEqual(
    [...pickPartIdMap.entries()],
    [
      ["leaf_a", "module"],
      ["leaf_b", "module"]
    ]
  );
  assert.equal(
    resolveAssemblyPickedPartId("leaf_a", {
      pickPartIdMap,
      validLeafPartIds: ["leaf_a", "leaf_b"]
    }),
    "leaf_a"
  );
  assert.equal(
    resolveAssemblyPickedPartId("legacy_mesh_leaf", {
      pickPartIdMap: new Map([["legacy_mesh_leaf", "module"]]),
      validLeafPartIds: ["leaf_a", "leaf_b"]
    }),
    "module"
  );
  const assemblyPartMap = new Map(flattenAssemblyNodes(root).map((node) => [node.id, node]));
  assert.deepEqual(
    leafPartIdsForAssemblySelection("module", {
      assemblyPartMap,
      fallbackPartId: "leaf_a",
      validLeafPartIds: ["leaf_a", "leaf_b"]
    }),
    ["leaf_a", "leaf_b"]
  );
  assert.deepEqual(
    leafPartIdsForAssemblySelection("leaf_a", {
      assemblyPartMap,
      validLeafPartIds: ["leaf_a", "leaf_b"]
    }),
    ["leaf_a"]
  );
  assert.deepEqual(
    leafPartIdsForAssemblySelection("missing", {
      assemblyPartMap,
      fallbackPartId: "leaf_b",
      validLeafPartIds: ["leaf_a", "leaf_b"]
    }),
    ["leaf_b"]
  );
  assert.equal(representativeAssemblyLeafPartId(root.children[0]), "leaf_a");
});

test("nested assembly selection resolves descendant render leaves without loading sibling topology", () => {
  const root = {
    id: "root",
    nodeType: "assembly",
    children: [
      {
        id: "outer",
        nodeType: "assembly",
        children: [
          {
            id: "inner",
            nodeType: "assembly",
            children: [
              {
                id: "leaf_a",
                nodeType: "part",
                occurrenceId: "o1.1.1.1",
                children: []
              },
              {
                id: "leaf_b",
                nodeType: "part",
                occurrenceId: "o1.1.1.2",
                children: []
              }
            ]
          }
        ]
      },
      {
        id: "sibling_leaf",
        nodeType: "part",
        occurrenceId: "o1.2",
        children: []
      }
    ]
  };
  const assemblyPartMap = new Map(flattenAssemblyNodes(root).map((node) => [node.id, node]));
  const validLeafPartIds = flattenAssemblyLeafParts(root).map((node) => node.id);

  assert.deepEqual(
    leafPartIdsForAssemblySelection("inner", {
      assemblyPartMap,
      validLeafPartIds
    }),
    ["leaf_a", "leaf_b"]
  );
  assert.deepEqual(
    leafPartIdsForAssemblySelection("outer", {
      assemblyPartMap,
      validLeafPartIds
    }),
    ["leaf_a", "leaf_b"]
  );
  assert.deepEqual(
    leafPartIdsForAssemblySelection("root", {
      assemblyPartMap,
      validLeafPartIds
    }),
    ["leaf_a", "leaf_b", "sibling_leaf"]
  );
});
