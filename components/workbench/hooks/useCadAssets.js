import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAbortError,
  loadRender3Mf,
  loadRenderDxf,
  loadRenderGlb,
  loadRenderSelectorBundle,
  loadRenderSdf,
  loadRenderStl,
  loadRenderSrdf,
  loadRenderTopologyIndex,
  loadRenderUrdf,
  peekRender3Mf,
  peekRenderDxf,
  peekRenderGlb,
  peekRenderSelectorBundle,
  peekRenderSdf,
  peekRenderStl,
  peekRenderSrdf,
  peekRenderTopologyIndex,
  peekRenderUrdf
} from "../../../lib/renderAssetClient";
import {
  assemblyRootFromTopology,
  assemblyUsesSelfContainedMesh,
  buildSelfContainedAssemblyMeshData
} from "../../../lib/assembly/meshData";
import { mapWithConcurrency } from "../../../lib/async/concurrency";
import { ASSET_STATUS, REFERENCE_STATUS } from "../../../lib/workbench/constants";

const ROBOT_MESH_LOAD_CONCURRENCY = 3;

function abortLoad(controllerRef) {
  controllerRef.current?.abort();
  controllerRef.current = null;
}

function browserYield() {
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function abortError() {
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function robotMeshLoadConcurrency() {
  const hardwareConcurrency = typeof navigator !== "undefined"
    ? Number(navigator.hardwareConcurrency)
    : 0;
  if (!Number.isFinite(hardwareConcurrency) || hardwareConcurrency <= 0) {
    return ROBOT_MESH_LOAD_CONCURRENCY;
  }
  return Math.max(2, Math.min(ROBOT_MESH_LOAD_CONCURRENCY, Math.floor(hardwareConcurrency / 2)));
}

function urdfMeshUrls(urdfData) {
  return [...new Set(
    (Array.isArray(urdfData?.links) ? urdfData.links : [])
      .flatMap((link) => Array.isArray(link?.visuals) ? link.visuals : [])
      .map((visual) => String(visual?.meshUrl || "").trim())
      .filter(Boolean)
  )];
}

function meshUrlExtension(meshUrl) {
  const path = String(meshUrl || "").split("?")[0].split("#")[0].toLowerCase();
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")) : "";
  return extension;
}

function peekRenderRobotMesh(meshUrl) {
  const extension = meshUrlExtension(meshUrl);
  if (extension === ".glb" || extension === ".gltf") {
    return peekRenderGlb(meshUrl);
  }
  if (extension === ".3mf") {
    return peekRender3Mf(meshUrl);
  }
  return peekRenderStl(meshUrl);
}

function loadRenderRobotMesh(meshUrl, options) {
  const extension = meshUrlExtension(meshUrl);
  if (extension === ".glb" || extension === ".gltf") {
    return loadRenderGlb(meshUrl, options);
  }
  if (extension === ".3mf") {
    return loadRender3Mf(meshUrl, options);
  }
  return loadRenderStl(meshUrl, options);
}

async function loadRenderRobotMeshes(meshUrls, { signal, onProgress } = {}) {
  const total = meshUrls.length;
  let completed = 0;
  onProgress?.(completed, total);
  return mapWithConcurrency(meshUrls, robotMeshLoadConcurrency(), async (meshUrl) => {
    if (signal?.aborted) {
      throw abortError();
    }
    await browserYield();
    const mesh = await loadRenderRobotMesh(meshUrl, { signal });
    completed += 1;
    onProgress?.(completed, total);
    await browserYield();
    return mesh;
  });
}

function entryAsset(entry, key) {
  return entry?.assets?.[key] || null;
}

function entryAssetUrl(entry, key) {
  return String(entryAsset(entry, key)?.url || "").trim();
}

function entryAssetHash(entry, key) {
  return String(entryAsset(entry, key)?.hash || "").trim();
}

function entryUrdfAssetHash(entry) {
  return [
    entryAssetHash(entry, "urdf"),
    entryAssetHash(entry, "srdf"),
    entryAssetHash(entry, "sdf")
  ].filter(Boolean).join(":");
}

function entryMeshAssetKey(entry) {
  return entry?.kind === "stl" || entry?.kind === "3mf" || entry?.kind === "glb" ? entry.kind : "glb";
}

function entryMeshAssetUrl(entry) {
  return entryAssetUrl(entry, entryMeshAssetKey(entry));
}

function entryMeshAssetHash(entry) {
  return entryAssetHash(entry, entryMeshAssetKey(entry));
}

function entryTopologyAssetUrl(entry) {
  return entryAssetUrl(entry, "topology") || entryAssetUrl(entry, "glb");
}

function entrySelectorTopologyAssetUrl(entry) {
  return entryAssetUrl(entry, "selectorTopology") || entryTopologyAssetUrl(entry);
}

function peekRenderMeshForEntry(entry) {
  const meshUrl = entryMeshAssetUrl(entry);
  const assetKey = entryMeshAssetKey(entry);
  if (assetKey === "stl") {
    return peekRenderStl(meshUrl);
  }
  if (assetKey === "3mf") {
    return peekRender3Mf(meshUrl);
  }
  return peekRenderGlb(meshUrl);
}

function loadRenderMeshForEntry(entry, options) {
  const meshUrl = entryMeshAssetUrl(entry);
  const assetKey = entryMeshAssetKey(entry);
  if (assetKey === "stl") {
    return loadRenderStl(meshUrl, options);
  }
  if (assetKey === "3mf") {
    return loadRender3Mf(meshUrl, options);
  }
  return loadRenderGlb(meshUrl, options);
}

function createAssemblyPreviewMeshData(meshData, topologyManifest = null) {
  return {
    ...meshData,
    parts: null,
    assemblyRoot: assemblyRootFromTopology(topologyManifest)
  };
}

export function useCadAssets({
  entryHasMesh,
  entryHasReferences,
  entryHasDxf,
  buildNormalizedReferenceState,
}) {
  const [meshState, setMeshState] = useState(null);
  const [meshLoadInProgress, setMeshLoadInProgress] = useState(false);
  const [meshLoadTargetFile, setMeshLoadTargetFile] = useState("");
  const [meshLoadStage, setMeshLoadStage] = useState("");
  const [status, setStatus] = useState(ASSET_STATUS.READY);
  const [error, setError] = useState("");
  const [dxfState, setDxfState] = useState(null);
  const [dxfStatus, setDxfStatus] = useState(ASSET_STATUS.PENDING);
  const [dxfError, setDxfError] = useState("");
  const [dxfLoadStage, setDxfLoadStage] = useState("");
  const [urdfState, setUrdfState] = useState(null);
  const [urdfStatus, setUrdfStatus] = useState(ASSET_STATUS.PENDING);
  const [urdfError, setUrdfError] = useState("");
  const [urdfLoadStage, setUrdfLoadStage] = useState("");
  const [referenceState, setReferenceState] = useState(null);
  const [referenceStatus, setReferenceStatus] = useState(REFERENCE_STATUS.IDLE);
  const [referenceError, setReferenceError] = useState("");
  const [referenceLoadStage, setReferenceLoadStage] = useState("");

  const requestIdRef = useRef(0);
  const dxfRequestIdRef = useRef(0);
  const urdfRequestIdRef = useRef(0);
  const referenceRequestIdRef = useRef(0);
  const meshAbortControllerRef = useRef(null);
  const dxfAbortControllerRef = useRef(null);
  const urdfAbortControllerRef = useRef(null);
  const referenceAbortControllerRef = useRef(null);

  const getAssemblyMeshHash = useCallback((entry) => {
    return [entryAssetHash(entry, "topology"), entryAssetHash(entry, "glb")].filter(Boolean).join(":");
  }, []);

  const buildSelfContainedAssemblyMeshState = useCallback((entry, topologyManifest, meshData) => {
    return {
      file: entry.file,
      kind: entry.kind,
      meshHash: getAssemblyMeshHash(entry),
      meshData: buildSelfContainedAssemblyMeshData(topologyManifest, meshData),
      assemblyStructureReady: true,
      assemblyInteractionReady: true,
      assemblyBackgroundError: ""
    };
  }, [getAssemblyMeshHash]);

  const buildAssemblyPreviewMeshState = useCallback((entry, meshData, topologyManifest = null) => {
    const previewMeshData = createAssemblyPreviewMeshData(meshData, topologyManifest);
    return {
      file: entry.file,
      kind: entry.kind,
      meshHash: getAssemblyMeshHash(entry),
      meshData: previewMeshData,
      assemblyStructureReady: !!previewMeshData.assemblyRoot,
      assemblyInteractionReady: false,
      assemblyBackgroundError: ""
    };
  }, [getAssemblyMeshHash]);

  const getCachedMeshState = useCallback((entry) => {
    if (!entryHasMesh(entry)) {
      return null;
    }
    if (entry?.kind === "assembly") {
      const glbUrl = entryAssetUrl(entry, "glb");
      const topologyUrl = entryTopologyAssetUrl(entry);
      const previewMeshData = peekRenderGlb(glbUrl);
      if (!previewMeshData) {
        return null;
      }
      const topologyManifest = peekRenderTopologyIndex(topologyUrl);
      if (!topologyManifest) {
        return buildAssemblyPreviewMeshState(entry, previewMeshData);
      }
      if (assemblyUsesSelfContainedMesh(topologyManifest)) {
        return buildSelfContainedAssemblyMeshState(entry, topologyManifest, previewMeshData);
      }
      return null;
    }
    const meshData = peekRenderMeshForEntry(entry);
    if (!meshData) {
      return null;
    }
    return {
      file: entry.file,
      kind: entry.kind,
      meshHash: entryMeshAssetHash(entry),
      meshData
    };
  }, [buildAssemblyPreviewMeshState, buildSelfContainedAssemblyMeshState, entryHasMesh]);

  const getCachedReferenceState = useCallback((entry) => {
    if (!entryHasReferences(entry)) {
      return null;
    }
    const bundle = peekRenderSelectorBundle(entrySelectorTopologyAssetUrl(entry));
    return bundle ? buildNormalizedReferenceState(entry, bundle) : null;
  }, [buildNormalizedReferenceState, entryHasReferences]);

  const getCachedDxfState = useCallback((entry) => {
    if (!entryHasDxf(entry)) {
      return null;
    }
    const dxfData = peekRenderDxf(entryAssetUrl(entry, "dxf"));
    if (!dxfData) {
      return null;
    }
    return {
      file: entry.file,
      kind: entry.kind,
      dxfHash: entryAssetHash(entry, "dxf"),
      dxfData
    };
  }, [entryHasDxf]);

  const getCachedUrdfState = useCallback((entry) => {
    const kind = String(entry?.kind || "").trim().toLowerCase();
    if (!["urdf", "srdf", "sdf"].includes(kind)) {
      return null;
    }
    const primaryAssetKey = kind === "sdf" ? "sdf" : "urdf";
    if (!entryAssetUrl(entry, primaryAssetKey)) {
      return null;
    }
    const srdfPayload = kind === "srdf"
      ? peekRenderSrdf(entryAssetUrl(entry, "srdf"), { urdfUrl: entryAssetUrl(entry, "urdf") })
      : null;
    const urdfData = kind === "srdf"
      ? srdfPayload?.urdfData
      : kind === "sdf"
        ? peekRenderSdf(entryAssetUrl(entry, "sdf"))
        : peekRenderUrdf(entryAssetUrl(entry, "urdf"));
    if (!urdfData) {
      return null;
    }
    const meshUrls = urdfMeshUrls(urdfData);
    const meshes = meshUrls.map((meshUrl) => peekRenderRobotMesh(meshUrl)).filter(Boolean);
    if (meshes.length !== meshUrls.length) {
      return null;
    }
    const meshesByUrl = new Map(meshUrls.map((meshUrl, index) => [meshUrl, meshes[index]]));
    return {
      file: entry.file,
      kind: entry.kind,
      urdfHash: entryUrdfAssetHash(entry),
      urdfData,
      meshesByUrl
    };
  }, []);

  const cancelMeshLoad = useCallback(() => {
    requestIdRef.current += 1;
    abortLoad(meshAbortControllerRef);
    setMeshLoadInProgress(false);
    setMeshLoadTargetFile("");
    setMeshLoadStage("");
  }, []);

  const cancelDxfLoad = useCallback(() => {
    dxfRequestIdRef.current += 1;
    abortLoad(dxfAbortControllerRef);
    setDxfLoadStage("");
  }, []);

  const cancelUrdfLoad = useCallback(() => {
    urdfRequestIdRef.current += 1;
    abortLoad(urdfAbortControllerRef);
    setUrdfLoadStage("");
  }, []);

  const cancelReferenceLoad = useCallback(() => {
    referenceRequestIdRef.current += 1;
    abortLoad(referenceAbortControllerRef);
    setReferenceLoadStage("");
  }, []);

  const loadMeshForEntry = useCallback(async (entry) => {
    cancelMeshLoad();
    const requestId = requestIdRef.current;

    if (!entryHasMesh(entry)) {
      setMeshState(null);
      setStatus(ASSET_STATUS.PENDING);
      setError("");
      return;
    }

    const cachedMeshState = getCachedMeshState(entry);
    if (cachedMeshState) {
      setMeshState(cachedMeshState);
      setStatus(ASSET_STATUS.READY);
      setError("");
      if (entry?.kind !== "assembly" || cachedMeshState.assemblyInteractionReady || cachedMeshState.assemblyBackgroundError) {
        return;
      }
    }

    const controller = new AbortController();
    meshAbortControllerRef.current = controller;
    setMeshLoadInProgress(true);
    setMeshLoadTargetFile(String(entry?.file || "").trim());
    setMeshLoadStage(entry?.kind === "assembly" ? "loading assembly mesh" : "loading mesh");
    const keepRenderedAssemblyVisible = entry?.kind === "assembly" && !!cachedMeshState;
    let assemblyPreviewVisible = keepRenderedAssemblyVisible;
    if (!keepRenderedAssemblyVisible) {
      setStatus(ASSET_STATUS.LOADING);
      setError("");
    }

    try {
      if (entry?.kind === "assembly") {
        const meshUrl = entryAssetUrl(entry, "glb");
        const topologyUrl = entryTopologyAssetUrl(entry);
        if (!meshUrl) {
          throw new Error(`STEP assembly is missing GLB asset: ${entry.file || "(unknown)"}`);
        }
        const previewMeshData = cachedMeshState?.meshData || await loadRenderGlb(meshUrl, { signal: controller.signal });
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (!cachedMeshState) {
          setMeshState(buildAssemblyPreviewMeshState(entry, previewMeshData));
          setStatus(ASSET_STATUS.READY);
          setError("");
          assemblyPreviewVisible = true;
        }
        setMeshLoadStage("loading topology");
        const topologyManifest = await loadRenderTopologyIndex(topologyUrl, { signal: controller.signal });
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (!cachedMeshState?.assemblyStructureReady) {
          setMeshState(buildAssemblyPreviewMeshState(entry, previewMeshData, topologyManifest));
        }
        if (assemblyUsesSelfContainedMesh(topologyManifest)) {
          setMeshLoadStage("building assembly");
          setMeshState(buildSelfContainedAssemblyMeshState(entry, topologyManifest, previewMeshData));
          setStatus(ASSET_STATUS.READY);
          setError("");
          return;
        }
        throw new Error("STEP assembly topology is not self-contained.\nRegenerate STEP artifacts with the following command using the CAD skill:");
      }
      const meshUrl = entryMeshAssetUrl(entry);
      if (!meshUrl) {
        const assetLabel = entryMeshAssetKey(entry).toUpperCase();
        throw new Error(`${assetLabel} entry is missing ${assetLabel} asset: ${entry.file || "(unknown)"}`);
      }
      const meshData = await loadRenderMeshForEntry(entry, { signal: controller.signal });
      const meshHash = entryMeshAssetHash(entry);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setMeshLoadStage("building");
      setMeshState({
        file: entry.file,
        kind: entry.kind,
        meshHash,
        meshData
      });
      setStatus(ASSET_STATUS.READY);
    } catch (err) {
      if (requestId !== requestIdRef.current || isAbortError(err) || controller.signal.aborted) {
        return;
      }
      if (entry?.kind === "assembly" && assemblyPreviewVisible) {
        setMeshState((current) => {
          if (!current || current.file !== entry.file || current.meshHash !== getAssemblyMeshHash(entry)) {
            return current;
          }
          return {
            ...current,
            assemblyBackgroundError: err instanceof Error ? err.message : String(err)
          };
        });
        return;
      }
      setStatus(ASSET_STATUS.ERROR);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestId === requestIdRef.current) {
        setMeshLoadInProgress(false);
        setMeshLoadTargetFile("");
        setMeshLoadStage("");
      }
      if (meshAbortControllerRef.current === controller) {
        meshAbortControllerRef.current = null;
      }
    }
  }, [buildAssemblyPreviewMeshState, buildSelfContainedAssemblyMeshState, cancelMeshLoad, entryHasMesh, getAssemblyMeshHash, getCachedMeshState]);

  const loadReferencesForEntry = useCallback(async (entry) => {
    cancelReferenceLoad();
    const requestId = referenceRequestIdRef.current;

    if (!entryHasReferences(entry)) {
      setReferenceState(null);
      setReferenceStatus(REFERENCE_STATUS.DISABLED);
      setReferenceError("");
      return;
    }

    const cachedReferenceState = getCachedReferenceState(entry);
    if (cachedReferenceState) {
      setReferenceState(cachedReferenceState);
      setReferenceStatus(cachedReferenceState.disabledReason ? REFERENCE_STATUS.DISABLED : REFERENCE_STATUS.READY);
      setReferenceError(cachedReferenceState.disabledReason || "");
      return;
    }

    const controller = new AbortController();
    referenceAbortControllerRef.current = controller;
    setReferenceStatus(REFERENCE_STATUS.LOADING);
    setReferenceError("");
    setReferenceLoadStage("loading topology");

    try {
      const bundle = await loadRenderSelectorBundle(
        entrySelectorTopologyAssetUrl(entry),
        { signal: controller.signal }
      );
      if (requestId !== referenceRequestIdRef.current) {
        return;
      }
      const nextReferenceState = buildNormalizedReferenceState(entry, bundle);
      setReferenceState(nextReferenceState);
      setReferenceStatus(nextReferenceState.disabledReason ? REFERENCE_STATUS.DISABLED : REFERENCE_STATUS.READY);
      setReferenceError(nextReferenceState.disabledReason || "");
    } catch (err) {
      if (requestId !== referenceRequestIdRef.current || isAbortError(err) || controller.signal.aborted) {
        return;
      }
      setReferenceStatus(REFERENCE_STATUS.ERROR);
      setReferenceError(err instanceof Error ? err.message : String(err));
    } finally {
      if (referenceAbortControllerRef.current === controller) {
        referenceAbortControllerRef.current = null;
      }
      if (requestId === referenceRequestIdRef.current) {
        setReferenceLoadStage("");
      }
    }
  }, [buildNormalizedReferenceState, cancelReferenceLoad, entryHasReferences, getCachedReferenceState]);

  const loadDxfForEntry = useCallback(async (entry) => {
    cancelDxfLoad();
    const requestId = dxfRequestIdRef.current;

    if (!entryHasDxf(entry)) {
      setDxfState(null);
      setDxfStatus(ASSET_STATUS.PENDING);
      setDxfError("");
      return;
    }

    const cachedDxfState = getCachedDxfState(entry);
    if (cachedDxfState) {
      setDxfState(cachedDxfState);
      setDxfStatus(ASSET_STATUS.READY);
      setDxfError("");
      return;
    }

    const controller = new AbortController();
    dxfAbortControllerRef.current = controller;
    setDxfStatus(ASSET_STATUS.LOADING);
    setDxfError("");
    setDxfLoadStage("loading DXF");

    try {
      const dxfData = await loadRenderDxf(entryAssetUrl(entry, "dxf"), { signal: controller.signal });
      if (requestId !== dxfRequestIdRef.current) {
        return;
      }
      setDxfLoadStage("building preview");
      setDxfState({
        file: entry.file,
        kind: entry.kind,
        dxfHash: entryAssetHash(entry, "dxf"),
        dxfData
      });
      setDxfStatus(ASSET_STATUS.READY);
    } catch (err) {
      if (requestId !== dxfRequestIdRef.current || isAbortError(err) || controller.signal.aborted) {
        return;
      }
      setDxfStatus(ASSET_STATUS.ERROR);
      setDxfError(err instanceof Error ? err.message : String(err));
    } finally {
      if (dxfAbortControllerRef.current === controller) {
        dxfAbortControllerRef.current = null;
      }
      if (requestId === dxfRequestIdRef.current) {
        setDxfLoadStage("");
      }
    }
  }, [cancelDxfLoad, entryHasDxf, getCachedDxfState]);

  const loadUrdfForEntry = useCallback(async (entry) => {
    cancelUrdfLoad();
    const requestId = urdfRequestIdRef.current;

    const kind = String(entry?.kind || "").trim().toLowerCase();
    if (!["urdf", "srdf", "sdf"].includes(kind)) {
      setUrdfState(null);
      setUrdfStatus(ASSET_STATUS.PENDING);
      setUrdfError("");
      return;
    }
    const primaryAssetKey = kind === "sdf" ? "sdf" : "urdf";
    if (!entryAssetUrl(entry, primaryAssetKey)) {
      setUrdfState(null);
      setUrdfStatus(ASSET_STATUS.PENDING);
      setUrdfError("");
      return;
    }

    const cachedUrdfState = getCachedUrdfState(entry);
    if (cachedUrdfState) {
      setUrdfState(cachedUrdfState);
      setUrdfStatus(ASSET_STATUS.READY);
      setUrdfError("");
      return;
    }

    const controller = new AbortController();
    urdfAbortControllerRef.current = controller;
    setUrdfStatus(ASSET_STATUS.LOADING);
    setUrdfError("");
    setUrdfLoadStage(kind === "sdf" ? "loading SDF" : kind === "srdf" ? "loading SRDF" : "loading URDF");

    try {
      const payload = kind === "srdf"
        ? await loadRenderSrdf(entryAssetUrl(entry, "srdf"), {
            signal: controller.signal,
            urdfUrl: entryAssetUrl(entry, "urdf")
          })
        : kind === "sdf"
          ? { urdfData: await loadRenderSdf(entryAssetUrl(entry, "sdf"), { signal: controller.signal }) }
          : { urdfData: await loadRenderUrdf(entryAssetUrl(entry, "urdf"), { signal: controller.signal }) };
      const urdfData = payload.urdfData;
      const meshUrls = urdfMeshUrls(urdfData);
      setUrdfLoadStage(meshUrls.length ? "loading meshes" : "building robot");
      const meshes = await loadRenderRobotMeshes(meshUrls, {
        signal: controller.signal,
        onProgress: (completed, total) => {
          if (requestId === urdfRequestIdRef.current && total > 0) {
            setUrdfLoadStage(`loading meshes ${completed}/${total}`);
          }
        }
      });
      if (requestId !== urdfRequestIdRef.current) {
        return;
      }
      setUrdfLoadStage("building robot");
      const meshesByUrl = new Map(meshUrls.map((meshUrl, index) => [meshUrl, meshes[index]]));
      setUrdfState({
        file: entry.file,
        kind: entry.kind,
        urdfHash: entryUrdfAssetHash(entry),
        urdfData,
        meshesByUrl
      });
      setUrdfStatus(ASSET_STATUS.READY);
    } catch (err) {
      if (requestId !== urdfRequestIdRef.current || isAbortError(err) || controller.signal.aborted) {
        return;
      }
      setUrdfStatus(ASSET_STATUS.ERROR);
      setUrdfError(err instanceof Error ? err.message : String(err));
    } finally {
      if (urdfAbortControllerRef.current === controller) {
        urdfAbortControllerRef.current = null;
      }
      if (requestId === urdfRequestIdRef.current) {
        setUrdfLoadStage("");
      }
    }
  }, [cancelUrdfLoad, getCachedUrdfState]);

  useEffect(() => () => {
    abortLoad(meshAbortControllerRef);
    abortLoad(dxfAbortControllerRef);
    abortLoad(urdfAbortControllerRef);
    abortLoad(referenceAbortControllerRef);
  }, []);

  return {
    meshState,
    setMeshState,
    meshLoadInProgress,
    meshLoadTargetFile,
    meshLoadStage,
    status,
    setStatus,
    error,
    setError,
    dxfState,
    setDxfState,
    dxfStatus,
    setDxfStatus,
    dxfError,
    setDxfError,
    dxfLoadStage,
    urdfState,
    setUrdfState,
    urdfStatus,
    setUrdfStatus,
    urdfError,
    setUrdfError,
    urdfLoadStage,
    referenceState,
    setReferenceState,
    referenceStatus,
    setReferenceStatus,
    referenceError,
    setReferenceError,
    referenceLoadStage,
    getCachedMeshState,
    getCachedReferenceState,
    getCachedDxfState,
    getCachedUrdfState,
    cancelMeshLoad,
    cancelDxfLoad,
    cancelUrdfLoad,
    cancelReferenceLoad,
    loadMeshForEntry,
    loadDxfForEntry,
    loadUrdfForEntry,
    loadReferencesForEntry
  };
}
