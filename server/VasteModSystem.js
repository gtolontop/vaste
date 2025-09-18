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

    // Convert a Lua value at stack index `idx` to a JS string safely.
    // fengari sometimes returns Lua strings as Uint8Array; to_jsstring
    // expects a Uint8Array. Other error values may already be JS strings.
    // This helper normalizes those cases.
    _luaToString(L, idx) {
        try {
            const raw = lua.lua_tostring(L, idx);
            if (raw != null) {
                if (typeof raw === 'string') return raw;
                if (raw instanceof Uint8Array) return to_jsstring(raw);
                try { return to_jsstring(raw); } catch (e) { return String(raw); }
            }

            // If lua_tostring returned null (value is not a string), try luaL_tolstring
            try {
                const ptr = lauxlib.luaL_tolstring(L, idx);
                if (ptr != null) {
                    const s = to_jsstring(lua.lua_tostring(L, -1));
                    // pop the value pushed by luaL_tolstring
                    lua.lua_pop(L, 1);
                    return s;
                }
            } catch (e) {
                // ignore and fallback
            }

            return '';
        } catch (e) {
            return String(e && e.message ? e.message : e);
        }
    }

    _populateLuaGlobals(L, modPath) {
        const push = interop.push;

        const setGlobal = (name, value) => {
            push(L, value);
            lua.lua_setglobal(L, name);
        };

        // Implement `print` as a Lua C-function for consistent conversion of Lua values
        // (handles strings, numbers, tables, and other Lua types robustly via _luaToString).
        (function() {
            const printC = function(state) {
                try {
                    const top = lua.lua_gettop(state);
                    const parts = [];
                    for (let i = 1; i <= top; i++) {
                        try {
                            parts.push(this._luaToString(state, i));
                        } catch (e) {
                            parts.push(String(e && e.message ? e.message : e));
                        }
                    }
                    const out = parts.join(' ');
                    this.log(`[lua] ${out}`);
                } catch (e) {
                    // If logging fails, raise a Lua error so the caller can see it
                    lauxlib.luaL_error(state, to_luastring(String(e && e.message ? e.message : e)));
                }
                return 0;
            }.bind(this);

            lua.lua_pushcfunction(L, printC);
            lua.lua_setglobal(L, 'print');
        }).call(this);

        setGlobal('vec3', (x, y, z) => MathUtils.vec3(x, y, z));

        setGlobal('CreateOrLoadWorld', (relativePath, type) => this.worldManager.createOrLoadWorld(path.join(modPath, relativePath), { type: type || 'flatworld' }));
        setGlobal('FillBlocksInWorld', (world, startPos, endPos, blockType) => this.worldManager.fillBlocksInWorld(world, startPos, endPos, blockType || 1));

        setGlobal('GetPlayerEntity', (player) => { const id = (typeof player === 'object') ? player.id : player; return this.entityManager.getPlayerEntity(id); });
        setGlobal('GetPlayerName', (player) => { return (player && player.username) ? player.username : (player && player.name) ? player.name : String(player); });
        setGlobal('SetEntityInWorld', (entity, world) => { if (!entity || !world) return; this.entityManager.setEntityInWorld(entity, world); });
        setGlobal('SetEntityCoords', (entity, position) => { if (!entity || !position) return; this.entityManager.setEntityCoords(entity, position); if (entity && entity.type === 'player' && this.gameServer) this.gameServer.updatePlayerPosition(entity.playerId, position.x, position.y, position.z); });

        // AddEventListener: accept a Lua function and register it with the JS EventManager.
        // We push a proper lua C-function so we can operate on the Lua stack and create a
        // registry reference to the provided Lua callback. When the JS event fires we will
        // call the original Lua function by retrieving it from the registry and invoking it.
        (function() {
            const addListenerCFunc = function(state) {
                try {
                    // Arg 1: event name (string)
                    const evName = this._luaToString(state, 1);

                    // Arg 2: callback - must be a function
                    const t = lua.lua_type(state, 2);
                    if (t !== lua.LUA_TFUNCTION) {
                        // Push an error string and raise a Lua error
                        lauxlib.luaL_error(state, to_luastring('AddEventListener: second argument must be a function'));
                        return 0;
                    }

                    // Create a reference to the Lua function in the registry so it survives after this call returns
                    // (the function is at stack index 2)
                    lua.lua_pushvalue(state, 2); // copy function to top
                    const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);

                    // Create JS wrapper that invokes the Lua function when the event is emitted
                    const wrapper = (...args) => {
                        try {
                            // Push the function from the registry onto the stack
                            lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, ref);

                            // Push arguments converted to Lua. For plain JS objects that look like
                            // player or position objects, construct a native Lua table so Lua
                            // code sees a normal table instead of an interop proxy.
                            for (const a of args) {
                                try {
                                    if (a && typeof a === 'object' && !Array.isArray(a)) {
                                        // Detect simple player/vec objects by common keys
                                        const keys = Object.keys(a);
                                        const isSimple = keys.length > 0 && keys.every(k => (typeof k === 'string'));
                                        if (isSimple) {
                                            // create a new table on the stack
                                            lua.lua_newtable(state);
                                            for (const k of keys) {
                                                const v = a[k];
                                                // push value
                                                if (typeof v === 'number') {
                                                    lua.lua_pushnumber(state, v);
                                                } else if (typeof v === 'string') {
                                                    lua.lua_pushstring(state, to_luastring(String(v)));
                                                } else if (typeof v === 'boolean') {
                                                    lua.lua_pushboolean(state, v);
                                                } else {
                                                    // fallback: push string representation
                                                    lua.lua_pushstring(state, to_luastring(String(v)));
                                                }
                                                // set field on table
                                                lua.lua_setfield(state, -2, to_luastring(k));
                                            }
                                            continue;
                                        }
                                    }
                                    interop.push(state, a);
                                } catch (e) {
                                    try { interop.push(state, String(a)); } catch (e2) { lua.lua_pushstring(state, to_luastring(String(a))); }
                                }
                            }

                            const status = lua.lua_pcall(state, args.length, 0, 0);
                            if (status !== 0) {
                                const err = this._luaToString(state, -1);
                                lua.lua_pop(state, 1);
                                console.error(`[mod][lua callback] error calling listener for '${evName}': ${err}`);
                            }
                        } catch (e) {
                            console.error(`[mod][lua callback] exception invoking Lua listener for '${evName}':`, e);
                        }
                    };

                    // Register wrapper with the EventManager
                    this.eventManager.addEventListener(evName, wrapper);

                    // We don't return a handle to Lua; if removal is required later, a more
                    // complete implementation should store mapping of wrapper -> ref and expose
                    // RemoveEventListener that also unrefs the registry entry. For now keep the
                    // ref to prevent GC while the server runs.
                    return 0;
                } catch (e) {
                    // translate exception to Lua error
                    lauxlib.luaL_error(state, to_luastring(String(e && e.message ? e.message : e)));
                    return 0;
                }
            }.bind(this);

            // push as a C function and set global AddEventListener
            lua.lua_pushcfunction(L, addListenerCFunc);
            lua.lua_setglobal(L, 'AddEventListener');
        }).call(this);
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

    this.log(`Preparing to load mod '${modName}' at ${modPath}`);
    this.log(`Discovered server scripts: ${JSON.stringify(modContext.serverScripts)}`);

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

                // Initialize fengari-interop JS library for this Lua state so interop.push works
                try {
                    if (typeof interop.luaopen_js === 'function') {
                        interop.luaopen_js(L);
                        // set global 'js' to the returned module
                        lua.lua_setglobal(L, 'js');
                    } else if (typeof interop.install === 'function') {
                        // older versions may expose install
                        interop.install(L);
                    } else {
                        // Do not spam logs for non-critical variations; only log warnings if interop is absent later when needed.
                    }
                } catch (e) {
                    this.log(`Error initializing fengari-interop for mod '${modName}': ${e && e.message}`);
                }

                this._populateLuaGlobals(L, modPath);

                // No pre-execution diagnostic run to avoid noisy startup logs.

                const status = lauxlib.luaL_loadstring(L, to_luastring(luaCode));
                if (status !== 0) {
                    const err = this._luaToString(L, -1);
                    this.log(`Lua load error in ${serverScript}: ${err}`);
                    continue;
                }

                this.log(`Executing Lua script ${serverScript} for mod '${modName}'`);
                const callStatus = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
                if (callStatus !== 0) {
                    // Gather error info for diagnostics
                    const err = this._luaToString(L, -1);
                    // get Lua type name of the error value
                    let luaTypeName = 'unknown';
                    let luaTypeNum = -1;
                    try { luaTypeNum = lua.lua_type(L, -1); luaTypeName = lua.lua_typename(L, luaTypeNum); } catch (e) { /* ignore */ }

                    // If err is empty, try to create a traceback
                    let traceback = '';
                    if (!err || err.length === 0) {
                        try {
                            lauxlib.luaL_traceback(L, L, to_luastring(''), 1);
                            traceback = this._luaToString(L, -1);
                            lua.lua_pop(L, 1);
                        } catch (e) { /* ignore */ }
                    }

                    // Try converting the error using fengari-interop, if available
                    let interopRepr = '';
                    try {
                        if (interop && typeof interop.tojs === 'function') {
                            const jsVal = interop.tojs(L, -1);
                            try { interopRepr = require('util').inspect(jsVal, { depth: 2 }); } catch (e) { interopRepr = String(jsVal); }
                        }
                    } catch (e) { interopRepr = `interop.tojs failed: ${e && e.message}`; }

                    this.log(`Lua runtime error in ${serverScript}: status=${callStatus} type=${luaTypeName}(${luaTypeNum}) error='${err}' interop='${interopRepr}' traceback='${traceback}'`);
                    continue;
                }
                this._luaStates.set(modName, L);
                this.log(`Loaded Lua server script: ${path.relative(modPath, serverScript)}`);

                // Debug: did the mod create an active world?
                try {
                    const active = this.worldManager.getActiveWorld();
                    if (active) this.log(`Mod '${modName}' set an active world (type=${active.type || 'unknown'})`);
                    else this.log(`Mod '${modName}' did not set an active world (yet)`);
                } catch (e) {
                    this.log(`Error while inspecting world manager after loading mod '${modName}': ${e && e.message}`);
                }
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
        // Emit a lightweight plain object to Lua listeners to avoid passing internal WS objects
        const publicPlayer = { id: player.id, username: player.username };
        this.eventManager.emit('onPlayerJoin', publicPlayer);
    }

    onPlayerLeave(player) {
        this.entityManager.destroyEntity(player.id);
        const publicPlayer = { id: player.id, username: player.username };
        this.eventManager.emit('onPlayerLeave', publicPlayer);
    }

    onPlayerMove(player, newPosition) {
        const playerEntity = this.entityManager.getPlayerEntity(player.id);
        if (playerEntity) this.entityManager.setEntityCoords(playerEntity, newPosition);
        const publicPlayer = { id: player.id, username: player.username };
        this.eventManager.emit('onPlayerMove', publicPlayer, newPosition);
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