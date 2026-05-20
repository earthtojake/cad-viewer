import gifencDefault, {
  GIFEncoder as exportedGifEncoder,
  applyPalette as exportedApplyPalette,
  quantize as exportedQuantize
} from "gifenc";
import {
  loadRender3Mf,
  loadRenderDxf,
  loadRenderGlb,
  loadRenderSdf,
  loadRenderSelectorBundle,
  loadRenderSrdf,
  loadRenderStl,
  loadRenderTopologyIndex,
  loadRenderUrdf
} from "../lib/renderAssetClient.js";
import { buildSelectorRuntime } from "../lib/selectors/runtime.js";
import {
  assemblyUsesSelfContainedMesh,
  buildSelfContainedAssemblyMeshData
} from "../lib/assembly/meshData.js";
import { buildDxfPreviewMeshData } from "../lib/dxf/buildPreviewMesh.js";
import {
  buildUrdfMeshGeometry,
  poseUrdfMeshData
} from "../lib/urdf/kinematics.js";
import { jointValuesByNameToNative } from "../lib/urdf/motion.js";
import { renderMeshJob } from "./renderMeshScene.js";
import {
  loadStepModuleDefinition
} from "./stepModule.js";
import {
  hasStepModuleRenderParams,
  normalizeStepModuleRenderParams,
  stepModuleRenderFrameState,
  stepModuleRenderFrameValues
} from "./stepModuleParams.js";

const GIFEncoder = exportedGifEncoder || gifencDefault?.GIFEncoder || gifencDefault;
const quantize = exportedQuantize || gifencDefault?.quantize;
const applyPalette = exportedApplyPalette || gifencDefault?.applyPalette;

async function main() {
  let result;
  try {
    const job = await fetchJson("/job");
    result = await runHeadlessRenderJob(job);
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  await fetch("/result", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result)
  });
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
  }
  return response.json();
}

function extensionFromUrl(url) {
  const pathname = new URL(url, window.location.href).pathname.toLowerCase();
  const dot = pathname.lastIndexOf(".");
  return dot >= 0 ? pathname.slice(dot) : "";
}

async function loadMeshByUrl(url) {
  const extension = extensionFromUrl(url);
  if (extension === ".stl") {
    return loadRenderStl(url);
  }
  if (extension === ".3mf") {
    return loadRender3Mf(url);
  }
  return loadRenderGlb(url);
}

async function loadStepMesh(job) {
  const glbUrl = String(job?.resolved?.glbUrl || "").trim();
  if (!glbUrl) {
    throw new Error("STEP/STP render job is missing resolved.glbUrl");
  }
  const meshData = await loadRenderGlb(glbUrl);
  try {
    const topology = await loadRenderTopologyIndex(glbUrl);
    if (assemblyUsesSelfContainedMesh(topology)) {
      return buildSelfContainedAssemblyMeshData(topology, meshData);
    }
  } catch {
    // Plain parts and visual-only GLBs can still render without a topology index.
  }
  return meshData;
}

async function loadRenderSelectorRuntime(job, { cadPath = "" } = {}) {
  const glbUrl = String(job?.resolved?.glbUrl || "").trim();
  if (!glbUrl) {
    return null;
  }
  try {
    const selectorBundle = await loadRenderSelectorBundle(glbUrl);
    return buildSelectorRuntime(selectorBundle, {
      copyCadPath: cadPath
    });
  } catch {
    return null;
  }
}

async function loadDxfMesh(job) {
  const dxfData = await loadRenderDxf(job.resolved.inputUrl);
  const dxf = job.dxf && typeof job.dxf === "object" ? job.dxf : {};
  return buildDxfPreviewMeshData(dxfData, dxf.thicknessMm, Array.isArray(dxf.bendSettings) ? dxf.bendSettings : []);
}

function robotMeshUrls(robotData) {
  return [...new Set(
    (Array.isArray(robotData?.links) ? robotData.links : [])
      .flatMap((link) => Array.isArray(link?.visuals) ? link.visuals : [])
      .map((visual) => String(visual?.meshUrl || "").trim())
      .filter(Boolean)
  )];
}

