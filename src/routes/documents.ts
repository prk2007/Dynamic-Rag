import express from 'express';
import multer from 'multer';
import { OpenAIEmbeddings } from '@langchain/openai';
import { authenticate } from '../middleware/authenticate.js';
import { documentModel } from '../models/document.js';
import { customerConfigModel } from '../models/customer-config.js';
import { getCustomerOpenAIKey, getCustomerConfig } from '../models/customer.js';
import { s3Service } from '../services/s3.service.js';
import { documentParser, DocumentParser } from '../utils/parsers.js';
import { addDocumentJob, getJobStatus, JobType } from '../queue/queues.js';
import { usageMetricsModel } from '../models/usage-metrics.js';
import type { DocumentType } from '../models/document.js';

const router = express.Router();

// Configure Multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max (will be validated against customer config)
  },
  fileFilter: (req, file, cb) => {
    // Validate file type
    const docType = DocumentParser.detectType(file.originalname);
    if (!docType) {
      return cb(new Error('Unsupported file type'));
    }
    cb(null, true);
  },
});

/**
 * POST /api/documents/upload
 * Upload a document file
 */
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    const customerId = req.user!.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: 'No file provided',
        message: 'Please upload a file',
      });
    }

    // Detect document type
    const docType = DocumentParser.detectType(file.originalname);
    if (!docType) {
      return res.status(400).json({
        error: 'Unsupported file type',
        message: 'Supported types: PDF, TXT, HTML, MD',
      });
    }

    // Get customer config
    const config = await customerConfigModel.getConfig(customerId);

    // Validate file size
    const isFileSizeAllowed = await customerConfigModel.isFileSizeAllowed(
      customerId,
      file.size
    );

    if (!isFileSizeAllowed) {
      return res.status(400).json({
        error: 'File too large',
        message: `Maximum file size is ${config.max_file_size_mb}MB`,
      });
    }

    // Validate document type
    const isDocTypeAllowed = await customerConfigModel.isDocumentTypeAllowed(
      customerId,
      docType
    );

    if (!isDocTypeAllowed) {
      return res.status(400).json({
        error: 'Document type not allowed',
        message: `Allowed types: ${config.allowed_document_types.join(', ')}`,
      });
    }

    // Check document limit
    const stats = await documentModel.getStats(customerId);
    const canUpload = await customerConfigModel.canUploadDocument(
      customerId,
      stats.total
    );

    if (!canUpload) {
      return res.status(400).json({
        error: 'Document limit reached',
        message: `Maximum ${config.max_documents} documents allowed`,
      });
    }

    // Calculate content hash for deduplication
    const contentHash = s3Service.calculateHash(file.buffer);

    // Check for duplicate
    const existingDoc = await documentModel.findByContentHash(
      contentHash,
      customerId
    );

    if (existingDoc) {
      return res.status(409).json({
        error: 'Duplicate document',
        message: 'This document has already been uploaded',
        document: existingDoc,
      });
    }

    // Create document record
    const title = req.body.title || file.originalname;
    const document = await documentModel.create({
      customer_id: customerId,
      title,
      doc_type: docType,
      content_hash: contentHash,
      file_size_bytes: file.size,
    });

    // Upload to S3
    const s3Key = s3Service.generateKey(
      customerId,
      document.id,
      file.originalname
    );

    await s3Service.uploadFile(
      s3Key,
      file.buffer,
      DocumentParser.getMimeType(docType),
      {
        original_filename: file.originalname,
        customer_id: customerId,
        document_id: document.id,
      }
    );

    // Note: S3 key is not stored in documents table currently
    // Document is created with all necessary fields above

    // Add processing job to queue
    const jobId = await addDocumentJob({
      type: JobType.PROCESS_DOCUMENT,
      customerId,
      documentId: document.id,
      s3Key,
      documentType: docType,
      metadata: {
        title,
        originalFilename: file.originalname,
      },
    });

    console.log(`📤 Document uploaded: ${document.id}, Job: ${jobId}`);

    res.status(202).json({
      message: 'Document uploaded and queued for processing',
      document: {
        id: document.id,
        title: document.title,
        type: document.doc_type,
        size: document.file_size_bytes,
        status: document.status,
        created_at: document.created_at,
      },
      job_id: jobId,
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/documents/url
 * Process document from URL
 */
router.post('/url', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const { url, title } = req.body;

    if (!url) {
      return res.status(400).json({
        error: 'Missing URL',
        message: 'Please provide a URL to scrape',
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'Please provide a valid URL',
      });
    }

    // Check document limit
    const stats = await documentModel.getStats(customerId);
    const config = await customerConfigModel.getConfig(customerId);

    const canUpload = await customerConfigModel.canUploadDocument(
      customerId,
      stats.total
    );

    if (!canUpload) {
      return res.status(400).json({
        error: 'Document limit reached',
        message: `Maximum ${config.max_documents} documents allowed`,
      });
    }

    // Create document record
    const documentTitle = title || new URL(url).hostname;
    const document = await documentModel.create({
      customer_id: customerId,
      title: documentTitle,
      doc_type: 'html',
      source_url: url,
    });

    // Add scraping job to queue
    const jobId = await addDocumentJob({
      type: JobType.SCRAPE_URL,
      customerId,
      documentId: document.id,
      url,
      metadata: {
        title: documentTitle,
      },
    });

    console.log(`🌐 URL queued for scraping: ${url}, Job: ${jobId}`);

    res.status(202).json({
      message: 'URL queued for processing',
      document: {
        id: document.id,
        title: document.title,
        type: document.doc_type,
        source_url: document.source_url,
        status: document.status,
        created_at: document.created_at,
      },
      job_id: jobId,
    });
  } catch (error) {
    console.error('URL processing error:', error);
    res.status(500).json({
      error: 'URL processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/documents
 * List customer documents with pagination
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const status = req.query.status as any;
    const docType = req.query.type as any;

    const offset = (page - 1) * limit;

    const { documents, total } = await documentModel.list(customerId, {
      limit,
      offset,
      status,
      doc_type: docType,
    });

    res.json({
      documents,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Document list error:', error);
    res.status(500).json({
      error: 'Failed to list documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/documents/stats
 * Get document statistics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const stats = await documentModel.getStats(customerId);

    res.json(stats);
  } catch (error) {
    console.error('Document stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/documents/:id
 * Get document details
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const documentId = req.params.id;

    const document = await documentModel.findById(documentId, customerId);

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        message: 'Document does not exist or access denied',
      });
    }

    res.json(document);
  } catch (error) {
    console.error('Document get error:', error);
    res.status(500).json({
      error: 'Failed to get document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/documents/:id/status
 * Get document processing status
 */
router.get('/:id/status', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const documentId = req.params.id;

    const document = await documentModel.findById(documentId, customerId);

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    // Get job status
    const jobStatus = await getJobStatus(documentId);

    res.json({
      document_id: document.id,
      status: document.status,
      error_message: document.error_message,
      job_status: jobStatus,
      stats: {
        chunks: document.chunk_count,
        characters: document.character_count,
        pages: document.page_count,
        tokens_used: document.embedding_tokens_used,
        cost: document.embedding_cost_usd,
        processing_time_ms: document.processing_time_ms,
      },
    });
  } catch (error) {
    console.error('Document status error:', error);
    res.status(500).json({
      error: 'Failed to get status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Delete document
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const documentId = req.params.id;

    const document = await documentModel.findById(documentId, customerId);

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    // Delete from S3
    if (document.s3_key) {
      await s3Service.deleteFile(document.s3_key);
    }

    // Delete from pgvector (import at runtime to avoid circular deps)
    const { pgvectorService } = await import('../services/pgvector.service.js');
    await pgvectorService.deleteDocument(customerId, documentId);

    // Delete from database
    await documentModel.delete(documentId, customerId);

    console.log(`🗑️  Deleted document ${documentId}`);

    res.json({
      message: 'Document deleted successfully',
      document_id: documentId,
    });
  } catch (error) {
    console.error('Document delete error:', error);
    res.status(500).json({
      error: 'Failed to delete document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/documents/:id/download
 * Get presigned URL for document download
 */
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const documentId = req.params.id;

    const document = await documentModel.findById(documentId, customerId);

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    if (!document.s3_key) {
      return res.status(400).json({
        error: 'No file available',
        message: 'This document does not have a downloadable file',
      });
    }

    // Generate presigned URL (valid for 1 hour)
    const downloadUrl = await s3Service.getPresignedUrl(document.s3_key, 3600);

    res.json({
      document_id: documentId,
      download_url: downloadUrl,
      expires_in: 3600,
    });
  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({
      error: 'Failed to generate download URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/documents/search
 * Search document chunks using vector similarity
 */
router.post('/search', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const { query: searchQuery, limit = 10, document_id } = req.body;

    if (!searchQuery || typeof searchQuery !== 'string') {
      return res.status(400).json({
        error: 'Missing query',
        message: 'Please provide a search query string',
      });
    }

    // Get customer's OpenAI key
    const openaiKey = await getCustomerOpenAIKey(customerId);
    if (!openaiKey) {
      return res.status(400).json({
        error: 'OpenAI key not configured',
        message: 'Please add your OpenAI API key in profile settings before searching',
      });
    }

    // Get customer config for embedding model
    const config = await getCustomerConfig(customerId);
    const model = config?.embedding_model || 'text-embedding-3-small';

    // Generate query embedding
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: openaiKey,
      modelName: model,
    });
    const queryVector = await embeddings.embedQuery(searchQuery);

    // Search pgvector
    const { pgvectorService } = await import('../services/pgvector.service.js');
    const results = await pgvectorService.search(customerId, queryVector, {
      limit: Math.min(limit, 50),
      documentId: document_id,
    });

    // Track search query (fire-and-forget)
    usageMetricsModel.track(customerId, 'search_query', 1, {
      metadata: { query: searchQuery, results_count: results.length },
    });

    res.json({
      query: searchQuery,
      results,
      total: results.length,
    });
  } catch (error) {
    console.error('Document search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
