/**
 * Vaste API - Entity Management Functions
 */

const { VasteEntity, VastePlayerEntity, VasteVector3 } = require('../types');

class EntityManager {
    constructor() {
        this.entities = new Map();
        this.playerEntities = new Map(); // Map<playerId, VastePlayerEntity>
    }

    createEntity(type = 'generic') {
        const entity = new VasteEntity(type);
        this.entities.set(entity.id, entity);
        return entity;
    }

    createPlayerEntity(playerId, username) {
        const playerEntity = new VastePlayerEntity(playerId, username);
        this.entities.set(playerEntity.id, playerEntity);
        this.playerEntities.set(playerId, playerEntity);
        return playerEntity;
    }

    getEntity(entityId) {
        return this.entities.get(entityId);
    }

    getPlayerEntity(playerId) {
        return this.playerEntities.get(playerId);
    }

    setEntityInWorld(entity, world) {
        if (!entity || !world) {
            throw new Error('Invalid entity or world');
        }

        // Remove from previous world if exists
        if (entity.world) {
            entity.world.entities.delete(entity);
        }

        // Add to new world
        entity.world = world;
        world.entities.add(entity);
    }

    setEntityCoords(entity, position) {
        if (!entity) {
            throw new Error('Invalid entity');
        }

        if (position instanceof VasteVector3) {
            entity.position = { x: position.x, y: position.y, z: position.z };
        } else if (typeof position === 'object' && position.x !== undefined) {
            entity.position = { x: position.x, y: position.y || 0, z: position.z || 0 };
        } else {
            throw new Error('Invalid position format');
        }
    }

    getEntityCoords(entity) {
        if (!entity) {
            throw new Error('Invalid entity');
        }
        return new VasteVector3(entity.position.x, entity.position.y, entity.position.z);
    }

    destroyEntity(entityId) {
        const entity = this.entities.get(entityId);
        if (entity) {
            // Remove from world if exists
            if (entity.world) {
                entity.world.entities.delete(entity);
            }

            // Remove from player entities if it's a player
            if (entity instanceof VastePlayerEntity) {
                this.playerEntities.delete(entity.playerId);
            }

            this.entities.delete(entityId);
            return true;
        }
        return false;
    }

    getEntitiesInWorld(world) {
        return Array.from(world.entities);
    }
}

module.exports = { EntityManager };