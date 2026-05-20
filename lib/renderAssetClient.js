import { parseDxf } from "./dxf/parseDxf.js";
import { buildMeshDataFromGlbBuffer } from "./render/glbMeshData.js";
import { buildMeshDataFromStlBuffer } from "./render/stlMeshData.js";
import { buildMeshDataFrom3MfBuffer } from "./render/threeMfMeshData.js";
import { loadStlMeshDataInWorker } from "./render/stlMeshWorkerClient.js";

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function fetchError(url, response) {
  return new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
}

const jsonCache = new Map();
const textCache = new Map();
const arrayBufferCache = new Map();
const glbCache = new Map();
const stlCache = new Map();
const threeMfCache = new Map();
const selectorCache = new Map();
const topologyIndexCache = new Map();
const dxfCache = new Map();
const urdfCache = new Map();
const srdfCache = new Map();
const sdfCache = new Map();
const STEP_TOPOLOGY_EXTENSION = "STEP_topology";

async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw fetchError(url, response);
  }
  return response.json();
}

async function fetchText(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw fetchError(url, response);
  }
  return response.text();
}

async function fetchArrayBuffer(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw fetchError(url, response);
  }
  return response.arrayBuffer();
}

async function loadCached(cache, key, loader, { cachePending = true } = {}) {
  if (!key) {
    throw new Error("Missing asset cache key");
  }
  if (cache.has(key)) {
    const cached = cache.get(key);
    if (cachePending || typeof cached?.then !== "function") {
      return cached;
    }
  }
  if (!cachePending) {
    const payload = await loader();
    cache.set(key, payload);
    return payload;
  }
  let pending;
  pending = loader().catch((error) => {
    if (cache.get(key) === pending) {
      cache.delete(key);
    }
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

function peekCached(cache, key) {
  const value = cache.get(key);
  return value && typeof value.then !== "function" ? value : null;
}

function finalizeCached(cache, key, value) {
  cache.set(key, value);
  return value;
}

export function isAbortError(error) {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function loadRenderJson(url, { signal } = {}) {
  const payload = await loadCached(jsonCache, url, () => fetchJson(url, { signal }), { cachePending: !signal });
  return finalizeCached(jsonCache, url, payload);
}

export function peekRenderJson(url) {
  return peekCached(jsonCache, url);
}

export async function loadRenderText(url, { signal } = {}) {
  const payload = await loadCached(textCache, url, () => fetchText(url, { signal }), { cachePending: !signal });
  return finalizeCached(textCache, url, payload);
}

export function peekRenderText(url) {
  return peekCached(textCache, url);
}

export async function loadRenderArrayBuffer(url, { signal } = {}) {
  const payload = await loadCached(arrayBufferCache, url, () => fetchArrayBuffer(url, { signal }), { cachePending: !signal });
  return finalizeCached(arrayBufferCache, url, payload);
}

export function peekRenderArrayBuffer(url) {
  return peekCached(arrayBufferCache, url);
}

export async function loadRenderGlb(url, { signal } = {}) {
  const meshData = await loadCached(glbCache, url, async () => {
    const buffer = await loadRenderArrayBuffer(url, { signal });
    return buildMeshDataFromGlbBuffer(buffer);
  }, { cachePending: !signal });
  return finalizeCached(glbCache, url, meshData);
}

export function peekRenderGlb(url) {
  return peekCached(glbCache, url);
}

export async function loadRenderStl(url, { signal } = {}) {
  const meshData = await loadCached(stlCache, url, async () => {
    const workerMeshData = loadStlMeshDataInWorker(url, { signal });
    if (workerMeshData) {
      try {
        return await workerMeshData;
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
          throw error;
        }
      }
    }
    const buffer = await loadRenderArrayBuffer(url, { signal });
    return buildMeshDataFromStlBuffer(buffer);
  }, { cachePending: !signal });
  return finalizeCached(stlCache, url, meshData);
}

export function peekRenderStl(url) {
  return peekCached(stlCache, url);
}

export async function loadRender3Mf(url, { signal } = {}) {
  const meshData = await loadCached(threeMfCache, url, async () => {
    const buffer = await loadRenderArrayBuffer(url, { signal });
    return buildMeshDataFrom3MfBuffer(buffer);
  }, { cachePending: !signal });
  return finalizeCached(threeMfCache, url, meshData);
}

export function peekRender3Mf(url) {
  return peekCached(threeMfCache, url);
}

function parseGlbContainer(arrayBuffer) {
  const data = new DataView(arrayBuffer);
  if (data.byteLength < 20 || data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2) {
    throw new Error("Invalid GLB topology container");
  }
  const totalLength = Math.min(data.getUint32(8, true), data.byteLength);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= totalLength) {
    const chunkLength = data.getUint32(offset, true);
    const chunkType = data.getUint32(offset + 4, true);
    offset += 8;
    if (offset + chunkLength > totalLength) {
      throw new Error("Invalid GLB chunk length");
    }
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder("utf-8").decode(arrayBuffer.slice(offset, offset + chunkLength)).trim());
    } else if (chunkType === 0x004e4942) {
      bin = {
        buffer: arrayBuffer,
        byteOffset: offset,
        byteLength: chunkLength,
      };
    }
    offset += chunkLength;
  }
  if (!json || !bin) {
    throw new Error("GLB topology requires JSON and BIN chunks");
  }
  return { json, bin };
}

