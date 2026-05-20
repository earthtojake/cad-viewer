const GLB_CAD_UNIT_SCALE = 1000;

function boundsFromVertices(vertices) {
  if (!vertices?.length) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
    };
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index + 2 < vertices.length; index += 3) {
    const x = Number(vertices[index]);
    const y = Number(vertices[index + 1]);
    const z = Number(vertices[index + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
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
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
    };
  }
  return { min, max };
}

function isNeutralGrayColor(color) {
  if (!color) {
    return false;
  }
  const red = Number(color.r);
  const green = Number(color.g);
  const blue = Number(color.b);
  if (![red, green, blue].every(Number.isFinite)) {
    return false;
  }
  return Math.max(red, green, blue) - Math.min(red, green, blue) < 0.025;
}

function colorFromMaterial(material, useSourceColors, { ignoreNeutralGray = false } = {}) {
  if (!useSourceColors || !material?.color) {
    return null;
  }
  if (ignoreNeutralGray && isNeutralGrayColor(material.color)) {
    return null;
  }
  return {
    rgb: [material.color.r, material.color.g, material.color.b],
    hex: `#${material.color.getHexString()}`,
  };
}

function materialForGroup(material, group) {
  if (Array.isArray(material)) {
    const materialIndex = Number.isInteger(group?.materialIndex) ? group.materialIndex : 0;
    return material[materialIndex] || material[0] || null;
  }
  return material || null;
}

function isBuild123dAxisCorrectionMatrix(matrix) {
  const elements = matrix?.elements;
  if (!Array.isArray(elements) && !(elements instanceof Float32Array)) {
    return false;
  }
  const expected = [
    1, 0, 0, 0,
    0, 0, -1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  ];
  return expected.every((value, index) => Math.abs(Number(elements[index]) - value) < 1e-6);
}

function buildGlbCadRootCorrection(THREE, scene) {
  scene?.updateWorldMatrix?.(true, true);
  const children = Array.isArray(scene?.children) ? scene.children : [];
  if (children.length !== 1 || !isBuild123dAxisCorrectionMatrix(children[0]?.matrixWorld)) {
    return null;
  }
  return new THREE.Matrix4().copy(children[0].matrixWorld).invert();
}

function cadOccurrenceIdForObject(object) {
  let current = object || null;
  while (current) {
    const rawOccurrenceId = String(current.userData?.cadOccurrenceId || "").trim();
    if (rawOccurrenceId) {
      return rawOccurrenceId;
    }
    current = current.parent || null;
  }
  const objectName = String(object?.name || "").trim();
  return /^o\d+(?:\.\d+)*$/.test(objectName) ? objectName : "";
}

function sceneHasCadOccurrenceIds(scene) {
  let found = false;
  scene?.traverse?.((object) => {
    if (found) {
      return;
    }
    found = Boolean(String(object?.userData?.cadOccurrenceId || "").trim());
  });
  return found;
}

function cadVectorFromGlbVector(vector, convertYUpToCad) {
  const x = vector.x * GLB_CAD_UNIT_SCALE;
  const y = vector.y * GLB_CAD_UNIT_SCALE;
  const z = vector.z * GLB_CAD_UNIT_SCALE;
  return convertYUpToCad
    ? { x, y: -z, z: y }
    : { x, y, z };
}

