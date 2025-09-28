-- Vaste Multiplayer Voxel Game Database Schema
-- MySQL Database Schema for user management, game servers, and world data

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS vaste_db;
USE vaste_db;

-- Set character encoding
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ====================================
-- Core Tables (Existing)
-- ====================================

-- Users table for player accounts
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `uuid` VARCHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `profile_picture` TEXT NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `last_login` TIMESTAMP NULL,
    INDEX `idx_email` (`email`),
    INDEX `idx_username` (`username`),
    INDEX `idx_uuid` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Game servers table for server instances
CREATE TABLE IF NOT EXISTS `game_servers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `uuid` VARCHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `host` VARCHAR(255) NOT NULL,
    `port` INT NOT NULL DEFAULT 25565,
    `websocket_url` VARCHAR(500),
    `max_players` INT DEFAULT 20,
    `current_players` INT DEFAULT 0,
    `is_online` BOOLEAN DEFAULT FALSE,
    `is_public` BOOLEAN DEFAULT TRUE,
    `owner_id` INT NOT NULL,
    `version` VARCHAR(20) DEFAULT '1.0.0',
    `tags` JSON NULL,
    `license_key` VARCHAR(100) UNIQUE,
    `license_expires_at` TIMESTAMP NULL,
    `is_license_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `last_ping` TIMESTAMP NULL,
    INDEX `idx_uuid` (`uuid`),
    INDEX `idx_owner_id` (`owner_id`),
    INDEX `idx_public_online` (`is_public`, `is_online`),
    FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User sessions table for JWT token management
CREATE TABLE IF NOT EXISTS `user_sessions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `token_id` VARCHAR(36) NOT NULL UNIQUE,
    `jwt_token` TEXT NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `expires_at` TIMESTAMP NOT NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_token_id` (`token_id`),
    INDEX `idx_expires_at` (`expires_at`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server statistics table
CREATE TABLE IF NOT EXISTS `server_stats` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `server_id` INT NOT NULL UNIQUE,
    `total_players_served` INT DEFAULT 0,
    `peak_players` INT DEFAULT 0,
    `uptime_hours` DECIMAL(10,2) DEFAULT 0,
    `last_updated` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`server_id`) REFERENCES `game_servers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================
-- Game World Tables (New)
-- ====================================

-- Worlds table for different game maps
CREATE TABLE IF NOT EXISTS `worlds` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `uuid` VARCHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `server_id` INT NOT NULL,
    `seed` BIGINT NULL COMMENT 'Seed for procedural generation',
    `size_x` INT DEFAULT 1000,
    `size_y` INT DEFAULT 256,
    `size_z` INT DEFAULT 1000,
    `spawn_x` DOUBLE DEFAULT 0,
    `spawn_y` DOUBLE DEFAULT 64,
    `spawn_z` DOUBLE DEFAULT 0,
    `game_mode` ENUM('survival', 'creative', 'adventure', 'spectator') DEFAULT 'survival',
    `difficulty` ENUM('peaceful', 'easy', 'normal', 'hard') DEFAULT 'normal',
    `time_of_day` INT DEFAULT 0,
    `weather` ENUM('clear', 'rain', 'thunder') DEFAULT 'clear',
    `created_by` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_server_id` (`server_id`),
    INDEX `idx_uuid` (`uuid`),
    FOREIGN KEY (`server_id`) REFERENCES `game_servers`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Player data table for storing player state
CREATE TABLE IF NOT EXISTS `player_data` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `server_id` INT NOT NULL,
    `world_id` INT NOT NULL,
    `position_x` DOUBLE DEFAULT 0,
    `position_y` DOUBLE DEFAULT 64,
    `position_z` DOUBLE DEFAULT 0,
    `rotation_yaw` FLOAT DEFAULT 0,
    `rotation_pitch` FLOAT DEFAULT 0,
    `health` INT DEFAULT 20,
    `hunger` INT DEFAULT 20,
    `experience` INT DEFAULT 0,
    `level` INT DEFAULT 0,
    `inventory` JSON NULL COMMENT 'Player inventory as JSON',
    `equipment` JSON NULL COMMENT 'Equipped items as JSON',
    `game_mode` ENUM('survival', 'creative', 'adventure', 'spectator') DEFAULT 'survival',
    `is_flying` BOOLEAN DEFAULT FALSE,
    `last_seen` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_user_server` (`user_id`, `server_id`),
    INDEX `idx_world_id` (`world_id`),
    UNIQUE KEY `unique_player_world` (`user_id`, `world_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`server_id`) REFERENCES `game_servers`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Block changes table for tracking modifications
