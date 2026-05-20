import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  THEME_EDGE_SOURCES,
  resolveThemeFillColor,
  resolveThemeDisplayEdgeSettings,
  resolveThemeDisplayMode
} from "./themeSettings.js";
import {
  buildCadScene
} from "./cadScene.js";
import {
  hasTopologyDisplayEdgeProxy
} from "./topologyDisplayEdges.js";
import {
  createDisplayEdgeObject as createRenderDisplayEdgeObject,
  createTopologyDisplayEdgeObject as createRenderTopologyDisplayEdgeObject,
  syncLineMaterialOpacity,
  syncScreenSpaceLineMaterialResolution
} from "./renderEdges.js";
import {
  addFloor as addSharedFloor,
  applyEnvironment as applySharedEnvironment,
  applyLighting as applySharedLighting,
  boundsCorners as sharedBoundsCorners,
  boundsFromVertices as sharedBoundsFromVertices,
  centerAndRadiusFromBounds as sharedCenterAndRadiusFromBounds,
  colorTextureFromBackground as sharedColorTextureFromBackground,
  configurePngRenderer,
  createSharedRenderOptions,
  drawBurnedInLabel as drawSharedBurnedInLabel,
  fitOrthographicCamera,
  frameHalfHeightForView as sharedFrameHalfHeightForView,
  framePadding as sharedFramePadding,
  inferRenderSceneScale,
  lockedFrameHalfHeight as sharedLockedFrameHalfHeight,
  normalizeRenderSceneScale as normalizeSharedRenderSceneScale,
  outputSize as sharedOutputSize,
  RENDER_SCENE_SCALE,
  RENDER_VIEW_PRESETS,
  rendererDataUrlWithOptionalLabel as sharedRendererDataUrlWithOptionalLabel,
  resolveRenderView,
  resolveThemeSettings,
  shouldBurnInViewLabels as sharedShouldBurnInViewLabels
} from "./renderOptions.js";
import { resolveStepModuleFeatures } from "./stepModule.js";
import {
  applyStepModuleEffectsToRecords,
  buildPartTransformMatrix,
  buildStepModuleContext,
  createStepModuleEffectsApi,
  displayTransformForPart
} from "./stepModuleEffects.js";

const DEFAULT_RENDER_SCALE = 1;
const DEFAULT_RENDER_THEME_ID = "technical";
const RENDER_SCENE_SCALE_SETTINGS = Object.freeze({
  [RENDER_SCENE_SCALE.CAD]: Object.freeze({
    minBoundsSpan: 1,
    minModelRadius: 1,
    minFloorSize: 100,
    minCameraDistance: 10,
    minCameraFar: 1000
  }),
  [RENDER_SCENE_SCALE.URDF]: Object.freeze({
    minBoundsSpan: 0.05,
    minModelRadius: 0.05,
    minFloorSize: 0.5,
    minCameraDistance: 0.5,
    minCameraFar: 10
  })
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeRenderSceneScale(value) {
  return normalizeSharedRenderSceneScale(value);
}

function resolveRenderSceneScale(job = {}, meshData = {}) {
  const explicit = String(job.render?.scale || job.render?.sceneScale || job.render?.sceneScaleMode || job.scale || job.sceneScale || "").trim().toLowerCase();
  return inferRenderSceneScale({
    explicit,
    kind: job.resolved?.kind || job.kind,
    parts: meshData?.parts
  });
}

function resolveTheme(job = {}) {
  return resolveThemeSettings(job, { defaultThemeId: DEFAULT_RENDER_THEME_ID });
}

function resolveView(camera = "iso") {
  return resolveRenderView(camera, RENDER_VIEW_PRESETS);
}

function boundsFromVertices(vertices) {
  return sharedBoundsFromVertices(vertices);
}

function centerAndRadiusFromBounds(bounds, sceneScale = RENDER_SCENE_SCALE.CAD) {
  return sharedCenterAndRadiusFromBounds(bounds, sceneScale, RENDER_SCENE_SCALE_SETTINGS);
}

function colorTextureFromBackground(background, width, height) {
  return sharedColorTextureFromBackground(background, width, height);
}

async function applyEnvironment(scene, themeSettings, warnings) {
  return applySharedEnvironment(scene, themeSettings, warnings);
}

function applyLighting(scene, themeSettings) {
  return applySharedLighting(scene, themeSettings);
}

function srgbColorArrayFromHex(value) {
  const color = new THREE.Color(value || "#ffffff");
  return [color.r, color.g, color.b];
}

function sourceColorForPart(part, meshData) {
  const color = String(part?.color || meshData?.sourceColor || "").trim();
  return color || null;
}

function createMaterial(themeSettings, meshData, part, fillIndex, forceFill = false) {
  const materials = themeSettings.materials || {};
  const sourceColor = !forceFill && sourceColorForPart(part, meshData);
  const color = sourceColor || resolveThemeFillColor(materials, fillIndex);
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: clamp(toFiniteNumber(materials.roughness, 0.6), 0, 1),
    metalness: clamp(toFiniteNumber(materials.metalness, 0), 0, 1),
    clearcoat: clamp(toFiniteNumber(materials.clearcoat, 0), 0, 1),
    clearcoatRoughness: clamp(toFiniteNumber(materials.clearcoatRoughness, 0.5), 0, 1),
    transparent: toFiniteNumber(materials.opacity, 1) < 0.999,
    opacity: clamp(toFiniteNumber(materials.opacity, 1), 0, 1),
    envMapIntensity: clamp(toFiniteNumber(materials.envMapIntensity, 0.4), 0, 4),
    emissive: new THREE.Color(color).multiplyScalar(clamp(toFiniteNumber(materials.emissiveIntensity, 0), 0, 2)),
    vertexColors: !forceFill && Boolean(meshData?.has_source_colors && meshData?.colors?.length === meshData?.vertices?.length)
  });
}

