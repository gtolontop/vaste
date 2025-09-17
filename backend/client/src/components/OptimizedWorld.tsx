import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { TextureManager } from '../TextureManager';
import { Block as BlockData } from '../types';

interface ChunkProps {
  blocks: Map<string, BlockData>;
  chunkX: number;
  chunkY: number;
  chunkZ: number;
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

const OptimizedChunk: React.FC<ChunkProps> = ({ blocks, chunkX, chunkY, chunkZ }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Create a small hash string representing the blocks in this chunk.
  // We include blocks.size as a dependency so mutations that change size re-run; it's a practical compromise.
  const chunkHash = useMemo(() => {
    const keys: string[] = [];
    for (const b of blocks.values()) {
      if (worldToChunk(b.x) === chunkX && worldToChunk(b.y) === chunkY && worldToChunk(b.z) === chunkZ && b.type !== 0) {
        keys.push(`${b.x},${b.y},${b.z}:${b.type}`);
      }
    }
    return keys.sort().join('|');
  }, [blocks.size, chunkX, chunkY, chunkZ]);

  const [geometryState, setGeometryState] = useState<{ geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Defer heavy geometry work off the render call stack.
    const t = setTimeout(() => {
      if (cancelled) return;

      const textureManager = TextureManager.getInstance();

      const chunkBlocks: BlockData[] = [];
      for (const b of blocks.values()) {
        if (worldToChunk(b.x) === chunkX && worldToChunk(b.y) === chunkY && worldToChunk(b.z) === chunkZ && b.type !== 0) {
          chunkBlocks.push(b);
        }
      }

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
            if (!isFaceVisible(blocks, block.x, block.y, block.z, face)) continue;
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
  }, [chunkHash, blocks.size, chunkX, chunkY, chunkZ]);

  if (!geometryState) return null;
  if (!geometryState.geometry.attributes || !geometryState.geometry.attributes.position) return null;

  return <mesh ref={meshRef} geometry={geometryState.geometry} material={geometryState.materials} frustumCulled={true} />;
};

interface OptimizedWorldProps {
  blocks: Map<string, BlockData>;
  playerPosition: THREE.Vector3;
}

export const OptimizedWorld: React.FC<OptimizedWorldProps> = ({ blocks, playerPosition }) => {
  const existingChunks = useMemo(() => {
    const m = new Map<string, { chunkX: number; chunkY: number; chunkZ: number }>();
    for (const b of blocks.values()) {
      const cx = worldToChunk(b.x);
      const cy = worldToChunk(b.y);
      const cz = worldToChunk(b.z);
      const key = getChunkKey(cx, cy, cz);
      if (!m.has(key)) m.set(key, { chunkX: cx, chunkY: cy, chunkZ: cz });
    }
    return Array.from(m.values());
  }, [blocks.size]);

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

  return <>{visibleChunks.map(({ chunkX, chunkY, chunkZ }) => (
    <OptimizedChunk key={getChunkKey(chunkX, chunkY, chunkZ)} blocks={blocks} chunkX={chunkX} chunkY={chunkY} chunkZ={chunkZ} />
  ))}</>;
};

export default OptimizedWorld;