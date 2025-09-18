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

const FACE_UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];

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

      const blocksByType = new Map<number, BlockData[]>();
      for (const b of chunkBlocks) {
        if (!blocksByType.has(b.type)) blocksByType.set(b.type, []);
        blocksByType.get(b.type)!.push(b);
      }

      blocksByType.forEach((list, blockType) => {
        const start = indices.length;
        for (const block of list) {
          for (let face = 0; face < 6; face++) {
            // Check visibility via provided lookup that checks neighboring chunks as well
            const dir = FACE_DIRECTIONS[face].dir;
            const nx = block.x + dir[0];
            const ny = block.y + dir[1];
            const nz = block.z + dir[2];
            if ((blocksLookup as any)(nx, ny, nz)) continue;
            const fv = FACE_VERTICES[face];
            const fn = FACE_DIRECTIONS[face].normal;
            for (let i = 0; i < 4; i++) {
              const v = fv[i];
              positions.push(block.x + v[0], block.y + v[1], block.z + v[2]);
              normals.push(fn[0], fn[1], fn[2]);
            }
            for (let i = 0; i < 4; i++) {
              const uv = FACE_UVS[i];
              uvs.push(uv[0], uv[1]);
            }
            indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
            vertexIndex += 4;
          }
        }
        const count = indices.length - start;
        if (count > 0) materialGroups.push({ start, count, blockType });
      });

      const geometry = new THREE.BufferGeometry();
      if (positions.length > 0) {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        // Assign temporary material indices; we'll remap when building materials
        materialGroups.forEach((g, idx) => geometry.addGroup(g.start, g.count, idx));
      }

      const materials: THREE.Material[] = [];
      const materialMap = new Map<number, number>();
      materialGroups.forEach((group, idx) => {
        if (!materialMap.has(group.blockType)) {
          const matIdx = materials.length;
          materialMap.set(group.blockType, matIdx);
          materials.push(textureManager.createBlockMaterial(group.blockType) as THREE.Material);
        }
        // update group materialIndex to mapped value
        geometry.groups[idx].materialIndex = materialMap.get(group.blockType)!;
      });

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