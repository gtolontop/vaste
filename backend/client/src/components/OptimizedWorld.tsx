import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { TextureManager } from '../TextureManager';
import { Block as BlockData } from '../types';

import { getDefaultMeshWorkerPool } from '../workers/meshWorkerPool';

// worker pool instance (lazy)
const meshWorkerPool = getDefaultMeshWorkerPool();

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

  const [geometryState, setGeometryState] = useState<{ geometry: THREE.BufferGeometry; material: THREE.Material | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const chunkUniqueKey = `${chunkX},${chunkY},${chunkZ}:${version}`;
    // Defer heavy geometry work off the render call stack.
    const t = setTimeout(() => {
      if (cancelled) return;

      const textureManager = TextureManager.getInstance();

      const chunkBlocks: BlockData[] = (Array.from(chunkMap.values()) as unknown as BlockData[]).filter(b => b.type !== 0);

      // If no blocks, set an empty geometry to allow unmounting
      if (chunkBlocks.length === 0) {
        // Dispose previous geometry if any
        setGeometryState({ geometry: new THREE.BufferGeometry(), material: null });
        return;
      }
      // Prepare a simple block list for the worker
      const blocksForWorker = chunkBlocks.map(b => ({ x: b.x, y: b.y, z: b.z, type: b.type }));

      // send to mesh worker via pool
      try {
        const atlasMeta = textureManager.getAtlasMeta();
        const jobId = chunkUniqueKey;
        // post job to pool
        (meshWorkerPool as any).postJob({ jobId, chunkKey: jobId, cx: chunkX, cy: chunkY, cz: chunkZ, blocks: blocksForWorker, atlasMeta })
          .then((msg: any) => {
            if (cancelled) {
              // ignore results if cancelled
              return;
            }
            try {
              const posArr = new Float32Array(msg.positions);
              const normArr = new Float32Array(msg.normals);
              const uvArr = new Float32Array(msg.uvs);
              const idxArrRaw = new Uint32Array(msg.indices);

              // Basic diagnostics: sizes and small samples
              const posCount = posArr.length / 3;
              const idxCount = idxArrRaw.length;
              let maxIdx = 0;
              // compute max index without converting the whole array
              for (let i = 0; i < idxArrRaw.length; i++) {
                if (idxArrRaw[i] > maxIdx) maxIdx = idxArrRaw[i];
                if (i >= 1000) break; // avoid long loops for extremely large meshes
              }
              const uvSample = uvArr.length >= 4 ? [uvArr[0], uvArr[1], uvArr[2], uvArr[3]] : Array.from(uvArr).slice(0, 4);
              console.debug(`[MESH] job=${jobId} pos=${posCount} verts uv=${uvArr.length/2} idx=${idxCount} maxIdxApprox=${maxIdx} uvSample=${uvSample}`);

              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
              geometry.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
              geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

              // Three.js / WebGL1 does not always support Uint32 indices. Convert when needed.
              // If environment supports Uint32 (WebGL2) we can use the buffer directly.
              const canUseUint32 = ((): boolean => {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
                  if (!ctx) return false;
                  if ((window as any).WebGL2RenderingContext && ctx instanceof (window as any).WebGL2RenderingContext) return true;
                  return !!ctx.getExtension('OES_element_index_uint');
                } catch (e) {
                  return false;
                }
              })();

              try {
                if (canUseUint32) {
                  const idxArr = idxArrRaw;
                  geometry.setIndex(new THREE.BufferAttribute(idxArr, 1));
                } else {
                  // WebGL1 without extension: try to downcast to Uint16 if possible
                  const realMax = (() => {
                    let m = 0;
                    for (let i = 0; i < idxArrRaw.length; i++) { if (idxArrRaw[i] > m) m = idxArrRaw[i]; }
                    return m;
                  })();
                  const fitsUint16 = idxArrRaw.length === 0 || realMax <= 0xFFFF;
                  if (fitsUint16) {
                    const idxArr = new Uint16Array(idxArrRaw);
                    geometry.setIndex(new THREE.BufferAttribute(idxArr, 1));
                  } else {
                    // As a fallback, expand to non-indexed geometry (duplicate vertices)
                    const expandedPos: number[] = [];
                    const expandedNorm: number[] = [];
                    const expandedUV: number[] = [];
                    for (let i = 0; i < idxArrRaw.length; i += 3) {
                      const a = idxArrRaw[i];
                      const b = idxArrRaw[i+1];
                      const c = idxArrRaw[i+2];
                      // push vertex a
                      expandedPos.push(posArr[a*3], posArr[a*3+1], posArr[a*3+2]);
                      expandedNorm.push(normArr[a*3], normArr[a*3+1], normArr[a*3+2]);
                      expandedUV.push(uvArr[a*2], uvArr[a*2+1]);
                      // b
                      expandedPos.push(posArr[b*3], posArr[b*3+1], posArr[b*3+2]);
                      expandedNorm.push(normArr[b*3], normArr[b*3+1], normArr[b*3+2]);
                      expandedUV.push(uvArr[b*2], uvArr[b*2+1]);
                      // c
                      expandedPos.push(posArr[c*3], posArr[c*3+1], posArr[c*3+2]);
                      expandedNorm.push(normArr[c*3], normArr[c*3+1], normArr[c*3+2]);
                      expandedUV.push(uvArr[c*2], uvArr[c*2+1]);
                    }
                    const ePos = new Float32Array(expandedPos);
                    const eNorm = new Float32Array(expandedNorm);
                    const eUV = new Float32Array(expandedUV);
                    geometry.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
                    geometry.setAttribute('normal', new THREE.BufferAttribute(eNorm, 3));
                    geometry.setAttribute('uv', new THREE.BufferAttribute(eUV, 2));
                  }
                }
              } catch (setIndexErr) {
                console.error(`[MESH] failed to set index for job=${jobId}`, setIndexErr);
                // fallback: make non-indexed geometry
                try {
                  const expandedPos: number[] = [];
                  const expandedNorm: number[] = [];
                  const expandedUV: number[] = [];
                  for (let i = 0; i < idxArrRaw.length; i += 3) {
                    const a = idxArrRaw[i];
                    const b = idxArrRaw[i+1];
                    const c = idxArrRaw[i+2];
                    expandedPos.push(posArr[a*3], posArr[a*3+1], posArr[a*3+2]);
                    expandedNorm.push(normArr[a*3], normArr[a*3+1], normArr[a*3+2]);
                    expandedUV.push(uvArr[a*2], uvArr[a*2+1]);
                    expandedPos.push(posArr[b*3], posArr[b*3+1], posArr[b*3+2]);
                    expandedNorm.push(normArr[b*3], normArr[b*3+1], normArr[b*3+2]);
                    expandedUV.push(uvArr[b*2], uvArr[b*2+1]);
                    expandedPos.push(posArr[c*3], posArr[c*3+1], posArr[c*3+2]);
                    expandedNorm.push(normArr[c*3], normArr[c*3+1], normArr[c*3+2]);
                    expandedUV.push(uvArr[c*2], uvArr[c*2+1]);
                  }
                  const ePos = new Float32Array(expandedPos);
                  const eNorm = new Float32Array(expandedNorm);
                  const eUV = new Float32Array(expandedUV);
                  geometry.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
                  geometry.setAttribute('normal', new THREE.BufferAttribute(eNorm, 3));
                  geometry.setAttribute('uv', new THREE.BufferAttribute(eUV, 2));
                } catch (expErr) {
                  console.error('[MESH] fallback expansion failed for job=', jobId, expErr);
                }
              }

              // compute bounds to help with frustum culling and diagnostics
              try {
                geometry.computeBoundingSphere();
                geometry.computeBoundingBox();
              } catch (e) {
                // ignore
              }

              // choose material: prefer atlas if available
              let mat: THREE.Material;
              if (textureManager.getAtlasMeta() && textureManager.getAtlasTexture()) {
                const atlasTex = textureManager.getAtlasTexture() as any;
                mat = new THREE.MeshLambertMaterial({ map: atlasTex, side: THREE.DoubleSide });
                // ensure texture upload/flip state applied
                try { if (atlasTex) atlasTex.needsUpdate = true; } catch (e) {}
              } else {
                mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
              }

              // log atlas / material diagnostics
              try {
                const atlasExists = !!textureManager.getAtlasTexture();
                const atlasCount = textureManager.getAtlasMeta() && textureManager.getAtlasMeta()!.mappings ? Object.keys(textureManager.getAtlasMeta()!.mappings).length : 0;
                const atlasInfo = atlasExists && (textureManager.getAtlasTexture() as any).image ? `image=${(textureManager.getAtlasTexture() as any).image.width}x${(textureManager.getAtlasTexture() as any).image.height}` : 'no-image';
                console.debug(`[MESH] atlas available=${atlasExists} entries=${atlasCount} ${atlasInfo}`);
                console.debug(`[MESH] created mesh job=${jobId} verts=${posCount} triangles=${Math.floor(idxCount/3)} maxIdx=${maxIdx} materialHasMap=${!!(mat as any).map}`);
              } catch (e) {
                console.debug('[MESH] created mesh (diagnostics failed)', e);
              }

              if (!cancelled) {
                // pass single material to mesh to avoid group/index mismatch
                setGeometryState({ geometry, material: mat });
              } else {
                try { geometry.dispose(); } catch (e) {}
                if ((mat as any).dispose) try { (mat as any).dispose(); } catch (e) {}
              }
            } finally {
              // nothing else to cleanup here
            }
          })
          .catch((err: any) => {
            // fallback: set empty geometry
            setGeometryState({ geometry: new THREE.BufferGeometry(), material: null });
          });
      } catch (e) {
        // fallback: set empty geometry
        setGeometryState({ geometry: new THREE.BufferGeometry(), material: null });
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
      // dispose geometry when unmounted to free GPU memory
      const s = geometryState;
      if (s && s.geometry) {
        try {
          s.geometry.dispose();
          if (s.material && (s.material as any).dispose) (s.material as any).dispose();
        } catch (e) {
          // ignore disposal errors
        }
      }
      // cancel queued mesh job if present
      try { (meshWorkerPool as any).cancelJob(chunkUniqueKey); } catch (e) {}
    };
    // chunkHash and blocks.size are the main signals to rebuild
  }, [rebuildKey, chunkX, chunkY, chunkZ, chunkMap.size, version]);

  if (!geometryState) return null;
  if (!geometryState.geometry.attributes || !geometryState.geometry.attributes.position) return null;

  return <mesh ref={meshRef} geometry={geometryState.geometry} material={geometryState.material || undefined} frustumCulled={true} />;
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