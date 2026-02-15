import { pool } from '../database/connection.js';
import type { Pool, PoolClient } from 'pg';

/**
 * Document status types
 */
export type DocumentStatus = 'processing' | 'completed' | 'failed';

/**
 * Document type
 */
export type DocumentType = 'pdf' | 'txt' | 'html' | 'md';

/**
 * Document interface
 */
export interface Document {
  id: string;
  customer_id: string;
  title: string;
  doc_type: DocumentType;
  source_url?: string;
  s3_key?: string;
  content_hash?: string;
  file_size_bytes?: number;
  page_count?: number;
  chunk_count: number;
  character_count: number;
  embedding_tokens_used: number;
  embedding_cost_usd: number;
  processing_time_ms?: number;
  status: DocumentStatus;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create document input
 */
export interface CreateDocumentInput {
  customer_id: string;
  title: string;
  doc_type: DocumentType;
  source_url?: string;
  s3_key?: string;
  content_hash?: string;
  file_size_bytes?: number;
}

/**
 * Update document input
 */
export interface UpdateDocumentInput {
  title?: string;
  status?: DocumentStatus;
  error_message?: string;
  chunk_count?: number;
  character_count?: number;
  page_count?: number;
  embedding_tokens_used?: number;
  embedding_cost_usd?: number;
  processing_time_ms?: number;
}

/**
 * Document Model
 * Handles all database operations for documents
 */
export class DocumentModel {
  private pool: Pool;

  constructor(dbPool: Pool = pool) {
    this.pool = dbPool;
  }

