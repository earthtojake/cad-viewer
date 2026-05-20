import * as THREE from "three";
import {
  cloneThemeSettings,
  getEnvironmentPresetById,
  THEME_FLOOR_MODES,
  normalizeThemeSettings
} from "./themeSettings.js";

export const RENDER_SCENE_SCALE = Object.freeze({
  CAD: "cad",
  URDF: "urdf"
});

export const WORLD_UP = Object.freeze([0, 0, 1]);
export const TOP_VIEW_UP = Object.freeze([0, 1, 0]);

export const RENDER_VIEW_PRESETS = Object.freeze({
  front: { name: "front", direction: [0, -1, 0], up: WORLD_UP },
  back: { name: "back", direction: [0, 1, 0], up: WORLD_UP },
  right: { name: "right", direction: [1, 0, 0], up: WORLD_UP },
  left: { name: "left", direction: [-1, 0, 0], up: WORLD_UP },
  top: { name: "top", direction: [0, 0, 1], up: TOP_VIEW_UP },
  bottom: { name: "bottom", direction: [0, 0, -1], up: TOP_VIEW_UP },
  iso: { name: "iso", direction: [1, -1, 0.8], up: WORLD_UP },
  isometric: { name: "iso", direction: [1, -1, 0.8], up: WORLD_UP },
  side: { name: "side", direction: [1, 0, 0], up: WORLD_UP }
});

export const SHARED_RENDER_OPTION_KEYS = Object.freeze([
  "themeSettings",
  "camera",
  "framing",
  "sceneScale",
  "clip",
  "selection",
  "floor",
  "background",
  "lighting",
  "outputSize",
  "renderScale"
]);

/**
 * SharedRenderOptions is the policy-free shape consumed by lower-level render
 * helpers after snapshot or viewer code has already chosen defaults.
 *
 * @typedef {Object} SharedRenderOptions
 * @property {Object|null} themeSettings Explicit, normalized theme settings.
 * @property {Object|null} camera Explicit camera/view state.
 * @property {Object|null} framing Explicit framing settings.
 * @property {string|null} sceneScale Explicit CAD/URDF scene scale.
 * @property {Object|null} clip Explicit clip settings.
 * @property {Object|null} selection Explicit part/selection settings.
 * @property {Object|null} floor Explicit floor settings.
 * @property {Object|null} background Explicit background settings.
 * @property {Object|null} lighting Explicit lighting settings.
 * @property {Object|null} outputSize Explicit output width/height.
 * @property {number|null} renderScale Explicit render scale.
 */

