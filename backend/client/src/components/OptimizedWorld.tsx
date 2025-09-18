import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { TextureManager } from '../TextureManager';
import { Block as BlockData } from '../types';

interface ChunkProps {
  chunkMap: Map<string, BlockData>;
  version: number;
  chunkX: number;
  chunkY: number;
  chunkZ: number;
  // function to check whether a block exists at given world coords
  blocksLookup: (x: number, y: number, z: number) => boolean;
}

const CHUNK_SIZE = 16;
const RENDER_DISTANCE = 10;

const FACE_DIRECTIONS = [
  { dir: [1, 0, 0], normal: [1, 0, 0] },
  { dir: [-1, 0, 0], normal: [-1, 0, 0] },
  { dir: [0, 1, 0], normal: [0, 1, 0] },
  { dir: [0, -1, 0], normal: [0, -1, 0] },
  { dir: [0, 0, 1], normal: [0, 0, 1] },
  { dir: [0, 0, -1], normal: [0, 0, -1] }
];

const FACE_VERTICES = [
  [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]],
  [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]],
  [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]],
  [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]],
  [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
  [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]
];

const FACE_UVS = [[0, 0], [1, 0], [1, 1], [0, 1]]; // kept for reference

const worldToChunk = (coord: number) => Math.floor(coord / CHUNK_SIZE);
const getChunkKey = (cx: number, cy: number, cz: number) => `${cx},${cy},${cz}`;

const getBlockKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

const isBlockSolid = (blocks: Map<string, BlockData>, x: number, y: number, z: number) => {
  const b = blocks.get(getBlockKey(x, y, z));
  return !!b && b.type !== 0;
};

const isFaceVisible = (blocks: Map<string, BlockData>, x: number, y: number, z: number, faceIndex: number) => {
  const dir = FACE_DIRECTIONS[faceIndex].dir;
  return !isBlockSolid(blocks, x + dir[0], y + dir[1], z + dir[2]);
};

const OptimizedChunk: React.FC<ChunkProps> = ({ chunkMap, version, chunkX, chunkY, chunkZ, blocksLookup }) => {
  const meshRef = useRef<THREE.Mesh>(null);


  // Use the chunk's version as the rebuild trigger; this avoids expensive hashing
  const rebuildKey = `${chunkX},${chunkY},${chunkZ}:${version}`;

  const [geometryState, setGeometryState] = useState<{ geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Defer heavy geometry work off the render call stack.
    const t = setTimeout(() => {
      if (cancelled) return;

      const textureManager = TextureManager.getInstance();

  const chunkBlocks: BlockData[] = (Array.from(chunkMap.values()) as unknown as BlockData[]).filter(b => b.type !== 0);

      // If no blocks, set an empty geometry to allow unmounting
      if (chunkBlocks.length === 0) {
        // Dispose previous geometry if any
        setGeometryState({ geometry: new THREE.BufferGeometry(), materials: [] });
        return;
      }

      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const materialGroups: { start: number; count: number; blockType: number }[] = [];

      let vertexIndex = 0;

      // We'll build geometry per-face and create material entries per-face (or per-block-type if single material)
      const geometry = new THREE.BufferGeometry();
      const materials: THREE.Material[] = [];
      const materialMap = new Map<string, number>(); // key => materialIndex

      for (const block of chunkBlocks) {
        for (let face = 0; face < 6; face++) {
          const dir = FACE_DIRECTIONS[face].dir;
          const nx = block.x + dir[0];
          const ny = block.y + dir[1];
          const nz = block.z + dir[2];
          if ((blocksLookup as any)(nx, ny, nz)) continue;

          // Determine material for this block/face
          const blockMat = textureManager.createBlockMaterial(block.type);
          let matKey: string;
          let mat: THREE.Material;
          if (Array.isArray(blockMat)) {
            // Use face-specific material index (face order: right,left,top,bottom,front,back)
            matKey = `${block.type}:${face}`;
            if (materialMap.has(matKey)) {
              // existing material index
              // nothing
            } else {
              // push specific face material
              const faceMat = blockMat[face] as THREE.Material;
              const mi = materials.length;
              materials.push(faceMat);
              materialMap.set(matKey, mi);
            }
            mat = materials[materialMap.get(matKey)!];
          } else {
            matKey = `${block.type}:all`;
            if (!materialMap.has(matKey)) {
              const mi = materials.length;
              materials.push(blockMat as THREE.Material);
              materialMap.set(matKey, mi);
            }
            mat = materials[materialMap.get(matKey)!];
          }

          // add face vertices
          const fv = FACE_VERTICES[face];
          const fn = FACE_DIRECTIONS[face].normal;
          for (let i = 0; i < 4; i++) {
            const v = fv[i];
            positions.push(block.x + v[0], block.y + v[1], block.z + v[2]);
            normals.push(fn[0], fn[1], fn[2]);
          }
          // compute per-vertex UVs so the top of the texture aligns with world +Y
          for (let i = 0; i < 4; i++) {
            const vtx = fv[i]; // local vertex coords in [-0.5,0.5]
            // v should correspond to vertical position (y) so top of texture is at block top
            const v = vtx[1] + 0.5; // 0..1 (bottom..top)

            // u depends on the face orientation: use the horizontal axis of the face
            let u = 0;
            // face normal indicates which axis is perpendicular to the face
            if (fn[1] !== 0) {
              // top or bottom face: map u<-x, v<-z
              u = vtx[0] + 0.5; // x -> 0..1
              // for top face we want v to align with -z->+z ordering
              const vv = vtx[2] + 0.5;
              // if bottom face (fn[1] < 0) flip horizontal so texture orientation matches top face
              if (fn[1] < 0) {
                u = 1 - u;
              }
              uvs.push(u, vv);
            } else {
              // side faces: use the horizontal coordinate along the face as u and y as v
              if (fn[0] !== 0) {
                // +/-X face: u <- z
                u = vtx[2] + 0.5;
                // if normal points negative (left face), flip horizontally to keep same rotation
                if (fn[0] < 0) u = 1 - u;
              } else if (fn[2] !== 0) {
                // +/-Z face: u <- x
                u = vtx[0] + 0.5;
                // invert for negative normal (back face)
                if (fn[2] < 0) u = 1 - u;
              }
              uvs.push(u, v);
            }
          }

          // create indices for this face and add a geometry group mapping to the material index
          const startIdx = indices.length;
          indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
          geometry.addGroup(startIdx, 6, materialMap.get(matKey)!);
          vertexIndex += 4;
        }
      }

      if (positions.length > 0) {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
      }

  // rebuild
      setGeometryState({ geometry, materials });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
      // dispose geometry when unmounted to free GPU memory
      const s = geometryState;
      if (s && s.geometry) {
        try {
          s.geometry.dispose();
          s.materials.forEach(m => { if ((m as any).dispose) (m as any).dispose(); });
        } catch (e) {
          // ignore disposal errors
        }
      }
    };
    // chunkHash and blocks.size are the main signals to rebuild
  }, [rebuildKey, chunkX, chunkY, chunkZ, chunkMap.size, version]);

  if (!geometryState) return null;
  if (!geometryState.geometry.attributes || !geometryState.geometry.attributes.position) return null;

  return <mesh ref={meshRef} geometry={geometryState.geometry} material={geometryState.materials} frustumCulled={true} />;
};

