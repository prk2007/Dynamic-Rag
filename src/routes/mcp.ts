import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { OpenAIEmbeddings } from '@langchain/openai';
import { findCustomerByApiKey, getCustomerOpenAIKey, getCustomerConfig } from '../models/customer.js';
import { pgvectorService } from '../services/pgvector.service.js';
import { documentModel } from '../models/document.js';
import { rerankerService } from '../services/reranker.service.js';

const router = express.Router();

/**
 * Authenticate via API key (for MCP clients like Cursor that can't do JWT login)
 */
async function getCustomerIdFromApiKey(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const apiKey = authHeader.substring(7);
  const customer = await findCustomerByApiKey(apiKey);
  return customer?.id || null;
}

/** Tool definitions exposed to MCP clients */
const TOOLS = [
  {
    name: 'search_documents',
    description: `Search uploaded documents using semantic similarity. Returns the most relevant text chunks matching your query.

Usage Tips:
- Use natural language queries (e.g., "authentication flow", "database schema")
- Results include document title, type, and chunk position for context
- Filter by document_id to search within a specific document
- Default limit is 10; increase for comprehensive searches (max 50)
- Use context_chunks to see surrounding text for better understanding

Best Practices:
- Start with list_documents to see available documents
- Use specific queries for better results
- Combine with get_document to understand document structure first
- Add context_chunks (1-3) when you need more surrounding context`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query text',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10, max: 50)',
        },
        document_id: {
          type: 'string',
          description: 'Optional: filter results to a specific document ID',
        },
        context_chunks: {
          type: 'number',
          description: 'Number of adjacent chunks to include before/after each result (0-3, default: 0)',
        },
        output_format: {
          type: 'string',
          enum: ['text', 'json'],
          description: 'Output format: "text" for human-readable (default), "json" for structured data',
        },
        rerank: {
          type: 'boolean',
          description: 'Apply reranking to improve result relevance (requires Cohere API key)',
        },
        min_score: {
          type: 'number',
          description: 'Minimum relevance score threshold (0.0-1.0)',
        },
        group_by_document: {
          type: 'boolean',
          description: 'Group results by document, showing best chunk per document',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_documents',
    description: `List all uploaded documents. Shows document ID, title, type, status, chunk count, and creation date.

Usage Tips:
- Use this first to see what documents are available before searching
- Filter by status to see only completed documents
- Filter by doc_type to narrow down to specific file types
- Use pagination for large document collections

Best Practices:
- Check document status before searching (only 'completed' documents are searchable)
- Note the document IDs for use in search_documents or get_document
- Use filters to quickly find relevant documents`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['processing', 'completed', 'failed'],
          description: 'Optional: filter by document status',
        },
        doc_type: {
          type: 'string',
          enum: ['pdf', 'txt', 'html', 'md'],
          description: 'Optional: filter by document type',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of documents to return (default: 50, max: 100)',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_document',
    description: `Get detailed information about a specific document by its ID, including title, type, status, chunk count, character count, and processing stats.

Usage Tips:
- Use this to understand document structure before searching
- Check chunk_count to know how many chunks the document has
- Review processing stats to understand embedding costs
- Verify status is 'completed' before searching

Best Practices:
- Use after list_documents to get detailed info about specific documents
- Check error_message if status is 'failed'
- Review chunk_count and character_count to gauge document size`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: {
          type: 'string',
          description: 'The document ID to look up',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_stats',
    description: `Get overall document statistics: total documents, counts by status and type, total size, total chunks, and total embedding cost.

Usage Tips:
- Use this to get a high-level overview of your document collection
- Check counts by status to see processing progress
- Review total embedding cost to track usage
- See distribution by document type

Best Practices:
- Use this first to understand your document collection
- Monitor embedding costs regularly
- Check for failed documents that may need reprocessing`,
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_document_overview',
    description: `Get a high-level overview of a document by sampling chunks throughout its content. Returns document metadata and evenly-distributed content samples.

Usage Tips:
- Use this to quickly understand what a document contains
- Samples are evenly distributed throughout the document
- Adjust sample_size based on document length (3-10 samples)
- Great for previewing documents before detailed search

Best Practices:
- Use after list_documents to preview interesting documents
- Start with 5 samples for most documents
- Increase sample_size for longer documents
- Use before search_documents to understand document structure`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: {
          type: 'string',
          description: 'Document ID to preview',
        },
        sample_size: {
          type: 'number',
          description: 'Number of chunks to sample (3-10, default: 5)',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'compare_documents',
    description: `Compare content across multiple documents to find similarities, differences, or related information. Searches each document independently and presents results grouped by document.

Usage Tips:
- Use to find how different documents discuss the same topic
- Great for comparing versions, implementations, or approaches
- Adjusts results_per_document based on document relevance (default: 3, max: 10)
- Limited to 10 documents per comparison

Best Practices:
- Use specific queries for meaningful comparisons
- Start with 3 results per document
- Compare documents of the same type for consistency
- Review get_document first to understand what you're comparing`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query to compare across documents',
        },
        document_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of document IDs to compare (2-10 documents)',
        },
        results_per_document: {
          type: 'number',
          description: 'Number of results per document (default: 3, max: 10)',
        },
      },
      required: ['query', 'document_ids'],
    },
  },
];

