# Phase 2: Document Upload - Implementation Complete ✅

**Status**: Implementation Complete
**Date**: 2025-01-19
**Version**: 2.0.0

## Overview

Phase 2 implements a complete document upload and processing pipeline with:
- File upload API with Multer
- MinIO/S3 storage with tenant isolation
- Background processing with BullMQ workers
- PDF/HTML/TXT/MD parsing
- Text chunking and embedding generation
- Multi-tenant LanceDB vector storage
- Comprehensive API endpoints for document management

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Express API Server                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Document Routes (/api/documents/*)                   │   │
│  │  - Upload, List, Get, Delete, Download, Stats        │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┼──────────┬─────────────┐
          │          │          │             │
          ▼          ▼          ▼             ▼
    ┌─────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐
    │PostgreSQL│ │  Redis  │ │ MinIO  │ │ LanceDB  │
    │Documents │ │  Queue  │ │  S3    │ │  Vector  │
    └─────────┘ └────┬────┘ └────────┘ └──────────┘
                     │
                     ▼
              ┌────────────┐
              │   Worker   │
              │ Container  │
              │ (BullMQ)   │
              └────────────┘
```

## Components Implemented

### 1. S3/MinIO Service (`src/services/s3.service.ts`)

**Features:**
- Tenant-isolated file storage (`{customerId}/documents/{documentId}/`)
- Presigned URLs for secure downloads
- Content hash-based deduplication
- File metadata management
- Batch operations

**Key Methods:**
```typescript
uploadFile(key, buffer, contentType, metadata)
downloadFile(key)
deleteFile(key)
getPresignedUrl(key, expiresIn)
listCustomerFiles(customerId)
deleteCustomerFiles(customerId)
```

**S3 Key Format:**
```
{customerId}/documents/{documentId}/{filename}
{customerId}/documents/{documentId}/versions/{hash}/{filename}
```

### 2. Document Model (`src/models/document.ts`)

**Database Operations:**
- CRUD operations with tenant isolation
- Content hash-based deduplication
- Pagination support
- Statistics aggregation
- Status management (processing, completed, failed)

**Interface:**
```typescript
interface Document {
  id: string;
  customer_id: string;
  title: string;
  doc_type: 'pdf' | 'txt' | 'html' | 'md';
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
  status: 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}
```

### 3. Customer Config Model (`src/models/customer-config.ts`)

**Per-Customer Settings:**
- Rate limits (requests/minute, requests/day)
- Document limits (max documents, max file size)
- Allowed document types
- Chunking parameters (size, overlap)
- Embedding model selection
- Budget management (monthly budget, alert threshold)

**Default Configuration:**
```typescript
{
  rate_limit_requests_per_minute: 60,
  rate_limit_requests_per_day: 10000,
  max_documents: 10000,
  max_file_size_mb: 50,
  allowed_document_types: ['pdf', 'txt', 'html', 'md'],
  chunking_size: 1000,
  chunking_overlap: 200,
  embedding_model: 'text-embedding-3-small',
  monthly_budget_usd: 100.00,
  budget_alert_threshold: 0.80
}
```

### 4. Document Parsers (`src/utils/parsers.ts`)

**Supported Formats:**
- **PDF**: Text extraction with page count, title, author metadata
- **HTML**: Content extraction (main, article, body), title extraction
- **TXT**: Plain text processing
- **MD**: Markdown with title extraction from `# heading`

**Parser Output:**
```typescript
interface ParsedDocument {
  content: string;
  metadata: {
    pageCount?: number;
    characterCount: number;
    wordCount: number;
    title?: string;
    author?: string;
  };
}
```

### 5. Chunking & Embedding Service (`src/services/embedding.service.ts`)

**Text Chunking:**
- Paragraph-based splitting with overlap
- Sentence boundary detection
- Configurable chunk size and overlap
- Character position tracking

**Embedding Generation:**
- OpenAI embeddings (text-embedding-3-small, 3-large, ada-002)
- Batch processing
- Token usage tracking
- Cost calculation
- Per-customer API key support

**Chunking Strategy:**
1. Split by paragraphs
2. Respect chunk size limit
3. Add overlap for context
4. Find sentence boundaries
5. Track character positions

**Embedding Models:**
```typescript
{
  'text-embedding-3-small': { dimension: 1536, cost: $0.02/1M tokens },
  'text-embedding-3-large': { dimension: 3072, cost: $0.13/1M tokens },
  'text-embedding-ada-002':  { dimension: 1536, cost: $0.10/1M tokens }
}
```

### 6. LanceDB Multi-Tenant Manager (`src/services/lancedb.service.ts`)

**Features:**
- Per-customer isolated vector databases
- Connection pooling and caching
- Vector search with filters
- Chunk management (add, delete, count)
- Database optimization and health checks

**Vector Record Schema:**
```typescript
interface VectorRecord {
  id: string;              // {documentId}_{chunkIndex}
  document_id: string;
  customer_id: string;
  content: string;
  vector: number[];        // 1536 dimensions (default)
  chunk_index: number;
  start_char: number;
  end_char: number;
  title?: string;
  created_at: string;
}
```

**Search Options:**
```typescript
search(customerId, queryVector, {
  limit: 10,
  documentId?: string,    // Filter by document
  minScore?: number       // Minimum similarity score
})
```

### 7. Document Processing Worker (`src/workers/document-worker.ts`)

**Background Job Processing:**
- BullMQ worker with concurrency: 5 jobs
- Rate limiting: 10 jobs/second
- Job types: `process_document`, `scrape_url`
- Progress tracking (downloading, parsing, embedding, storing, finalizing)
- Error handling and retry logic

**Processing Pipeline:**
1. **Download** - Fetch file from S3/MinIO
2. **Parse** - Extract text content (PDF/HTML/TXT/MD)
3. **Chunk** - Split text into chunks with overlap
4. **Embed** - Generate embeddings using OpenAI
5. **Store** - Save vectors to LanceDB
6. **Finalize** - Update document status and metrics

**Progress Stages:**
```typescript
{
  stage: 'downloading' | 'parsing' | 'embedding' | 'storing' | 'finalizing' | 'completed',
  progress: 0-100
}
```

### 8. Document API Routes (`src/routes/documents.ts`)

**Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents/upload` | Upload file (PDF, TXT, HTML, MD) |
| POST | `/api/documents/url` | Process URL (web scraping) |
| GET | `/api/documents` | List documents with pagination |
| GET | `/api/documents/stats` | Get document statistics |
| GET | `/api/documents/:id` | Get document details |
| GET | `/api/documents/:id/status` | Get processing status |
| GET | `/api/documents/:id/download` | Get presigned download URL |
| DELETE | `/api/documents/:id` | Delete document |

## API Documentation

### Upload Document

```bash
POST /api/documents/upload
Content-Type: multipart/form-data
Authorization: Bearer {accessToken}

# Form Fields:
# - file: File (required)
# - title: String (optional, defaults to filename)

# Response (202 Accepted):
{
  "message": "Document uploaded and queued for processing",
  "document": {
    "id": "uuid",
    "title": "example.pdf",
    "type": "pdf",
    "size": 1048576,
    "status": "processing",
    "created_at": "2025-01-19T10:00:00Z"
  },
  "job_id": "uuid"
}
```

### Process URL

```bash
POST /api/documents/url
Content-Type: application/json
Authorization: Bearer {accessToken}

{
  "url": "https://example.com/article",
  "title": "Optional Title"
}

# Response (202 Accepted):
{
  "message": "URL queued for processing",
  "document": {
    "id": "uuid",
    "title": "example.com",
    "type": "html",
    "source_url": "https://example.com/article",
    "status": "processing",
    "created_at": "2025-01-19T10:00:00Z"
  },
  "job_id": "uuid"
}
```

### List Documents

```bash
GET /api/documents?page=1&limit=50&status=completed&type=pdf
Authorization: Bearer {accessToken}

# Response:
{
  "documents": [
    {
      "id": "uuid",
      "title": "example.pdf",
      "doc_type": "pdf",
      "file_size_bytes": 1048576,
      "chunk_count": 42,
      "status": "completed",
      "created_at": "2025-01-19T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "total_pages": 2
  }
}
```

### Get Document Status

```bash
GET /api/documents/{id}/status
Authorization: Bearer {accessToken}

# Response:
{
  "document_id": "uuid",
  "status": "completed",
  "error_message": null,
  "job_status": {
    "status": "completed",
    "result": {
      "documentId": "uuid",
      "chunks": 42,
      "tokensUsed": 5000,
      "cost": 0.0001
    }
  },
  "stats": {
    "chunks": 42,
    "characters": 10000,
    "pages": 5,
    "tokens_used": 5000,
    "cost": 0.0001,
    "processing_time_ms": 3500
  }
}
```

### Get Document Statistics

```bash
GET /api/documents/stats
Authorization: Bearer {accessToken}

# Response:
{
  "total": 100,
  "by_status": {
    "processing": 5,
    "completed": 90,
    "failed": 5
  },
  "by_type": {
    "pdf": 60,
    "txt": 20,
    "html": 15,
    "md": 5
  },
  "total_size_bytes": 104857600,
  "total_chunks": 4200,
  "total_embedding_cost": 0.05
}
```

### Get Download URL

```bash
GET /api/documents/{id}/download
Authorization: Bearer {accessToken}

# Response:
{
  "document_id": "uuid",
  "download_url": "https://minio:9000/bucket/path?signature=...",
  "expires_in": 3600
}
```

### Delete Document

```bash
DELETE /api/documents/{id}
Authorization: Bearer {accessToken}

# Response:
{
  "message": "Document deleted successfully",
  "document_id": "uuid"
}
```

## Testing Guide

### 1. Setup Environment

```bash
# Generate encryption key
openssl rand -hex 32

# Create .env file
cp .env.example .env

# Update .env with:
# - ENCRYPTION_KEY (from above)
# - OPENAI_API_KEY (your OpenAI key)
# - DB_PASSWORD (secure password)
```

### 2. Start Services

```bash
# Build and start all containers
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f minio
```

### 3. Initialize MinIO

**Access MinIO Console:**
- URL: http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin123`

**Create Bucket:**
1. Login to MinIO console
2. Click "Buckets" → "Create Bucket"
3. Name: `dynamic-rag-documents`
4. Click "Create Bucket"

**Set Bucket Policy (Optional):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"AWS": ["*"]},
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::dynamic-rag-documents/*"]
    }
  ]
}
```

### 4. Create Test User

```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "Test123#",
    "company_name": "Test Company",
    "openai_api_key": "sk-your-openai-key"
  }'

# Save the accessToken from response
export TOKEN="your_access_token_here"
```

### 5. Test Document Upload

**Upload PDF:**
```bash
curl -X POST http://localhost:3001/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "title=Test PDF Document"

# Save document ID
export DOC_ID="returned_document_id"
```

**Upload Text File:**
```bash
curl -X POST http://localhost:3001/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.txt" \
  -F "title=Test Text Document"
```

**Process URL:**
```bash
curl -X POST http://localhost:3001/api/documents/url \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "title": "AI Wikipedia Article"
  }'
```

### 6. Monitor Processing

**Check Processing Status:**
```bash
# Poll every 2 seconds
watch -n 2 "curl -s http://localhost:3001/api/documents/$DOC_ID/status \
  -H 'Authorization: Bearer $TOKEN' | jq"
```

**Watch Worker Logs:**
```bash
docker-compose logs -f worker
```

**Expected Progress:**
1. `downloading` (0-20%)
2. `parsing` (20-40%)
3. `embedding` (40-70%)
4. `storing` (70-90%)
5. `finalizing` (90-100%)
6. `completed`

### 7. Verify Results

**List Documents:**
```bash
curl -s http://localhost:3001/api/documents?page=1&limit=10 \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Get Statistics:**
```bash
curl -s http://localhost:3001/api/documents/stats \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Get Document Details:**
```bash
curl -s http://localhost:3001/api/documents/$DOC_ID \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Download Document:**
```bash
# Get presigned URL
DOWNLOAD_URL=$(curl -s http://localhost:3001/api/documents/$DOC_ID/download \
  -H "Authorization: Bearer $TOKEN" | jq -r '.download_url')

# Download file
curl -o downloaded.pdf "$DOWNLOAD_URL"
```

### 8. Test Database Queries

**Check PostgreSQL:**
```bash
docker-compose exec postgres psql -U rag_user -d dynamic_rag

-- View documents
SELECT id, title, doc_type, status, chunk_count, embedding_cost_usd
FROM documents
ORDER BY created_at DESC
LIMIT 10;

-- View customer stats
SELECT
  c.email,
  COUNT(d.id) as total_docs,
  SUM(d.chunk_count) as total_chunks,
  SUM(d.embedding_cost_usd) as total_cost
FROM customers c
LEFT JOIN documents d ON c.id = d.customer_id
GROUP BY c.id, c.email;
```

**Check Redis Queue:**
```bash
docker-compose exec redis redis-cli

# View queue keys
KEYS bull:document-processing:*

# Get queue info
HGETALL bull:document-processing:meta

# View job data
GET bull:document-processing:{job_id}
```

**Check LanceDB:**
```bash
# Access container
docker-compose exec api sh

# Node REPL
node

# Load LanceDB service
const { lancedbService } = await import('./dist/services/lancedb.service.js');

// Get customer stats
await lancedbService.getCustomerStats('customer-uuid');

// Search
const query = new Array(1536).fill(0); // Dummy vector
await lancedbService.search('customer-uuid', query, { limit: 5 });
```

### 9. Error Testing

**Test File Size Limit:**
```bash
# Upload file larger than 50MB (default limit)
curl -X POST http://localhost:3001/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@large_file.pdf"

# Expected: 400 Bad Request - File too large
```

**Test Invalid File Type:**
```bash
curl -X POST http://localhost:3001/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.exe"

# Expected: 400 Bad Request - Unsupported file type
```

**Test Duplicate Upload:**
```bash
# Upload same file twice
curl -X POST http://localhost:3001/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf"

# Expected: 409 Conflict - Duplicate document
```

**Test Invalid URL:**
```bash
curl -X POST http://localhost:3001/api/documents/url \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url": "not-a-valid-url"}'

# Expected: 400 Bad Request - Invalid URL
```

### 10. Performance Testing

**Concurrent Uploads:**
```bash
# Upload 10 files concurrently
for i in {1..10}; do
  (curl -X POST http://localhost:3001/api/documents/upload \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@test$i.pdf" &)
done

# Monitor worker processing
docker-compose logs -f worker
```

**Large File Upload:**
```bash
# Test with 40MB PDF (near limit)
curl -X POST http://localhost:3001/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@large_document.pdf"

# Monitor processing time
```

## Troubleshooting

### Common Issues

**Issue**: MinIO bucket not found
**Solution**:
```bash
# Access MinIO console (http://localhost:9001)
# Create bucket: dynamic-rag-documents
# Or use MinIO CLI:
docker-compose exec minio mc mb myminio/dynamic-rag-documents
```

**Issue**: Worker not processing jobs
**Solution**:
```bash
# Check worker logs
docker-compose logs worker

# Restart worker
docker-compose restart worker

# Check Redis connection
docker-compose exec redis redis-cli ping
```

**Issue**: Embedding generation fails
**Solution**:
```bash
# Check OpenAI API key
docker-compose exec api printenv OPENAI_API_KEY

# Verify customer has API key
docker-compose exec postgres psql -U rag_user -d dynamic_rag \
  -c "SELECT email, openai_api_key IS NOT NULL FROM customers;"
```

**Issue**: Out of memory
**Solution**:
```bash
# Increase Docker memory limit (Docker Desktop)
# Settings → Resources → Memory → 4GB+

# Or limit worker concurrency in docker-compose.yml:
# WORKER_CONCURRENCY=2
```

**Issue**: File parsing errors
**Solution**:
```bash
# Check file format
file test.pdf

# Verify PDF is not encrypted/password protected
# Test with simple text file first
echo "Test content" > test.txt
```

## Performance Metrics

**Expected Processing Times:**
- **Small PDF (1-5 pages)**: 2-5 seconds
- **Medium PDF (10-20 pages)**: 5-15 seconds
- **Large PDF (50+ pages)**: 20-60 seconds
- **Web Page**: 3-10 seconds
- **Text File**: 1-3 seconds

**Resource Usage:**
- **API Container**: 512MB-1GB RAM
- **Worker Container**: 1GB-2GB RAM
- **PostgreSQL**: 256MB-512MB RAM
- **Redis**: 128MB-256MB RAM
- **MinIO**: 256MB-512MB RAM
- **LanceDB**: 100MB-1GB (per customer)

**Throughput:**
- **Concurrent Uploads**: 10-20 req/s
- **Worker Processing**: 5 jobs concurrently
- **Embedding Generation**: ~1000 chunks/minute

## Security Considerations

1. **File Upload Security:**
   - File type validation
   - Size limits per customer
   - Virus scanning (future enhancement)
   - Sandboxed parsing

2. **S3/MinIO Security:**
   - Customer-specific prefixes
   - Access key rotation (manual)
   - Presigned URLs with expiration
   - HTTPS in production

3. **API Key Security:**
   - Customer OpenAI keys encrypted at rest
   - Decrypted only in worker memory
   - Fallback to system key if needed

4. **Database Security:**
   - Tenant isolation (customer_id filtering)
   - Encrypted JWT secrets
   - Row-level security policies (future)

## Cost Estimation

**Embedding Costs (per 1M tokens):**
- text-embedding-3-small: $0.02
- text-embedding-3-large: $0.13
- text-embedding-ada-002: $0.10

**Example Document Costs:**
- 10-page PDF (~5,000 words): $0.0002 - $0.0013
- 100-page PDF (~50,000 words): $0.002 - $0.013
- Web article (~2,000 words): $0.00008 - $0.0005

**Storage Costs:**
- S3/MinIO: ~$0.023/GB/month (AWS S3 Standard)
- LanceDB: Local disk (~1MB per 1000 chunks)

## Next Steps

### Phase 3: RAG & Search (Planned)
- Vector search API endpoints
- RAG query pipeline with context retrieval
- Reranking and scoring
- Usage metrics and analytics
- Budget monitoring and alerts

### Enhancements (Future)
- **Additional File Formats**: DOCX, XLSX, PPTX
- **OCR Support**: Scanned PDFs and images
- **Web Scraping**: Advanced crawler with sitemap support
- **Batch Import**: Bulk upload from S3/Drive
- **Version Control**: Document versioning and diff
- **Duplicate Detection**: Fuzzy matching
- **Webhook Notifications**: Processing complete events
- **Search API**: Full-text and vector search

## Summary

✅ **Phase 2 Complete** - All components implemented and tested:
- ✅ File upload API (Multer)
- ✅ S3/MinIO storage service
- ✅ Document models and database
- ✅ File parsers (PDF, HTML, TXT, MD)
- ✅ Chunking and embedding service
- ✅ LanceDB multi-tenant manager
- ✅ BullMQ worker pipeline
- ✅ Comprehensive API endpoints
- ✅ Docker containerization
- ✅ Testing documentation

**Ready for Phase 3: RAG & Search Implementation**
