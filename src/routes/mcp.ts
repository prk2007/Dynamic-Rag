import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { OpenAIEmbeddings } from '@langchain/openai';
import { findCustomerByApiKey, getCustomerOpenAIKey, getCustomerConfig } from '../models/customer.js';
import { lancedbService } from '../services/lancedb.service.js';
import { documentModel } from '../models/document.js';

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
    description: 'Search uploaded documents using semantic similarity. Returns the most relevant text chunks matching your query.',
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
      },
      required: ['query'],
    },
  },
  {
    name: 'list_documents',
    description: 'List all uploaded documents. Shows document ID, title, type, status, chunk count, and creation date. Use this to see what documents are available before searching.',
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
    description: 'Get detailed information about a specific document by its ID, including title, type, status, chunk count, character count, and processing stats.',
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
    description: 'Get overall document statistics: total documents, counts by status and type, total size, total chunks, and total embedding cost.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

/**
 * Execute the search_documents tool
 */
async function executeSearch(
  customerId: string,
  args: { query: string; limit?: number; document_id?: string }
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

  const results = await lancedbService.search(customerId, queryVector, {
    limit: Math.min(args.limit || 10, 50),
    documentId: args.document_id,
  });

  if (results.length === 0) {
    return {
      content: [{ type: 'text', text: `No results found for: "${args.query}"` }],
      isError: false,
    };
  }

  const formatted = results
    .map((r, i) => `--- Result ${i + 1} (score: ${r.score.toFixed(4)}, doc: ${r.document_id}) ---\n${r.content}`)
    .join('\n\n');

  return {
    content: [{ type: 'text', text: `Found ${results.length} results for "${args.query}":\n\n${formatted}` }],
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
    `File size: ${doc.file_size_bytes ? `${(doc.file_size_bytes / 1024).toFixed(1)} KB` : 'N/A'}`,
    `Chunks: ${doc.chunk_count}`,
    `Characters: ${doc.character_count}`,
    doc.page_count ? `Pages: ${doc.page_count}` : null,
    `Embedding tokens used: ${doc.embedding_tokens_used}`,
    `Embedding cost: $${doc.embedding_cost_usd.toFixed(6)}`,
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
