/**
 * Vector Storage Service Interface
 *
 * Defines the contract for vector storage implementations (pgvector, LanceDB, etc.)
 * This allows for easy switching between different vector storage backends.
 */

import type { EmbeddedChunk } from './embedding.service.js';

/**
 * Represents a stored vector record with metadata
 */
export interface VectorRecord {
  id: string;
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
 * Represents a search result with similarity score
 */
export interface SearchResult {
  id: string;
  document_id: string;
  content: string;
  score: number;  // Similarity score (0-1, higher is more similar)
  chunk_index: number;
  title?: string;
  metadata: {
    start_char: number;
    end_char: number;
    created_at: string;
  };
}

/**
 * Options for vector similarity search
 */
export interface SearchOptions {
  limit?: number;         // Maximum number of results (default: 10)
  documentId?: string;    // Filter by specific document
  minScore?: number;      // Minimum similarity score (default: 0)
}

/**
 * Vector Storage Service Interface
 *
 * Provides methods for storing, searching, and managing vector embeddings
 * with multi-tenant isolation.
 */
export interface VectorStorageService {
  /**
   * Add multiple chunks with embeddings to vector storage
   *
   * @param customerId - Customer ID for tenant isolation
   * @param documentId - Document ID these chunks belong to
   * @param chunks - Array of embedded chunks to store
   * @returns Number of chunks successfully added
   */
  addChunks(
    customerId: string,
    documentId: string,
    chunks: EmbeddedChunk[]
  ): Promise<number>;

  /**
   * Search for similar vectors using cosine similarity
   *
   * @param customerId - Customer ID for tenant isolation
   * @param queryVector - Query embedding vector
   * @param options - Search options (limit, filters, etc.)
   * @returns Array of search results sorted by similarity (highest first)
   */
  search(
    customerId: string,
    queryVector: number[],
    options?: SearchOptions
  ): Promise<SearchResult[]>;

  /**
   * Delete all chunks belonging to a document
   *
   * @param customerId - Customer ID for tenant isolation
   * @param documentId - Document ID to delete chunks for
   * @returns Number of chunks deleted
   */
  deleteDocument(customerId: string, documentId: string): Promise<number>;

  /**
   * Retrieve a range of chunks by index (for context window)
   *
   * @param customerId - Customer ID for tenant isolation
   * @param documentId - Document ID to retrieve chunks from
   * @param startIndex - Starting chunk index (inclusive)
   * @param endIndex - Ending chunk index (inclusive)
   * @returns Array of chunks in the specified range
   */
  getChunkRange(
    customerId: string,
    documentId: string,
    startIndex: number,
    endIndex: number
  ): Promise<VectorRecord[]>;

  /**
   * Get total number of chunks for a document
   *
   * @param customerId - Customer ID for tenant isolation
   * @param documentId - Document ID to count chunks for
   * @returns Total number of chunks
   */
  getDocumentChunkCount(
    customerId: string,
    documentId: string
  ): Promise<number>;

  /**
   * Get aggregate statistics for a customer
   *
   * @param customerId - Customer ID to get stats for
   * @returns Total documents and chunks count
   */
  getCustomerStats(
    customerId: string
  ): Promise<{ totalDocuments: number; totalChunks: number }>;

  /**
   * Health check for vector storage backend
   *
   * @param customerId - Customer ID for tenant-specific check
   * @returns true if backend is healthy, false otherwise
   */
  healthCheck(customerId: string): Promise<boolean>;
}
