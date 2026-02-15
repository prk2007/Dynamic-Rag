/**
 * pgvector Vector Storage Service
 *
 * Implements vector storage using PostgreSQL with pgvector extension.
 * Provides vector similarity search with HNSW indexes for fast approximate nearest neighbor search.
 */

import { query } from '../database/connection.js';
import type { EmbeddedChunk } from './embedding.service.js';
import type {
  VectorStorageService,
  VectorRecord,
  SearchResult,
  SearchOptions,
} from './vector-storage.interface.js';

export class PgVectorService implements VectorStorageService {
  /**
   * Get the appropriate table name based on embedding dimension
   */
  private getTableName(dimension: number): string {
    return dimension === 3072 ? 'document_chunks_3072' : 'document_chunks';
  }

  /**
   * Add multiple chunks with embeddings to PostgreSQL
   */
  async addChunks(
    customerId: string,
    documentId: string,
    chunks: EmbeddedChunk[]
  ): Promise<number> {
    if (chunks.length === 0) {
      console.warn('⚠️  No chunks to add');
      return 0;
    }

    const dimension = chunks[0].embedding.length;
    const tableName = this.getTableName(dimension);

    console.log(
      `📦 Adding ${chunks.length} chunks (${dimension}D) to pgvector for document ${documentId}`
    );

    // Build multi-row INSERT with proper parameterization
    const values: any[] = [];
    const placeholders: string[] = [];

    chunks.forEach((chunk, index) => {
      const offset = index * 10;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::vector, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
      );
      values.push(
        `${documentId}_${chunk.index}`, // id
        documentId,                      // document_id
        customerId,                      // customer_id
        chunk.content,                   // content
        `[${chunk.embedding.join(',')}]`, // embedding as vector string
        chunk.index,                     // chunk_index
        chunk.metadata.start,            // start_char
        chunk.metadata.end,              // end_char
        chunk.metadata.title || null,    // title
        new Date().toISOString()         // created_at
      );
    });

    const sql = `
      INSERT INTO ${tableName}
      (id, document_id, customer_id, content, embedding, chunk_index, start_char, end_char, title, created_at)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (document_id, chunk_index) DO UPDATE
      SET content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          start_char = EXCLUDED.start_char,
          end_char = EXCLUDED.end_char,
          title = EXCLUDED.title,
          updated_at = NOW()
    `;

