import {
  normalizeThemeSettings,
  resolveThemeDisplayEdgeSettings,
  resolveThemeDisplayMode,
  resolveThemeFillColor
} from "./themeSettings.js";
import { resolveStepModuleFeatures } from "./stepModule.js";
import {
  applyStepModuleEffectsToRecords,
  buildPartTransformMatrix,
  buildStepModuleContext,
  createStepModuleEffectsApi,
  displayTransformForPart
} from "./stepModuleEffects.js";
import { axisIndex, normalizeStepClipSettings } from "../lib/explorer/clipPlane.js";
import {
  clampSceneModelRadius,
  getSceneScaleSettings,
  normalizeSceneScaleMode,
  EXPLORER_SCENE_SCALE
} from "../lib/explorer/sceneScale.js";

export const CAD_DISPLAY_MODE = Object.freeze({
  SOLID: "solid",
  WIREFRAME: "wireframe"
});

export const CAD_SCENE_SCALE = EXPLORER_SCENE_SCALE;

const CAD_EDGE_OPACITY = 0.84;
const CAD_EDGE_THRESHOLD_DEG = 16;
const REFERENCE_HOVER_COLOR = "#8dc5ff";
const REFERENCE_SELECTED_COLOR = "#4f9dff";
const PART_HOVER_OPACITY_BOOST = 0.08;
const PART_SELECTED_OPACITY_BOOST = 0.12;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const MODEL_PART_ID = "__model__";
const DEFAULT_THEME = Object.freeze({
  surface: "#f4f4f5",
  surfaceRoughness: 0.92,
  surfaceMetalness: 0.03,
  surfaceClearcoat: 0,
  surfaceClearcoatRoughness: 0.6,
  edge: "#18181b",
  edgeThickness: 1,
  edgeOpacity: CAD_EDGE_OPACITY
});

const meshGeometryCache = new WeakMap();

function cacheOwnerForMeshData(meshData) {
  const geometrySource = meshData?.geometrySource;
  return geometrySource && typeof geometrySource === "object" ? geometrySource : meshData;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNumericArray(value, stride = 1) {
  return (
    (Array.isArray(value) || ArrayBuffer.isView(value)) &&
    value.length >= stride &&
    value.length % stride === 0
  );
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeDisplayMode(value) {
  return String(value || "").trim().toLowerCase() === CAD_DISPLAY_MODE.WIREFRAME
    ? CAD_DISPLAY_MODE.WIREFRAME
    : CAD_DISPLAY_MODE.SOLID;
}

export function normalizeCadSceneScale(value) {
  return normalizeSceneScaleMode(value);
}

export function boundsFromVertices(vertices) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index + 2 < (vertices?.length || 0); index += 3) {
    const x = Number(vertices[index]);
    const y = Number(vertices[index + 1]);
    const z = Number(vertices[index + 2]);
    if (![x, y, z].every(Number.isFinite)) {
      continue;
    }
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) {
    return { min: [0, 0, 0], max: [1, 1, 1] };
  }
  return { min, max };
}

export function centerAndRadiusFromBounds(THREE, bounds, scale = CAD_SCENE_SCALE.CAD) {
  const sceneScale = normalizeCadSceneScale(scale);
  const settings = getSceneScaleSettings(sceneScale);
  const min = Array.isArray(bounds?.min) ? bounds.min : [0, 0, 0];
  const max = Array.isArray(bounds?.max) ? bounds.max : [1, 1, 1];
  const center = new THREE.Vector3(
    (toNumber(min[0]) + toNumber(max[0], 1)) / 2,
    (toNumber(min[1]) + toNumber(max[1], 1)) / 2,
    (toNumber(min[2]) + toNumber(max[2], 1)) / 2
  );
  const size = new THREE.Vector3(
    Math.max(toNumber(max[0], 1) - toNumber(min[0]), settings.minModelRadius),
    Math.max(toNumber(max[1], 1) - toNumber(min[1]), settings.minModelRadius),
    Math.max(toNumber(max[2], 1) - toNumber(min[2]), settings.minModelRadius)
  );
  return {
    center,
    size,
    radius: clampSceneModelRadius(size.length() / 2, sceneScale)
  };
}

function cacheForMeshData(meshData) {
  const cacheOwner = cacheOwnerForMeshData(meshData);
  let cache = meshGeometryCache.get(cacheOwner);
  if (!cache) {
    cache = {
      whole: new Map(),
      part: new Map(),
      edge: new Map()
    };
    meshGeometryCache.set(cacheOwner, cache);
  }
  return cache;
}

function cacheKey(parts) {
  return parts.map((part, index) => String(part?.id || part?.occurrenceId || `part:${index}`)).join("|");
}

function markCachedGeometry(geometry) {
  if (geometry) {
    geometry.userData = {
      ...(geometry.userData || {}),
      cadSceneCachedGeometry: true
    };
  }
  return geometry;
}

function disposeMaterial(material) {
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    item?.map?.dispose?.();
    item?.alphaMap?.dispose?.();
    item?.dispose?.();
  }
}

function disposeSceneObject(object, { disposeCachedGeometry = false } = {}) {
  if (!object) {
    return;
  }
  while (object.children?.length) {
    disposeSceneObject(object.children[0], { disposeCachedGeometry });
  }
  object.parent?.remove(object);
  if (typeof object.userData?.beforeDispose === "function") {
    object.userData.beforeDispose(object);
    delete object.userData.beforeDispose;
  }
  if (disposeCachedGeometry || object.geometry?.userData?.cadSceneCachedGeometry !== true) {
    object.geometry?.dispose?.();
  }
  disposeMaterial(object.material);
}

function clearGroup(group, options = {}) {
  while (group?.children?.length) {
    disposeSceneObject(group.children[0], options);
  }
}

function applyGeometryNormals(THREE, geometry, normals, recomputeNormals) {
  const hasNormals = isNumericArray(normals, 3);
  if (!recomputeNormals && hasNormals) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
    return;
  }
  geometry.computeVertexNormals();
}

function readSourceColor(THREE, value) {
  const normalized = String(value || "").trim();
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    return null;
  }
  const expanded = normalized.length === 4
    ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
    : normalized;
  return new THREE.Color(expanded);
}

function shapeSourceColor(THREE, sourceColor, materialSettings = {}, { applyTint = true } = {}) {
  const shaped = (sourceColor || new THREE.Color("#ffffff")).clone();
  const tintStrength = clamp(Number(materialSettings.tintStrength) || 0, 0, 1);
  if (applyTint && tintStrength > 0) {
    const tintColor = new THREE.Color(materialSettings.defaultColor || materialSettings.tintColor || "#ffffff");
    if (materialSettings.tintMode === "blend") {
      shaped.lerp(tintColor, tintStrength);
    } else {
      shaped.lerp(shaped.clone().multiply(tintColor), tintStrength);
    }
  }

  const saturation = clamp(Number(materialSettings.saturation) || 1, 0, 2.5);
  if (Math.abs(saturation - 1) > 1e-4) {
    const hsl = {};
    shaped.getHSL(hsl);
    shaped.setHSL(hsl.h, clamp(hsl.s * saturation, 0, 1), hsl.l);
  }

  const contrast = clamp(Number(materialSettings.contrast) || 1, 0, 2.5);
  const brightness = clamp(Number(materialSettings.brightness) || 1, 0, 2);
  shaped.r = clamp(((shaped.r - 0.5) * contrast + 0.5) * brightness, 0, 1);
  shaped.g = clamp(((shaped.g - 0.5) * contrast + 0.5) * brightness, 0, 1);
  shaped.b = clamp(((shaped.b - 0.5) * contrast + 0.5) * brightness, 0, 1);
  return shaped;
}

