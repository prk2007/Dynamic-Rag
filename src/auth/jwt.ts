import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../database/connection.js';
import { decrypt } from './encryption.js';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface JWTPayload {
  sub: string; // customer_id
  email: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/**
 * Generate access token with customer-specific secret
 */
export function generateAccessToken(
  customerId: string,
  email: string,
  jwtSecret: string
): string {
  const payload: JWTPayload = {
    sub: customerId,
    email: email,
  };

  return jwt.sign(payload, jwtSecret, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Generate refresh token with customer-specific secret
 */
export function generateRefreshToken(
  customerId: string,
  email: string,
  jwtRefreshSecret: string
): string {
  const payload: JWTPayload = {
    sub: customerId,
    email: email,
  };

  return jwt.sign(payload, jwtRefreshSecret, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
}

/**
 * Generate both access and refresh tokens with customer-specific secrets
 */
export async function generateTokenPair(
  customerId: string,
  email: string,
  jwtSecret: string,
  jwtRefreshSecret: string
): Promise<TokenPair> {
  const accessToken = generateAccessToken(customerId, email, jwtSecret);
  const refreshToken = generateRefreshToken(customerId, email, jwtRefreshSecret);

  // Store refresh token hash in database
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

  await query(
    `INSERT INTO refresh_tokens (customer_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [customerId, tokenHash, expiresAt]
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: JWT_EXPIRES_IN,
  };
}

/**
 * Get customer's JWT secrets from database
 */
async function getCustomerSecrets(customerId: string): Promise<{
  jwtSecret: string;
  jwtRefreshSecret: string;
}> {
  const result = await query(
    'SELECT jwt_secret, jwt_refresh_secret FROM customers WHERE id = $1',
    [customerId]
  );

  if (result.rows.length === 0) {
    throw new Error('Customer not found');
  }

  const { jwt_secret, jwt_refresh_secret } = result.rows[0];

  return {
    jwtSecret: decrypt(jwt_secret),
    jwtRefreshSecret: decrypt(jwt_refresh_secret),
  };
}

/**
 * Verify access token with customer-specific secret
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  try {
    // First decode without verification to get customer ID
    const decoded = jwt.decode(token) as JWTPayload;
    if (!decoded || !decoded.sub) {
      throw new Error('Invalid token format');
    }

    // Get customer's secret
    const { jwtSecret } = await getCustomerSecrets(decoded.sub);

    // Verify with customer's secret
    return jwt.verify(token, jwtSecret) as JWTPayload;
  } catch (error: any) {
    throw new Error('Invalid or expired access token');
  }
}

/**
 * Verify refresh token with customer-specific secret
 */
export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  try {
    // First decode without verification to get customer ID
    const decoded = jwt.decode(token) as JWTPayload;
    if (!decoded || !decoded.sub) {
      throw new Error('Invalid token format');
    }

    // Get customer's refresh secret
    const { jwtRefreshSecret } = await getCustomerSecrets(decoded.sub);

    // Verify with customer's refresh secret
    return jwt.verify(token, jwtRefreshSecret) as JWTPayload;
  } catch (error: any) {
    throw new Error('Invalid or expired refresh token');
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  // Verify refresh token (this will use customer's secret)
  const payload = await verifyRefreshToken(refreshToken);

  // Check if refresh token exists and is not revoked
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const result = await query(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1
     AND customer_id = $2
     AND expires_at > NOW()
     AND revoked = false`,
    [tokenHash, payload.sub]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid or revoked refresh token');
  }

  // Revoke old refresh token
  await query(
    `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
    [tokenHash]
  );

  // Get customer's secrets for new token pair
  const { jwtSecret, jwtRefreshSecret } = await getCustomerSecrets(payload.sub);

  // Generate new token pair with customer's secrets
  return generateTokenPair(payload.sub, payload.email, jwtSecret, jwtRefreshSecret);
}

/**
 * Revoke all refresh tokens for a customer (logout from all devices)
 */
export async function revokeAllTokens(customerId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked = true WHERE customer_id = $1`,
    [customerId]
  );
}

/**
 * Revoke specific refresh token (logout from one device)
 */
export async function revokeToken(refreshToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await query(
    `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
    [tokenHash]
  );
}

/**
 * Clean up expired tokens (should be run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await query(
    `DELETE FROM refresh_tokens WHERE expires_at < NOW()`
  );
  return result.rowCount || 0;
}
