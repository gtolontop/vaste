const CHUNK_SIZE = 16;
const GRASS_LAYERS = 1;
const DIRT_LAYERS = 3;
const STONE_LAYERS = 40;
const GROUND_AIR_OFFSET = 2;
const GROUND_TOP = GRASS_LAYERS + DIRT_LAYERS + STONE_LAYERS + GROUND_AIR_OFFSET;

// Fast voxel index calculation
function voxelIndexInChunk(x, y, z) {
  return ((y * CHUNK_SIZE + z) * CHUNK_SIZE) + x;
}

// Optimized deterministic terrain generator.
// Instead of checking every voxel with nested conditionals, we fill columns per-layer ranges.
// Returns an object { u16: Uint16Array, nonEmptyCount }
function generateChunkUint16(cx, cy, cz) {
  const VOXELS = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
  const arr = new Uint16Array(VOXELS);
  const baseY = cy * CHUNK_SIZE;
  let nonEmpty = 0;

  // Precompute the absolute world Y thresholds for layers
  const top = GROUND_TOP; // number of solid layers from y=0 upward

  // For each column (x,z), compute how many voxels in this chunk are below 'top'
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      // Determine the highest local y in this chunk that is < top
      // i.e., solve wy = baseY + y < top -> y < top - baseY
      const maxYExclusive = Math.max(0, Math.min(CHUNK_SIZE, top - baseY));
      if (maxYExclusive <= 0) continue; // this column is entirely above ground

      // For performance, iterate y from 0 up to maxYExclusive-1 and set types based on layer bands
      for (let y = 0; y < maxYExclusive; y++) {
        const wy = baseY + y;
        const idx = voxelIndexInChunk(x, y, z);
        // decide type by comparing to top bands
        const topIndex = top - 1;
        if (wy > topIndex - GRASS_LAYERS && wy <= topIndex) {
          arr[idx] = 3; // grass
        } else {
          const dirtTop = topIndex - GRASS_LAYERS;
          if (wy > dirtTop - DIRT_LAYERS && wy <= dirtTop) {
            arr[idx] = 2; // dirt
          } else {
            arr[idx] = 1; // stone
          }
        }
        nonEmpty++;
      }
    }
  }

  return { u16: arr, nonEmptyCount: nonEmpty };
}

// Simple cache to reuse generated chunk patterns for the same baseY
const _cache = new Map(); // baseY -> { u16: Uint16Array, nonEmptyCount }
const _CACHE_MAX = 64;

function generateChunkUint16WithCache(cx, cy, cz) {
  const baseY = cy * CHUNK_SIZE;
  const cached = _cache.get(baseY);
  if (cached) {
    // return a copy so callers may transfer the buffer safely
    return { u16: cached.u16.slice(), nonEmptyCount: cached.nonEmptyCount };
  }
  const res = generateChunkUint16(cx, cy, cz);
  // store up to _CACHE_MAX entries
  if (_cache.size >= _CACHE_MAX) {
    // delete oldest entry (Map preserves insertion order)
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  _cache.set(baseY, { u16: res.u16.slice(), nonEmptyCount: res.nonEmptyCount });
  return res;
}

module.exports = { generateChunkUint16, generateChunkUint16WithCache, CHUNK_SIZE };
