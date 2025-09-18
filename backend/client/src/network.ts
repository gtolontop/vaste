import { ClientMessage, ServerMessage, GameState, getBlockKey } from './types';
import { User } from './services/auth.types';
import { logger } from './utils/logger';

// Lightweight unique id generator for action correlation (RFC4122 v4 style-ish)
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private gameState: GameState;
  private onStateUpdate: (state: GameState) => void;
  private onConnectionChange: (connected: boolean) => void;
  public onTeleport?: (x: number, y: number, z: number) => void;
  private authenticatedUser: User | null = null;

  constructor(
    onStateUpdate: (state: GameState) => void,
    onConnectionChange: (connected: boolean) => void,
    user?: User
  ) {
    this.gameState = {
      playerId: null,
      players: new Map(),
      blocks: new Map(),
      worldSize: 16,
      chunks: new Map(),
      chunkVersions: new Map(),
      connected: false,
      playerPosition: null
    };
    this.onStateUpdate = onStateUpdate;
    this.onConnectionChange = onConnectionChange;
    this.authenticatedUser = user || null;
  }

  // Queue for incremental block processing to avoid blocking the main thread
  private blocksProcessingQueue: Array<{ blocks: any[]; clearExisting?: boolean }> = [];
  private blocksProcessingRunning: boolean = false;
  // Per-chunk version counters to trigger chunk rebuilds only when necessary
  private chunkVersions: Map<string, number> = new Map();

  connect(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
          // Visible log for debugging connection lifecycle
          // eslint-disable-next-line no-console
          console.log('[CLIENT] WebSocket opened to', serverUrl);
          logger.info('[CLIENT] Connected to server');
          
          // Send authentication info with JWT token
          if (this.authenticatedUser) {
            // Get the token from localStorage
            const token = localStorage.getItem('vaste_token');
            
            this.sendMessage({
              type: 'auth_info',
              username: this.authenticatedUser.username,
              uuid: this.authenticatedUser.uuid,
              token: token
            } as any); // Temporaire jusqu'à ce qu'on mette à jour les types
            // after auth we will send chunk_have once server acknowledges auth and sends world_init
          }
          
          this.gameState.connected = true;
          this.onConnectionChange(true);
          resolve();
        };

        this.ws.onmessage = async (event) => {
          // eslint-disable-next-line no-console
          console.log('[CLIENT] WebSocket message received (type=', typeof event.data, ')');
          // If it's a string/text message, log the raw (truncated) payload and a compact summary for debugging
          if (typeof event.data === 'string') {
            try {
              // eslint-disable-next-line no-console
              console.log('[CLIENT] Raw text message preview:', event.data.substring ? event.data.substring(0, 1000) : String(event.data));
            } catch (e) {
              // ignore
            }
            try {
              const parsed = JSON.parse(event.data);
              // eslint-disable-next-line no-console
              console.log('[CLIENT] WebSocket text message type=', parsed.type, parsed.blocks ? `blocks=${(parsed.blocks||[]).length}` : '');
            } catch (e) {
              // eslint-disable-next-line no-console
              console.log('[CLIENT] WebSocket text message (non-json or parse failed)');
            }
          }
          try {
            // If the server sent a binary chunk message (ArrayBuffer), decode it
            if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
              const handleArrayBuffer = async (ab: ArrayBuffer) => {
                const dv = new DataView(ab);
                let off = 0;
                const msgType = dv.getUint8(off); off += 1;
                if (msgType === 1) { // CHUNK_INIT
                  const seq = dv.getUint32(off, true); off += 4;
                  const cx = dv.getInt32(off, true); off += 4;
                  const cy = dv.getInt32(off, true); off += 4;
                  const cz = dv.getInt32(off, true); off += 4;
                  const version = dv.getInt32(off, true); off += 4;
                  const entryCount = dv.getUint16(off, true); off += 2;
                  const blocks: any[] = [];
                  for (let i = 0; i < entryCount; i++) {
                    const idx = dv.getUint16(off, true); off += 2;
                    const type = dv.getUint16(off, true); off += 2;
                    // compute local x,y,z from idx (same ordering as server)
                    const x = idx % 16;
                    const tmp = Math.floor(idx / 16);
                    const z = tmp % 16;
                    const y = Math.floor(tmp / 16);
                    const wx = cx * 16 + x;
                    const wy = cy * 16 + y;
                    const wz = cz * 16 + z;
                    blocks.push({ x: wx, y: wy, z: wz, type });
                  }
                  // Enqueue blocks for processing (don't clear existing)
                  this.enqueueBlocksForProcessing(blocks, { clearExisting: false });
                    // Send ACK to server so it can slide its window
                    // eslint-disable-next-line no-console
                    console.log('[CLIENT] sending chunk_ack seq=', seq, ' for chunk', cx, cy, cz);
                  try {
                    const chunkKey = `${cx},${cy},${cz}:${version}:${seq}`;
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                      // persist applied seq
                      try {
                        const raw = localStorage.getItem('vaste_applied_chunk_seqs');
                        const set = raw ? JSON.parse(raw) : [];
                        if (!set.includes(seq)) {
                          set.push(seq);
                          localStorage.setItem('vaste_applied_chunk_seqs', JSON.stringify(set));
                        }
                      } catch (e) {}
                      this.ws.send(JSON.stringify({ type: 'chunk_ack', chunkKey, seq }));
                    }
                  } catch (e) {
                    // ignore
                  }
                  return;
                }
                // Unknown binary message: ignore for now
              };

              if (event.data instanceof Blob) {
                const ab = await event.data.arrayBuffer();
                handleArrayBuffer(ab);
              } else {
                handleArrayBuffer(event.data as ArrayBuffer);
              }
              return;
            }

            const message: ServerMessage = JSON.parse(event.data as string);
            this.handleServerMessage(message);
          } catch (error) {
            logger.error('[CLIENT] Error parsing server message:', error);
          }
        };

        this.ws.onclose = () => {
          // eslint-disable-next-line no-console
          console.log('[CLIENT] WebSocket closed');
          logger.info('[CLIENT] Disconnected from server');
          this.gameState.connected = false;
          this.onConnectionChange(false);
        };

        this.ws.onerror = (error) => {
          // eslint-disable-next-line no-console
          console.error('[CLIENT] WebSocket error observed:', error);
          logger.error('[CLIENT] WebSocket error:', error);
          this.gameState.connected = false;
          this.onConnectionChange(false);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendMessage(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      
      // Track player position locally
      if (message.type === 'player_move') {
        this.gameState.playerPosition = {
          x: message.x,
          y: message.y,
          z: message.z
        };
      }
    } else {
      logger.warn('[CLIENT] Cannot send message: not connected');
    }
  }

  // Send a block action (place/break) with optimistic update and an actionId for reconciliation
  sendBlockAction(message: ClientMessage & { actionId?: string }) {
  const actionId = (message as any).actionId || generateId();
    (message as any).actionId = actionId;

    // Apply optimistic update locally
    if (message.type === 'break_block') {
      const key = getBlockKey(message.x, message.y, message.z);
      // store previous block so we can rollback if needed
      const prev = this.gameState.blocks.get(key) || null;
      this.pendingActions.set(actionId, { type: 'break', key, prev });
      this.gameState.blocks.delete(key);
      // Update chunk map
      const cx = Math.floor(message.x / 16);
      const cy = Math.floor(message.y / 16);
      const cz = Math.floor(message.z / 16);
      const chunkKey = `${cx},${cy},${cz}`;
      const chunkMap = this.gameState.chunks.get(chunkKey);
      if (chunkMap) {
  // create a new Map instance to ensure React/consumers pick up the change
  const newMap = new Map(chunkMap);
  newMap.delete(key);
  this.gameState.chunks.set(chunkKey, newMap);
  const ver = this.chunkVersions.get(chunkKey) || 0;
  this.chunkVersions.set(chunkKey, ver + 1);
  this.gameState.chunkVersions = new Map(this.chunkVersions);
      }
      // Also bump neighbor chunks so face visibility in adjacent chunks updates
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nKey = `${cx + dx},${cy + dy},${cz + dz}`;
            const nv = this.chunkVersions.get(nKey) || 0;
            this.chunkVersions.set(nKey, nv + 1);
          }
        }
      }
      this.gameState.chunkVersions = new Map(this.chunkVersions);
      this.onStateUpdate({ ...this.gameState });
    } else if (message.type === 'place_block') {
      const key = getBlockKey(message.x, message.y, message.z);
      const prev = this.gameState.blocks.get(key) || null;
      this.pendingActions.set(actionId, { type: 'place', key, prev });
      this.gameState.blocks.set(key, {
        x: (message as any).x,
        y: (message as any).y,
        z: (message as any).z,
        type: (message as any).blockType || 1
      });
      // Update chunk map for optimistic placement
      const pcx = Math.floor((message as any).x / 16);
      const pcy = Math.floor((message as any).y / 16);
      const pcz = Math.floor((message as any).z / 16);
      const pChunkKey = `${pcx},${pcy},${pcz}`;
      const existing = this.gameState.chunks.get(pChunkKey) || new Map();
      const newChunkMap = new Map(existing);
      newChunkMap.set(key, {
        x: (message as any).x,
        y: (message as any).y,
        z: (message as any).z,
        type: (message as any).blockType || 1
      });
      this.gameState.chunks.set(pChunkKey, newChunkMap);
  const pVer = this.chunkVersions.get(pChunkKey) || 0;
  this.chunkVersions.set(pChunkKey, pVer + 1);
      // bump neighbors
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nKey = `${pcx + dx},${pcy + dy},${pcz + dz}`;
            const nv = this.chunkVersions.get(nKey) || 0;
            this.chunkVersions.set(nKey, nv + 1);
          }
        }
      }
  this.gameState.chunkVersions = new Map(this.chunkVersions);
      this.onStateUpdate({ ...this.gameState });
    }

    // Send to server
    this.sendMessage(message as ClientMessage);
    return actionId;
  }

  // Map of pending optimistic actions by actionId
  private pendingActions: Map<string, { type: 'break' | 'place'; key: string; prev: any }> = new Map();

  private handleServerMessage(message: ServerMessage) {
    switch (message.type) {
      case 'world_init':
        this.handleWorldInit(message);
        break;
      case 'chunks_update':
        this.handleChunksUpdate(message);
        break;
      case 'block_update':
        this.handleBlockUpdate(message);
        break;
      case 'block_action_result':
        this.handleBlockActionResult(message as any);
        break;
      case 'player_update':
        this.handlePlayerUpdate(message);
        break;
      case 'player_disconnect':
        this.handlePlayerDisconnect(message);
        break;
      case 'teleport':
        this.handleTeleport(message);
        break;
        default:
        logger.warn('[CLIENT] Unknown server message type:', (message as any).type);
    }
  }

  private handleWorldInit(message: any) {
  // visible debug
  // eslint-disable-next-line no-console
  console.log('[CLIENT] Received world_init from server; blocks=', (message.blocks || []).length);
  logger.info('[CLIENT] Received world initialization');
    this.gameState.playerId = message.playerId;
    this.gameState.worldSize = message.worldSize;
    // inform server about already-applied chunk seqs so server can avoid resending
    try {
      const raw = localStorage.getItem('vaste_applied_chunk_seqs');
      const seqs = raw ? JSON.parse(raw) : [];
      if (Array.isArray(seqs) && seqs.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'chunk_have', seqs } as any);
      }
    } catch (e) {}
    // Process blocks incrementally to avoid freezing the UI
    this.enqueueBlocksForProcessing(message.blocks || [], { clearExisting: true });
  }

  private handleChunksUpdate(message: any) {
  // visible debug
  // eslint-disable-next-line no-console
  console.log('[CLIENT] Received chunks_update; blocks=', (message.blocks || []).length);
  logger.info(`[CLIENT] Received chunks update with ${message.blocks.length} blocks`);
    // Enqueue chunk updates for incremental processing
    this.enqueueBlocksForProcessing(message.blocks || [], { clearExisting: false });
  }

  // Add blocks to the processing queue and start processing if not already running
  private enqueueBlocksForProcessing(blocks: any[], opts: { clearExisting?: boolean } = {}) {
    if (!Array.isArray(blocks) || blocks.length === 0) return;
    if (opts.clearExisting) {
      // Clear existing map immediately to avoid mixing states while we refill
      this.gameState.blocks.clear();
      this.onStateUpdate({ ...this.gameState });
    }

  logger.debug(`[CLIENT] Enqueueing ${blocks.length} blocks for incremental processing (clearExisting=${!!opts.clearExisting})`);
    this.blocksProcessingQueue.push({ blocks, clearExisting: !!opts.clearExisting });
    if (!this.blocksProcessingRunning) {
      this.blocksProcessingRunning = true;
      this.processBlocksQueue();
    }
  }

  // Process queued block arrays in small batches per animation frame
  private processBlocksQueue() {
    const BATCH_PER_FRAME = 512; // tuneable: number of blocks processed per frame

    const processNextItem = () => {
      const item = this.blocksProcessingQueue.shift();
      if (!item) {
        this.blocksProcessingRunning = false;
        return;
      }

      const blocks = item.blocks;
      let idx = 0;
      const total = blocks.length;

      const step = () => {
        const end = Math.min(idx + BATCH_PER_FRAME, total);
        for (; idx < end; idx++) {
          const block = blocks[idx];
          const key = getBlockKey(block.x, block.y, block.z);
          // Legacy flat map
          this.gameState.blocks.set(key, block);

          // Chunked storage
          const cx = Math.floor(block.x / 16);
          const cy = Math.floor(block.y / 16);
          const cz = Math.floor(block.z / 16);
          const chunkKey = `${cx},${cy},${cz}`;
          if (!this.gameState.chunks.has(chunkKey)) this.gameState.chunks.set(chunkKey, new Map());
          const chunkMap = this.gameState.chunks.get(chunkKey)!;
          chunkMap.set(key, block);
          // mark chunk version increased (we'll increase when batch completes to avoid thrashing)
        }

        // Notify UI of partial progress so meshes/visibility can update gradually
        this.onStateUpdate({ ...this.gameState });

        if (idx < total) {
          if (typeof window !== 'undefined' && (window as any).requestAnimationFrame) {
            (window as any).requestAnimationFrame(step);
          } else {
            setTimeout(step, 16);
          }
        } else {
          // Visible debug output so we can see processing progress in DevTools
          // eslint-disable-next-line no-console
          if (logger && (logger.debug || logger.info)) {
            // Gate the noisy per-4k-blocks processing message behind logger.debug
            if (logger.debug) {
              logger.debug(`[CLIENT] Finished incremental processing of ${total} blocks; chunks=${this.gameState.chunks.size}; blocks=${this.gameState.blocks.size}`);
            } else {
              // Fallback to info only if debug isn't available
              logger.info && logger.info(`[CLIENT] Finished incremental processing of ${total} blocks`);
            }
          } else {
            // As a final fallback, avoid using console.log here to prevent spam.
          }
          // Increase chunkVersions for chunks modified by this item so OptimizedWorld can rebuild
          // We'll scan the processed blocks to find their chunk keys
          const modifiedChunks = new Set<string>();
          for (const b of blocks) {
            const cx = Math.floor(b.x / 16);
            const cy = Math.floor(b.y / 16);
            const cz = Math.floor(b.z / 16);
            modifiedChunks.add(`${cx},${cy},${cz}`);
          }
          for (const ck of modifiedChunks) {
            const ver = this.chunkVersions.get(ck) || 0;
            this.chunkVersions.set(ck, ver + 1);
          }

          // Update public chunkVersions and notify UI of final state after finishing the item
          this.gameState.chunkVersions = new Map(this.chunkVersions);
          this.onStateUpdate({ ...this.gameState });

          // Finished this item, continue with next in queue after yielding
          setTimeout(processNextItem, 0);
        }
      };

      // Start processing this item
      if (typeof window !== 'undefined' && (window as any).requestAnimationFrame) {
        (window as any).requestAnimationFrame(step);
      } else {
        setTimeout(step, 0);
      }
    };

    // Kick off queue processing
    processNextItem();
  }

  private handleBlockUpdate(message: any) {
    const key = getBlockKey(message.x, message.y, message.z);
    
    if (message.action === 'break') {
      this.gameState.blocks.delete(key);
      // update chunk map (replace with new Map instance)
      const cx = Math.floor(message.x / 16);
      const cy = Math.floor(message.y / 16);
      const cz = Math.floor(message.z / 16);
      const chunkKey = `${cx},${cy},${cz}`;
      const cm = this.gameState.chunks.get(chunkKey);
      if (cm) {
  const newCm = new Map(cm);
  newCm.delete(key);
  this.gameState.chunks.set(chunkKey, newCm);
  const ver = this.chunkVersions.get(chunkKey) || 0;
  this.chunkVersions.set(chunkKey, ver + 1);
  this.gameState.chunkVersions = new Map(this.chunkVersions);
        // bump neighbors
        const [cx, cy, cz] = chunkKey.split(',').map(Number);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              const nKey = `${cx + dx},${cy + dy},${cz + dz}`;
              const nv = this.chunkVersions.get(nKey) || 0;
              this.chunkVersions.set(nKey, nv + 1);
            }
          }
        }
        this.gameState.chunkVersions = new Map(this.chunkVersions);
      }
  logger.info(`[CLIENT] Block broken at (${message.x}, ${message.y}, ${message.z})`);
    } else if (message.action === 'place') {
      this.gameState.blocks.set(key, {
        x: message.x,
        y: message.y,
        z: message.z,
        type: message.blockType || 1
      });
      // update chunk map
      const pcx = Math.floor(message.x / 16);
      const pcy = Math.floor(message.y / 16);
      const pcz = Math.floor(message.z / 16);
      const pChunkKey = `${pcx},${pcy},${pcz}`;
      const existing = this.gameState.chunks.get(pChunkKey) || new Map();
      const newMap = new Map(existing);
      newMap.set(key, { x: message.x, y: message.y, z: message.z, type: message.blockType || 1 });
      this.gameState.chunks.set(pChunkKey, newMap);
  const pVer = this.chunkVersions.get(pChunkKey) || 0; this.chunkVersions.set(pChunkKey, pVer + 1);
  // bump neighbors
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nKey = `${pcx + dx},${pcy + dy},${pcz + dz}`;
            const nv = this.chunkVersions.get(nKey) || 0;
            this.chunkVersions.set(nKey, nv + 1);
          }
        }
      }
      this.gameState.chunkVersions = new Map(this.chunkVersions);
  logger.info(`[CLIENT] Block placed at (${message.x}, ${message.y}, ${message.z})`);
    }

    this.onStateUpdate({ ...this.gameState });
  }

  private handleBlockActionResult(message: any) {
    const { actionId, success, reason } = message;
    if (!actionId) return;

    const pending = this.pendingActions.get(actionId);
    if (!pending) return; // might be old or already reconciled

    if (success) {
      // Server accepted: nothing to do, the block_update message from server will ensure consistency
      this.pendingActions.delete(actionId);
      logger.debug(`[CLIENT] Block action ${actionId} confirmed by server`);
    } else {
      // Server rejected: rollback optimistic change
      logger.warn(`[CLIENT] Block action ${actionId} rejected: ${reason}`);
      if (pending.type === 'break') {
        if (pending.prev) {
          this.gameState.blocks.set(pending.key, pending.prev);
          // restore to chunk map
          const coords = pending.key.split(',').map(Number);
          const rcx = Math.floor(coords[0] / 16);
          const rcy = Math.floor(coords[1] / 16);
          const rcz = Math.floor(coords[2] / 16);
          const rChunkKey = `${rcx},${rcy},${rcz}`;
          const existing = this.gameState.chunks.get(rChunkKey) || new Map();
          const newMap = new Map(existing);
          newMap.set(pending.key, pending.prev);
          this.gameState.chunks.set(rChunkKey, newMap);
          const rVer = this.chunkVersions.get(rChunkKey) || 0;
          this.chunkVersions.set(rChunkKey, rVer + 1);
          logger.debug(`[CLIENT][Network] bumped chunkVersion ${rChunkKey} -> ${rVer + 1}`);
          this.gameState.chunkVersions = new Map(this.chunkVersions);
        } else {
          this.gameState.blocks.delete(pending.key);
          // remove from chunk
          const coords = pending.key.split(',').map(Number);
          const rcx3 = Math.floor(coords[0] / 16);
          const rcy3 = Math.floor(coords[1] / 16);
          const rcz3 = Math.floor(coords[2] / 16);
          const rChunkKey3 = `${rcx3},${rcy3},${rcz3}`;
          const rcm3 = this.gameState.chunks.get(rChunkKey3);
          if (rcm3) {
            const newMap3 = new Map(rcm3);
            newMap3.delete(pending.key);
            this.gameState.chunks.set(rChunkKey3, newMap3);
            const rv3 = this.chunkVersions.get(rChunkKey3) || 0;
            this.chunkVersions.set(rChunkKey3, rv3 + 1);
            this.gameState.chunkVersions = new Map(this.chunkVersions);
          }
        }
      }
      this.pendingActions.delete(actionId);
      this.onStateUpdate({ ...this.gameState });
    }
  }

  private handlePlayerUpdate(message: any) {
    const existingPlayer = this.gameState.players.get(message.id);
    
    this.gameState.players.set(message.id, {
      id: message.id,
      x: message.x,
      y: message.y,
      z: message.z
    });

    if (!existingPlayer) {
      logger.info(`[CLIENT] Player ${message.id} joined`);
    }

    this.onStateUpdate({ ...this.gameState });
  }

  private handlePlayerDisconnect(message: any) {
    this.gameState.players.delete(message.id);
    logger.info(`[CLIENT] Player ${message.id} left`);
    this.onStateUpdate({ ...this.gameState });
  }

  private handleTeleport(message: any) {
    // Callback to update camera position (will be set by Game component)
    if (this.onTeleport) {
      this.onTeleport(message.x, message.y + 1.6, message.z); // +1.6 for eye level
    }
  }

  getGameState(): GameState {
    return { ...this.gameState };
  }
}