function shapeSourceColorBuffer(THREE, colors, materialSettings = {}) {
  if (!isNumericArray(colors, 3)) {
    return null;
  }
  const shapedColors = new Float32Array(colors.length);
  const color = new THREE.Color();
  for (let index = 0; index + 2 < colors.length; index += 3) {
    color.setRGB(
      clamp(Number(colors[index]) || 0, 0, 1),
      clamp(Number(colors[index + 1]) || 0, 0, 1),
      clamp(Number(colors[index + 2]) || 0, 0, 1)
    );
    const shaped = shapeSourceColor(THREE, color, materialSettings);
    shapedColors[index] = shaped.r;
    shapedColors[index + 1] = shaped.g;
    shapedColors[index + 2] = shaped.b;
  }
  return shapedColors;
}

function shouldUseDisplayVertexColors(meshData) {
  return !!meshData?.has_source_colors && isNumericArray(meshData?.colors, 3);
}

function partUsesDisplayVertexColors(meshData, part) {
  if (!shouldUseDisplayVertexColors(meshData)) {
    return false;
  }
  if (part && Object.hasOwn(part, "hasSourceColors")) {
    return !!part.hasSourceColors;
  }
  return true;
}

function createMaterialFillColor(THREE, materialSettings = {}, fillIndex = 0) {
  return new THREE.Color(resolveThemeFillColor(materialSettings, fillIndex));
}

function resolveMaterialFillBaseColor(THREE, materialSettings = {}, fillIndex = 0) {
  return shapeSourceColor(
    THREE,
    createMaterialFillColor(THREE, materialSettings, fillIndex),
    materialSettings,
    { applyTint: false }
  );
}

function resolveSourceBaseColor(THREE, {
  hasVertexColors = false,
  sourceColor = null,
  materialSettings,
  fallbackColor = "#ffffff",
  fillIndex = 0,
  forceFill = false
}) {
  if (forceFill) {
    return resolveMaterialFillBaseColor(THREE, materialSettings, fillIndex);
  }
  if (hasVertexColors) {
    return new THREE.Color("#ffffff");
  }
  if (!sourceColor) {
    return resolveMaterialFillBaseColor(THREE, {
      ...materialSettings,
      defaultColor: fallbackColor || materialSettings?.defaultColor
    }, fillIndex);
  }
  return shapeSourceColor(THREE, sourceColor, materialSettings);
}

function createSurfaceMaterial(THREE, baseTheme, { color, useVertexColors = false } = {}) {
  const opacity = Number.isFinite(Number(baseTheme?.surfaceOpacity))
    ? Number(baseTheme.surfaceOpacity)
    : 1;
  return new THREE.MeshPhysicalMaterial({
    color: color || baseTheme?.surface || DEFAULT_THEME.surface,
    roughness: Number.isFinite(Number(baseTheme?.surfaceRoughness)) ? Number(baseTheme.surfaceRoughness) : DEFAULT_THEME.surfaceRoughness,
    metalness: Number.isFinite(Number(baseTheme?.surfaceMetalness)) ? Number(baseTheme.surfaceMetalness) : DEFAULT_THEME.surfaceMetalness,
    clearcoat: Number.isFinite(Number(baseTheme?.surfaceClearcoat)) ? Number(baseTheme.surfaceClearcoat) : DEFAULT_THEME.surfaceClearcoat,
    clearcoatRoughness: Number.isFinite(Number(baseTheme?.surfaceClearcoatRoughness)) ? Number(baseTheme.surfaceClearcoatRoughness) : DEFAULT_THEME.surfaceClearcoatRoughness,
    side: THREE.DoubleSide,
    vertexColors: useVertexColors,
    transparent: opacity < 0.999,
    opacity,
    emissive: 0x000000,
    emissiveIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2
  });
}

function createWireframeSurfaceMaterial(THREE, materialSettings, fillIndex = 0) {
  return new THREE.MeshBasicMaterial({
    color: resolveThemeFillColor(materialSettings || {}, fillIndex),
    transparent: true,
    opacity: 0.035,
    depthWrite: false
  });
}

function sourceColorForPart(THREE, part, meshData) {
  return readSourceColor(THREE, part?.color || meshData?.sourceColor);
}

function emptyLineGeometry(THREE) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
  return geometry;
}

function stablePartFillKey(part, index) {
  return [
    String(part?.occurrenceId || ""),
    String(part?.id || ""),
    String(part?.partSourcePath || part?.sourcePath || ""),
    String(part?.label || part?.name || ""),
    String(index).padStart(8, "0")
  ].join("\u0000");
}

export function buildPartFillIndexMap(parts = []) {
  return new Map(
    [...parts]
      .map((part, index) => ({ part, key: stablePartFillKey(part, index) }))
      .sort((left, right) => left.key.localeCompare(right.key))
      .map(({ part }, index) => [part, index])
  );
}

function geometryCacheEntry(THREE, meshData, key, createGeometry) {
  const cache = cacheForMeshData(meshData);
  const cached = cache.part.get(key) || cache.whole.get(key);
  if (cached) {
    return cached;
  }
  const entry = createGeometry();
  if (!entry?.geometry) {
    return null;
  }
  markCachedGeometry(entry.geometry);
  if (key === MODEL_PART_ID) {
    cache.whole.set(key, entry);
  } else {
    cache.part.set(key, entry);
  }
  return entry;
}

function buildPartGeometryEntry(THREE, meshData, part, recomputeNormals = false) {
  const partId = String(part?.id || part?.occurrenceId || "").trim();
  const key = partId || `${toNumber(part?.vertexOffset)}:${toNumber(part?.triangleOffset)}`;
  return geometryCacheEntry(THREE, meshData, key, () => {
    const vertexOffset = toNumber(part?.vertexOffset, 0);
    const vertexCount = toNumber(part?.vertexCount, 0);
    const triangleOffset = toNumber(part?.triangleOffset, 0);
    const triangleCount = toNumber(part?.triangleCount, 0);
    if (vertexCount <= 0 || triangleCount <= 0) {
      return null;
    }

    const positionStart = vertexOffset * 3;
    const positionEnd = positionStart + vertexCount * 3;
    const localVertices = meshData.vertices.slice(positionStart, positionEnd);
    const rawColors = partUsesDisplayVertexColors(meshData, part)
      ? new Float32Array(meshData.colors.slice(positionStart, positionEnd))
      : null;
    const localNormals = isNumericArray(meshData.normals, 3) ? meshData.normals.slice(positionStart, positionEnd) : null;
    const rawIndices = meshData.indices.slice(triangleOffset * 3, triangleOffset * 3 + triangleCount * 3);
    const localIndices = new Uint32Array(rawIndices.length);
    for (let index = 0; index < rawIndices.length; index += 1) {
      localIndices[index] = Math.max(0, Number(rawIndices[index]) - vertexOffset);
    }
    if (!localIndices.length) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(localVertices), 3));
    geometry.setIndex(new THREE.BufferAttribute(localIndices, 1));
    if (rawColors && rawColors.length === localVertices.length) {
      geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(rawColors), 3));
    }
    applyGeometryNormals(THREE, geometry, localNormals, recomputeNormals);
    geometry.computeBoundingSphere();
    return {
      geometry,
      rawColors
    };
  });
}

