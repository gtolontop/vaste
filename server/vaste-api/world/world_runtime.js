const path = require('path');
const { WorldStorage } = require('./world_storage');

// Chunk constants
const CHUNK_SIZE = 16; // X and Z dimensions
const DEFAULT_HEIGHT = 256; // vertical height

// Default flatworld layer configuration (in blocks)
// 1 block grass on top, 3 blocks dirt below it, 40 blocks stone below that
const GRASS_LAYERS = 1;
const DIRT_LAYERS = 3;
const STONE_LAYERS = 40;
// We'll leave a couple of empty air layers below ground (as previous behaviour);
// GROUND_TOP is the 'top' value used by the column model (number of solid layers)
const GROUND_AIR_OFFSET = 2; // number of empty layers beneath stone start (keeps old layout)
const GROUND_TOP = GRASS_LAYERS + DIRT_LAYERS + STONE_LAYERS + GROUND_AIR_OFFSET;

class World {
  constructor(rootPath, options = {}) {
    this.rootPath = rootPath;
    this.storage = new WorldStorage(rootPath);
  this.type = options.type || 'flatworld';
  // Default spawn placed above the flat ground so players spawn on safe air above grass
  this.spawn = options.spawn || { x: 0, y: GROUND_TOP + 1, z: 0 };
    this.height = options.height || DEFAULT_HEIGHT;

    // Compatibility: entity containers and spawnPoint alias
    this.entities = new Set();
    this.spawnPoint = this.spawn;

    // Chunk cache: Map keyed by `${cx},${cz}` -> {data: Uint8Array, lastAccess: Date}
    this.chunkCache = new Map();
    this.maxCachedChunks = options.maxCachedChunks || 256;
  // In-memory overlay of explicit per-block edits made by players or mods.
  // Key: "x,y,z" -> value: blockType (0 = explicit deletion). Presence of a key means an override.
  // This prevents the simplistic column-top base terrain from clobbering player-built blocks.
  this.edits = new Map();

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

    // Simple flat generator: store top height per column. Block types are resolved dynamically
    // according to layered rules defined by the constants above
    generateChunk(cx, cz) {
      const out = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
      // top value represents number of solid layers (top = highest solid y + 1)
      // Use GROUND_TOP computed from GRASS/DIRT/STONE layers + offset
      const TOP = GROUND_TOP; // highest solid block will be at y = TOP - 1
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const idx = x * CHUNK_SIZE + z;
          out[idx] = TOP;
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
    // We'll iterate chunks in spiral order around the player's chunk to prioritize nearby chunks
    const centerChunkX = Math.floor(centerX / CHUNK_SIZE);
    const centerChunkZ = Math.floor(centerZ / CHUNK_SIZE);

    // helper: generate chunk coords in an outward spiral from center within bounds
    const spiralChunks = (minCx, maxCx, minCz, maxCz, cx0, cz0) => {
      const coords = [];
      const visited = new Set();
      const maxRadius = Math.max(Math.abs(maxCx - cx0), Math.abs(minCx - cx0), Math.abs(maxCz - cz0), Math.abs(minCz - cz0));
      coords.push([cx0, cz0]);
      visited.add(`${cx0},${cz0}`);
      for (let r = 1; r <= maxRadius; r++) {
        // start at (cx0 - r, cz0 - r) and walk the perimeter clockwise
        let x = cx0 - r;
        let z = cz0 - r;
        // top edge: left -> right
        for (let i = 0; i < r * 2; i++) {
          x++;
          if (x >= minCx && x <= maxCx && z >= minCz && z <= maxCz) {
            const k = `${x},${z}`;
            if (!visited.has(k)) { coords.push([x, z]); visited.add(k); }
          }
        }
        // right edge: top -> bottom
        for (let i = 0; i < r * 2; i++) {
          z++;
          if (x >= minCx && x <= maxCx && z >= minCz && z <= maxCz) {
            const k = `${x},${z}`;
            if (!visited.has(k)) { coords.push([x, z]); visited.add(k); }
          }
        }
        // bottom edge: right -> left
        for (let i = 0; i < r * 2; i++) {
          x--;
          if (x >= minCx && x <= maxCx && z >= minCz && z <= maxCz) {
            const k = `${x},${z}`;
            if (!visited.has(k)) { coords.push([x, z]); visited.add(k); }
          }
        }
        // left edge: bottom -> top
        for (let i = 0; i < r * 2; i++) {
          z--;
          if (x >= minCx && x <= maxCx && z >= minCz && z <= maxCz) {
            const k = `${x},${z}`;
            if (!visited.has(k)) { coords.push([x, z]); visited.add(k); }
          }
        }
      }
      return coords;
    };

    const chunkCoords = spiralChunks(minX, maxX, minZ, maxZ, centerChunkX, centerChunkZ);

    // First, include any explicit edits (overrides) in the area
    for (const [k, v] of this.edits.entries()) {
      const [ex, ey, ez] = k.split(',').map(Number);
      const dx = ex - centerX;
      const dy = ey - centerY;
      const dz = ez - centerZ;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist <= range) {
        if (v !== 0) blocks.push({ x: ex, y: ey, z: ez, type: v });
        // if v === 0, explicit deletion, do not include
      }
    }

    // Then generate base blocks, skipping positions that have an edit override
    for (const [cx, cz] of chunkCoords) {
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
            // generate blocks from y=0 to y=top-1 and determine their type by layer
            for (let y = 0; y < top; y++) {
              const key = `${worldX},${y},${worldZ}`;
              // overlay edits override base blocks
              if (this.edits.has(key)) continue;
              const dx = worldX - centerX;
              const dy = y - centerY;
              const dz = worldZ - centerZ;
              const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
              if (dist <= range) {
                const type = this._blockTypeForHeight(y, top);
                if (type !== 0) blocks.push({ x: worldX, y: y, z: worldZ, type });
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
              const type = this._blockTypeForHeight(y, top);
              if (type !== 0) blocks.push({ x: worldX, y: y, z: worldZ, type });
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

    // Include explicit edits that may fall outside cached / disk chunks
    for (const [k, v] of this.edits.entries()) {
      if (!k) continue;
      const [ex, ey, ez] = k.split(',').map(Number);
      if (typeof ex !== 'number' || typeof ey !== 'number' || typeof ez !== 'number') continue;
      if (v && v !== 0) blocks.push({ x: ex, y: ey, z: ez, type: v });
      // if v === 0 this is an explicit deletion and should not be included
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

  // Return chunk-aligned chunks within a chunk-radius around a center (block coords)
  // rangeChunks is number of chunks (radius) to include
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
      for (let cz = minCz; cz <= maxCz; cz++) {
        // Load or generate chunk metadata (column tops)
        const buffer = this.loadChunk(cx, cz);
        if (!buffer) continue;

        // For each vertical chunk layer in the requested vertical radius, synthesize a full chunk's blocks
        for (let cy = minCy; cy <= maxCy; cy++) {
          const chunkBlocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
          const baseWorldY = cy * CHUNK_SIZE;
          // buffer contains top per XZ (number of solid layers)
          for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
              const idx = x * CHUNK_SIZE + z;
              const top = buffer[idx];
              // fill local y 0..15 corresponding to worldY = baseWorldY + y
              for (let y = 0; y < CHUNK_SIZE; y++) {
                const worldY = baseWorldY + y;
                if (worldY < top) {
                  const type = this._blockTypeForHeight(worldY, top);
                  if (type !== 0) {
                    const localIdx = y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
                    chunkBlocks[localIdx] = type;
                  }
                }
              }
            }
            }

            // Apply edits overlay within this chunk (only edits that fall into this chunk's bounds)
            const baseX = cx * CHUNK_SIZE;
          const baseZ = cz * CHUNK_SIZE;
          for (const [k, v] of this.edits.entries()) {
            if (!k) continue;
            const [ex, ey, ez] = k.split(',').map(Number);
            if (ex >= baseX && ex < baseX + CHUNK_SIZE && ez >= baseZ && ez < baseZ + CHUNK_SIZE && ey >= baseWorldY && ey < baseWorldY + CHUNK_SIZE) {
              const lx = ex - baseX;
              const ly = ey - baseWorldY;
              const lz = ez - baseZ;
              const localIdx = ly * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx;
              chunkBlocks[localIdx] = v || 0;
            }
          }

          out.push({ cx: cx, cy: cy, cz: cz, chunk: { cx, cy, cz, blocks: chunkBlocks, version: 1 } });
        }
      }
    }
    return out;
  }

  // Set a single block in the world (simple column-top model)
  setBlock(x, y, z, blockType) {
    // Record explicit per-block edit in overlay map. This prevents the simplistic
    // column-top base data from being mutated and subsequently regenerating
    // the column as if the player never modified it.
    const editKey = `${x},${y},${z}`;
    try {
      if (typeof blockType === 'number' && blockType !== 0) {
        this.edits.set(editKey, blockType);
      } else {
        // blockType == 0 means explicit deletion; store 0 to indicate override
        this.edits.set(editKey, 0);
      }
    } catch (e) {
      // fallback: do nothing on failure
    }
  }

  getBlock(x, y, z) {
    const editKey = `${x},${y},${z}`;
    if (this.edits.has(editKey)) {
      const v = this.edits.get(editKey);
      return v || 0;
    }

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
    if (y < top) return this._blockTypeForHeight(y, top);
    return 0;
  }

  // Decide block type given a local y and column top
  _blockTypeForHeight(y, top) {
  // layering rules relative to top (top is number of solid layers, highest solid y = top-1)
  // Use the configured GRASS_LAYERS, DIRT_LAYERS and STONE_LAYERS values
  const topIndex = top - 1; // highest solid y
  // Grass: the top-most GRASS_LAYERS rows
  if (y > topIndex - GRASS_LAYERS && y <= topIndex) return 3; // grass
  // Dirt: immediately below grass for DIRT_LAYERS rows
  const dirtTop = topIndex - GRASS_LAYERS;
  if (y > dirtTop - DIRT_LAYERS && y <= dirtTop) return 2; // dirt
  // Stone: below dirt for STONE_LAYERS rows
  const stoneTop = dirtTop - DIRT_LAYERS;
  if (y > stoneTop - STONE_LAYERS && y <= stoneTop) return 1; // stone
  return 0; // air
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

  // Keep parity with in-memory World API: check for reasonable coordinates
  isReasonablePosition(x, y, z) {
    const MAX_COORD = 10000;
    const MIN_COORD = -10000;
    return x >= MIN_COORD && x <= MAX_COORD &&
           y >= MIN_COORD && y <= MAX_COORD &&
           z >= MIN_COORD && z <= MAX_COORD;
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
