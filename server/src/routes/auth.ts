import { Router, Request, Response } from 'express';
import User from '../models/User.js';
import { generateToken, authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../types/index.js';
import { ValidationError, DuplicateError, UnauthorizedError, assert, validate } from '../utils/errors.js';

const router = Router();

// POST /api/auth/register - Register new user
router.post('/register', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { email, password, name, role } = req.body;

  // Validation with descriptive error messages
  assert.required({ email, password, name }, {
    email: 'Email address',
    password: 'Password',
    name: 'Full name'
  });

  assert.validEmail(email, 'Email address');

  // Password strength validation
  if (password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters long');
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new DuplicateError(`An account with email "${email}" already exists. Please use a different email or try logging in.`);
  }

  // Validate role if provided
  if (role && !['user', 'admin', 'superadmin'].includes(role)) {
    throw new ValidationError('Invalid role. Must be one of: user, admin, superadmin');
  }

  // Create user (default role is 'user' unless specified)
  const user = await User.create({
    email: email.toLowerCase(),
    password,
    name,
    role: role || 'user'
  });

  // Generate token
  const token = generateToken(user);

  return res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token
    },
    message: 'Account created successfully. Welcome!',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/auth/login - Login user
router.post('/login', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { email, password } = req.body;

  // Validation with descriptive error messages
  if (!email && !password) {
    throw new ValidationError('Please enter your email and password to login');
  }
  if (!email) {
    throw new ValidationError('Please enter your email address');
  }
  if (!password) {
    throw new ValidationError('Please enter your password');
  }

  if (!validate.isValidEmail(email)) {
    throw new ValidationError('Please enter a valid email address');
  }

  // Find user (include password field for comparison)
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  
  if (!user) {
    throw new UnauthorizedError('No account found with this email. Please check your email or create a new account.');
  }

  // Check if user is active
  if (!user.isActive) {
    throw new UnauthorizedError('Your account has been deactivated. Please contact the administrator for assistance.');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    throw new UnauthorizedError('Incorrect password. Please try again or reset your password.');
  }

  // Generate token
  const token = generateToken(user);

  return res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token
    },
    message: 'Login successful. Welcome back!',
    timestamp: new Date().toISOString()
  });
}));

// GET /api/auth/me - Get current user
router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  if (!req.user) {
    throw new UnauthorizedError('Your session has expired. Please log in again.');
  }

  return res.json({
    success: true,
    data: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      isActive: req.user.isActive
    },
    message: 'User data retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

export default router;
