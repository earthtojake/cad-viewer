function normalizePerspectiveMetadataValue(value) {
  return String(value || "").trim();
}

export function clonePerspectiveVector(vector) {
  if (!Array.isArray(vector) || vector.length < 3) {
    return null;
  }
  const next = [
    Number(vector[0]),
    Number(vector[1]),
    Number(vector[2])
  ];
  return next.every(Number.isFinite) ? next : null;
}

export function clonePerspectiveSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  const position = clonePerspectiveVector(snapshot.position);
  const target = clonePerspectiveVector(snapshot.target);
  const up = clonePerspectiveVector(snapshot.up);
  if (!position || !target || !up) {
    return null;
  }
  const clonedSnapshot = {
    position,
    target,
    up
  };
  const modelKey = normalizePerspectiveMetadataValue(snapshot.modelKey);
  const sceneScaleMode = normalizePerspectiveMetadataValue(snapshot.sceneScaleMode);
  const coordinateSystem = normalizePerspectiveMetadataValue(snapshot.coordinateSystem);
  if (modelKey) {
    clonedSnapshot.modelKey = modelKey;
  }
  if (sceneScaleMode) {
    clonedSnapshot.sceneScaleMode = sceneScaleMode;
  }
  if (coordinateSystem) {
    clonedSnapshot.coordinateSystem = coordinateSystem;
  }
  return clonedSnapshot;
}

export function annotatePerspectiveSnapshot(snapshot, { modelKey = "", sceneScaleMode = "", coordinateSystem = "" } = {}) {
  const annotatedSnapshot = clonePerspectiveSnapshot(snapshot);
  if (!annotatedSnapshot) {
    return null;
  }
  const normalizedModelKey = normalizePerspectiveMetadataValue(modelKey);
  const normalizedSceneScaleMode = normalizePerspectiveMetadataValue(sceneScaleMode);
  const normalizedCoordinateSystem = normalizePerspectiveMetadataValue(coordinateSystem);
  if (normalizedModelKey) {
    annotatedSnapshot.modelKey = normalizedModelKey;
  }
  if (normalizedSceneScaleMode) {
    annotatedSnapshot.sceneScaleMode = normalizedSceneScaleMode;
  }
  if (normalizedCoordinateSystem) {
    annotatedSnapshot.coordinateSystem = normalizedCoordinateSystem;
  }
  return annotatedSnapshot;
}

export function resolvePerspectiveSnapshot(primary, fallback) {
  if (typeof primary !== "undefined") {
    return clonePerspectiveSnapshot(primary);
  }
  return clonePerspectiveSnapshot(fallback);
}

function perspectiveVectorEqual(a, b, epsilon = 1e-4) {
  if (a === b) {
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (Math.abs((Number(a[index]) || 0) - (Number(b[index]) || 0)) > epsilon) {
      return false;
    }
  }
  return true;
}

export function perspectiveSnapshotEqual(a, b, epsilon = 1e-4) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return !a && !b;
  }
  return (
    perspectiveVectorEqual(a.position, b.position, epsilon) &&
    perspectiveVectorEqual(a.target, b.target, epsilon) &&
    perspectiveVectorEqual(a.up, b.up, epsilon) &&
    normalizePerspectiveMetadataValue(a.modelKey) === normalizePerspectiveMetadataValue(b.modelKey) &&
    normalizePerspectiveMetadataValue(a.sceneScaleMode) === normalizePerspectiveMetadataValue(b.sceneScaleMode) &&
    normalizePerspectiveMetadataValue(a.coordinateSystem) === normalizePerspectiveMetadataValue(b.coordinateSystem)
  );
}

export function perspectiveSnapshotMatchesScene(snapshot, { modelKey = "", sceneScaleMode = "", coordinateSystem = "" } = {}) {
  const normalizedSnapshot = clonePerspectiveSnapshot(snapshot);
  if (!normalizedSnapshot) {
    return false;
  }
  const normalizedModelKey = normalizePerspectiveMetadataValue(modelKey);
  if (normalizedModelKey && normalizedSnapshot.modelKey !== normalizedModelKey) {
    return false;
  }
  const normalizedSceneScaleMode = normalizePerspectiveMetadataValue(sceneScaleMode);
  if (normalizedSceneScaleMode && normalizedSnapshot.sceneScaleMode !== normalizedSceneScaleMode) {
    return false;
  }
  const normalizedCoordinateSystem = normalizePerspectiveMetadataValue(coordinateSystem);
  if (normalizedCoordinateSystem && normalizedSnapshot.coordinateSystem !== normalizedCoordinateSystem) {
    return false;
  }
  return true;
}