async function loadRobotMesh(job) {
  const kind = String(job.resolved?.kind || "").toLowerCase();
  let robotData;
  if (kind === "srdf") {
    const srdfPayload = await loadRenderSrdf(job.resolved.inputUrl, { urdfUrl: job.resolved.urdfUrl || "" });
    robotData = srdfPayload.urdfData;
  } else if (kind === "sdf") {
    robotData = await loadRenderSdf(job.resolved.inputUrl);
  } else {
    robotData = await loadRenderUrdf(job.resolved.inputUrl);
  }
  const meshesByUrl = new Map();
  for (const meshUrl of robotMeshUrls(robotData)) {
    meshesByUrl.set(meshUrl, await loadMeshByUrl(meshUrl));
  }
  const baseMeshData = buildUrdfMeshGeometry(robotData, meshesByUrl);
  const robot = job.robot && typeof job.robot === "object" ? job.robot : {};
  const jointValues = jointValuesByNameToNative(robotData, robot.jointValues || {});
  return poseUrdfMeshData(robotData, baseMeshData, jointValues).meshData;
}

async function loadMeshData(job) {
  const kind = String(job.resolved?.kind || "").toLowerCase();
  if (kind === "step" || kind === "stp") {
    return loadStepMesh(job);
  }
  if (kind === "glb" || kind === "gltf") {
    return loadRenderGlb(job.resolved.inputUrl);
  }
  if (kind === "stl") {
    return loadRenderStl(job.resolved.inputUrl);
  }
  if (kind === "3mf") {
    return loadRender3Mf(job.resolved.inputUrl);
  }
  if (kind === "dxf") {
    return loadDxfMesh(job);
  }
  if (kind === "urdf" || kind === "srdf" || kind === "sdf") {
    return loadRobotMesh(job);
  }
  throw new Error(`Unsupported render input kind: ${kind || "(missing)"}`);
}

function normalizedSelectorValues(value) {
  return (Array.isArray(value) ? value : String(value || "").split(","))
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^@cad\[[^\]#]*(?:#([^\]]+))?\]$/, "$1").trim())
    .filter(Boolean);
}

function partMatchesSelector(part, selector) {
  const normalized = String(selector || "").trim();
  if (!normalized) {
    return false;
  }
  return [
    part?.id,
    part?.occurrenceId,
    part?.name,
    part?.label,
    part?.linkName
  ].some((value) => String(value || "").trim() === normalized);
}

function applySelection(meshData, selection = {}) {
  const parts = Array.isArray(meshData?.parts) ? meshData.parts : [];
  if (!parts.length) {
    return meshData;
  }
  const focus = [
    ...normalizedSelectorValues(selection.focus),
    ...normalizedSelectorValues(selection.refs)
  ];
  const hide = normalizedSelectorValues(selection.hide);
  if (!focus.length && !hide.length) {
    return meshData;
  }
  const nextParts = parts.filter((part) => {
    if (focus.length && !focus.some((selector) => partMatchesSelector(part, selector))) {
      return false;
    }
    return !hide.some((selector) => partMatchesSelector(part, selector));
  });
  if (!nextParts.length) {
    throw new Error("No renderable parts remain after applying focus/hide filters");
  }
  return {
    ...meshData,
    parts: nextParts,
    bounds: mergePartBounds(nextParts) || meshData.bounds
  };
}

function mergePartBounds(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const bounds = part?.bounds;
    if (!Array.isArray(bounds?.min) || !Array.isArray(bounds?.max)) {
      continue;
    }
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], Number(bounds.min[axis]));
      max[axis] = Math.max(max[axis], Number(bounds.max[axis]));
    }
  }
  return min.every(Number.isFinite) && max.every(Number.isFinite) ? { min, max } : null;
}

