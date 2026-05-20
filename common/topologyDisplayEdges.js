import {
  THEME_TOPOLOGY_EDGE_FILTERS
} from "./themeSettings.js";

const EDGE_FLAG_DEGENERATED = 1 << 1;
const EDGE_FLAG_SEAM = 1 << 2;
const EDGE_FLAG_NOT_REFERENCEABLE = 1 << 3;

function isFloat32Array(value) {
  return value instanceof Float32Array;
}

function isUint32Array(value) {
  return value instanceof Uint32Array;
}

export function hasTopologyDisplayEdgeProxy(selectorRuntime) {
  const proxy = selectorRuntime?.proxy || {};
  return (
    isFloat32Array(proxy.edgePositions) &&
    isUint32Array(proxy.edgeIndices) &&
    proxy.edgePositions.length >= 6 &&
    proxy.edgeIndices.length >= 2
  );
}

function includeTopologyEdge(row, edgeSettings = {}) {
  if (edgeSettings.topologyFilter === THEME_TOPOLOGY_EDGE_FILTERS.ALL) {
    return true;
  }
  const flags = Number(row?.flags || 0);
  if ((flags & (EDGE_FLAG_DEGENERATED | EDGE_FLAG_SEAM | EDGE_FLAG_NOT_REFERENCEABLE)) !== 0) {
    return false;
  }
  const minRelevance = Number.isFinite(Number(edgeSettings.topologyMinRelevance))
    ? Number(edgeSettings.topologyMinRelevance)
    : 1;
  return Number(row?.relevance || 0) >= minRelevance;
}

export function buildTopologyDisplayEdgePositions(selectorRuntime, edgeSettings = {}) {
  if (!hasTopologyDisplayEdgeProxy(selectorRuntime)) {
    return null;
  }
  const proxy = selectorRuntime.proxy;
  const segmentCount = Math.floor(proxy.edgeIndices.length / 2);
  if (segmentCount <= 0) {
    return null;
  }

  const edgeRows = Array.isArray(selectorRuntime.edges) ? selectorRuntime.edges : [];
  const edgeIds = isUint32Array(proxy.edgeIds) ? proxy.edgeIds : null;
  const linePositions = new Float32Array(segmentCount * 6);
  let writeOffset = 0;

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const rowIndex = edgeIds ? Number(edgeIds[segmentIndex]) : -1;
    const row = rowIndex >= 0 && rowIndex < edgeRows.length ? edgeRows[rowIndex] : null;
    if (row && !includeTopologyEdge(row, edgeSettings)) {
      continue;
    }

    const startVertexIndex = Number(proxy.edgeIndices[segmentIndex * 2]);
    const endVertexIndex = Number(proxy.edgeIndices[(segmentIndex * 2) + 1]);
    const startOffset = startVertexIndex * 3;
    const endOffset = endVertexIndex * 3;
    if (
      !Number.isInteger(startVertexIndex) ||
      !Number.isInteger(endVertexIndex) ||
      startOffset < 0 ||
      endOffset < 0 ||
      startOffset + 2 >= proxy.edgePositions.length ||
      endOffset + 2 >= proxy.edgePositions.length
    ) {
      continue;
    }

    linePositions[writeOffset] = proxy.edgePositions[startOffset];
    linePositions[writeOffset + 1] = proxy.edgePositions[startOffset + 1];
    linePositions[writeOffset + 2] = proxy.edgePositions[startOffset + 2];
    linePositions[writeOffset + 3] = proxy.edgePositions[endOffset];
    linePositions[writeOffset + 4] = proxy.edgePositions[endOffset + 1];
    linePositions[writeOffset + 5] = proxy.edgePositions[endOffset + 2];
    writeOffset += 6;
  }

  if (!writeOffset) {
    return null;
  }
  return writeOffset === linePositions.length
    ? linePositions
    : linePositions.slice(0, writeOffset);
}
