const { GameServer } = require('../server');
const WebSocket = require('ws');
const assert = require('assert');
const { ChunkStore } = require('../world/ChunkStore');

// This test runs a headless GameServer, then simulates a client that connects,
// server enqueues chunk sends, and client sends chunk_have to prevent duplicates.

async function run() {
  console.log('Starting reconnect/resume test...');

  // Create a headless GameServer instance (test mode) so we don't bind ports or call external services
  const gs = new GameServer({ headless: true });

  // Use an in-memory player simulation: create a fake player object and simulate state
  const fakeWs = {
    readyState: 1,
    sent: [],
    send(buf) { this.sent.push(buf); }
  };

  // Create a fake authenticated user
  const user = { id: 'test-player', username: 'tester', uuid: 'uuid-test' };

  // Initialize player (this will set up sendQueue/outstanding etc.)
  gs.initializeAuthenticatedPlayer(fakeWs, user);

  // Ensure there is at least one chunk available nearby
  const pcx = Math.floor(8/16), pcy = Math.floor(5/16), pcz = Math.floor(8/16);
  const key = `${pcx},${pcy},${pcz}`;
  // ensure chunk exists
  const c = gs.world.ensureChunk(pcx, pcy, pcz);

  // Force sendNearbyBlocks to enqueue chunk messages
  gs.sendNearbyBlocks(user.id, 8, 5, 8);

  // At this point sendQueue should have entries but player._awaitingHave should be true
  const player = gs.players.get(user.id);
  assert(player, 'player should exist');
  console.log('player._awaitingHave =', player._awaitingHave);
  if (!player._awaitingHave) throw new Error('Expected awaitingHave true after restore');

  // Simulate that client reports it already has seq 0 (none) - should clear nothing but start processing
  gs.handleClientChunkHave(user.id, []);

  // After calling handleClientChunkHave, send processing should proceed; emulate _processPlayerSendQueue run
  // _processPlayerSendQueue sends by calling player.ws.send
  // Our fakeWs captures sent buffers in fakeWs.sent
  // Wait a short while for async tick
  await new Promise(r => setTimeout(r, 100));

  // There should be at least 1 buffer sent
  console.log('sent buffers count:', fakeWs.sent.length);
  assert(fakeWs.sent.length > 0, 'Expected at least 1 chunk buffer to be sent after processing');

  console.log('reconnect/resume test passed');
}

run().then(() => { process.exit(0); }).catch(err => { console.error(err); process.exit(1); });