function orbitFrameOutputs(job) {
  const orbit = job.orbit && typeof job.orbit === "object" ? job.orbit : {};
  const output = Array.isArray(job.outputs) && job.outputs.length ? job.outputs[0] : {};
  const width = Math.max(1, Math.floor(Number(output.width || job.width || orbit.width || 720)));
  const height = Math.max(1, Math.floor(Number(output.height || job.height || orbit.height || 480)));
  const fps = Math.max(1, Math.min(Number(orbit.fps || 18), 60));
  const durationSeconds = Math.max(0.1, Math.min(Number(orbit.durationSeconds || 4), 60));
  const frameCount = Math.max(2, Math.min(Math.round(fps * durationSeconds), 720));
  const startAzimuth = Number.isFinite(Number(orbit.startAzimuth)) ? Number(orbit.startAzimuth) : -45;
  const elevation = Number.isFinite(Number(orbit.elevation)) ? Number(orbit.elevation) : 30;
  const turns = Number.isFinite(Number(orbit.turns)) ? Number(orbit.turns) : 1;
  return {
    path: String(output.path || job.output || ""),
    width,
    height,
    fps,
    durationSeconds,
    frameCount,
    outputs: Array.from({ length: frameCount }, (_, index) => ({
      path: "",
      width,
      height,
      camera: `${startAzimuth + ((360 * turns * index) / frameCount)}:${elevation}`
    }))
  };
}

async function dataUrlToImageData(dataUrl, width, height) {
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Failed to load rendered orbit frame"));
  });
  image.src = dataUrl;
  await loaded;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function shouldEncodeTransparentGif(job = {}) {
  const backgroundType = String(
    job.theme?.settings?.background?.type || job.theme?.background?.type || ""
  ).toLowerCase();
  return Boolean(job.render?.transparent) || backgroundType === "transparent";
}

function encodeGifFrameImageData(imageData, { transparent = false } = {}) {
  if (!transparent) {
    const palette = quantize(imageData.data, 256);
    return {
      indexed: applyPalette(imageData.data, palette),
      palette,
      transparent: false,
      transparentIndex: 0
    };
  }

  const palette = quantize(imageData.data, 256, {
    format: "rgba4444",
    oneBitAlpha: true
  });
  const transparentIndex = palette.findIndex((color) => Number(color?.[3]) <= 127);
  return {
    indexed: applyPalette(imageData.data, palette, "rgba4444"),
    palette,
    transparent: transparentIndex >= 0,
    transparentIndex: Math.max(transparentIndex, 0)
  };
}

async function renderOrbit(meshData, job) {
  const orbit = orbitFrameOutputs(job);
  const frameResult = await renderMeshJob(meshData, {
    ...job,
    mode: "view",
    outputs: orbit.outputs,
    render: {
      ...(job.render || {}),
      lockFraming: true
    }
  });
  const encoder = GIFEncoder();
  const transparent = shouldEncodeTransparentGif(job);
  for (let index = 0; index < frameResult.outputs.length; index += 1) {
    const imageData = await dataUrlToImageData(frameResult.outputs[index].dataUrl, orbit.width, orbit.height);
    const frame = encodeGifFrameImageData(imageData, { transparent });
    encoder.writeFrame(frame.indexed, orbit.width, orbit.height, {
      palette: frame.palette,
      transparent: frame.transparent,
      transparentIndex: frame.transparentIndex,
      delay: 1000 / orbit.fps,
      repeat: 0,
      dispose: frame.transparent ? 2 : -1
    });
  }
  encoder.finish();
  const bytes = encoder.bytesView();
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return {
    ok: true,
    mode: "orbit",
    outputs: [{
      path: orbit.path,
      width: orbit.width,
      height: orbit.height,
      frameCount: orbit.frameCount,
      mimeType: "image/gif",
      dataUrl: `data:image/gif;base64,${btoa(binary)}`
    }],
    timings: frameResult.timings,
    warnings: frameResult.warnings || []
  };
}

async function loadStepModuleRuntime(job) {
  if (!hasStepModuleRenderParams(job.params)) {
    return null;
  }
  const stepModuleUrl = String(job?.resolved?.stepModuleUrl || "").trim();
  if (!stepModuleUrl) {
    throw new Error("STEP render params require resolved.stepModuleUrl");
  }
  const definition = await loadStepModuleDefinition(stepModuleUrl);
  const renderParams = normalizeStepModuleRenderParams(definition, job.params);
  const selectorRuntime = await loadRenderSelectorRuntime(job, {
    cadPath: definition.cadPath || ""
  });
  return {
    definition,
    renderParams,
    selectorRuntime,
    cadPath: definition.cadPath || "",
    sourceUrl: stepModuleUrl
  };
}