CREATE TABLE IF NOT EXISTS `block_changes` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `world_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    `action` ENUM('place', 'break') NOT NULL,
    `block_type` VARCHAR(50) NOT NULL,
    `x` INT NOT NULL,
    `y` INT NOT NULL,
    `z` INT NOT NULL,
    `previous_block_type` VARCHAR(50) NULL,
    `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_world_timestamp` (`world_id`, `timestamp`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_coordinates` (`world_id`, `x`, `y`, `z`),
    FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================
-- Permission and Achievement Tables
-- ====================================

-- Server permissions table
CREATE TABLE IF NOT EXISTS `server_permissions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `server_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    `role` ENUM('owner', 'admin', 'moderator', 'builder', 'player') DEFAULT 'player',
    `can_build` BOOLEAN DEFAULT TRUE,
    `can_break` BOOLEAN DEFAULT TRUE,
    `can_use_commands` BOOLEAN DEFAULT FALSE,
    `can_manage_world` BOOLEAN DEFAULT FALSE,
    `can_kick_players` BOOLEAN DEFAULT FALSE,
    `can_ban_players` BOOLEAN DEFAULT FALSE,
    `granted_by` INT NOT NULL,
    `granted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `unique_server_user` (`server_id`, `user_id`),
    INDEX `idx_server_id` (`server_id`),
    INDEX `idx_user_id` (`user_id`),
    FOREIGN KEY (`server_id`) REFERENCES `game_servers`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Player achievements table
CREATE TABLE IF NOT EXISTS `player_achievements` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `achievement_id` VARCHAR(50) NOT NULL,
    `server_id` INT NOT NULL,
    `unlocked_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `data` JSON NULL COMMENT 'Additional achievement data',
    UNIQUE KEY `unique_user_achievement_server` (`user_id`, `achievement_id`, `server_id`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_server_id` (`server_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`server_id`) REFERENCES `game_servers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================
-- Protection and Region Tables
-- ====================================

-- Block protection regions table
CREATE TABLE IF NOT EXISTS `block_protection` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `world_id` INT NOT NULL,
    `owner_id` INT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `min_x` INT NOT NULL,
    `min_y` INT NOT NULL,
    `min_z` INT NOT NULL,
    `max_x` INT NOT NULL,
    `max_y` INT NOT NULL,
    `max_z` INT NOT NULL,
    `allowed_users` JSON NULL COMMENT 'Array of user IDs allowed to build',
    `protection_flags` JSON NULL COMMENT 'Protection settings (pvp, mob_spawn, etc)',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_world_id` (`world_id`),
    INDEX `idx_owner_id` (`owner_id`),
    INDEX `idx_coordinates` (`world_id`, `min_x`, `min_z`, `max_x`, `max_z`),
    FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================
-- Chat and Communication Tables
-- ====================================

-- Chat messages table
CREATE TABLE IF NOT EXISTS `chat_messages` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `server_id` INT NOT NULL,
    `world_id` INT NULL,
    `user_id` INT NOT NULL,
    `message` TEXT NOT NULL,
    `message_type` ENUM('chat', 'whisper', 'broadcast', 'system') DEFAULT 'chat',
    `recipient_id` INT NULL COMMENT 'For whisper messages',
    `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_server_timestamp` (`server_id`, `timestamp`),
    INDEX `idx_user_id` (`user_id`),
    FOREIGN KEY (`server_id`) REFERENCES `game_servers`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
    FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================
-- Server Management Tables
-- ====================================

