const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

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

// World configuration
const WORLD_SIZE = 16;

// World state - 3D array to store blocks (0 = air, 1 = stone)
class World {
    constructor() {
        this.blocks = {};
        this.generateWorld();
    }

    generateWorld() {
        // Generate a flat world with stone ground
        for (let x = 0; x < WORLD_SIZE; x++) {
            for (let z = 0; z < WORLD_SIZE; z++) {
                this.setBlock(x, 0, z, 1); // Ground level
                this.setBlock(x, 1, z, 1); // One layer above ground
            }
        }
    }

    getBlockKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    setBlock(x, y, z, blockType) {
        if (this.isValidPosition(x, y, z)) {
            if (blockType === 0) {
                delete this.blocks[this.getBlockKey(x, y, z)];
            } else {
                this.blocks[this.getBlockKey(x, y, z)] = blockType;
            }
        }
    }

    getBlock(x, y, z) {
        if (!this.isValidPosition(x, y, z)) return 0;
        return this.blocks[this.getBlockKey(x, y, z)] || 0;
    }

    isValidPosition(x, y, z) {
        return x >= 0 && x < WORLD_SIZE &&
               y >= 0 && y < WORLD_SIZE &&
               z >= 0 && z < WORLD_SIZE;
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
        
        this.wss = new WebSocket.Server({ port: PORT });
        
        log(`Vaste server started on port ${PORT}`);
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
            log(`Player ${playerId} connected. Total players: ${this.players.size}`);

            // Send initial world state
            this.sendToPlayer(playerId, {
                type: 'world_init',
                playerId: playerId,
                blocks: this.world.getBlocksArray(),
                worldSize: WORLD_SIZE
            });

            // Send existing players to new player
            for (const [id, p] of this.players) {
                if (id !== playerId) {
                    this.sendToPlayer(playerId, {
                        type: 'player_joined',
                        id: id,
                        x: p.x,
                        y: p.y,
                        z: p.z
                    });
                }
            }

            // Notify other players about new player
            this.broadcastToOthers(playerId, {
                type: 'player_joined',
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
                    log(`Error parsing message: ${error.message}`, 'ERROR');
                }
            });

            // Handle disconnection
            ws.on('close', () => {
                this.players.delete(playerId);
                log(`Player ${playerId} disconnected. Total players: ${this.players.size}`);
                
                // Notify other players
                this.broadcastToOthers(playerId, {
                    type: 'player_disconnect',
                    id: playerId
                });
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
            player.x = message.x;
            player.y = message.y;
            player.z = message.z;

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
        const { x, y, z } = message;
        
        if (!this.world.isValidPosition(x, y, z)) {
            log(`Invalid block position: ${x}, ${y}, ${z}`, 'WARN');
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

        // Broadcast block update
        this.broadcastToAll({
            type: 'block_update',
            action: 'break',
            x: x,
            y: y,
            z: z,
            blockType: 0
        });
    }

    handlePlaceBlock(playerId, message) {
        const { x, y, z } = message;
        
        if (!this.world.isValidPosition(x, y, z)) {
            log(`Invalid block position: ${x}, ${y}, ${z}`, 'WARN');
            return;
        }

        // Check if position is empty
        if (this.world.getBlock(x, y, z) !== 0) {
            log(`Block already exists at: ${x}, ${y}, ${z}`, 'WARN');
            return;
        }

        // Place block (type 1 = stone)
        this.world.setBlock(x, y, z, 1);
        log(`Player ${playerId} placed block at (${x}, ${y}, ${z})`);

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