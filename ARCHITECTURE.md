# Dynamic RAG with n8n Integration - Architecture Design

## 📋 Executive Summary

Multi-tenant RAG pipeline system that integrates with n8n for automated document ingestion. Supports 10s to 1000s of customers with complete data isolation, real-time processing, and versioning.

### Tech Stack Finalized
- **Customer DB**: PostgreSQL
- **Metrics**: Prometheus + Grafana (or built-in metrics)
- **Frontend**: React/Next.js
- **Queue**: Redis + BullMQ
- **Auth**: JWT tokens
- **Storage**: S3 for file uploads
- **Rate Limiting**: Per-customer configurable limits

---

## 🏗️ System Architecture

### High-Level Overview

```
┌─────────────┐
│   Next.js   │ ← User Dashboard (React)
│   Frontend  │
└──────┬──────┘
       │ JWT Auth
       ↓
┌─────────────────────────────────────────┐
│         Express API Server              │
│  ┌──────────────────────────────────┐   │
│  │  Auth Middleware (JWT)           │   │
│  │  Rate Limiting (per-customer)    │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │   MCP    │  │  Document Ingestion  │ │
│  │ Endpoint │  │    REST API          │ │
│  └──────────┘  └──────────────────────┘ │
└─────────┬───────────────┬────────────────┘
          │               │
          ↓               ↓
┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │    │ Redis Queue  │
│  (Customer   │    │ (BullMQ Jobs)│
│   Metadata)  │    └──────────────┘
└──────────────┘           ↓
                    ┌──────────────────┐
                    │  Job Processors  │
                    │  - PDF Parser    │
                    │  - Web Scraper   │
                    │  - Embeddings    │
                    └────────┬─────────┘
                             ↓
                    ┌─────────────────────────┐
                    │    S3 Storage           │
                    │  - Raw Documents        │
                    │  - Processed Files      │
                    └─────────────────────────┘
                             ↓
                    ┌─────────────────────────┐
                    │  LanceDB (per customer) │
                    │  data/customers/{id}/   │
                    │    - chunks.lance       │
                    │    - catalog.lance      │
                    │    - versions.lance     │
                    └─────────────────────────┘
```

---

## 🗄️ Database Schema

### PostgreSQL - Customer Management

#### Table: `customers`
```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    api_key VARCHAR(64) UNIQUE NOT NULL,
    openai_api_key TEXT, -- Encrypted
    status VARCHAR(20) DEFAULT 'active', -- active, suspended, deleted
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_api_key ON customers(api_key);
```

#### Table: `customer_config`
```sql
CREATE TABLE customer_config (
    id SERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    rate_limit_requests_per_minute INTEGER DEFAULT 60,
    rate_limit_requests_per_day INTEGER DEFAULT 10000,
    max_documents INTEGER DEFAULT 10000,
    max_file_size_mb INTEGER DEFAULT 50,
    allowed_document_types TEXT[] DEFAULT ARRAY['pdf', 'txt', 'html', 'md'],
    chunking_size INTEGER DEFAULT 1000,
    chunking_overlap INTEGER DEFAULT 200,
    embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(customer_id)
);
```

#### Table: `documents`
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    doc_type VARCHAR(50) NOT NULL, -- pdf, webpage, txt, etc.
    source_url TEXT,
    s3_key VARCHAR(500), -- S3 object key
    content_hash VARCHAR(64), -- SHA-256 hash
    file_size_bytes BIGINT,
    page_count INTEGER,
    chunk_count INTEGER DEFAULT 0,
    character_count INTEGER DEFAULT 0,
    -- Token usage metrics
    embedding_tokens_used INTEGER DEFAULT 0,
    embedding_cost_usd DECIMAL(10, 6) DEFAULT 0,
    processing_time_ms INTEGER,
    -- Status
    status VARCHAR(50) DEFAULT 'processing', -- processing, completed, failed
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_documents_customer ON documents(customer_id);
CREATE INDEX idx_documents_hash ON documents(content_hash);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created ON documents(customer_id, created_at DESC);
```

#### Table: `document_versions`
```sql
CREATE TABLE document_versions (
    id SERIAL PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    s3_key VARCHAR(500),
    changes_summary TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(document_id, version)
);

