/**
 * Vaste Modding System - Core Manager
 */

const fs = require('fs');
const path = require('path');

// Import Vaste API modules
const { WorldManager } = require('./vaste-api/world');
const { EntityManager } = require('./vaste-api/entity');
const { EventManager } = require('./vaste-api/events');
const { MathUtils } = require('./vaste-api/math');
const { VasteWorld, VasteEntity, VastePlayerEntity, VasteVector3 } = require('./vaste-api/types');

class VasteModSystem {
    constructor(gameServer) {
        this.gameServer = gameServer;
        this.mods = new Map();
        this.loadedMods = new Set();
        
        // Initialize API managers
        this.worldManager = new WorldManager();
        this.entityManager = new EntityManager();
        this.eventManager = new EventManager();
        
        this.log = gameServer?.log || ((msg) => console.log(`[VASTE-MOD] ${msg}`));
        
        // Setup environment for both JS and Lua mods
        this.setupModEnvironment();
    }

    setupModEnvironment() {
        // Create global functions for JavaScript mods
        global.CreateWorld = (width, height, depth) => {
            return this.worldManager.createWorld(width, height, depth || 256);
        };

        // CreateOrLoadWorld: Create or load a persisted world folder relative to the mod root
        global.CreateOrLoadWorld = (relativePath, type) => {
            // Resolve using temporary global __currentModPath set while loading scripts
            const modRoot = global.__currentModPath || process.cwd();
            const finalPath = path.join(modRoot, relativePath);
            return this.worldManager.createOrLoadWorld(finalPath, { type: type || 'flatworld' });
        };

        global.FillBlocksInWorld = (world, startPos, endPos, blockType) => {
            this.worldManager.fillBlocksInWorld(world, startPos, endPos, blockType || 1);
        };

        global.AddEventListener = (eventName, callback) => {
            this.eventManager.addEventListener(eventName, callback);
        };

        global.GetPlayerEntity = (player) => {
            // Accept either player object or player ID
            const playerId = typeof player === 'object' ? player.id : player;
            return this.entityManager.getPlayerEntity(playerId);
        };

        global.SetEntityInWorld = (entity, world) => {
            if (!entity || !world) {
                return; // Silently fail if invalid parameters
            }
            this.entityManager.setEntityInWorld(entity, world);
        };

        global.SetEntityCoords = (entity, position) => {
            if (!entity || !position) {
                return; // Silently fail if invalid parameters
            }
            
            this.entityManager.setEntityCoords(entity, position);
            
            // If it's a player entity, notify the game server to update the client
            if (entity.type === 'player' && this.gameServer) {
                this.gameServer.updatePlayerPosition(entity.playerId, position.x, position.y, position.z);
            }
        };

        global.vec3 = (x, y, z) => {
            return MathUtils.vec3(x, y, z);
        };

        global.print = (message) => {
            this.log(message);
        };

        global.tostring = (value) => {
            if (value === null || value === undefined) return 'nil';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
        };

        global.Wait = (milliseconds) => {
            // Blocking wait using setTimeout with a Promise
            return new Promise(resolve => setTimeout(resolve, milliseconds));
        };

        global.CreateThread = (threadFunction) => {
            // Execute the thread function asynchronously
            (async () => {
                try {
                    await threadFunction();
                } catch (error) {
                    this.log(`Error in thread: ${error.message}`);
                }
            })();
        };

        global.SetInterval = (callback, milliseconds) => {
            return setInterval(callback, milliseconds);
        };

        global.ClearInterval = (intervalId) => {
            clearInterval(intervalId);
        };
    }

    // Simple Lua-to-JS transpiler for basic Lua syntax
    transpileLuaToJS(luaCode) {
        let jsCode = luaCode;
        
        // Replace Lua comments
        jsCode = jsCode.replace(/--\s*(.*)/g, '// $1');
        
        // Replace local variables
        jsCode = jsCode.replace(/local\s+(\w+)\s*=/g, 'var $1 =');
        
        // Replace string concatenation
        jsCode = jsCode.replace(/\.\./g, '+');
        
        // Replace Lua keywords with JavaScript equivalents
        jsCode = jsCode.replace(/\btrue\b/g, 'true');
        jsCode = jsCode.replace(/\bfalse\b/g, 'false');
        jsCode = jsCode.replace(/\bnil\b/g, 'null');
        
        // Replace Lua control structures
        jsCode = jsCode.replace(/\bwhile\s+(.+?)\s+do\s*$/gm, 'while ($1) {');
        jsCode = jsCode.replace(/\bif\s+(.+?)\s+then\s*$/gm, 'if ($1) {');
        jsCode = jsCode.replace(/\belse\s*$/gm, '} else {');
        jsCode = jsCode.replace(/\belseif\s+(.+?)\s+then\s*$/gm, '} else if ($1) {');
        
        // Handle function definitions with proper braces
        jsCode = jsCode.replace(/AddEventListener\s*\(\s*"([^"]+)"\s*,\s*function\s*\(([^)]*)\)\s*$/gm, 
            'AddEventListener("$1", async function($2) {');
        
        // Handle CreateThread with async function
        jsCode = jsCode.replace(/CreateThread\s*\(\s*function\s*\(([^)]*)\)\s*$/gm,
            'CreateThread(async function($1) {');
        
        // Replace Wait calls with await
        jsCode = jsCode.replace(/Wait\s*\(/g, 'await Wait(');
        
        // Replace 'end' with closing braces for functions
        jsCode = jsCode.replace(/^end\)/gm, '});');
        
        // Replace standalone 'end' with closing braces
        jsCode = jsCode.replace(/^end\s*$/gm, '}');
        
        // Fix any remaining 'end' statements
        jsCode = jsCode.replace(/\bend\b/g, '}');
        
