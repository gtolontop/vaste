// ChunkStore.js - typed-array backed chunk store for efficient iteration and memory
const CHUNK_SIZE = 16;
const VOXELS_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE; // 4096
const DEFAULT_MAX_CHUNKS = 1024; // LRU cap (tunable)

// Default flatground layering used for in-memory store to match persisted WorldRuntime
const GRASS_LAYERS = 1;
const DIRT_LAYERS = 3;
const STONE_LAYERS = 40;
const GROUND_AIR_OFFSET = 2; // keep a couple of air layers as in WorldRuntime
const GROUND_TOP = GRASS_LAYERS + DIRT_LAYERS + STONE_LAYERS + GROUND_AIR_OFFSET; // highest-solid-y + 1

function chunkKey(cx, cy, cz) {
  return `${cx},${cy},${cz}`;
}

function voxelIndexInChunk(x, y, z) {
  return ((y * CHUNK_SIZE + z) * CHUNK_SIZE) + x;
}

class Chunk {
  constructor(cx, cy, cz) {
    this.cx = cx; this.cy = cy; this.cz = cz;
    // use Uint16Array for block type palette (0 = empty)
    this.blocks = new Uint16Array(VOXELS_PER_CHUNK);
    this.version = 1;
    this.nonEmptyCount = 0;
  }

  setLocal(x, y, z, type) {
    const idx = voxelIndexInChunk(x, y, z);
    const prev = this.blocks[idx] || 0;
    if (prev === 0 && type !== 0) this.nonEmptyCount++;
    if (prev !== 0 && type === 0) this.nonEmptyCount--;
    this.blocks[idx] = type;
    this.version++;
  }

  getLocal(x, y, z) {
    const idx = voxelIndexInChunk(x, y, z);
    return this.blocks[idx] || 0;
  }

  hasAny() {
    return this.nonEmptyCount > 0;
  }

  // Return sparse entries as [idx, type]
  getNonEmptyEntries() {
    const out = [];
    if (this.nonEmptyCount === 0) return out;
    for (let i = 0; i < this.blocks.length; i++) {
      const t = this.blocks[i];
      if (t !== 0) out.push([i, t]);
    }
    return out;
  }

  getAllBlocksGlobal(baseX, baseY, baseZ) {
    const out = [];
    const entries = this.getNonEmptyEntries();
    for (const [idx, type] of entries) {
      const x = idx % CHUNK_SIZE;
      const tmp = Math.floor(idx / CHUNK_SIZE);
      const z = tmp % CHUNK_SIZE;
      const y = Math.floor(tmp / CHUNK_SIZE);
      out.push({ x: baseX + x, y: baseY + y, z: baseZ + z, type });
    }
    return out;
  }
}

class ChunkStore {
  constructor(options = {}) {
    this.chunks = new Map(); // key -> Chunk
    this.pending = new Map(); // key -> Promise resolving when worker finishes
    this.minBounds = { x: 0, y: 0, z: 0 };
    this.maxBounds = { x: CHUNK_SIZE, y: CHUNK_SIZE, z: CHUNK_SIZE };
    this.lru = new Map(); // key -> timestamp (used for LRU eviction)
    this.maxChunks = options.maxChunks || DEFAULT_MAX_CHUNKS;
    this.workerPool = options.workerPool || null; // optional ChunkWorkerPool instance
  }

  worldToChunk(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return { cx, cy, cz, lx, ly, lz };
  }

