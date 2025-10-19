import express, { Request, Response } from 'express';
import {
  createCustomer,
  findCustomerByEmail,
  findCustomerById,
  getCustomerJWTSecrets,
  updateEmailVerificationToken,
  markEmailAsVerified,
} from '../models/customer.js';
import { verifyPassword, validatePassword } from '../auth/password.js';
import {
  generateTokenPair,
  refreshAccessToken,
  revokeToken,
  revokeAllTokens,
} from '../auth/jwt.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  generateVerificationToken,
  getExpirationTimestamp,
  verifyToken as verifyEmailToken,
  checkResendRateLimit,
} from '../services/verification.service.js';
import { createEmailVerification } from '../models/email-verification.js';
import { emailService } from '../services/email/email.service.js';
import {
  generateVerificationEmail,
  generateVerificationEmailText,
} from '../services/email/templates/verification.html.js';
import {
  generateWelcomeEmail,
  generateWelcomeEmailText,
} from '../services/email/templates/welcome.html.js';

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

    // Create customer (status: pending_verification, email_verified: false)
    const customer = await createCustomer({
      email,
      password,
      company_name,
      openai_api_key,
    });

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const expiresAt = getExpirationTimestamp();

    // Store verification token in database
    await updateEmailVerificationToken(customer.id, verificationToken, expiresAt);

    // Log verification attempt in email_verifications table
    await createEmailVerification({
      customer_id: customer.id,
      token: verificationToken,
      expires_at: expiresAt,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

    const htmlContent = generateVerificationEmail({
      email: customer.email,
      verificationUrl,
      companyName: customer.company_name || undefined,
    });

    const textContent = generateVerificationEmailText({
      email: customer.email,
      verificationUrl,
      companyName: customer.company_name || undefined,
    });

    try {
      await emailService.send({
        to: customer.email,
        subject: 'Verify Your Email - Dynamic RAG',
        html: htmlContent,
        text: textContent,
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail signup if email fails, customer can resend
    }

    res.status(201).json({
      message: 'Account created successfully. Please check your email to verify your account.',
      customer: {
        id: customer.id,
        email: customer.email,
        company_name: customer.company_name,
        created_at: customer.created_at,
        status: customer.status,
        email_verified: customer.email_verified,
      },
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

    // Check email verification (CRITICAL for security)
    if (!customer.email_verified) {
      res.status(403).json({
        error: 'Email Not Verified',
        message: 'Please verify your email address before logging in. Check your inbox for the verification link.',
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

    // Verify password (check if password exists - for future SSO compatibility)
    if (!customer.password_hash) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'This account uses SSO authentication. Please login with your SSO provider.',
      });
      return;
    }

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
        status: customer.status,
        email_verified: customer.email_verified,
        created_at: customer.created_at,
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
        email_verified: customer.email_verified,
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

/**
 * GET /api/auth/verify-email
 * Verify email address with token
 */
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Verification token is required',
      });
      return;
    }

    // Verify the token
    const result = await verifyEmailToken(token, req.ip, req.headers['user-agent']);

    if (!result.success) {
      res.status(400).json({
        error: 'Verification Failed',
        message: result.error || 'Invalid or expired token',
      });
      return;
    }

    // Send welcome email
    const customer = await findCustomerById(result.customerId!);
    if (customer) {
      const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      const htmlContent = generateWelcomeEmail({
        email: customer.email,
        companyName: customer.company_name || undefined,
        dashboardUrl,
        apiKey: customer.api_key,
      });

      const textContent = generateWelcomeEmailText({
        email: customer.email,
        companyName: customer.company_name || undefined,
        dashboardUrl,
        apiKey: customer.api_key,
      });

      try {
        await emailService.send({
          to: customer.email,
          subject: 'Welcome to Dynamic RAG - Account Activated',
          html: htmlContent,
          text: textContent,
        });
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail verification if welcome email fails
      }
    }

    res.json({
      success: true,
      message: 'Email verified successfully! Your account is now active.',
      email: result.email,
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify email',
    });
  }
});

/**
 * POST /api/auth/resend-verification
 * Resend verification email (rate limited)
 */
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Email is required',
      });
      return;
    }

    // Find customer
    const customer = await findCustomerByEmail(email);
    if (!customer) {
      // Don't reveal if email exists or not (security best practice)
      res.json({
        message: 'If this email is registered, a verification link has been sent.',
      });
      return;
    }

    // Check if already verified
    if (customer.email_verified) {
      res.status(400).json({
        error: 'Already Verified',
        message: 'This email address is already verified.',
      });
      return;
    }

    // Check rate limit
    const rateLimitCheck = await checkResendRateLimit(email);
    if (!rateLimitCheck.canResend) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: `You can request a new verification email after ${rateLimitCheck.retryAfter?.toLocaleTimeString()}`,
        retryAfter: rateLimitCheck.retryAfter,
      });
      return;
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken();
    const expiresAt = getExpirationTimestamp();

    // Store new token
    await updateEmailVerificationToken(customer.id, verificationToken, expiresAt);

    // Log verification attempt
    await createEmailVerification({
      customer_id: customer.id,
      token: verificationToken,
      expires_at: expiresAt,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

    const htmlContent = generateVerificationEmail({
      email: customer.email,
      verificationUrl,
      companyName: customer.company_name || undefined,
    });

    const textContent = generateVerificationEmailText({
      email: customer.email,
      verificationUrl,
      companyName: customer.company_name || undefined,
    });

    await emailService.send({
      to: customer.email,
      subject: 'Verify Your Email - Dynamic RAG',
      html: htmlContent,
      text: textContent,
    });

    res.json({
      message: 'Verification email sent successfully. Please check your inbox.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to resend verification email',
    });
  }
});

export default router;
