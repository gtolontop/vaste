import { connectDB, getDB } from './src/config/database.js';
import { User } from './src/models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function testCompleteAuth() {
  await connectDB();
  const db = getDB();
  
  console.log('Testing complete registration and login flow...\n');
  
  // Test data
  const testUser = {
    username: 'testauth' + Date.now(),
    email: `testauth${Date.now()}@example.com`,
    password: 'TestPassword123'
  };
  
  try {
    // 1. Register new user
    console.log('1. Registering new user...');
    console.log('   Username:', testUser.username);
    console.log('   Email:', testUser.email);
    console.log('   Password:', testUser.password);
    
    const newUser = await User.create(testUser);
    console.log('   ✓ User created with ID:', newUser.id);
    console.log('   ✓ UUID:', newUser.uuid);
    
    // 2. Try to find user by email
    console.log('\n2. Finding user by email...');
    const foundUser = await User.findByEmail(testUser.email);
    console.log('   Found user:', foundUser ? 'YES' : 'NO');
    
    if (foundUser) {
      console.log('   ID matches:', foundUser.id === newUser.id);
      console.log('   Email matches:', foundUser.email === testUser.email);
      
      // 3. Validate password
      console.log('\n3. Validating password...');
      const isPasswordValid = await foundUser.validatePassword(testUser.password);
      console.log('   Password valid:', isPasswordValid ? 'YES' : 'NO');
      
      // 4. Check what's in the database
      console.log('\n4. Checking database directly...');
      const [dbCheck] = await db.execute(
        'SELECT id, email, is_active FROM users WHERE email = ?',
        [testUser.email]
      );
      console.log('   Database result:', dbCheck);
      
      // 5. Test with normalized email
      console.log('\n5. Testing with different email cases...');
      const upperEmail = testUser.email.toUpperCase();
      const foundUpper = await User.findByEmail(upperEmail);
      console.log('   Found with uppercase email:', foundUpper ? 'YES' : 'NO');
      
      // 6. Cleanup - delete test user
      console.log('\n6. Cleaning up...');
      await db.execute('DELETE FROM users WHERE id = ?', [newUser.id]);
      console.log('   ✓ Test user deleted');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
  
  process.exit(0);
}

testCompleteAuth();