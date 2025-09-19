const { parentPort } = require('worker_threads');
const { generateChunkUint16, CHUNK_SIZE } = require('./chunkGenerator');

parentPort.on('message', (msg) => {
  const { id, cx, cy, cz } = msg;
  try {
    const u16 = generateChunkUint16(cx, cy, cz);
    // transfer the underlying buffer to main thread
    parentPort.postMessage({ id, cx, cy, cz, blocksBuffer: u16.buffer }, [u16.buffer]);
  } catch (e) {
    parentPort.postMessage({ id, cx, cy, cz, error: String(e) });
  }
});
