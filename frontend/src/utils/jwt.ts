/**
 * JWT Utilities
 * Utilities for decoding and validating JWT tokens
 */

interface JWTPayload {
  customerId: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Decode a JWT token (without verification)
 * Note: This only decodes the payload, it does NOT verify the signature
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT format');
      return null;
    }

    // Decode the payload (base64url)
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

/**
 * Check if a JWT token is expired
 * @param token - JWT token string
 * @param bufferSeconds - Optional buffer in seconds to consider token expired before actual expiration
 * @returns true if token is expired or invalid, false otherwise
 */
export function isTokenExpired(token: string | null, bufferSeconds = 60): boolean {
  if (!token) {
    return true;
  }

  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return true;
  }

  // exp is in seconds, Date.now() is in milliseconds
  const expirationTime = payload.exp * 1000;
  const currentTime = Date.now();
  const bufferTime = bufferSeconds * 1000;

  // Consider token expired if it expires within the buffer period
  return currentTime >= expirationTime - bufferTime;
}

/**
 * Get token expiration time in milliseconds
 */
export function getTokenExpiration(token: string | null): number | null {
  if (!token) {
    return null;
  }

  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return null;
  }

  return payload.exp * 1000;
}

/**
 * Get time remaining until token expiration in seconds
 */
export function getTokenTimeRemaining(token: string | null): number | null {
  const expirationTime = getTokenExpiration(token);
  if (!expirationTime) {
    return null;
  }

  const timeRemaining = Math.floor((expirationTime - Date.now()) / 1000);
  return Math.max(0, timeRemaining);
}

/**
 * Format time remaining in human-readable format
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) {
    return 'Expired';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}
