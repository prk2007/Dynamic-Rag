import { OpenAIEmbeddings } from '@langchain/openai';
import type { CustomerConfig } from '../models/customer-config.js';

/**
 * Text chunk with metadata
 */
export interface TextChunk {
  content: string;
  index: number;
  metadata: {
    documentId: string;
    customerId: string;
    start: number;
    end: number;
    title?: string;
  };
}

/**
 * Embedded chunk
 */
export interface EmbeddedChunk extends TextChunk {
  embedding: number[];
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: TextChunk[];
  totalChunks: number;
  totalCharacters: number;
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  chunks: EmbeddedChunk[];
  tokensUsed: number;
  cost: number;
  model: string;
}

/**
 * Text Chunking Service
 * Splits documents into manageable chunks for embedding
 */
export class ChunkingService {
  /**
   * Split text into chunks with overlap
   */
  chunkText(
    text: string,
    options: {
      chunkSize: number;
      overlap: number;
      documentId: string;
      customerId: string;
      title?: string;
    }
  ): ChunkingResult {
    const { chunkSize, overlap, documentId, customerId, title } = options;
    const chunks: TextChunk[] = [];

    // Handle empty text
    if (!text || text.trim().length === 0) {
      return {
        chunks: [],
        totalChunks: 0,
        totalCharacters: 0,
      };
    }

    // Split by paragraphs first
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let currentStart = 0;
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) continue;

      // If adding this paragraph exceeds chunk size, save current chunk
      if (currentChunk.length > 0 && currentChunk.length + trimmedParagraph.length > chunkSize) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          metadata: {
            documentId,
            customerId,
            start: currentStart,
            end: currentStart + currentChunk.length,
            title,
          },
        });

        // Start new chunk with overlap
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + '\n\n' + trimmedParagraph;
        currentStart = currentStart + currentChunk.length - overlapText.length;
      } else {
        // Add paragraph to current chunk
        currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
      }

      // If current chunk exceeds max size, split it
      while (currentChunk.length > chunkSize * 1.5) {
        const splitPoint = this.findSplitPoint(currentChunk, chunkSize);
        const chunk = currentChunk.slice(0, splitPoint);

        chunks.push({
          content: chunk.trim(),
          index: chunkIndex++,
          metadata: {
            documentId,
            customerId,
            start: currentStart,
            end: currentStart + chunk.length,
            title,
          },
        });

        // Continue with remainder plus overlap
        const overlapText = chunk.slice(-overlap);
        currentChunk = overlapText + currentChunk.slice(splitPoint);
        currentStart = currentStart + chunk.length - overlapText.length;
      }
    }

    // Add remaining chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        metadata: {
          documentId,
          customerId,
          start: currentStart,
          end: currentStart + currentChunk.length,
          title,
        },
      });
    }

    return {
      chunks,
      totalChunks: chunks.length,
      totalCharacters: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
    };
  }

  /**
   * Find good split point (prefer sentence boundaries)
   */
  private findSplitPoint(text: string, targetSize: number): number {
    // Try to find sentence boundary near target size
    const searchStart = Math.max(0, targetSize - 100);
    const searchEnd = Math.min(text.length, targetSize + 100);
    const searchText = text.slice(searchStart, searchEnd);

    // Look for sentence endings
    const sentenceEndings = /[.!?]\s+/g;
    let lastMatch = -1;
    let match;

    while ((match = sentenceEndings.exec(searchText)) !== null) {
      lastMatch = searchStart + match.index + match[0].length;
    }

    // If found sentence boundary, use it
    if (lastMatch > 0) {
      return lastMatch;
    }

    // Otherwise, try to find word boundary
    const wordBoundary = text.slice(0, targetSize).lastIndexOf(' ');
    if (wordBoundary > targetSize * 0.8) {
      return wordBoundary;
    }

    // Fallback to exact size
    return targetSize;
  }

  /**
   * Chunk text by sentences (alternative approach)
   */
  chunkBySentences(
    text: string,
    options: {
      maxSentencesPerChunk: number;
      documentId: string;
      customerId: string;
      title?: string;
    }
  ): ChunkingResult {
    const { maxSentencesPerChunk, documentId, customerId, title } = options;

    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: TextChunk[] = [];

    for (let i = 0; i < sentences.length; i += maxSentencesPerChunk) {
      const sentenceGroup = sentences.slice(i, i + maxSentencesPerChunk);
      const content = sentenceGroup.join(' ').trim();

      chunks.push({
        content,
        index: Math.floor(i / maxSentencesPerChunk),
        metadata: {
          documentId,
          customerId,
          start: i,
          end: i + sentenceGroup.length,
          title,
        },
      });
    }

    return {
      chunks,
      totalChunks: chunks.length,
      totalCharacters: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
    };
  }
}

