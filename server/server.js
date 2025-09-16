const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 25565;

// License configuration
const CONFIG_FILE = path.join(__dirname, 'server-config.json');
let SERVER_CONFIG = {};

// Load server configuration
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            SERVER_CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } else {
            console.error('❌ server-config.json not found! Please create it with your license key.');
            console.log('Example configuration:');
            console.log(JSON.stringify({
                license_key: 'vaste_your_license_key_here',
                backend_url: 'http://localhost:8080',
                server_name: 'My Game Server',
                max_players: 20
            }, null, 2));
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error loading configuration:', error.message);
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
            hostname: 'localhost',
            port: 8080,
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
            hostname: 'localhost',
            port: 8080,
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
            console.warn('⚠️ Heartbeat failed:', error.message);
            resolve();
        });

        req.write(data);
        req.end();
    });
}

// World configuration
const WORLD_SIZE = 16;

// World state - 3D array to store blocks (0 = air, 1 = stone)
class World {
    constructor() {
        this.blocks = {};
        this.generateWorld();
    }

    generateWorld() {
        // Generate a flat world with ground layer only
        for (let x = 0; x < WORLD_SIZE; x++) {
            for (let z = 0; z < WORLD_SIZE; z++) {
                // Create only ground layer (y = 0)
                this.setBlock(x, 0, z, 1);
            }
        }
    }

    getBlockKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    setBlock(x, y, z, blockType) {
        const key = this.getBlockKey(x, y, z);
        if (blockType === 0) {
            delete this.blocks[key];
        } else {
            this.blocks[key] = blockType;
        }
    }

    getBlock(x, y, z) {
        const key = this.getBlockKey(x, y, z);
        return this.blocks[key] || 0;
    }

    isValidPosition(x, y, z) {
        return x >= 0 && x < WORLD_SIZE && 
               y >= 0 && y < WORLD_SIZE && 
               z >= 0 && z < WORLD_SIZE;
    }

    getBlocksArray() {
        const blocks = [];
        for (const [key, blockType] of Object.entries(this.blocks)) {
            const [x, y, z] = key.split(',').map(Number);
            blocks.push({ x, y, z, type: blockType });
        }
        return blocks;
    }
}

// Player management
class GameServer {
    constructor() {
        this.world = new World();
        this.players = new Map();
        this.wss = new WebSocket.Server({ port: PORT });
        
        console.log(`[SERVER] Vaste server started on port ${PORT}`);
        this.setupWebSocketServer();
    }

    setupWebSocketServer() {
        this.wss.on('connection', (ws) => {
            const playerId = uuidv4();
            
            // Initialize player
            const player = {
                id: playerId,
                x: 8, // Center of world
                y: 5,
                z: 8,
                ws: ws
            };
            
            this.players.set(playerId, player);
            console.log(`[SERVER] Player ${playerId} connected. Total players: ${this.players.size}`);

            // Send initial world state
            this.sendToPlayer(playerId, {
                type: 'world_init',
                playerId: playerId,
                blocks: this.world.getBlocksArray(),
                worldSize: WORLD_SIZE
            });

            // Send existing players to new player
            for (const [id, existingPlayer] of this.players) {
                if (id !== playerId) {
                    this.sendToPlayer(playerId, {
                        type: 'player_update',
                        id: id,
                        x: existingPlayer.x,
                        y: existingPlayer.y,
                        z: existingPlayer.z
                    });
                }
            }

            // Notify other players about new player
            this.broadcastToOthers(playerId, {
                type: 'player_update',
                id: playerId,
                x: player.x,
                y: player.y,
                z: player.z
            });

            // Handle messages
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(playerId, message);
                } catch (error) {
                    console.error('[SERVER] Error parsing message:', error);
                }
            });

            // Handle disconnection
            ws.on('close', () => {
                this.players.delete(playerId);
                console.log(`[SERVER] Player ${playerId} disconnected. Total players: ${this.players.size}`);
                
                // Notify other players
                this.broadcastToOthers(playerId, {
                    type: 'player_disconnect',
                    id: playerId
                });
            });