export function createSharedRenderOptions(explicitOptions = {}) {
  const result = {};
  for (const key of SHARED_RENDER_OPTION_KEYS) {
    result[key] = Object.prototype.hasOwnProperty.call(explicitOptions, key)
      ? explicitOptions[key]
      : null;
  }
  return result;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function normalizeRenderSceneScale(value) {
  return value === RENDER_SCENE_SCALE.URDF ? RENDER_SCENE_SCALE.URDF : RENDER_SCENE_SCALE.CAD;
}

export function renderSceneScaleSettings(value, settingsByScale) {
  return settingsByScale[normalizeRenderSceneScale(value)];
}

export function inferRenderSceneScale({
  explicit = "",
  kind = "",
  parts = []
} = {}) {
  const normalizedExplicit = String(explicit || "").trim().toLowerCase();
  if (normalizedExplicit) {
    return normalizeRenderSceneScale(normalizedExplicit);
  }
  const normalizedKind = String(kind || "").trim().toLowerCase();
  if (normalizedKind === "urdf" || normalizedKind === "srdf" || normalizedKind === "sdf") {
    return RENDER_SCENE_SCALE.URDF;
  }
  return (Array.isArray(parts) ? parts : []).some((part) => String(part?.linkName || "").trim())
    ? RENDER_SCENE_SCALE.URDF
    : RENDER_SCENE_SCALE.CAD;
}

export function resolveThemeJobConfig(job = {}, { defaultThemeId = "technical" } = {}) {
  if (typeof job.theme === "string") {
    return { id: job.theme, settings: null };
  }
  if (job.theme && typeof job.theme === "object") {
    return {
      id: job.theme.id || defaultThemeId,
      settings: job.theme.settings && typeof job.theme.settings === "object" ? job.theme.settings : null
    };
  }
  return { id: defaultThemeId, settings: null };
}

export function resolveThemeSettings(job = {}, { defaultThemeId = "technical" } = {}) {
  const theme = resolveThemeJobConfig(job, { defaultThemeId });
  const themeSettings = cloneThemeSettings(theme.id || defaultThemeId);
  return normalizeThemeSettings(theme.settings || themeSettings);
}

export function resolveRenderView(camera = "iso", viewPresets = RENDER_VIEW_PRESETS) {
  const raw = String(camera || "iso").trim().toLowerCase();
  if (viewPresets[raw]) {
    return viewPresets[raw];
  }
  const parts = raw.split(":").map((entry) => Number(entry));
  if (parts.length >= 2 && parts.every(Number.isFinite)) {
    const azimuth = (parts[0] * Math.PI) / 180;
    const elevation = (parts[1] * Math.PI) / 180;
    const cosElevation = Math.cos(elevation);
    return {
      name: `${parts[0]}:${parts[1]}`,
      direction: [
        Math.sin(azimuth) * cosElevation,
        -Math.cos(azimuth) * cosElevation,
        Math.sin(elevation)
      ],
      up: WORLD_UP
    };
  }
  return viewPresets.iso;
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

export function centerAndRadiusFromBounds(bounds, sceneScale, settingsByScale) {
  const settings = renderSceneScaleSettings(sceneScale, settingsByScale);
  const min = Array.isArray(bounds?.min) ? bounds.min : [0, 0, 0];
  const max = Array.isArray(bounds?.max) ? bounds.max : [1, 1, 1];
  const center = new THREE.Vector3(
    (toFiniteNumber(min[0]) + toFiniteNumber(max[0], 1)) / 2,
    (toFiniteNumber(min[1]) + toFiniteNumber(max[1], 1)) / 2,
    (toFiniteNumber(min[2]) + toFiniteNumber(max[2], 1)) / 2
  );
  const size = new THREE.Vector3(
    Math.max(toFiniteNumber(max[0], 1) - toFiniteNumber(min[0]), settings.minBoundsSpan),
    Math.max(toFiniteNumber(max[1], 1) - toFiniteNumber(min[1]), settings.minBoundsSpan),
    Math.max(toFiniteNumber(max[2], 1) - toFiniteNumber(min[2]), settings.minBoundsSpan)
  );
  return {
    center,
    radius: Math.max(size.length() / 2, settings.minModelRadius),
    size
  };
}

export function colorTextureFromBackground(background, width, height) {
  if (background.type === "solid") {
    return new THREE.Color(background.solidColor);
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, width);
  canvas.height = Math.max(2, height);
  const context = canvas.getContext("2d");
  if (background.type === "radial") {
    const gradient = context.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      0,
      canvas.width / 2,
      canvas.height / 2,
      Math.max(canvas.width, canvas.height) / 1.35
    );
    gradient.addColorStop(0, background.radialInner);
    gradient.addColorStop(1, background.radialOuter);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const angle = ((toFiniteNumber(background.linearAngle, 135) - 90) * Math.PI) / 180;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const length = Math.hypot(canvas.width, canvas.height);
    const dx = Math.cos(angle) * length / 2;
    const dy = Math.sin(angle) * length / 2;
    const gradient = context.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    gradient.addColorStop(0, background.linearStart);
    gradient.addColorStop(1, background.linearEnd);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function applyEnvironment(scene, themeSettings, warnings = []) {
  const environment = themeSettings.environment || {};
  if (!environment.enabled) {
    scene.environment = null;
    return;
  }
  const preset = getEnvironmentPresetById(environment.presetId);
  const textureUrl = String(preset?.url || "").trim();
  if (!textureUrl) {
    return;
  }
  try {
    const loader = new THREE.TextureLoader();
    if (typeof loader.setCrossOrigin === "function") {
      loader.setCrossOrigin("anonymous");
    }
    const texture = await loader.loadAsync(textureUrl);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.environment = texture;
    if (scene.environmentRotation?.set) {
      scene.environmentRotation.set(0, toFiniteNumber(environment.rotationY), 0);
    }
    if (environment.useAsBackground) {
      scene.background = texture;
    }
  } catch {
    warnings.push(`Environment preset unavailable: ${preset?.label || environment.presetId || "default"}`);
  }
}

export function applyLighting(scene, themeSettings) {
  const lighting = themeSettings.lighting || {};
  const addIfEnabled = (light, enabled) => {
    light.visible = enabled;
    scene.add(light);
  };
  addIfEnabled(
    new THREE.HemisphereLight(
      lighting.hemisphere?.skyColor || "#ffffff",
      lighting.hemisphere?.groundColor || "#101014",
      toFiniteNumber(lighting.hemisphere?.intensity, 1)
    ),
    lighting.hemisphere?.enabled !== false
  );
  addIfEnabled(
    new THREE.AmbientLight(lighting.ambient?.color || "#ffffff", toFiniteNumber(lighting.ambient?.intensity, 0.2)),
    lighting.ambient?.enabled !== false
  );
  const directional = new THREE.DirectionalLight(
    lighting.directional?.color || "#ffffff",
    toFiniteNumber(lighting.directional?.intensity, 1)
  );
  directional.position.set(
    toFiniteNumber(lighting.directional?.position?.x, 160),
    toFiniteNumber(lighting.directional?.position?.y, -140),
    toFiniteNumber(lighting.directional?.position?.z, 240)
  );
  directional.castShadow = true;
  addIfEnabled(directional, lighting.directional?.enabled !== false);

  const spot = new THREE.SpotLight(
    lighting.spot?.color || "#ffffff",
    toFiniteNumber(lighting.spot?.intensity, 0),
    toFiniteNumber(lighting.spot?.distance, 0),
    toFiniteNumber(lighting.spot?.angle, Math.PI / 6)
  );
  spot.position.set(
    toFiniteNumber(lighting.spot?.position?.x, 160),
    toFiniteNumber(lighting.spot?.position?.y, -120),
    toFiniteNumber(lighting.spot?.position?.z, 140)
  );
  addIfEnabled(spot, lighting.spot?.enabled === true);
  scene.add(spot.target);

  const point = new THREE.PointLight(
    lighting.point?.color || "#ffffff",
    toFiniteNumber(lighting.point?.intensity, 0),
    toFiniteNumber(lighting.point?.distance, 0)
  );
  point.position.set(
    toFiniteNumber(lighting.point?.position?.x, -120),
    toFiniteNumber(lighting.point?.position?.y, 80),
    toFiniteNumber(lighting.point?.position?.z, 140)
  );
  addIfEnabled(point, lighting.point?.enabled === true);
}

export function addFloor(scene, bounds, themeSettings, sceneScale, settingsByScale) {
  const floor = themeSettings.floor || {};
  const mode = floor.mode || THEME_FLOOR_MODES.STAGE;
  if (mode === THEME_FLOOR_MODES.NONE) {
    return;
  }
  const settings = renderSceneScaleSettings(sceneScale, settingsByScale);
  const { center, radius } = centerAndRadiusFromBounds(bounds, sceneScale, settingsByScale);
  const minZ = Array.isArray(bounds?.min) ? toFiniteNumber(bounds.min[2]) : 0;
  const gridSize = Math.max(radius * 3, settings.minFloorSize);
  if (mode === THEME_FLOOR_MODES.GRID) {
    const grid = new THREE.GridHelper(gridSize, 28, floor.color || "#94a3b8", floor.color || "#cbd5e1");
    grid.rotation.x = Math.PI / 2;
    grid.position.set(center.x, center.y, minZ - 0.02);
    scene.add(grid);
    return;
  }
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(gridSize, gridSize),
    new THREE.ShadowMaterial({
      color: floor.color || "#f1f5f9",
      opacity: clamp(toFiniteNumber(floor.shadowOpacity, 0.24), 0, 1)
    })
  );
  plane.rotation.x = 0;
  plane.position.set(center.x, center.y, minZ - 0.03);
  plane.receiveShadow = true;
  scene.add(plane);
}

export function boundsCorners(bounds) {
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
    toFiniteNumber(corner[0]),
    toFiniteNumber(corner[1]),
    toFiniteNumber(corner[2])
  ));
}