function geometryForPart(meshData, part) {
  const vertices = meshData.vertices || new Float32Array(0);
  const indices = meshData.indices || new Uint32Array(0);
  const normals = meshData.normals || new Float32Array(0);
  const colors = meshData.colors || new Float32Array(0);
  const vertexOffset = Math.max(0, Math.floor(toFiniteNumber(part?.vertexOffset, 0)));
  const vertexCount = Math.max(0, Math.floor(toFiniteNumber(part?.vertexCount, 0)));
  const triangleOffset = Math.max(0, Math.floor(toFiniteNumber(part?.triangleOffset, 0)));
  const triangleCount = Math.max(0, Math.floor(toFiniteNumber(part?.triangleCount, 0)));
  if (!vertexCount || !triangleCount) {
    return null;
  }
  const positionStart = vertexOffset * 3;
  const positionEnd = positionStart + vertexCount * 3;
  const localVertices = vertices.slice(positionStart, positionEnd);
  const rawIndices = indices.slice(triangleOffset * 3, triangleOffset * 3 + triangleCount * 3);
  const localIndices = new Uint32Array(rawIndices.length);
  for (let index = 0; index < rawIndices.length; index += 1) {
    localIndices[index] = Math.max(0, Number(rawIndices[index]) - vertexOffset);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(localVertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(localIndices, 1));
  if (normals.length >= positionEnd) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals.slice(positionStart, positionEnd)), 3));
  } else {
    geometry.computeVertexNormals();
  }
  if (colors.length >= positionEnd) {
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors.slice(positionStart, positionEnd)), 3));
  }
  return geometry;
}

function wholeGeometry(meshData) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(meshData.vertices || []), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshData.indices || []), 1));
  if (meshData.normals?.length === meshData.vertices?.length) {
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(meshData.normals), 3));
  } else {
    geometry.computeVertexNormals();
  }
  if (meshData.colors?.length === meshData.vertices?.length) {
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(meshData.colors), 3));
  }
  return geometry;
}

function makeLineSegments(geometry, edgeSettings, renderMode) {
  if (renderMode === "wireframe") {
    const wireGeometry = new THREE.WireframeGeometry(geometry);
    return new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({
      color: edgeSettings.color || "#111827",
      transparent: true,
      opacity: Math.max(toFiniteNumber(edgeSettings.opacity, 0.92), 0.9),
      depthTest: false,
      depthWrite: false
    }));
  }
  const edgeGeometry = new THREE.EdgesGeometry(geometry, renderMode === "wireframe" ? 1 : 16);
  const material = new THREE.LineBasicMaterial({
    color: edgeSettings.color || "#132232",
    transparent: true,
    opacity: toFiniteNumber(edgeSettings.opacity, 0.45),
    depthTest: true,
    depthWrite: false
  });
  return new THREE.LineSegments(edgeGeometry, material);
}

function makeSilhouetteMesh(geometry, edgeSettings, offset) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(edgeSettings.color || "#111827") },
      opacity: { value: clamp(toFiniteNumber(edgeSettings.opacity, 0.9), 0, 1) },
      offset: { value: Math.max(0, offset) }
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
  const outline = new THREE.Mesh(geometry, material);
  outline.renderOrder = -1;
  return outline;
}

function colorCloneFromMaterial(material) {
  return material?.color?.isColor ? material.color.clone() : new THREE.Color("#ffffff");
}

function renderRecordForPart({
  partId,
  mesh,
  edges = null,
  silhouette = null,
  partBounds = null,
  baseTransform = null,
  fillIndex = 0
}) {
  return {
    partId: String(partId || "").trim() || "__model__",
    mesh,
    edges,
    silhouette,
    material: mesh?.material || null,
    edgeMaterial: edges?.material || null,
    baseColor: colorCloneFromMaterial(mesh?.material),
    baseOpacity: Number.isFinite(Number(mesh?.material?.opacity)) ? Number(mesh.material.opacity) : 1,
    baseEdgeColor: colorCloneFromMaterial(edges?.material),
    baseEdgeOpacity: Number.isFinite(Number(edges?.material?.opacity)) ? Number(edges.material.opacity) : 1,
    baseTransform,
    partBounds,
    effectMatrix: null,
    effectStyle: null,
    effectVisible: null,
    effectHighlighted: false,
    fillIndex
  };
}

