import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { TextureManager } from '../TextureManager';
import { logger } from '../utils/logger';
import { Block as BlockData } from '../types';

import { getDefaultMeshWorkerPool } from '../workers/meshWorkerPool';

// worker pool instance (lazy)
const meshWorkerPool = getDefaultMeshWorkerPool();

// Global upload throttling queue to limit main-thread GPU uploads per frame.
const UPLOAD_QUEUE: Array<() => void> = [];
let uploadQueueScheduled = false;
const MAX_UPLOADS_PER_FRAME = 5; // tuneable: number of geometry uploads allowed per rAF (recommend 2-5)

function scheduleUploadQueue() {
  if (uploadQueueScheduled) return;
  uploadQueueScheduled = true;
  const runner = () => {
    uploadQueueScheduled = false;
    let count = 0;
    while (count < MAX_UPLOADS_PER_FRAME && UPLOAD_QUEUE.length > 0) {
      const fn = UPLOAD_QUEUE.shift();
      try { if (fn) fn(); } catch (e) { /* swallow */ }
      count++;
    }
    if (UPLOAD_QUEUE.length > 0) scheduleUploadQueue();
  };
  if (typeof window !== 'undefined' && (window as any).requestAnimationFrame) {
    (window as any).requestAnimationFrame(runner);
  } else {
    setTimeout(runner, 16);
  }
}

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

// Cache capability check for Uint32 indices so we don't create a canvas/context per job (avoids leaking WebGL contexts)
let cachedCanUseUint32: boolean | null = null;
const getCanUseUint32 = (): boolean => {
  if (cachedCanUseUint32 !== null) return cachedCanUseUint32;
  try {
    const canvas = document.createElement('canvas');
    const ctx = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!ctx) { cachedCanUseUint32 = false; return cachedCanUseUint32; }
    if ((window as any).WebGL2RenderingContext && ctx instanceof (window as any).WebGL2RenderingContext) {
      cachedCanUseUint32 = true;
    } else {
      cachedCanUseUint32 = !!ctx.getExtension('OES_element_index_uint');
    }
  } catch (e) {
    cachedCanUseUint32 = false;
  }
  return cachedCanUseUint32;
};

