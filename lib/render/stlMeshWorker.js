import { buildMeshDataFromStlBuffer } from "./stlMeshData.js";

const activeControllers = new Map();

function fetchError(url, response) {
  return new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
}

function meshDataTransferList(meshData) {
  const buffers = [
    meshData?.vertices?.buffer,
    meshData?.indices?.buffer,
    meshData?.normals?.buffer,
    meshData?.colors?.buffer,
    meshData?.edge_indices?.buffer
  ].filter((buffer) => buffer instanceof ArrayBuffer && buffer.byteLength > 0);
  return [...new Set(buffers)];
}

async function loadArrayBuffer(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw fetchError(url, response);
  }
  return response.arrayBuffer();
}

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  const id = message.id;
  if (!id) {
    return;
  }

  if (message.type === "cancel") {
    activeControllers.get(id)?.abort();
    activeControllers.delete(id);
    return;
  }

  if (message.type !== "loadStl") {
    return;
  }

  const controller = new AbortController();
  activeControllers.set(id, controller);
  try {
    const buffer = await loadArrayBuffer(message.url, controller.signal);
    const meshData = await buildMeshDataFromStlBuffer(buffer);
    if (controller.signal.aborted) {
      return;
    }
    self.postMessage(
      { id, ok: true, meshData },
      meshDataTransferList(meshData)
    );
  } catch (error) {
    if (!controller.signal.aborted) {
      self.postMessage({
        id,
        ok: false,
        error: {
          name: error?.name || "Error",
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  } finally {
    activeControllers.delete(id);
  }
});