CREATE INDEX idx_versions_document ON document_versions(document_id);
CREATE INDEX idx_versions_active ON document_versions(document_id, is_active);
```

#### Table: `webhooks`
```sql
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    webhook_url VARCHAR(500) UNIQUE NOT NULL, -- Generated webhook URL
    trigger_type VARCHAR(50) NOT NULL, -- manual, scheduled, event
    config JSONB, -- Additional configuration
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhooks_customer ON webhooks(customer_id);
CREATE INDEX idx_webhooks_url ON webhooks(webhook_url);
```

#### Table: `usage_metrics`
```sql
CREATE TABLE usage_metrics (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL, -- Link to document if applicable
    metric_type VARCHAR(50) NOT NULL, -- api_call, embedding_tokens, storage_bytes, search_query
    metric_value BIGINT NOT NULL,
    cost_usd DECIMAL(10, 6) DEFAULT 0, -- Cost in USD
    metadata JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metrics_customer_time ON usage_metrics(customer_id, timestamp DESC);
CREATE INDEX idx_metrics_type ON usage_metrics(metric_type);
CREATE INDEX idx_metrics_document ON usage_metrics(document_id);
CREATE INDEX idx_metrics_cost ON usage_metrics(customer_id, cost_usd);
```

#### Table: `rate_limit_tracker`
```sql
CREATE TABLE rate_limit_tracker (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP NOT NULL,
    window_end TIMESTAMP NOT NULL,
    UNIQUE(customer_id, endpoint, window_start)
);

CREATE INDEX idx_rate_limit_window ON rate_limit_tracker(customer_id, endpoint, window_end);
```

---

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/signup           # Create new customer
POST   /api/auth/login            # Login (returns JWT)
POST   /api/auth/refresh          # Refresh JWT token
POST   /api/auth/logout           # Invalidate token
GET    /api/auth/me               # Get current user info
```

### Customer Management
```
GET    /api/customers/profile     # Get customer profile
PUT    /api/customers/profile     # Update profile
PUT    /api/customers/config      # Update configuration
GET    /api/customers/usage       # Get usage metrics
POST   /api/customers/api-key     # Regenerate API key
```

### Document Ingestion (n8n Webhooks)
```
POST   /api/ingest/webhook        # Generic webhook endpoint
POST   /api/ingest/document       # Single document (JSON)
POST   /api/ingest/batch          # Batch upload (JSON array)
POST   /api/ingest/url            # Scrape URL and ingest
POST   /api/ingest/file           # Upload file to S3 → process
GET    /api/ingest/presigned-url  # Get S3 presigned URL for direct upload
```

### Document Management
```
GET    /api/documents             # List documents (paginated)
GET    /api/documents/:id         # Get document details
GET    /api/documents/:id/versions # Get version history
DELETE /api/documents/:id         # Delete document
PUT    /api/documents/:id         # Update/reprocess document
GET    /api/documents/:id/status  # Get processing status
```

### Webhook Management
```
GET    /api/webhooks              # List webhooks
POST   /api/webhooks              # Create new webhook
GET    /api/webhooks/:id          # Get webhook details
PUT    /api/webhooks/:id          # Update webhook
DELETE /api/webhooks/:id          # Delete webhook
POST   /api/webhooks/:id/test     # Test webhook
```

### MCP Integration (Existing)
```
POST   /mcp                       # MCP JSON-RPC endpoint (existing)
GET    /mcp                       # Server info
GET    /tools                     # List MCP tools
POST   /search                    # Direct search API
```

### Metrics & Monitoring
```
GET    /api/metrics/overview          # Dashboard metrics
GET    /api/metrics/usage             # Usage over time
GET    /api/metrics/documents         # Document statistics
GET    /api/metrics/tokens            # Token usage per document
GET    /api/metrics/costs             # Cost breakdown
GET    /api/metrics/rate-limits       # Rate limit status
GET    /api/metrics/export            # Export metrics as CSV/JSON
```

### Admin Endpoints (Future)
```
GET    /api/admin/customers           # List all customers
GET    /api/admin/metrics/global      # System-wide metrics
GET    /api/admin/customers/:id/usage # Customer usage details
POST   /api/admin/customers/:id/suspend # Suspend customer
```

---

## 🔒 Authentication & Security

### JWT Token Structure
```typescript
interface JWTPayload {
  sub: string;          // customer_id (UUID)
  email: string;
  api_key: string;      // For internal use
  iat: number;          // Issued at
  exp: number;          // Expiration (24h default)
}
```

### Authentication Flow
1. **Signup**: Email/password → Hash password → Generate API key → Return JWT
2. **Login**: Validate credentials → Generate JWT → Return token
3. **Protected Routes**: Extract JWT → Validate → Attach customer context to request

### Middleware Stack
```typescript
app.use(
  authenticateJWT,          // Validate JWT token
  loadCustomerContext,      // Load customer config from PostgreSQL
  checkRateLimit,           // Per-customer rate limiting
  trackUsage                // Record metrics
);
```

### Rate Limiting Implementation
```typescript
// Per-customer, per-endpoint rate limits
const rateLimiter = new RateLimiter({
  store: redisClient,
  keyGenerator: (req) => `${req.customerId}:${req.path}`,
  max: req.customerConfig.rate_limit_requests_per_minute,
  windowMs: 60 * 1000,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      limit: req.customerConfig.rate_limit_requests_per_minute,
      reset: rateLimiter.resetTime
    });
  }
});
```

---

## 📄 Document Processing Pipeline

### Processing Flow
```
1. Document Upload/Webhook
   ↓
2. Validation (size, type, rate limits)
   ↓
3. Upload to S3 (raw file)
   ↓
4. Create Job in Redis Queue
   ↓
5. Job Processor Picks Up:
   a. Download from S3
   b. Parse document (PDF/Web/Text)
   c. Check version (content hash)
   d. Chunk content
   e. Generate embeddings (OpenAI)
   f. Store in LanceDB
   g. Update PostgreSQL metadata
   h. Update metrics
   ↓
6. Notify completion (webhook/SSE)
```

### Document Processors

#### PDF Processor
```typescript
class PDFProcessor implements DocumentProcessor {
  async process(s3Key: string, customerId: string): Promise<ProcessedDocument> {
    const fileBuffer = await downloadFromS3(s3Key);
    const pdfData = await pdfParse(fileBuffer);

    return {
      content: pdfData.text,
      metadata: {
        pages: pdfData.numpages,
        info: pdfData.info
      }
    };
  }
}
```

#### Web Scraper
```typescript
class WebScraperProcessor implements DocumentProcessor {
  async process(url: string, customerId: string): Promise<ProcessedDocument> {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract main content (remove nav, footer, etc.)
    const content = $('main, article, .content').text();

    return {
      content: content,
      metadata: {
        url: url,
        title: $('title').text(),
        scrapedAt: new Date().toISOString()
      }
    };
  }
}
```

### Chunking Strategy
```typescript
interface ChunkingConfig {
  size: number;           // Default: 1000 characters
  overlap: number;        // Default: 200 characters
  strategy: 'fixed' | 'semantic' | 'paragraph';
}

function chunkDocument(
  content: string,
  config: ChunkingConfig
): Chunk[] {
  // Smart chunking with overlap
  const chunks: Chunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < content.length) {
    const end = Math.min(start + config.size, content.length);
    const chunkText = content.slice(start, end);

    chunks.push({
      id: `chunk_${chunkIndex}`,
      text: chunkText,
      index: chunkIndex,
      start_pos: start,
      end_pos: end
    });

    start += config.size - config.overlap;
    chunkIndex++;
  }

  return chunks;
}
```

### Versioning Logic
```typescript
async function handleDocumentVersion(
  documentId: string,
  contentHash: string,
  customerId: string
): Promise<VersionInfo> {
  // Check if content hash already exists
  const existingVersion = await db.query(
    'SELECT version FROM document_versions WHERE document_id = $1 AND content_hash = $2',
    [documentId, contentHash]
  );

  if (existingVersion.rows.length > 0) {
    return { isDuplicate: true, version: existingVersion.rows[0].version };
  }

  // Get current max version
  const maxVersion = await db.query(
    'SELECT MAX(version) as max_v FROM document_versions WHERE document_id = $1',
    [documentId]
  );

  const newVersion = (maxVersion.rows[0].max_v || 0) + 1;

  // Deactivate old versions
  await db.query(
    'UPDATE document_versions SET is_active = false WHERE document_id = $1',
    [documentId]
  );

  // Insert new version
  await db.query(
    'INSERT INTO document_versions (document_id, version, content_hash, is_active) VALUES ($1, $2, $3, true)',
    [documentId, newVersion, contentHash]
  );

  return { isDuplicate: false, version: newVersion };
}
```

---

## 🔄 Database Connection Management

### Multi-Tenant LanceDB Manager

```typescript
class CustomerDBManager {
  private connections: Map<string, CustomerDBConnection> = new Map();
  private lruCache: LRUCache<string, CustomerDBConnection>;

  constructor() {
    // LRU cache to limit open connections
    this.lruCache = new LRUCache({
      max: 100, // Max 100 concurrent customer connections
      ttl: 1000 * 60 * 30, // 30 min TTL
      dispose: async (key, conn) => {
        await conn.close();
      }
    });
  }

  async getConnection(customerId: string): Promise<CustomerDBConnection> {
    // Check cache first
    if (this.lruCache.has(customerId)) {
      return this.lruCache.get(customerId)!;
    }

    // Load customer config from PostgreSQL
    const customer = await db.query(
      'SELECT c.*, cc.* FROM customers c JOIN customer_config cc ON c.id = cc.customer_id WHERE c.id = $1',
      [customerId]
    );

    if (customer.rows.length === 0) {
      throw new Error('Customer not found');
    }

    const config = customer.rows[0];

    // Create LanceDB connection
    const dbPath = path.join('data', 'customers', customerId);
    await fs.promises.mkdir(dbPath, { recursive: true });

    const lanceClient = await lancedb.connect(dbPath);

    // Initialize tables
    const chunksTable = await lanceClient.openTable('chunks');
    const catalogTable = await lanceClient.openTable('catalog');
    const versionsTable = await lanceClient.openTable('versions');

    // Create embeddings with customer's OpenAI key
    const embeddings = new OpenAIEmbeddings({
      modelName: config.embedding_model,
      openAIApiKey: decrypt(config.openai_api_key) // Decrypt stored key
    });

    const connection = {
      client: lanceClient,
      chunksStore: new LanceDB(embeddings, { table: chunksTable }),
      catalogStore: new LanceDB(embeddings, { table: catalogTable }),
      versionsTable: versionsTable,
      customerId: customerId,
      close: async () => await lanceClient.close()
    };

    // Cache it
    this.lruCache.set(customerId, connection);

    return connection;
  }

  async closeConnection(customerId: string): Promise<void> {
    this.lruCache.delete(customerId);
  }
}

// Singleton instance
export const dbManager = new CustomerDBManager();
```

---

## 🚀 BullMQ Queue System

### Job Types

```typescript
// Job definitions
enum JobType {
  PROCESS_DOCUMENT = 'process_document',
  SCRAPE_URL = 'scrape_url',
  BATCH_IMPORT = 'batch_import',
  REGENERATE_EMBEDDINGS = 'regenerate_embeddings',
  DELETE_DOCUMENT = 'delete_document'
}

interface ProcessDocumentJob {
  type: JobType.PROCESS_DOCUMENT;
  customerId: string;
  documentId: string;
  s3Key: string;
  documentType: 'pdf' | 'txt' | 'html' | 'md';
  metadata: Record<string, any>;
}
```

### Queue Configuration

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required for BullMQ
});