            ws.on('error', (error) => {
                console.error('[SERVER] WebSocket error:', error);
            });
        });
    }

    handleMessage(playerId, message) {
        const player = this.players.get(playerId);
        if (!player) return;

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
                console.warn(`[SERVER] Unknown message type: ${message.type}`);
        }
    }

    handlePlayerMove(playerId, message) {
        const player = this.players.get(playerId);
        if (!player) return;

        // Update player position
        player.x = message.x;
        player.y = message.y;
        player.z = message.z;

        // Broadcast to other players
        this.broadcastToOthers(playerId, {
            type: 'player_update',
            id: playerId,
            x: message.x,
            y: message.y,
            z: message.z
        });
    }

    handleBreakBlock(playerId, message) {
        const { x, y, z } = message;
        
        if (!this.world.isValidPosition(x, y, z)) {
            console.warn(`[SERVER] Invalid block position: ${x}, ${y}, ${z}`);
            return;
        }

        // Check if block exists
        if (this.world.getBlock(x, y, z) === 0) {
            console.warn(`[SERVER] No block to break at: ${x}, ${y}, ${z}`);
            return;
        }

        // Remove block
        this.world.setBlock(x, y, z, 0);
        console.log(`[SERVER] Player ${playerId} broke block at (${x}, ${y}, ${z})`);

        // Broadcast block update
        this.broadcastToAll({
            type: 'block_update',
            action: 'break',
            x: x,
            y: y,
            z: z
        });
    }

    handlePlaceBlock(playerId, message) {
        const { x, y, z } = message;
        
        if (!this.world.isValidPosition(x, y, z)) {
            console.warn(`[SERVER] Invalid block position: ${x}, ${y}, ${z}`);
            return;
        }

        // Check if position is empty
        if (this.world.getBlock(x, y, z) !== 0) {
            console.warn(`[SERVER] Block already exists at: ${x}, ${y}, ${z}`);
            return;
        }

        // Place block (type 1 = stone)
        this.world.setBlock(x, y, z, 1);
        console.log(`[SERVER] Player ${playerId} placed block at (${x}, ${y}, ${z})`);

        // Broadcast block update
        this.broadcastToAll({
            type: 'block_update',
            action: 'place',
            x: x,
            y: y,
            z: z,
            blockType: 1
        });
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
}

// Initialize and start server
async function startServer() {
    try {
        console.log('🔍 Loading server configuration...');
        loadConfig();

        console.log('🔐 Validating license with backend...');
        const licenseInfo = await validateLicense();
        console.log(`✅ License valid! Server: ${licenseInfo.server.name}`);
        console.log(`📅 License expires: ${new Date(licenseInfo.server.license_expires_at).toLocaleDateString()}`);

        console.log('🚀 Starting game server...');
        const gameServer = new GameServer();

        // Send periodic heartbeats to backend
        setInterval(async () => {
            try {
                await sendHeartbeat(gameServer.players.size);
            } catch (error) {
                console.warn('⚠️ Failed to send heartbeat:', error.message);
            }
        }, 30000); // Every 30 seconds

        console.log(`✅ Game server running on port ${PORT}`);
        console.log(`📊 Max players: ${licenseInfo.server.max_players}`);
        console.log(`🔑 License key: ${SERVER_CONFIG.license_key.substring(0, 16)}...`);

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n[SERVER] Shutting down server...');
            gameServer.wss.close(() => {
                console.log('[SERVER] Server closed gracefully');
                process.exit(0);
            });
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        console.log('\n💡 Make sure:');
        console.log('   1. The backend server is running on http://localhost:8080');
        console.log('   2. Your server-config.json has a valid license_key');
        console.log('   3. Your license is active and not expired');
        process.exit(1);
    }
}

// Start the server
startServer();
