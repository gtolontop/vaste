const { parentPort } = require('worker_threads');
const { generateChunkUint16WithCache, CHUNK_SIZE } = require('./chunkGenerator');

parentPort.on('message', (msg) => {
  const { id, cx, cy, cz } = msg;
  try {
  const res = generateChunkUint16WithCache(cx, cy, cz);
  // res: { u16: Uint16Array, nonEmptyCount }
    const u16 = res.u16;
    const nonEmptyCount = res.nonEmptyCount || 0;
    // timing: include generation duration if provided by generator (or compute here)
    // Note: generator is synchronous so measure duration here for worker-level timing
    // (higher-level timing is measured on server when calling worker)
    parentPort.postMessage({ id, cx, cy, cz, blocksBuffer: u16.buffer, nonEmptyCount }, [u16.buffer]);
  } catch (e) {
    parentPort.postMessage({ id, cx, cy, cz, error: String(e) });
  }
});
