const path = require('path');
const { serializeChunk } = require(path.join(__dirname, '..', 'world', 'chunkSerializer'));

function makeFakeChunk() {
  const CHUNK_SIZE = 16;
  const arr = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  // set a couple of non-zero blocks
  arr[0] = 1;
  arr[123] = 2;
  return { cx: 0, cy: 0, cz: 0, version: 1, blocks: arr };
}

function run() {
  const chunk = makeFakeChunk();
  const buf = serializeChunk(chunk);
  if (!buf || buf.byteLength <= 19) { console.error('serializeChunk produced too-small buffer'); process.exit(2); }
  console.log('chunkSerializer test passed');
  process.exit(0);
}

run();