interface OptimizedWorldProps {
  chunks: Map<string, Map<string, BlockData>>;
  chunkVersions: Map<string, number>;
  playerPosition: THREE.Vector3;
}

export const OptimizedWorld: React.FC<OptimizedWorldProps> = ({ chunks, chunkVersions, playerPosition }) => {
  const existingChunks = useMemo(() => {
    return Array.from(chunks.keys()).map(k => {
      const [cx, cy, cz] = k.split(',').map(Number);
      return { chunkX: cx, chunkY: cy, chunkZ: cz, key: k };
    });
  }, [chunks.size]);

  const visibleChunks = useMemo(() => {
    const pcx = worldToChunk(playerPosition.x);
    const pcy = worldToChunk(playerPosition.y);
    const pcz = worldToChunk(playerPosition.z);
    const arr = existingChunks.filter(c => Math.sqrt((c.chunkX - pcx) ** 2 + (c.chunkY - pcy) ** 2 + (c.chunkZ - pcz) ** 2) <= RENDER_DISTANCE);
    arr.sort((a, b) => {
      const da = Math.sqrt((a.chunkX - pcx) ** 2 + (a.chunkY - pcy) ** 2 + (a.chunkZ - pcz) ** 2);
      const db = Math.sqrt((b.chunkX - pcx) ** 2 + (b.chunkY - pcy) ** 2 + (b.chunkZ - pcz) ** 2);
      return da - db;
    });
    return arr;
  }, [existingChunks, playerPosition.x, playerPosition.y, playerPosition.z]);

  // blocksLookup checks whether a block exists at world coords by querying the chunks map
  const blocksLookup = (x: number, y: number, z: number) => {
    const cx = worldToChunk(x);
    const cy = worldToChunk(y);
    const cz = worldToChunk(z);
    const key = getChunkKey(cx, cy, cz);
    const cm = chunks.get(key);
    if (!cm) return false;
    return cm.has(`${x},${y},${z}`);
  };

  return <>{visibleChunks.map(({ chunkX, chunkY, chunkZ, key }) => (
    <OptimizedChunk key={key} blocksLookup={blocksLookup} chunkMap={chunks.get(key)!} version={chunkVersions.get(key) || 0} chunkX={chunkX} chunkY={chunkY} chunkZ={chunkZ} />
  ))}</>;
};

export default OptimizedWorld;