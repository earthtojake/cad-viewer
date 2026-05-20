import {
  buildTopologyDisplayEdgePositions
} from "./topologyDisplayEdges.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function lineSegmentPositionsFromGeometry(geometry) {
  const positionAttribute = geometry?.getAttribute?.("position");
  const rawPositions = positionAttribute?.array;
  if (!positionAttribute?.count || !rawPositions?.length) {
    return null;
  }
  return rawPositions;
}

export function syncLineMaterialOpacity(material, opacity) {
  if (!material) {
    return;
  }
  const nextOpacity = clamp(Number(opacity) || 0, 0, 1);
  const nextTransparent = nextOpacity < 0.999;
  material.opacity = nextOpacity;
  material.depthWrite = false;
  if (material.transparent !== nextTransparent) {
    material.transparent = nextTransparent;
    material.needsUpdate = true;
  }
}

export function syncScreenSpaceLineMaterialResolution(materials, width, height) {
  const nextWidth = Math.max(1, Math.floor(Number(width) || 1));
  const nextHeight = Math.max(1, Math.floor(Number(height) || 1));
  for (const material of materials || []) {
    material?.resolution?.set?.(nextWidth, nextHeight);
  }
}

function registerLineMaterial(context = {}, material, materials = null) {
  materials?.add?.(material);
  context.registerScreenSpaceLineMaterial?.(material);
}

function unregisterLineMaterial(context = {}, material, materials = null) {
  materials?.delete?.(material);
  context.unregisterScreenSpaceLineMaterial?.(material);
}

export function createScreenSpaceLineSegments(context = {}, positions, {
  color,
  opacity = 1,
  lineWidth = 1,
  renderOrder = 3,
  depthTest = true,
  depthWrite = false
} = {}, materials = null) {
  const LineSegments2 = context.LineSegments2;
  const LineSegmentsGeometry = context.LineSegmentsGeometry;
  const LineMaterial = context.LineMaterial;
  if (
    !LineSegments2 ||
    !LineSegmentsGeometry ||
    !LineMaterial ||
    !(Array.isArray(positions) || ArrayBuffer.isView(positions)) ||
    !positions.length
  ) {
    return null;
  }

  const lineGeometry = new LineSegmentsGeometry();
  lineGeometry.setPositions(positions);
  const lineMaterial = new LineMaterial({
    color,
    linewidth: lineWidth,
    opacity,
    depthTest,
    depthWrite,
    toneMapped: false,
    worldUnits: false
  });
  syncLineMaterialOpacity(lineMaterial, opacity);
  registerLineMaterial(context, lineMaterial, materials);
  const line = new LineSegments2(lineGeometry, lineMaterial);
  line.renderOrder = renderOrder;
  line.frustumCulled = false;
  line.userData.beforeDispose = () => {
    unregisterLineMaterial(context, lineMaterial, materials);
  };
  line.userData.disposeGeometry = true;
  line.userData.disposeMaterial = true;
  return line;
}

export function createScreenSpaceLineSegmentsFromGeometry(context, geometry, options, materials = null) {
  const positions = lineSegmentPositionsFromGeometry(geometry);
  return positions ? createScreenSpaceLineSegments(context, positions, options, materials) : null;
}

export function createDisplayEdgeObject(context = {}, {
  geometry,
  edgeSettings,
  baseTheme,
  partId,
  displayMode,
  thickness,
  wireframeEdgeColor = ""
}, materials = null) {
  const THREE = context.THREE;
  const wireframeMode = displayMode === "wireframe";
  const edgeOpacity = Number.isFinite(Number(edgeSettings?.opacity))
    ? clamp(Number(edgeSettings.opacity), 0, 1)
    : (baseTheme?.edgeOpacity ?? 0.84);
  const color = wireframeMode
    ? (wireframeEdgeColor || edgeSettings?.color || baseTheme?.edge || "#18181b")
    : (edgeSettings?.color || baseTheme?.edge || "#18181b");
  if (wireframeMode && THREE) {
    const opacity = Math.max(edgeOpacity, 0.9);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 0.999,
      opacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const line = new THREE.LineSegments(geometry, material);
    line.renderOrder = 4;
    line.frustumCulled = false;
    line.userData.partId = partId;
    return { edgeMesh: line, edgeMaterial: material };
  }

  const line = createScreenSpaceLineSegmentsFromGeometry(context, geometry, {
    color,
    opacity: edgeOpacity,
    lineWidth: Number.isFinite(Number(thickness)) ? Number(thickness) : 1,
    renderOrder: 3,
    depthTest: true,
    depthWrite: false
  }, materials);
  if (!line) {
    return { edgeMesh: null, edgeMaterial: null };
  }
  line.userData.partId = partId;
  return { edgeMesh: line, edgeMaterial: line.material };
}

export function createTopologyDisplayEdgeObject(context = {}, selectorRuntime, edgeSettings, baseTheme, materials = null) {
  const positions = buildTopologyDisplayEdgePositions(selectorRuntime, edgeSettings);
  if (!positions?.length) {
    return null;
  }
  const edgeOpacity = Number.isFinite(Number(edgeSettings?.opacity))
    ? clamp(Number(edgeSettings.opacity), 0, 1)
    : (baseTheme?.edgeOpacity ?? 0.84);
  const thickness = Number.isFinite(Number(edgeSettings?.thickness))
    ? clamp(Number(edgeSettings.thickness), 0.5, 6)
    : (baseTheme?.edgeThickness ?? 1);
  const line = createScreenSpaceLineSegments(context, positions, {
    color: edgeSettings?.color || baseTheme?.edge || "#18181b",
    opacity: edgeOpacity,
    lineWidth: thickness,
    renderOrder: 3,
    depthTest: true,
    depthWrite: false
  }, materials);
  if (line) {
    line.name = "TopologyDisplayEdges";
    line.userData.partId = "__topology__";
  }
  return line;
}
