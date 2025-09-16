import { body, validationResult } from 'express-validator';

// Middleware to handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Invalid data',
      errors: errors.array()
    });
  }
  next();
};

// Validation for registration
export const validateRegister = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, hyphens and underscores'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter and one number'),
  
  handleValidationErrors
];

// Validation for login
export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password required'),
  
  handleValidationErrors
];

// Validation for profile update
export const validateProfileUpdate = [
  body('username')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, hyphens and underscores'),
  
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  
  handleValidationErrors
];

// Validation for password change
export const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password required'),
  
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter and one number'),
  
  handleValidationErrors
];

// Validation for server creation
export const validateServerCreation = [
  body('name')
    .isLength({ min: 3, max: 100 })
    .withMessage('Server name must be between 3 and 100 characters'),
  
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  
  body('host')
    .notEmpty()
    .withMessage('Server address required'),
  
  body('port')
    .isInt({ min: 1, max: 65535 })
    .withMessage('Invalid port (1-65535)'),
  
  body('websocket_url')
    .isURL()
    .withMessage('Invalid WebSocket URL'),
  
  body('max_players')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Invalid maximum number of players (1-1000)'),
  
  handleValidationErrors
];