function buildWholeGeometryEntry(THREE, meshData, recomputeNormals = false) {
  return geometryCacheEntry(THREE, meshData, MODEL_PART_ID, () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(meshData.vertices || []), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshData.indices || []), 1));
    const rawColors = shouldUseDisplayVertexColors(meshData) && meshData.colors?.length === meshData.vertices?.length
      ? new Float32Array(meshData.colors)
      : null;
    if (rawColors) {
      geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(rawColors), 3));
    }
    applyGeometryNormals(THREE, geometry, meshData.normals, recomputeNormals);
    geometry.computeBoundingSphere();
    return {
      geometry,
      rawColors
    };
  });
}

function syncRecordVertexColors(THREE, record, materialSettings) {
  if (!record?.geometry || !record.rawColors || !record.hasVertexColors) {
    return;
  }
  const shapedColors = shapeSourceColorBuffer(THREE, record.rawColors, materialSettings);
  if (!shapedColors) {
    return;
  }
  const attribute = record.geometry.getAttribute("color");
  if (attribute?.array?.length === shapedColors.length) {
    attribute.array.set(shapedColors);
    attribute.needsUpdate = true;
    return;
  }
  record.geometry.setAttribute("color", new THREE.BufferAttribute(shapedColors, 3));
}

function buildEdgeGeometryFromIndices(THREE, vertices, edgeIndices) {
  if (!isNumericArray(vertices, 3) || !isNumericArray(edgeIndices, 2)) {
    return null;
  }
  const vertexCount = Math.floor(vertices.length / 3);
  const segmentCount = Math.floor(edgeIndices.length / 2);
  if (segmentCount <= 0) {
    return null;
  }
  const linePositions = new Float32Array(segmentCount * 6);
  let writeOffset = 0;
  for (let index = 0; index + 1 < edgeIndices.length; index += 2) {
    const a = Number(edgeIndices[index]);
    const b = Number(edgeIndices[index + 1]);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= vertexCount || b >= vertexCount) {
      continue;
    }
    const aOffset = a * 3;
    const bOffset = b * 3;
    linePositions[writeOffset] = Number(vertices[aOffset]);
    linePositions[writeOffset + 1] = Number(vertices[aOffset + 1]);
    linePositions[writeOffset + 2] = Number(vertices[aOffset + 2]);
    linePositions[writeOffset + 3] = Number(vertices[bOffset]);
    linePositions[writeOffset + 4] = Number(vertices[bOffset + 1]);
    linePositions[writeOffset + 5] = Number(vertices[bOffset + 2]);
    writeOffset += 6;
  }
  if (!writeOffset) {
    return null;
  }
  const geometry = new THREE.BufferGeometry();
  const packedPositions = writeOffset === linePositions.length ? linePositions : linePositions.subarray(0, writeOffset);
  geometry.setAttribute("position", new THREE.BufferAttribute(packedPositions, 3));
  return geometry;
}

function buildEdgeGeometry(THREE, meshData, part, sourceGeometry, displayMode) {
  const cache = cacheForMeshData(meshData);
  const partId = part ? String(part?.id || part?.occurrenceId || "").trim() : MODEL_PART_ID;
  const edgeKey = `${displayMode}:${partId || MODEL_PART_ID}`;
  const cached = cache.edge.get(edgeKey);
  if (cached) {
    return cached;
  }

  let geometry = null;
  if (displayMode === CAD_DISPLAY_MODE.WIREFRAME) {
    geometry = new THREE.WireframeGeometry(sourceGeometry);
  } else if (part) {
    const edgeIndexOffset = toNumber(part?.edgeIndexOffset, 0);
    const edgeIndexCount = toNumber(part?.edgeIndexCount, 0);
    const hasExplicitPartEdges = edgeIndexCount >= 2 && isNumericArray(meshData?.edge_indices, 2);
    if (hasExplicitPartEdges) {
      const partEdgeIndices = typeof meshData.edge_indices.subarray === "function"
        ? meshData.edge_indices.subarray(edgeIndexOffset, edgeIndexOffset + edgeIndexCount)
        : meshData.edge_indices.slice(edgeIndexOffset, edgeIndexOffset + edgeIndexCount);
      geometry = buildEdgeGeometryFromIndices(THREE, meshData.vertices, partEdgeIndices);
    }
    geometry ||= new THREE.EdgesGeometry(sourceGeometry, CAD_EDGE_THRESHOLD_DEG);
  } else if (isNumericArray(meshData?.edge_indices, 2)) {
    geometry = buildEdgeGeometryFromIndices(THREE, meshData.vertices, meshData.edge_indices);
  }

  geometry ||= new THREE.EdgesGeometry(sourceGeometry, CAD_EDGE_THRESHOLD_DEG);
  if (!geometry.getAttribute("position")?.count) {
    geometry.dispose();
    geometry = emptyLineGeometry(THREE);
  }
  markCachedGeometry(geometry);
  cache.edge.set(edgeKey, geometry);
  return geometry;
}

function getEdgeThickness(edgeSettings = null, baseTheme = null) {
  const fallbackThickness = Number.isFinite(Number(baseTheme?.edgeThickness))
    ? Number(baseTheme.edgeThickness)
    : DEFAULT_THEME.edgeThickness;
  return Number.isFinite(Number(edgeSettings?.thickness))
    ? clamp(Number(edgeSettings.thickness), 0.5, 6)
    : fallbackThickness;
}