export function framePadding(job = {}) {
  const rawPadding = job.render?.padding ?? job.render?.paddingPercent ?? job.padding ?? job.paddingPercent;
  return clamp(toFiniteNumber(rawPadding, 0.12), 0.1, 0.15);
}

export function frameHalfHeightForView(view, bounds, width, height, padding, sceneScale, settingsByScale) {
  const settings = renderSceneScaleSettings(sceneScale, settingsByScale);
  const direction = new THREE.Vector3(...view.direction).normalize();
  const up = new THREE.Vector3(...view.up).normalize();
  const right = new THREE.Vector3().crossVectors(direction, up).normalize();
  const screenUp = new THREE.Vector3().crossVectors(right, direction).normalize();
  const corners = boundsCorners(bounds);
  const xs = corners.map((corner) => corner.dot(right));
  const ys = corners.map((corner) => corner.dot(screenUp));
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), settings.minBoundsSpan);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), settings.minBoundsSpan);
  const aspect = Math.max(width / Math.max(height, 1), 0.01);
  const safeContentScale = Math.max(1 - (padding * 2), 0.1);
  return Math.max(
    spanY / (2 * safeContentScale),
    spanX / (2 * aspect * safeContentScale),
    settings.minBoundsSpan / 2
  );
}

export function fitOrthographicCamera(camera, view, bounds, width, height, {
  lockedHalfHeight = null,
  padding = 0.12,
  sceneScale = RENDER_SCENE_SCALE.CAD,
  settingsByScale
} = {}) {
  const settings = renderSceneScaleSettings(sceneScale, settingsByScale);
  const { center, radius } = centerAndRadiusFromBounds(bounds, sceneScale, settingsByScale);
  const direction = new THREE.Vector3(...view.direction).normalize();
  const up = new THREE.Vector3(...view.up).normalize();
  const distance = Math.max(radius * 3.2, settings.minCameraDistance);
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.up.copy(up);
  camera.lookAt(center);
  const aspect = Math.max(width / Math.max(height, 1), 0.01);
  const halfHeight = lockedHalfHeight || frameHalfHeightForView(view, bounds, width, height, padding, sceneScale, settingsByScale);
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.near = 0.01;
  camera.far = Math.max(distance + radius * 6, settings.minCameraFar);
  camera.updateProjectionMatrix();
}