/**
 * Helper function to format a single search result with rich metadata
 */
function formatSearchResult(
  result: any,
  index: number,
  total: number,
  document: any
): string {
  const title = document?.title || result.title || 'Unknown Document';
  const docType = document?.doc_type?.toUpperCase() || 'UNKNOWN';
  const chunkPosition = document?.chunk_count
    ? `${result.chunk_index + 1}/${document.chunk_count}`
    : `${result.chunk_index + 1}`;

  return [
    `--- Result ${index + 1}/${total}: "${title}" (${docType}) ---`,
    `Score: ${result.score.toFixed(4)} | Chunk: ${chunkPosition} | Document: ${result.document_id}`,
    `---`,
    result.content,
  ].join('\n');
}

/**
 * Helper function to format search result with context chunks
 */
function formatSearchResultWithContext(
  result: any,
  index: number,
  total: number,
  document: any
): string {
  const title = document?.title || result.title || 'Unknown Document';
  const docType = document?.doc_type?.toUpperCase() || 'UNKNOWN';
  const chunkPosition = document?.chunk_count
    ? `${result.chunk_index + 1}/${document.chunk_count}`
    : `${result.chunk_index + 1}`;

  const parts = [
    `--- Result ${index + 1}/${total}: "${title}" (${docType}) ---`,
    `Score: ${result.score.toFixed(4)} | Chunk: ${chunkPosition} | Document: ${result.document_id}`,
    `---`,
  ];

  // Add context before
  if (result.context?.before && result.context.before.length > 0) {
    parts.push('... [Context Before] ...');
    result.context.before.forEach((chunk: any) => {
      parts.push(`[Chunk ${chunk.chunk_index + 1}] ${chunk.content}`);
    });
    parts.push('');
  }

  // Add main content
  parts.push(`[MAIN RESULT - Chunk ${result.chunk_index + 1}] ${result.content}`);

  // Add context after
  if (result.context?.after && result.context.after.length > 0) {
    parts.push('');
    result.context.after.forEach((chunk: any) => {
      parts.push(`[Chunk ${chunk.chunk_index + 1}] ${chunk.content}`);
    });
    parts.push('... [Context After] ...');
  }

  return parts.join('\n');
}

/**
 * JSON output interfaces
 */
interface SearchResultJSON {
  query: string;
  total_results: number;
  results: Array<{
    rank: number;
    score: number;
    document_id: string;
    document_title: string;
    document_type: string;
    chunk_index: number;
    chunk_position: string;
    content: string;
    context?: {
      before: Array<{ chunk_index: number; content: string }>;
      after: Array<{ chunk_index: number; content: string }>;
    };
    metadata: { start_char: number; end_char: number; created_at: string };
  }>;
}