        return jsCode;
    }

    async loadMods() {
        const modsPath = path.join(__dirname, 'mods');
        
        if (!fs.existsSync(modsPath)) {
            this.log('Mods directory not found, creating...');
            fs.mkdirSync(modsPath, { recursive: true });
            return;
        }

        const modFolders = fs.readdirSync(modsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        this.log(`Found ${modFolders.length} potential mods`);

        for (const modFolder of modFolders) {
            try {
                await this.loadMod(modFolder);
            } catch (error) {
                this.log(`Failed to load mod '${modFolder}': ${error.message}`);
            }
        }

        this.log(`Successfully loaded ${this.loadedMods.size} mods`);
    }

    async loadMod(modName) {
        const modPath = path.join(__dirname, 'mods', modName);
        const manifestPath = path.join(modPath, '_heyvaste.lua');

        if (!fs.existsSync(manifestPath)) {
            throw new Error(`Mod manifest '_heyvaste.lua' not found in ${modName}`);
        }

        // Create mod context
        const modContext = {
            name: null,
            description: null,
            version: null,
            author: null,
            clientScripts: [],
            serverScripts: [],
            path: modPath
        };

        // Parse manifest file (simple text parsing for now)
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        this.parseManifest(manifestContent, modContext, modPath);

        // Validate mod context
        if (!modContext.name) {
            throw new Error(`Mod '${modName}' missing name declaration`);
        }

        // Load server scripts
        for (const serverScript of modContext.serverScripts) {
            if (fs.existsSync(serverScript)) {
                try {
                    // Set current mod path so CreateOrLoadWorld can resolve relative paths
                    global.__currentModPath = modPath;
                    if (serverScript.endsWith('.js')) {
                        // Execute JavaScript file
                        require(serverScript);
                        this.log(`Loaded server script: ${path.relative(modPath, serverScript)}`);
                    } else if (serverScript.endsWith('.lua')) {
                        // Transpile and execute Lua file
                        const scriptContent = fs.readFileSync(serverScript, 'utf8');
                        const jsCode = this.transpileLuaToJS(scriptContent);
                        eval(jsCode);
                        this.log(`Loaded server script: ${path.relative(modPath, serverScript)} (transpiled from Lua)`);
                    } else {
                        this.log(`Warning: Unsupported script format: ${serverScript}`);
                    }
                } catch (error) {
                    throw new Error(`Error executing server script ${serverScript}: ${error.message}`);
                } finally {
                    // Clear the temporary mod path
                    try { delete global.__currentModPath; } catch (e) { global.__currentModPath = undefined; }
                }
            } else {
                this.log(`Warning: Server script not found: ${serverScript}`);
            }
        }

        // Store mod info
        this.mods.set(modContext.name, modContext);
        this.loadedMods.add(modContext.name);

        this.log(`Loaded mod: ${modContext.name} v${modContext.version} by ${modContext.author}`);
    }

    parseManifest(content, modContext, modPath) {
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('name(')) {
                const match = trimmed.match(/name\("(.+)"\)/);
                if (match) modContext.name = match[1];
            } else if (trimmed.startsWith('description(')) {
                const match = trimmed.match(/description\("(.+)"\)/);
                if (match) modContext.description = match[1];
            } else if (trimmed.startsWith('version(')) {
                const match = trimmed.match(/version\("(.+)"\)/);
                if (match) modContext.version = match[1];
            } else if (trimmed.startsWith('author(')) {
                const match = trimmed.match(/author\("(.+)"\)/);
                if (match) modContext.author = match[1];
            } else if (trimmed.startsWith('load_client_script(')) {
                const match = trimmed.match(/load_client_script\("(.+)"\)/);
                if (match) modContext.clientScripts.push(path.join(modPath, match[1]));
            } else if (trimmed.startsWith('load_server_script(')) {
                const match = trimmed.match(/load_server_script\("(.+)"\)/);
                if (match) modContext.serverScripts.push(path.join(modPath, match[1]));
            }
        }
    }

    // Event handling methods
    onPlayerJoin(player) {
        // Create player entity
        const playerEntity = this.entityManager.createPlayerEntity(player.id, player.username);
        
        // Emit player join event for mods
        this.eventManager.emit('onPlayerJoin', player);
    }

    onPlayerLeave(player) {
        // Clean up player entity
        this.entityManager.destroyEntity(player.id);
        
        // Emit player leave event for mods
        this.eventManager.emit('onPlayerLeave', player);
    }

    onPlayerMove(player, newPosition) {
        const playerEntity = this.entityManager.getPlayerEntity(player.id);
        if (playerEntity) {
            this.entityManager.setEntityCoords(playerEntity, newPosition);
        }
        
        this.eventManager.emit('onPlayerMove', player, newPosition);
    }

    // Get world state for synchronization
    getWorldState() {
        const activeWorld = this.worldManager.getActiveWorld();
        if (activeWorld) {
            // Support both legacy VasteWorld and new persisted world runtime
            const blocks = typeof activeWorld.getBlocksArray === 'function' ? activeWorld.getBlocksArray() : [];
            const spawnPoint = activeWorld.spawn || activeWorld.spawnPoint || { x: 0, y: 4, z: 0 };
            const worldSize = (activeWorld.width && activeWorld.height) ? Math.max(activeWorld.width, activeWorld.height) : null;
            return { blocks, worldSize, spawnPoint };
        }
        return null;
    }

    // Get loaded mods info
    getLoadedMods() {
        return Array.from(this.mods.values()).map(mod => ({
            name: mod.name,
            description: mod.description,
            version: mod.version,
            author: mod.author
        }));
    }
}

module.exports = { VasteModSystem };