function syncLineMaterialOpacity(material, opacity) {
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

function createDefaultEdgeObject(THREE, geometry, baseTheme, edgeSettings, partId, displayMode) {
  const wireframeMode = displayMode === CAD_DISPLAY_MODE.WIREFRAME;
  const material = new THREE.LineBasicMaterial({
    color: edgeSettings?.color || baseTheme?.edge || DEFAULT_THEME.edge,
    transparent: true,
    opacity: wireframeMode
      ? Math.max(toNumber(edgeSettings?.opacity, 0.92), 0.9)
      : toNumber(edgeSettings?.opacity, baseTheme?.edgeOpacity ?? CAD_EDGE_OPACITY),
    depthTest: !wireframeMode,
    depthWrite: false
  });
  const object = new THREE.LineSegments(geometry, material);
  object.userData.partId = partId;
  return { object, material };
}

function normalizeEdgeResult(result) {
  if (!result) {
    return { object: null, material: null };
  }
  const object = result.object || result.edgeMesh || result.mesh || result.line || null;
  return {
    object,
    material: result.material || result.edgeMaterial || object?.material || null
  };
}

function createSilhouetteMesh(THREE, geometry, edgeSettings, radius) {
  const offset = radius * clamp(toNumber(edgeSettings?.silhouetteScale, 0.004), 0, 0.04);
  if (!(offset > 0)) {
    return null;
  }
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(edgeSettings?.color || DEFAULT_THEME.edge) },
      opacity: { value: clamp(toNumber(edgeSettings?.opacity, 0.9), 0, 1) },
      offset: { value: offset }
    },
    vertexShader: `
      uniform float offset;
      void main() {
        vec3 displaced = position + normal * offset;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      void main() {
        gl_FragColor = vec4(color, opacity);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  return mesh;
}

function readBoundsCenter(THREE, bounds) {
  const min = Array.isArray(bounds?.min) ? bounds.min : [0, 0, 0];
  const max = Array.isArray(bounds?.max) ? bounds.max : min;
  return new THREE.Vector3(
    (toNumber(min[0]) + toNumber(max[0])) / 2,
    (toNumber(min[1]) + toNumber(max[1])) / 2,
    (toNumber(min[2]) + toNumber(max[2])) / 2
  );
}

function applyObjectMatrix(THREE, object3d, matrix) {
  if (!object3d || !(matrix instanceof THREE.Matrix4)) {
    return;
  }
  object3d.matrixAutoUpdate = false;
  const targetMatrix = object3d.matrix instanceof THREE.Matrix4 ? object3d.matrix : new THREE.Matrix4();
  targetMatrix.copy(matrix);
  object3d.matrix = targetMatrix;
  object3d.matrixWorldNeedsUpdate = true;
}

export function applyDisplayRecordTransform(THREE, record) {
  if (!record) {
    return;
  }
  const baseMatrix = buildPartTransformMatrix(THREE, record.baseTransform);
  const effectMatrix = record.effectMatrix instanceof THREE.Matrix4 ? record.effectMatrix.clone() : null;
  const combinedMatrix = effectMatrix ? effectMatrix.multiply(baseMatrix) : baseMatrix;
  applyObjectMatrix(THREE, record.mesh, combinedMatrix);
  applyObjectMatrix(THREE, record.edges, combinedMatrix);
  applyObjectMatrix(THREE, record.silhouette, combinedMatrix);
}

function safeColor(THREE, value, fallback = null) {
  const text = String(value || "").trim();
  if (!text) {
    return fallback;
  }
  try {
    return new THREE.Color(text);
  } catch {
    return fallback;
  }
}

export function applyMaterialSettingsToRecord(THREE, record, materialSettings, {
  baseTheme = DEFAULT_THEME,
  displayMode = CAD_DISPLAY_MODE.SOLID
} = {}) {
  if (!record?.material || !materialSettings) {
    return;
  }
  const wireframeMode = displayMode === CAD_DISPLAY_MODE.WIREFRAME;
  const forceFill = materialSettings.overrideSourceColors === true || wireframeMode;
  const hasVertexColors = !forceFill && !!record.hasVertexColors;
  record.useVertexColors = hasVertexColors;
  record.baseColor = resolveSourceBaseColor(THREE, {
    hasVertexColors,
    sourceColor: forceFill ? null : record.sourceColor || null,
    materialSettings,
    fallbackColor: materialSettings?.defaultColor || baseTheme?.surface || DEFAULT_THEME.surface,
    fillIndex: record.fillIndex || 0,
    forceFill: forceFill || !record.hasSourceColor
  });
  record.material.vertexColors = hasVertexColors;
  if (wireframeMode) {
    if (record.material.color && record.baseColor) {
      record.material.color.copy(record.baseColor);
    }
    record.baseOpacity = 0.035;
    record.material.opacity = record.baseOpacity;
    record.material.transparent = true;
    record.material.depthWrite = false;
    record.material.needsUpdate = true;
    return;
  }
  syncRecordVertexColors(THREE, record, materialSettings);
  record.material.roughness = clamp(Number(materialSettings.roughness) || 0, 0, 1);
  record.material.metalness = clamp(Number(materialSettings.metalness) || 0, 0, 1);
  record.material.clearcoat = clamp(Number(materialSettings.clearcoat) || 0, 0, 1);
  record.material.clearcoatRoughness = clamp(Number(materialSettings.clearcoatRoughness) || 0, 0, 1);
  record.baseOpacity = clamp(Number(materialSettings.opacity) || 0, 0, 1);
  record.material.opacity = record.baseOpacity;
  record.material.transparent = record.baseOpacity < 0.999;
  record.material.envMapIntensity = Math.max(Number(materialSettings.envMapIntensity) || 0, 0);
  if (record.material.color && record.baseColor) {
    record.material.color.copy(record.baseColor);
  }
  record.baseEmissiveIntensity = clamp(Number(materialSettings.emissiveIntensity) || 0, 0, 2);
  record.baseEmissiveColor = record.baseColor ? record.baseColor.clone() : null;
  if ("emissive" in record.material && record.material.emissive) {
    if (record.baseEmissiveColor && record.baseEmissiveIntensity > 0) {
      record.material.emissive.copy(record.baseEmissiveColor);
    } else {
      record.material.emissive.set(0x000000);
    }
    record.material.emissiveIntensity = record.baseEmissiveIntensity;
  }
  record.material.needsUpdate = true;
}

function normalizePartIdList(value) {
  return (Array.isArray(value) ? value : [value])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
}

export function applyPartVisualState(THREE, records, {
  baseTheme = DEFAULT_THEME,
  edgeSettings,
  hiddenPartIds,
  hoveredPartId,
  focusedPartId,
  selectedPartIds,
  showEdges = true
} = {}) {
  const hidden = new Set(Array.isArray(hiddenPartIds) ? hiddenPartIds : []);
  const selected = new Set(Array.isArray(selectedPartIds) ? selectedPartIds : []);
  const hovered = new Set(
    (Array.isArray(hoveredPartId) ? hoveredPartId : [hoveredPartId])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );
  const baseEdgeColor = edgeSettings?.color || baseTheme?.edge || DEFAULT_THEME.edge;
  const defaultSurfaceOpacity = Number.isFinite(Number(baseTheme?.surfaceOpacity))
    ? Number(baseTheme.surfaceOpacity)
    : 1;
  const focusIds = new Set(normalizePartIdList(focusedPartId));
  const hasFocus = focusIds.size > 0;
  const baseEdgeOpacity = Number.isFinite(Number(edgeSettings?.opacity))
    ? clamp(Number(edgeSettings.opacity), 0, 1)
    : (baseTheme?.edgeOpacity ?? DEFAULT_THEME.edgeOpacity ?? CAD_EDGE_OPACITY);
  const dimmedEdgeOpacity = hasFocus
    ? Math.max(Math.min(baseEdgeOpacity * 0.28, 0.12), 0.04)
    : baseEdgeOpacity;
  const hoveredSurfaceColor = new THREE.Color(REFERENCE_HOVER_COLOR);
  const hoveredEdgeColor = new THREE.Color(REFERENCE_HOVER_COLOR);
  const selectedSurfaceColor = new THREE.Color(REFERENCE_SELECTED_COLOR);
  const selectedEdgeColor = new THREE.Color(REFERENCE_SELECTED_COLOR);

  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.mesh || !record?.material) {
      continue;
    }
    const effectStyle = record.effectStyle && typeof record.effectStyle === "object" ? record.effectStyle : {};
    const effectHidden = record.effectVisible === false;
    const effectColor = readSourceColor(THREE, effectStyle.color);
    const effectEdgeColor = readSourceColor(THREE, effectStyle.edgeColor);
    const effectEmissive = readSourceColor(THREE, effectStyle.emissive);
    const isHidden = hidden.has(record.partId);
    const isSelected = selected.has(record.partId) || record.effectHighlighted === true;
    const isHovered = !isHidden && !effectHidden && hovered.has(record.partId);
    const isFocused = !isHidden && !effectHidden && hasFocus && focusIds.has(record.partId);
    const isDimmed = !isHidden && !effectHidden && hasFocus && !isFocused;

    record.mesh.visible = !isHidden && !effectHidden;
    if (record.edges) {
      record.edges.visible = showEdges && !isHidden && !effectHidden;
    }
    if (record.silhouette) {
      record.silhouette.visible = !isHidden && !effectHidden;
    }

    const baseSurfaceOpacity = Number.isFinite(Number(record.baseOpacity))
      ? Number(record.baseOpacity)
      : defaultSurfaceOpacity;
    const effectOpacity = Number.isFinite(Number(effectStyle.opacity))
      ? clamp(Number(effectStyle.opacity), 0, 1)
      : 1;
    const effectEdgeOpacity = Number.isFinite(Number(effectStyle.edgeOpacity))
      ? clamp(Number(effectStyle.edgeOpacity), 0, 1)
      : effectOpacity;
    const dimmedSurfaceOpacity = hasFocus
      ? Math.max(Math.min(baseSurfaceOpacity * effectOpacity * 0.2, 0.24), 0.1)
      : baseSurfaceOpacity * effectOpacity;
    const highlightedSurfaceOpacity = isSelected
      ? clamp((baseSurfaceOpacity * effectOpacity) + PART_SELECTED_OPACITY_BOOST, 0, 1)
      : isHovered
        ? clamp((baseSurfaceOpacity * effectOpacity) + PART_HOVER_OPACITY_BOOST, 0, 1)
        : baseSurfaceOpacity * effectOpacity;
    const nextSurfaceOpacity = isDimmed ? dimmedSurfaceOpacity : highlightedSurfaceOpacity;
    record.material.transparent = isDimmed || nextSurfaceOpacity < 0.999;
    record.material.opacity = nextSurfaceOpacity;

    if (record.baseColor && record.material.color) {
      record.material.color.copy(
        isSelected
          ? selectedSurfaceColor
          : isHovered
            ? hoveredSurfaceColor
            : effectColor || record.baseColor
      );
    }

    if ("emissive" in record.material && record.material.emissive) {
      if (isSelected) {
        record.material.emissive.set(REFERENCE_SELECTED_COLOR);
      } else if (isHovered) {
        record.material.emissive.set(REFERENCE_HOVER_COLOR);
      } else if (record.baseEmissiveColor && record.baseEmissiveIntensity > 0) {
        record.material.emissive.copy(record.baseEmissiveColor);
      } else {
        record.material.emissive.set(0x000000);
      }
      record.material.emissiveIntensity = isSelected
        ? 0.08
        : isHovered
          ? 0.12
          : effectEmissive
            ? clamp(Number(effectStyle.emissiveIntensity) || 0.22, 0, 2)
            : clamp(Number(record.baseEmissiveIntensity) || 0, 0, 2);
      if (!isSelected && !isHovered && effectEmissive) {
        record.material.emissive.copy(effectEmissive);
      }
    }

    if (record.edgeMaterial) {
      record.edgeMaterial.color?.set?.(
        isSelected
          ? selectedEdgeColor
          : isHovered
            ? hoveredEdgeColor
            : effectEdgeColor || baseEdgeColor
      );
      syncLineMaterialOpacity(record.edgeMaterial, isSelected
        ? baseEdgeOpacity * effectEdgeOpacity
        : isHovered
          ? baseEdgeOpacity * effectEdgeOpacity
          : isDimmed
            ? dimmedEdgeOpacity
            : baseEdgeOpacity * effectEdgeOpacity);
    }
  }
}

function resetParameterEffects(records) {
  for (const record of Array.isArray(records) ? records : []) {
    record.effectMatrix = null;
    record.effectStyle = null;
    record.effectVisible = null;
    record.effectHighlighted = false;
  }
}

function boundsCorners(THREE, bounds) {
  const min = Array.isArray(bounds?.min) ? bounds.min : [0, 0, 0];
  const max = Array.isArray(bounds?.max) ? bounds.max : [1, 1, 1];
  return [
    [min[0], min[1], min[2]],
    [min[0], min[1], max[2]],
    [min[0], max[1], min[2]],
    [min[0], max[1], max[2]],
    [max[0], min[1], min[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], min[2]],
    [max[0], max[1], max[2]]
  ].map((corner) => new THREE.Vector3(
    toNumber(corner[0]),
    toNumber(corner[1]),
    toNumber(corner[2])
  ));
}

function transformedBounds(THREE, bounds, matrix = null) {
  if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
    return null;
  }
  if (!(matrix instanceof THREE.Matrix4)) {
    return {
      min: [...bounds.min],
      max: [...bounds.max]
    };
  }
  const corners = boundsCorners(THREE, bounds).map((corner) => corner.applyMatrix4(matrix));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const corner of corners) {
    min[0] = Math.min(min[0], corner.x);
    min[1] = Math.min(min[1], corner.y);
    min[2] = Math.min(min[2], corner.z);
    max[0] = Math.max(max[0], corner.x);
    max[1] = Math.max(max[1], corner.y);
    max[2] = Math.max(max[2], corner.z);
  }
  return min.every(Number.isFinite) && max.every(Number.isFinite) ? { min, max } : null;
}

function mergeBoundsList(boundsList) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let count = 0;
  for (const bounds of Array.isArray(boundsList) ? boundsList : []) {
    if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
      continue;
    }
    count += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], toNumber(bounds.min[axis]));
      max[axis] = Math.max(max[axis], toNumber(bounds.max[axis]));
    }
  }
  return count > 0 && min.every(Number.isFinite) && max.every(Number.isFinite) ? { min, max } : null;
}

function effectiveBoundsFromRecords(THREE, records, fallbackBounds) {
  const boundsList = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (record.effectVisible === false) {
      continue;
    }
    const baseMatrix = buildPartTransformMatrix(THREE, record.baseTransform);
    const effectMatrix = record.effectMatrix instanceof THREE.Matrix4 ? record.effectMatrix.clone() : null;
    const combinedMatrix = effectMatrix ? effectMatrix.multiply(baseMatrix) : baseMatrix;
    boundsList.push(transformedBounds(THREE, record.partBounds, combinedMatrix));
  }
  return mergeBoundsList(boundsList) || fallbackBounds;
}

function runParameterSetup(THREE, runtime, parameters, meshData, callbacks = {}) {
  const definition = parameters?.definition || null;
  const module = definition?.module || null;
  if (!definition || !module?.setup) {
    return;
  }
  const effectsByPartId = new Map();
  const features = resolveStepModuleFeatures(definition, {
    meshData,
    selectorRuntime: parameters?.selectorRuntime || null
  });
  const ctx = buildStepModuleContext({
    runtime,
    stepModuleRuntime: parameters,
    features,
    effects: createStepModuleEffectsApi(THREE, {
      meshData,
      features,
      runtime,
      effectsByPartId
    }),
    cleanup: (cleanup) => {
      if (typeof cleanup === "function") {
        runtime.cleanups.push(cleanup);
      }
    }
  });
  try {
    module.setup(ctx);
  } catch (error) {
    callbacks.onWarning?.({
      title: "STEP module setup failed",
      message: error instanceof Error ? error.message : String(error),
      error
    });
  }
}

function cleanupParameterRuntime(runtime, parameters, callbacks = {}) {
  while (runtime.cleanups.length) {
    try {
      runtime.cleanups.pop()?.();
    } catch (error) {
      callbacks.onWarning?.({
        title: "STEP module cleanup failed",
        message: error instanceof Error ? error.message : String(error),
        error
      });
    }
  }
  const module = parameters?.definition?.module || null;
  if (!module?.dispose) {
    return;
  }
  const ctx = buildStepModuleContext({
    runtime,
    stepModuleRuntime: parameters,
    features: {},
    effects: {},
    cleanup: () => {}
  });
  try {
    module.dispose(ctx);
  } catch (error) {
    callbacks.onWarning?.({
      title: "STEP module dispose failed",
      message: error instanceof Error ? error.message : String(error),
      error
    });
  }
}

function applyParameters(THREE, runtime, parameters, meshData, callbacks = {}) {
  const definition = parameters?.definition || null;
  const module = definition?.module || null;
  if (!definition || !module) {
    resetParameterEffects(runtime.displayRecords);
    for (const record of runtime.displayRecords) {
      applyDisplayRecordTransform(THREE, record);
    }
    return runtime.baseBounds;
  }

  const effectsByPartId = new Map();
  const features = resolveStepModuleFeatures(definition, {
    meshData,
    selectorRuntime: parameters?.selectorRuntime || null
  });
  const effects = createStepModuleEffectsApi(THREE, {
    meshData,
    features,
    runtime,
    effectsByPartId
  });
  const ctx = buildStepModuleContext({
    runtime,
    stepModuleRuntime: parameters,
    features,
    effects,
    cleanup: (cleanup) => {
      if (typeof cleanup === "function") {
        runtime.cleanups.push(cleanup);
      }
    }
  });

  try {
    module.update?.(ctx);
    module.render?.(ctx);
  } catch (error) {
    callbacks.onWarning?.({
      title: "STEP module update failed",
      message: error instanceof Error ? error.message : String(error),
      error
    });
  }

  applyStepModuleEffectsToRecords(THREE, runtime.displayRecords, effectsByPartId);
  for (const record of runtime.displayRecords) {
    applyDisplayRecordTransform(THREE, record);
  }
  return effectiveBoundsFromRecords(THREE, runtime.displayRecords, runtime.baseBounds);
}

function buildStepClipPlane(THREE, clip, bounds, modelOffset = null) {
  const normalized = normalizeStepClipSettings(clip);
  if (!normalized.enabled || !bounds) {
    return null;
  }
  const index = axisIndex(normalized.axis);
  const boundsMin = Array.isArray(bounds?.min) ? bounds.min : [0, 0, 0];
  const boundsMax = Array.isArray(bounds?.max) ? bounds.max : boundsMin;
  const min = toNumber(boundsMin[index]);
  const max = toNumber(boundsMax[index]);
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const position = low + ((high - low) * normalized.offset);
  const normal = new THREE.Vector3(
    index === 0 ? 1 : 0,
    index === 1 ? 1 : 0,
    index === 2 ? 1 : 0
  );
  if (normalized.invert) {
    normal.multiplyScalar(-1);
  }
  const point = modelOffset?.clone ? modelOffset.clone() : new THREE.Vector3(0, 0, 0);
  point.setComponent(index, point.getComponent(index) + position);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
}

function syncMaterialClipPlanes(material, clipPlanes) {
  if (!material) {
    return;
  }
  const materials = Array.isArray(material) ? material : [material];
  const clippingEnabled = Array.isArray(clipPlanes) && clipPlanes.length > 0;
  for (const item of materials) {
    if (!item) {
      continue;
    }
    const previousEnabled = item.userData?.cadClipPlaneEnabled === true;
    const previousCount = Number(item.userData?.cadClipPlaneCount) || 0;
    const previousShaderClipping = item.clipping === true;
    item.clippingPlanes = clippingEnabled ? clipPlanes : null;
    item.clipIntersection = false;
    item.clipShadows = clippingEnabled;
    if ("clipping" in item) {
      item.clipping = clippingEnabled;
    }
    item.userData = {
      ...(item.userData || {}),
      cadClipPlaneEnabled: clippingEnabled,
      cadClipPlaneCount: clippingEnabled ? clipPlanes.length : 0
    };
    if (
      previousEnabled !== clippingEnabled ||
      previousCount !== (clippingEnabled ? clipPlanes.length : 0) ||
      previousShaderClipping !== (item.clipping === true)
    ) {
      item.needsUpdate = true;
    }
  }
}

function syncClip(runtime, clip, bounds, modelOffset = null) {
  const clipPlane = buildStepClipPlane(runtime.THREE, clip, bounds, modelOffset);
  const clipPlanes = clipPlane ? [clipPlane] : [];
  runtime.activeClipPlane = clipPlane;
  runtime.activeClipPlanes = clipPlanes;
  for (const record of runtime.displayRecords) {
    syncMaterialClipPlanes(record.material, clipPlanes);
    syncMaterialClipPlanes(record.edgeMaterial, clipPlanes);
    syncMaterialClipPlanes(record.silhouette?.material, clipPlanes);
  }
}

function normalizeSelection(selection = {}) {
  return selection && typeof selection === "object" ? selection : {};
}

function resolveMaterialSettings(theme, settings = {}) {
  if (settings.materialSettings && typeof settings.materialSettings === "object") {
    return settings.materialSettings;
  }
  return theme.materials || {};
}

function resolvePartsToRender(meshData, theme, settings) {
  if (Array.isArray(settings.parts)) {
    return settings.parts.filter((part) => toNumber(part?.vertexCount) > 0 && toNumber(part?.triangleCount) > 0);
  }
  const parts = toArray(meshData?.parts).filter((part) => toNumber(part?.vertexCount) > 0 && toNumber(part?.triangleCount) > 0);
  if (!parts.length) {
    return [];
  }
  if (settings.renderPartsIndividually === true) {
    return parts;
  }
  if (settings.renderPartsIndividually === false) {
    const pickableParts = toArray(settings.pickableParts).filter((part) => toNumber(part?.vertexCount) > 0 && toNumber(part?.triangleCount) > 0);
    if (pickableParts.length) {
      return pickableParts;
    }
    const hasFillRotation = theme?.materials?.cycleColors === true &&
      Array.isArray(theme?.materials?.fillColors) &&
      theme.materials.fillColors.length > 1;
    return hasFillRotation ? parts : [];
  }
  return parts;
}

function addEdgeObject(THREE, runtime, record, edgeGeometry, settings) {
  const edgeSettings = runtime.edgeSettings;
  const baseTheme = runtime.baseTheme;
  const displayMode = runtime.displayMode;
  const rawResult = typeof settings.callbacks?.createEdgeObject === "function"
    ? settings.callbacks.createEdgeObject({
        THREE,
        geometry: edgeGeometry,
        edgeSettings,
        baseTheme,
        partId: record.partId,
        displayMode,
        thickness: getEdgeThickness(edgeSettings, baseTheme)
      })
    : createDefaultEdgeObject(THREE, edgeGeometry, baseTheme, edgeSettings, record.partId, displayMode);
  const { object, material } = normalizeEdgeResult(rawResult);
  if (!object) {
    return;
  }
  object.userData.partId = record.partId;
  record.edges = object;
  record.edgeMaterial = material;
  record.baseEdgeColor = material?.color?.isColor ? material.color.clone() : new THREE.Color(edgeSettings?.color || baseTheme?.edge || DEFAULT_THEME.edge);
  record.baseEdgeOpacity = Number.isFinite(Number(material?.opacity)) ? Number(material.opacity) : 1;
  runtime.edgesGroup.add(object);
}

function buildDisplayRecords(THREE, runtime, meshData, settings) {
  const theme = runtime.theme;
  const materialSettings = runtime.materialSettings;
  const displayMode = runtime.displayMode;
  const baseTheme = runtime.baseTheme;
  const edgeSettings = runtime.edgeSettings;
  const bounds = meshData.bounds || boundsFromVertices(meshData.vertices || []);
  const { radius } = centerAndRadiusFromBounds(THREE, bounds, runtime.scale);
  const useSilhouette = settings.silhouette !== false &&
    displayMode !== CAD_DISPLAY_MODE.WIREFRAME &&
    edgeSettings.enabled &&
    edgeSettings.silhouette;
  const renderParts = resolvePartsToRender(meshData, theme, settings);
  const partFillIndexMap = buildPartFillIndexMap(renderParts);
  const useWholeMesh = renderParts.length === 0;
  const records = [];

  const makeRecord = ({ part = null, geometryEntry, fillIndex = 0, baseTransform = null }) => {
    const partId = part ? String(part?.id || part?.occurrenceId || `part:${records.length}`) : MODEL_PART_ID;
    const forceFill = materialSettings.overrideSourceColors === true || displayMode === CAD_DISPLAY_MODE.WIREFRAME;
    const sourceVertexColors = !!geometryEntry.geometry.getAttribute("color");
    const sourceColor = sourceColorForPart(THREE, part, meshData);
    const hasSourceColor = sourceVertexColors || !!sourceColor;
    const hasVertexColors = !forceFill && sourceVertexColors;
    const baseColor = resolveSourceBaseColor(THREE, {
      hasVertexColors,
      sourceColor: forceFill ? null : sourceColor,
      materialSettings,
      fallbackColor: materialSettings.defaultColor || baseTheme?.surface || DEFAULT_THEME.surface,
      fillIndex,
      forceFill: forceFill || !hasSourceColor
    });
    const material = displayMode === CAD_DISPLAY_MODE.WIREFRAME
      ? createWireframeSurfaceMaterial(THREE, materialSettings, fillIndex)
      : createSurfaceMaterial(THREE, baseTheme, {
          color: baseColor,
          useVertexColors: hasVertexColors
        });
    if (edgeSettings.enabled && displayMode !== CAD_DISPLAY_MODE.WIREFRAME) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    }
    const mesh = new THREE.Mesh(geometryEntry.geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.partId = partId;
    const faceIds = part
      ? settings.callbacks?.faceIdsForPart?.(part)
      : settings.callbacks?.faceIdsForMesh?.(meshData);
    if (faceIds) {
      mesh.userData.faceIds = faceIds;
    }
    runtime.modelGroup.add(mesh);

    const record = {
      partId,
      mesh,
      edges: null,
      silhouette: null,
      material,
      edgeMaterial: null,
      baseColor,
      sourceColor,
      baseTransform,
      partCenter: readBoundsCenter(THREE, part?.bounds || bounds),
      partBounds: part?.bounds || part?.sourceBounds || bounds,
      effectMatrix: null,
      effectStyle: null,
      effectVisible: null,
      effectHighlighted: false,
      fillIndex,
      hasSourceColor,
      hasVertexColors,
      useVertexColors: hasVertexColors,
      rawColors: geometryEntry.rawColors,
      geometry: geometryEntry.geometry,
      baseOpacity: Number.isFinite(Number(material.opacity)) ? Number(material.opacity) : 1,
      baseEmissiveColor: baseColor ? baseColor.clone() : null,
      baseEmissiveIntensity: 0,
      baseEdgeColor: null,
      baseEdgeOpacity: 1
    };

    if (useSilhouette) {
      const silhouette = createSilhouetteMesh(THREE, geometryEntry.geometry, edgeSettings, radius);
      if (silhouette) {
        record.silhouette = silhouette;
        runtime.modelGroup.add(silhouette);
      }
    }

    if (edgeSettings.enabled || displayMode === CAD_DISPLAY_MODE.WIREFRAME) {
      addEdgeObject(
        THREE,
        runtime,
        record,
        buildEdgeGeometry(THREE, meshData, part, geometryEntry.geometry, displayMode),
        settings
      );
    }

    applyMaterialSettingsToRecord(THREE, record, materialSettings, {
      baseTheme,
      displayMode
    });
    applyDisplayRecordTransform(THREE, record);
    records.push(record);
  };

  if (useWholeMesh) {
    const geometryEntry = buildWholeGeometryEntry(THREE, meshData, settings.recomputeNormals === true);
    if (geometryEntry) {
      makeRecord({ geometryEntry, fillIndex: 0 });
    }
  } else {
    for (const part of renderParts) {
      const geometryEntry = buildPartGeometryEntry(THREE, meshData, part, settings.recomputeNormals === true);
      if (!geometryEntry) {
        continue;
      }
      makeRecord({
        part,
        geometryEntry,
        fillIndex: partFillIndexMap.get(part) ?? records.length,
        baseTransform: displayTransformForPart(meshData, part, settings.renderPartsIndividually === true)
      });
    }
  }

  return records;
}

function settingsSignature(meshData, theme, settings) {
  return JSON.stringify({
    meshData: meshData ? "mesh" : "",
    displayMode: resolveThemeDisplayMode(theme),
    parts: cacheKey(resolvePartsToRender(meshData, theme, settings)),
    recomputeNormals: settings.recomputeNormals === true,
    edgesEnabled: theme?.edges?.enabled !== false,
    silhouette: settings.silhouette !== false && theme?.edges?.silhouette === true
  });
}

function normalizeSettings(settings = {}) {
  const theme = normalizeThemeSettings(settings.theme || settings.themeSettings || settings.settings || undefined);
  const displayMode = normalizeDisplayMode(resolveThemeDisplayMode(theme));
  const scale = normalizeCadSceneScale(settings.scale ?? settings.sceneScale ?? settings.sceneScaleMode);
  const callbacks = settings.callbacks && typeof settings.callbacks === "object" ? settings.callbacks : {};
  const baseTheme = settings.baseTheme && typeof settings.baseTheme === "object" ? settings.baseTheme : DEFAULT_THEME;
  return {
    ...settings,
    theme,
    displayMode,
    scale,
    callbacks,
    baseTheme,
    selection: normalizeSelection(settings.selection),
    clip: normalizeStepClipSettings(settings.clip ?? settings.clipSettings),
    parameters: settings.parameters || settings.stepModuleRuntime || null,
    materialSettings: resolveMaterialSettings(theme, settings)
  };
}

function setRuntimeTheme(runtime, settings) {
  runtime.theme = settings.theme;
  runtime.displayMode = settings.displayMode;
  runtime.scale = settings.scale;
  runtime.baseTheme = settings.baseTheme;
  runtime.edgeSettings = resolveThemeDisplayEdgeSettings(settings.theme);
  runtime.materialSettings = settings.materialSettings;
}

export function buildCadScene(THREE, meshData, settings = {}) {
  if (!THREE) {
    throw new Error("buildCadScene requires THREE");
  }
  const root = new THREE.Group();
  const modelGroup = new THREE.Group();
  const edgesGroup = new THREE.Group();
  root.name = "CadSceneRoot";
  modelGroup.name = "CadSceneModel";
  edgesGroup.name = "CadSceneEdges";
  root.add(modelGroup);
  root.add(edgesGroup);

  const normalized = normalizeSettings(settings);
  const baseBounds = meshData?.bounds || boundsFromVertices(meshData?.vertices || []);
  const runtime = {
    THREE,
    root,
    modelGroup,
    edgesGroup,
    displayRecords: [],
    records: [],
    baseBounds,
    bounds: baseBounds,
    modelBounds: baseBounds,
    modelRadius: centerAndRadiusFromBounds(THREE, baseBounds, normalized.scale).radius,
    cleanups: [],
    activeClipPlane: null,
    activeClipPlanes: [],
    requestRender: () => {}
  };
  setRuntimeTheme(runtime, normalized);

  let disposed = false;
  let currentSettings = normalized;
  let currentSignature = "";
  let activeParameters = null;

  const rebuild = (nextSettings = currentSettings) => {
    clearGroup(modelGroup);
    clearGroup(edgesGroup);
    setRuntimeTheme(runtime, nextSettings);
    runtime.baseBounds = meshData?.bounds || boundsFromVertices(meshData?.vertices || []);
    runtime.displayRecords = buildDisplayRecords(THREE, runtime, meshData, nextSettings);
    runtime.records = runtime.displayRecords;
    runtime.bounds = runtime.baseBounds;
    runtime.modelBounds = runtime.baseBounds;
    runtime.modelRadius = centerAndRadiusFromBounds(THREE, runtime.baseBounds, runtime.scale).radius;
    currentSignature = settingsSignature(meshData, runtime.theme, nextSettings);
  };

  const applyMutableState = (nextSettings = currentSettings) => {
    setRuntimeTheme(runtime, nextSettings);
    for (const record of runtime.displayRecords) {
      applyMaterialSettingsToRecord(THREE, record, runtime.materialSettings, {
        baseTheme: runtime.baseTheme,
        displayMode: runtime.displayMode
      });
    }
    if (activeParameters !== nextSettings.parameters) {
      cleanupParameterRuntime(runtime, activeParameters, nextSettings.callbacks);
      activeParameters = nextSettings.parameters;
      runParameterSetup(THREE, runtime, activeParameters, meshData, nextSettings.callbacks);
    }
    const effectiveBounds = applyParameters(THREE, runtime, activeParameters, meshData, nextSettings.callbacks);
    runtime.bounds = effectiveBounds || runtime.baseBounds;
    runtime.modelBounds = runtime.bounds;
    runtime.modelRadius = centerAndRadiusFromBounds(THREE, runtime.bounds, runtime.scale).radius;
    applyPartVisualState(THREE, runtime.displayRecords, {
      baseTheme: runtime.baseTheme,
      edgeSettings: runtime.edgeSettings,
      ...nextSettings.selection,
      showEdges: nextSettings.selection?.showEdges !== false
    });
    syncClip(runtime, nextSettings.clip, runtime.bounds, nextSettings.modelOffset || modelGroup.position);
  };

  rebuild(currentSettings);
  applyMutableState(currentSettings);

  const api = {
    root,
    modelGroup,
    edgesGroup,
    get displayRecords() {
      return runtime.displayRecords;
    },
    get records() {
      return runtime.displayRecords;
    },
    get bounds() {
      return runtime.bounds;
    },
    get radius() {
      return runtime.modelRadius;
    },
    get runtime() {
      return runtime;
    },
    update(nextSettings = {}) {
      if (disposed) {
        return api;
      }
      const mergedSettings = {
        ...currentSettings,
        ...nextSettings,
        selection: {
          ...(currentSettings.selection || {}),
          ...(nextSettings.selection || {})
        },
        callbacks: {
          ...(currentSettings.callbacks || {}),
          ...(nextSettings.callbacks || {})
        }
      };
      if (
        Object.prototype.hasOwnProperty.call(nextSettings, "theme") &&
        !Object.prototype.hasOwnProperty.call(nextSettings, "materialSettings")
      ) {
        delete mergedSettings.materialSettings;
      }
      currentSettings = normalizeSettings(mergedSettings);
      const nextSignature = settingsSignature(meshData, currentSettings.theme, currentSettings);
      if (nextSignature !== currentSignature) {
        rebuild(currentSettings);
      }
      applyMutableState(currentSettings);
      return api;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cleanupParameterRuntime(runtime, activeParameters, currentSettings.callbacks);
      clearGroup(root);
    }
  };

  return api;
}

export function fitCameraToScene(THREE, camera, bounds, {
  direction = [1, -1, 0.8],
  up = [0, 0, 1],
  width = 1400,
  height = 900,
  padding = 0.12,
  scale = CAD_SCENE_SCALE.CAD,
  lockedHalfHeight = null
} = {}) {
  const sceneScale = normalizeCadSceneScale(scale);
  const settings = getSceneScaleSettings(sceneScale);
  const { center, radius } = centerAndRadiusFromBounds(THREE, bounds, sceneScale);
  const viewDirection = new THREE.Vector3(...direction).normalize();
  const viewUp = new THREE.Vector3(...up).normalize();
  const distance = Math.max(radius * 3.2, settings.minModelRadius * 10);
  camera.position.copy(center).add(viewDirection.multiplyScalar(distance));
  camera.up.copy(viewUp);
  camera.lookAt(center);

  const aspect = Math.max(width / Math.max(height, 1), 0.01);
  const right = new THREE.Vector3().crossVectors(viewDirection, viewUp).normalize();
  const screenUp = new THREE.Vector3().crossVectors(right, viewDirection).normalize();
  const corners = boundsCorners(THREE, bounds);
  const xs = corners.map((corner) => corner.dot(right));
  const ys = corners.map((corner) => corner.dot(screenUp));
  const minSpan = settings.minModelRadius;
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), minSpan);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), minSpan);
  const safeContentScale = Math.max(1 - (clamp(Number(padding) || 0, 0.1, 0.4) * 2), 0.1);
  const halfHeight = lockedHalfHeight || Math.max(
    spanY / (2 * safeContentScale),
    spanX / (2 * aspect * safeContentScale),
    minSpan / 2
  );
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.near = 0.01;
  camera.far = Math.max(distance + radius * 6, sceneScale === CAD_SCENE_SCALE.URDF ? 10 : 1000);
  camera.updateProjectionMatrix?.();
  return {
    center,
    radius,
    halfHeight,
    distance
  };
}