/**
 * Execute the search_documents tool
 */
async function executeSearch(
  customerId: string,
  args: {
    query: string;
    limit?: number;
    document_id?: string;
    context_chunks?: number;
    output_format?: string;
    rerank?: boolean;
    min_score?: number;
    group_by_document?: boolean;
  }
) {
  const openaiKey = await getCustomerOpenAIKey(customerId);
  if (!openaiKey) {
    return {
      content: [{ type: 'text', text: 'Error: OpenAI API key not configured. Add it in your profile settings.' }],
      isError: true,
    };
  }

  const config = await getCustomerConfig(customerId);
  const model = config?.embedding_model || 'text-embedding-3-small';

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: openaiKey,
    modelName: model,
  });
  const queryVector = await embeddings.embedQuery(args.query);

  let results = await pgvectorService.search(customerId, queryVector, {
    limit: Math.min(args.limit || 10, 50),
    documentId: args.document_id,
    minScore: args.min_score || 0,
  });

  if (results.length === 0) {
    return {
      content: [{ type: 'text', text: `No results found for: "${args.query}"` }],
      isError: false,
    };
  }

  // Apply reranking if requested
  if (args.rerank && rerankerService.isAvailable()) {
    try {
      const documents = results.map((r) => r.content);
      const apiKey = rerankerService.getApiKey()!;
      const rerankResults = await rerankerService.rerank(args.query, documents, apiKey, {
        top_n: results.length,
      });

      // Reorder results based on rerank scores
      results = rerankResults.map((rr) => ({
        ...results[rr.index],
        score: rr.relevance_score,
      }));
    } catch (error) {
      console.error('Reranking failed, using original results:', error);
      // Continue with original results if reranking fails
    }
  }

  // Apply group_by_document if requested
  if (args.group_by_document) {
    const groupedByDoc = new Map();
    for (const result of results) {
      const existing = groupedByDoc.get(result.document_id);
      if (!existing || result.score > existing.score) {
        groupedByDoc.set(result.document_id, result);
      }
    }
    results = Array.from(groupedByDoc.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, args.limit || 10);
  }

  // Fetch document metadata for all results
  const documentIds = [...new Set(results.map((r) => r.document_id))];
  const documents = await Promise.all(
    documentIds.map((id) => documentModel.findById(id, customerId))
  );
  const docMap = new Map(documents.filter((d) => d).map((d) => [d!.id, d!]));

  // Handle context chunks if requested
  const contextChunks = Math.min(Math.max(args.context_chunks || 0, 0), 3);
  let enrichedResults: any[] = results;
  if (contextChunks > 0) {
    enrichedResults = await Promise.all(
      results.map(async (result) => {
        const startIdx = Math.max(0, result.chunk_index - contextChunks);
        const endIdx = result.chunk_index + contextChunks;

        try {
          const contextData = await pgvectorService.getChunkRange(
            customerId,
            result.document_id,
            startIdx,
            endIdx
          );

          return {
            ...result,
            context: {
              before: contextData.filter((c) => c.chunk_index < result.chunk_index),
              after: contextData.filter((c) => c.chunk_index > result.chunk_index),
            },
          };
        } catch (error) {
          console.error('Error fetching context chunks:', error);
          return result; // Return without context if error
        }
      })
    );
  }

  // Handle JSON output format
  if (args.output_format === 'json') {
    const jsonOutput: SearchResultJSON = {
      query: args.query,
      total_results: enrichedResults.length,
      results: enrichedResults.map((r, i) => {
        const doc = docMap.get(r.document_id);
        const baseResult = {
          rank: i + 1,
          score: r.score,
          document_id: r.document_id,
          document_title: doc?.title || 'Unknown',
          document_type: doc?.doc_type || 'unknown',
          chunk_index: r.chunk_index,
          chunk_position: `${r.chunk_index + 1}/${doc?.chunk_count || '?'}`,
          content: r.content,
          metadata: r.metadata,
        };

        if (r.context) {
          return {
            ...baseResult,
            context: {
              before: r.context.before.map((c: any) => ({
                chunk_index: c.chunk_index,
                content: c.content,
              })),
              after: r.context.after.map((c: any) => ({
                chunk_index: c.chunk_index,
                content: c.content,
              })),
            },
          };
        }

        return baseResult;
      }),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(jsonOutput, null, 2) }],
      isError: false,
    };
  }

  // Format results with rich metadata (text format)
  const formatted = enrichedResults
    .map((r, i) =>
      contextChunks > 0
        ? formatSearchResultWithContext(r, i, enrichedResults.length, docMap.get(r.document_id))
        : formatSearchResult(r, i, enrichedResults.length, docMap.get(r.document_id))
    )
    .join('\n\n');

  return {
    content: [{ type: 'text', text: `Found ${enrichedResults.length} results for "${args.query}":\n\n${formatted}` }],
    isError: false,
  };
}