function glbBufferViewRange(gltf, bin, viewIndex) {
  const index = Number(viewIndex);
  const view = Array.isArray(gltf?.bufferViews) ? gltf.bufferViews[index] : null;
  if (!Number.isInteger(index) || !view || Number(view.buffer || 0) !== 0) {
    return null;
  }
  const byteOffset = bin.byteOffset + Number(view.byteOffset || 0);
  const byteLength = Number(view.byteLength || 0);
  if (!Number.isFinite(byteOffset) || !Number.isFinite(byteLength) || byteLength < 0) {
    return null;
  }
  if (byteOffset < bin.byteOffset || byteOffset + byteLength > bin.byteOffset + bin.byteLength) {
    return null;
  }
  return { byteOffset, byteLength };
}

function buildTypedView(glb, view) {
  if (!isObject(view)) {
    return null;
  }
  const range = glbBufferViewRange(glb.json, glb.bin, view.bufferView);
  if (!range) {
    return null;
  }
  const count = Number(view.count || 0);
  const relativeOffset = Number(view.byteOffset || 0);
  if (!Number.isFinite(count) || count < 0 || !Number.isFinite(relativeOffset) || relativeOffset < 0) {
    return null;
  }
  const byteOffset = range.byteOffset + relativeOffset;
  if (view.dtype === "float32") {
    return new Float32Array(glb.bin.buffer, byteOffset, count);
  }
  if (view.dtype === "uint32") {
    return new Uint32Array(glb.bin.buffer, byteOffset, count);
  }
  return null;
}

function buildSelectorBuffers(manifest, glb) {
  const views = manifest?.buffers?.views;
  if (!isObject(views)) {
    return {};
  }
  const output = {};
  for (const [name, view] of Object.entries(views)) {
    const typed = buildTypedView(glb, view);
    if (typed) {
      output[name] = typed;
    }
  }
  return output;
}

function stepTopologyExtension(glb) {
  const extension = glb.json?.extensions?.[STEP_TOPOLOGY_EXTENSION];
  if (!isObject(extension) || Number(extension.schemaVersion) !== 1) {
    throw new Error(`GLB is missing ${STEP_TOPOLOGY_EXTENSION}`);
  }
  return extension;
}

function parseJsonBufferView(glb, viewIndex, encoding = "utf-8") {
  const range = glbBufferViewRange(glb.json, glb.bin, viewIndex);
  if (!range) {
    return null;
  }
  const bytes = new Uint8Array(glb.bin.buffer, range.byteOffset, range.byteLength);
  return JSON.parse(new TextDecoder(String(encoding || "utf-8")).decode(bytes));
}

function topologyIndexFromGlbBuffer(arrayBuffer) {
  const glb = parseGlbContainer(arrayBuffer);
  const extension = stepTopologyExtension(glb);
  const manifest = parseJsonBufferView(glb, extension.indexView, extension.encoding);
  if (!isObject(manifest)) {
    throw new Error(`${STEP_TOPOLOGY_EXTENSION} indexView is invalid`);
  }
  return manifest;
}

function selectorBundleFromGlbBuffer(arrayBuffer) {
  const glb = parseGlbContainer(arrayBuffer);
  const extension = stepTopologyExtension(glb);
  const manifest = parseJsonBufferView(glb, extension.selectorView, extension.encoding);
  if (!isObject(manifest)) {
    throw new Error(`${STEP_TOPOLOGY_EXTENSION} selectorView is not available`);
  }
  if (manifest?.buffers?.littleEndian === false) {
    throw new Error("Big-endian selector buffers are not supported");
  }
  return {
    manifest,
    buffers: buildSelectorBuffers(manifest, glb),
  };
}