function buildModel(scene, meshData, themeSettings, renderMode = "solid", sceneScale = RENDER_SCENE_SCALE.CAD) {
  const modelGroup = new THREE.Group();
  const records = [];
  const edgeSettings = resolveThemeDisplayEdgeSettings(themeSettings);
  const { radius } = centerAndRadiusFromBounds(meshData.bounds || boundsFromVertices(meshData.vertices || []), sceneScale);
  const silhouetteOffset = edgeSettings.enabled && renderMode !== "wireframe" && edgeSettings.silhouette
    ? radius * clamp(toFiniteNumber(edgeSettings.silhouetteScale, 0.004), 0, 0.04)
    : 0;
  const forceFill = themeSettings.materials?.overrideSourceColors === true || renderMode === "wireframe";
  const parts = toArray(meshData.parts).filter((part) => toFiniteNumber(part?.vertexCount) > 0 && toFiniteNumber(part?.triangleCount) > 0);
  const renderParts = parts.length > 0 ? parts : null;
  if (renderParts) {
    for (let index = 0; index < renderParts.length; index += 1) {
      const part = renderParts[index];
      const geometry = geometryForPart(meshData, part);
      if (!geometry) {
        continue;
      }
      const material = renderMode === "wireframe"
        ? new THREE.MeshBasicMaterial({
            color: resolveThemeFillColor(themeSettings.materials || {}, index),
            transparent: true,
            opacity: 0.035,
            depthWrite: false
          })
        : createMaterial(themeSettings, meshData, part, index, forceFill);
      if (edgeSettings.enabled && renderMode !== "wireframe") {
        material.polygonOffset = true;
        material.polygonOffsetFactor = 1;
        material.polygonOffsetUnits = 1;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.partId = String(part?.id || part?.occurrenceId || `part:${index}`);
      let silhouette = null;
      if (silhouetteOffset > 0) {
        silhouette = makeSilhouetteMesh(geometry, edgeSettings, silhouetteOffset);
        modelGroup.add(silhouette);
      }
      modelGroup.add(mesh);
      let edges = null;
      if (edgeSettings.enabled || renderMode === "wireframe") {
        edges = makeLineSegments(geometry, edgeSettings, renderMode);
        modelGroup.add(edges);
      }
      records.push(renderRecordForPart({
        partId: part?.id || part?.occurrenceId || `part:${index}`,
        mesh,
        edges,
        silhouette,
        partBounds: part?.sourceBounds || part?.bounds || null,
        baseTransform: displayTransformForPart(meshData, part, true),
        fillIndex: index
      }));
    }
  } else {
    const geometry = wholeGeometry(meshData);
    const material = renderMode === "wireframe"
      ? new THREE.MeshBasicMaterial({
          color: resolveThemeFillColor(themeSettings.materials || {}, 0),
          transparent: true,
          opacity: 0.035,
          depthWrite: false
        })
      : createMaterial(themeSettings, meshData, null, 0, forceFill);
    if (edgeSettings.enabled && renderMode !== "wireframe") {
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.partId = "__model__";
    let silhouette = null;
    if (silhouetteOffset > 0) {
      silhouette = makeSilhouetteMesh(geometry, edgeSettings, silhouetteOffset);
      modelGroup.add(silhouette);
    }
    modelGroup.add(mesh);
    let edges = null;
    if (edgeSettings.enabled || renderMode === "wireframe") {
      edges = makeLineSegments(geometry, edgeSettings, renderMode);
      modelGroup.add(edges);
    }
    records.push(renderRecordForPart({
      partId: "__model__",
      mesh,
      edges,
      silhouette,
      partBounds: meshData.bounds || boundsFromVertices(meshData.vertices || []),
      fillIndex: 0
    }));
  }
  scene.add(modelGroup);
  return { modelGroup, records };
}

function applyObjectMatrix(object3d, matrix) {
  if (!object3d || !(matrix instanceof THREE.Matrix4)) {
    return;
  }
  object3d.matrixAutoUpdate = false;
  object3d.matrix.copy(matrix);
  object3d.matrixWorldNeedsUpdate = true;
}

function applyRenderRecordTransform(record) {
  const baseMatrix = buildPartTransformMatrix(THREE, record.baseTransform);
  const effectMatrix = record.effectMatrix instanceof THREE.Matrix4 ? record.effectMatrix.clone() : null;
  const combinedMatrix = effectMatrix ? effectMatrix.multiply(baseMatrix) : baseMatrix;
  applyObjectMatrix(record.mesh, combinedMatrix);
  applyObjectMatrix(record.edges, combinedMatrix);
  applyObjectMatrix(record.silhouette, combinedMatrix);
}

function safeColor(value, fallback = null) {
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

function applyTopologyDisplayEdgeSurfaceOffset(records) {
  for (const record of Array.isArray(records) ? records : []) {
    const material = record?.material;
    if (!material) {
      continue;
    }
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    material.needsUpdate = true;
  }
}

function applyStepModuleVisualState(records) {
  for (const record of Array.isArray(records) ? records : []) {
    const style = record.effectStyle && typeof record.effectStyle === "object" ? record.effectStyle : {};
    const visible = record.effectVisible !== false;
    const effectOpacity = Number.isFinite(Number(style.opacity)) ? clamp(Number(style.opacity), 0, 1) : 1;
    const edgeOpacity = Number.isFinite(Number(style.edgeOpacity)) ? clamp(Number(style.edgeOpacity), 0, 1) : effectOpacity;
    const color = safeColor(style.color, record.baseColor);
    const edgeColor = safeColor(style.edgeColor, record.baseEdgeColor);
    const emissive = safeColor(style.emissive, null);

    if (record.mesh) {
      record.mesh.visible = visible;
    }
    if (record.edges) {
      record.edges.visible = visible;
    }
    if (record.silhouette) {
      record.silhouette.visible = visible;
    }
    if (record.material) {
      if (record.material.color && color) {
        record.material.color.copy(record.effectHighlighted ? new THREE.Color("#2563eb") : color);
      }
      const opacity = clamp(record.baseOpacity * effectOpacity, 0, 1);
      record.material.transparent = opacity < 0.999;
      record.material.opacity = opacity;
      if ("emissive" in record.material && record.material.emissive) {
        if (emissive) {
          record.material.emissive.copy(emissive);
          record.material.emissiveIntensity = clamp(Number(style.emissiveIntensity) || 0.22, 0, 2);
        } else if (record.effectHighlighted) {
          record.material.emissive.set("#1d4ed8");
          record.material.emissiveIntensity = 0.08;
        } else {
          record.material.emissive.set(0x000000);
          record.material.emissiveIntensity = 0;
        }
      }
    }
    if (record.edgeMaterial) {
      if (record.edgeMaterial.color && edgeColor) {
        record.edgeMaterial.color.copy(record.effectHighlighted ? new THREE.Color("#1d4ed8") : edgeColor);
      }
      syncLineMaterialOpacity(record.edgeMaterial, record.baseEdgeOpacity * edgeOpacity);
    }
    applyRenderRecordTransform(record);
  }
}

function transformedBounds(bounds, matrix = null) {
  if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
    return null;
  }
  if (!(matrix instanceof THREE.Matrix4)) {
    return {
      min: [...bounds.min],
      max: [...bounds.max]
    };
  }
  const corners = boundsCorners(bounds).map((corner) => corner.applyMatrix4(matrix));
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
      min[axis] = Math.min(min[axis], toFiniteNumber(bounds.min[axis]));
      max[axis] = Math.max(max[axis], toFiniteNumber(bounds.max[axis]));
    }
  }
  return count > 0 && min.every(Number.isFinite) && max.every(Number.isFinite) ? { min, max } : null;
}