/**
 * Embedding Service
 * Generates embeddings for text chunks using OpenAI
 */
export class EmbeddingService {
  private chunkingService = new ChunkingService();

  /**
   * Generate embeddings for chunks
   */
  async embedChunks(
    chunks: TextChunk[],
    options: {
      apiKey: string;
      model?: string;
    }
  ): Promise<EmbeddingResult> {
    const { apiKey, model = 'text-embedding-3-small' } = options;

    try {
      const embeddings = new OpenAIEmbeddings({
        openAIApiKey: apiKey,
        modelName: model,
      });

      // Extract text content
      const texts = chunks.map((chunk) => chunk.content);

      // Generate embeddings in batch
      const embeddingVectors = await embeddings.embedDocuments(texts);

      // Combine chunks with embeddings
      const embeddedChunks: EmbeddedChunk[] = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddingVectors[index],
      }));

      // Calculate tokens and cost
      const tokensUsed = this.estimateTokens(texts);
      const cost = this.calculateCost(tokensUsed, model);

      return {
        chunks: embeddedChunks,
        tokensUsed,
        cost,
        model,
      };
    } catch (error) {
      console.error('Embedding generation error:', error);
      throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process document: chunk and embed
   */
  async processDocument(
    text: string,
    options: {
      documentId: string;
      customerId: string;
      title?: string;
      chunkSize: number;
      overlap: number;
      apiKey: string;
      model?: string;
    }
  ): Promise<{
    chunks: EmbeddedChunk[];
    stats: {
      totalChunks: number;
      totalCharacters: number;
      tokensUsed: number;
      cost: number;
      model: string;
    };
  }> {
    // Chunk text
    const { chunks } = this.chunkingService.chunkText(text, {
      chunkSize: options.chunkSize,
      overlap: options.overlap,
      documentId: options.documentId,
      customerId: options.customerId,
      title: options.title,
    });

    // Generate embeddings
    const result = await this.embedChunks(chunks, {
      apiKey: options.apiKey,
      model: options.model,
    });

    return {
      chunks: result.chunks,
      stats: {
        totalChunks: chunks.length,
        totalCharacters: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
        tokensUsed: result.tokensUsed,
        cost: result.cost,
        model: result.model,
      },
    };
  }

  /**
   * Estimate token count for texts
   * Rough estimation: ~4 characters per token
   */
  private estimateTokens(texts: string[]): number {
    const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Calculate embedding cost based on model
   * Prices as of 2025 (per 1M tokens)
   */
  private calculateCost(tokens: number, model: string): number {
    const pricing: Record<string, number> = {
      'text-embedding-3-small': 0.02, // $0.02 per 1M tokens
      'text-embedding-3-large': 0.13, // $0.13 per 1M tokens
      'text-embedding-ada-002': 0.10, // $0.10 per 1M tokens
    };

    const pricePerMillion = pricing[model] || 0.02;
    return (tokens / 1_000_000) * pricePerMillion;
  }

  /**
   * Get supported embedding models
   */
  static getSupportedModels(): string[] {
    return [
      'text-embedding-3-small',
      'text-embedding-3-large',
      'text-embedding-ada-002',
    ];
  }

  /**
   * Get embedding dimension for model
   */
  static getEmbeddingDimension(model: string): number {
    const dimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };

    return dimensions[model] || 1536;
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
export const chunkingService = new ChunkingService();
