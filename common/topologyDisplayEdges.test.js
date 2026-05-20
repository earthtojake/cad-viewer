import assert from "node:assert/strict";
import { test } from "node:test";

import {
  THEME_TOPOLOGY_EDGE_FILTERS
} from "./themeSettings.js";
import {
  buildTopologyDisplayEdgePositions,
  hasTopologyDisplayEdgeProxy
} from "./topologyDisplayEdges.js";

function runtimeWithEdges(edges) {
  return {
    edges,
    proxy: {
      edgePositions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0,
        3, 0, 0,
        4, 0, 0,
        5, 0, 0
      ]),
      edgeIndices: new Uint32Array([0, 1, 2, 3, 4, 5]),
      edgeIds: new Uint32Array([0, 1, 2])
    }
  };
}

test("topology display edges expose proxy availability", () => {
  assert.equal(hasTopologyDisplayEdgeProxy(runtimeWithEdges([])), true);
  assert.equal(hasTopologyDisplayEdgeProxy({
    proxy: {
      edgePositions: new Float32Array(0),
      edgeIndices: new Uint32Array(0)
    }
  }), false);
});

test("feature topology display edges hide seam and non-referenceable topology", () => {
  const positions = buildTopologyDisplayEdgePositions(runtimeWithEdges([
    { flags: 0, relevance: 10 },
    { flags: 4, relevance: 50 },
    { flags: 8, relevance: 50 }
  ]), {
    topologyFilter: THEME_TOPOLOGY_EDGE_FILTERS.FEATURE,
    topologyMinRelevance: 1
  });

  assert.deepEqual(Array.from(positions), [0, 0, 0, 1, 0, 0]);
});

test("all topology display edges include every valid proxy segment", () => {
  const positions = buildTopologyDisplayEdgePositions(runtimeWithEdges([
    { flags: 0, relevance: 10 },
    { flags: 4, relevance: 0 },
    { flags: 8, relevance: 0 }
  ]), {
    topologyFilter: THEME_TOPOLOGY_EDGE_FILTERS.ALL
  });

  assert.deepEqual(Array.from(positions), [
    0, 0, 0, 1, 0, 0,
    2, 0, 0, 3, 0, 0,
    4, 0, 0, 5, 0, 0
  ]);
});