function effectiveBoundsFromRecords(records, fallbackBounds) {
  const boundsList = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (record.effectVisible === false) {
      continue;
    }
    const baseMatrix = buildPartTransformMatrix(THREE, record.baseTransform);
    const effectMatrix = record.effectMatrix instanceof THREE.Matrix4 ? record.effectMatrix.clone() : null;
    const combinedMatrix = effectMatrix ? effectMatrix.multiply(baseMatrix) : baseMatrix;
    boundsList.push(transformedBounds(record.partBounds, combinedMatrix));
  }
  return mergeBoundsList(boundsList) || fallbackBounds;
}

function applyStepModuleRuntime(sceneRuntime, stepModuleRuntime, meshData) {
  const definition = stepModuleRuntime?.definition || null;
  const module = definition?.module || null;
  if (!definition || !module) {
    for (const record of sceneRuntime.records) {
      record.effectMatrix = null;
      record.effectStyle = null;
      record.effectVisible = null;
      record.effectHighlighted = false;
    }
    applyStepModuleVisualState(sceneRuntime.records);
    return sceneRuntime.baseBounds;
  }

  const effectsByPartId = new Map();
  const features = resolveStepModuleFeatures(definition, {
    meshData,
    selectorRuntime: stepModuleRuntime?.selectorRuntime || null
  });
  const effects = createStepModuleEffectsApi(THREE, {
    meshData,
    features,
    runtime: sceneRuntime,
    effectsByPartId
  });
  const ctx = buildStepModuleContext({
    runtime: sceneRuntime,
    stepModuleRuntime,
    features,
    effects,
    cleanup: (cleanup) => {
      if (typeof cleanup === "function") {
        sceneRuntime.cleanups.push(cleanup);
      }
    }
  });
  module.update?.(ctx);
  module.render?.(ctx);
  applyStepModuleEffectsToRecords(THREE, sceneRuntime.records, effectsByPartId);
  applyStepModuleVisualState(sceneRuntime.records);
  return effectiveBoundsFromRecords(sceneRuntime.records, sceneRuntime.baseBounds);
}

function setupStepModuleRuntime(sceneRuntime, stepModuleRuntime, meshData) {
  const definition = stepModuleRuntime?.definition || null;
  const module = definition?.module || null;
  if (!definition || !module?.setup) {
    return;
  }
  const effectsByPartId = new Map();
  const features = resolveStepModuleFeatures(definition, {
    meshData,
    selectorRuntime: stepModuleRuntime?.selectorRuntime || null
  });
  const ctx = buildStepModuleContext({
    runtime: sceneRuntime,
    stepModuleRuntime,
    features,
    effects: createStepModuleEffectsApi(THREE, {
      meshData,
      features,
      runtime: sceneRuntime,
      effectsByPartId
    }),
    cleanup: (cleanup) => {
      if (typeof cleanup === "function") {
        sceneRuntime.cleanups.push(cleanup);
      }
    }
  });
  module.setup(ctx);
}

function cleanupStepModuleRuntime(sceneRuntime, stepModuleRuntime) {
  while (sceneRuntime.cleanups.length) {
    sceneRuntime.cleanups.pop()?.();
  }
  const module = stepModuleRuntime?.definition?.module || null;
  if (module?.dispose) {
    const ctx = buildStepModuleContext({
      runtime: sceneRuntime,
      stepModuleRuntime,
      features: {},
      effects: {},
      cleanup: () => {}
    });
    module.dispose(ctx);
  }
}