const OptimizedChunk: React.FC<ChunkProps> = ({ chunkMap, version, chunkX, chunkY, chunkZ, blocksLookup }) => {
  const meshRef = useRef<THREE.Mesh>(null);


  // Use the chunk's version as the rebuild trigger; this avoids expensive hashing
  const rebuildKey = `${chunkX},${chunkY},${chunkZ}:${version}`;

  const [geometryState, setGeometryState] = useState<{ geometry: THREE.BufferGeometry; material: THREE.Material | null } | null>(null);
  // keep a ref to the latest geometryState so we can dispose on unmount
  const geometryRef = useRef<{ geometry: THREE.BufferGeometry; material: THREE.Material | null } | null>(null);
  // shared empty material used for empty geometries to avoid passing `null` which can
  // cause downstream reconciler/three.js code to attempt to access `.visible` on undefined.
  const emptyMaterialRef = useRef<THREE.Material>(new THREE.MeshBasicMaterial({ visible: false }));
  // keep previous geometry around during a swap to avoid flicker; dispose on next frame
  const prevGeometryRef = useRef<{ geometry: THREE.BufferGeometry; material: THREE.Material | null } | null>(null);

  // Helper: create a minimal but valid empty geometry so the <mesh> element stays mounted
  const createEmptyGeometry = () => {
    const g = new THREE.BufferGeometry();
    // create tiny default attributes so Three.js treats geometry as valid
    const pos = new Float32Array([0,0,0]);
    const norm = new Float32Array([0,1,0]);
    const uv = new Float32Array([0,0]);
    try {
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    } catch (e) {
      // fallback: keep it empty
    }
    return g;
  };


  // Optional debug flag to trace mesh job lifecycle. Enable by setting localStorage['vaste_debug_mesh_jobs']='1'
  const debugMeshJobs = (() => {
    try { return localStorage.getItem('vaste_debug_mesh_jobs') === '1'; } catch (e) { return false; }
  })();

  useEffect(() => {
  let cancelled = false;
    const chunkUniqueKey = `${chunkX},${chunkY},${chunkZ}:${version}`;
    // Defer heavy geometry work off the render call stack.
    const t = setTimeout(() => {
      if (cancelled) return;

      const textureManager = TextureManager.getInstance();

  const allBlocks = Array.from(chunkMap.values()) as unknown as BlockData[];
  const chunkBlocks = allBlocks.filter(b => b.type !== 0);

  // If no blocks, set an empty geometry to allow unmounting
  if (chunkBlocks.length === 0) {
        // Replace geometry with an empty geometry. Defer disposal of previous geometry to avoid flicker.
        setGeometryState(prev => {
          try {
            if (prev && prev.geometry) {
              prevGeometryRef.current = prev;
            }
          } catch (e) {}
          const empty = { geometry: createEmptyGeometry(), material: emptyMaterialRef.current };
          geometryRef.current = empty;
          try {
            if (typeof window !== 'undefined' && (window as any).requestAnimationFrame) {
              (window as any).requestAnimationFrame(() => {
                try {
                  const p = prevGeometryRef.current;
                  if (p && p.geometry) {
                    p.geometry.dispose();
                    // avoid disposing the shared empty material
                    if (p.material && p.material !== emptyMaterialRef.current && (p.material as any).dispose) (p.material as any).dispose();
                  }
                } catch (e) {}
                prevGeometryRef.current = null;
              });
            } else {
              setTimeout(() => {
                try {
                  const p = prevGeometryRef.current;
                  if (p && p.geometry) {
                    p.geometry.dispose();
                    if (p.material && (p.material as any).dispose) (p.material as any).dispose();
                  }
                } catch (e) {}
                prevGeometryRef.current = null;
              }, 16);
            }
          } catch (e) {}
          return empty;
        });
        return;
      }
      // Prepare typed-array sparse representation for the worker to avoid large JS object allocations
      // indices: local index within chunk (0..4095) where idx = ((y*16 + z)*16) + x
      // types: corresponding block types
      const VOXELS = 16 * 16 * 16;
      const indicesArr = new Uint16Array(chunkBlocks.length);
      const typesArr = new Uint16Array(chunkBlocks.length);
      for (let i = 0; i < chunkBlocks.length; i++) {
        const b = chunkBlocks[i];
        const lx = b.x - (chunkX * CHUNK_SIZE);
        const ly = b.y - (chunkY * CHUNK_SIZE);
        const lz = b.z - (chunkZ * CHUNK_SIZE);
        const localIdx = ((ly * CHUNK_SIZE + lz) * CHUNK_SIZE) + lx;
        indicesArr[i] = localIdx;
        typesArr[i] = b.type;
      }

      // send to mesh worker via pool (transfer typed arrays)
      try {
        const atlasMeta = textureManager.getAtlasMeta();
        const jobId = chunkUniqueKey;
        // post job to pool
        (meshWorkerPool as any).postJob({ jobId, chunkKey: jobId, cx: chunkX, cy: chunkY, cz: chunkZ, indices: indicesArr, types: typesArr, atlasMeta })
          .then((msg: any) => {
            if (cancelled) {
              // ignore results if cancelled
              return;
            }
            // Capture when the mesh result arrived on the main thread so we can measure upload/display time
            const meshResultArrivedAt = Date.now();
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

              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
              geometry.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
              geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

              // Three.js / WebGL1 does not always support Uint32 indices. Convert when needed.
              // If environment supports Uint32 (WebGL2) we can use the buffer directly.
              const canUseUint32 = getCanUseUint32();

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
              } catch (e) {
              }

              if (!cancelled) {
                // Defer the actual React state swap / GPU upload into an upload queue so we can
                // throttle how many heavy uploads happen on the main thread per frame.
                const applyFn = () => {
                  const uploadStart = Date.now();
                  setGeometryState(prev => {
                    try {
                      if (prev && prev.geometry) {
                        prevGeometryRef.current = prev;
                      }
                    } catch (e) {}
                    const newState = { geometry, material: mat };
                    geometryRef.current = newState;
                    try {
                      if (typeof window !== 'undefined' && (window as any).requestAnimationFrame) {
                        (window as any).requestAnimationFrame(() => {
                          try {
                            const p = prevGeometryRef.current;
                            if (p && p.geometry) {
                              p.geometry.dispose();
                              if (p.material && (p.material as any).dispose) (p.material as any).dispose();
                            }
                          } catch (e) {}
                          prevGeometryRef.current = null;
                        });
                      } else {
                        setTimeout(() => {
                          try {
                            const p = prevGeometryRef.current;
                            if (p && p.geometry) {
                              p.geometry.dispose();
                              if (p.material && (p.material as any).dispose) (p.material as any).dispose();
                            }
                          } catch (e) {}
                          prevGeometryRef.current = null;
                        }, 16);
                      }
                    } catch (e) {}
                    return newState;
                  });
                };

                UPLOAD_QUEUE.push(applyFn);
                scheduleUploadQueue();
              } else {
                try { geometry.dispose(); } catch (e) {}
                if ((mat as any).dispose) try { (mat as any).dispose(); } catch (e) {}
              }
            } finally {
              // nothing else to cleanup here
            }
          })
          .catch((err: any) => {
              // fallback: set empty geometry (keep mesh mounted)

              // If the job was cancelled (expected when replaced by a newer job), don't replace
            // the existing geometry with an empty geometry — that creates a one-frame blank.
            try {
              const isCancelled = err && (err.message === 'job cancelled' || (err.toString && err.toString().includes('job cancelled')));
              if (isCancelled) {
                // If we already have a geometry mounted, keep it to avoid flicker.
                if (geometryRef.current && geometryRef.current.geometry) {
                  return;
                }
                // No existing geometry: set a tiny empty geometry so the <mesh> remains mounted.
                setGeometryState({ geometry: createEmptyGeometry(), material: emptyMaterialRef.current });
                return;
              }
            } catch (e) {}
      setGeometryState({ geometry: createEmptyGeometry(), material: emptyMaterialRef.current });
          });
      } catch (e) {
  // fallback: set empty geometry (keep mesh mounted)
  setGeometryState({ geometry: createEmptyGeometry(), material: emptyMaterialRef.current });
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
      // cancel queued mesh job if present (job keyed by chunkUniqueKey)
      try { (meshWorkerPool as any).cancelJob(chunkUniqueKey); } catch (e) {}
    };
    // chunkHash and blocks.size are the main signals to rebuild
  }, [rebuildKey, chunkX, chunkY, chunkZ, chunkMap.size, version]);

  // Dispose retained geometry when this chunk unmounts to free GPU memory.
  useEffect(() => {
    return () => {
      try {
        const s = geometryRef.current;
        if (s && s.geometry) {
          s.geometry.dispose();
          if (s.material && s.material !== emptyMaterialRef.current && (s.material as any).dispose) (s.material as any).dispose();
        }
      } catch (e) {
        // ignore disposal errors
      }
    };
  }, []);

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