// Document processing queue
export const documentQueue = new Queue('document-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500,
  },
});

// Queue events for monitoring
const queueEvents = new QueueEvents('document-processing', { connection });

queueEvents.on('completed', ({ jobId }) => {
  console.log(`Job ${jobId} completed`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed: ${failedReason}`);
});

// Workers for different priorities
export const highPriorityWorker = new Worker(
  'document-processing',
  async (job) => {
    // Process high-priority jobs
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 50,
      duration: 1000, // 50 jobs per second max
    },
  }
);

export const normalWorker = new Worker(
  'document-processing',
  async (job) => {
    // Process normal jobs
  },
  {
    connection,
    concurrency: 10,
  }
);
```

### Job Processor

```typescript
// Worker implementation
const documentWorker = new Worker('document-processing', async (job) => {
  const { customerId, documentId, s3Key, documentType } = job.data;

  try {
    // Update status
    await updateDocumentStatus(documentId, 'processing');

    // Get processor for document type
    const processor = getDocumentProcessor(documentType);

    // Download from S3
    const fileBuffer = await downloadFromS3(s3Key);

    // Parse document
    const { content, metadata } = await processor.process(fileBuffer);

    // Calculate hash
    const contentHash = sha256(content);

    // Check version
    const versionInfo = await handleDocumentVersion(documentId, contentHash, customerId);

    if (versionInfo.isDuplicate) {
      await updateDocumentStatus(documentId, 'completed', 'Duplicate content');
      return { status: 'duplicate', version: versionInfo.version };
    }

    // Chunk content
    const customerConfig = await getCustomerConfig(customerId);
    const chunks = chunkDocument(content, {
      size: customerConfig.chunking_size,
      overlap: customerConfig.chunking_overlap,
      strategy: 'fixed'
    });

    // Get DB connection
    const dbConn = await dbManager.getConnection(customerId);

    // Generate embeddings and store
    for (const chunk of chunks) {
      await dbConn.chunksStore.addDocuments([{
        pageContent: chunk.text,
        metadata: {
          document_id: documentId,
          chunk_index: chunk.index,
          version: versionInfo.version,
          ...metadata
        }
      }]);
    }

    // Update catalog
    await dbConn.catalogStore.addDocuments([{
      pageContent: content.substring(0, 1000), // Summary
      metadata: {
        document_id: documentId,
        version: versionInfo.version,
        total_chunks: chunks.length,
        ...metadata
      }
    }]);

    // Calculate token usage and cost
    const totalTokens = calculateTokens(content);
    const costPerToken = 0.00002 / 1000; // $0.02 per 1M tokens for text-embedding-3-small
    const totalCost = totalTokens * costPerToken;
    const processingTime = Date.now() - job.timestamp;

    // Update document with token metrics
    await db.query(
      `UPDATE documents
       SET status = 'completed',
           chunk_count = $1,
           character_count = $2,
           embedding_tokens_used = $3,
           embedding_cost_usd = $4,
           processing_time_ms = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [chunks.length, content.length, totalTokens, totalCost, processingTime, documentId]
    );

    // Track metrics in usage_metrics table
    await trackMetric(customerId, documentId, 'embedding_tokens', totalTokens, totalCost, {
      model: customerConfig.embedding_model,
      chunks: chunks.length,
      processing_time_ms: processingTime
    });

    return {
      status: 'success',
      chunks: chunks.length,
      version: versionInfo.version,
      tokens: totalTokens,
      cost: totalCost
    };

  } catch (error) {
    await updateDocumentStatus(documentId, 'failed', error.message);
    throw error;
  }
}, { connection });
```

---

## 📊 Metrics & Monitoring

### Metrics Collection

```typescript
// Track usage with cost
async function trackMetric(
  customerId: string,
  documentId: string | null,
  metricType: string,
  value: number,
  cost: number = 0,
  metadata?: any
) {
  await db.query(
    `INSERT INTO usage_metrics (customer_id, document_id, metric_type, metric_value, cost_usd, metadata, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [customerId, documentId, metricType, value, cost, metadata]
  );
}

// Metric types
enum MetricType {
  API_CALL = 'api_call',
  EMBEDDING_TOKENS = 'embedding_tokens',
  STORAGE_BYTES = 'storage_bytes',
  DOCUMENT_PROCESSED = 'document_processed',
  SEARCH_QUERY = 'search_query'
}

// Token calculation function
function calculateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English text
  // For more accurate count, use tiktoken library
  return Math.ceil(text.length / 4);
}

// OpenAI Pricing (as of 2024)
const PRICING = {
  'text-embedding-3-small': 0.00002 / 1000,  // $0.02 per 1M tokens
  'text-embedding-3-large': 0.00013 / 1000,  // $0.13 per 1M tokens
  'text-embedding-ada-002': 0.0001 / 1000,   // $0.10 per 1M tokens
};

function calculateEmbeddingCost(tokens: number, model: string): number {
  const costPerToken = PRICING[model] || PRICING['text-embedding-3-small'];
  return tokens * costPerToken;
}
```

### Dashboard Metrics API

```typescript
// GET /api/metrics/overview
async function getMetricsOverview(customerId: string) {
  const [usage, documents, costs, rateLimits] = await Promise.all([
    // Total API calls today
    db.query(`
      SELECT COUNT(*) as total_calls
      FROM usage_metrics
      WHERE customer_id = $1
        AND metric_type = 'api_call'
        AND timestamp >= NOW() - INTERVAL '24 hours'
    `, [customerId]),

    // Document stats with token usage
    db.query(`
      SELECT
        COUNT(*) as total_documents,
        SUM(file_size_bytes) as total_size,
        SUM(embedding_tokens_used) as total_tokens,
        SUM(embedding_cost_usd) as total_embedding_cost,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM documents
      WHERE customer_id = $1
    `, [customerId]),

    // Total costs this month
    db.query(`
      SELECT
        SUM(cost_usd) as total_cost,
        SUM(CASE WHEN metric_type = 'embedding_tokens' THEN cost_usd ELSE 0 END) as embedding_cost,
        SUM(CASE WHEN metric_type = 'search_query' THEN cost_usd ELSE 0 END) as search_cost
      FROM usage_metrics
      WHERE customer_id = $1
        AND timestamp >= DATE_TRUNC('month', NOW())
    `, [customerId]),

    // Rate limit status
    db.query(`
      SELECT
        endpoint,
        request_count,
        window_end
      FROM rate_limit_tracker
      WHERE customer_id = $1
        AND window_end > NOW()
    `, [customerId])
  ]);

  return {
    apiCalls: usage.rows[0].total_calls,
    documents: documents.rows[0],
    costs: costs.rows[0],
    rateLimits: rateLimits.rows
  };
}

// GET /api/metrics/tokens - Token usage per document
async function getTokenMetrics(customerId: string, options?: {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  const { startDate, endDate, limit = 100 } = options || {};

  const result = await db.query(`
    SELECT
      d.id,
      d.title,
      d.doc_type,
      d.chunk_count,
      d.character_count,
      d.embedding_tokens_used,
      d.embedding_cost_usd,
      d.processing_time_ms,
      d.created_at
    FROM documents d
    WHERE d.customer_id = $1
      AND d.status = 'completed'
      ${startDate ? 'AND d.created_at >= $2' : ''}
      ${endDate ? 'AND d.created_at <= $3' : ''}
    ORDER BY d.embedding_tokens_used DESC
    LIMIT $4
  `, [customerId, startDate, endDate, limit].filter(Boolean));

  return result.rows;
}

// GET /api/metrics/costs - Cost breakdown over time
async function getCostMetrics(customerId: string, period: 'day' | 'week' | 'month' = 'day') {
  const interval = period === 'day' ? '1 day' : period === 'week' ? '7 days' : '30 days';

  const result = await db.query(`
    SELECT
      DATE_TRUNC($1, timestamp) as period,
      metric_type,
      SUM(metric_value) as total_usage,
      SUM(cost_usd) as total_cost,
      COUNT(*) as count
    FROM usage_metrics
    WHERE customer_id = $2
      AND timestamp >= NOW() - INTERVAL $3
    GROUP BY DATE_TRUNC($1, timestamp), metric_type
    ORDER BY period DESC, metric_type
  `, [period, customerId, interval]);

  return result.rows;
}

// GET /api/admin/metrics/global - Admin view of all customer usage
async function getGlobalMetrics() {
  const [customerStats, topUsers, systemStats] = await Promise.all([
    // Per-customer stats
    db.query(`
      SELECT
        c.id,
        c.email,
        c.company_name,
        COUNT(d.id) as total_documents,
        SUM(d.embedding_tokens_used) as total_tokens,
        SUM(d.embedding_cost_usd) as total_cost,
        c.created_at
      FROM customers c
      LEFT JOIN documents d ON c.id = d.customer_id
      GROUP BY c.id, c.email, c.company_name, c.created_at
      ORDER BY total_cost DESC
    `),

    // Top token users
    db.query(`
      SELECT
        c.email,
        d.title,
        d.embedding_tokens_used,
        d.embedding_cost_usd,
        d.created_at
      FROM documents d
      JOIN customers c ON d.customer_id = c.id
      WHERE d.status = 'completed'
      ORDER BY d.embedding_tokens_used DESC
      LIMIT 10
    `),

    // System-wide stats
    db.query(`
      SELECT
        COUNT(DISTINCT customer_id) as total_customers,
        COUNT(*) as total_documents,
        SUM(embedding_tokens_used) as total_tokens,
        SUM(embedding_cost_usd) as total_cost,
        AVG(embedding_tokens_used) as avg_tokens_per_doc,
        AVG(processing_time_ms) as avg_processing_time
      FROM documents
      WHERE status = 'completed'
    `)
  ]);

  return {
    customers: customerStats.rows,
    topUsers: topUsers.rows,
    systemStats: systemStats.rows[0]
  };
}
```

---

## 🎨 Frontend Architecture (Next.js)

### Project Structure
```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── (dashboard)/
│   │   ├── layout.tsx         # Protected layout with sidebar
│   │   ├── page.tsx           # Dashboard overview
│   │   ├── documents/
│   │   │   ├── page.tsx       # Document list
│   │   │   └── [id]/
│   │   │       └── page.tsx   # Document details
│   │   ├── webhooks/
│   │   │   └── page.tsx       # Webhook configuration
│   │   ├── settings/
│   │   │   └── page.tsx       # Settings page
│   │   ├── metrics/
│   │   │   ├── page.tsx       # Metrics dashboard
│   │   │   ├── tokens/
│   │   │   │   └── page.tsx   # Token usage details
│   │   │   └── costs/
│   │   │       └── page.tsx   # Cost breakdown
│   │   └── admin/             # Admin-only pages
│   │       ├── page.tsx       # Admin dashboard
│   │       └── customers/
│   │           └── [id]/
│   │               └── page.tsx # Customer details
│   └── api/                   # API routes (proxy to backend)
├── components/
│   ├── ui/                    # shadcn/ui components
│   ├── dashboard/
│   │   ├── Sidebar.tsx
│   │   ├── MetricsCard.tsx
│   │   └── DocumentTable.tsx
│   └── webhooks/
│       ├── WebhookForm.tsx
│       └── WebhookTest.tsx
├── lib/
│   ├── api.ts                 # API client
│   ├── auth.ts                # Auth utilities
│   └── types.ts               # TypeScript types
└── hooks/
    ├── useAuth.tsx
    ├── useDocuments.tsx
    └── useMetrics.tsx
```

### Key Components

#### Dashboard Overview
```typescript
// app/(dashboard)/page.tsx
export default function DashboardPage() {
  const { data: metrics } = useMetrics();
  const { data: documents } = useDocuments({ limit: 5 });

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricsCard
          title="Total Documents"
          value={metrics?.documents.total_documents}
          icon={FileText}
        />
        <MetricsCard
          title="Total Tokens Used"
          value={formatNumber(metrics?.documents.total_tokens)}
          subtitle={`$${metrics?.costs.total_cost?.toFixed(4)}`}
          icon={Zap}
        />
        <MetricsCard
          title="API Calls Today"
          value={metrics?.apiCalls}
          icon={Activity}
        />
        <MetricsCard
          title="Storage Used"
          value={formatBytes(metrics?.documents.total_size)}
          icon={Database}
        />
      </div>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Costs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Embedding Costs:</span>
              <span className="font-mono">${metrics?.costs.embedding_cost?.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span>Search Costs:</span>
              <span className="font-mono">${metrics?.costs.search_cost?.toFixed(4)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total:</span>
              <span className="font-mono">${metrics?.costs.total_cost?.toFixed(4)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentDocuments documents={documents} />
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Token Usage Page
```typescript
// app/(dashboard)/metrics/tokens/page.tsx
export default function TokenMetricsPage() {
  const { data: tokenMetrics } = useTokenMetrics();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Token Usage by Document</h1>

      <DataTable
        columns={[
          { header: 'Document', accessorKey: 'title' },
          { header: 'Type', accessorKey: 'doc_type' },
          { header: 'Chunks', accessorKey: 'chunk_count' },
          {
            header: 'Tokens Used',
            accessorKey: 'embedding_tokens_used',
            cell: ({ value }) => formatNumber(value)
          },
          {
            header: 'Cost',
            accessorKey: 'embedding_cost_usd',
            cell: ({ value }) => `$${value?.toFixed(6)}`
          },
          {
            header: 'Processing Time',
            accessorKey: 'processing_time_ms',
            cell: ({ value }) => `${(value / 1000).toFixed(2)}s`
          },
          {
            header: 'Created',
            accessorKey: 'created_at',
            cell: ({ value }) => formatDate(value)
          }
        ]}
        data={tokenMetrics}
      />
    </div>
  );
}
```

#### Admin Dashboard
```typescript
// app/(dashboard)/admin/page.tsx
'use client';

import { useAdminMetrics } from '@/hooks/useAdminMetrics';

export default function AdminDashboard() {
  const { data: metrics, isLoading } = useAdminMetrics();

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      {/* System Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricsCard
          title="Total Customers"
          value={metrics?.systemStats.total_customers}
          icon={Users}
        />
        <MetricsCard
          title="System-wide Tokens"
          value={formatNumber(metrics?.systemStats.total_tokens)}
          subtitle={`$${metrics?.systemStats.total_cost?.toFixed(2)}`}
          icon={Zap}
        />
        <MetricsCard
          title="Avg Processing Time"
          value={`${(metrics?.systemStats.avg_processing_time / 1000).toFixed(2)}s`}
          icon={Clock}
        />
      </div>

      {/* Customer Usage Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { header: 'Customer', accessorKey: 'email' },
              { header: 'Company', accessorKey: 'company_name' },
              { header: 'Documents', accessorKey: 'total_documents' },
              {
                header: 'Total Tokens',
                accessorKey: 'total_tokens',
                cell: ({ value }) => formatNumber(value)
              },
              {
                header: 'Total Cost',
                accessorKey: 'total_cost',
                cell: ({ value }) => `$${value?.toFixed(2)}`
              },
              {
                header: 'Member Since',
                accessorKey: 'created_at',
                cell: ({ value }) => formatDate(value)
              },
              {
                header: 'Actions',
                cell: ({ row }) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/admin/customers/${row.id}`)}
                  >
                    View Details
                  </Button>
                )
              }
            ]}
            data={metrics?.customers}
          />
        </CardContent>
      </Card>

      {/* Top Token Users */}
      <Card>
        <CardHeader>
          <CardTitle>Top Token Consumers</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { header: 'Customer', accessorKey: 'email' },
              { header: 'Document', accessorKey: 'title' },
              {
                header: 'Tokens',
                accessorKey: 'embedding_tokens_used',
                cell: ({ value }) => formatNumber(value)
              },
              {
                header: 'Cost',
                accessorKey: 'embedding_cost_usd',
                cell: ({ value }) => `$${value?.toFixed(6)}`
              }
            ]}
            data={metrics?.topUsers}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Webhook Configuration