/**
 * Execute the list_documents tool
 */
async function executeListDocuments(
  customerId: string,
  args: { status?: string; doc_type?: string; limit?: number; page?: number }
) {
  const limit = Math.min(args.limit || 50, 100);
  const page = args.page || 1;
  const offset = (page - 1) * limit;

  const { documents, total } = await documentModel.list(customerId, {
    limit,
    offset,
    status: args.status as any,
    doc_type: args.doc_type as any,
  });

  if (documents.length === 0) {
    return {
      content: [{ type: 'text', text: 'No documents found.' }],
      isError: false,
    };
  }

  const formatted = documents
    .map(
      (d) =>
        `- **${d.title}** (ID: ${d.id})\n  Type: ${d.doc_type} | Status: ${d.status} | Chunks: ${d.chunk_count} | Created: ${new Date(d.created_at).toISOString().split('T')[0]}`
    )
    .join('\n');

  const totalPages = Math.ceil(total / limit);

  return {
    content: [
      {
        type: 'text',
        text: `Found ${total} document(s) (page ${page}/${totalPages}):\n\n${formatted}`,
      },
    ],
    isError: false,
  };
}

/**
 * Execute the get_document tool
 */
async function executeGetDocument(
  customerId: string,
  args: { document_id: string }
) {
  const doc = await documentModel.findById(args.document_id, customerId);

  if (!doc) {
    return {
      content: [{ type: 'text', text: `Document not found: ${args.document_id}` }],
      isError: true,
    };
  }

  const details = [
    `**${doc.title}**`,
    `ID: ${doc.id}`,
    `Type: ${doc.doc_type}`,
    `Status: ${doc.status}`,
    doc.source_url ? `Source URL: ${doc.source_url}` : null,
    `File size: ${doc.file_size_bytes ? `${((doc.file_size_bytes ?? 0) / 1024).toFixed(1)} KB` : 'N/A'}`,
    `Chunks: ${doc.chunk_count ?? 0}`,
    `Characters: ${doc.character_count ?? 0}`,
    doc.page_count ? `Pages: ${doc.page_count}` : null,
    `Embedding tokens used: ${doc.embedding_tokens_used ?? 0}`,
    `Embedding cost: $${Number(doc.embedding_cost_usd ?? 0).toFixed(6)}`,
    doc.processing_time_ms ? `Processing time: ${doc.processing_time_ms}ms` : null,
    doc.error_message ? `Error: ${doc.error_message}` : null,
    `Created: ${new Date(doc.created_at).toISOString()}`,
    `Updated: ${new Date(doc.updated_at).toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    content: [{ type: 'text', text: details }],
    isError: false,
  };
}

/**
 * Execute the compare_documents tool
 */
async function executeCompareDocuments(
  customerId: string,
  args: { query: string; document_ids: string[]; results_per_document?: number }
) {
  // Validate inputs
  if (!args.document_ids || args.document_ids.length < 2) {
    return {
      content: [{ type: 'text', text: 'Error: At least 2 document IDs are required for comparison.' }],
      isError: true,
    };
  }

  if (args.document_ids.length > 10) {
    return {
      content: [{ type: 'text', text: 'Error: Maximum 10 documents can be compared at once.' }],
      isError: true,
    };
  }

  const resultsPerDoc = Math.min(Math.max(args.results_per_document || 3, 1), 10);

  // Get OpenAI key for embeddings
  const openaiKey = await getCustomerOpenAIKey(customerId);
  if (!openaiKey) {
    return {
      content: [{ type: 'text', text: 'Error: OpenAI API key not configured. Add it in your profile settings.' }],
      isError: true,
    };
  }

  const config = await getCustomerConfig(customerId);
  const model = config?.embedding_model || 'text-embedding-3-small';

  // Generate query embedding once
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: openaiKey,
    modelName: model,
  });
  const queryVector = await embeddings.embedQuery(args.query);

  // Search each document independently
  const documentResults = await Promise.all(
    args.document_ids.map(async (docId) => {
      try {
        const doc = await documentModel.findById(docId, customerId);
        if (!doc) {
          return { document: null, results: [], error: 'Document not found' };
        }

        if (doc.status !== 'completed') {
          return { document: doc, results: [], error: `Document status: ${doc.status}` };
        }

        const results = await pgvectorService.search(customerId, queryVector, {
          limit: resultsPerDoc,
          documentId: docId,
        });

        return { document: doc, results, error: null };
      } catch (error) {
        console.error(`Error searching document ${docId}:`, error);
        return { document: null, results: [], error: 'Search failed' };
      }
    })
  );

  // Format comparison output
  const header = [
    `**Document Comparison Results**`,
    `Query: "${args.query}"`,
    `Comparing ${args.document_ids.length} documents with up to ${resultsPerDoc} results each`,
    ``,
  ].join('\n');

  const comparisons = documentResults
    .map((docResult, idx) => {
      if (!docResult.document) {
        return [
          `### Document ${idx + 1}: ${args.document_ids[idx]}`,
          `❌ Error: ${docResult.error}`,
          ``,
        ].join('\n');
      }

      const doc = docResult.document;
      const docHeader = [
        `### Document ${idx + 1}: "${doc.title}" (${doc.doc_type.toUpperCase()})`,
        `ID: ${doc.id} | Chunks: ${doc.chunk_count} | Status: ${doc.status}`,
      ].join('\n');

      if (docResult.error) {
        return [docHeader, `⚠️  ${docResult.error}`, ``].join('\n');
      }

      if (docResult.results.length === 0) {
        return [docHeader, `No results found in this document.`, ``].join('\n');
      }

      const results = docResult.results
        .map((r, i) => {
          const chunkPos = `${r.chunk_index + 1}/${doc.chunk_count}`;
          return [
            `**Result ${i + 1}/${docResult.results.length}** (Score: ${r.score.toFixed(4)}, Chunk: ${chunkPos})`,
            r.content,
          ].join('\n');
        })
        .join('\n\n');

      return [docHeader, results, ``].join('\n\n');
    })
    .join('\n---\n\n');

  return {
    content: [{ type: 'text', text: `${header}${comparisons}` }],
    isError: false,
  };
}

