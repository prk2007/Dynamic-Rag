import { Request, Response, NextFunction } from 'express';
import { usageMetricsModel } from '../models/usage-metrics.js';

/**
 * Middleware to track API calls in usage_metrics.
 * Uses res.on('finish') so it doesn't block the response.
 */
export function trackApiUsage(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    // Only track for authenticated requests
    const customerId = req.user?.id;
    if (!customerId) return;

    usageMetricsModel.track(customerId, 'api_call', 1, {
      metadata: {
        method: req.method,
        path: req.path,
        status: res.statusCode,
      },
    });
  });

  next();
}