```typescript
// app/(dashboard)/webhooks/page.tsx
export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([]);

  const createWebhook = async (data: WebhookFormData) => {
    const response = await api.post('/webhooks', data);
    setWebhooks([...webhooks, response.data]);
  };

  return (
    <div>
      <WebhookForm onSubmit={createWebhook} />
      <WebhookList
        webhooks={webhooks}
        onTest={(id) => api.post(`/webhooks/${id}/test`)}
        onDelete={(id) => api.delete(`/webhooks/${id}`)}
      />
    </div>
  );
}
```

---

## 🔌 n8n Workflow Templates

### Template 1: Scheduled Web Scraping
```json
{
  "name": "Daily Documentation Scraper",
  "nodes": [
    {
      "type": "n8n-nodes-base.schedule",
      "name": "Daily Trigger",
      "parameters": {
        "rule": {
          "interval": [{ "field": "hours", "hoursInterval": 24 }]
        }
      }
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "name": "Scrape Website",
      "parameters": {
        "url": "https://docs.example.com",
        "method": "GET"
      }
    },
    {
      "type": "n8n-nodes-base.webhook",
      "name": "Send to RAG",
      "parameters": {
        "httpMethod": "POST",
        "path": "{{$env.RAG_WEBHOOK_URL}}",
        "responseMode": "onReceived",
        "options": {
          "rawBody": false
        }
      },
      "credentials": {
        "headerAuth": {
          "name": "API Key",
          "value": "{{$env.RAG_API_KEY}}"
        }
      }
    }
  ]
}
```

