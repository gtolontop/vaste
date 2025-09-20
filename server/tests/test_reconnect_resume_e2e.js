const { GameServer } = require('../server');
const clientStateManager = require('../clientStateManager');
const assert = require('assert');

// Parse CHUNK_INIT buffers produced by server's serializeChunk
function parseChunkInit(buffer) {
  const dv = new DataView(buffer);
  let off = 0;
  const msgType = dv.getUint8(off); off += 1;
  if (msgType !== 1) return null;
  const seq = dv.getUint32(off, true); off += 4;
  const cx = dv.getInt32(off, true); off += 4;
  const cy = dv.getInt32(off, true); off += 4;
  const cz = dv.getInt32(off, true); off += 4;
  const version = dv.getInt32(off, true); off += 4;
  const entryCount = dv.getUint16(off, true); off += 2;
  return { seq, cx, cy, cz, version, entryCount };
}

async function run() {
  console.log('Starting e2e reconnect/resume test...');

  // cleanup any previous saved client state
  try { clientStateManager.clearState('e2e-player'); } catch (e) {}

  const gs = new GameServer({ headless: true });

  // Prepare world with one chunk with data
  const cx = 0, cy = 0, cz = 0;
  gs.world.ensureChunk(cx, cy, cz);

  // --- First connection: client receives chunks and records seqs ---
  const fakeWs1 = { readyState: 1, sent: [], send(buf) { this.sent.push(buf); } };
  const user = { id: 'e2e-player', username: 'e2e', uuid: 'e2e-uuid' };
  gs.initializeAuthenticatedPlayer(fakeWs1, user);

  // Ask server to send nearby blocks to this player
  gs.sendNearbyBlocks(user.id, 8, 5, 8);

  // Force processing: the server will start processing after we call handleClientChunkHave (simulate client telling server nothing yet)
  gs.handleClientChunkHave(user.id, []);

  // wait up to 2s for server to send at least one buffer
  await waitForCondition(() => fakeWs1.sent.length > 0, 2000, 'server did not send chunk buffers to first client');

  // parse seqs applied on client1
  const appliedSeqs = new Set();
  for (const b of fakeWs1.sent) {
    if (typeof b === 'string') continue;
    const parsed = parseChunkInit(b);
    if (parsed) appliedSeqs.add(parsed.seq);
  }
  assert(appliedSeqs.size > 0, 'First client should have applied at least one chunk');
  console.log('first client applied seqs:', Array.from(appliedSeqs));

  // Simulate client acknowledges: tell server which seqs it has
  gs.handleClientChunkHave(user.id, Array.from(appliedSeqs));

  // Now simulate disconnect: remove player (server code usually handles this on ws.close)
  gs.players.delete(user.id);

  // --- Reconnect: new websocket, server should restore outstanding/sendQueue from client state ---
  const fakeWs2 = { readyState: 1, sent: [], send(buf) { this.sent.push(buf); } };
  gs.initializeAuthenticatedPlayer(fakeWs2, user);

  // When server restores, it sets player._awaitingHave = true; simulate client sending chunk_have of already-applied seqs (so server will remove outstanding)
  gs.handleClientChunkHave(user.id, Array.from(appliedSeqs));

  // Allow server to process send queue (send only missing chunks). Wait briefly
  await new Promise(r => setTimeout(r, 200));

  // Collect seqs sent to second client
  const seqs2 = new Set();
  for (const b of fakeWs2.sent) {
    if (typeof b === 'string') continue;
    const parsed = parseChunkInit(b);
    if (parsed) seqs2.add(parsed.seq);
  }

  console.log('second connection received seqs:', Array.from(seqs2));

  // Assert no overlap between seqs previously applied and seqs sent after reconnect
  for (const s of seqs2) {
    if (appliedSeqs.has(s)) {
      throw new Error('Server resent an already-applied seq to client after reconnect: ' + s);
    }
  }

  console.log('e2e reconnect/resume test passed');
}

function waitForCondition(check, timeoutMs = 2000, errMsg = 'timed out') {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tick() {
      if (check()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error(errMsg));
      setTimeout(tick, 20);
    }
    tick();
  });
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
