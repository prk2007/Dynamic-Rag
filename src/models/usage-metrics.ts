import { query } from '../database/connection.js';

export type MetricType = 'api_call' | 'embedding_tokens' | 'storage_bytes' | 'document_processed' | 'search_query';

const VALID_METRIC_TYPES: MetricType[] = ['api_call', 'embedding_tokens', 'storage_bytes', 'document_processed', 'search_query'];

interface TrackOptions {
  documentId?: string;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

class UsageMetricsModel {
  /**
   * Track a usage metric (fire-and-forget safe)
   */
  async track(
    customerId: string,
    metricType: MetricType,
    metricValue: number,
    opts?: TrackOptions
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO usage_metrics (customer_id, document_id, metric_type, metric_value, cost_usd, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          customerId,
          opts?.documentId || null,
          metricType,
          metricValue,
          opts?.costUsd || 0,
          opts?.metadata ? JSON.stringify(opts.metadata) : null,
        ]
      );
    } catch (error) {
      console.error('Usage metrics tracking error:', error);
    }
  }

  isValidMetricType(type: string): type is MetricType {
    return VALID_METRIC_TYPES.includes(type as MetricType);
  }

  /**
   * Get count for a specific metric type
   */
  async getCountByType(customerId: string, metricType: MetricType): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) AS total FROM usage_metrics WHERE customer_id = $1 AND metric_type = $2`,
      [customerId, metricType]
    );
    return parseInt(result.rows[0]?.total || '0');
  }

  /**
   * Get all usage counts grouped by metric type
   */
  async getSummary(customerId: string): Promise<Record<string, number>> {
    const result = await query(
      `SELECT metric_type, COUNT(*) AS total
       FROM usage_metrics
       WHERE customer_id = $1
       GROUP BY metric_type`,
      [customerId]
    );

    const docResult = await query(
      `SELECT COUNT(*) AS total FROM documents WHERE customer_id = $1`,
      [customerId]
    );

    const summary: Record<string, number> = {
      documents: parseInt(docResult.rows[0]?.total || '0'),
    };
    for (const row of result.rows) {
      summary[row.metric_type] = parseInt(row.total);
    }
    for (const type of VALID_METRIC_TYPES) {
      if (!(type in summary)) summary[type] = 0;
    }
    return summary;
  }
}

export const usageMetricsModel = new UsageMetricsModel();
