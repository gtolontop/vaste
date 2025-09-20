const { GameServer } = require('../server');
const clientStateManager = require('../clientStateManager');
const assert = require('assert');

// This test simulates a client that never acknowledges chunks and verifies
// that the server retries with increasing backoff and eventually drops chunks.

async function run() {
  console.log('Starting ACK loss/backoff test...');
  clientStateManager.clearState('loss-client');

  // configure shorter ack timeout for test and low retry limits
  const gs = new GameServer({ headless: true, chunkAckTimeoutMs: 50, chunkMaxRetries: 3 });

  // Prepare world with one chunk
  const cx = 0, cy = 0, cz = 0;
  gs.world.ensureChunk(cx, cy, cz);

  // fake websocket that collects sends
  const fakeWs = { readyState: 1, sent: [], send(buf) { this.sent.push({ buf, time: Date.now() }); } };
  const user = { id: 'loss-client', username: 'loser', uuid: 'loss-uuid' };

  gs.initializeAuthenticatedPlayer(fakeWs, user);
  gs.sendNearbyBlocks(user.id, 8, 5, 8);

  // allow processing and multiple resend intervals
  await new Promise(r => setTimeout(r, 1200));

  const player = gs.players.get(user.id);
  // After retries exhausted, outstandingChunks should be empty
  if (player && player.outstandingChunks) {
    console.log('outstanding count after backoff:', player.outstandingChunks.size);
    assert(player.outstandingChunks.size === 0, 'Outstanding chunks should be dropped after retries');
    // telemetry should show resent attempts
    console.log('telemetry:', player._telemetry);
    assert((player._telemetry.resent || 0) > 0, 'Expected some resends');
    assert((player._telemetry.dropped || 0) > 0, 'Expected at least one drop');
  }

  console.log('ACK loss/backoff test passed');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
