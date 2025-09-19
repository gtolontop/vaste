const { parentPort } = require('worker_threads');
const { generateChunkUint16WithCache, CHUNK_SIZE } = require('./chunkGenerator');

parentPort.on('message', (msg) => {
  const { id, cx, cy, cz } = msg;
  try {
  const res = generateChunkUint16WithCache(cx, cy, cz);
  // res: { u16: Uint16Array, nonEmptyCount }
    const u16 = res.u16;
    const nonEmptyCount = res.nonEmptyCount || 0;
    // transfer the underlying buffer to main thread along with nonEmptyCount
    parentPort.postMessage({ id, cx, cy, cz, blocksBuffer: u16.buffer, nonEmptyCount }, [u16.buffer]);
  } catch (e) {
    parentPort.postMessage({ id, cx, cy, cz, error: String(e) });
  }
});
