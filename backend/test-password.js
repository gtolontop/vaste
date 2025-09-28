import { connectDB } from './src/config/database.js';
import { User } from './src/models/User.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function testPassword() {
  await connectDB();
  
  console.log('Testing password validation...\n');
  
  // Find the test user
  const user = await User.findByEmail('test@example.com');
  
  if (!user) {
    console.log('User not found!');
    process.exit(1);
  }
  
  console.log('User found:', user.username);
  
  // Test various passwords
  const testPasswords = [
    'password123',
    'Password123',
    'PASSWORD123',
    'password123!',
    'testuser123',
    'test@example.com'
  ];
  
  for (const password of testPasswords) {
    const isValid = await user.validatePassword(password);
    console.log(`Password "${password}": ${isValid ? 'VALID' : 'INVALID'}`);
  }
  
  // Also test bcrypt directly with the stored hash
  console.log('\nStored password hash:', user.password);
  
  // Generate a new hash for 'Password123' to see the format
  const newHash = await bcrypt.hash('Password123', 12);
  console.log('New hash for "Password123":', newHash);
  
  process.exit(0);
}

testPassword();