function addFloor(scene, bounds, themeSettings, sceneScale = RENDER_SCENE_SCALE.CAD) {
  return addSharedFloor(scene, bounds, themeSettings, sceneScale, RENDER_SCENE_SCALE_SETTINGS);
}

function boundsCorners(bounds) {
  return sharedBoundsCorners(bounds);
}

function framePadding(job = {}) {
  return sharedFramePadding(job);
}

function frameHalfHeightForView(view, bounds, width, height, padding = 0.12, sceneScale = RENDER_SCENE_SCALE.CAD) {
  return sharedFrameHalfHeightForView(view, bounds, width, height, padding, sceneScale, RENDER_SCENE_SCALE_SETTINGS);
}

function fitCamera(camera, view, bounds, width, height, lockedHalfHeight = null, padding = 0.12, sceneScale = RENDER_SCENE_SCALE.CAD) {
  return fitOrthographicCamera(camera, view, bounds, width, height, {
    lockedHalfHeight,
    padding,
    sceneScale,
    settingsByScale: RENDER_SCENE_SCALE_SETTINGS
  });
}

function lockedFrameHalfHeight(outputs, bounds, width, height, job, sceneScale = RENDER_SCENE_SCALE.CAD) {
  return sharedLockedFrameHalfHeight(outputs, bounds, width, height, job, sceneScale, RENDER_SCENE_SCALE_SETTINGS);
}

function outputSize(output, job) {
  return sharedOutputSize(output, job);
}

function configureRenderer(width, height, job, themeSettings) {
  return configurePngRenderer(width, height, job, themeSettings, { defaultRenderScale: DEFAULT_RENDER_SCALE });
}

function shouldBurnInViewLabels(job = {}) {
  return sharedShouldBurnInViewLabels(job);
}

function drawBurnedInLabel(context, label, width, height, {
  corner = "top-left",
  fill = "#111827",
  background = "rgba(255, 255, 255, 0.9)",
  border = "rgba(17, 24, 39, 0.42)"
} = {}) {
  return drawSharedBurnedInLabel(context, label, width, height, {
    corner,
    fill,
    background,
    border
  });
}

function rendererDataUrlWithOptionalLabel(renderer, label, job) {
  return sharedRendererDataUrlWithOptionalLabel(renderer, label, job);
}

function resolveSectionPlane(section = {}) {
  const plane = String(section.plane || "XY").toUpperCase();
  if (Array.isArray(section.normal) && section.normal.length >= 3) {
    const normal = new THREE.Vector3(section.normal[0], section.normal[1], section.normal[2]).normalize();
    const at = Array.isArray(section.at) && section.at.length >= 3
      ? new THREE.Vector3(section.at[0], section.at[1], section.at[2])
      : new THREE.Vector3();
    const helper = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(helper, normal).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    return { normal, at, u, v };
  }
  const offset = toFiniteNumber(section.offset, 0);
  if (plane === "XZ") {
    return {
      normal: new THREE.Vector3(0, 1, 0),
      at: new THREE.Vector3(0, offset, 0),
      u: new THREE.Vector3(1, 0, 0),
      v: new THREE.Vector3(0, 0, 1)
    };
  }
  if (plane === "YZ") {
    return {
      normal: new THREE.Vector3(1, 0, 0),
      at: new THREE.Vector3(offset, 0, 0),
      u: new THREE.Vector3(0, 1, 0),
      v: new THREE.Vector3(0, 0, 1)
    };
  }
  return {
    normal: new THREE.Vector3(0, 0, 1),
    at: new THREE.Vector3(0, 0, offset),
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 1, 0)
  };
}

function sectionSegments(meshData, section = {}) {
  const vertices = meshData.vertices || new Float32Array(0);
  const indices = meshData.indices || new Uint32Array(0);
  const { normal, at, u, v } = resolveSectionPlane(section);
  const point = new THREE.Vector3();
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const segments = [];
  const signedDistance = (candidate) => normal.dot(new THREE.Vector3().subVectors(candidate, at));
  const project = (candidate) => {
    const relative = new THREE.Vector3().subVectors(candidate, at);
    return [relative.dot(u), relative.dot(v)];
  };
  for (let index = 0; index + 2 < indices.length; index += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = Number(indices[index + corner]) * 3;
      tri[corner].set(vertices[vertexIndex], vertices[vertexIndex + 1], vertices[vertexIndex + 2]);
    }
    const distances = tri.map((corner) => signedDistance(corner));
    const intersections = [];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const da = distances[a];
      const db = distances[b];
      if (Math.abs(da) < 1e-7) {
        intersections.push(tri[a].clone());
      }
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        point.copy(tri[a]).lerp(tri[b], t);
        intersections.push(point.clone());
      }
    }
    if (intersections.length >= 2) {
      segments.push([project(intersections[0]), project(intersections[1])]);
    }
  }
  return segments;
}