/**
 * Execute the get_document_overview tool
 */
async function executeGetDocumentOverview(
  customerId: string,
  args: { document_id: string; sample_size?: number }
) {
  const doc = await documentModel.findById(args.document_id, customerId);

  if (!doc) {
    return {
      content: [{ type: 'text', text: `Document not found: ${args.document_id}` }],
      isError: true,
    };
  }

  if (doc.status !== 'completed') {
    return {
      content: [
        {
          type: 'text',
          text: `Document is not ready for preview. Status: ${doc.status}${doc.error_message ? ` (${doc.error_message})` : ''}`,
        },
      ],
      isError: true,
    };
  }

  if (doc.chunk_count === 0) {
    return {
      content: [{ type: 'text', text: 'Document has no chunks available for preview.' }],
      isError: true,
    };
  }

  const sampleSize = Math.min(Math.max(args.sample_size || 5, 3), 10);

  // Calculate evenly distributed sample indices
  const sampleIndices: number[] = [];
  if (doc.chunk_count === 1) {
    sampleIndices.push(0);
  } else {
    const step = (doc.chunk_count - 1) / (Math.min(sampleSize, doc.chunk_count) - 1);
    for (let i = 0; i < Math.min(sampleSize, doc.chunk_count); i++) {
      sampleIndices.push(Math.round(i * step));
    }
  }

  // Fetch sampled chunks
  const chunks = await Promise.all(
    sampleIndices.map(async (idx) => {
      try {
        const result = await pgvectorService.getChunkRange(customerId, args.document_id, idx, idx);
        return result[0] || null;
      } catch (error) {
        console.error(`Error fetching chunk ${idx}:`, error);
        return null;
      }
    })
  );

  const validChunks = chunks.filter((c) => c !== null);

  if (validChunks.length === 0) {
    return {
      content: [{ type: 'text', text: 'Unable to fetch document chunks for preview.' }],
      isError: true,
    };
  }

  // Format overview
  const header = [
    `**Document Overview: "${doc.title}"**`,
    `Type: ${doc.doc_type.toUpperCase()} | Status: ${doc.status} | Total Chunks: ${doc.chunk_count}`,
    `Size: ${doc.file_size_bytes ? `${(doc.file_size_bytes / 1024).toFixed(1)} KB` : 'N/A'} | Characters: ${doc.character_count}`,
    doc.page_count ? `Pages: ${doc.page_count}` : null,
    ``,
    `Showing ${validChunks.length} sample chunks evenly distributed throughout the document:`,
    ``,
  ]
    .filter(Boolean)
    .join('\n');

  const samples = validChunks
    .map((chunk, i) => {
      const position = `${chunk.chunk_index + 1}/${doc.chunk_count}`;
      return [
        `--- Sample ${i + 1}/${validChunks.length} (Chunk ${position}) ---`,
        chunk.content,
      ].join('\n');
    })
    .join('\n\n');

  return {
    content: [{ type: 'text', text: `${header}${samples}` }],
    isError: false,
  };
}