function stepModuleFrameRuntime(stepModuleRuntime, frameIndex) {
  const { definition, renderParams } = stepModuleRuntime;
  return {
    definition,
    selectorRuntime: stepModuleRuntime.selectorRuntime || null,
    parameterValues: stepModuleRenderFrameValues(definition, renderParams, frameIndex),
    animationState: stepModuleRenderFrameState(renderParams, frameIndex),
    cadPath: stepModuleRuntime.cadPath || definition.cadPath || "",
    sourceUrl: stepModuleRuntime.sourceUrl || definition.url || ""
  };
}

async function renderParamAnimation(meshData, job, stepModuleRuntime) {
  const params = stepModuleRuntime.renderParams;
  const output = Array.isArray(job.outputs) && job.outputs.length ? job.outputs[0] : {};
  const width = Math.max(1, Math.floor(Number(output.width || job.width || 720)));
  const height = Math.max(1, Math.floor(Number(output.height || job.height || 480)));
  const frameOutputs = Array.from({ length: params.frameCount }, (_, index) => ({
    ...output,
    path: "",
    width,
    height,
    parameters: stepModuleFrameRuntime(stepModuleRuntime, index)
  }));
  const frameResult = await renderMeshJob(meshData, {
    ...job,
    outputs: frameOutputs,
    render: {
      ...(job.render || {}),
      lockFraming: true
    }
  });
  const encoder = GIFEncoder();
  const transparent = shouldEncodeTransparentGif(job);
  for (let index = 0; index < frameResult.outputs.length; index += 1) {
    const imageData = await dataUrlToImageData(frameResult.outputs[index].dataUrl, width, height);
    const frame = encodeGifFrameImageData(imageData, { transparent });
    encoder.writeFrame(frame.indexed, width, height, {
      palette: frame.palette,
      transparent: frame.transparent,
      transparentIndex: frame.transparentIndex,
      delay: 1000 / params.fps,
      repeat: params.loop === false ? -1 : 0,
      dispose: frame.transparent ? 2 : -1
    });
  }
  encoder.finish();
  const bytes = encoder.bytesView();
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return {
    ok: true,
    mode: String(job.mode || "view").toLowerCase(),
    outputs: [{
      path: String(output.path || job.output || ""),
      width,
      height,
      frameCount: params.frameCount,
      fps: params.fps,
      durationSeconds: params.durationSeconds,
      loop: params.loop !== false,
      mimeType: "image/gif",
      dataUrl: `data:image/gif;base64,${btoa(binary)}`
    }],
    timings: frameResult.timings,
    warnings: frameResult.warnings || []
  };
}

async function runHeadlessRenderJob(job) {
  const meshData = applySelection(await loadMeshData(job), job.selection || {});
  const stepModuleRuntime = await loadStepModuleRuntime(job);
  const selectorRuntime = stepModuleRuntime?.selectorRuntime || await loadRenderSelectorRuntime(job, {
    cadPath: stepModuleRuntime?.cadPath || ""
  });
  if (stepModuleRuntime && String(job.mode || "view").toLowerCase() !== "view") {
    throw new Error("render params support only view mode; set theme.display.mode for solid or wire output");
  }
  if (stepModuleRuntime?.renderParams?.animated) {
    return renderParamAnimation(meshData, job, stepModuleRuntime);
  }
  if (String(job.mode || "view").toLowerCase() === "orbit") {
    return renderOrbit(meshData, { ...job, selectorRuntime });
  }
  return renderMeshJob(meshData, stepModuleRuntime
    ? {
        ...job,
        selectorRuntime,
        parameters: stepModuleFrameRuntime(stepModuleRuntime, 0)
      }
    : {
        ...job,
        selectorRuntime
      });
}

main();