    try {
      await query(sql, values);
      console.log(`✅ Successfully added ${chunks.length} chunks to ${tableName}`);
      return chunks.length;
    } catch (error) {
      console.error('❌ Failed to add chunks to pgvector:', error);
      throw new Error(
        `Failed to add chunks to pgvector: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Search for similar vectors using cosine similarity
   *
   * pgvector cosine distance (<=>): 0 = identical, 2 = opposite
   * We convert to similarity score: similarity = 1 - distance
   */
  async search(
    customerId: string,
    queryVector: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, documentId, minScore = 0 } = options;
    const dimension = queryVector.length;
    const tableName = this.getTableName(dimension);

    console.log(
      `🔍 Searching ${tableName} for customer ${customerId} (limit: ${limit}, minScore: ${minScore})`
    );

    const params: any[] = [`[${queryVector.join(',')}]`, customerId];
    let paramIndex = 3;

    let sql = `
      SELECT
        id,
        document_id,
        content,
        chunk_index,
        title,
        start_char,
        end_char,
        created_at,
        1 - (embedding <=> $1::vector) AS score
      FROM ${tableName}
      WHERE customer_id = $2
    `;

    // Optional document filter
    if (documentId) {
      sql += ` AND document_id = $${paramIndex}`;
      params.push(documentId);
      paramIndex++;
    }

    // Minimum score filter
    sql += ` AND 1 - (embedding <=> $1::vector) >= $${paramIndex}`;
    params.push(minScore);
    paramIndex++;

    // Order by similarity (distance) and limit
    sql += `
      ORDER BY embedding <=> $1::vector
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    try {
      const result = await query(sql, params);

      console.log(`✅ Found ${result.rows.length} results`);

      return result.rows.map((row) => ({
        id: row.id,
        document_id: row.document_id,
        content: row.content,
        score: parseFloat(row.score),
        chunk_index: row.chunk_index,
        title: row.title,
        metadata: {
          start_char: row.start_char,
          end_char: row.end_char,
          created_at: row.created_at,
        },
      }));
    } catch (error) {
      console.error('❌ Search failed:', error);
      throw new Error(
        `Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete all chunks belonging to a document
   */
  async deleteDocument(customerId: string, documentId: string): Promise<number> {
    console.log(`🗑️  Deleting chunks for document ${documentId}`);

    try {
      // Delete from both dimension tables
      const sql1 = `
        DELETE FROM document_chunks
        WHERE customer_id = $1 AND document_id = $2
      `;
      const sql2 = `
        DELETE FROM document_chunks_3072
        WHERE customer_id = $1 AND document_id = $2
      `;

      const [result1, result2] = await Promise.all([
        query(sql1, [customerId, documentId]),
        query(sql2, [customerId, documentId]),
      ]);

      const totalDeleted = (result1.rowCount || 0) + (result2.rowCount || 0);
      console.log(`✅ Deleted ${totalDeleted} chunks for document ${documentId}`);
      return totalDeleted;
    } catch (error) {
      console.error('❌ Failed to delete document chunks:', error);
      throw new Error(
        `Failed to delete document chunks: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieve a range of chunks by index (for context window expansion)
   */
  async getChunkRange(
    customerId: string,
    documentId: string,
    startIndex: number,
    endIndex: number
  ): Promise<VectorRecord[]> {
    console.log(
      `📄 Getting chunks ${startIndex}-${endIndex} for document ${documentId}`
    );

    // Query both tables and union results (don't fetch large embeddings)
    const sql = `
      SELECT
        id,
        document_id,
        customer_id,
        content,
        chunk_index,
        start_char,
        end_char,
        title,
        created_at
      FROM (
        SELECT
          id, document_id, customer_id, content, chunk_index,
          start_char, end_char, title, created_at
        FROM document_chunks
        WHERE customer_id = $1 AND document_id = $2
        UNION ALL
        SELECT
          id, document_id, customer_id, content, chunk_index,
          start_char, end_char, title, created_at
        FROM document_chunks_3072
        WHERE customer_id = $1 AND document_id = $2
      ) combined
      WHERE chunk_index BETWEEN $3 AND $4
      ORDER BY chunk_index
    `;

    try {
      const result = await query(sql, [customerId, documentId, startIndex, endIndex]);

      console.log(`✅ Retrieved ${result.rows.length} chunks`);

      return result.rows.map((row) => ({
        id: row.id,
        document_id: row.document_id,
        customer_id: row.customer_id,
        content: row.content,
        vector: [], // Don't fetch large vectors for range queries
        chunk_index: row.chunk_index,
        start_char: row.start_char,
        end_char: row.end_char,
        title: row.title,
        created_at: row.created_at,
      }));
    } catch (error) {
      console.error('❌ Failed to get chunk range:', error);
      throw new Error(
        `Failed to get chunk range: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get total number of chunks for a document
   */
  async getDocumentChunkCount(
    customerId: string,
    documentId: string
  ): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count FROM (
        SELECT 1 FROM document_chunks
        WHERE customer_id = $1 AND document_id = $2
        UNION ALL
        SELECT 1 FROM document_chunks_3072
        WHERE customer_id = $1 AND document_id = $2
      ) combined
    `;

    try {
      const result = await query(sql, [customerId, documentId]);
      const count = parseInt(result.rows[0]?.count || '0', 10);
      console.log(`📊 Document ${documentId} has ${count} chunks`);
      return count;
    } catch (error) {
      console.error('❌ Failed to get chunk count:', error);
      return 0;
    }
  }

  /**
   * Get aggregate statistics for a customer
   */
  async getCustomerStats(
    customerId: string
  ): Promise<{ totalDocuments: number; totalChunks: number }> {
    const sql = `
      SELECT
        COUNT(DISTINCT document_id) as total_documents,
        COUNT(*) as total_chunks
      FROM (
        SELECT document_id FROM document_chunks WHERE customer_id = $1
        UNION ALL
        SELECT document_id FROM document_chunks_3072 WHERE customer_id = $1
      ) combined
    `;

    try {
      const result = await query(sql, [customerId]);
      return {
        totalDocuments: parseInt(result.rows[0]?.total_documents || '0', 10),
        totalChunks: parseInt(result.rows[0]?.total_chunks || '0', 10),
      };
    } catch (error) {
      console.error('❌ Failed to get customer stats:', error);
      return { totalDocuments: 0, totalChunks: 0 };
    }
  }

  /**
   * Health check for pgvector backend
   */
  async healthCheck(customerId: string): Promise<boolean> {
    try {
      // Simple query to check connection
      await query('SELECT 1 as health', []);
      console.log('✅ pgvector health check passed');
      return true;
    } catch (error) {
      console.error('❌ pgvector health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const pgvectorService = new PgVectorService();
