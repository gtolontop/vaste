import { connectDB } from './src/config/database.js';
import { User } from './src/models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function testUserModel() {
  // Initialize database connection
  await connectDB();
  
  try {
    console.log('Testing User.findByEmail method...\n');
    
    const testEmail = 'test@example.com';
    console.log('Looking for user with email:', testEmail);
    
    const user = await User.findByEmail(testEmail);
    
    if (user) {
      console.log('\nUser found!');
      console.log('ID:', user.id);
      console.log('Username:', user.username);
      console.log('Email:', user.email);
      console.log('UUID:', user.uuid);
      console.log('Is Active:', user.is_active);
    } else {
      console.log('\nUser NOT found with User.findByEmail()');
      
      // Let's debug by checking the database directly
      const { getDB } = await import('./src/config/database.js');
      const db = getDB();
      
      const [allUsers] = await db.execute('SELECT id, username, email, is_active FROM users');
      console.log('\nAll users in database:');
      console.log(allUsers);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testUserModel();