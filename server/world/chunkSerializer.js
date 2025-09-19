const { CHUNK_SIZE } = require('./ChunkStore');
const zlib = require('zlib');

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

  // Try palette + bitpacking as first choice (compact for low-entropy chunks).
  // Build a palette of unique block ids appearing in the chunk (include 0 if present).
  const paletteMap = new Map();
  const paletteArr = [];
  for (let i = 0; i < blocks.length; i++) {
    const v = blocks[i];
    if (!paletteMap.has(v)) {
      const idx = paletteArr.length;
      paletteMap.set(v, idx);
      paletteArr.push(v);
    }
  }

  // Compute bits per entry needed for palette indices (min 1)
  let paletteLen = paletteArr.length;
  if (paletteLen === 0) paletteLen = 1, paletteArr.push(0);
  let bitsPerEntry = 1;
  while ((1 << bitsPerEntry) < paletteLen && bitsPerEntry < 16) bitsPerEntry++;

  // Pack palette indices into a compact bitbuffer
  const VOXELS = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
  const totalBits = VOXELS * bitsPerEntry;
  const packedBytesLen = Math.ceil(totalBits / 8);
  const packed = new Uint8Array(packedBytesLen);
  let bitPos = 0;
  for (let i = 0; i < VOXELS; i++) {
    const v = blocks[i] || 0;
    const pidx = paletteMap.get(v);
    let remaining = bitsPerEntry;
    let value = pidx;
    while (remaining > 0) {
      const byteIndex = (bitPos >>> 3);
      const bitOffset = bitPos & 7;
      const space = 8 - bitOffset;
      const toWrite = Math.min(space, remaining);
      // mask out the lower `toWrite` bits
      const mask = (1 << toWrite) - 1;
      packed[byteIndex] |= ((value & mask) << bitOffset) & 0xff;
      value = value >>> toWrite;
      remaining -= toWrite;
      bitPos += toWrite;
    }
  }

  // Build uncompressed payload for packed format:
  // [uint8 paletteLen][paletteLen*uint16 LE][uint8 bitsPerEntry][uint32 packedByteLen][packed bytes]
  const paletteBytes = new Uint8Array(paletteLen * 2);
  for (let i = 0; i < paletteLen; i++) {
    const v = paletteArr[i] & 0xffff;
    paletteBytes[i * 2] = v & 0xff;
    paletteBytes[i * 2 + 1] = (v >>> 8) & 0xff;
  }

  const headerUncompressedLen = 1 + (paletteLen * 2) + 1 + 4; // paletteLen + palette + bitsPerEntry + packedByteLen
  const uncompressedPayload = new Uint8Array(headerUncompressedLen + packedBytesLen);
  let upOff = 0;
  uncompressedPayload[upOff++] = paletteLen & 0xff;
  uncompressedPayload.set(paletteBytes, upOff); upOff += paletteBytes.length;
  uncompressedPayload[upOff++] = bitsPerEntry & 0xff;
  // packedByteLen (uint32 LE)
  uncompressedPayload[upOff++] = packedBytesLen & 0xff;
  uncompressedPayload[upOff++] = (packedBytesLen >>> 8) & 0xff;
  uncompressedPayload[upOff++] = (packedBytesLen >>> 16) & 0xff;
  uncompressedPayload[upOff++] = (packedBytesLen >>> 24) & 0xff;
  uncompressedPayload.set(packed, upOff);

  // Compare sizes: packed uncompressed vs existing RLE vs raw. Pick best small-format to send.
  const rawBytes = Buffer.from(blocks.buffer);
  const rle = rleEncodeUint16(blocks);
  let compressionMode = 2; // 2 = palette+packed (uncompressed)
  let payload = uncompressedPayload;
  // if RLE is better than palette-packed choose RLE
  if (rle.length < payload.length && rle.length < rawBytes.length) {
    compressionMode = 1;
    payload = rle;
  } else if (rawBytes.length <= payload.length && rawBytes.length <= rle.length) {
    compressionMode = 0;
    payload = new Uint8Array(rawBytes);
  }

  // Try zlib deflate on the selected payload if it meaningfully reduces size.
  try {
    const compressed = zlib.deflateSync(Buffer.from(payload));
    // If compressed is smaller, use it and mark high-bit on compressionMode to indicate zlib
    if (compressed.length < payload.length - 8) { // require some gain to justify decompression
      payload = new Uint8Array(compressed);
      compressionMode = (compressionMode | 0x80) >>> 0; // set high bit
    }
  } catch (e) {
    // ignore compression failures and use payload as-is
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
