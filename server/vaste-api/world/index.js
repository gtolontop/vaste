/**
 * Vaste API - World Management Functions
 */

const { VasteWorld, VasteVector3 } = require('../types');

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
        if (!world instanceof VasteWorld) {
            throw new Error('Invalid world object');
        }

        const startX = Math.max(0, Math.min(startPos.x, endPos.x));
        const startY = Math.max(0, Math.min(startPos.y, endPos.y));
        const startZ = Math.max(0, Math.min(startPos.z, endPos.z));
        
        const endX = Math.min(world.width - 1, Math.max(startPos.x, endPos.x));
        const endY = Math.min(world.height - 1, Math.max(startPos.y, endPos.y));
        const endZ = Math.min(world.depth - 1, Math.max(startPos.z, endPos.z));

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