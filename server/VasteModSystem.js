/*
 * Clean Lua-only Vaste Modding System
 */

const fs = require('fs');
const path = require('path');

const fengari = require('fengari');
const interop = require('fengari-interop');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const { WorldManager } = require('./vaste-api/world');
const { EntityManager } = require('./vaste-api/entity');
const { EventManager } = require('./vaste-api/events');
const { MathUtils } = require('./vaste-api/math');

class VasteModSystem {
    constructor(gameServer) {
        this.gameServer = gameServer;
        this.mods = new Map();
        this.loadedMods = new Set();

        this.worldManager = new WorldManager();
        this.entityManager = new EntityManager();
        this.eventManager = new EventManager();

        this.log = (msg) => {
            if (this.gameServer && this.gameServer.log) return this.gameServer.log(`[mod] ${msg}`);
            console.log(`[VASTE-MOD] ${msg}`);
        };

        this._luaStates = new Map();
    }

    ensureLuaAvailable() {
        if (!fengari || !interop) {
            throw new Error('fengari and fengari-interop are required for Lua-only mod support. Run: npm install --save fengari fengari-interop');
        }
    }

    _populateLuaGlobals(L, modPath) {
        const push = interop.push;

        const setGlobal = (name, value) => {
            push(L, value);
            lua.lua_setglobal(L, name);
        };

        setGlobal('print', (...args) => {
            try { this.log(`[lua] ${args.join(' ')}`); } catch (e) { console.error(e); }
        });

        setGlobal('vec3', (x, y, z) => MathUtils.vec3(x, y, z));

        setGlobal('CreateOrLoadWorld', (relativePath, type) => this.worldManager.createOrLoadWorld(path.join(modPath, relativePath), { type: type || 'flatworld' }));
        setGlobal('FillBlocksInWorld', (world, startPos, endPos, blockType) => this.worldManager.fillBlocksInWorld(world, startPos, endPos, blockType || 1));

        setGlobal('GetPlayerEntity', (player) => { const id = (typeof player === 'object') ? player.id : player; return this.entityManager.getPlayerEntity(id); });
        setGlobal('GetPlayerName', (player) => { return (player && player.username) ? player.username : (player && player.name) ? player.name : String(player); });
        setGlobal('SetEntityInWorld', (entity, world) => { if (!entity || !world) return; this.entityManager.setEntityInWorld(entity, world); });
        setGlobal('SetEntityCoords', (entity, position) => { if (!entity || !position) return; this.entityManager.setEntityCoords(entity, position); if (entity && entity.type === 'player' && this.gameServer) this.gameServer.updatePlayerPosition(entity.playerId, position.x, position.y, position.z); });

        setGlobal('AddEventListener', (ev, cb) => this.eventManager.addEventListener(ev, cb));
        setGlobal('EmitEvent', (ev, ...args) => this.eventManager.emit(ev, ...args));

        setGlobal('Wait', (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }

    async loadMods() {
        this.ensureLuaAvailable();

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
                this.log(`Failed to load mod '${modFolder}': ${error && error.message}`);
            }
        }

        this.log(`Successfully loaded ${this.loadedMods.size} mods`);
    }

    async loadMod(modName) {
        this.ensureLuaAvailable();

        const modPath = path.join(__dirname, 'mods', modName);
        const manifestPath = path.join(modPath, '_heyvaste.lua');

        if (!fs.existsSync(manifestPath)) {
            throw new Error(`Mod manifest '_heyvaste.lua' not found in ${modName}`);
        }

        const modContext = { name: null, description: null, version: null, author: null, clientScripts: [], serverScripts: [], path: modPath };

        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        this.parseManifest(manifestContent, modContext, modPath);

        if (!modContext.name) throw new Error(`Mod '${modName}' missing name declaration`);

        for (const serverScriptRel of modContext.serverScripts) {
            const serverScript = path.isAbsolute(serverScriptRel) ? serverScriptRel : path.join(modPath, serverScriptRel);
            if (!fs.existsSync(serverScript)) {
                this.log(`Warning: Server script not found: ${serverScript}`);
                continue;
            }

            if (!serverScript.endsWith('.lua')) {
                this.log(`Warning: Only .lua server scripts are supported. Skipping ${serverScript}`);
                continue;
            }

            try {
                const luaCode = fs.readFileSync(serverScript, 'utf8');

                const L = lauxlib.luaL_newstate();
                lualib.luaL_openlibs(L);

                this._populateLuaGlobals(L, modPath);

                const status = lauxlib.luaL_loadstring(L, to_luastring(luaCode));
                if (status !== 0) {
                    const err = to_jsstring(lua.lua_tostring(L, -1));
                    this.log(`Lua load error in ${serverScript}: ${err}`);
                    continue;
                }

                const callStatus = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
                if (callStatus !== 0) {
                    const err = to_jsstring(lua.lua_tostring(L, -1));
                    this.log(`Lua runtime error in ${serverScript}: ${err}`);
                    continue;
                }

                this._luaStates.set(modName, L);
                this.log(`Loaded Lua server script: ${path.relative(modPath, serverScript)}`);
            } catch (e) {
                this.log(`Error executing Lua server script ${serverScript}: ${e && e.message}`);
            }
        }

        this.mods.set(modContext.name, modContext);
        this.loadedMods.add(modContext.name);
        this.log(`Loaded mod: ${modContext.name} v${modContext.version || 'n/a'} by ${modContext.author || 'unknown'}`);
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
                if (match) modContext.clientScripts.push(match[1]);
            } else if (trimmed.startsWith('load_server_script(')) {
                const match = trimmed.match(/load_server_script\("(.+)"\)/);
                if (match) modContext.serverScripts.push(match[1]);
            }
        }
    }

    onPlayerJoin(player) {
        const playerEntity = this.entityManager.createPlayerEntity(player.id, player.username);
        this.eventManager.emit('onPlayerJoin', player);
    }

    onPlayerLeave(player) {
        this.entityManager.destroyEntity(player.id);
        this.eventManager.emit('onPlayerLeave', player);
    }

    onPlayerMove(player, newPosition) {
        const playerEntity = this.entityManager.getPlayerEntity(player.id);
        if (playerEntity) this.entityManager.setEntityCoords(playerEntity, newPosition);
        this.eventManager.emit('onPlayerMove', player, newPosition);
    }

    getWorldState() {
        const activeWorld = this.worldManager.getActiveWorld();
        if (activeWorld) {
            const blocks = typeof activeWorld.getBlocksArray === 'function' ? activeWorld.getBlocksArray() : [];
            const spawnPoint = activeWorld.spawn || activeWorld.spawnPoint || { x: 0, y: 4, z: 0 };
            const worldSize = (activeWorld.width && activeWorld.height) ? Math.max(activeWorld.width, activeWorld.height) : null;
            return { blocks, worldSize, spawnPoint };
        }
        return null;
    }

    getLoadedMods() {
        return Array.from(this.mods.values()).map(mod => ({ name: mod.name, description: mod.description, version: mod.version, author: mod.author }));
    }
}

module.exports = { VasteModSystem };