function appendGlbPrimitive(
  THREE,
  accumulator,
  mesh,
  group,
  material,
  useSourceColors,
  rootCorrection,
  convertYUpToCad,
  primitiveIndex = 0,
  { ignoreNeutralGraySourceColors = false } = {}
) {
  const geometry = mesh?.geometry;
  const positions = geometry?.getAttribute?.("position");
  if (!positions || positions.itemSize !== 3 || positions.count <= 0) {
    return;
  }
  mesh.updateWorldMatrix?.(true, false);
  const matrixWorld = mesh.matrixWorld
    ? (
      rootCorrection
        ? new THREE.Matrix4().multiplyMatrices(rootCorrection, mesh.matrixWorld)
        : mesh.matrixWorld
    )
    : null;
  const normalMatrix = matrixWorld ? new THREE.Matrix3().getNormalMatrix(matrixWorld) : null;
  const positionVector = new THREE.Vector3();
  const normalVector = new THREE.Vector3();
  const normals = geometry.getAttribute("normal");
  const indexAttribute = geometry.getIndex?.();
  const sourceStart = Math.max(0, Math.floor(Number(group?.start || 0)));
  const availableCount = indexAttribute?.count || positions.count;
  const rawCount = Math.floor(Number(group?.count || (availableCount - sourceStart)));
  const sourceCount = Math.max(0, Math.min(rawCount, availableCount - sourceStart));
  const triangleVertexCount = sourceCount - (sourceCount % 3);
  if (triangleVertexCount <= 0) {
    return;
  }

  const color = colorFromMaterial(material, useSourceColors, {
    ignoreNeutralGray: ignoreNeutralGraySourceColors
  });
  const vertexOffset = Math.floor(accumulator.vertices.length / 3);
  const triangleOffset = Math.floor(accumulator.indices.length / 3);
  const partVertices = [];
  for (let localIndex = 0; localIndex < triangleVertexCount; localIndex += 1) {
    const sourceSlot = sourceStart + localIndex;
    const sourceIndex = indexAttribute ? indexAttribute.getX(sourceSlot) : sourceSlot;
    if (sourceIndex < 0 || sourceIndex >= positions.count) {
      continue;
    }
    const outputIndex = Math.floor(partVertices.length / 3);
    positionVector.set(
      positions.getX(sourceIndex),
      positions.getY(sourceIndex),
      positions.getZ(sourceIndex)
    );
    if (matrixWorld) {
      positionVector.applyMatrix4(matrixWorld);
    }
    const cadPosition = cadVectorFromGlbVector(positionVector, convertYUpToCad);
    const x = cadPosition.x;
    const y = cadPosition.y;
    const z = cadPosition.z;
    accumulator.vertices.push(x, y, z);
    partVertices.push(x, y, z);
    if (normals?.itemSize === 3 && sourceIndex < normals.count) {
      normalVector.set(normals.getX(sourceIndex), normals.getY(sourceIndex), normals.getZ(sourceIndex));
      if (normalMatrix) {
        normalVector.applyMatrix3(normalMatrix).normalize();
      }
      const cadNormal = convertYUpToCad
        ? { x: normalVector.x, y: -normalVector.z, z: normalVector.y }
        : normalVector;
      accumulator.normals.push(cadNormal.x, cadNormal.y, cadNormal.z);
    } else {
      accumulator.normals.push(0, 0, 0);
    }
    if (useSourceColors) {
      accumulator.colors.push(
        color?.rgb?.[0] ?? 1,
        color?.rgb?.[1] ?? 1,
        color?.rgb?.[2] ?? 1
      );
    }
    accumulator.indices.push(vertexOffset + outputIndex);
  }

  const vertexCount = Math.floor(partVertices.length / 3);
  const triangleCount = Math.floor(vertexCount / 3);
  if (vertexCount <= 0 || triangleCount <= 0) {
    return;
  }
  const cadOccurrenceId = cadOccurrenceIdForObject(mesh);
  const label = String(cadOccurrenceId || mesh?.name || mesh?.parent?.name || `glb:${accumulator.parts.length}`).trim();
  const id = cadOccurrenceId || `glb:${accumulator.parts.length}`;
  accumulator.parts.push({
    id,
    occurrenceId: id,
    primitiveIndex: Math.max(0, Math.floor(Number(primitiveIndex) || 0)),
    name: label || id,
    label: label || id,
    nodeType: "part",
    color: color?.hex || "",
    hasSourceColors: Boolean(color),
    bounds: boundsFromVertices(partVertices),
    vertexOffset,
    vertexCount,
    triangleOffset,
    triangleCount,
    edgeIndexOffset: 0,
    edgeIndexCount: 0,
  });
  if (color?.hex) {
    accumulator.colorSet.add(color.hex.toLowerCase());
  }
}

function buildMeshDataFromGltf(THREE, gltf) {
  const declaredMaterials = Array.isArray(gltf?.parser?.json?.materials) && gltf.parser.json.materials.length > 0;
  const rootCorrection = buildGlbCadRootCorrection(THREE, gltf?.scene);
  const hasStepTopology = !!gltf?.parser?.json?.extensions?.STEP_topology;
  const convertYUpToCad = !hasStepTopology && !sceneHasCadOccurrenceIds(gltf?.scene) && !rootCorrection;
  const accumulator = {
    vertices: [],
    indices: [],
    normals: [],
    colors: [],
    parts: [],
    colorSet: new Set(),
  };
  const nextPrimitiveIndexByOccurrence = new Map();
  gltf?.scene?.traverse?.((object) => {
    if (!object?.isMesh || !object.geometry) {
      return;
    }
    const occurrenceId = cadOccurrenceIdForObject(object) || String(object?.name || `glb:${accumulator.parts.length}`).trim();
    const primitiveIndexBase = nextPrimitiveIndexByOccurrence.get(occurrenceId) || 0;
    const groups = Array.isArray(object.geometry.groups) && object.geometry.groups.length
      ? object.geometry.groups
      : [null];
    groups.forEach((group, primitiveIndex) => {
      appendGlbPrimitive(
        THREE,
        accumulator,
        object,
        group,
        materialForGroup(object.material, group),
        declaredMaterials,
        rootCorrection,
        convertYUpToCad,
        primitiveIndexBase + primitiveIndex,
        { ignoreNeutralGraySourceColors: hasStepTopology }
      );
    });
    nextPrimitiveIndexByOccurrence.set(occurrenceId, primitiveIndexBase + groups.length);
  });
  const vertices = new Float32Array(accumulator.vertices);
  const colors = declaredMaterials && accumulator.colorSet.size > 0 && accumulator.colors.length === accumulator.vertices.length
    ? new Float32Array(accumulator.colors)
    : new Float32Array(0);
  return {
    vertices,
    indices: new Uint32Array(accumulator.indices),
    normals: new Float32Array(accumulator.normals),
    colors,
    edge_indices: new Uint32Array(0),
    bounds: boundsFromVertices(vertices),
    parts: accumulator.parts,
    has_source_colors: colors.length === vertices.length && colors.length > 0 && accumulator.colorSet.size > 0,
    sourceColor: accumulator.colorSet.size === 1 ? [...accumulator.colorSet][0] : "",
  };
}

function parseGlb(GLTFLoader, buffer) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buffer, "", resolve, reject);
  });
}

export async function buildMeshDataFromGlbBuffer(buffer) {
  const [THREE, { GLTFLoader }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
  ]);
  const gltf = await parseGlb(GLTFLoader, buffer);
  return buildMeshDataFromGltf(THREE, gltf);
}