function sectionBounds(segments) {
  const xs = [];
  const ys = [];
  for (const segment of segments) {
    for (const point of segment) {
      xs.push(point[0]);
      ys.push(point[1]);
    }
  }
  if (!xs.length) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function sectionPlaneLabel(section = {}) {
  const plane = String(section.plane || "XY").toUpperCase();
  const offset = toFiniteNumber(section.offset, 0);
  if (Array.isArray(section.normal) && section.normal.length >= 3) {
    const normal = section.normal.map((value) => Number(value).toFixed(3)).join(", ");
    const at = Array.isArray(section.at) && section.at.length >= 3
      ? section.at.map((value) => Number(value).toFixed(3)).join(", ")
      : "0.000, 0.000, 0.000";
    return `CUT N[${normal}] @ [${at}]`;
  }
  const axis = plane === "YZ" ? "X" : plane === "XZ" ? "Y" : "Z";
  return `SECTION ${plane} @ ${axis}=${offset.toFixed(3)}`;
}

function segmentEndpointKey(point, precision = 1000) {
  return `${Math.round(point[0] * precision)}:${Math.round(point[1] * precision)}`;
}

function loopsFromSegments(segments) {
  const edges = segments.map((segment, index) => ({
    index,
    a: segment[0],
    b: segment[1],
    aKey: segmentEndpointKey(segment[0]),
    bKey: segmentEndpointKey(segment[1])
  }));
  const byKey = new Map();
  for (const edge of edges) {
    for (const key of [edge.aKey, edge.bKey]) {
      if (!byKey.has(key)) {
        byKey.set(key, []);
      }
      byKey.get(key).push(edge);
    }
  }
  const used = new Set();
  const loops = [];
  for (const edge of edges) {
    if (used.has(edge.index)) {
      continue;
    }
    used.add(edge.index);
    const startKey = edge.aKey;
    let currentKey = edge.bKey;
    const points = [edge.a, edge.b];
    for (let guard = 0; guard < edges.length; guard += 1) {
      if (currentKey === startKey) {
        break;
      }
      const next = (byKey.get(currentKey) || []).find((candidate) => !used.has(candidate.index));
      if (!next) {
        break;
      }
      used.add(next.index);
      const nextPoint = next.aKey === currentKey ? next.b : next.a;
      currentKey = next.aKey === currentKey ? next.bKey : next.aKey;
      points.push(nextPoint);
    }
    if (points.length >= 3 && currentKey === startKey) {
      loops.push(points);
    }
  }
  return loops;
}

function sectionTransform(segments, width, height, paddingRatio = 0.12) {
  const { minX, minY, maxX, maxY } = sectionBounds(segments);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const padding = Math.max(20, Math.min(width, height) * paddingRatio);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const ox = (width - spanX * scale) / 2 - minX * scale;
  const oy = (height + spanY * scale) / 2 + minY * scale;
  return { minX, minY, maxX, maxY, spanX, spanY, scale, ox, oy };
}

function traceSectionLoops(context, loops, transform) {
  for (const loop of loops) {
    if (!loop.length) {
      continue;
    }
    context.moveTo(loop[0][0] * transform.scale + transform.ox, transform.oy - loop[0][1] * transform.scale);
    for (let index = 1; index < loop.length; index += 1) {
      context.lineTo(loop[index][0] * transform.scale + transform.ox, transform.oy - loop[index][1] * transform.scale);
    }
    context.closePath();
  }
}

function drawSectionHatching(context, width, height) {
  context.save();
  context.strokeStyle = "rgba(17, 24, 39, 0.2)";
  context.lineWidth = 1;
  const spacing = 14;
  for (let offset = -height; offset < width + height; offset += spacing) {
    context.beginPath();
    context.moveTo(offset, height);
    context.lineTo(offset + height, 0);
    context.stroke();
  }
  context.restore();
}

function drawSectionCenterlines(context, transform, width, height) {
  const centerX = ((transform.minX + transform.maxX) / 2) * transform.scale + transform.ox;
  const centerY = transform.oy - ((transform.minY + transform.maxY) / 2) * transform.scale;
  context.save();
  context.strokeStyle = "rgba(239, 68, 68, 0.75)";
  context.lineWidth = 1.5;
  context.setLineDash([10, 8, 2, 8]);
  context.beginPath();
  context.moveTo(Math.max(0, centerX), 0);
  context.lineTo(Math.max(0, centerX), height);
  context.moveTo(0, Math.max(0, centerY));
  context.lineTo(width, Math.max(0, centerY));
  context.stroke();
  context.restore();
}

function drawSectionLocator(context, section, bounds, width, height) {
  const plane = resolveSectionPlane(section);
  const corners = boundsCorners(bounds);
  const values = corners.map((corner) => corner.dot(plane.normal));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const atValue = plane.at.dot(plane.normal);
  const locatorWidth = Math.max(170, Math.min(width * 0.24, 260));
  const locatorHeight = Math.max(78, Math.min(height * 0.16, 130));
  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.024));
  const x = width - margin - locatorWidth;
  const y = height - margin - locatorHeight;
  const pad = 16;
  const trackX = x + pad;
  const trackY = y + locatorHeight / 2;
  const trackWidth = locatorWidth - pad * 2;
  const t = clamp((atValue - min) / Math.max(max - min, 1e-9), 0, 1);
  const cutX = trackX + t * trackWidth;
  context.save();
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.strokeStyle = "rgba(17, 24, 39, 0.42)";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, locatorWidth, locatorHeight, 8);
  context.fill();
  context.stroke();
  context.fillStyle = "#111827";
  context.font = "700 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  context.fillText("CUT LOCATOR", x + pad, y + 10);
  context.strokeStyle = "#9ca3af";
  context.lineWidth = 8;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(trackX, trackY);
  context.lineTo(trackX + trackWidth, trackY);
  context.stroke();
  context.strokeStyle = "#ef4444";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(cutX, trackY - 22);
  context.lineTo(cutX, trackY + 22);
  context.stroke();
  context.font = "600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  context.fillStyle = "#ef4444";
  context.fillText(sectionPlaneLabel(section).replace(/^SECTION\s+/, ""), x + pad, y + locatorHeight - 22);
  context.restore();
}

