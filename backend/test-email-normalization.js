import validator from 'validator';
import { connectDB, getDB } from './src/config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function testEmailNormalization() {
  await connectDB();
  const db = getDB();
  
  const testEmails = [
    'test@example.com',
    'Test@Example.com',
    'TEST@EXAMPLE.COM',
    'test.user@example.com',
    'test.user+tag@gmail.com'
  ];
  
  console.log('Testing email normalization...\n');
  
  for (const email of testEmails) {
    // Normalize using validator's normalizeEmail (same as express-validator uses)
    const normalized = validator.normalizeEmail(email);
    console.log(`Original: ${email}`);
    console.log(`Normalized: ${normalized}`);
    console.log('---');
  }
  
  // Check what's actually in the database
  console.log('\nChecking database...');
  const [users] = await db.execute('SELECT id, username, email FROM users');
  console.log('Users in database:');
  console.log(users);
  
  // Test if normalization might cause lookup issues
  if (users.length > 0) {
    const dbEmail = users[0].email;
    const normalizedDbEmail = validator.normalizeEmail(dbEmail);
    
    console.log(`\nDatabase email: ${dbEmail}`);
    console.log(`Normalized DB email: ${normalizedDbEmail}`);
    
    // Try to find with both
    const [found1] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [dbEmail]
    );
    const [found2] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [normalizedDbEmail]
    );
    
    console.log(`Found with original: ${found1.length > 0}`);
    console.log(`Found with normalized: ${found2.length > 0}`);
  }
  
  process.exit(0);
}

testEmailNormalization();