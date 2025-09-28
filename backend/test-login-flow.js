import express from 'express';
import { connectDB } from './src/config/database.js';
import authRoutes from './src/routes/auth.js';
import dotenv from 'dotenv';

dotenv.config();

async function testLoginFlow() {
  // Initialize database
  await connectDB();
  
  // Create minimal Express app
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  
  // Start server
  const server = app.listen(0); // Random port
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);
  
  try {
    // Test login
    console.log('\nTesting login endpoint...');
    const loginResponse = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123' // You'll need to know the actual password
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response status:', loginResponse.status);
    console.log('Login response:', JSON.stringify(loginData, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    server.close();
    process.exit(0);
  }
}

testLoginFlow();