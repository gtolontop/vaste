import { getDB } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export class GameServer {
  constructor(data) {
    this.id = data.id;
    this.uuid = data.uuid;
    this.name = data.name;
    this.description = data.description;
    this.host = data.host;
    this.port = data.port;
    this.websocket_url = data.websocket_url;
    this.max_players = data.max_players;
    this.current_players = data.current_players;
    this.is_online = data.is_online;
    this.is_public = data.is_public;
    this.owner_id = data.owner_id;
    this.version = data.version;
    this.tags = data.tags;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_ping = data.last_ping;
  }

  // Create new game server
  static async create({ name, description, host, port, websocket_url, max_players, owner_id, is_public = true, version = '1.0.0', tags = '' }) {
    const db = getDB();
    
    try {
      // Generate unique UUID
      const serverUuid = uuidv4();

      // Insert new server
      const [result] = await db.execute(
        `INSERT INTO game_servers (uuid, name, description, host, port, websocket_url, max_players, owner_id, is_public, version, tags, created_at, updated_at, is_online, current_players) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0)`,
        [serverUuid, name, description, host, port, websocket_url, max_players, owner_id, is_public, version, tags]
      );

      // Get created server
      const [servers] = await db.execute(
        'SELECT * FROM game_servers WHERE id = ?',
        [result.insertId]
      );

      return new GameServer(servers[0]);
    } catch (error) {
      throw error;
    }
  }

  // Get all public online servers
  static async getPublicServers() {
    const db = getDB();
    
    try {
      const [servers] = await db.execute(
        'SELECT * FROM game_servers WHERE is_public = 1 AND is_online = 1 ORDER BY current_players DESC, created_at DESC'
      );

      return servers.map(server => new GameServer(server));
    } catch (error) {
      throw error;
    }
  }

  // Get servers owned by a user
  static async getByOwner(ownerId) {
    const db = getDB();
    
    try {
      const [servers] = await db.execute(
        'SELECT * FROM game_servers WHERE owner_id = ? ORDER BY created_at DESC',
        [ownerId]
      );

      return servers.map(server => new GameServer(server));
    } catch (error) {
      throw error;
    }
  }

  // Find server by UUID
  static async findByUuid(uuid) {
    const db = getDB();
    
    try {
      const [servers] = await db.execute(
        'SELECT * FROM game_servers WHERE uuid = ?',
        [uuid]
      );

      return servers.length > 0 ? new GameServer(servers[0]) : null;
    } catch (error) {
      throw error;
    }
  }

  // Update server status (ping)
  async updateStatus(isOnline, currentPlayers) {
    const db = getDB();
    
    try {
      await db.execute(
        'UPDATE game_servers SET is_online = ?, current_players = ?, last_ping = NOW(), updated_at = NOW() WHERE id = ?',
        [isOnline, currentPlayers, this.id]
      );

      this.is_online = isOnline;
      this.current_players = currentPlayers;
    } catch (error) {
      throw error;
    }
  }

  // Update server information
  async update({ name, description, max_players, is_public, version, tags }) {
    const db = getDB();
    
    try {
      await db.execute(
        'UPDATE game_servers SET name = ?, description = ?, max_players = ?, is_public = ?, version = ?, tags = ?, updated_at = NOW() WHERE id = ?',
        [
          name || this.name,
          description || this.description,
          max_players || this.max_players,
          is_public !== undefined ? is_public : this.is_public,
          version || this.version,
          tags || this.tags,
          this.id
        ]
      );

      // Recharger les données
      const server = await GameServer.findByUuid(this.uuid);
      Object.assign(this, server);
    } catch (error) {
      throw error;
    }
  }

  // Delete server
  async delete() {
    const db = getDB();
    
    try {
      await db.execute(
        'DELETE FROM game_servers WHERE id = ?',
        [this.id]
      );
    } catch (error) {
      throw error;
    }
  }

  // Mark inactive servers as offline
  static async markInactiveServersOffline(timeoutMinutes = 5) {
    const db = getDB();
    
    try {
      await db.execute(
        'UPDATE game_servers SET is_online = 0 WHERE last_ping < DATE_SUB(NOW(), INTERVAL ? MINUTE)',
        [timeoutMinutes]
      );
    } catch (error) {
      throw error;
    }
  }
}