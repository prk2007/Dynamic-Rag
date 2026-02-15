import { Request, Response, NextFunction } from 'express';
import { query } from '../database/connection.js';

/**
 * Rate limiting middleware
 */
export async function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.customerId || !req.customerConfig) {
      return next();
    }

    const customerId = req.customerId;
    const endpoint = req.path;
    const config = req.customerConfig;

    // Check per-minute rate limit
    const minuteWindowStart = new Date();
    minuteWindowStart.setMinutes(minuteWindowStart.getMinutes() - 1);

    const minuteResult = await query(
      `SELECT SUM(request_count) as total
       FROM rate_limit_tracker
       WHERE customer_id = $1
       AND endpoint = $2
       AND window_end > $3`,
      [customerId, endpoint, minuteWindowStart]
    );

    const minuteCount = parseInt(minuteResult.rows[0]?.total || '0');

    if (minuteCount >= config.rate_limit_requests_per_minute) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded (per minute)',
        limit: config.rate_limit_requests_per_minute,
        reset: 60,
      });
      return;
    }

    // Check per-day rate limit
    const dayWindowStart = new Date();
    dayWindowStart.setHours(dayWindowStart.getHours() - 24);

    const dayResult = await query(
      `SELECT SUM(request_count) as total
       FROM rate_limit_tracker
       WHERE customer_id = $1
       AND window_end > $2`,
      [customerId, dayWindowStart]
    );

    const dayCount = parseInt(dayResult.rows[0]?.total || '0');

    if (dayCount >= config.rate_limit_requests_per_day) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded (per day)',
        limit: config.rate_limit_requests_per_day,
        reset: 86400,
      });
      return;
    }

    // Track this request
    const windowStart = new Date();
    const windowEnd = new Date(windowStart.getTime() + 60000); // 1 minute window

    await query(
      `INSERT INTO rate_limit_tracker (customer_id, endpoint, request_count, window_start, window_end)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (customer_id, endpoint, window_start)
       DO UPDATE SET request_count = rate_limit_tracker.request_count + 1`,
      [customerId, endpoint, windowStart, windowEnd]
    );

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', config.rate_limit_requests_per_minute);
    res.setHeader('X-RateLimit-Remaining', config.rate_limit_requests_per_minute - minuteCount - 1);
    res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60);

    next();
  } catch (error) {
    console.error('Rate limit error:', error);
    // Don't fail request on rate limit tracking errors
    next();
  }
}

/**
 * Clean up old rate limit records (run periodically)
 */
export async function cleanupRateLimits(): Promise<number> {
  const result = await query(
    `DELETE FROM rate_limit_tracker WHERE window_end < NOW() - INTERVAL '1 day'`
  );
  return result.rowCount || 0;
}
