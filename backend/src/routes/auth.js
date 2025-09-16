import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { 
  validateRegister, 
  validateLogin, 
  validateProfileUpdate, 
  validatePasswordChange 
} from '../middleware/validation.js';

const router = express.Router();

// Registration
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Create user
    const user = await User.create({ username, email, password });

    // Generate JWT token
    const token = jwt.sign(
      { 
        uuid: user.uuid, 
        username: user.username,
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    console.error('[AUTH] Registration error:', error.message);
    res.status(400).json({
      success: false,
      message: error.message.includes('already exists') 
        ? error.message 
        : 'Error creating account'
    });
  }
});

// Login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect email or password'
      });
    }

    // Verify password
    const isPasswordValid = await user.validatePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect email or password'
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate JWT token
    const token = jwt.sign(
      { 
        uuid: user.uuid, 
        username: user.username,
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    console.error('[AUTH] Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error during login'
    });
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user.toJSON()
      }
    });
  } catch (error) {
    console.error('[AUTH] Profile error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error retrieving profile'
    });
  }
});

// Update profile
router.put('/profile', authenticateToken, validateProfileUpdate, async (req, res) => {
  try {
    const { username, email } = req.body;
    
    await req.user.updateProfile({ username, email });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: req.user.toJSON()
      }
    });

  } catch (error) {
    console.error('[AUTH] Profile update error:', error.message);
    res.status(400).json({
      success: false,
      message: error.message.includes('already used') 
        ? 'This username or email is already used' 
        : 'Error updating profile'
    });
  }
});

// Change password
router.put('/password', authenticateToken, validatePasswordChange, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isCurrentPasswordValid = await req.user.validatePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password incorrect'
      });
    }

    // Change password
    await req.user.changePassword(newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('[AUTH] Password change error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error changing password'
    });
  }
});

// Verify token validity
router.get('/verify', authenticateToken, async (req, res) => {
  res.json({
    success: true,
    message: 'Token valid',
    data: {
      user: req.user.toJSON()
    }
  });
});

// Logout (client-side, token will be simply removed)
router.post('/logout', authenticateToken, async (req, res) => {
  // For real logout, we could blacklist the token
  // For now, we just confirm the logout
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

export default router;