-- Server bans table
CREATE TABLE IF NOT EXISTS `server_bans` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `server_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    `reason` TEXT NULL,
    `banned_by` INT NOT NULL,
    `banned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `expires_at` TIMESTAMP NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    UNIQUE KEY `unique_server_user_ban` (`server_id`, `user_id`),
    INDEX `idx_server_id` (`server_id`),
    INDEX `idx_user_id` (`user_id`),
    FOREIGN KEY (`server_id`) REFERENCES `game_servers`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`banned_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server whitelist table
CREATE TABLE IF NOT EXISTS `server_whitelist` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `server_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    `added_by` INT NOT NULL,
    `added_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `unique_server_user_whitelist` (`server_id`, `user_id`),
    INDEX `idx_server_id` (`server_id`),
    FOREIGN KEY (`server_id`) REFERENCES `game_servers`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`added_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================
-- Block and Item Definitions
-- ====================================

-- Block types registry table
CREATE TABLE IF NOT EXISTS `block_types` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `block_id` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(100) NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `texture_path` VARCHAR(255) NULL,
    `properties` JSON NULL COMMENT 'Block properties (hardness, transparency, etc)',
    `is_custom` BOOLEAN DEFAULT FALSE,
    `created_by` INT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_category` (`category`),
    INDEX `idx_block_id` (`block_id`),
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================
-- Analytics and Metrics Tables
-- ====================================

-- Player statistics table
CREATE TABLE IF NOT EXISTS `player_stats` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `server_id` INT NOT NULL,
    `blocks_placed` BIGINT DEFAULT 0,
    `blocks_broken` BIGINT DEFAULT 0,
    `distance_walked` BIGINT DEFAULT 0,
    `time_played_minutes` BIGINT DEFAULT 0,
    `deaths` INT DEFAULT 0,
    `kills` INT DEFAULT 0,
    `last_updated` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `unique_user_server_stats` (`user_id`, `server_id`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_server_id` (`server_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`server_id`) REFERENCES `game_servers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================
-- Stored Procedures
-- ====================================

DELIMITER //

-- Procedure to clean up expired sessions
CREATE PROCEDURE IF NOT EXISTS cleanup_expired_sessions()
BEGIN
    UPDATE `user_sessions` 
    SET `is_active` = FALSE 
    WHERE `expires_at` < NOW() AND `is_active` = TRUE;
END//

-- Procedure to update server player count
CREATE PROCEDURE IF NOT EXISTS update_server_player_count(IN server_id_param INT)
BEGIN
    DECLARE player_count INT;
    
    SELECT COUNT(DISTINCT user_id) INTO player_count
    FROM `player_data`
    WHERE `server_id` = server_id_param
    AND `last_seen` > DATE_SUB(NOW(), INTERVAL 5 MINUTE);
    
    UPDATE `game_servers`
    SET `current_players` = player_count
    WHERE `id` = server_id_param;
    
    -- Update peak players if necessary
    UPDATE `server_stats` ss
    SET ss.`peak_players` = GREATEST(ss.`peak_players`, player_count)
    WHERE ss.`server_id` = server_id_param;
END//

-- Procedure to record player login
CREATE PROCEDURE IF NOT EXISTS record_player_login(
    IN user_id_param INT,
    IN server_id_param INT,
    IN world_id_param INT
)
BEGIN
    -- Update user last login
    UPDATE `users` SET `last_login` = NOW() WHERE `id` = user_id_param;
    
    -- Insert or update player data
    INSERT INTO `player_data` (`user_id`, `server_id`, `world_id`)
    VALUES (user_id_param, server_id_param, world_id_param)
    ON DUPLICATE KEY UPDATE `last_seen` = NOW();
    
    -- Update server stats
    UPDATE `server_stats` ss
    SET ss.`total_players_served` = ss.`total_players_served` + 1
    WHERE ss.`server_id` = server_id_param;
    
    -- Update server player count
    CALL update_server_player_count(server_id_param);
END//

DELIMITER ;

-- ====================================
-- Views
-- ====================================

-- View for active servers with player counts
CREATE OR REPLACE VIEW `active_servers_view` AS
SELECT 
    gs.`id`,
    gs.`uuid`,
    gs.`name`,
    gs.`description`,
    gs.`host`,
    gs.`port`,
    gs.`websocket_url`,
    gs.`max_players`,
    gs.`current_players`,
    gs.`is_online`,
    gs.`is_public`,
    gs.`version`,
    u.`username` AS owner_username,
    ss.`peak_players`,
    ss.`total_players_served`
FROM `game_servers` gs
LEFT JOIN `users` u ON gs.`owner_id` = u.`id`
LEFT JOIN `server_stats` ss ON gs.`id` = ss.`server_id`
WHERE gs.`is_online` = TRUE;

-- View for player leaderboard
CREATE OR REPLACE VIEW `player_leaderboard_view` AS
SELECT 
    u.`id`,
    u.`username`,
    SUM(ps.`blocks_placed`) AS total_blocks_placed,
    SUM(ps.`blocks_broken`) AS total_blocks_broken,
    SUM(ps.`time_played_minutes`) AS total_time_played,
    COUNT(DISTINCT ps.`server_id`) AS servers_played
FROM `users` u
INNER JOIN `player_stats` ps ON u.`id` = ps.`user_id`
GROUP BY u.`id`, u.`username`
ORDER BY total_blocks_placed DESC;

-- ====================================
-- Indexes for Performance
-- ====================================

-- Additional indexes for common queries
CREATE INDEX `idx_block_changes_recent` ON `block_changes` (`timestamp` DESC);
CREATE INDEX `idx_chat_messages_recent` ON `chat_messages` (`server_id`, `timestamp` DESC);
CREATE INDEX `idx_player_data_active` ON `player_data` (`server_id`, `last_seen`);

-- ====================================
-- Initial Data
-- ====================================

-- Insert default block types
INSERT INTO `block_types` (`block_id`, `name`, `category`, `properties`) VALUES
('air', 'Air', 'basic', '{"transparent": true, "solid": false}'),
('stone', 'Stone', 'basic', '{"hardness": 1.5}'),
('dirt', 'Dirt', 'basic', '{"hardness": 0.5}'),
('grass', 'Grass Block', 'basic', '{"hardness": 0.6}'),
('wood', 'Wood', 'basic', '{"hardness": 2.0}'),
('water', 'Water', 'liquid', '{"transparent": true, "solid": false, "liquid": true}'),
('sand', 'Sand', 'basic', '{"hardness": 0.5}'),
('glass', 'Glass', 'basic', '{"transparent": true, "hardness": 0.3}')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- ====================================
-- Triggers
-- ====================================

DELIMITER //

-- Trigger to create server stats entry when new server is created
CREATE TRIGGER IF NOT EXISTS after_server_insert
AFTER INSERT ON `game_servers`
FOR EACH ROW
BEGIN
    INSERT INTO `server_stats` (`server_id`) VALUES (NEW.`id`);
END//

-- Trigger to update player stats
CREATE TRIGGER IF NOT EXISTS after_block_change
AFTER INSERT ON `block_changes`
FOR EACH ROW
BEGIN
    IF NEW.`action` = 'place' THEN
        INSERT INTO `player_stats` (`user_id`, `server_id`, `blocks_placed`)
        SELECT NEW.`user_id`, gs.`id`, 1
        FROM `worlds` w
        INNER JOIN `game_servers` gs ON w.`server_id` = gs.`id`
        WHERE w.`id` = NEW.`world_id`
        ON DUPLICATE KEY UPDATE `blocks_placed` = `blocks_placed` + 1;
    ELSEIF NEW.`action` = 'break' THEN
        INSERT INTO `player_stats` (`user_id`, `server_id`, `blocks_broken`)
        SELECT NEW.`user_id`, gs.`id`, 1
        FROM `worlds` w
        INNER JOIN `game_servers` gs ON w.`server_id` = gs.`id`
        WHERE w.`id` = NEW.`world_id`
        ON DUPLICATE KEY UPDATE `blocks_broken` = `blocks_broken` + 1;
    END IF;
END//

DELIMITER ;

-- ====================================
-- Permissions
-- ====================================

-- Grant stored procedure permissions (adjust user as needed)
-- GRANT EXECUTE ON PROCEDURE vaste_db.cleanup_expired_sessions TO 'vaste_user'@'localhost';
-- GRANT EXECUTE ON PROCEDURE vaste_db.update_server_player_count TO 'vaste_user'@'localhost';
-- GRANT EXECUTE ON PROCEDURE vaste_db.record_player_login TO 'vaste_user'@'localhost';