import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { usageMetricsModel } from '../models/usage-metrics.js';
import { redisConnection } from '../queue/connection.js';

const router = express.Router();

const CACHE_TTL_SECONDS = 60; // 1 minute

function cacheKey(customerId: string, type: string): string {
  return `usage:${customerId}:${type}`;
}

/**
 * GET /api/usage/summary
 * Get all usage metrics for the authenticated customer (cached)
 */
router.get('/summary', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const key = cacheKey(customerId, 'summary');

    // Try cache first
    const cached = await redisConnection.get(key);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const summary = await usageMetricsModel.getSummary(customerId);
    await redisConnection.setex(key, CACHE_TTL_SECONDS, JSON.stringify(summary));

    res.json(summary);
  } catch (error) {
    console.error('Usage summary error:', error);
    res.status(500).json({
      error: 'Failed to get usage summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/usage/:type
 * Get usage count for a specific metric type (cached)
 * Valid types: api_call, embedding_tokens, storage_bytes, document_processed, search_query, documents
 */
router.get('/:type', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const { type } = req.params;

    // Special case: "documents" is not a usage_metrics type but a common dashboard stat
    if (type === 'documents') {
      const key = cacheKey(customerId, 'documents');
      const cached = await redisConnection.get(key);
      if (cached) {
        return res.json({ type: 'documents', count: parseInt(cached) });
      }

      const { query: dbQuery } = await import('../database/connection.js');
      const result = await dbQuery(
        `SELECT COUNT(*) AS total FROM documents WHERE customer_id = $1`,
        [customerId]
      );
      const count = parseInt(result.rows[0]?.total || '0');
      await redisConnection.setex(key, CACHE_TTL_SECONDS, String(count));

      return res.json({ type: 'documents', count });
    }

    if (!usageMetricsModel.isValidMetricType(type)) {
      return res.status(400).json({
        error: 'Invalid metric type',
        message: `Valid types: api_call, embedding_tokens, storage_bytes, document_processed, search_query, documents`,
      });
    }

    const key = cacheKey(customerId, type);
    const cached = await redisConnection.get(key);
    if (cached) {
      return res.json({ type, count: parseInt(cached) });
    }

    const count = await usageMetricsModel.getCountByType(customerId, type);
    await redisConnection.setex(key, CACHE_TTL_SECONDS, String(count));

    res.json({ type, count });
  } catch (error) {
    console.error('Usage metric error:', error);
    res.status(500).json({
      error: 'Failed to get usage metric',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
