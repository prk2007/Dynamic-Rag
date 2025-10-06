import express, { Request, Response } from 'express';
import {
  createCustomer,
  findCustomerByEmail,
  findCustomerById,
  getCustomerJWTSecrets,
} from '../models/customer.js';
import { verifyPassword, validatePassword } from '../auth/password.js';
import {
  generateTokenPair,
  refreshAccessToken,
  revokeToken,
  revokeAllTokens,
} from '../auth/jwt.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();

/**
 * POST /api/auth/signup
 * Create new customer account
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, company_name, openai_api_key } = req.body;

    // Validate required fields
    if (!email || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid email format',
      });
      return;
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors,
      });
      return;
    }

    // Check if email already exists
    const existing = await findCustomerByEmail(email);
    if (existing) {
      res.status(409).json({
        error: 'Conflict',
        message: 'Email already registered',
      });
      return;
    }

    // Create customer (this generates unique JWT secrets)
    const customer = await createCustomer({
      email,
      password,
      company_name,
      openai_api_key,
    });

    // Get customer's JWT secrets
    const { jwtSecret, jwtRefreshSecret } = await getCustomerJWTSecrets(customer.id);

    // Generate tokens with customer's secrets
    const tokens = await generateTokenPair(customer.id, customer.email, jwtSecret, jwtRefreshSecret);

    res.status(201).json({
      message: 'Account created successfully',
      customer: {
        id: customer.id,
        email: customer.email,
        company_name: customer.company_name,
        api_key: customer.api_key,
        created_at: customer.created_at,
      },
      ...tokens,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create account',
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
      return;
    }

    // Find customer
    const customer = await findCustomerByEmail(email);
    if (!customer) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

    // Check account status
    if (customer.status !== 'active') {
      res.status(403).json({
        error: 'Forbidden',
        message: `Account is ${customer.status}`,
      });
      return;
    }

    // Verify password
    const valid = await verifyPassword(password, customer.password_hash);
    if (!valid) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

    // Get customer's JWT secrets
    const { jwtSecret, jwtRefreshSecret } = await getCustomerJWTSecrets(customer.id);

    // Generate tokens with customer's secrets
    const tokens = await generateTokenPair(customer.id, customer.email, jwtSecret, jwtRefreshSecret);

    res.json({
      message: 'Login successful',
      customer: {
        id: customer.id,
        email: customer.email,
        company_name: customer.company_name,
        api_key: customer.api_key,
      },
      ...tokens,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed',
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token is required',
      });
      return;
    }

    // Refresh tokens
    const tokens = await refreshAccessToken(refreshToken);

    res.json({
      message: 'Token refreshed successfully',
      ...tokens,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired refresh token',
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (revoke refresh token)
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await revokeToken(refreshToken);
    }

    res.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed',
    });
  }
});

/**
 * POST /api/auth/logout-all
 * Logout from all devices (revoke all refresh tokens)
 */
router.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  try {
    await revokeAllTokens(req.customerId!);

    res.json({
      message: 'Logged out from all devices',
    });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed',
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const customer = await findCustomerById(req.customerId!);

    if (!customer) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Customer not found',
      });
      return;
    }

    res.json({
      customer: {
        id: customer.id,
        email: customer.email,
        company_name: customer.company_name,
        api_key: customer.api_key,
        status: customer.status,
        created_at: customer.created_at,
      },
      config: req.customerConfig,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get user info',
    });
  }
});

export default router;
