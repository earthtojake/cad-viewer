import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStepTreeRoot,
  collectStepTreeAncestorIds,
  flattenVisibleStepTreeRows,
  STEP_MODEL_RENDER_PART_ID,
  STEP_MODEL_ROOT_ID,
  stepTreeNodeLeafPartIds
} from "./stepTree.js";

const nestedRoot = {
  id: "root",
  nodeType: "assembly",
  displayName: "root assembly",
  children: [
    {
      id: "sub",
      nodeType: "assembly",
      displayName: "sub assembly",
      children: [
        {
          id: "leaf-a",
          nodeType: "part",
          displayName: "leaf A",
          children: []
        },
        {
          id: "leaf-b",
          nodeType: "part",
          displayName: "leaf B",
          children: []
        }
      ]
    },
    {
      id: "leaf-c",
      nodeType: "part",
      displayName: "leaf C",
      children: []
    }
  ]
};

test("visible STEP tree rows follow independent expansion state", () => {
  assert.deepEqual(
    flattenVisibleStepTreeRows(nestedRoot, []).map((row) => row.id),
    ["root"]
  );
  assert.deepEqual(
    flattenVisibleStepTreeRows(nestedRoot, ["root"]).map((row) => [row.id, row.depth, row.expanded]),
    [
      ["root", 0, true],
      ["sub", 1, false],
      ["leaf-c", 1, false]
    ]
  );
  assert.deepEqual(
    flattenVisibleStepTreeRows(nestedRoot, ["root", "sub"]).map((row) => row.id),
    ["root", "sub", "leaf-a", "leaf-b", "leaf-c"]
  );
});

test("STEP tree query keeps matching descendants visible with ancestors", () => {
  assert.deepEqual(
    flattenVisibleStepTreeRows(nestedRoot, [], { query: "leaf b" }).map((row) => row.id),
    ["root", "sub", "leaf-b"]
  );
});

test("STEP tree leaf ids include nested descendant parts", () => {
  assert.deepEqual(stepTreeNodeLeafPartIds(nestedRoot.children[0]), ["leaf-a", "leaf-b"]);
});

test("plain STEP parts get a synthetic selectable root", () => {
  const root = buildStepTreeRoot({
    selectedEntry: {
      name: "bracket",
      source: {
        path: "parts/bracket.step"
      }
    },
    meshData: {
      bounds: {
        min: [0, 0, 0],
        max: [1, 2, 3]
      }
    }
  });
  assert.equal(root.id, STEP_MODEL_ROOT_ID);
  assert.equal(root.displayName, "bracket");
  assert.deepEqual(root.leafPartIds, [STEP_MODEL_RENDER_PART_ID]);
});

test("ancestor ids are collected without the selected node", () => {
  assert.deepEqual(collectStepTreeAncestorIds(nestedRoot, "leaf-b"), ["root", "sub"]);
});
