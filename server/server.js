const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { VasteModSystem } = require("./VasteModSystem");
const { ChunkStore, CHUNK_SIZE } = require("./world/ChunkStore");
const { ChunkWorkerPool } = require("./world/chunkWorkerPool");
const clientStateManager = require("./clientStateManager");
const { SerializeWorkerPool } = require("./world/serializeWorkerPool");

const PORT = process.env.PORT || 25565;
const CHUNK_ACK_TIMEOUT_MS = 5000; // default resend if not acked within 5s
const CHUNK_MAX_RETRIES = 5; // default max retries before drop

// Logging utility
function log(message, level = "INFO") {
  const timestamp = new Date().toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  console.log(`[VASTE] ${timestamp} ${level}: ${message}`);
}

// ASCII Art for VASTE
function showVasteAscii() {
  console.log(`
 ██╗   ██╗ █████╗ ███████╗████████╗███████╗
 ██║   ██║██╔══██╗██╔════╝╚══██╔══╝██╔════╝
 ██║   ██║███████║███████╗   ██║   █████╗  
 ╚██╗ ██╔╝██╔══██║╚════██║   ██║   ██╔══╝  
  ╚████╔╝ ██║  ██║███████║   ██║   ███████╗
   ╚═══╝  ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝
    `);
}

// Backend configuration (hardcoded)
const BACKEND_HOST = "localhost";
const BACKEND_PORT = 8080;
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

// License configuration
const CONFIG_FILE = path.join(__dirname, "server-config.json");
let SERVER_CONFIG = {};

// Load server configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      SERVER_CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } else {
      log("server-config.json not found! Please create it with your license key.", "ERROR");
      log("Example configuration:", "INFO");
      console.log(
        JSON.stringify(
          {
            license_key: "vaste_your_license_key_here",
            max_players: 20,
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  } catch (error) {
    log(`Error loading configuration: ${error.message}`, "ERROR");
    process.exit(1);
  }
}

// Validate license with backend
async function validateLicense() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      license_key: SERVER_CONFIG.license_key,
    });

    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: "/api/game-servers/validate-license",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    };

    const req = http.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const result = JSON.parse(responseData);
          if (res.statusCode === 200 && result.valid) {
            resolve(result);
          } else {
            reject(new Error(result.error || "License validation failed"));
          }
        } catch (error) {
          reject(new Error("Invalid response from backend"));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Cannot connect to backend: ${error.message}`));
    });

    req.write(data);
    req.end();
  });
}

// Send heartbeat to backend
async function sendHeartbeat(playerCount) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      license_key: SERVER_CONFIG.license_key,
      current_players: playerCount,
    });

    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: "/api/game-servers/heartbeat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    };

    const req = http.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error("Heartbeat failed"));
        }
      });
    });

    req.on("error", (error) => {
      // Don't crash on heartbeat errors, just log them
      log(`Heartbeat failed: ${error.message}`, "WARN");
      resolve();
    });

    req.write(data);
    req.end();
  });
}

// Validate user token with backend
async function validateUserToken(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: "/api/auth/verify",
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const result = JSON.parse(responseData);
          if (res.statusCode === 200 && result.success && result.data && result.data.user) {
            resolve(result.data.user);
          } else {
            reject(new Error(result.message || "Token validation failed"));
          }
        } catch (error) {
          reject(new Error("Invalid response from backend"));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Cannot validate token with backend: ${error.message}`));
    });

    req.end();
  });
}

