import { getDB } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export class User {
  constructor(data) {
    this.id = data.id;
    this.uuid = data.uuid;
    this.username = data.username;
    this.email = data.email;
    this.password = data.password;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_login = data.last_login;
    this.is_active = data.is_active;
    this.profile_picture = data.profile_picture;
  }

  // Create new user
  static async create({ username, email, password }) {
    const db = getDB();
    
    try {
      // Check if user already exists
      const [existingUsers] = await db.execute(
        'SELECT id FROM users WHERE email = ? OR username = ?',
        [email, username]
      );

      if (existingUsers.length > 0) {
        throw new Error('A user with this email or username already exists');
      }

      // Hash password
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Generate unique UUID
      const userUuid = uuidv4();

      // Insert new user
      const [result] = await db.execute(
        `INSERT INTO users (uuid, username, email, password, created_at, updated_at, is_active) 
         VALUES (?, ?, ?, ?, NOW(), NOW(), 1)`,
        [userUuid, username, email, hashedPassword]
      );

      // Get created user
      const [users] = await db.execute(
        'SELECT * FROM users WHERE id = ?',
        [result.insertId]
      );

      return new User(users[0]);
    } catch (error) {
      throw error;
    }
  }

  // Find user by email
  static async findByEmail(email) {
    const db = getDB();
    
    try {
      const [users] = await db.execute(
        'SELECT * FROM users WHERE email = ? AND is_active = 1',
        [email]
      );

      return users.length > 0 ? new User(users[0]) : null;
    } catch (error) {
      throw error;
    }
  }

  // Find user by UUID
  static async findByUuid(uuid) {
    const db = getDB();
    
    try {
      const [users] = await db.execute(
        'SELECT * FROM users WHERE uuid = ? AND is_active = 1',
        [uuid]
      );

      return users.length > 0 ? new User(users[0]) : null;
    } catch (error) {
      throw error;
    }
  }

  // Find user by ID
  static async findById(id) {
    const db = getDB();
    
    try {
      const [users] = await db.execute(
        'SELECT * FROM users WHERE id = ? AND is_active = 1',
        [id]
      );

      return users.length > 0 ? new User(users[0]) : null;
    } catch (error) {
      throw error;
    }
  }

  // Validate password
  async validatePassword(password) {
    return await bcrypt.compare(password, this.password);
  }

  // Update last login
  async updateLastLogin() {
    const db = getDB();
    
    try {
      await db.execute(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [this.id]
      );
    } catch (error) {
      throw error;
    }
  }

  // Update profile
  async updateProfile({ username, email, profile_picture }) {
    const db = getDB();
    
    try {
      await db.execute(
        'UPDATE users SET username = ?, email = ?, profile_picture = ?, updated_at = NOW() WHERE id = ?',
        [username || this.username, email || this.email, profile_picture || this.profile_picture, this.id]
      );

      // Reload data
      const user = await User.findById(this.id);
      Object.assign(this, user);
    } catch (error) {
      throw error;
    }
  }

  // Change password
  async changePassword(newPassword) {
    const db = getDB();
    
    try {
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      await db.execute(
        'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
        [hashedPassword, this.id]
      );
    } catch (error) {
      throw error;
    }
  }

  // Deactivate user
  async deactivate() {
    const db = getDB();
    
    try {
      await db.execute(
        'UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?',
        [this.id]
      );
    } catch (error) {
      throw error;
    }
  }

  // Serialize for API (exclude password)
  toJSON() {
    const { password, ...userWithoutPassword } = this;
    return userWithoutPassword;
  }
}