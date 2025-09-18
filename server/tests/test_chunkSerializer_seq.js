const path = require('path');
const { serializeChunk } = require(path.join(__dirname, '..', 'world', 'chunkSerializer'));

function makeFakeChunk() {
  const CHUNK_SIZE = 16;
  const arr = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  arr[0] = 1;
  return { cx: 1, cy: 2, cz: 3, version: 7, blocks: arr, __seq: 42 };
}

function run() {
  const chunk = makeFakeChunk();
  const buf = serializeChunk(chunk);
  const dv = new DataView(buf);
  const msgType = dv.getUint8(0);
  const seq = dv.getUint32(1, true);
  if (msgType !== 1 || seq !== 42) { console.error('seq not serialized correctly', msgType, seq); process.exit(2); }
  console.log('chunkSerializer seq test passed');
  process.exit(0);
}

run();
