const fs = require('fs');
const path = require('path');

// Simple chunk file format for fast read/write
// File layout: 16*16*? bytes depending on vertical storage. For now store as RLE or raw bytes per block
// We'll store chunk as a small header + raw block bytes (one byte per block) in XZ plane for configurable height slice.

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

class WorldStorage {
  constructor(worldRoot) {
    this.worldRoot = worldRoot; // absolute path
    ensureDir(this.worldRoot);
    this.chunksDir = path.join(this.worldRoot, 'chunks');
    ensureDir(this.chunksDir);
    this.metaPath = path.join(this.worldRoot, 'world.json');
  }

  readMeta() {
    if (!fs.existsSync(this.metaPath)) return null;
    try {
      const raw = fs.readFileSync(this.metaPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  writeMeta(meta) {
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  // Chunk coordinate naming: chunk_x_z.chunk
  chunkPath(cx, cz) {
    return path.join(this.chunksDir, `${cx}_${cz}.chunk`);
  }

  // Raw chunk format: header(4 bytes version) + raw blocks as bytes. We'll store 16x16xheight bytes.
  writeChunk(cx, cz, dataBuffer) {
    const p = this.chunkPath(cx, cz);
    fs.writeFileSync(p, dataBuffer);
  }

  readChunk(cx, cz) {
    const p = this.chunkPath(cx, cz);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  }
}

module.exports = { WorldStorage };