  /**
   * Create a new document
   */
  async create(input: CreateDocumentInput): Promise<Document> {
    const query = `
      INSERT INTO documents (
        customer_id, title, doc_type, source_url, s3_key,
        content_hash, file_size_bytes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing')
      RETURNING *
    `;

    const values = [
      input.customer_id,
      input.title,
      input.doc_type,
      input.source_url || null,
      input.s3_key || null,
      input.content_hash || null,
      input.file_size_bytes || null,
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating document:', error);
      throw new Error(`Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find document by ID (with customer isolation)
   */
  async findById(documentId: string, customerId: string): Promise<Document | null> {
    const query = `
      SELECT * FROM documents
      WHERE id = $1 AND customer_id = $2
    `;

    try {
      const result = await this.pool.query(query, [documentId, customerId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding document:', error);
      throw new Error(`Failed to find document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find document by content hash (for deduplication)
   */
  async findByContentHash(contentHash: string, customerId: string): Promise<Document | null> {
    const query = `
      SELECT * FROM documents
      WHERE content_hash = $1 AND customer_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [contentHash, customerId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding document by hash:', error);
      throw new Error(`Failed to find document by hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List documents for a customer with pagination
   */
  async list(
    customerId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: DocumentStatus;
      doc_type?: DocumentType;
    } = {}
  ): Promise<{ documents: Document[]; total: number }> {
    const { limit = 50, offset = 0, status, doc_type } = options;

    // Build WHERE clause
    const conditions = ['customer_id = $1'];
    const values: any[] = [customerId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (doc_type) {
      conditions.push(`doc_type = $${paramIndex}`);
      values.push(doc_type);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM documents
      WHERE ${whereClause}
    `;

    // Get paginated results
    const listQuery = `
      SELECT * FROM documents
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(limit, offset);

    try {
      const [countResult, listResult] = await Promise.all([
        this.pool.query(countQuery, values.slice(0, paramIndex - 1)),
        this.pool.query(listQuery, values),
      ]);

      return {
        documents: listResult.rows,
        total: parseInt(countResult.rows[0].count),
      };
    } catch (error) {
      console.error('Error listing documents:', error);
      throw new Error(`Failed to list documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update document
   */
  async update(
    documentId: string,
    customerId: string,
    updates: UpdateDocumentInput
  ): Promise<Document | null> {
    // Build dynamic UPDATE query
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex}`);
      values.push(updates.title);
      paramIndex++;
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex}`);
      values.push(updates.status);
      paramIndex++;
    }

    if (updates.error_message !== undefined) {
      fields.push(`error_message = $${paramIndex}`);
      values.push(updates.error_message);
      paramIndex++;
    }

    if (updates.chunk_count !== undefined) {
      fields.push(`chunk_count = $${paramIndex}`);
      values.push(updates.chunk_count);
      paramIndex++;
    }

    if (updates.character_count !== undefined) {
      fields.push(`character_count = $${paramIndex}`);
      values.push(updates.character_count);
      paramIndex++;
    }

    if (updates.page_count !== undefined) {
      fields.push(`page_count = $${paramIndex}`);
      values.push(updates.page_count);
      paramIndex++;
    }

    if (updates.embedding_tokens_used !== undefined) {
      fields.push(`embedding_tokens_used = $${paramIndex}`);
      values.push(updates.embedding_tokens_used);
      paramIndex++;
    }

    if (updates.embedding_cost_usd !== undefined) {
      fields.push(`embedding_cost_usd = $${paramIndex}`);
      values.push(updates.embedding_cost_usd);
      paramIndex++;
    }

    if (updates.processing_time_ms !== undefined) {
      fields.push(`processing_time_ms = $${paramIndex}`);
      values.push(updates.processing_time_ms);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const query = `
      UPDATE documents
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex} AND customer_id = $${paramIndex + 1}
      RETURNING *
    `;

    values.push(documentId, customerId);

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error updating document:', error);
      throw new Error(`Failed to update document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete document
   */
  async delete(documentId: string, customerId: string): Promise<boolean> {
    const query = `
      DELETE FROM documents
      WHERE id = $1 AND customer_id = $2
      RETURNING id
    `;

    try {
      const result = await this.pool.query(query, [documentId, customerId]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw new Error(`Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get document statistics for a customer
   */
  async getStats(customerId: string): Promise<{
    total: number;
    by_status: Record<DocumentStatus, number>;
    by_type: Record<DocumentType, number>;
    total_size_bytes: number;
    total_chunks: number;
    total_embedding_cost: number;
  }> {
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE doc_type = 'pdf') as pdf,
        COUNT(*) FILTER (WHERE doc_type = 'txt') as txt,
        COUNT(*) FILTER (WHERE doc_type = 'html') as html,
        COUNT(*) FILTER (WHERE doc_type = 'md') as md,
        COALESCE(SUM(file_size_bytes), 0) as total_size_bytes,
        COALESCE(SUM(chunk_count), 0) as total_chunks,
        COALESCE(SUM(embedding_cost_usd), 0) as total_embedding_cost
      FROM documents
      WHERE customer_id = $1
    `;

    try {
      const result = await this.pool.query(query, [customerId]);
      const row = result.rows[0];

      return {
        total: parseInt(row.total),
        by_status: {
          processing: parseInt(row.processing),
          completed: parseInt(row.completed),
          failed: parseInt(row.failed),
        },
        by_type: {
          pdf: parseInt(row.pdf),
          txt: parseInt(row.txt),
          html: parseInt(row.html),
          md: parseInt(row.md),
        },
        total_size_bytes: parseInt(row.total_size_bytes),
        total_chunks: parseInt(row.total_chunks),
        total_embedding_cost: parseFloat(row.total_embedding_cost),
      };
    } catch (error) {
      console.error('Error getting document stats:', error);
      throw new Error(`Failed to get document stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark document as failed
   */
  async markFailed(
    documentId: string,
    customerId: string,
    errorMessage: string
  ): Promise<Document | null> {
    return this.update(documentId, customerId, {
      status: 'failed',
      error_message: errorMessage,
    });
  }

  /**
   * Mark document as completed
   */
  async markCompleted(
    documentId: string,
    customerId: string,
    stats: {
      chunk_count: number;
      character_count: number;
      page_count?: number;
      embedding_tokens_used: number;
      embedding_cost_usd: number;
      processing_time_ms: number;
    }
  ): Promise<Document | null> {
    return this.update(documentId, customerId, {
      status: 'completed',
      ...stats,
    });
  }
}

// Export singleton instance
export const documentModel = new DocumentModel();
