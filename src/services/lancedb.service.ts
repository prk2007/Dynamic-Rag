import { connect, Connection, Table } from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs/promises';
import type { EmbeddedChunk } from './embedding.service.js';

/**
 * LanceDB Vector Record
 */
export interface VectorRecord extends Record<string, unknown> {
  id: string; // chunk_id: {documentId}_{chunkIndex}
  document_id: string;
  customer_id: string;
  content: string;
  vector: number[];
  chunk_index: number;
  start_char: number;
  end_char: number;
  title?: string;
  created_at: string;
}

/**
 * Search result
 */
export interface SearchResult {
  id: string;
  document_id: string;
  content: string;
  score: number;
  chunk_index: number;
  title?: string;
  metadata: {
    start_char: number;
    end_char: number;
    created_at: string;
  };
}

/**
 * Multi-Tenant LanceDB Manager
 * Provides isolated vector databases per customer
 */
export class LanceDBService {
  private connections: Map<string, Connection> = new Map();
  private tables: Map<string, Table> = new Map();
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || process.env.CUSTOMERS_DB_PATH || './data/customers';
  }

  /**
   * Get or create customer database connection
   */
  private async getConnection(customerId: string): Promise<Connection> {
    // Check cache
    if (this.connections.has(customerId)) {
      return this.connections.get(customerId)!;
    }

    // Create customer directory if not exists
    const customerDbPath = path.join(this.basePath, customerId);
    await fs.mkdir(customerDbPath, { recursive: true });

    // Connect to LanceDB
    const connection = await connect(customerDbPath);
    this.connections.set(customerId, connection);

    console.log(`📊 Connected to LanceDB for customer ${customerId}`);
    return connection;
  }

  /**
   * Get or create documents table for customer
   */
  private async getTable(customerId: string): Promise<Table> {
    const cacheKey = `${customerId}_documents`;

    // Check cache
    if (this.tables.has(cacheKey)) {
      return this.tables.get(cacheKey)!;
    }

    const connection = await this.getConnection(customerId);

    try {
      // Try to open existing table
      const table = await connection.openTable('documents');
      this.tables.set(cacheKey, table);
      return table;
    } catch (error) {
      // Table doesn't exist, create it with sample data
      console.log(`📊 Creating documents table for customer ${customerId}`);

      // Create table with schema
      const sampleData: VectorRecord[] = [
        {
          id: 'init_0',
          document_id: 'init',
          customer_id: customerId,
          content: 'Initialization record',
          vector: new Array(1536).fill(0), // text-embedding-3-small dimension
          chunk_index: 0,
          start_char: 0,
          end_char: 0,
          created_at: new Date().toISOString(),
        },
      ];

      const table = await connection.createTable('documents', sampleData);

      // Delete initialization record
      await table.delete(`id = 'init_0'`);

      this.tables.set(cacheKey, table);
      return table;
    }
  }

  /**
   * Add embedded chunks to vector database
   */
  async addChunks(
    customerId: string,
    documentId: string,
    chunks: EmbeddedChunk[]
  ): Promise<number> {
    try {
      const table = await this.getTable(customerId);

      // Convert chunks to vector records
      const records: VectorRecord[] = chunks.map((chunk) => ({
        id: `${documentId}_${chunk.index}`,
        document_id: documentId,
        customer_id: customerId,
        content: chunk.content,
        vector: chunk.embedding,
        chunk_index: chunk.index,
        start_char: chunk.metadata.start,
        end_char: chunk.metadata.end,
        title: chunk.metadata.title,
        created_at: new Date().toISOString(),
      }));

      // Add records to table
      await table.add(records);

      console.log(`✅ Added ${records.length} chunks to LanceDB for document ${documentId}`);
      return records.length;
    } catch (error) {
      console.error('Error adding chunks to LanceDB:', error);
      throw new Error(`Failed to add chunks to vector database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for similar chunks
   */
  async search(
    customerId: string,
    queryVector: number[],
    options: {
      limit?: number;
      documentId?: string;
      minScore?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, documentId, minScore = 0 } = options;

    try {
      const table = await this.getTable(customerId);

      // Build query
      let query = table.search(queryVector).limit(limit);

      // Filter by document if specified
      if (documentId) {
        query = query.where(`document_id = '${documentId}'`);
      }

      // Execute search
      const results = await query.toArray();

      // Map results to SearchResult format
      const searchResults: SearchResult[] = results
        .filter((result: any) => result._distance >= minScore)
        .map((result: any) => ({
          id: result.id,
          document_id: result.document_id,
          content: result.content,
          score: result._distance,
          chunk_index: result.chunk_index,
          title: result.title,
          metadata: {
            start_char: result.start_char,
            end_char: result.end_char,
            created_at: result.created_at,
          },
        }));

      return searchResults;
    } catch (error) {
      console.error('Error searching LanceDB:', error);
      throw new Error(`Failed to search vector database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete document chunks
   */
  async deleteDocument(customerId: string, documentId: string): Promise<number> {
    try {
      const table = await this.getTable(customerId);

      // Delete all chunks for document
      await table.delete(`document_id = '${documentId}'`);

      console.log(`🗑️  Deleted chunks for document ${documentId}`);

      // Return count (LanceDB doesn't return affected rows directly)
      return -1; // Unknown count
    } catch (error) {
      console.error('Error deleting document from LanceDB:', error);
      throw new Error(`Failed to delete document chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get document chunk count
   */
  async getDocumentChunkCount(
    customerId: string,
    documentId: string
  ): Promise<number> {
    try {
      const table = await this.getTable(customerId);

      // Query chunks for document
      const results = await table
        .search(new Array(1536).fill(0)) // Dummy vector
        .where(`document_id = '${documentId}'`)
        .limit(10000) // High limit to count all
        .toArray();

      return results.length;
    } catch (error) {
      console.error('Error counting document chunks:', error);
      return 0;
    }
  }

  /**
   * Get customer statistics
   */
  async getCustomerStats(customerId: string): Promise<{
    totalDocuments: number;
    totalChunks: number;
  }> {
    try {
      const table = await this.getTable(customerId);

      // Get all records (with reasonable limit)
      const results = await table
        .search(new Array(1536).fill(0))
        .limit(100000)
        .toArray();

      // Count unique documents
      const uniqueDocuments = new Set(
        results.map((r: any) => r.document_id)
      );

      return {
        totalDocuments: uniqueDocuments.size,
        totalChunks: results.length,
      };
    } catch (error) {
      console.error('Error getting customer stats:', error);
      return {
        totalDocuments: 0,
        totalChunks: 0,
      };
    }
  }

  /**
   * Delete all customer data (use with caution!)
   */
  async deleteCustomerData(customerId: string): Promise<void> {
    try {
      // Close connections
      this.connections.delete(customerId);
      this.tables.delete(`${customerId}_documents`);

      // Delete customer directory
      const customerDbPath = path.join(this.basePath, customerId);
      await fs.rm(customerDbPath, { recursive: true, force: true });

      console.log(`🗑️  Deleted all data for customer ${customerId}`);
    } catch (error) {
      console.error('Error deleting customer data:', error);
      throw new Error(`Failed to delete customer data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Close connection for customer
   */
  async closeConnection(customerId: string): Promise<void> {
    this.connections.delete(customerId);
    this.tables.delete(`${customerId}_documents`);
    console.log(`🔌 Closed LanceDB connection for customer ${customerId}`);
  }

  /**
   * Close all connections
   */
  async closeAllConnections(): Promise<void> {
    this.connections.clear();
    this.tables.clear();
    console.log('🔌 Closed all LanceDB connections');
  }

  /**
   * Compact database (optimize storage)
   */
  async compactDatabase(customerId: string): Promise<void> {
    try {
      const table = await this.getTable(customerId);

      // LanceDB auto-compacts, but we can force it
      await table.optimize();

      console.log(`🗜️  Compacted database for customer ${customerId}`);
    } catch (error) {
      console.error('Error compacting database:', error);
      // Non-fatal error, just log it
    }
  }

  /**
   * Health check
   */
  async healthCheck(customerId: string): Promise<boolean> {
    try {
      await this.getTable(customerId);
      return true;
    } catch (error) {
      console.error(`LanceDB health check failed for customer ${customerId}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const lancedbService = new LanceDBService();