### Template 2: File Upload Monitor
```json
{
  "name": "Google Drive to RAG",
  "nodes": [
    {
      "type": "n8n-nodes-base.googleDriveTrigger",
      "name": "Watch Folder",
      "parameters": {
        "folderId": "{{$env.GDRIVE_FOLDER_ID}}",
        "event": "fileCreated"
      }
    },
    {
      "type": "n8n-nodes-base.googleDrive",
      "name": "Download File",
      "parameters": {
        "operation": "download",
        "fileId": "={{$json.id}}"
      }
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "name": "Upload to RAG",
      "parameters": {
        "url": "{{$env.RAG_API_URL}}/api/ingest/file",
        "method": "POST",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "file",
              "value": "={{$binary.data}}"
            }
          ]
        }
      }
    }
  ]
}
```

---

## 🌐 Distributed Deployment

### Docker Compose Setup
```yaml
version: '3.8'

services:
  # PostgreSQL
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: dynamic_rag
      POSTGRES_USER: rag_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # API Server (multiple instances)
  api-server:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://rag_user:${DB_PASSWORD}@postgres:5432/dynamic_rag
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      S3_BUCKET: ${S3_BUCKET}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
    volumes:
      - ./data/customers:/app/data/customers
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 3

  # Queue Worker
  queue-worker:
    build: ./backend
    command: npm run worker
    environment:
      DATABASE_URL: postgresql://rag_user:${DB_PASSWORD}@postgres:5432/dynamic_rag
      REDIS_URL: redis://redis:6379
      S3_BUCKET: ${S3_BUCKET}
    volumes:
      - ./data/customers:/app/data/customers
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 5

  # Frontend
  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://api-server:3001
    ports:
      - "3000:3000"
    depends_on:
      - api-server

  # Nginx Load Balancer
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - api-server

volumes:
  postgres_data:
  redis_data:
```

