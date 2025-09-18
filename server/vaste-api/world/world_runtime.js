const path = require('path');
const { WorldStorage } = require('./world_storage');

// Chunk constants
const CHUNK_SIZE = 16; // X and Z dimensions
const DEFAULT_HEIGHT = 256; // vertical height

class World {
  constructor(rootPath, options = {}) {
    this.rootPath = rootPath;
    this.storage = new WorldStorage(rootPath);
    this.type = options.type || 'flatworld';
    this.spawn = options.spawn || { x: 0, y: 4, z: 0 };
    this.height = options.height || DEFAULT_HEIGHT;

    // Compatibility: entity containers and spawnPoint alias
    this.entities = new Set();
    this.spawnPoint = this.spawn;

    // Chunk cache: Map keyed by `${cx},${cz}` -> {data: Uint8Array, lastAccess: Date}
    this.chunkCache = new Map();
    this.maxCachedChunks = options.maxCachedChunks || 256;

    // Load or initialize metadata
    const meta = this.storage.readMeta();
    if (meta) {
      this.type = meta.type || this.type;
      this.spawn = meta.spawn || this.spawn;
      this.height = meta.height || this.height;
    } else {
      this.storage.writeMeta({ type: this.type, spawn: this.spawn, height: this.height });
    }
  }

  _cacheKey(cx, cz) { return `${cx},${cz}`; }

  _ensureCacheLimit() {
    if (this.chunkCache.size <= this.maxCachedChunks) return;
    // Evict least-recently-used
    let oldestKey = null;
    let oldest = Date.now();
    for (const [k, v] of this.chunkCache.entries()) {
      if (v.lastAccess < oldest) { oldest = v.lastAccess; oldestKey = k; }
    }
    if (oldestKey) {
      const c = this.chunkCache.get(oldestKey);
      // write chunk to disk
      try {
        this.storage.writeChunk(...oldestKey.split(',').map(Number), Buffer.from(c.data));
      } catch (e) {
        // ignore
      }
      this.chunkCache.delete(oldestKey);
    }
  }

  // Load chunk from storage or generate if not present
  loadChunk(cx, cz) {
    const key = this._cacheKey(cx, cz);
    if (this.chunkCache.has(key)) {
      const entry = this.chunkCache.get(key);
      entry.lastAccess = Date.now();
      return entry.data;
    }

    // Try read from disk
    const raw = this.storage.readChunk(cx, cz);
    if (raw) {
      const buffer = Uint8Array.from(raw);
      this.chunkCache.set(key, { data: buffer, lastAccess: Date.now() });
      this._ensureCacheLimit();
      return buffer;
    }

    // Generate chunk on demand based on world type
    const generated = this.generateChunk(cx, cz);
    const buffer = Uint8Array.from(generated);
    this.chunkCache.set(key, { data: buffer, lastAccess: Date.now() });
    this._ensureCacheLimit();
    return buffer;
  }

