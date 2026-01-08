import { Router, Request, Response } from 'express';
import User from '../models/User.js';
import { generateToken, authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../types/index.js';

const router = Router();

// POST /api/auth/register - Register new user
router.post('/register', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { email, password, name, role } = req.body;

  // Validation
  if (!email || !password || !name) {
    return res.status(400).json({
      success: false,
      error: 'Email, password, and name are required',
      timestamp: new Date().toISOString()
    });
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: 'User with this email already exists',
      timestamp: new Date().toISOString()
    });
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
    message: 'User registered successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/auth/login - Login user
router.post('/login', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required',
      timestamp: new Date().toISOString()
    });
  }

  // Find user (include password field for comparison)
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password',
      timestamp: new Date().toISOString()
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      error: 'Account is inactive. Please contact administrator.',
      timestamp: new Date().toISOString()
    });
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password',
      timestamp: new Date().toISOString()
    });
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
    message: 'Login successful',
    timestamp: new Date().toISOString()
  });
}));

// GET /api/auth/me - Get current user
router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated',
      timestamp: new Date().toISOString()
    });
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
