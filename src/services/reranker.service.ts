import axios from 'axios';

/**
 * Reranker Service
 * Provides semantic reranking using external APIs (Cohere)
 */
export class RerankerService {
  /**
   * Rerank documents using Cohere's rerank API
   */
  async rerank(
    query: string,
    documents: string[],
    apiKey: string,
    options: {
      model?: string;
      top_n?: number;
    } = {}
  ): Promise<Array<{ index: number; relevance_score: number }>> {
    const { model = 'rerank-english-v2.0', top_n = documents.length } = options;

    try {
      const response = await axios.post(
        'https://api.cohere.ai/v1/rerank',
        {
          query,
          documents,
          model,
          top_n: Math.min(top_n, documents.length),
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      return response.data.results.map((r: any) => ({
        index: r.index,
        relevance_score: r.relevance_score,
      }));
    } catch (error) {
      console.error('Error calling Cohere rerank API:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Reranking failed: ${error.response?.data?.message || error.message}`
        );
      }
      throw new Error('Reranking failed: Unknown error');
    }
  }

  /**
   * Check if reranking is available (API key configured)
   */
  isAvailable(): boolean {
    return !!process.env.COHERE_API_KEY;
  }

  /**
   * Get the configured API key
   */
  getApiKey(): string | undefined {
    return process.env.COHERE_API_KEY;
  }
}

// Export singleton instance
export const rerankerService = new RerankerService();