  // Simple flat generator: y<=1 => block 1, else 0
  generateChunk(cx, cz) {
    // We'll generate CHUNK_SIZE x CHUNK_SIZE x this.height but that's large; instead store a vertical column per xz
    // For simplicity, we'll store column heights as a byte per block height for now limited to 0..255
    // Layout: CHUNK_SIZE * CHUNK_SIZE bytes representing top-most solid height (soil top), here 1
    const out = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const idx = x * CHUNK_SIZE + z;
        // flat: two layers (y=0 and y=1)
        out[idx] = 2; // indicates ground exists at y=0..1 (top = 2)
      }
    }
    return out;
  }

  saveAll() {
    for (const [key, entry] of this.chunkCache.entries()) {
      const [cx, cz] = key.split(',').map(Number);
      try { this.storage.writeChunk(cx, cz, Buffer.from(entry.data)); } catch (e) { }
    }
  }

  // Return blocks within a spherical range (approx) around center (block coords)
  getBlocksInRange(centerX, centerY, centerZ, range) {
    const blocks = [];
    const minX = Math.floor((centerX - range) / CHUNK_SIZE);
    const maxX = Math.floor((centerX + range) / CHUNK_SIZE);
    const minZ = Math.floor((centerZ - range) / CHUNK_SIZE);
    const maxZ = Math.floor((centerZ + range) / CHUNK_SIZE);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const buffer = this.loadChunk(cx, cz);
        if (!buffer) continue;
        // buffer is CHUNK_SIZE*CHUNK_SIZE bytes representing top solid height per XZ
        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            const idx = x * CHUNK_SIZE + z;
            const top = buffer[idx];
            if (top > 0) {
              const worldX = cx * CHUNK_SIZE + x;
              const worldZ = cz * CHUNK_SIZE + z;
              // generate blocks from y=0 to y=top-1
              for (let y = 0; y < top; y++) {
                const dx = worldX - centerX;
                const dy = y - centerY;
                const dz = worldZ - centerZ;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (dist <= range) {
                  blocks.push({ x: worldX, y: y, z: worldZ, type: 1 });
                }
              }
            }
          }
        }
      }
    }

    return blocks;
  }

  // Return all known blocks (from cached chunks). Warning: can be large.
  getBlocksArray() {
    const blocks = [];
    // Read both cached chunks and chunk files on disk to build a complete picture
    const seen = new Set();

    // Helper to process buffer
    const processBuffer = (cx, cz, buffer) => {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const idx = x * CHUNK_SIZE + z;
          const top = buffer[idx];
          if (top > 0) {
            const worldX = cx * CHUNK_SIZE + x;
            const worldZ = cz * CHUNK_SIZE + z;
            for (let y = 0; y < top; y++) {
              blocks.push({ x: worldX, y: y, z: worldZ, type: 1 });
            }
          }
        }
      }
    };

    // Process cached chunks first
    for (const [key, entry] of this.chunkCache.entries()) {
      const [cx, cz] = key.split(',').map(Number);
      seen.add(key);
      processBuffer(cx, cz, entry.data);
    }

    // Also process chunk files on disk that aren't cached
    const fs = require('fs');
    const chunksDir = require('path').join(this.rootPath, 'chunks');
    if (fs.existsSync(chunksDir)) {
      const files = fs.readdirSync(chunksDir);
      for (const f of files) {
        const m = f.match(/(-?\d+)_(-?\d+)\.chunk$/);
        if (!m) continue;
        const cx = parseInt(m[1], 10);
        const cz = parseInt(m[2], 10);
        const key = `${cx},${cz}`;
        if (seen.has(key)) continue;
        try {
          const raw = fs.readFileSync(require('path').join(chunksDir, f));
          const buffer = Uint8Array.from(raw);
          processBuffer(cx, cz, buffer);
        } catch (e) {
          // ignore read errors
        }
      }
    }

    return blocks;
  }

  // Set a single block in the world (simple column-top model)
  setBlock(x, y, z, blockType) {
    // compute chunk coords
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const key = this._cacheKey(cx, cz);
    let buffer = null;
    if (this.chunkCache.has(key)) {
      buffer = this.chunkCache.get(key).data;
    } else {
      const raw = this.storage.readChunk(cx, cz);
      if (raw) buffer = Uint8Array.from(raw);
      else buffer = this.generateChunk(cx, cz);
      this.chunkCache.set(key, { data: buffer, lastAccess: Date.now() });
    }

    const idx = lx * CHUNK_SIZE + lz;
    const currentTop = buffer[idx];
    if (blockType && blockType !== 0) {
      // place block: ensure top >= y+1
      if (y + 1 > currentTop) buffer[idx] = y + 1;
    } else {
      // remove block at (x,y,z): if y == top-1, need to reduce top
      if (y === currentTop - 1) {
        // naive scan downward to find new top (could be optimized)
        let newTop = 0;
        // In our simple model we don't track individual vertical blocks, so removing top clears entire column
        // We'll set newTop = 0 for simplicity
        newTop = 0;
        buffer[idx] = newTop;
      }
    }
  }

  getBlock(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const key = this._cacheKey(cx, cz);
    let buffer = null;
    if (this.chunkCache.has(key)) buffer = this.chunkCache.get(key).data;
    else {
      const raw = this.storage.readChunk(cx, cz);
      if (raw) buffer = Uint8Array.from(raw);
      else buffer = null;
    }
    if (!buffer) return 0;
    const idx = lx * CHUNK_SIZE + lz;
    const top = buffer[idx];
    if (y < top) return 1;
    return 0;
  }

  getWorldSize() {
    // For persisted worlds we consider them practically infinite; return large bounds
    return {
      width: Number.MAX_SAFE_INTEGER,
      height: this.height,
      depth: Number.MAX_SAFE_INTEGER,
      minBounds: { x: Number.MIN_SAFE_INTEGER, y: 0, z: Number.MIN_SAFE_INTEGER },
      maxBounds: { x: Number.MAX_SAFE_INTEGER, y: this.height, z: Number.MAX_SAFE_INTEGER }
    };
  }
}

class WorldRuntime {
  constructor() {
    this.worlds = new Map(); // key by world path
  }

  createOrLoadWorld(worldAbsolutePath, options = {}) {
    if (this.worlds.has(worldAbsolutePath)) return this.worlds.get(worldAbsolutePath);
    const world = new World(worldAbsolutePath, options);
    this.worlds.set(worldAbsolutePath, world);
    return world;
  }
}

module.exports = { WorldRuntime, CHUNK_SIZE };
