import { connectDB, closeDB } from '../src/config/database.js';

const createTables = async () => {
  const db = await connectDB();
  
  try {
    console.log('[MIGRATION] Creating tables...');

    // Users table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uuid VARCHAR(36) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        profile_picture VARCHAR(255) DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        INDEX idx_email (email),
        INDEX idx_username (username),
        INDEX idx_uuid (uuid)
      ) ENGINE=InnoDB
    `);
    console.log('[MIGRATION] Users table created');

    // Game servers table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS game_servers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uuid VARCHAR(36) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        host VARCHAR(255) NOT NULL,
        port INT NOT NULL,
        websocket_url VARCHAR(255) NOT NULL,
        max_players INT DEFAULT 10,
        current_players INT DEFAULT 0,
        is_online BOOLEAN DEFAULT FALSE,
        is_public BOOLEAN DEFAULT TRUE,
        owner_id INT NOT NULL,
        version VARCHAR(20) DEFAULT '1.0.0',
        tags VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_ping TIMESTAMP NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_uuid (uuid),
        INDEX idx_owner (owner_id),
        INDEX idx_public_online (is_public, is_online)
      ) ENGINE=InnoDB
    `);
    console.log('[MIGRATION] Game servers table created');

    // Sessions table (optional for token management)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_id VARCHAR(36) UNIQUE NOT NULL,
        jwt_token TEXT NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_token_id (token_id),
        INDEX idx_expires_at (expires_at)
      ) ENGINE=InnoDB
    `);
    console.log('[MIGRATION] User sessions table created');

    // Server statistics table (for future features)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS server_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        server_id INT NOT NULL,
        total_players_served INT DEFAULT 0,
        peak_players INT DEFAULT 0,
        uptime_hours DECIMAL(10,2) DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES game_servers(id) ON DELETE CASCADE,
        INDEX idx_server_id (server_id)
      ) ENGINE=InnoDB
    `);
    console.log('[MIGRATION] Server stats table created');

    console.log('[MIGRATION] All tables created successfully!');

  } catch (error) {
    console.error('[MIGRATION] Error creating tables:', error.message);
    process.exit(1);
  } finally {
    await closeDB();
  }
};

// Exécuter les migrations
createTables();