/**
 * Execute the get_stats tool
 */
async function executeGetStats(customerId: string) {
  const stats = await documentModel.getStats(customerId);

  const text = [
    `**Document Statistics**`,
    `Total documents: ${stats.total}`,
    ``,
    `By status:`,
    `  Processing: ${stats.by_status.processing}`,
    `  Completed: ${stats.by_status.completed}`,
    `  Failed: ${stats.by_status.failed}`,
    ``,
    `By type:`,
    `  PDF: ${stats.by_type.pdf}`,
    `  TXT: ${stats.by_type.txt}`,
    `  HTML: ${stats.by_type.html}`,
    `  MD: ${stats.by_type.md}`,
    ``,
    `Total size: ${(stats.total_size_bytes / (1024 * 1024)).toFixed(2)} MB`,
    `Total chunks: ${stats.total_chunks}`,
    `Total embedding cost: $${stats.total_embedding_cost.toFixed(6)}`,
  ].join('\n');

  return {
    content: [{ type: 'text', text }],
    isError: false,
  };
}

/**
 * Handle a single JSON-RPC message and return the response object (or null for notifications)
 */
async function handleJsonRpcMessage(
  req: Request,
  message: any
): Promise<any | null> {
  const { id, method, params = {} } = message;

  // Notifications (no id) don't get a response
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null;
  }

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'dynamic-rag',
          version: '1.0.0',
        },
      },
    };
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS },
    };
  }

  if (method === 'tools/call') {
    const customerId = await getCustomerIdFromApiKey(req);
    if (!customerId) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Missing or invalid Authorization: Bearer <api_key> header' },
      };
    }

    const toolName = params?.name;
    const toolArgs = params?.arguments || {};

    let result;

    switch (toolName) {
      case 'search_documents':
        if (!toolArgs.query) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameter: query' },
          };
        }
        result = await executeSearch(customerId, toolArgs);
        break;

      case 'list_documents':
        result = await executeListDocuments(customerId, toolArgs);
        break;

      case 'get_document':
        if (!toolArgs.document_id) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameter: document_id' },
          };
        }
        result = await executeGetDocument(customerId, toolArgs);
        break;

      case 'get_stats':
        result = await executeGetStats(customerId);
        break;

      case 'get_document_overview':
        if (!toolArgs.document_id) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameter: document_id' },
          };
        }
        result = await executeGetDocumentOverview(customerId, toolArgs);
        break;

      case 'compare_documents':
        if (!toolArgs.query || !toolArgs.document_ids) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameters: query and document_ids' },
          };
        }
        result = await executeCompareDocuments(customerId, toolArgs);
        break;

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        };
    }

    return { jsonrpc: '2.0', id, result };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  };
}