### Nginx Configuration
```nginx
upstream api_backend {
    least_conn;
    server api-server-1:3001;
    server api-server-2:3001;
    server api-server-3:3001;
}

server {
    listen 80;
    server_name api.dynamicrag.com;

    location / {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 📦 Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Setup PostgreSQL schema
- [ ] Implement JWT authentication
- [ ] Refactor DB connection manager for multi-tenant
- [ ] Setup Redis + Bull queue
- [ ] Create customer signup/login API

### Phase 2: Document Pipeline (Week 3-4)
- [ ] S3 integration for file uploads
- [ ] PDF processor implementation
- [ ] Web scraper implementation
- [ ] Chunking and embedding pipeline
- [ ] Versioning system
- [ ] Queue job processors

### Phase 3: API Endpoints (Week 5)
- [ ] Document ingestion endpoints
- [ ] Webhook management API
- [ ] Rate limiting middleware
- [ ] Metrics tracking

### Phase 4: Frontend (Week 6-7)
- [ ] Next.js setup with Tailwind + shadcn/ui
- [ ] Authentication pages
- [ ] Dashboard with metrics
- [ ] Document management UI
- [ ] Webhook configuration UI
- [ ] Settings page

### Phase 5: n8n Integration (Week 8)
- [ ] Create workflow templates
- [ ] Documentation for n8n setup
- [ ] Test end-to-end workflows

### Phase 6: Production (Week 9-10)
- [ ] Docker setup
- [ ] Load testing
- [ ] Monitoring setup (Prometheus/Grafana)
- [ ] Security audit
- [ ] Documentation

---

## 🚨 Critical Considerations

### Scalability
- **LanceDB**: Test with 500M vectors (max expected load)
- **PostgreSQL**: Connection pooling (pg-pool)
- **Redis**: Cluster mode for high availability
- **S3**: Lifecycle policies for old documents

### Security
- **Encryption**: Encrypt OpenAI keys at rest (AES-256)
- **API Keys**: Generate with crypto.randomBytes (32 bytes)
- **Rate Limiting**: Prevent abuse with per-customer limits
- **CORS**: Restrict to frontend domains only

### Cost Optimization
- **OpenAI**: Monitor per-customer token usage
- **S3**: Use Intelligent-Tiering
- **LanceDB**: Compress old vectors
- **Redis**: Set TTL on temporary data

### Monitoring
- **Metrics to Track**:
  - API response times
  - Queue job processing time
  - Embedding generation cost per customer
  - Storage growth rate
  - Error rates by endpoint

---

## ✅ Design Validation Checklist

- [x] Multi-tenant with filesystem isolation
- [x] PostgreSQL for customer management
- [x] React/Next.js frontend
- [x] Redis queue system
- [x] JWT authentication
- [x] S3 file uploads
- [x] Per-customer rate limiting
- [x] Per-customer OpenAI keys
- [x] Document versioning
- [x] Real-time processing
- [x] PDF + Web page support
- [x] Extensible document processors
- [x] n8n webhook integration
- [x] Distributed deployment ready
- [x] Metrics and monitoring

---

## 🎯 Next Steps

1. **Review & Approve Architecture**: Confirm this design meets all requirements
2. **Setup Development Environment**: PostgreSQL, Redis, S3 (LocalStack for dev)
3. **Start Phase 1 Implementation**: Begin with core infrastructure

**Ready to proceed with implementation? Any changes needed to the architecture?**
