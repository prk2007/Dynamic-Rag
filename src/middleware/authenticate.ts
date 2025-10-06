import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JWTPayload } from '../auth/jwt.js';
import { findCustomerById, getCustomerConfig } from '../models/customer.js';

// Extend Express Request to include customer data
declare global {
  namespace Express {
    interface Request {
      customerId?: string;
      customerEmail?: string;
      customerConfig?: any;
    }
  }
}

/**
 * Authenticate JWT token middleware
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    let payload: JWTPayload;
    try {
      payload = await verifyAccessToken(token);
    } catch (error) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      return;
    }

    // Check if customer exists and is active
    const customer = await findCustomerById(payload.sub);

    if (!customer) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Customer not found',
      });
      return;
    }

    if (customer.status !== 'active') {
      res.status(403).json({
        error: 'Forbidden',
        message: `Account is ${customer.status}`,
      });
      return;
    }

    // Load customer config
    const config = await getCustomerConfig(customer.id);

    // Attach customer info to request
    req.customerId = customer.id;
    req.customerEmail = customer.email;
    req.customerConfig = config;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Optional authentication (don't fail if no token)
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  // If token exists, validate it
  await authenticate(req, res, next);
}
