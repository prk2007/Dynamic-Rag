/**
 * Email Verification Model
 * CRUD operations for email verification records
 */

import { pool } from '../database/connection.js';

export interface EmailVerification {
  id: number;
  customer_id: string;
  token: string;
  expires_at: Date;
  verified_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface CreateEmailVerificationParams {
  customer_id: string;
  token: string;
  expires_at: Date;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Create a new email verification record
 */
export async function createEmailVerification(
  params: CreateEmailVerificationParams
): Promise<EmailVerification> {
  const { customer_id, token, expires_at, ip_address, user_agent } = params;

  const result = await pool.query(
    `
    INSERT INTO email_verifications (customer_id, token, expires_at, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [customer_id, token, expires_at, ip_address || null, user_agent || null]
  );

  return result.rows[0];
}

/**
 * Find email verification by token
 */
export async function findByToken(token: string): Promise<EmailVerification | null> {
  const result = await pool.query(
    `
    SELECT * FROM email_verifications
    WHERE token = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [token]
  );

  return result.rows[0] || null;
}

/**
 * Find all email verifications for a customer
 */
export async function findByCustomerId(customerId: string): Promise<EmailVerification[]> {
  const result = await pool.query(
    `
    SELECT * FROM email_verifications
    WHERE customer_id = $1
    ORDER BY created_at DESC
    `,
    [customerId]
  );

  return result.rows;
}

/**
 * Mark verification as verified
 */
export async function markAsVerified(
  token: string,
  ipAddress?: string,
  userAgent?: string
): Promise<EmailVerification | null> {
  const result = await pool.query(
    `
    UPDATE email_verifications
    SET verified_at = NOW(),
        ip_address = COALESCE($2, ip_address),
        user_agent = COALESCE($3, user_agent)
    WHERE token = $1
      AND verified_at IS NULL
    RETURNING *
    `,
    [token, ipAddress || null, userAgent || null]
  );

  return result.rows[0] || null;
}

/**
 * Count unverified attempts for a customer in the last hour
 */
export async function countRecentAttempts(customerId: string): Promise<number> {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const result = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM email_verifications
    WHERE customer_id = $1
      AND created_at > $2
      AND verified_at IS NULL
    `,
    [customerId, oneHourAgo]
  );

  return parseInt(result.rows[0].count);
}

/**
 * Get last verification attempt for a customer
 */
export async function getLastAttempt(customerId: string): Promise<EmailVerification | null> {
  const result = await pool.query(
    `
    SELECT * FROM email_verifications
    WHERE customer_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [customerId]
  );

  return result.rows[0] || null;
}

/**
 * Check if token is expired
 */
export async function isTokenExpired(token: string): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT expires_at FROM email_verifications
    WHERE token = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [token]
  );

  if (result.rows.length === 0) {
    return true;
  }

  const expiresAt = new Date(result.rows[0].expires_at);
  const now = new Date();

  return now > expiresAt;
}

/**
 * Delete expired verification records (cleanup)
 */
export async function deleteExpired(): Promise<number> {
  const result = await pool.query(
    `
    DELETE FROM email_verifications
    WHERE expires_at < NOW()
      AND verified_at IS NULL
    `
  );

  return result.rowCount || 0;
}

/**
 * Get verification statistics for a customer
 */
export async function getVerificationStats(customerId: string): Promise<{
  total_attempts: number;
  verified_count: number;
  expired_count: number;
  pending_count: number;
}> {
  const result = await pool.query(
    `
    SELECT
      COUNT(*) as total_attempts,
      COUNT(verified_at) as verified_count,
      COUNT(*) FILTER (WHERE expires_at < NOW() AND verified_at IS NULL) as expired_count,
      COUNT(*) FILTER (WHERE expires_at >= NOW() AND verified_at IS NULL) as pending_count
    FROM email_verifications
    WHERE customer_id = $1
    `,
    [customerId]
  );

  return {
    total_attempts: parseInt(result.rows[0].total_attempts),
    verified_count: parseInt(result.rows[0].verified_count),
    expired_count: parseInt(result.rows[0].expired_count),
    pending_count: parseInt(result.rows[0].pending_count),
  };
}