// Synchronize server settings with backend
async function syncServerSettings() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      license_key: SERVER_CONFIG.license_key,
      max_players: SERVER_CONFIG.max_players,
      current_players: 0,
    });

    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: "/api/game-servers/sync-settings",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    };

    const req = http.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const result = JSON.parse(responseData);
          if (res.statusCode === 200) {
            resolve(result);
          } else {
            reject(new Error(result.error || "Settings synchronization failed"));
          }
        } catch (error) {
          reject(new Error("Invalid response from backend"));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Cannot sync with backend: ${error.message}`));
    });

    req.write(data);
    req.end();
  });
}

// Use chunked store for large-world support

// Game server
class GameServer {
  constructor(options = {}) {
    this.players = new Map();
    // By default create a simple in-memory ChunkStore (tests and simple servers expect a world).
    // To opt-out, set options.defaultWorld = 'none'. To explicitly request chunkstore set to 'chunkstore'.
    this.world = null;
    if (!options || options.defaultWorld !== "none") {
      this._chunkWorkerPool = new ChunkWorkerPool(options && options.workerPoolSize ? options.workerPoolSize : undefined);
      this.world = new ChunkStore({ workerPool: this._chunkWorkerPool, maxChunks: options && options.maxChunks ? options.maxChunks : undefined });
      log("Created default in-memory ChunkStore");
    }
    this._nextChunkSequence = 1; // global incrementing sequence for chunk messages
    // Optional serialize worker pool for parallel chunk serialization
    this._serializePool = new SerializeWorkerPool(Math.max(1, options.serializePoolSize || Math.max(1, require("os").cpus().length - 2)));

    this.options = options || {};
    // Allow enabling debug timing logs via environment variable for easier diagnostics
    try {
      if (process && process.env && process.env.VASTE_DEBUG_TIMINGS === "1") {
        this.options.debugTimings = true;
        log("Debug timings enabled via VASTE_DEBUG_TIMINGS env var", "INFO");
      }
    } catch (e) {}
    // initialization promise: resolved when initializeServer completes (success or failure)
    this._initialized = false;
    this._initResolve = null;
    this._initPromise = new Promise((resolve) => {
      this._initResolve = resolve;
    });
    // Provide a log method so subsystems (mods) can route logs through the server logger
    this.log = (msg, level) => log(msg, level);
    // Initialize modding system lazily; in headless mode we may skip mod loading
    this.modSystem = new VasteModSystem(this);

    // In headless/test mode we avoid creating the WebSocket server to prevent port binding
    if (!this.options.headless) {
      this.wss = new WebSocket.Server({ port: PORT });
      this.wss.on("listening", () => log(`WebSocket server listening on port ${PORT}`));
      this.wss.on("error", (err) => log(`WebSocket server error: ${err.message}`, "ERROR"));
      log(`Vaste server started on port ${PORT}`);
      this.initializeServer();
    } else {
      // For headless mode, still initialize minimal server internals but skip network & external calls
      this.wss = null;
      // Do not auto-run initializeServer (it performs mod loading and backend license validation)
    }
  }

  async initializeServer() {
    try {
      log("Loading mods...");
      await this.modSystem.loadMods();

      const loadedMods = this.modSystem.getLoadedMods();
      if (loadedMods.length > 0) {
        log(`Loaded ${loadedMods.length} mods:`);
        loadedMods.forEach((mod) => {
          log(`  - ${mod.name} v${mod.version} by ${mod.author}`);
        });
        // If a mod created or loaded an active world, prefer it as the server world
        try {
          const activeModWorld = this.modSystem.worldManager && this.modSystem.worldManager.getActiveWorld && this.modSystem.worldManager.getActiveWorld();
          if (activeModWorld && typeof activeModWorld.getBlocksInRange === "function") {
            this.world = activeModWorld;
            log("Using mod-provided active world as server world");
          } else {
            log("No mod-provided active world found after loading mods");
            if (!this.world) log("Server currently has no active world; no terrain will be generated until a mod creates/loads a world");
          }
        } catch (e) {
          // ignore if world manager not accessible or other errors
        }
      } else {
        log("No mods loaded");
        if (!this.world) log("Server currently has no active world; no terrain will be generated until a mod creates/loads a world");
      }

      this.setupWebSocketServer();
      // mark initialized successfully (mods loaded and server ready)
      this._initialized = true;
      if (this._initResolve) this._initResolve(true);
    } catch (error) {
      log(`Error initializing server: ${error.message}`, "ERROR");
      this.setupWebSocketServer(); // Continue without mods
      // still mark as initialized to avoid blocking connections forever
      this._initialized = true;
      if (this._initResolve) this._initResolve(false);
    }
  }

  async handleAuthentication(ws, message, tempConnectionId, authTimeout) {
    try {
      const { token } = message;

      // Token is MANDATORY - no fallback allowed for security
      if (!token) {
        throw new Error("Authentication token is required");
      }

      // Validate token with backend - this is the ONLY source of truth
      const user = await validateUserToken(token);

      // Additional security: verify the user data is valid
      if (!user || !user.id || !user.username) {
        throw new Error("Invalid user data received from backend");
      }

      log(`User authenticated: ${user.username} (ID: ${user.id})`);

      // Clear auth timeout
      if (authTimeout) clearTimeout(authTimeout);

      return user;
    } catch (error) {
      throw error;
    }
  }

  async initializeAuthenticatedPlayer(ws, user) {
    // Initialize player with authenticated user data
    const player = {
      id: user.id,
      username: user.username,
      uuid: user.uuid,
      x: 8, // Default center of world
      y: 5,
      z: 8,
      ws: ws,
    };

    this.players.set(user.id, player);
    log(`Player ${user.username} (ID: ${user.id}) connected. Total players: ${this.players.size}`);

    // Trigger mod system player join event
    this.modSystem.onPlayerJoin(player);

    // Get world state from mod system or fallback to default
    const modWorldState = this.modSystem.getWorldState();
    // If there's no active world (mods expected to create/load one), avoid generating chunks
    if (!this.world && !modWorldState) {
      log("No active world available; sending empty world_init to player");
      this.sendBlocksInBatches(user.id, [], "world_init", { playerId: user.id, worldSize: null });
      // Initialize per-player structures and return early
      player.sendQueue = [];
      player.outstandingChunks = new Map();
      player.maxOutstanding = 128; // tuneable: how many chunk buffers can be outstanding per client
      player.sending = false;
      player._awaitingHave = true;
      player._telemetry = { sent: 0, resent: 0, dropped: 0 };
      return;
    }

    const worldSize = this.world ? this.world.getWorldSize() : modWorldState && modWorldState.worldSize ? modWorldState.worldSize : null;

    // Initialize per-player structures early so sendNearbyBlocks can safely enqueue buffers
    // outstandingChunks: Map<chunkKey, { buffer: ArrayBuffer, lastSent: number, retries: number }>
    player.sendQueue = []; // array of {chunkKey, buffer}
    player.outstandingChunks = new Map();
    player.maxOutstanding = 128; // tuneable: how many chunk buffers can be outstanding per client
    player.sending = false;
    // When restoring state, don't aggressively resend until client tells us what it already has
    player._awaitingHave = true;
    // telemetry for tuning and monitoring
    player._telemetry = { sent: 0, resent: 0, dropped: 0 };
    // Track which chunk coordinates are currently loaded for this player (string keys)
    player.loadedChunks = new Set();

    // Only send chunks near the player's spawn position for initial load
    const playerChunkX = Math.floor(player.x / 16);
    const playerChunkY = Math.floor(player.y / 16);
    const playerChunkZ = Math.floor(player.z / 16);
    const renderDistance = 16; // tuneable: in chunks; same as client default

    // Ensure nearby chunks are generated asynchronously using worker pool when available
    const ensurePromises = [];
    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dy = -renderDistance; dy <= renderDistance; dy++) {
        for (let dz = -renderDistance; dz <= renderDistance; dz++) {
          try {
            ensurePromises.push(this.world.ensureChunkAsync(playerChunkX + dx, playerChunkY + dy, playerChunkZ + dz));
          } catch (e) {}
        }
      }
    }

    // Wait briefly for generation to complete so the first chunks appear instantly
    try {
      await Promise.race([Promise.all(ensurePromises), new Promise((res) => setTimeout(res, 600))]);
    } catch (e) {}

    // Enqueue binary chunk payloads for the nearby chunks (client will apply atomically)
    log(`Preparing to send nearby chunks to ${user.username} around chunk ${playerChunkX},${playerChunkY},${playerChunkZ}`);
    this.sendNearbyBlocks(user.id, player.x, player.y, player.z, true);

    // Restore persisted client state (if any)
    try {
      const saved = clientStateManager.loadState(user.id);
      if (saved) {
        // Rehydrate sendQueue from saved chunkKeys by re-serializing chunks
        const { serializeChunk } = require("./world/chunkSerializer");
        if (Array.isArray(saved.sendQueue)) {
          for (const ck of saved.sendQueue) {
            const parts = ck.split(":")[0].split(",");
            if (parts.length >= 3) {
              const cx = Number(parts[0]),
                cy = Number(parts[1]),
                cz = Number(parts[2]);
              const key = `${cx},${cy},${cz}`;
              const chunk = this.world.chunks.get(key);
              if (chunk) {
                try {
                  const buffer = serializeChunk(chunk);
                  player.sendQueue.push({ chunkKey: ck, buffer });
                } catch (e) {
                  log(`Failed to re-serialize queued chunk ${ck} for player ${user.id}: ${e.message}`, "WARN");
                }
              }
            }
          }
        }
        // Rehydrate outstandingChunks map (saved as array of objects {chunkKey, seq, retries})
        if (Array.isArray(saved.outstanding)) {
          for (const obj of saved.outstanding) {
            const ck = obj && obj.chunkKey ? obj.chunkKey : obj;
            const seq = obj && obj.seq != null ? Number(obj.seq) : Number((ck || "").split(":").pop() || 0);
            const retries = obj && obj.retries != null ? Number(obj.retries) : 0;
            const parts = (ck || "").split(":")[0].split(",");
            if (parts.length >= 3) {
              const cx = Number(parts[0]),
                cy = Number(parts[1]),
                cz = Number(parts[2]);
              const key = `${cx},${cy},${cz}`;
              const chunk = this.world.chunks.get(key);
              if (chunk) {
                try {
                  // We want to re-serialize with the same seq so attach __seq
                  const chunkCopy = Object.assign({}, chunk);
                  chunkCopy.__seq = seq;
                  const buffer = require("./world/chunkSerializer").serializeChunk(chunkCopy);
                  // store as object metadata for consistent persistence
                  const ackTimeoutBase = (this.options && this.options.chunkAckTimeoutMs) || CHUNK_ACK_TIMEOUT_MS;
                  player.outstandingChunks.set(ck, { buffer, lastSent: 0, retries: retries, seq, nextBackoffMs: ackTimeoutBase });
                } catch (e) {
                  log(`Failed to re-serialize outstanding chunk ${ck} for player ${user.id}: ${e.message}`, "WARN");
                }
              }
            }
          }
        }
      }
    } catch (e) {
      log(`Error restoring client state for ${user.id}: ${e.message}`, "WARN");
    }

    // Send existing players to new player
    this.players.forEach((existingPlayer, id) => {
      if (id !== user.id) {
        this.sendToPlayer(user.id, {
          type: "player_joined",
          id: id,
          username: existingPlayer.username,
          x: existingPlayer.x,
          y: existingPlayer.y,
          z: existingPlayer.z,
        });
      }
    });

    // Notify other players about new player
    this.broadcastToOthers(user.id, {
      type: "player_joined",
      id: user.id,
      username: player.username,
      x: player.x,
      y: player.y,
      z: player.z,
    });
  }

  setupWebSocketServer() {
    this.wss.on("connection", (ws) => {
      let tempConnectionId = uuidv4();
      let authenticatedUser = null;
      let authTimeout = null;

      // Log remote address/port when available for diagnostics
      try {
        const remoteInfo = ws && ws._socket ? `${ws._socket.remoteAddress}:${ws._socket.remotePort}` : "unknown";
        log(`New connection established from ${remoteInfo}, awaiting authentication... (temp ID: ${tempConnectionId.substring(0, 8)})`);
      } catch (e) {
        log(`New connection established, awaiting authentication... (temp ID: ${tempConnectionId.substring(0, 8)})`);
      }

      // Set authentication timeout (30 seconds)
      authTimeout = setTimeout(() => {
        if (!authenticatedUser) {
          log(`Authentication timeout for connection ${tempConnectionId.substring(0, 8)}`, "WARN");
          ws.close(1008, "Authentication timeout");
        }
      }, 30000);

      // Handle messages (including authentication)
      ws.on("message", (data) => {
        try {
          let message = null;
          try {
            message = JSON.parse(data);
          } catch (err) {
            // may be binary chunk ack from client in text format or other non-json; ignore here
            message = null;
          }

          if (message && !authenticatedUser && message.type === "auth_info") {
            this.handleAuthentication(ws, message, tempConnectionId, authTimeout)
              .then(async (user) => {
                authenticatedUser = user;
                // wait up to 5s for server initialization (mods/world) to complete
                try {
                  await Promise.race([this._initPromise, new Promise((res) => setTimeout(res, 5000))]);
                } catch (e) {}
                this.initializeAuthenticatedPlayer(ws, user);
              })
              .catch((error) => {
                log(`Authentication failed for ${tempConnectionId.substring(0, 8)}: ${error.message}`, "ERROR");
                ws.close(1008, "Authentication failed");
              });
          } else if (authenticatedUser && message && message.type && message.type !== "auth_info") {
            // acknowledge chunk receipt from client
            if (message.type === "chunk_ack" && (message.chunkKey || message.seq != null)) {
              const player = this.players.get(authenticatedUser.id);
              if (player && player.outstandingChunks) {
                if (message.chunkKey && player.outstandingChunks.has(message.chunkKey)) {
                  player.outstandingChunks.delete(message.chunkKey);
                } else if (message.seq != null) {
                  // find outstanding entry by seq suffix if stored in key
                  const seq = Number(message.seq);
                  for (const k of Array.from(player.outstandingChunks.keys())) {
                    if (k.endsWith(":" + seq)) {
                      player.outstandingChunks.delete(k);
                      break;
                    }
                  }
                }
                // Mark chunk as loaded for this player (so we can manage unloads)
                try {
                  const ck = message.chunkKey ? String(message.chunkKey).split(":")[0] : null;
                  if (ck && player.loadedChunks) player.loadedChunks.add(ck);
                } catch (e) {}
                // persist client state (store shaped objects)
                try {
                  clientStateManager.saveState(authenticatedUser.id, {
                    outstanding: Array.from(player.outstandingChunks.entries()).map(([k, m]) => ({ chunkKey: k, seq: m.seq || k.split(":").pop() || 0, retries: m.retries || 0, nextBackoffMs: m.nextBackoffMs || (this.options && this.options.chunkAckTimeoutMs) || CHUNK_ACK_TIMEOUT_MS })),
                    sendQueue: player.sendQueue.map((i) => i.chunkKey),
                  });
                } catch (e) {}
                // if no more outstanding, clear resend interval
                if (player.outstandingChunks.size === 0 && player._resendInterval) {
                  clearInterval(player._resendInterval);
                  player._resendInterval = null;
                }
                // attempt to send more if possible
                try {
                  this._processPlayerSendQueue(authenticatedUser.id);
                } catch (e) {}
              }
            } else {
              this.handleMessage(authenticatedUser.id, message);
            }
          } else if (!authenticatedUser) {
            log(`Received message before authentication from ${tempConnectionId.substring(0, 8)}`, "WARN");
            ws.close(1008, "Authentication required");
          }
        } catch (error) {
          log(`Error parsing message: ${error.message}`, "ERROR");
        }
      });

      // Handle disconnection
      ws.on("close", () => {
        if (authTimeout) clearTimeout(authTimeout);

        if (authenticatedUser) {
          // Get player data before removing
          const player = this.players.get(authenticatedUser.id);

          this.players.delete(authenticatedUser.id);
          log(`Player ${authenticatedUser.username} (ID: ${authenticatedUser.id}) disconnected. Total players: ${this.players.size}`);

          // Trigger mod system player leave event
          if (player) {
            this.modSystem.onPlayerLeave(player);
          }

          // Notify other players
          this.broadcastToOthers(authenticatedUser.id, {
            type: "player_disconnect",
            id: authenticatedUser.id,
          });
        } else {
          log(`Unauthenticated connection ${tempConnectionId.substring(0, 8)} disconnected`);
        }
      });

      ws.on("error", (error) => {
        log(`WebSocket error: ${error.message}`, "ERROR");
      });
    });
  }

  handleMessage(playerId, message) {
    switch (message.type) {
      case "chunk_have":
        // client reports which sequence numbers it already has applied
        this.handleClientChunkHave(playerId, message.seqs || []);
        break;
      case "player_move":
        this.handlePlayerMove(playerId, message);
        break;
      case "break_block":
        this.handleBreakBlock(playerId, message);
        break;
      case "place_block":
        this.handlePlaceBlock(playerId, message);
        break;
      default:
        log(`Unknown message type: ${message.type}`, "WARN");
    }
  }

  handleClientChunkHave(playerId, seqs) {
    const player = this.players.get(playerId);
    if (!player || !player.outstandingChunks) return;
    try {
      // mark that client has told us what it already has; allow send loop to proceed
      player._awaitingHave = false;
      // Accept either flat array [1,2,3] or ranges [{from,to}, ...]
      const ranges = [];
      if (Array.isArray(seqs) && seqs.length > 0) {
        if (typeof seqs[0] === "number") {
          for (const s of seqs) ranges.push({ from: Number(s), to: Number(s) });
        } else {
          for (const r of seqs) {
            if (r && typeof r.from === "number" && typeof r.to === "number") ranges.push({ from: Number(r.from), to: Number(r.to) });
          }
        }
      }
      if (ranges.length > 0) {
        for (const k of Array.from(player.outstandingChunks.keys())) {
          const meta = player.outstandingChunks.get(k);
          const mseq = meta && meta.seq != null ? Number(meta.seq) : Number(k.split(":").pop() || 0);
          for (const r of ranges) {
            if (mseq >= r.from && mseq <= r.to) {
              player.outstandingChunks.delete(k);
              break;
            }
          }
        }
      }
      // Persist full shaped state (include nextBackoffMs for better resume behavior)
      clientStateManager.saveState(playerId, {
        outstanding: Array.from(player.outstandingChunks.entries()).map(([k, m]) => ({ chunkKey: k, seq: m.seq || k.split(":").pop() || 0, retries: m.retries || 0, nextBackoffMs: m.nextBackoffMs || (this.options && this.options.chunkAckTimeoutMs) || CHUNK_ACK_TIMEOUT_MS })),
        sendQueue: player.sendQueue.map((i) => i.chunkKey),
      });
      // resume processing send queue now that we reconciled
      try {
        this._processPlayerSendQueue(playerId);
      } catch (e) {}
    } catch (e) {
      /* ignore */
    }
  }

  handlePlayerMove(playerId, message) {
    const player = this.players.get(playerId);
    if (player) {
      const oldChunkX = Math.floor(player.x / 16);
      const oldChunkZ = Math.floor(player.z / 16);

      player.x = message.x;
      player.y = message.y;
      player.z = message.z;

      const newChunkX = Math.floor(player.x / 16);
      const newChunkZ = Math.floor(player.z / 16);

      // Si le joueur a changé de chunk, envoyer de nouveaux blocs
      if (oldChunkX !== newChunkX || oldChunkZ !== newChunkZ) {
        this.sendNearbyBlocks(playerId, player.x, player.y, player.z);
      }

      // Broadcast to other players
      this.broadcastToOthers(playerId, {
        type: "player_move",
        id: playerId,
        x: message.x,
        y: message.y,
        z: message.z,
      });
    }
  }

  handleBreakBlock(playerId, message) {
    if (!this.world) {
      log("handleBreakBlock called but no active world is present; ignoring", "WARN");
      // Notify player that action failed
      if (message && message.actionId) {
        this.sendToPlayer(playerId, { type: "block_action_result", actionId: message.actionId, success: false });
      }
      return;
    }
    const { x, y, z, actionId } = message;

    if (!this.world.isReasonablePosition(x, y, z)) {
      log(`Block position out of reasonable bounds: ${x}, ${y}, ${z}`, "WARN");
      return;
    }

    // Check if block exists
    if (this.world.getBlock(x, y, z) === 0) {
      log(`No block to break at: ${x}, ${y}, ${z}`, "WARN");
      return;
    }

    // Remove block
    this.world.setBlock(x, y, z, 0);
    log(`Player ${playerId} broke block at (${x}, ${y}, ${z})`);

    // Notify the acting player that the action succeeded
    if (actionId) {
      this.sendToPlayer(playerId, {
        type: "block_action_result",
        actionId: actionId,
        success: true,
        x,
        y,
        z,
      });
    }

    // Broadcast a minimal block_patch to nearby players (server authoritative)
    this.broadcastBlockPatch({ x, y, z, type: 0, actionId }, playerId);
  }

  handlePlaceBlock(playerId, message) {
    if (!this.world) {
      log("handlePlaceBlock called but no active world is present; ignoring", "WARN");
      if (message && message.actionId) {
        this.sendToPlayer(playerId, { type: "block_action_result", actionId: message.actionId, success: false });
      }
      return;
    }
    const { x, y, z, blockType = 1, actionId } = message;

    if (!this.world.isReasonablePosition(x, y, z)) {
      log(`Block position out of reasonable bounds: ${x}, ${y}, ${z}`, "WARN");
      return;
    }

    // Check if position is empty
    if (this.world.getBlock(x, y, z) !== 0) {
      log(`Block already exists at: ${x}, ${y}, ${z}`, "WARN");
      return;
    }

    // Place block
    this.world.setBlock(x, y, z, blockType);
    log(`Player ${playerId} placed block at (${x}, ${y}, ${z}) type ${blockType}`);

    // Notify the acting player that the action succeeded
    if (actionId) {
      this.sendToPlayer(playerId, {
        type: "block_action_result",
        actionId: actionId,
        success: true,
        x,
        y,
        z,
      });
    }

    // Broadcast a minimal block_patch to nearby players (server authoritative)
    this.broadcastBlockPatch({ x, y, z, type: blockType, actionId }, playerId);
  }

  // Broadcast a small block patch (single or batched) to nearby players only
  broadcastBlockPatch(patchItem, sourcePlayerId) {
    // patchItem: { x, y, z, type, actionId }
    const radius = 128; // broadcast radius in blocks (tunable)
    const px = patchItem.x,
      py = patchItem.y,
      pz = patchItem.z;
    for (const [id, player] of this.players) {
      if (!player || !player.ws || player.ws.readyState !== WebSocket.OPEN) continue;
      // send to all players; optimize by distance from change
      const dx = player.x - px;
      const dy = player.y - py;
      const dz = player.z - pz;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 <= radius * radius) {
        // send minimal delta packet
        try {
          player.ws.send(JSON.stringify({ type: "block_patch", patches: [patchItem] }));
        } catch (e) {}
      }
    }
  }

  updatePlayerPosition(playerId, x, y, z) {
    const player = this.players.get(playerId);
    if (player) {
      // Update player position in server
      player.x = x;
      player.y = y;
      player.z = z;

      // Send teleport command to specific player (like Minecraft does)
      const targetPlayer = Array.from(this.players.values()).find((p) => p.id === playerId);
      if (targetPlayer && targetPlayer.ws) {
        targetPlayer.ws.send(
          JSON.stringify({
            type: "teleport",
            x: x,
            y: y,
            z: z,
          })
        );
      }

      // Also broadcast to other players
      this.broadcastToOthers(playerId, {
        type: "player_update",
        id: playerId,
        x: x,
        y: y,
        z: z,
      });
    }
  }

  sendToPlayer(playerId, message) {
    const player = this.players.get(playerId);
    if (player && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  }

  broadcastToOthers(excludePlayerId, message) {
    for (const [id, player] of this.players) {
      if (id !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(message));
      }
    }
  }

  broadcastToAll(message) {
    for (const [id, player] of this.players) {
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(message));
      }
    }
  }

  getBlocksInRange(centerX, centerY, centerZ, range) {
    if (!this.world) return [];
    return this.world.getBlocksInRange(centerX, centerY, centerZ, range);
  }

  async sendNearbyBlocks(playerId, playerX, playerY, playerZ, initial = false) {
    // Send chunk-based binary payloads (CHUNK_INIT) for nearby chunks
    const renderDistanceChunks = 4; // use a moderate default render distance (in chunks)
    const pcx = Math.floor(playerX / 16);
    const pcy = Math.floor(playerY / 16);
    const pcz = Math.floor(playerZ / 16);

    const chunksToSend = [];
    if (!this.world) {
      // No world to read from
      log("sendNearbyBlocks called but no active world present; skipping chunk sending");
      return; // Early return to skip chunk iteration
    }
    // If the world implementation doesn't expose a chunk map (e.g., mod-provided world), fall back
    if (!this.world.chunks || typeof this.world.chunks.get !== "function") {
      // fallback: send nearby blocks via existing batched JSON path
      const blocks = this.getBlocksInRange(playerX, playerY, playerZ, renderDistanceChunks * 16);
      if (initial) {
        this.sendBlocksInBatches(playerId, blocks, "world_init", { playerId: playerId, worldSize: this.world.getWorldSize ? this.world.getWorldSize() : null });
      } else {
        this.sendBlocksInBatches(playerId, blocks, "chunks_update", {});
      }
      return;
    }
    const ensurePromises = [];
    for (let dx = -renderDistanceChunks; dx <= renderDistanceChunks; dx++) {
      for (let dy = -renderDistanceChunks; dy <= renderDistanceChunks; dy++) {
        for (let dz = -renderDistanceChunks; dz <= renderDistanceChunks; dz++) {
          const cx = pcx + dx;
          const cy = pcy + dy;
          const cz = pcz + dz;
          const key = `${cx},${cy},${cz}`;
          // simple distance check by chunk center
          const centerX = cx * 16 + 8;
          const centerY = cy * 16 + 8;
          const centerZ = cz * 16 + 8;
          const dist = Math.sqrt((centerX - playerX) ** 2 + (centerY - playerY) ** 2 + (centerZ - playerZ) ** 2);
          if (dist <= renderDistanceChunks * 16 + 8) {
            const chunk = this.world.chunks.get(key);
            if (chunk) {
              chunksToSend.push({ cx, cy, cz, chunk, dist });
            } else if (this.world.ensureChunkAsync) {
              // schedule async generation
              ensurePromises.push(
                this.world
                  .ensureChunkAsync(cx, cy, cz)
                  .then((c) => ({ cx, cy, cz, chunk: c, dist }))
                  .catch(() => null)
              );
            }
          }
        }
      }
    }

    // wait briefly for async-generated chunks to complete (non-blocking long wait)
    if (ensurePromises.length > 0) {
      try {
        const results = await Promise.race([Promise.all(ensurePromises), new Promise((res) => setTimeout(res, 400))]);
        if (Array.isArray(results)) {
          for (const r of results) if (r && r.chunk) chunksToSend.push(r);
        }
      } catch (e) {}
    }

    const player = this.players.get(playerId);
    if (!player || !player.ws || player.ws.readyState !== WebSocket.OPEN) return;

    // send each chunk as a binary CHUNK_FULL message (serialized & possibly compressed)
    // Prioritize chunks by proximity to player so nearest chunks arrive first
    chunksToSend.sort((a, b) => (a.dist || 0) - (b.dist || 0));
    const toSerialize = chunksToSend.map((c) => {
      const seq = this._nextChunkSequence++;
      const chunkCopy = Object.assign({}, c);
      chunkCopy.__seq = seq;
      return { cx: c.cx, cy: c.cy, cz: c.cz, chunk: chunkCopy, seq };
    });

    // serialize in parallel using the worker pool (best-effort). Fall back to main-thread serialize on rejection.
    const serializePromises = toSerialize.map((item) => {
      const serializeRequestedAt = Date.now();
      return this._serializePool
        .serializeChunk(item.chunk)
        .then((msg) => {
          // msg: { id, cx, cy, cz, buffer, serializeMs }
          const finishedAt = Date.now();
          const serializeMsReported = typeof msg.serializeMs === "number" ? msg.serializeMs : finishedAt - serializeRequestedAt;
          // Always log serialize timing so operators can see chunk serialization cost
          try {
            log(`serializeChunk ${item.cx},${item.cy},${item.cz} seq=${item.seq} reportedSerializeMs=${serializeMsReported}`);
          } catch (e) {}
          return { seq: item.seq, cx: item.cx, cy: item.cy, cz: item.cz, buffer: msg.buffer, serializeMs: serializeMsReported, serializedAt: finishedAt };
        })
        .catch((err) => {
          // fallback to synchronous serialize if worker failed
          try {
            const { serializeChunk } = require("./world/chunkSerializer");
            const t0 = Date.now();
            const buffer = serializeChunk(item.chunk);
            const dur = Date.now() - t0;
            if (this.options && this.options.debugTimings) log(`serializeChunk fallback ${item.cx},${item.cy},${item.cz} seq=${item.seq} durMs=${dur}`);
            return { seq: item.seq, cx: item.cx, cy: item.cy, cz: item.cz, buffer, serializeMs: dur, serializedAt: Date.now() };
          } catch (e) {
            log(`Failed to serialize chunk ${item.cx},${item.cy},${item.cz} for player ${playerId}: ${e.message}`, "WARN");
            return null;
          }
        });
    });

    try {
      const serialized = await Promise.all(serializePromises);
      // If this is the initial bulk load, bundle multiple chunk buffers into larger envelopes
      if (initial) {
        const BATCH_SIZE = 27; // tuneable: how many chunks per envelope
        for (let i = 0; i < serialized.length; i += BATCH_SIZE) {
          const slice = serialized.slice(i, i + BATCH_SIZE).filter((s) => s);
          if (slice.length === 0) continue;
          // build envelope: [uint8 msgType=2][uint32 count][uint32 len][chunk...]
          let totalLen = 1 + 4; // msgType + count
          for (const s of slice) totalLen += 4 + s.buffer.byteLength;
          const env = new ArrayBuffer(totalLen);
          const dv = new DataView(env);
          let off = 0;
          dv.setUint8(off, 2);
          off += 1; // CHUNK_BATCH
          dv.setUint32(off, slice.length, true);
          off += 4;
          for (const s of slice) {
            dv.setUint32(off, s.buffer.byteLength, true);
            off += 4;
            const target = new Uint8Array(env, off, s.buffer.byteLength);
            target.set(new Uint8Array(s.buffer));
            off += s.buffer.byteLength;
          }
          // create per-chunk keys and register outstanding entries mapping to this envelope buffer
          const ackTimeoutBase = (this.options && this.options.chunkAckTimeoutMs) || CHUNK_ACK_TIMEOUT_MS;
          const chunkKeys = [];
          for (const s of slice) {
            const chunkKey = `${s.cx},${s.cy},${s.cz}:${1}:${s.seq}`;
            chunkKeys.push(chunkKey);
          }
          // Enqueue the envelope (chunkKey is array to indicate batch)
          player.sendQueue.push({ chunkKey: chunkKeys, buffer: env, enqueuedAt: Date.now() });
        }
      } else {
        // For non-initial sends we also group chunks into batch envelopes to reduce per-message overhead.
        const BATCH_SIZE = 8;
        for (let i = 0; i < serialized.length; i += BATCH_SIZE) {
          const slice = serialized.slice(i, i + BATCH_SIZE).filter((s) => s);
          if (slice.length === 0) continue;
          // build envelope: [uint8 msgType=2][uint32 count][uint32 len][chunk...]
          let totalLen = 1 + 4;
          for (const s of slice) totalLen += 4 + s.buffer.byteLength;
          const env = new ArrayBuffer(totalLen);
          const dv = new DataView(env);
          let off = 0;
          dv.setUint8(off, 2);
          off += 1; // CHUNK_BATCH
          dv.setUint32(off, slice.length, true);
          off += 4;
          for (const s of slice) {
            dv.setUint32(off, s.buffer.byteLength, true);
            off += 4;
            const target = new Uint8Array(env, off, s.buffer.byteLength);
            target.set(new Uint8Array(s.buffer));
            off += s.buffer.byteLength;
          }
          const chunkKeys = [];
          for (const s of slice) {
            const chunkKey = `${s.cx},${s.cy},${s.cz}:${1}:${s.seq}`;
            chunkKeys.push(chunkKey);
          }
          player.sendQueue.push({ chunkKey: chunkKeys, buffer: env, enqueuedAt: Date.now() });
        }
      }
      // Debug: log how many items were enqueued for sending (helpful in headless tests)
      try {
        log(`Enqueued ${player.sendQueue.length} sendQueue items for player ${playerId} (initial=${initial})`);
      } catch (e) {}
    } catch (e) {
      // If something unexpected happens, log and continue; we keep sendQueue possibly empty
      log(`Error during parallel chunk serialization: ${e && e.message ? e.message : String(e)}`, "WARN");
    }

    // persist sendQueue state
    try {
      clientStateManager.saveState(playerId, {
        outstanding: Array.from(player.outstandingChunks.entries()).map(([k, m]) => ({ chunkKey: k, seq: m.seq || k.split(":").pop() || 0, retries: m.retries || 0 })),
        sendQueue: player.sendQueue.map((i) => i.chunkKey),
      });
    } catch (e) {}

    // start sending loop if not already
    // but delay processing until client either reports chunk_have or a short grace period passes
    const startProcessing = () => {
      if (!player.sending) this._processPlayerSendQueue(playerId);
    };
    if (initial) {
      // Allow a larger outstanding window for initial bulk load to speed up the first-frame appearance
      player.maxOutstanding = Math.max(player.maxOutstanding || 8, 32);
      player._awaitingHave = false;
      startProcessing();
    } else {
      // if client doesn't send chunk_have within 2s, start anyway
      setTimeout(() => {
        if (player._awaitingHave) {
          player._awaitingHave = false;
          startProcessing();
        }
      }, 2000);
    }
  }

  _processPlayerSendQueue(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.ws || player.ws.readyState !== WebSocket.OPEN) return;
    player.sending = true;

    while (player.sendQueue.length > 0 && player.outstandingChunks.size < player.maxOutstanding) {
      const item = player.sendQueue.shift();
      try {
        // send binary buffer
        const sendStartedAt = Date.now();
        player.ws.send(item.buffer);
        // compute enqueue->send latency if available
        try {
          const enqueuedAt = item.enqueuedAt || (item.buffer && item.serializedAt) || null;
          if (enqueuedAt) {
            try {
              const enqToSendMs = sendStartedAt - enqueuedAt;
              log(`send chunk item chunkKey=${Array.isArray(item.chunkKey) ? item.chunkKey.slice(0, 3).join("|") : item.chunkKey} enqToSendMs=${enqToSendMs} serializeMs=${item.serializeMs || "n/a"}`);
            } catch (e) {}
          }
          // record telemetry
          player._telemetry.lastEnqToSendMs = enqueuedAt ? sendStartedAt - enqueuedAt : null;
        } catch (e) {}
        // extract seq
        const ackTimeoutBase = (this.options && this.options.chunkAckTimeoutMs) || CHUNK_ACK_TIMEOUT_MS;
        if (Array.isArray(item.chunkKey)) {
          // batch envelope: update lastSent for each chunkKey which should already have outstanding metadata
          for (const ck of item.chunkKey) {
            const meta = player.outstandingChunks.get(ck) || { buffer: item.buffer, retries: 0, seq: null, nextBackoffMs: ackTimeoutBase };
            meta.buffer = item.buffer;
            meta.lastSent = Date.now();
            player.outstandingChunks.set(ck, meta);
          }
        } else {
          const seqVal = item.seq != null ? item.seq : Number((item.chunkKey || "").split(":").pop() || 0);
          // record outstanding with metadata
          player.outstandingChunks.set(item.chunkKey, { buffer: item.buffer, lastSent: Date.now(), retries: 0, seq: seqVal, nextBackoffMs: ackTimeoutBase });
        }
        player._telemetry.sent = (player._telemetry.sent || 0) + 1;
      } catch (e) {
        log(`Failed to send chunk to player ${playerId}: ${e.message}`, "WARN");
        // re-enqueue at front and break to avoid tight loop
        player.sendQueue.unshift(item);
        break;
      }
    }

    // Persist state after queue update
    try {
      clientStateManager.saveState(playerId, {
        outstanding: Array.from(player.outstandingChunks.entries()).map(([k, m]) => ({ chunkKey: k, seq: m.seq || k.split(":").pop() || 0, retries: m.retries || 0 })),
        sendQueue: player.sendQueue.map((i) => i.chunkKey),
      });
    } catch (e) {}

    // Start a resend checker for this player's outstanding chunks
    if (!player._resendInterval) {
      player._resendInterval = setInterval(() => {
        try {
          const now = Date.now();
          for (const [ck, meta] of Array.from(player.outstandingChunks.entries())) {
            if (!meta || !meta.lastSent) continue;
            const nextBackoff = meta.nextBackoffMs || CHUNK_ACK_TIMEOUT_MS;
            if (now - meta.lastSent > nextBackoff) {
              if (meta.retries >= CHUNK_MAX_RETRIES) {
                log(`Dropping chunk ${ck} for player ${playerId} after ${meta.retries} retries`, "WARN");
                player.outstandingChunks.delete(ck);
                player._telemetry.dropped = (player._telemetry.dropped || 0) + 1;
                continue;
              }
              // resend with exponential backoff
              try {
                player.ws.send(meta.buffer);
                meta.lastSent = Date.now();
                meta.retries = (meta.retries || 0) + 1;
                // increase backoff (exponential, capped)
                meta.nextBackoffMs = Math.min((meta.nextBackoffMs || CHUNK_ACK_TIMEOUT_MS) * 2, 30000);
                player.outstandingChunks.set(ck, meta);
                player._telemetry.resent = (player._telemetry.resent || 0) + 1;
                // persist
                clientStateManager.saveState(playerId, {
                  outstanding: Array.from(player.outstandingChunks.entries()).map(([k, m]) => ({ chunkKey: k, seq: m.seq || k.split(":").pop() || 0, retries: m.retries || 0 })),
                  sendQueue: player.sendQueue.map((i) => i.chunkKey),
                });
              } catch (e) {
                log(`Failed to resend chunk ${ck} to player ${playerId}: ${e.message}`, "WARN");
              }
            }
          }
        } catch (e) {
          /* swallow */
        }
      }, 500);
    }

    // if still items queued, schedule next attempt
    if (player.sendQueue.length > 0) {
      setTimeout(() => this._processPlayerSendQueue(playerId), 200);
    } else {
      player.sending = false;
    }
  }

  // Send blocks in smaller batches to avoid blocking the event loop for too long
  sendBlocksInBatches(playerId, blocks, initialType = "chunks_update", meta = {}) {
    if (!Array.isArray(blocks) || blocks.length === 0) return;

    const BATCH_SIZE = 4096; // number of block objects per message - tuneable
    let index = 0;
    const total = blocks.length;

    const sendNext = () => {
      if (index >= total) return;
      const slice = blocks.slice(index, index + BATCH_SIZE);
      const msg = Object.assign({}, meta);
      msg.type = index === 0 ? initialType : "chunks_update";
      msg.blocks = slice;
      // Batched send; avoid noisy per-batch logging to reduce console spam.
      this.sendToPlayer(playerId, msg);
      index += BATCH_SIZE;
      // Schedule next batch asynchronously to allow event loop and client rendering
      if (index < total) setTimeout(sendNext, 10); // small delay to yield frame
    };

    // Kick off
    setImmediate(sendNext);
  }
}

// Initialize and start server
async function startServer() {
  try {
    log("Loading server configuration...");
    loadConfig();

    log("Validating license with backend...");
    const licenseInfo = await validateLicense();
    log(`License valid! Server: ${licenseInfo.server.name}`);
    log(`License expires: ${new Date(licenseInfo.server.license_expires_at).toLocaleDateString()}`);

    log("Synchronizing server settings with backend...");
    await syncServerSettings();
    log("Server settings synchronized");

    log("Starting game server...");
    const gameServer = new GameServer();

    // Send periodic heartbeats to backend
    setInterval(async () => {
      try {
        await sendHeartbeat(gameServer.players.size);
      } catch (error) {
        log(`Failed to send heartbeat: ${error.message}`, "WARN");
      }
    }, 30000); // Every 30 seconds

    // Show ASCII art and final startup message
    showVasteAscii();
    log("Game server running on port " + PORT);
    log(`Max players: ${SERVER_CONFIG.max_players} (synced with backend)`);
    log(`Server name: ${licenseInfo.server.name}`);
    log(`Description: ${licenseInfo.server.description || "No description"}`);
    log(`License key: ${SERVER_CONFIG.license_key.substring(0, 16)}...`);

    // Graceful shutdown
    process.on("SIGINT", () => {
      log("Shutting down server...", "INFO");
      gameServer.wss.close(() => {
        log("Server closed gracefully", "INFO");
        process.exit(0);
      });
    });
  } catch (error) {
    log(`Failed to start server: ${error.message}`, "ERROR");
    console.log("\nMake sure:");
    console.log("   1. The backend server is running on http://localhost:8080");
    console.log("   2. Your server-config.json has a valid license_key");
    console.log("   3. Your license is active and not expired");
    process.exit(1);
  }
}

// Export GameServer for test harnesses and other integrations
module.exports = { GameServer };

// Start the server when executed directly (allow requiring this file in tests without side-effects)
if (require.main === module) {
  startServer();
}
