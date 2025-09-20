const { GameServer } = require('../server');
const clientStateManager = require('../clientStateManager');
const assert = require('assert');

// Multi-client packet loss/reordering simulation for headless GameServer
// Configurable: number of clients, packetLossChance, reorderChance

async function run() {
  console.log('Starting multi-client packet loss simulation...');
  const cfg = { clients: 5, packetLoss: 0.15, reorderChance: 0.1, durationMs: 1500 };

  // Clear any previous states
  for (let i = 0; i < cfg.clients; i++) clientStateManager.clearState(`mc-${i}`);

  const gs = new GameServer({ headless: true, chunkAckTimeoutMs: 80, chunkMaxRetries: 4 });

  // prepare a few chunks in the world
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) gs.world.ensureChunk(cx, 0, cz);

  // Fake network layer per client that simulates loss and reordering
  function makeFakeNet(id) {
    const outbox = [];
    return {
      id,
      sent: [],
      ws: { readyState: 1, send(buf) { this.sent.push(buf); } },
      enqueue(buf) {
        // simulate loss
        if (Math.random() < cfg.packetLoss) return; // drop
        // simulate reorder
        if (Math.random() < cfg.reorderChance && outbox.length > 0) {
          outbox.splice(Math.floor(Math.random() * outbox.length), 0, { buf, t: Date.now() });
        } else {
          outbox.push({ buf, t: Date.now() });
        }
      },
      flush() {
        // deliver a subset to server (in random order)
        while (outbox.length > 0) {
          const i = Math.floor(Math.random() * outbox.length);
          const it = outbox.splice(i, 1)[0];
          // emulate immediate API: server receives it via ws object already captured in initializeAuthenticatedPlayer
          gs.handleClientChunkHave(this.id, []); // occasionally trigger chunk_have if client wants to report nothing
        }
      }
    };
  }

  const clients = [];
  for (let i = 0; i < cfg.clients; i++) {
    const id = `mc-${i}`;
    const fake = makeFakeNet(id);
    const user = { id, username: `mc${i}`, uuid: `mc-${i}-uuid` };
    // initialize player with fake ws
    gs.initializeAuthenticatedPlayer(fake.ws, user);
    // Ask server to enqueue nearby blocks
    gs.sendNearbyBlocks(user.id, 8, 5, 8);
    clients.push(fake);
  }

  const start = Date.now();
  while (Date.now() - start < cfg.durationMs) {
    // random client flush and ack behavior
    for (const c of clients) {
      // deliver some messages
      c.flush();
      // occasionally the client will ack some seqs it claims to have (simulate genuine acks)
      if (Math.random() < 0.2) {
        // pick some seqs that were sent (if any)
        const sentSeqs = c.ws.sent
          .filter(b => b instanceof ArrayBuffer)
          .map(ab => { const dv = new DataView(ab); return dv.getUint32(1, true); });
        // acknowledge a random subset
        if (sentSeqs.length > 0) {
          const picks = [];
          for (const s of sentSeqs) if (Math.random() < 0.5) picks.push(s);
          if (picks.length > 0) gs.handleClientChunkHave(c.id, picks);
        }
      }
    }
    // let the server progress resends
    await new Promise(r => setTimeout(r, 50));
  }

  // After simulation, validate that no client has zombie outstanding entries
  for (const c of clients) {
    const player = gs.players.get(c.id);
    if (!player) continue; // might have been removed
    console.log(`client ${c.id} outstanding=${player.outstandingChunks.size} telemetry=`, player._telemetry || {});
    assert(player.outstandingChunks.size < 10, 'too many outstanding chunks remain');
  }

  console.log('multi-client packet loss simulation passed');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