export function lockedFrameHalfHeight(outputs, bounds, width, height, job, sceneScale, settingsByScale) {
  const padding = framePadding(job);
  return Math.max(
    ...outputs.map((output) => {
      const outputWidth = toFiniteNumber(output.width, width);
      const outputHeight = toFiniteNumber(output.height, height);
      return frameHalfHeightForView(resolveRenderView(output.camera || job.camera || "iso"), bounds, outputWidth, outputHeight, padding, sceneScale, settingsByScale);
    }),
    renderSceneScaleSettings(sceneScale, settingsByScale).minBoundsSpan / 2
  );
}

export function outputSize(output, job) {
  return {
    width: Math.max(1, Math.floor(toFiniteNumber(output.width, job.width || 1400))),
    height: Math.max(1, Math.floor(toFiniteNumber(output.height, job.height || 900)))
  };
}

export function configurePngRenderer(width, height, job, themeSettings, {
  defaultRenderScale = 1
} = {}) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance"
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = Math.max(toFiniteNumber(themeSettings.lighting?.toneMappingExposure, 1), 0.05);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(clamp(toFiniteNumber(job.render?.renderScale, job.renderScale || defaultRenderScale), 1, 3));
  renderer.setSize(width, height, false);
  document.body.innerHTML = "";
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export function dataUrlFromRenderer(renderer, mime = "image/png") {
  return renderer.domElement.toDataURL(mime);
}

export function shouldBurnInViewLabels(job = {}) {
  return typeof job.render?.viewLabels === "boolean"
    ? job.render.viewLabels
    : typeof job.viewLabels === "boolean"
      ? job.viewLabels
      : false;
}

export function drawBurnedInLabel(context, label, width, height, {
  corner = "top-left",
  fill = "#111827",
  background = "rgba(255, 255, 255, 0.9)",
  border = "rgba(17, 24, 39, 0.42)"
} = {}) {
  const text = String(label || "").trim();
  if (!text) {
    return;
  }
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const fontSize = Math.max(18, Math.min(Math.round(safeWidth * 0.018), 32));
  const padX = Math.round(fontSize * 0.72);
  const padY = Math.round(fontSize * 0.42);
  context.save();
  context.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  context.textBaseline = "top";
  const metrics = context.measureText(text);
  const boxWidth = Math.ceil(metrics.width + padX * 2);
  const boxHeight = Math.ceil(fontSize + padY * 2);
  const margin = Math.max(18, Math.round(Math.min(safeWidth, safeHeight) * 0.024));
  const x = corner.includes("right") ? safeWidth - margin - boxWidth : margin;
  const y = corner.includes("bottom") ? safeHeight - margin - boxHeight : margin;
  context.fillStyle = background;
  context.strokeStyle = border;
  context.lineWidth = Math.max(1, Math.round(fontSize * 0.06));
  context.beginPath();
  context.roundRect(x, y, boxWidth, boxHeight, Math.round(fontSize * 0.28));
  context.fill();
  context.stroke();
  context.fillStyle = fill;
  context.fillText(text, x + padX, y + padY);
  context.restore();
}

export function rendererDataUrlWithOptionalLabel(renderer, label, job) {
  if (!shouldBurnInViewLabels(job)) {
    return dataUrlFromRenderer(renderer);
  }
  const source = renderer.domElement;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0);
  drawBurnedInLabel(context, label, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