export async function loadRenderTopologyIndex(glbUrl, { signal } = {}) {
  const manifest = await loadCached(topologyIndexCache, glbUrl, async () => {
    const arrayBuffer = await loadRenderArrayBuffer(glbUrl, { signal });
    return topologyIndexFromGlbBuffer(arrayBuffer);
  }, { cachePending: !signal });
  return finalizeCached(topologyIndexCache, glbUrl, manifest);
}

export function peekRenderTopologyIndex(glbUrl) {
  return peekCached(topologyIndexCache, glbUrl);
}

export async function loadRenderSelectorBundle(glbUrl, { signal } = {}) {
  const cacheKey = glbUrl;
  const bundle = await loadCached(selectorCache, cacheKey, async () => {
    const arrayBuffer = await loadRenderArrayBuffer(glbUrl, { signal });
    return selectorBundleFromGlbBuffer(arrayBuffer);
  }, { cachePending: !signal });
  return finalizeCached(selectorCache, cacheKey, bundle);
}

export function peekRenderSelectorBundle(glbUrl) {
  return peekCached(selectorCache, glbUrl);
}

export async function loadRenderDxf(url, { signal } = {}) {
  const payload = await loadCached(dxfCache, url, async () => {
    const dxfText = await loadRenderText(url, { signal });
    return parseDxf(dxfText, { fileRef: "", sourceUrl: url });
  }, { cachePending: !signal });
  return finalizeCached(dxfCache, url, payload);
}

export function peekRenderDxf(url) {
  return peekCached(dxfCache, url);
}

function urdfCacheKey(url) {
  return String(url || "");
}

export async function loadRenderUrdf(url, { signal } = {}) {
  const cacheKey = urdfCacheKey(url);
  const payload = await loadCached(urdfCache, cacheKey, async () => {
    const [xmlText, { parseUrdf }] = await Promise.all([
      loadRenderText(url, { signal }),
      import("./urdf/parseUrdf.js"),
    ]);
    return parseUrdf(xmlText, { sourceUrl: url });
  }, { cachePending: !signal });
  return finalizeCached(urdfCache, cacheKey, payload);
}

export function peekRenderUrdf(url) {
  return peekCached(urdfCache, urdfCacheKey(url));
}

function srdfCacheKey(srdfUrl, urdfUrl = "") {
  return [srdfUrl, urdfUrl].filter(Boolean).join("::");
}

export async function loadRenderSrdf(srdfUrl, { signal, urdfUrl = "" } = {}) {
  const cacheKey = srdfCacheKey(srdfUrl, urdfUrl);
  const payload = await loadCached(srdfCache, cacheKey, async () => {
    const [srdfText, urdfData, { parseSrdf, motionFromSrdf }] = await Promise.all([
      loadRenderText(srdfUrl, { signal }),
      loadRenderUrdf(urdfUrl, { signal }),
      import("./urdf/parseSrdf.js"),
    ]);
    const srdfData = parseSrdf(srdfText, { sourceUrl: srdfUrl, urdfData });
    return {
      srdfData,
      urdfData: {
        ...urdfData,
        motion: motionFromSrdf(srdfData),
        srdf: srdfData
      }
    };
  }, { cachePending: !signal });
  return finalizeCached(srdfCache, cacheKey, payload);
}

export function peekRenderSrdf(srdfUrl, { urdfUrl = "" } = {}) {
  return peekCached(srdfCache, srdfCacheKey(srdfUrl, urdfUrl));
}

function sdfCacheKey(url) {
  return String(url || "");
}

export async function loadRenderSdf(url, { signal } = {}) {
  const cacheKey = sdfCacheKey(url);
  const payload = await loadCached(sdfCache, cacheKey, async () => {
    const [xmlText, { parseSdf }] = await Promise.all([
      loadRenderText(url, { signal }),
      import("./urdf/parseSdf.js"),
    ]);
    return parseSdf(xmlText, { sourceUrl: url });
  }, { cachePending: !signal });
  return finalizeCached(sdfCache, cacheKey, payload);
}

export function peekRenderSdf(url) {
  return peekCached(sdfCache, sdfCacheKey(url));
}
