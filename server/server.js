const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { VasteModSystem } = require('./VasteModSystem');

const PORT = process.env.PORT || 25565;

// Logging utility
function log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleString('fr-FR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
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
const BACKEND_HOST = 'localhost';
const BACKEND_PORT = 8080;
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

// License configuration
const CONFIG_FILE = path.join(__dirname, 'server-config.json');
let SERVER_CONFIG = {};

// Load server configuration
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            SERVER_CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } else {
            log('server-config.json not found! Please create it with your license key.', 'ERROR');
            log('Example configuration:', 'INFO');
            console.log(JSON.stringify({
                license_key: 'vaste_your_license_key_here',
                max_players: 20
            }, null, 2));
            process.exit(1);
        }
    } catch (error) {
        log(`Error loading configuration: ${error.message}`, 'ERROR');
        process.exit(1);
    }
}

// Validate license with backend
async function validateLicense() {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            license_key: SERVER_CONFIG.license_key
        });

        const options = {
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
            path: '/api/game-servers/validate-license',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    if (res.statusCode === 200 && result.valid) {
                        resolve(result);
                    } else {
                        reject(new Error(result.error || 'License validation failed'));
                    }
                } catch (error) {
                    reject(new Error('Invalid response from backend'));
                }
            });
        });

        req.on('error', (error) => {
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
            current_players: playerCount
        });

        const options = {
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
            path: '/api/game-servers/heartbeat',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error('Heartbeat failed'));
                }
            });
        });

        req.on('error', (error) => {
            // Don't crash on heartbeat errors, just log them
            log(`Heartbeat failed: ${error.message}`, 'WARN');
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
            path: '/api/auth/verify',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    if (res.statusCode === 200 && result.success && result.data && result.data.user) {
                        resolve(result.data.user);
                    } else {
                        reject(new Error(result.message || 'Token validation failed'));
                    }
                } catch (error) {
                    reject(new Error('Invalid response from backend'));
                }
            });
        });

        req.on('error', (error) => {
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
            current_players: 0
        });

        const options = {
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
            path: '/api/game-servers/sync-settings',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    if (res.statusCode === 200) {
                        resolve(result);
                    } else {
                        reject(new Error(result.error || 'Settings synchronization failed'));
                    }
                } catch (error) {
                    reject(new Error('Invalid response from backend'));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Cannot sync with backend: ${error.message}`));
        });

        req.write(data);
        req.end();
    });
}

// World state - 3D array to store blocks (0 = air, 1 = stone)
class World {
    constructor() {
        this.blocks = {};
        this.minBounds = { x: 0, y: 0, z: 0 };
        this.maxBounds = { x: 32, y: 32, z: 32 }; // Initial bounds, will expand dynamically
        this.generateWorld();
    }

    generateWorld() {
        // Generate a flat world with stone ground
        for (let x = 0; x < 32; x++) {
            for (let z = 0; z < 32; z++) {
                this.setBlock(x, 0, z, 1); // Ground level
                this.setBlock(x, 1, z, 1); // One layer above ground
            }
        }
    }

    getBlockKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    setBlock(x, y, z, blockType) {
        // Allow reasonable bounds (e.g., -10000 to +10000 for each axis)
        if (this.isReasonablePosition(x, y, z)) {
            if (blockType === 0) {
                delete this.blocks[this.getBlockKey(x, y, z)];
            } else {
                this.blocks[this.getBlockKey(x, y, z)] = blockType;
                // Update world bounds dynamically
                this.updateBounds(x, y, z);
            }
        }
    }

    updateBounds(x, y, z) {
        this.minBounds.x = Math.min(this.minBounds.x, x);
        this.minBounds.y = Math.min(this.minBounds.y, y);
        this.minBounds.z = Math.min(this.minBounds.z, z);
        
        this.maxBounds.x = Math.max(this.maxBounds.x, x + 1);
        this.maxBounds.y = Math.max(this.maxBounds.y, y + 1);
        this.maxBounds.z = Math.max(this.maxBounds.z, z + 1);
    }

    getBlock(x, y, z) {
        if (!this.isReasonablePosition(x, y, z)) return 0;
        return this.blocks[this.getBlockKey(x, y, z)] || 0;
    }

    isValidPosition(x, y, z) {
        // Check if position is within current world bounds
        return x >= this.minBounds.x && x < this.maxBounds.x &&
               y >= this.minBounds.y && y < this.maxBounds.y &&
               z >= this.minBounds.z && z < this.maxBounds.z;
    }

    isReasonablePosition(x, y, z) {
        // Check for reasonable bounds to prevent memory issues (±10000 blocks)
        const MAX_COORD = 10000;
        const MIN_COORD = -10000;
        return x >= MIN_COORD && x <= MAX_COORD &&
               y >= MIN_COORD && y <= MAX_COORD &&
               z >= MIN_COORD && z <= MAX_COORD;
    }

    getWorldSize() {
        // Return the current size of the world
        return {
            width: this.maxBounds.x - this.minBounds.x,
            height: this.maxBounds.y - this.minBounds.y,
            depth: this.maxBounds.z - this.minBounds.z,
            minBounds: this.minBounds,
            maxBounds: this.maxBounds
        };
    }

    getBlocksInRange(centerX, centerY, centerZ, range) {
        // Return only blocks within the specified range from the center position
        // Optimized version that stops early when too many blocks are found
        const blocks = [];
        const maxBlocks = 50000; // Augmenté pour 10 chunks
        
        const minX = Math.floor(centerX - range);
        const maxX = Math.ceil(centerX + range);
        const minY = Math.floor(centerY - range);
        const maxY = Math.ceil(centerY + range);
        const minZ = Math.floor(centerZ - range);
        const maxZ = Math.ceil(centerZ + range);

        for (let x = minX; x <= maxX && blocks.length < maxBlocks; x++) {
            for (let y = minY; y <= maxY && blocks.length < maxBlocks; y++) {
                for (let z = minZ; z <= maxZ && blocks.length < maxBlocks; z++) {
                    const blockType = this.getBlock(x, y, z);
                    if (blockType !== 0) {
                        // Calculate distance to center
                        const distance = Math.sqrt(
                            Math.pow(x - centerX, 2) +
                            Math.pow(y - centerY, 2) +
                            Math.pow(z - centerZ, 2)
                        );
                        
                        if (distance <= range) {
                            blocks.push({ x, y, z, type: blockType });
                        }
                    }
                }
            }
        }
        
        console.log(`[WORLD] Sending ${blocks.length} blocks in range ${range} around (${centerX}, ${centerY}, ${centerZ})`);
        return blocks;
    }

    getBlocksArray() {
        return Object.keys(this.blocks).map(key => {
            const [x, y, z] = key.split(',').map(Number);
            return { x, y, z, type: this.blocks[key] };
        });
    }
}

// Game server
class GameServer {
    constructor() {
        this.players = new Map();
        this.world = new World();
        
        // Initialize modding system
        this.modSystem = new VasteModSystem(this);
        
        this.wss = new WebSocket.Server({ port: PORT });
        
        log(`Vaste server started on port ${PORT}`);
        this.initializeServer();
    }

    async initializeServer() {
        try {
            log('Loading mods...');
            await this.modSystem.loadMods();
            
            const loadedMods = this.modSystem.getLoadedMods();
            if (loadedMods.length > 0) {
                log(`Loaded ${loadedMods.length} mods:`);
                loadedMods.forEach(mod => {
                    log(`  - ${mod.name} v${mod.version} by ${mod.author}`);
                });
                // If a mod created or loaded an active world, prefer it as the server world
                try {
                    const activeModWorld = this.modSystem.worldManager && this.modSystem.worldManager.getActiveWorld && this.modSystem.worldManager.getActiveWorld();
                    if (activeModWorld && typeof activeModWorld.getBlocksInRange === 'function') {
                        this.world = activeModWorld;
                        log('Using mod-provided active world as server world');
                    }
                } catch (e) {
                    // ignore if world manager not accessible or other errors
                }
            } else {
                log('No mods loaded, using default world');
            }
            
            this.setupWebSocketServer();
        } catch (error) {
            log(`Error initializing server: ${error.message}`, 'ERROR');
            this.setupWebSocketServer(); // Continue without mods
        }
    }

    async handleAuthentication(ws, message, tempConnectionId, authTimeout) {
        try {
            const { token } = message;
            
            // Token is MANDATORY - no fallback allowed for security
            if (!token) {
                throw new Error('Authentication token is required');
            }

            // Validate token with backend - this is the ONLY source of truth
            const user = await validateUserToken(token);
            
            // Additional security: verify the user data is valid
            if (!user || !user.id || !user.username) {
                throw new Error('Invalid user data received from backend');
            }

            log(`User authenticated: ${user.username} (ID: ${user.id})`);
            
            // Clear auth timeout
            if (authTimeout) clearTimeout(authTimeout);
            
            return user;
        } catch (error) {
            throw error;
        }
    }

    initializeAuthenticatedPlayer(ws, user) {
        // Initialize player with authenticated user data
        const player = {
            id: user.id,
            username: user.username,
            uuid: user.uuid,
            x: 8, // Default center of world
            y: 5,
            z: 8,
            ws: ws
        };
        
        this.players.set(user.id, player);
        log(`Player ${user.username} (ID: ${user.id}) connected. Total players: ${this.players.size}`);

        // Trigger mod system player join event
        this.modSystem.onPlayerJoin(player);

        // Get world state from mod system or fallback to default
        const modWorldState = this.modSystem.getWorldState();
        const worldSize = this.world.getWorldSize();
        
        // Only send blocks near the player's spawn position for initial load
        const playerChunkX = Math.floor(player.x / 16);
        const playerChunkY = Math.floor(player.y / 16);
        const playerChunkZ = Math.floor(player.z / 16);
        const renderDistance = 4; // Same as client render distance
        
        const nearbyBlocks = this.getBlocksInRange(
            player.x, player.y, player.z, 
            renderDistance * 16 // Convert chunk distance to block distance
        );
        
        const worldState = modWorldState || {
            blocks: nearbyBlocks,
            worldSize: worldSize
        };

        // Send initial world state with only nearby blocks
        log(`Sending world_init to ${user.username} with ${Array.isArray(worldState.blocks) ? worldState.blocks.length : 0} blocks`);
        this.sendToPlayer(user.id, {
            type: 'world_init',
            playerId: user.id,
            blocks: worldState.blocks,
            worldSize: worldState.worldSize
        });

        // Send existing players to new player
        this.players.forEach((existingPlayer, id) => {
            if (id !== user.id) {
                this.sendToPlayer(user.id, {
                    type: 'player_joined',
                    id: id,
                    username: existingPlayer.username,
                    x: existingPlayer.x,
                    y: existingPlayer.y,
                    z: existingPlayer.z
                });
            }
        });

        // Notify other players about new player
        this.broadcastToOthers(user.id, {
            type: 'player_joined',
            id: user.id,
            username: player.username,
            x: player.x,
            y: player.y,
            z: player.z
        });
    }

    setupWebSocketServer() {
        this.wss.on('connection', (ws) => {
            let tempConnectionId = uuidv4();
            let authenticatedUser = null;
            let authTimeout = null;

            log(`New connection established, awaiting authentication... (temp ID: ${tempConnectionId.substring(0, 8)})`);

            // Set authentication timeout (30 seconds)
            authTimeout = setTimeout(() => {
                if (!authenticatedUser) {
                    log(`Authentication timeout for connection ${tempConnectionId.substring(0, 8)}`, 'WARN');
                    ws.close(1008, 'Authentication timeout');
                }
            }, 30000);

            // Handle messages (including authentication)
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    
                    if (!authenticatedUser && message.type === 'auth_info') {
                        this.handleAuthentication(ws, message, tempConnectionId, authTimeout)
                            .then((user) => {
                                authenticatedUser = user;
                                this.initializeAuthenticatedPlayer(ws, user);
                            })
                            .catch((error) => {
                                log(`Authentication failed for ${tempConnectionId.substring(0, 8)}: ${error.message}`, 'ERROR');
                                ws.close(1008, 'Authentication failed');
                            });
                    } else if (authenticatedUser && message.type !== 'auth_info') {
                        this.handleMessage(authenticatedUser.id, message);
                    } else if (!authenticatedUser) {
                        log(`Received message before authentication from ${tempConnectionId.substring(0, 8)}`, 'WARN');
                        ws.close(1008, 'Authentication required');
                    }
                } catch (error) {
                    log(`Error parsing message: ${error.message}`, 'ERROR');
                }
            });

            // Handle disconnection
            ws.on('close', () => {
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
                        type: 'player_disconnect',
                        id: authenticatedUser.id
                    });
                } else {
                    log(`Unauthenticated connection ${tempConnectionId.substring(0, 8)} disconnected`);
                }
            });

            ws.on('error', (error) => {
                log(`WebSocket error: ${error.message}`, 'ERROR');
            });
        });
    }

    handleMessage(playerId, message) {
        switch (message.type) {
            case 'player_move':
                this.handlePlayerMove(playerId, message);
                break;
            case 'break_block':
                this.handleBreakBlock(playerId, message);
                break;
            case 'place_block':
                this.handlePlaceBlock(playerId, message);
                break;
            default:
                log(`Unknown message type: ${message.type}`, 'WARN');
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
                type: 'player_move',
                id: playerId,
                x: message.x,
                y: message.y,
                z: message.z
            });
        }
    }

    handleBreakBlock(playerId, message) {
        const { x, y, z, actionId } = message;
        
        if (!this.world.isReasonablePosition(x, y, z)) {
            log(`Block position out of reasonable bounds: ${x}, ${y}, ${z}`, 'WARN');
            return;
        }

        // Check if block exists
        if (this.world.getBlock(x, y, z) === 0) {
            log(`No block to break at: ${x}, ${y}, ${z}`, 'WARN');
            return;
        }

        // Remove block
        this.world.setBlock(x, y, z, 0);
        log(`Player ${playerId} broke block at (${x}, ${y}, ${z})`);

        // Notify the acting player that the action succeeded
        if (actionId) {
            this.sendToPlayer(playerId, {
                type: 'block_action_result',
                actionId: actionId,
                success: true,
                x, y, z
            });
        }

        // Broadcast block update (include actionId for correlation)
        this.broadcastToAll({
            type: 'block_update',
            action: 'break',
            x: x,
            y: y,
            z: z,
            blockType: 0,
            actionId: actionId
        });
    }

    handlePlaceBlock(playerId, message) {
        const { x, y, z, blockType = 1, actionId } = message;
        
        if (!this.world.isReasonablePosition(x, y, z)) {
            log(`Block position out of reasonable bounds: ${x}, ${y}, ${z}`, 'WARN');
            return;
        }

        // Check if position is empty
        if (this.world.getBlock(x, y, z) !== 0) {
            log(`Block already exists at: ${x}, ${y}, ${z}`, 'WARN');
            return;
        }

        // Place block
        this.world.setBlock(x, y, z, blockType);
        log(`Player ${playerId} placed block at (${x}, ${y}, ${z}) type ${blockType}`);

        // Notify the acting player that the action succeeded
        if (actionId) {
            this.sendToPlayer(playerId, {
                type: 'block_action_result',
                actionId: actionId,
                success: true,
                x, y, z
            });
        }

        // Broadcast block update (include actionId for correlation)
        this.broadcastToAll({
            type: 'block_update',
            action: 'place',
            x: x,
            y: y,
            z: z,
            blockType: blockType,
            actionId: actionId
        });
    }

    updatePlayerPosition(playerId, x, y, z) {
        const player = this.players.get(playerId);
        if (player) {
            // Update player position in server
            player.x = x;
            player.y = y;
            player.z = z;

            // Send teleport command to specific player (like Minecraft does)
            const targetPlayer = Array.from(this.players.values()).find(p => p.id === playerId);
            if (targetPlayer && targetPlayer.ws) {
                targetPlayer.ws.send(JSON.stringify({
                    type: 'teleport',
                    x: x,
                    y: y,
                    z: z
                }));
            }

            // Also broadcast to other players
            this.broadcastToOthers(playerId, {
                type: 'player_update',
                id: playerId,
                x: x,
                y: y,
                z: z
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
        return this.world.getBlocksInRange(centerX, centerY, centerZ, range);
    }

    sendNearbyBlocks(playerId, playerX, playerY, playerZ) {
        // Distance étendue pour 10 chunks de rayon
        const renderDistance = 10; 
        const nearbyBlocks = this.getBlocksInRange(
            playerX, playerY, playerZ, 
            renderDistance * 16
        );
        
        // Envoyer les nouveaux blocs au joueur
        log(`Sending chunks_update to player ${playerId} with ${nearbyBlocks.length} blocks`);
        this.sendToPlayer(playerId, {
            type: 'chunks_update',
            blocks: nearbyBlocks
        });
    }
}

// Initialize and start server
async function startServer() {
    try {
        log('Loading server configuration...');
        loadConfig();

        log('Validating license with backend...');
        const licenseInfo = await validateLicense();
        log(`License valid! Server: ${licenseInfo.server.name}`);
        log(`License expires: ${new Date(licenseInfo.server.license_expires_at).toLocaleDateString()}`);

        log('Synchronizing server settings with backend...');
        await syncServerSettings();
        log('Server settings synchronized');

        log('Starting game server...');
        const gameServer = new GameServer();

        // Send periodic heartbeats to backend
        setInterval(async () => {
            try {
                await sendHeartbeat(gameServer.players.size);
            } catch (error) {
                log(`Failed to send heartbeat: ${error.message}`, 'WARN');
            }
        }, 30000); // Every 30 seconds

        // Show ASCII art and final startup message
        showVasteAscii();
        log('Game server running on port ' + PORT);
        log(`Max players: ${SERVER_CONFIG.max_players} (synced with backend)`);
        log(`Server name: ${licenseInfo.server.name}`);
        log(`Description: ${licenseInfo.server.description || 'No description'}`);
        log(`License key: ${SERVER_CONFIG.license_key.substring(0, 16)}...`);

        // Graceful shutdown
        process.on('SIGINT', () => {
            log('Shutting down server...', 'INFO');
            gameServer.wss.close(() => {
                log('Server closed gracefully', 'INFO');
                process.exit(0);
            });
        });

    } catch (error) {
        log(`Failed to start server: ${error.message}`, 'ERROR');
        console.log('\nMake sure:');
        console.log('   1. The backend server is running on http://localhost:8080');
        console.log('   2. Your server-config.json has a valid license_key');
        console.log('   3. Your license is active and not expired');
        process.exit(1);
    }
}

// Start the server
startServer();