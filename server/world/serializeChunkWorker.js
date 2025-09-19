const { parentPort } = require('worker_threads');
// Worker: receives { id, cx, cy, cz, chunk } and returns { id, cx, cy, cz, buffer }
// We require chunkSerializer locally to avoid main-thread CPU work
try {
  const { serializeChunk } = require('./chunkSerializer');
  parentPort.on('message', (msg) => {
    const { id, cx, cy, cz, chunk } = msg;
    try {
      // chunk may be transferred; ensure we don't modify it
      const buffer = serializeChunk(chunk);
      // Transfer the ArrayBuffer back to main thread for zero-copy
      parentPort.postMessage({ id, cx, cy, cz, buffer }, [buffer]);
    } catch (e) {
      parentPort.postMessage({ id, cx, cy, cz, error: String(e) });
    }
  });
} catch (e) {
  parentPort.postMessage({ id: null, error: 'serializeChunk require failed: ' + String(e) });
}
