import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vaste_backend',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
};

// Connection pool
let pool;

export const connectDB = async () => {
  try {
    // Create connection without database first to create it if needed
    const tempConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password
    });

    // Create database if it doesn't exist
    await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    await tempConnection.end();

    // Create pool with database
    pool = mysql.createPool(dbConfig);
    
    // Test connection
    const connection = await pool.getConnection();
    console.log(`[DATABASE] Connected to MySQL (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})`);
    connection.release();

    return pool;
  } catch (error) {
    console.error('[DATABASE] Connection error:', error.message);
    process.exit(1);
  }
};

export const getDB = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return pool;
};

export const closeDB = async () => {
  if (pool) {
    await pool.end();
    console.log('[DATABASE] Connection closed');
  }
};