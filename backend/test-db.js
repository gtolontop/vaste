import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vaste_backend'
  });

  try {
    console.log('Connected to database:', process.env.DB_NAME || 'vaste_backend');
    
    // Check if users table exists
    const [tables] = await connection.execute("SHOW TABLES LIKE 'users'");
    console.log('Users table exists:', tables.length > 0);
    
    // Get all users
    const [users] = await connection.execute('SELECT id, username, email, created_at FROM users');
    console.log('\nAll users in database:');
    console.log(users);
    
    // Check for case sensitivity issues
    if (users.length > 0) {
      const testEmail = users[0].email;
      console.log('\nTesting email lookup for:', testEmail);
      
      const [foundByEmail] = await connection.execute(
        'SELECT id, username, email FROM users WHERE email = ?',
        [testEmail]
      );
      console.log('Found by exact email:', foundByEmail);
      
      const [foundByEmailCase] = await connection.execute(
        'SELECT id, username, email FROM users WHERE LOWER(email) = LOWER(?)',
        [testEmail]
      );
      console.log('Found by case-insensitive email:', foundByEmailCase);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

testDatabase();