const { CHUNK_SIZE } = require('./ChunkStore');

// Binary chunk serializer
// Format (little-endian):
// 0: uint8  messageType (1 = CHUNK_INIT)
// 1: uint32 sequenceNumber (for reliable ACKs)
// 5: int32  cx
// 9: int32  cy
// 13: int32 cz
// 17: int32 version
// 21: uint16 entryCount (number of non-air voxels in this chunk)
// then entries: for i in 0..entryCount-1: uint16 idx, uint16 blockType

function serializeChunk(chunk) {
  // chunk: { cx, cy, cz, version }
  // blocks can be one of:
  // - Map-like with entries()
  // - typed-array chunk with getNonEmptyEntries() -> Array<[idx, type]>
  // - raw Uint16Array of length CHUNK_SIZE^3 where index -> type
  let entries = [];
  if (chunk.getNonEmptyEntries && typeof chunk.getNonEmptyEntries === 'function') {
    entries = chunk.getNonEmptyEntries();
  } else if (chunk.blocks && typeof chunk.blocks.entries === 'function') {
    entries = Array.from(chunk.blocks.entries());
  } else if (chunk.blocks && chunk.blocks instanceof Uint16Array) {
    // scan for non-zero entries
    const arr = chunk.blocks;
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i];
      if (t !== 0) entries.push([i, t]);
    }
  } else {
    // unknown shape: attempt to iterate numeric keys
    try {
      for (const k in chunk.blocks) {
        const idx = Number(k);
        const v = chunk.blocks[k];
        if (!Number.isNaN(idx) && v) entries.push([idx, v]);
      }
    } catch (e) {
      entries = [];
    }
  }
  const entryCount = entries.length;
  // header size = 1 (msg) + 4 (seq) + 4*3 (cx,cy,cz) + 4 (version) + 2 (entryCount) = 1+4+12+4+2 = 23
  const headerSize = 23;
  const entrySize = 4; // uint16 idx + uint16 type
  const buffer = new ArrayBuffer(headerSize + entryCount * entrySize);
  const dv = new DataView(buffer);
  let offset = 0;
  dv.setUint8(offset, 1); offset += 1; // message type
  // sequence number (optional, server will set this prior to sending)
  const seq = chunk.__seq != null ? chunk.__seq >>> 0 : 0;
  dv.setUint32(offset, seq, true); offset += 4;
  dv.setInt32(offset, chunk.cx, true); offset += 4;
  dv.setInt32(offset, chunk.cy, true); offset += 4;
  dv.setInt32(offset, chunk.cz, true); offset += 4;
  dv.setInt32(offset, chunk.version || 1, true); offset += 4;
  dv.setUint16(offset, entryCount, true); offset += 2;

  for (let i = 0; i < entryCount; i++) {
    const [idx, type] = entries[i];
    dv.setUint16(offset, idx & 0xffff, true); offset += 2;
    dv.setUint16(offset, type & 0xffff, true); offset += 2;
  }

  return buffer;
}

module.exports = { serializeChunk };