function renderSectionSvg(segments, edgeColor = "#132232") {
  const { minX, minY, maxX, maxY } = sectionBounds(segments);
  const padding = 4;
  const viewBox = [
    minX - padding,
    minY - padding,
    Math.max(maxX - minX + padding * 2, 1),
    Math.max(maxY - minY + padding * 2, 1)
  ].map((value) => Number(value).toFixed(4)).join(" ");
  const lines = segments.map((segment) => (
    `<path d="M ${segment[0][0].toFixed(4)} ${segment[0][1].toFixed(4)} L ${segment[1][0].toFixed(4)} ${segment[1][1].toFixed(4)}"/>`
  )).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="${edgeColor}" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round">${lines}</svg>`;
}

function renderSectionPng(segments, width, height, themeSettings, {
  transparent = false,
  section = {},
  bounds = null,
  viewLabels = false
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const background = themeSettings.background || {};
  if (!transparent) {
    context.fillStyle = background.solidColor || "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  const transform = sectionTransform(segments, width, height);
  const loops = loopsFromSegments(segments);
  if (loops.length) {
    context.save();
    context.beginPath();
    traceSectionLoops(context, loops, transform);
    context.fillStyle = "rgba(209, 213, 219, 0.72)";
    context.fill("evenodd");
    context.clip("evenodd");
    drawSectionHatching(context, width, height);
    context.restore();
  }
  drawSectionCenterlines(context, transform, width, height);
  context.strokeStyle = resolveThemeDisplayEdgeSettings(themeSettings).color || "#132232";
  context.lineWidth = 3;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const segment of segments) {
    context.beginPath();
    context.moveTo(segment[0][0] * transform.scale + transform.ox, transform.oy - segment[0][1] * transform.scale);
    context.lineTo(segment[1][0] * transform.scale + transform.ox, transform.oy - segment[1][1] * transform.scale);
    context.stroke();
  }
  if (bounds) {
    drawSectionLocator(context, section, bounds, width, height);
  }
  if (viewLabels) {
    drawBurnedInLabel(context, sectionPlaneLabel(section), width, height);
  }
  return canvas.toDataURL("image/png");
}

export function listRenderableParts(meshData) {
  return toArray(meshData.parts).map((part, index) => ({
    id: String(part?.id || part?.occurrenceId || `part:${index}`),
    occurrenceId: String(part?.occurrenceId || part?.id || ""),
    name: String(part?.name || part?.label || part?.id || `Part ${index + 1}`),
    label: String(part?.label || part?.name || part?.id || `Part ${index + 1}`),
    triangleCount: Math.max(0, Math.floor(toFiniteNumber(part?.triangleCount, 0))),
    vertexCount: Math.max(0, Math.floor(toFiniteNumber(part?.vertexCount, 0))),
    bounds: part?.bounds || null
  }));
}

export async function renderMeshJob(meshData, job = {}) {
  const mode = String(job.mode || "view").trim().toLowerCase();
  const theme = resolveTheme(job);
  const sceneScale = resolveRenderSceneScale(job, meshData);
  const displayMode = resolveThemeDisplayMode(theme);
  const bounds = meshData.bounds || boundsFromVertices(meshData.vertices || []);
  const outputs = toArray(job.outputs).length ? toArray(job.outputs) : [{ path: job.output || "", camera: job.camera || "iso" }];
  const warnings = [];
  const sharedRenderOptions = createSharedRenderOptions({
    themeSettings: theme,
    sceneScale,
    clip: job.render?.clip || job.clip || job.render?.clipSettings || job.clipSettings || null,
    selection: job.selection || null,
    floor: theme.floor || null,
    background: theme.background || null,
    lighting: theme.lighting || null,
    renderScale: job.render?.renderScale ?? job.renderScale ?? DEFAULT_RENDER_SCALE
  });

  if (mode === "list") {
    return {
      ok: true,
      mode,
      parts: listRenderableParts(meshData),
      bounds,
      warnings
    };
  }

  if (mode === "section") {
    const section = job.section || {};
    const segments = sectionSegments(meshData, section);
    return {
      ok: true,
      mode,
      outputs: outputs.map((output) => {
        const { width, height } = outputSize(output, job);
        const format = String(output.format || job.section?.format || "").toLowerCase() || (
          String(output.path || "").toLowerCase().endsWith(".svg") ? "svg" : "png"
        );
        if (format === "svg") {
          return {
            path: String(output.path || ""),
            mimeType: "image/svg+xml",
            text: renderSectionSvg(segments, resolveThemeDisplayEdgeSettings(theme).color)
          };
        }
        return {
            path: String(output.path || ""),
            width,
            height,
            mimeType: "image/png",
            dataUrl: renderSectionPng(segments, width, height, theme, {
              transparent: normalizeBoolean(job.render?.transparent, false),
              section,
              bounds,
              viewLabels: shouldBurnInViewLabels(job)
            })
          };
        }),
      section: {
        segmentCount: segments.length
      },
      warnings
    };
  }

  const sceneBuildStarted = performance.now();
  const firstSize = outputSize(outputs[0], job);
  const renderer = configureRenderer(firstSize.width, firstSize.height, job, theme);
  const scene = new THREE.Scene();
  if (normalizeBoolean(job.render?.transparent, false) || theme.background?.type === "transparent") {
    scene.background = null;
    renderer.setClearColor(new THREE.Color("#000000"), 0);
  } else {
    scene.background = colorTextureFromBackground(theme.background || {}, firstSize.width, firstSize.height);
  }
  await applyEnvironment(scene, theme, warnings);
  applyLighting(scene, theme);
  const edgeSettings = resolveThemeDisplayEdgeSettings(theme);
  const selectorRuntime = job.parameters?.selectorRuntime || job.stepModuleRuntime?.selectorRuntime || job.selectorRuntime || null;
  const topologyDisplayEdgesVisible =
    displayMode !== "wireframe" &&
    edgeSettings.enabled &&
    edgeSettings.source === THEME_EDGE_SOURCES.TOPOLOGY &&
    hasTopologyDisplayEdgeProxy(selectorRuntime);
  const sceneTheme = topologyDisplayEdgesVisible
    ? {
        ...theme,
        edges: {
          ...(theme.edges || {}),
          enabled: false
        }
      }
    : theme;
  const screenSpaceLineMaterials = new Set();
  const cadScene = buildCadScene(THREE, meshData, {
    theme: sceneTheme,
    displayMode,
    scale: sceneScale,
    clip: sharedRenderOptions.clip,
    silhouette: false,
    renderPartsIndividually: true,
    callbacks: {
      createEdgeObject: (options) => createRenderDisplayEdgeObject({
        THREE,
        LineSegments2,
        LineSegmentsGeometry,
        LineMaterial
      }, options, screenSpaceLineMaterials),
      onWarning: (warning) => {
        const message = String(warning?.message || warning?.title || "").trim();
        if (message) {
          warnings.push(message);
        }
      }
    }
  });
  if (topologyDisplayEdgesVisible) {
    const topologyEdges = createRenderTopologyDisplayEdgeObject(
      {
        THREE,
        LineSegments2,
        LineSegmentsGeometry,
        LineMaterial
      },
      selectorRuntime,
      edgeSettings,
      cadScene.runtime?.baseTheme,
      screenSpaceLineMaterials
    );
    if (topologyEdges) {
      cadScene.edgesGroup.add(topologyEdges);
      applyTopologyDisplayEdgeSurfaceOffset(cadScene.displayRecords);
    }
  }
  scene.add(cadScene.root);
  addFloor(scene, bounds, theme, sceneScale);
  const sceneBuildMs = performance.now() - sceneBuildStarted;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 10000);
  const lockFraming = normalizeBoolean(job.render?.lockFraming, normalizeBoolean(job.lockFraming, false));
  const padding = framePadding(job);
  const boundsByOutput = new Map();
  const parametersForOutput = (output) => (
    output.parameters ||
    output.stepModuleRuntime ||
    job.parameters ||
    job.stepModuleRuntime ||
    null
  );
  for (const output of outputs) {
    const parameters = parametersForOutput(output);
    const effectiveBounds = parameters
      ? cadScene.update({ parameters }).bounds
      : cadScene.update({ parameters: null }).bounds;
    boundsByOutput.set(output, effectiveBounds);
  }
  const lockedBounds = lockFraming
    ? mergeBoundsList(outputs.map((output) => boundsByOutput.get(output))) || bounds
    : null;
  const lockedHalfHeight = lockFraming ? lockedFrameHalfHeight(outputs, lockedBounds, firstSize.width, firstSize.height, job, sceneScale) : null;
  const renderedOutputs = [];
  const renderStarted = performance.now();
  try {
    for (const output of outputs) {
      const parameters = parametersForOutput(output);
      const outputBounds = parameters
        ? cadScene.update({ parameters }).bounds
        : cadScene.update({ parameters: null }).bounds;
      const { width, height } = outputSize(output, job);
      renderer.setSize(width, height, false);
      syncScreenSpaceLineMaterialResolution(screenSpaceLineMaterials, width, height);
      const view = resolveView(output.camera || job.camera || "iso");
      fitCamera(camera, view, lockedBounds || outputBounds, width, height, lockedHalfHeight, padding, sceneScale);
      renderer.render(scene, camera);
      const viewLabel = String(output.viewLabel || output.label || view.name || "").toUpperCase();
      renderedOutputs.push({
        path: String(output.path || ""),
        camera: view.name,
        width,
        height,
        mimeType: "image/png",
        dataUrl: rendererDataUrlWithOptionalLabel(renderer, viewLabel, job)
      });
    }
    const renderMs = performance.now() - renderStarted;
    return {
      ok: true,
      mode,
      outputs: renderedOutputs,
      timings: {
        sceneBuildMs,
        renderMs,
        meshCount: cadScene.displayRecords.length || listRenderableParts(meshData).length || 1
      },
      warnings
    };
  } finally {
    cadScene.dispose();
    renderer.dispose();
  }
}
