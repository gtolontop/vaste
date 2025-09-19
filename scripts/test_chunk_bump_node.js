// Simple test harness to validate chunk bump behavior (face neighbors only)
// Run with: node scripts/test_chunk_bump_node.js

function bumpChunkAndFaceNeighbors(chunkVersions, cx, cy, cz) {
  const key = `${cx},${cy},${cz}`;
  chunkVersions[key] = (chunkVersions[key] || 0) + 1;
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (const d of dirs) {
    const nKey = `${cx + d[0]},${cy + d[1]},${cz + d[2]}`;
    chunkVersions[nKey] = (chunkVersions[nKey] || 0) + 1;
  }
}

function reset() { return {}; }

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

// Test 1: bump single chunk
(function testSingle() {
  const cv = reset();
  bumpChunkAndFaceNeighbors(cv, 0,0,0);
  const keys = Object.keys(cv);
  // Expect 7 keys: center + 6 faces
  assert(keys.length === 7, `expected 7 bumped chunks, got ${keys.length} (${keys.join(',')})`);
  // Ensure diagonals not present
  assert(!cv['1,1,0'] && !cv['1,1,1'], 'diagonal neighbor should not be bumped');
  console.log('testSingle passed');
})();

// Test 2: sequential bumps should increment counts appropriately
(function testIncrement() {
  const cv = reset();
  bumpChunkAndFaceNeighbors(cv, 0,0,0);
  bumpChunkAndFaceNeighbors(cv, 1,0,0);
  // Now chunk 1,0,0 bumped twice (once as neighbor of 0,0,0 and once as center)
  assert(cv['1,0,0'] === 2, `expected 1,0,0 to be bump count 2 but got ${cv['1,0,0']}`);
  // center 0,0,0 will be bumped twice (once as center, once as neighbor of 1,0,0)
  assert(cv['0,0,0'] === 2, `expected 0,0,0 bumped twice but got ${cv['0,0,0']}`);
  console.log('testIncrement passed');
})();

console.log('All tests passed.');