// Track SSE clients for server-initiated messages
const sseClients = new Map<string, Response>();

/**
 * GET /api/mcp
 * SSE transport: Cursor falls back to this if Streamable HTTP doesn't work.
 * Establishes SSE connection and sends the POST endpoint URL.
 */
router.get('/', (req: Request, res: Response) => {
  const sessionId = crypto.randomUUID();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Mcp-Session-Id': sessionId,
  });

  // Send the endpoint event telling the client where to POST messages
  const postEndpoint = `/api/mcp/message?sessionId=${sessionId}`;
  res.write(`event: endpoint\ndata: ${postEndpoint}\n\n`);

  sseClients.set(sessionId, res);

  req.on('close', () => {
    sseClients.delete(sessionId);
  });
});

/**
 * POST /api/mcp/message
 * SSE transport: receives JSON-RPC messages from the client via this endpoint
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string;
    const sseRes = sessionId ? sseClients.get(sessionId) : null;
    const message = req.body;

    const response = await handleJsonRpcMessage(req, message);

    if (response === null) {
      // Notification — acknowledge but also send via SSE if available
      return res.status(202).send();
    }

    // Send response back via HTTP
    res.json(response);

    // Also send via SSE if connected
    if (sseRes && !sseRes.writableEnded) {
      sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }
  } catch (error) {
    console.error('MCP SSE message error:', error);
    res.json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32603, message: error instanceof Error ? error.message : 'Internal error' },
    });
  }
});

/**
 * POST /api/mcp
 * Streamable HTTP transport (primary): Cursor sends JSON-RPC here directly.
 * Supports single messages and batched arrays.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Handle batched messages (array of JSON-RPC messages)
    if (Array.isArray(body)) {
      const responses: any[] = [];
      for (const message of body) {
        const response = await handleJsonRpcMessage(req, message);
        if (response !== null) {
          responses.push(response);
        }
      }

      if (responses.length === 0) {
        return res.status(202).send();
      }

      res.setHeader('Content-Type', 'application/json');
      return res.json(responses.length === 1 ? responses[0] : responses);
    }

    // Handle single message
    const response = await handleJsonRpcMessage(req, body);

    if (response === null) {
      return res.status(202).send();
    }

    res.setHeader('Content-Type', 'application/json');
    res.json(response);
  } catch (error) {
    console.error('MCP error:', error);
    res.json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
    });
  }
});

/**
 * DELETE /api/mcp
 * Streamable HTTP: client signals session end
 */
router.delete('/', (req: Request, res: Response) => {
  res.status(200).send();
});

export default router;
