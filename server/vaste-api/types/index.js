/**
 * Vaste API - Data Types
 * Defines core data structures for the modding system
 */

class VasteWorld {
    constructor(width, height, depth = 256) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.blocks = new Map(); // Map<string, blockType>
        this.entities = new Set(); // Set<VasteEntity>
        this.spawnPoint = { x: 0, y: 0, z: 5 };
        this.created_at = new Date();
    }

    getBlockKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    setBlock(x, y, z, blockType) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height && z >= 0 && z < this.depth) {
            this.blocks.set(this.getBlockKey(x, y, z), blockType);
        }
    }

    getBlock(x, y, z) {
        return this.blocks.get(this.getBlockKey(x, y, z)) || 0;
    }

    getBlocksArray() {
        const blocks = [];
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                for (let z = 0; z < this.depth; z++) {
                    const blockType = this.getBlock(x, y, z);
                    if (blockType !== 0) {
                        blocks.push({ x, y, z, type: blockType });
                    }
                }
            }
        }
        return blocks;
    }
}

class VasteEntity {
    constructor(type = 'generic') {
        this.id = Math.random().toString(36).substr(2, 9);
        this.type = type;
        this.world = null;
        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.properties = new Map();
        this.created_at = new Date();
    }

    setProperty(key, value) {
        this.properties.set(key, value);
    }

    getProperty(key) {
        return this.properties.get(key);
    }
}

class VastePlayerEntity extends VasteEntity {
    constructor(playerId, username) {
        super('player');
        this.playerId = playerId;
        this.username = username;
        this.health = 100;
        this.maxHealth = 100;
        this.inventory = [];
    }
}

class VasteVector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    add(other) {
        return new VasteVector3(this.x + other.x, this.y + other.y, this.z + other.z);
    }

    subtract(other) {
        return new VasteVector3(this.x - other.x, this.y - other.y, this.z - other.z);
    }

    multiply(scalar) {
        return new VasteVector3(this.x * scalar, this.y * scalar, this.z * scalar);
    }

    distance(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const dz = this.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    toString() {
        return `vec3(${this.x}, ${this.y}, ${this.z})`;
    }
}

module.exports = {
    VasteWorld,
    VasteEntity,
    VastePlayerEntity,
    VasteVector3
};