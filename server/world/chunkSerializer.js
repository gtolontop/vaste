const { CHUNK_SIZE } = require('./ChunkStore');

// New full-chunk binary serializer with simple RLE compression.
// Message format (little-endian):
// 0: uint8  messageType (1 = CHUNK_FULL)
// 1: uint32 sequenceNumber
// 5: int32  cx
// 9: int32  cy
// 13: int32 cz
// 17: int32 version
// 21: uint8 compressionMode (0 = raw, 1 = rle)
// 22: uint32 payloadByteLength
// 26: payload bytes (if raw: CHUNK_SIZE^3 uint16 LE array; if rle: repeated uint16 runLength, uint16 value pairs)

// Simple RLE encoder for Uint16Array. Returns Uint8Array of bytes.
function rleEncodeUint16(u16) {
  const out = [];
  const len = u16.length;
  let i = 0;
  while (i < len) {
    const v = u16[i];
    let run = 1;
    i++;
    while (i < len && u16[i] === v && run < 0xffff) {
      run++; i++;
    }
    // push run (uint16), value (uint16) little-endian
    out.push(run & 0xff, (run >>> 8) & 0xff);
    out.push(v & 0xff, (v >>> 8) & 0xff);
  }
  return Uint8Array.from(out);
}

function serializeChunk(chunk) {
  // Expect chunk.blocks to be a Uint16Array of length CHUNK_SIZE^3 (4096)
  const seq = chunk.__seq != null ? chunk.__seq >>> 0 : 0;
  const cx = Number(chunk.cx) | 0;
  const cy = Number(chunk.cy) | 0;
  const cz = Number(chunk.cz) | 0;
  const version = Number(chunk.version || 1) | 0;

  let blocks = null;
  if (chunk.blocks && chunk.blocks instanceof Uint16Array) {
    blocks = chunk.blocks;
  } else if (chunk.getNonEmptyEntries && typeof chunk.getNonEmptyEntries === 'function') {
    // Build full array from sparse entries
    const arr = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
    const entries = chunk.getNonEmptyEntries();
    for (const [idx, type] of entries) {
      arr[idx] = type & 0xffff;
    }
    blocks = arr;
  } else if (chunk.blocks && typeof chunk.blocks.entries === 'function') {
    const arr = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
    for (const [k, v] of chunk.blocks.entries()) {
      // k might be a global coordinate object; assume v has x,y,z
      if (v && typeof v.x === 'number') {
        const lx = v.x - (cx * CHUNK_SIZE);
        const ly = v.y - (cy * CHUNK_SIZE);
        const lz = v.z - (cz * CHUNK_SIZE);
        const idx = ((ly * CHUNK_SIZE + lz) * CHUNK_SIZE) + lx;
        if (idx >= 0 && idx < arr.length) arr[idx] = v.type & 0xffff;
      }
    }
    blocks = arr;
  } else {
    // Unknown format: try to build empty chunk
    blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  }

  // Attempt RLE compression and fall back to raw if RLE is not smaller
  const rawBytes = Buffer.from(blocks.buffer); // Node Buffer views underlying ArrayBuffer
  const rle = rleEncodeUint16(blocks);
  let compressionMode = 1;
  let payload = rle;
  if (rle.length >= rawBytes.length) {
    compressionMode = 0;
    payload = new Uint8Array(rawBytes);
  }

  const headerSize = 26; // bytes until payload
  const payloadLen = payload.length;
  const buffer = new ArrayBuffer(headerSize + payloadLen);
  const dv = new DataView(buffer);
  let offset = 0;
  dv.setUint8(offset, 1); offset += 1; // messageType = CHUNK_FULL
  dv.setUint32(offset, seq, true); offset += 4;
  dv.setInt32(offset, cx, true); offset += 4;
  dv.setInt32(offset, cy, true); offset += 4;
  dv.setInt32(offset, cz, true); offset += 4;
  dv.setInt32(offset, version, true); offset += 4;
  dv.setUint8(offset, compressionMode); offset += 1;
  dv.setUint32(offset, payloadLen, true); offset += 4;

  // copy payload bytes
  const target = new Uint8Array(buffer, offset, payloadLen);
  target.set(payload);

  return buffer;
}

module.exports = { serializeChunk };
