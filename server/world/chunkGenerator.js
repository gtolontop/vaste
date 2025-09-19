const CHUNK_SIZE = 16;
const GRASS_LAYERS = 1;
const DIRT_LAYERS = 3;
const STONE_LAYERS = 40;
const GROUND_AIR_OFFSET = 2;
const GROUND_TOP = GRASS_LAYERS + DIRT_LAYERS + STONE_LAYERS + GROUND_AIR_OFFSET;

function voxelIndexInChunk(x, y, z) {
  return ((y * CHUNK_SIZE + z) * CHUNK_SIZE) + x;
}

// Deterministic simple terrain generator: same logic as existing ChunkStore.ensureChunk loop
function generateChunkUint16(cx, cy, cz) {
  const VOXELS = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
  const arr = new Uint16Array(VOXELS);
  const baseY = cy * CHUNK_SIZE;
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        const wy = baseY + y;
        const top = GROUND_TOP;
        if (wy < top) {
          const topIndex = top - 1;
          if (wy > topIndex - GRASS_LAYERS && wy <= topIndex) {
            arr[voxelIndexInChunk(x, y, z)] = 3; // grass
          } else {
            const dirtTop = topIndex - GRASS_LAYERS;
            if (wy > dirtTop - DIRT_LAYERS && wy <= dirtTop) {
              arr[voxelIndexInChunk(x, y, z)] = 2; // dirt
            } else {
              arr[voxelIndexInChunk(x, y, z)] = 1; // stone
            }
          }
        }
      }
    }
  }
  return arr;
}

module.exports = { generateChunkUint16, CHUNK_SIZE };