  ensureChunk(cx, cy, cz) {
    const key = chunkKey(cx, cy, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(cx, cy, cz);
      // basic generation: flat ground at world y=0 and one block above
      const baseX = cx * CHUNK_SIZE;
      const baseY = cy * CHUNK_SIZE;
      const baseZ = cz * CHUNK_SIZE;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          // Use a column-top model: fill from y=0 up to GROUND_TOP-1 using layering rules
          for (let y = 0; y < CHUNK_SIZE; y++) {
            const wy = baseY + y;
            // compute type relative to top
            const top = GROUND_TOP; // top is number of solid layers
            if (wy < top) {
              // determine layer: top-most GRASS_LAYERS = grass (3), next DIRT_LAYERS = dirt (2), below = stone (1)
              const topIndex = top - 1;
              if (wy > topIndex - GRASS_LAYERS && wy <= topIndex) {
                c.setLocal(x, y, z, 3); // grass
              } else {
                const dirtTop = topIndex - GRASS_LAYERS;
                if (wy > dirtTop - DIRT_LAYERS && wy <= dirtTop) {
                  c.setLocal(x, y, z, 2); // dirt
                } else {
                  c.setLocal(x, y, z, 1); // stone
                }
              }
            }
          }
        }
      }
      this.chunks.set(key, c);
      this._markAccess(key);
      this.minBounds.x = Math.min(this.minBounds.x, baseX);
      this.minBounds.y = Math.min(this.minBounds.y, baseY);
      this.minBounds.z = Math.min(this.minBounds.z, baseZ);
      this.maxBounds.x = Math.max(this.maxBounds.x, baseX + CHUNK_SIZE);
      this.maxBounds.y = Math.max(this.maxBounds.y, baseY + CHUNK_SIZE);
      this.maxBounds.z = Math.max(this.maxBounds.z, baseZ + CHUNK_SIZE);
    }
    return c;
  }

  // Async chunk generation using worker pool. Returns a Promise resolving to a Chunk-like object with blocks Uint16Array
  ensureChunkAsync(cx, cy, cz) {
    const key = chunkKey(cx, cy, cz);
    const existing = this.chunks.get(key);
    if (existing) {
      this._markAccess(key);
      return Promise.resolve(existing);
    }
    // If a generation for this key is already in-flight, return that promise
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.workerPool) {
      const promise = new Promise((resolve, reject) => {
        this.workerPool.generateChunk(cx, cy, cz, (err, msg) => {
          // Clear pending when done
          this.pending.delete(key);
          if (err) return reject(err);
          if (msg && msg.error) return reject(new Error(msg.error));
          try {
            const buf = msg.blocksBuffer;
            const u16 = new Uint16Array(buf);
            const chunk = new Chunk(cx, cy, cz);
            chunk.blocks = u16;
            // Use nonEmptyCount from worker if present to avoid scanning
            if (typeof msg.nonEmptyCount === 'number') {
              chunk.nonEmptyCount = msg.nonEmptyCount;
            } else {
              let cnt = 0;
              for (let i = 0; i < u16.length; i++) if (u16[i] !== 0) cnt++;
              chunk.nonEmptyCount = cnt;
            }
            this.chunks.set(key, chunk);
            this._markAccess(key);
            this._evictIfNeeded();
            resolve(chunk);
          } catch (e) {
            reject(e);
          }
        });
      });
      this.pending.set(key, promise);
      return promise;
    }
    // fallback to synchronous ensureChunk
    return Promise.resolve(this.ensureChunk(cx, cy, cz));
  }

  _markAccess(key) {
    this.lru.set(key, Date.now());
  }

  _evictIfNeeded() {
    if (this.chunks.size <= this.maxChunks) return;
    // Evict least-recently used until below threshold
    const entries = Array.from(this.lru.entries());
    entries.sort((a, b) => a[1] - b[1]);
    const toRemove = Math.max(1, Math.floor(this.maxChunks * 0.1));
    for (let i = 0; i < toRemove && this.chunks.size > this.maxChunks; i++) {
      const key = entries[i][0];
      this.chunks.delete(key);
      this.lru.delete(key);
    }
  }

  setBlock(x, y, z, blockType) {
    if (!this.isReasonablePosition(x, y, z)) return;
    const { cx, cy, cz, lx, ly, lz } = this.worldToChunk(x, y, z);
    const c = this.ensureChunk(cx, cy, cz);
    c.setLocal(lx, ly, lz, blockType);
  }

  getBlock(x, y, z) {
    if (!this.isReasonablePosition(x, y, z)) return 0;
    const { cx, cy, cz, lx, ly, lz } = this.worldToChunk(x, y, z);
    const key = chunkKey(cx, cy, cz);
    const c = this.chunks.get(key);
    if (!c) return 0;
    return c.getLocal(lx, ly, lz);
  }

  isReasonablePosition(x, y, z) {
    const MAX_COORD = 10000;
    const MIN_COORD = -10000;
    return x >= MIN_COORD && x <= MAX_COORD &&
           y >= MIN_COORD && y <= MAX_COORD &&
           z >= MIN_COORD && z <= MAX_COORD;
  }

  getBlocksInRange(centerX, centerY, centerZ, range) {
    const blocks = [];
    const minX = Math.floor(centerX - range);
    const maxX = Math.ceil(centerX + range);
    const minY = Math.floor(centerY - range);
    const maxY = Math.ceil(centerY + range);
    const minZ = Math.floor(centerZ - range);
    const maxZ = Math.ceil(centerZ + range);

    const minCx = Math.floor(minX / CHUNK_SIZE);
    const maxCx = Math.floor(maxX / CHUNK_SIZE);
    const minCy = Math.floor(minY / CHUNK_SIZE);
    const maxCy = Math.floor(maxY / CHUNK_SIZE);
    const minCz = Math.floor(minZ / CHUNK_SIZE);
    const maxCz = Math.floor(maxZ / CHUNK_SIZE);

    const maxBlocks = 50000;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = chunkKey(cx, cy, cz);
          const chunk = this.chunks.get(key);
          if (!chunk) continue;
          const baseX = cx * CHUNK_SIZE;
          const baseY = cy * CHUNK_SIZE;
          const baseZ = cz * CHUNK_SIZE;
          const chunkBlocks = chunk.getAllBlocksGlobal(baseX, baseY, baseZ);
          for (const b of chunkBlocks) {
            const dx = b.x - centerX;
            const dy = b.y - centerY;
            const dz = b.z - centerZ;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (dist <= range) {
              blocks.push(b);
              if (blocks.length >= maxBlocks) return blocks;
            }
          }
        }
      }
    }

    return blocks;
  }

  // Return available chunks (not per-block) within a chunk-range radius around center (block coords)
  // rangeChunks: number of chunks radius to include (in chunks), if caller passes range in blocks, convert accordingly
  getChunksInRange(centerX, centerY, centerZ, rangeChunks) {
    const out = [];
    if (!Number.isFinite(rangeChunks)) return out;
    const cx0 = Math.floor(centerX / CHUNK_SIZE);
    const cy0 = Math.floor(centerY / CHUNK_SIZE);
    const cz0 = Math.floor(centerZ / CHUNK_SIZE);
    const minCx = cx0 - rangeChunks;
    const maxCx = cx0 + rangeChunks;
    const minCy = cy0 - rangeChunks;
    const maxCy = cy0 + rangeChunks;
    const minCz = cz0 - rangeChunks;
    const maxCz = cz0 + rangeChunks;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = chunkKey(cx, cy, cz);
          const chunk = this.chunks.get(key);
          if (chunk) {
            out.push({ cx, cy, cz, chunk });
          }
        }
      }
    }
    return out;
  }

  getBlocksArray() {
    const out = [];
    for (const [key, chunk] of this.chunks) {
      const baseX = chunk.cx * CHUNK_SIZE;
      const baseY = chunk.cy * CHUNK_SIZE;
      const baseZ = chunk.cz * CHUNK_SIZE;
      out.push(...chunk.getAllBlocksGlobal(baseX, baseY, baseZ));
    }
    return out;
  }

  getWorldSize() {
    return {
      width: this.maxBounds.x - this.minBounds.x,
      height: this.maxBounds.y - this.minBounds.y,
      depth: this.maxBounds.z - this.minBounds.z,
      minBounds: this.minBounds,
      maxBounds: this.maxBounds
    };
  }
}

module.exports = { ChunkStore, CHUNK_SIZE };
