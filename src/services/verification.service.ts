/**
 * Verification Service
 * Handles token generation, validation, and rate limiting for email verification
 */

import crypto from 'crypto';
import { pool } from '../database/connection.js';

export interface VerificationToken {
  token: string;
  expiresAt: Date;
}

export interface VerificationAttempt {
  customerId: string;
  email: string;
  attemptCount: number;
  lastAttemptAt: Date;
}

/**
 * Generate a cryptographically secure verification token
 * @returns 64-character hex string (32 bytes)
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculate expiration timestamp (24 hours from now)
 */
export function getExpirationTimestamp(): Date {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt;
}

/**
 * Validate verification token format
 */
export function isValidTokenFormat(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}

/**
 * Check if customer can request a new verification email (rate limiting)
 * Rate limit: 3 attempts per hour
 * @param email Customer email
 * @returns Object with canResend boolean and retryAfter timestamp if rate limited
 */
export async function checkResendRateLimit(
  email: string
): Promise<{ canResend: boolean; retryAfter?: Date; attemptCount?: number }> {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const result = await pool.query(
    `
    SELECT COUNT(*) as attempt_count, MAX(created_at) as last_attempt
    FROM email_verifications
    WHERE customer_id = (SELECT id FROM customers WHERE email = $1)
      AND created_at > $2
      AND verified_at IS NULL
    `,
    [email, oneHourAgo]
  );

  const attemptCount = parseInt(result.rows[0].attempt_count);
  const lastAttempt = result.rows[0].last_attempt;

  const maxAttemptsPerHour = parseInt(process.env.EMAIL_RESEND_LIMIT_PER_HOUR || '3');

  if (attemptCount >= maxAttemptsPerHour) {
    // Calculate when they can retry (1 hour after the last attempt)
    const retryAfter = new Date(lastAttempt);
    retryAfter.setHours(retryAfter.getHours() + 1);

    return {
      canResend: false,
      retryAfter,
      attemptCount,
    };
  }

  return {
    canResend: true,
    attemptCount,
  };
}

/**
 * Store verification token in database
 */
export async function storeVerificationToken(
  customerId: string,
  token: string,
  expiresAt: Date,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await pool.query(
    `
    INSERT INTO email_verifications (customer_id, token, expires_at, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [customerId, token, expiresAt, ipAddress, userAgent]
  );

  // Also update the customers table with the token
  await pool.query(
    `
    UPDATE customers
    SET email_verification_token = $1,
        email_verification_expires = $2,
        updated_at = NOW()
    WHERE id = $3
    `,
    [token, expiresAt, customerId]
  );
}

/**
 * Validate and verify a token
 * @returns Object with success boolean, customerId if successful, and error message if failed
 */
export async function verifyToken(
  token: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; customerId?: string; email?: string; error?: string }> {
  // Validate token format first
  if (!isValidTokenFormat(token)) {
    return { success: false, error: 'Invalid token format' };
  }

  // Find verification record
  const result = await pool.query(
    `
    SELECT ev.id, ev.customer_id, ev.expires_at, ev.verified_at,
           c.email, c.email_verified
    FROM email_verifications ev
    JOIN customers c ON ev.customer_id = c.id
    WHERE ev.token = $1
    ORDER BY ev.created_at DESC
    LIMIT 1
    `,
    [token]
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Invalid or expired token' };
  }

  const verification = result.rows[0];

  // Check if already verified
  if (verification.verified_at || verification.email_verified) {
    return {
      success: true,
      customerId: verification.customer_id,
      email: verification.email,
    };
  }

  // Check if expired
  const now = new Date();
  const expiresAt = new Date(verification.expires_at);

  if (now > expiresAt) {
    return { success: false, error: 'Token has expired. Please request a new verification email.' };
  }

  // Mark as verified in email_verifications table
  await pool.query(
    `
    UPDATE email_verifications
    SET verified_at = NOW(),
        ip_address = COALESCE($1, ip_address),
        user_agent = COALESCE($2, user_agent)
    WHERE id = $3
    `,
    [ipAddress, userAgent, verification.id]
  );

  // Mark email as verified in customers table and activate account
  await pool.query(
    `
    UPDATE customers
    SET email_verified = true,
        status = 'active',
        email_verification_token = NULL,
        email_verification_expires = NULL,
        updated_at = NOW()
    WHERE id = $1
    `,
    [verification.customer_id]
  );

  return {
    success: true,
    customerId: verification.customer_id,
    email: verification.email,
  };
}

/**
 * Clean up expired verification tokens (called periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await pool.query('SELECT cleanup_expired_verifications()');
  return result.rows[0].cleanup_expired_verifications;
}

/**
 * Get verification attempts for a customer (for debugging/monitoring)
 */
export async function getVerificationAttempts(customerId: string): Promise<any[]> {
  const result = await pool.query(
    `
    SELECT token, expires_at, verified_at, ip_address, user_agent, created_at
    FROM email_verifications
    WHERE customer_id = $1
    ORDER BY created_at DESC
    LIMIT 10
    `,
    [customerId]
  );

  return result.rows;
}
