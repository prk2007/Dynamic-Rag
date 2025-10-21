import { pool } from '../database/connection.js';
import type { Pool } from 'pg';
import type { DocumentType } from './document.js';

/**
 * Customer configuration interface
 */
export interface CustomerConfig {
  id: number;
  customer_id: string;
  rate_limit_requests_per_minute: number;
  rate_limit_requests_per_day: number;
  max_documents: number;
  max_file_size_mb: number;
  allowed_document_types: DocumentType[];
  chunking_size: number;
  chunking_overlap: number;
  embedding_model: string;
  monthly_budget_usd: number;
  budget_alert_threshold: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Customer Config Model
 * Manages customer-specific configuration settings
 */
export class CustomerConfigModel {
  private pool: Pool;

  constructor(dbPool: Pool = pool) {
    this.pool = dbPool;
  }

  /**
   * Get customer configuration
   * Creates default config if not exists
   */
  async getConfig(customerId: string): Promise<CustomerConfig> {
    const query = `
      SELECT * FROM customer_config
      WHERE customer_id = $1
    `;

    try {
      const result = await this.pool.query(query, [customerId]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Create default config if not exists
      return this.createDefaultConfig(customerId);
    } catch (error) {
      console.error('Error getting customer config:', error);
      throw new Error(`Failed to get customer config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create default configuration for customer
   */
  async createDefaultConfig(customerId: string): Promise<CustomerConfig> {
    const query = `
      INSERT INTO customer_config (
        customer_id,
        rate_limit_requests_per_minute,
        rate_limit_requests_per_day,
        max_documents,
        max_file_size_mb,
        allowed_document_types,
        chunking_size,
        chunking_overlap,
        embedding_model,
        monthly_budget_usd,
        budget_alert_threshold
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      customerId,
      parseInt(process.env.DEFAULT_RATE_LIMIT_PER_MINUTE || '60'),
      parseInt(process.env.DEFAULT_RATE_LIMIT_PER_DAY || '10000'),
      parseInt(process.env.DEFAULT_MAX_DOCUMENTS || '10000'),
      parseInt(process.env.DEFAULT_MAX_FILE_SIZE_MB || '50'),
      ['pdf', 'txt', 'html', 'md'],
      1000, // chunking_size
      200, // chunking_overlap
      'text-embedding-3-small',
      100.00, // monthly_budget_usd
      0.80, // budget_alert_threshold
    ];

    try {
      const result = await this.pool.query(query, values);
      console.log(`✅ Created default config for customer ${customerId}`);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating customer config:', error);
      throw new Error(`Failed to create customer config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update customer configuration
   */
  async updateConfig(
    customerId: string,
    updates: Partial<Omit<CustomerConfig, 'id' | 'customer_id' | 'created_at' | 'updated_at'>>
  ): Promise<CustomerConfig> {
    // Build dynamic UPDATE query
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.rate_limit_requests_per_minute !== undefined) {
      fields.push(`rate_limit_requests_per_minute = $${paramIndex}`);
      values.push(updates.rate_limit_requests_per_minute);
      paramIndex++;
    }

    if (updates.rate_limit_requests_per_day !== undefined) {
      fields.push(`rate_limit_requests_per_day = $${paramIndex}`);
      values.push(updates.rate_limit_requests_per_day);
      paramIndex++;
    }

    if (updates.max_documents !== undefined) {
      fields.push(`max_documents = $${paramIndex}`);
      values.push(updates.max_documents);
      paramIndex++;
    }

    if (updates.max_file_size_mb !== undefined) {
      fields.push(`max_file_size_mb = $${paramIndex}`);
      values.push(updates.max_file_size_mb);
      paramIndex++;
    }

    if (updates.allowed_document_types !== undefined) {
      fields.push(`allowed_document_types = $${paramIndex}`);
      values.push(updates.allowed_document_types);
      paramIndex++;
    }

    if (updates.chunking_size !== undefined) {
      fields.push(`chunking_size = $${paramIndex}`);
      values.push(updates.chunking_size);
      paramIndex++;
    }

    if (updates.chunking_overlap !== undefined) {
      fields.push(`chunking_overlap = $${paramIndex}`);
      values.push(updates.chunking_overlap);
      paramIndex++;
    }

    if (updates.embedding_model !== undefined) {
      fields.push(`embedding_model = $${paramIndex}`);
      values.push(updates.embedding_model);
      paramIndex++;
    }

    if (updates.monthly_budget_usd !== undefined) {
      fields.push(`monthly_budget_usd = $${paramIndex}`);
      values.push(updates.monthly_budget_usd);
      paramIndex++;
    }

    if (updates.budget_alert_threshold !== undefined) {
      fields.push(`budget_alert_threshold = $${paramIndex}`);
      values.push(updates.budget_alert_threshold);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const query = `
      UPDATE customer_config
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE customer_id = $${paramIndex}
      RETURNING *
    `;

    values.push(customerId);

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating customer config:', error);
      throw new Error(`Failed to update customer config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if document type is allowed
   */
  async isDocumentTypeAllowed(
    customerId: string,
    docType: DocumentType
  ): Promise<boolean> {
    const config = await this.getConfig(customerId);
    return config.allowed_document_types.includes(docType);
  }

  /**
   * Check if file size is within limit
   */
  async isFileSizeAllowed(customerId: string, sizeBytes: number): Promise<boolean> {
    const config = await this.getConfig(customerId);
    const maxBytes = config.max_file_size_mb * 1024 * 1024;
    return sizeBytes <= maxBytes;
  }

  /**
   * Check if customer can upload more documents
   */
  async canUploadDocument(customerId: string, currentCount: number): Promise<boolean> {
    const config = await this.getConfig(customerId);
    return currentCount < config.max_documents;
  }
}

// Export singleton instance
export const customerConfigModel = new CustomerConfigModel();
