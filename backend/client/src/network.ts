import { ClientMessage, ServerMessage, GameState, getBlockKey } from "./types";
import { User } from "./services/auth.types";
import { logger } from "./utils/logger";

// Lightweight unique id generator for action correlation (RFC4122 v4 style-ish)
function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  // Lazy worker for decoding binary chunk messages off the main thread
  private chunkProcessorWorker: Worker | null = null;
  // Map of seq -> callback to handle decoded chunk results from worker
  private chunkWorkerCallbacks: Map<number, (msg: any) => void> = new Map();
  // Map of requestId -> timestamp when buffer was posted to decode worker (for timing)
  private _chunkBufferTimes: Map<number, number> = new Map();
  // Batch structures to coalesce UI updates
  private pendingChunkKeys: Set<string> = new Set();
  private pendingChunkBlocks: Map<string, Map<string, any>> = new Map();
  // Note: avoid global per-block Map updates on chunk apply to minimize main-thread work.
  // Keep the global blocks map for small updates; but for full chunk swaps we only swap chunk Map.
  private scheduledUpdateHandle: number | null = null;
  private gameState: GameState;
  private onStateUpdate: (state: GameState) => void;
  private onConnectionChange: (connected: boolean) => void;
  public onTeleport?: (x: number, y: number, z: number) => void;
  private authenticatedUser: User | null = null;

  constructor(onStateUpdate: (state: GameState) => void, onConnectionChange: (connected: boolean) => void, user?: User) {
    this.gameState = {
      playerId: null,
      players: new Map(),
      blocks: new Map(),
      worldSize: 16,
      chunks: new Map(),
      chunkVersions: new Map(),
      connected: false,
      playerPosition: null,
    };
    this.onStateUpdate = onStateUpdate;
    this.onConnectionChange = onConnectionChange;
    this.authenticatedUser = user || null;
  }

  // Queue for incremental block processing to avoid blocking the main thread
  private blocksProcessingQueue: Array<{ blocks: any[]; clearExisting?: boolean }> = [];
  private blocksProcessingRunning: boolean = false;
  // Adaptive/time-budget processing parameters
  // start target blocks, will be tuned at runtime
  private _batchTargetBlocks: number = 4096;
  private _minBatchBlocks: number = 512;
  private _maxBatchBlocks: number = 16384;
  // per-frame time budget in ms (primary stop condition)
  private _timeBudgetMs: number = 6; // tuneable: aim for ~6ms work per frame
  // simple smoothing for adaptive adjustments (keeps last N samples)
  private _frameTimeSamples: number[] = [];
  private _frameSamplesKeep: number = 8;
  // Reusable temp structures to reduce allocations
  private _tmpChunkGroups: Map<string, any[]> | null = null;
  private _tmpChunkKeys: string[] | null = null;
  // Per-chunk version counters to trigger chunk rebuilds only when necessary
  private chunkVersions: Map<string, number> = new Map();
  // Track last-applied server-sent chunk version per chunk key to avoid applying older updates
  private lastAppliedServerChunkVersion: Map<string, number> = new Map();
  // Toggleable debug: set localStorage['vaste_debug_chunk_bumps'] = '1' to enable extra logs
  private debugChunkBumps: boolean = (() => {
    try {
      return localStorage.getItem("vaste_debug_chunk_bumps") === "1";
    } catch (e) {
      return false;
    }
  })();

  // Helper: increment version for a chunk and its 6 face-neighbor chunks.
  // We avoid bumping diagonal neighbors (3x3x3) because only face-adjacent
  // chunks can change face visibility for meshes. Bumping fewer chunks
  // reduces unnecessary rebuilds and prevents large-area flashing.
  private bumpChunkAndFaceNeighbors(cx: number, cy: number, cz: number) {
    const key = `${cx},${cy},${cz}`;
    const ver = this.chunkVersions.get(key) || 0;
    this.chunkVersions.set(key, ver + 1);
    if (this.debugChunkBumps) console.log(`[CLIENT][DEBUG] bump ${key} -> ${ver + 1}`);

    const faceDirs = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const d of faceDirs) {
      const nKey = `${cx + d[0]},${cy + d[1]},${cz + d[2]}`;
      const nv = this.chunkVersions.get(nKey) || 0;
      this.chunkVersions.set(nKey, nv + 1);
      if (this.debugChunkBumps) console.log(`[CLIENT][DEBUG] bump ${nKey} -> ${nv + 1}`);
    }
  }

  connect(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
          // Visible log for debugging connection lifecycle
          // eslint-disable-next-line no-console
          console.log("[CLIENT] WebSocket opened to", serverUrl);
          logger.info("[CLIENT] Connected to server");

          // Send authentication info with JWT token
          if (this.authenticatedUser) {
            // Get the token from localStorage
            const token = localStorage.getItem("vaste_token");

            this.sendMessage({
              type: "auth_info",
              username: this.authenticatedUser.username,
              uuid: this.authenticatedUser.uuid,
              token: token,
            } as any); // Temporaire jusqu'à ce qu'on mette à jour les types
            // after auth we will send chunk_have once server acknowledges auth and sends world_init
          }

          this.gameState.connected = true;
          this.onConnectionChange(true);
          resolve();
        };

        this.ws.onmessage = async (event) => {
          try {
            // If the server sent a binary chunk message (ArrayBuffer), decode it
            if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
              // Use a dedicated worker to decode and build sparse blocks list off the main thread
              const postBuffer = async (ab: ArrayBuffer) => {
                try {
                  if (!this.chunkProcessorWorker) {
                    // create a worker using Vite/webpack worker import path
                    try {
                      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                      // @ts-ignore
                      this.chunkProcessorWorker = new Worker(new URL("./workers/chunkProcessorWorker.ts", import.meta.url), { type: "module" } as any);
                    } catch (e) {
                      // fallback to classic Worker if bundler supports .js
                      try {
                        this.chunkProcessorWorker = new Worker("/src/workers/chunkProcessorWorker.js");
                      } catch (e2) {
                        this.chunkProcessorWorker = null;
                      }
                    }
                  }
                  if (!this.chunkProcessorWorker) {
                    // fallback to main-thread handling if worker creation failed
                    // convert Blob to ArrayBuffer if needed then fallthrough to JSON parsing
                    const ab2 = event.data instanceof Blob ? await event.data.arrayBuffer() : (event.data as ArrayBuffer);
                    // if worker unavailable, just ignore heavy binary: allow main-thread decoder as previous implementation
                    // To keep compatibility, attempt main-thread decode (rare path)
                    // -> reuse existing code path by creating a temporary DataView decode (kept minimal)
                    const dv = new DataView(ab2);
                    const msgType = dv.getUint8(0);
                    if (msgType === 1) {
                      // we cannot efficiently decode here; as a last resort, enqueue as empty chunk to avoid partial display
                      // (this case should be rare; recommend ensuring bundler supports module workers)
                    }
                    return;
                  }

                  const worker = this.chunkProcessorWorker;
                  // ensure global worker onmessage handler is installed once
                  if (worker && (worker as any)._installed !== true) {
                    (worker as any)._installed = true;
                    worker.onmessage = (evWorker: MessageEvent) => {
                      const d = evWorker.data as any;
                      if (!d) return;
                      if (d.type === "decoded") {
                        // callback key may be requestId (preferred) or seq (fallback for compatibility)
                        const key = d.requestId != null ? d.requestId : d.seq;
                        // If we recorded when this buffer was posted to the worker, compute transfer+decode timings
                        try {
                          const postedAt = this._chunkBufferTimes.get(key as number);
                          if (postedAt != null) {
                            this._chunkBufferTimes.delete(key as number);
                          }
                        } catch (e) {
                          /* swallow timing errors */
                        }
                        const cb = this.chunkWorkerCallbacks.get(key);
                        if (cb) {
                          try {
                            cb(d);
                          } catch (e) {
                            /* swallow */
                          }
                          this.chunkWorkerCallbacks.delete(key);
                        }
                      }
                    };
                  }
                  // Helper to post a single chunk buffer to the worker with a generated requestId
                  const postChunkToWorker = (chunkAb: ArrayBuffer) => {
                    const requestId = Math.floor(Math.random() * 0xffffffff);
                    // register callback keyed by requestId
                    const callback = (d: any) => {
                      const { seq, cx, cy, cz, version, indices, types } = d;
                      const chunkKey = `${cx},${cy},${cz}`;
                      // If we've already applied a chunk with equal or newer server version, ignore this stale payload
                      try {
                        const last = this.lastAppliedServerChunkVersion.get(chunkKey);
                        if (typeof version === 'number' && last != null && version <= last) {
                          return;
                        }
                      } catch (e) {}
                      // Build a Map for this chunk only (local indices -> world coords)
                      const newChunkMap = new Map<string, any>();
                      const idxArr = indices as Uint16Array;
                      const typesArr = types as Uint16Array;
                      for (let i = 0; i < idxArr.length; i++) {
                        const localIdx = idxArr[i];
                        const t = typesArr[i];
                        const x = localIdx % 16;
                        const tmp = Math.floor(localIdx / 16);
                        const z = tmp % 16;
                        const y = Math.floor(tmp / 16);
                        const wx = cx * 16 + x;
                        const wy = cy * 16 + y;
                        const wz = cz * 16 + z;
                        const key = getBlockKey(wx, wy, wz);
                        newChunkMap.set(key, { x: wx, y: wy, z: wz, type: t });
                      }

                      // Record applied server version for this chunk
                      try {
                        if (typeof version === 'number') this.lastAppliedServerChunkVersion.set(chunkKey, version);
                      } catch (e) {}

                      // Stash the per-chunk map for later atomic swap (no per-block global map writes)
                      this.pendingChunkBlocks.set(chunkKey, newChunkMap);
                      this.pendingChunkKeys.add(chunkKey);

                      // send ack now (no UI effect)
                      try {
                        const ackKey = `${cx},${cy},${cz}:${version}:${seq}`;
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                          try {
                            const raw = localStorage.getItem("vaste_applied_chunk_seqs");
                            const set = raw ? JSON.parse(raw) : [];
                            if (!set.includes(seq)) {
                              set.push(seq);
                              localStorage.setItem("vaste_applied_chunk_seqs", JSON.stringify(set));
                            }
                          } catch (e) {}
                          this.ws.send(JSON.stringify({ type: "chunk_ack", chunkKey: ackKey, seq }));
                        }
                      } catch (e) {}

                      // schedule a UI update on the next animation frame if not already scheduled
                      if (this.scheduledUpdateHandle == null) {
                        const scheduleFn = typeof window !== "undefined" && (window as any).requestAnimationFrame ? (fn: FrameRequestCallback) => (window as any).requestAnimationFrame(fn) : (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);
                        this.scheduledUpdateHandle = scheduleFn(() => {
                          try {
                            // Apply all pending chunk swaps
                            for (const ck of Array.from(this.pendingChunkKeys)) {
                              const cm = this.pendingChunkBlocks.get(ck);
                              if (!cm) continue;
                              // store chunk map for consumers that read chunk-level maps
                              this.gameState.chunks.set(ck, cm);
                              // Also update legacy per-block map for compatibility (outline, targeting, actions)
                              try {
                                for (const [bkey, bval] of cm.entries()) {
                                  this.gameState.blocks.set(bkey, bval);
                                }
                              } catch (e) {
                                /* swallow to avoid breaking render loop */
                              }
                            }
                            // bump chunkVersions for all modified chunks
                            for (const ck of Array.from(this.pendingChunkKeys)) {
                              const ver = this.chunkVersions.get(ck) || 0;
                              this.chunkVersions.set(ck, ver + 1);
                              const [cxStr, cyStr, czStr] = ck.split(",");
                              const cx = Number(cxStr),
                                cy = Number(cyStr),
                                cz = Number(czStr);
                              this.bumpChunkAndFaceNeighbors(cx, cy, cz);
                            }
                            this.gameState.chunkVersions = new Map(this.chunkVersions);

                            // clear pending structures
                            this.pendingChunkKeys.clear();
                            this.pendingChunkBlocks.clear();

                            // Fire a single state update for the UI
                            this.onStateUpdate({ ...this.gameState });
                          } finally {
                            this.scheduledUpdateHandle = null;
                          }
                        }) as any;
                      }
                    };
                    this.chunkWorkerCallbacks.set(requestId, callback);
                    // record posted timestamp and post the chunk buffer to worker (transfer)
                    try {
                      this._chunkBufferTimes.set(requestId, Date.now());
                      (worker as any).postMessage({ type: "decode", buffer: chunkAb, requestId }, [chunkAb]);
                    } catch (e) {
                      /* swallow */
                    }
                  };

                  // If the buffer is a CHUNK_BATCH envelope, split and post individual chunk buffers
                  const dvPeek = new DataView(ab);
                  const msgTypePeek = dvPeek.getUint8(0);
                  if (msgTypePeek === 2) {
                    // envelope format: uint8 msgType(2), uint32 count, then for each: uint32 len, <len bytes>
                    let off = 1;
                    const count = dvPeek.getUint32(off, true);
                    off += 4;
                    for (let i = 0; i < count; i++) {
                      const len = dvPeek.getUint32(off, true);
                      off += 4;
                      const chunkAb = ab.slice(off, off + len);
                      off += len;
                      postChunkToWorker(chunkAb);
                    }
                    return;
                  }

                  // Create callback that will enqueue chunk data into batching structures (for single CHUNK_FULL)
                  const callback = (d: any) => {
                    const { seq, cx, cy, cz, version, indices, types } = d;
                    const chunkKey = `${cx},${cy},${cz}`;
                    // If we've already applied a chunk with equal or newer server version, ignore this stale payload
                    try {
                      const last = this.lastAppliedServerChunkVersion.get(chunkKey);
                      if (typeof version === 'number' && last != null && version <= last) {
                        return;
                      }
                    } catch (e) {}
                    // Build a Map for this chunk only (local indices -> world coords)
                    const newChunkMap = new Map<string, any>();
                    const idxArr = indices as Uint16Array;
                    const typesArr = types as Uint16Array;
                    for (let i = 0; i < idxArr.length; i++) {
                      const localIdx = idxArr[i];
                      const t = typesArr[i];
                      const x = localIdx % 16;
                      const tmp = Math.floor(localIdx / 16);
                      const z = tmp % 16;
                      const y = Math.floor(tmp / 16);
                      const wx = cx * 16 + x;
                      const wy = cy * 16 + y;
                      const wz = cz * 16 + z;
                      const key = getBlockKey(wx, wy, wz);
                      newChunkMap.set(key, { x: wx, y: wy, z: wz, type: t });
                    }

                    // Record applied server version for this chunk
                    try {
                      if (typeof version === 'number') this.lastAppliedServerChunkVersion.set(chunkKey, version);
                    } catch (e) {}

                    // Stash the per-chunk map for later atomic swap (no per-block global map writes)
                    this.pendingChunkBlocks.set(chunkKey, newChunkMap);
                    this.pendingChunkKeys.add(chunkKey);

                    // send ack now (no UI effect)
                    try {
                      const ackKey = `${cx},${cy},${cz}:${version}:${seq}`;
                      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        try {
                          const raw = localStorage.getItem("vaste_applied_chunk_seqs");
                          const set = raw ? JSON.parse(raw) : [];
                          if (!set.includes(seq)) {
                            set.push(seq);
                            localStorage.setItem("vaste_applied_chunk_seqs", JSON.stringify(set));
                          }
                        } catch (e) {}
                        this.ws.send(JSON.stringify({ type: "chunk_ack", chunkKey: ackKey, seq }));
                      }
                    } catch (e) {}

                    // schedule a UI update on the next animation frame if not already scheduled
                    if (this.scheduledUpdateHandle == null) {
                      const scheduleFn = typeof window !== "undefined" && (window as any).requestAnimationFrame ? (fn: FrameRequestCallback) => (window as any).requestAnimationFrame(fn) : (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);
                      this.scheduledUpdateHandle = scheduleFn(() => {
                        try {
                          // Apply all pending chunk swaps
                          for (const ck of Array.from(this.pendingChunkKeys)) {
                            const cm = this.pendingChunkBlocks.get(ck);
                            if (cm) this.gameState.chunks.set(ck, cm);
                          }
                          // We avoid applying per-block global map updates for full chunk swaps to reduce main-thread work.
                          // If you rely on `gameState.blocks` for specific features, consider updating them lazily on demand.
                          // bump chunkVersions for all modified chunks
                          for (const ck of Array.from(this.pendingChunkKeys)) {
                            const ver = this.chunkVersions.get(ck) || 0;
                            this.chunkVersions.set(ck, ver + 1);
                            const [cxStr, cyStr, czStr] = ck.split(",");
                            const cx = Number(cxStr),
                              cy = Number(cyStr),
                              cz = Number(czStr);
                            this.bumpChunkAndFaceNeighbors(cx, cy, cz);
                          }
                          this.gameState.chunkVersions = new Map(this.chunkVersions);

                          // clear pending structures
                          this.pendingChunkKeys.clear();
                          this.pendingChunkBlocks.clear();

                          // Fire a single state update for the UI
                          this.onStateUpdate({ ...this.gameState });
                        } finally {
                          this.scheduledUpdateHandle = null;
                        }
                      }) as any;
                    }
                  };

                  // register callback keyed by a unique requestId and include it in the posted message (worker will echo it back)
                  const requestId = Math.floor(Math.random() * 0xffffffff);
                  this.chunkWorkerCallbacks.set(requestId, callback);
                  // Record posted timestamp and post buffer transferable to worker with requestId
                  try {
                    this._chunkBufferTimes.set(requestId, Date.now());
                    worker.postMessage({ type: "decode", buffer: ab, requestId }, [ab]);
                  } catch (e) {
                    /* swallow */
                  }
                } catch (e) {
                  // swallow worker errors to avoid noisy logs in client
                }
              };

              if (event.data instanceof Blob) {
                const ab = await event.data.arrayBuffer();
                await postBuffer(ab);
              } else {
                await postBuffer(event.data as ArrayBuffer);
              }
              return;
            }

            const message: ServerMessage = JSON.parse(event.data as string);
            this.handleServerMessage(message);
          } catch (error) {
            logger.error("[CLIENT] Error parsing server message:", error);
          }
        };

        this.ws.onclose = () => {
          // eslint-disable-next-line no-console
          console.log("[CLIENT] WebSocket closed");
          logger.info("[CLIENT] Disconnected from server");
          this.gameState.connected = false;
          this.onConnectionChange(false);
        };

        this.ws.onerror = (error) => {
          // eslint-disable-next-line no-console
          console.error("[CLIENT] WebSocket error observed:", error);
          logger.error("[CLIENT] WebSocket error:", error);
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
      if (message.type === "player_move") {
        this.gameState.playerPosition = {
          x: message.x,
          y: message.y,
          z: message.z,
        };
      }
    } else {
      logger.warn("[CLIENT] Cannot send message: not connected");
    }
  }

  // Send a block action (place/break) with optimistic update and an actionId for reconciliation
  sendBlockAction(message: ClientMessage & { actionId?: string }) {
    const actionId = (message as any).actionId || generateId();
    (message as any).actionId = actionId;

    // Apply optimistic update locally
    if (message.type === "break_block") {
      const key = getBlockKey(message.x, message.y, message.z);
      // store previous block so we can rollback if needed
      const prev = this.gameState.blocks.get(key) || null;
      this.pendingActions.set(actionId, { type: "break", key, prev });
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
      // Bump only the chunk and its face-adjacent neighbors (6 neighbors).
      this.bumpChunkAndFaceNeighbors(cx, cy, cz);
      this.gameState.chunkVersions = new Map(this.chunkVersions);
      this.onStateUpdate({ ...this.gameState });
    } else if (message.type === "place_block") {
      const key = getBlockKey(message.x, message.y, message.z);
      const prev = this.gameState.blocks.get(key) || null;
      this.pendingActions.set(actionId, { type: "place", key, prev });
      this.gameState.blocks.set(key, {
        x: (message as any).x,
        y: (message as any).y,
        z: (message as any).z,
        type: (message as any).blockType || 1,
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
        type: (message as any).blockType || 1,
      });
      this.gameState.chunks.set(pChunkKey, newChunkMap);
      const pVer = this.chunkVersions.get(pChunkKey) || 0;
      this.chunkVersions.set(pChunkKey, pVer + 1);
      // Bump only the chunk and its face-adjacent neighbors (6 neighbors).
      this.bumpChunkAndFaceNeighbors(pcx, pcy, pcz);
      this.gameState.chunkVersions = new Map(this.chunkVersions);
      this.onStateUpdate({ ...this.gameState });
    }

    // Send to server
    this.sendMessage(message as ClientMessage);
    return actionId;
  }

  // Map of pending optimistic actions by actionId
  private pendingActions: Map<string, { type: "break" | "place"; key: string; prev: any }> = new Map();

  private handleServerMessage(message: ServerMessage) {
    switch (message.type) {
      case "world_init":
        this.handleWorldInit(message);
        break;
      case "chunks_update":
        this.handleChunksUpdate(message);
        break;
      case "block_update":
        this.handleBlockUpdate(message);
        break;
      case "block_action_result":
        this.handleBlockActionResult(message as any);
        break;
      case "player_update":
        this.handlePlayerUpdate(message);
        break;
      case "player_disconnect":
        this.handlePlayerDisconnect(message);
        break;
      case "teleport":
        this.handleTeleport(message);
        break;
      default:
        logger.warn("[CLIENT] Unknown server message type:", (message as any).type);
    }
  }

  private handleWorldInit(message: any) {
    // visible debug
    // eslint-disable-next-line no-console
    console.log("[CLIENT] Received world_init from server; blocks=", (message.blocks || []).length);
    logger.info("[CLIENT] Received world initialization");
    this.gameState.playerId = message.playerId;
    this.gameState.worldSize = message.worldSize;
    // inform server about already-applied chunk seqs so server can avoid resending
    try {
      const raw = localStorage.getItem("vaste_applied_chunk_seqs");
      const seqs = raw ? JSON.parse(raw) : [];
      if (Array.isArray(seqs) && seqs.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: "chunk_have", seqs } as any);
      }
    } catch (e) {}
    // Process blocks incrementally to avoid freezing the UI
    this.enqueueBlocksForProcessing(message.blocks || [], { clearExisting: true });
  }

  private handleChunksUpdate(message: any) {
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
    this.blocksProcessingQueue.push({ blocks, clearExisting: !!opts.clearExisting });
    if (!this.blocksProcessingRunning) {
      this.blocksProcessingRunning = true;
      this.processBlocksQueue();
    }
  }

  // Process queued block arrays using a time-budget per animation frame and adaptive sizing.
  // Strategy:
  // - Primary stop condition: elapsed time >= _timeBudgetMs (ms)
  // - Secondary cap: _batchTargetBlocks (starts at 4096 and adapts based on observed frame times)
  // - Prioritize chunks close to the player's camera to improve perceived load time
  // - Reuse temporary structures to avoid allocations
  private processBlocksQueue() {
    const now = typeof performance !== "undefined" && performance.now ? () => performance.now() : () => Date.now();

    const processNextItem = () => {
      const item = this.blocksProcessingQueue.shift();
      if (!item) {
        this.blocksProcessingRunning = false;
        return;
      }

      const blocks = item.blocks;
      if (!Array.isArray(blocks) || blocks.length === 0) {
        // nothing to do, continue
        setTimeout(processNextItem, 0);
        return;
      }

      // Reuse or create temp grouping structures
      let chunkGroups = this._tmpChunkGroups;
      let chunkKeys = this._tmpChunkKeys;
      if (!chunkGroups) {
        chunkGroups = new Map<string, any[]>();
        this._tmpChunkGroups = chunkGroups;
      } else {
        chunkGroups.clear();
      }
      if (!chunkKeys) {
        chunkKeys = [];
        this._tmpChunkKeys = chunkKeys;
      } else {
        chunkKeys.length = 0;
      }

      // Group blocks by chunk to allow prioritization and batch apply (minimize Map swaps)
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const cx = Math.floor(b.x / 16);
        const cy = Math.floor(b.y / 16);
        const cz = Math.floor(b.z / 16);
        const ck = `${cx},${cy},${cz}`;
        let arr = chunkGroups.get(ck);
        if (!arr) {
          arr = [];
          chunkGroups.set(ck, arr);
          chunkKeys.push(ck);
        }
        arr.push(b);
      }

      // Compute distances for prioritization (closest chunks first)
      const playerPos = this.gameState.playerPosition;
      const distances: { key: string; d2: number }[] = [];
      if (playerPos) {
        for (const ck of chunkKeys) {
          const [cxStr, cyStr, czStr] = ck.split(",");
          const cx = Number(cxStr), cy = Number(cyStr), cz = Number(czStr);
          // chunk center (approx)
          const centerX = cx * 16 + 8;
          const centerY = cy * 16 + 8;
          const centerZ = cz * 16 + 8;
          const dx = centerX - playerPos.x;
          const dy = centerY - playerPos.y;
          const dz = centerZ - playerPos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          distances.push({ key: ck, d2 });
        }
        distances.sort((a, b) => a.d2 - b.d2);
      } else {
        // no player position: keep original order
        for (const ck of chunkKeys) distances.push({ key: ck, d2: 0 });
      }

      // Processing loop: iterate chunk groups in priority order and apply blocks until budget or cap reached
      let processed = 0;
      const start = now();
      const timeBudget = this._timeBudgetMs;
      const batchCap = Math.max(this._minBatchBlocks, Math.min(this._batchTargetBlocks, this._maxBatchBlocks));

      for (let i = 0; i < distances.length; i++) {
        const ck = distances[i].key;
        const arr = chunkGroups.get(ck)!;
        // Ensure chunk map exists once per chunk and reuse when applying
        let chunkMap = this.gameState.chunks.get(ck);
        if (!chunkMap) {
          chunkMap = new Map<string, any>();
          this.gameState.chunks.set(ck, chunkMap);
        }

        for (let j = 0; j < arr.length; j++) {
          const block = arr[j];
          const key = getBlockKey(block.x, block.y, block.z);
          // Legacy flat map
          this.gameState.blocks.set(key, block);
          // Chunked storage: reuse chunkMap reference
          chunkMap.set(key, block);
          processed++;

          // Stop conditions: time budget or cap
          const elapsed = now() - start;
          if (elapsed >= timeBudget || processed >= batchCap) {
            break;
          }
        }

        // Early break if budget/cap reached
        const elapsedTop = now() - start;
        if (elapsedTop >= timeBudget || processed >= batchCap) break;
      }

      // Notify UI of partial progress so meshes/visibility can update gradually
      this.onStateUpdate({ ...this.gameState });

      // Update chunk versions for modified chunks
      for (const ck of chunkKeys) {
        const ver = this.chunkVersions.get(ck) || 0;
        this.chunkVersions.set(ck, ver + 1);
      }
      this.gameState.chunkVersions = new Map(this.chunkVersions);

      // Record frame time sample for adaptive tuning
      const frameMs = now() - start;
      this._frameTimeSamples.push(frameMs);
      if (this._frameTimeSamples.length > this._frameSamplesKeep) this._frameTimeSamples.shift();

      // Adaptive adjustments: simple heuristic
      const avg = this._frameTimeSamples.reduce((a, b) => a + b, 0) / this._frameTimeSamples.length;
      if (avg > 12) {
        // too slow, reduce target
        this._batchTargetBlocks = Math.max(this._minBatchBlocks, Math.floor(this._batchTargetBlocks * 0.8));
      } else if (avg < 4) {
        // under-utilized, increase a bit
        this._batchTargetBlocks = Math.min(this._maxBatchBlocks, Math.ceil(this._batchTargetBlocks * 1.1));
      }

      // If there are still blocks left in this item, requeue the remainder at front and yield
      const remaining = blocks.length - processed;
      if (remaining > 0) {
        // Build remainder array and unshift back to queue to continue next frame
        const rem = blocks.slice(processed);
        // Put remainder back to front of queue
        this.blocksProcessingQueue.unshift({ blocks: rem, clearExisting: false });
        // Schedule next step on next animation frame (yield)
        if (typeof window !== "undefined" && (window as any).requestAnimationFrame) {
          (window as any).requestAnimationFrame(() => processNextItem());
        } else {
          setTimeout(processNextItem, 16);
        }
      } else {
        // Finished this item, continue with next in queue after yielding
        setTimeout(processNextItem, 0);
      }
    };

    // Kick off processing
    processNextItem();
  }

  private handleBlockUpdate(message: any) {
    const key = getBlockKey(message.x, message.y, message.z);

    if (message.action === "break") {
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
        // bump only face-adjacent neighbors
        {
          const [ccx, ccy, ccz] = chunkKey.split(",").map(Number);
          this.bumpChunkAndFaceNeighbors(ccx, ccy, ccz);
          this.gameState.chunkVersions = new Map(this.chunkVersions);
        }
      }
      logger.info(`[CLIENT] Block broken at (${message.x}, ${message.y}, ${message.z})`);
    } else if (message.action === "place") {
      this.gameState.blocks.set(key, {
        x: message.x,
        y: message.y,
        z: message.z,
        type: message.blockType || 1,
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
      const pVer = this.chunkVersions.get(pChunkKey) || 0;
      this.chunkVersions.set(pChunkKey, pVer + 1);
      // bump neighbors
      this.bumpChunkAndFaceNeighbors(pcx, pcy, pcz);
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
      if (pending.type === "break") {
        if (pending.prev) {
          this.gameState.blocks.set(pending.key, pending.prev);
          // restore to chunk map
          const coords = pending.key.split(",").map(Number);
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
          const coords = pending.key.split(",").map(Number);
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
      z: message.z,
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
