import { getDB } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

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
    this.license_key = data.license_key;
    this.license_expires_at = data.license_expires_at;
    this.is_license_active = data.is_license_active;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_ping = data.last_ping;
  }

  // Generate a unique license key
  static generateLicenseKey() {
    return 'vaste_' + crypto.randomBytes(32).toString('hex');
  }

  // Create new game server
  static async create({ name, description, host, port, websocket_url, max_players, owner_id, is_public = true, version = '1.0.0', tags = '' }) {
    const db = getDB();
    
    try {
      // Generate unique UUID and license key
      const serverUuid = uuidv4();
      const licenseKey = GameServer.generateLicenseKey();
      
      // License expires in 1 year by default
      const licenseExpiresAt = new Date();
      licenseExpiresAt.setFullYear(licenseExpiresAt.getFullYear() + 1);

      // Insert new server
      const [result] = await db.execute(
        `INSERT INTO game_servers (uuid, name, description, host, port, websocket_url, max_players, owner_id, is_public, version, tags, license_key, license_expires_at, is_license_active, created_at, updated_at, is_online, current_players) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW(), 0, 0)`,
        [serverUuid, name, description, host, port, websocket_url, max_players, owner_id, is_public, version, tags, licenseKey, licenseExpiresAt]
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

  // Get all public servers (online and offline)
  static async getPublicServers() {
    const db = getDB();
    
    try {
      const [servers] = await db.execute(
        'SELECT * FROM game_servers WHERE is_public = 1 ORDER BY is_online DESC, current_players DESC, created_at DESC'
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

  // Find server by license key
  static async findByLicenseKey(licenseKey) {
    const db = getDB();
    
    try {
      const [servers] = await db.execute(
        'SELECT * FROM game_servers WHERE license_key = ?',
        [licenseKey]
      );

      return servers.length > 0 ? new GameServer(servers[0]) : null;
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

  // Validate license key
  static async validateLicense(licenseKey) {
    const server = await GameServer.findByLicenseKey(licenseKey);
    
    if (!server) {
      return { valid: false, error: 'License key not found' };
    }

    if (!server.is_license_active) {
      return { valid: false, error: 'License is deactivated' };
    }

    if (new Date() > new Date(server.license_expires_at)) {
      return { valid: false, error: 'License has expired' };
    }

    return { valid: true, server };
  }

  // Renew license (extend expiration by 1 year)
  async renewLicense() {
    const db = getDB();
    
    try {
      const newExpiryDate = new Date();
      newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);

      await db.execute(
        'UPDATE game_servers SET license_expires_at = ?, updated_at = NOW() WHERE id = ?',
        [newExpiryDate, this.id]
      );

      this.license_expires_at = newExpiryDate;
    } catch (error) {
      throw error;
    }
  }

  // Deactivate license
  async deactivateLicense() {
    const db = getDB();
    
    try {
      await db.execute(
        'UPDATE game_servers SET is_license_active = 0, is_online = 0, updated_at = NOW() WHERE id = ?',
        [this.id]
      );

      this.is_license_active = false;
      this.is_online = false;
    } catch (error) {
      throw error;
    }
  }

  // Reactivate license
  async reactivateLicense() {
    const db = getDB();
    
    try {
      await db.execute(
        'UPDATE game_servers SET is_license_active = 1, updated_at = NOW() WHERE id = ?',
        [this.id]
      );

      this.is_license_active = true;
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

  // Update max players (called by game server)
  async updateMaxPlayers(maxPlayers) {
    const db = getDB();
    
    try {
      await db.execute(
        'UPDATE game_servers SET max_players = ?, updated_at = NOW() WHERE id = ?',
        [maxPlayers, this.id]
      );

      this.max_players = maxPlayers;
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