// Web worker to decode CHUNK_FULL messages and return sparse non-empty blocks.
// This file is intended to be built by the client bundler (Vite) as a module worker.

// Message in: { type: 'decode', buffer: ArrayBuffer }
// Message out: { type: 'decoded', seq, cx, cy, cz, version, blocks: Array<{x,y,z,type}> }

self.onmessage = (ev: MessageEvent) => {
  const data = ev.data;
  if (!data || data.type !== "decode" || !data.buffer) return;
  const requestId = data.requestId || null;
  try {
    const ab: ArrayBuffer = data.buffer;
    const dv = new DataView(ab);
    const tStart = Date.now();
    let off = 0;
    const msgType = dv.getUint8(off);
    off += 1;
    if (msgType !== 1) {
      self.postMessage({ type: "error", error: "unsupported msgType" });
      return;
    }
    const seq = dv.getUint32(off, true);
    off += 4;
    const cx = dv.getInt32(off, true);
    off += 4;
    const cy = dv.getInt32(off, true);
    off += 4;
    const cz = dv.getInt32(off, true);
    off += 4;
    const version = dv.getInt32(off, true);
    off += 4;
    const compressionMode = dv.getUint8(off);
    off += 1;
    const payloadLen = dv.getUint32(off, true);
    off += 4;
    const payload = new Uint8Array(ab, off, payloadLen);

    const VOXELS = 16 * 16 * 16;
    let blocksU16 = new Uint16Array(VOXELS);
    if (compressionMode === 0) {
      if (payload.byteLength >= VOXELS * 2) {
        blocksU16 = new Uint16Array(payload.buffer, payload.byteOffset, VOXELS);
      } else {
        blocksU16 = new Uint16Array(VOXELS);
      }
    } else if (compressionMode === 1) {
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      let pos = 0;
      let outIdx = 0;
      while (pos + 4 <= payload.byteLength && outIdx < VOXELS) {
        const run = view.getUint16(pos, true);
        pos += 2;
        const val = view.getUint16(pos, true);
        pos += 2;
        for (let r = 0; r < run && outIdx < VOXELS; r++) {
          blocksU16[outIdx++] = val;
        }
      }
    }

    // New: palette + packed format (compressionMode === 2)
    if (compressionMode === 2) {
      // payload layout: [uint8 paletteLen][paletteLen*uint16 LE][uint8 bitsPerEntry][uint32 packedByteLen][packed bytes]
      try {
        const pv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        let pOff = 0;
        const paletteLen = pv.getUint8(pOff); pOff += 1;
        const palette = new Uint16Array(paletteLen);
        for (let i = 0; i < paletteLen; i++) {
          palette[i] = pv.getUint16(pOff, true); pOff += 2;
        }
        const bitsPerEntry = pv.getUint8(pOff); pOff += 1;
        const packedByteLen = pv.getUint32(pOff, true); pOff += 4;
        const packedBytes = new Uint8Array(payload.buffer, payload.byteOffset + pOff, packedByteLen);

        // Unpack bitstream into palette indices
        const totalBits = VOXELS * bitsPerEntry;
        let bitPos = 0;
        const indices = new Uint32Array(VOXELS);
        for (let i = 0; i < VOXELS; i++) {
          let bitsLeft = bitsPerEntry;
          let value = 0;
          let shift = 0;
          while (bitsLeft > 0) {
            const byteIndex = (bitPos >>> 3);
            const bitOffset = bitPos & 7;
            const available = Math.min(8 - bitOffset, bitsLeft);
            const byte = packedBytes[byteIndex];
            const part = (byte >>> bitOffset) & ((1 << available) - 1);
            value |= (part << shift);
            shift += available;
            bitsLeft -= available;
            bitPos += available;
          }
          indices[i] = value;
        }

        // Map palette indices to block types and fill blocksU16
        for (let i = 0; i < VOXELS; i++) {
          const pidx = indices[i];
          const v = (pidx < palette.length) ? palette[pidx] : 0;
          blocksU16[i] = v;
        }
      } catch (err) {
        // fallback to empty chunk on any decode error
        blocksU16 = new Uint16Array(VOXELS);
      }
    }

    // Build sparse representation as typed arrays (indices within chunk and types). This is much cheaper
    // to transfer back to the main thread than large arrays of JS objects.
    const idxs: number[] = [];
    const types: number[] = [];
    for (let i = 0; i < blocksU16.length; i++) {
      const t = blocksU16[i];
      if (t !== 0) {
        idxs.push(i);
        types.push(t);
      }
    }

    const indices = new Uint16Array(idxs);
    const typesArr = new Uint16Array(types);
    const decodeMs = Date.now() - tStart;
    // Use any cast to avoid DOM Window overload typing issues in TypeScript
    (self as any).postMessage({ type: "decoded", requestId, seq, cx, cy, cz, version, indices, types: typesArr, decodeMs }, [indices.buffer, typesArr.buffer]);
  } catch (e) {
    (self as any).postMessage({ type: "error", requestId: data && data.requestId ? data.requestId : null, error: String(e) });
  }
};
