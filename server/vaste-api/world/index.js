/**
 * Vaste API - World Management Functions
 */

const { VasteWorld, VasteVector3 } = require('../types');
const path = require('path');
const { WorldRuntime } = require('./world_runtime');

// Runtime singleton for persisted worlds
const worldRuntime = new WorldRuntime();

class WorldManager {
    constructor() {
        this.worlds = new Map();
        this.activeWorld = null;
    }

    createWorld(width, height, depth = 256) {
        const world = new VasteWorld(width, height, depth);
        this.worlds.set(world.id, world);
        
        if (!this.activeWorld) {
            this.activeWorld = world;
        }
        
        return world;
    }

    // New API: create or load a persisted world stored under `worldPath` (absolute or relative to mod root)
    // worldPath should point to a folder where 'chunks/' and 'world.json' will be stored
    createOrLoadWorld(worldPath, options = {}) {
        // Resolve absolute path if relative
        const absPath = path.isAbsolute(worldPath) ? worldPath : path.join(process.cwd(), worldPath);
        const w = worldRuntime.createOrLoadWorld(absPath, options);
        // set as activeWorld so server can query blocks and spawnPoint
        this.activeWorld = w;
        return w;
    }

    getWorld(worldId) {
        return this.worlds.get(worldId);
    }

    getActiveWorld() {
        return this.activeWorld;
    }

    setActiveWorld(world) {
        this.activeWorld = world;
    }

    fillBlocksInWorld(world, startPos, endPos, blockType = 1) {
        // Accept either legacy VasteWorld instances or any object that implements setBlock(x,y,z,blockType)
        if (!world || typeof world.setBlock !== 'function') {
            throw new Error('Invalid world object');
        }

        const startX = Math.max(0, Math.min(startPos.x, endPos.x));
        const startY = Math.max(0, Math.min(startPos.y, endPos.y));
        const startZ = Math.max(0, Math.min(startPos.z, endPos.z));
        
    // For persisted/infinite worlds, we don't clamp to width/height/depth
    const endX = Math.max(startPos.x, endPos.x);
    const endY = Math.max(startPos.y, endPos.y);
    const endZ = Math.max(startPos.z, endPos.z);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                for (let z = startZ; z <= endZ; z++) {
                    world.setBlock(x, y, z, blockType);
                }
            }
        }
    }

    destroyWorld(worldId) {
        const world = this.worlds.get(worldId);
        if (world) {
            // Clear all entities from the world
            world.entities.clear();
            this.worlds.delete(worldId);
            
            if (this.activeWorld === world) {
                this.activeWorld = this.worlds.values().next().value || null;
            }
            
            return true;
        }
        return false;
    }
}

module.exports = { WorldManager };