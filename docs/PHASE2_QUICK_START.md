# Phase 2: Document Upload - Quick Start Guide

**Version**: 2.0.0
**Last Updated**: 2025-01-19

## Quick Setup (5 Minutes)

### 1. Prerequisites

```bash
# Required
- Docker Desktop installed and running
- Node.js 20+ (for local development)
- OpenAI API key

# Optional
- curl or Postman for API testing
```

### 2. Environment Setup

```bash
# Generate encryption key
openssl rand -hex 32

# Copy environment file
cp .env.example .env

# Edit .env and set these required variables:
ENCRYPTION_KEY=<your-generated-key>
OPENAI_API_KEY=sk-<your-openai-key>
DB_PASSWORD=SecurePassword123!
```

### 3. Start Services

```bash
# Build and start all containers
docker-compose up -d

# Wait for services to be healthy (30-60 seconds)
docker-compose ps

# Check logs
docker-compose logs -f api
```

### 4. Setup MinIO Bucket

**Access MinIO Console:**
- URL: http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin123`

**Create Bucket:**
1. Click "Buckets" → "Create Bucket"
2. Name: `dynamic-rag-documents`
3. Click "Create Bucket"

### 5. Create Test Account

```bash
# Create user
curl -X POST http://localhost:3001/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "Test123#",
    "company_name": "Test Company",
    "openai_api_key": "sk-your-openai-key"
  }'

# Copy the accessToken from response
export TOKEN="<your-access-token>"
```

### 6. Upload Your First Document

```bash
# Upload a PDF file
curl -X POST http://localhost:3001/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/your/document.pdf" \
  -F "title=My First Document"

# Copy the document ID from response
export DOC_ID="<document-id>"
```

### 7. Monitor Processing

```bash
# Check status (repeat every few seconds)
curl -s http://localhost:3001/api/documents/$DOC_ID/status \
  -H "Authorization: Bearer $TOKEN" | jq

# Watch worker logs
docker-compose logs -f worker
```

### 8. Verify Success

```bash
# List all documents
curl -s http://localhost:3001/api/documents \
  -H "Authorization: Bearer $TOKEN" | jq

# Get statistics
curl -s http://localhost:3001/api/documents/stats \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Test Files

### Create Sample Text File

```bash
cat > test.txt << 'EOF'
# Artificial Intelligence

Artificial Intelligence (AI) is the simulation of human intelligence processes by machines, especially computer systems. These processes include learning, reasoning, and self-correction.

## Machine Learning

Machine learning is a subset of AI that provides systems the ability to automatically learn and improve from experience without being explicitly programmed.

## Deep Learning

Deep learning is part of a broader family of machine learning methods based on artificial neural networks with representation learning.
EOF
```

### Upload Sample File

```bash
curl -X POST http://localhost:3001/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.txt" \
  -F "title=AI Overview"
```

### Process Web Page

```bash
curl -X POST http://localhost:3001/api/documents/url \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://en.wikipedia.org/wiki/Machine_learning",
    "title": "Machine Learning Wikipedia"
  }'
```

## Common Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f minio
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart api
docker-compose restart worker
```

### Clean Restart

```bash
# Stop and remove everything (INCLUDING DATA!)
docker-compose down -v

# Rebuild and start
docker-compose build
docker-compose up -d
```

### Database Access

```bash
# PostgreSQL
docker-compose exec postgres psql -U rag_user -d dynamic_rag

# View documents
SELECT id, title, status, chunk_count FROM documents ORDER BY created_at DESC LIMIT 10;

# Exit
\q
```

### Redis Access

```bash
# Redis CLI
docker-compose exec redis redis-cli

# View queue keys
KEYS bull:*

# Exit
exit
```

## API Endpoints Reference

### Authentication

```bash
# Signup
POST /api/auth/signup
Body: { email, password, company_name?, openai_api_key? }

# Login
POST /api/auth/login
Body: { email, password }

# Get current user
GET /api/auth/me
Headers: Authorization: Bearer {token}
```

### Documents

```bash
# Upload file
POST /api/documents/upload
Headers: Authorization: Bearer {token}
Form Data: file, title (optional)

# Process URL
POST /api/documents/url
Headers: Authorization: Bearer {token}
Body: { url, title? }

# List documents
GET /api/documents?page=1&limit=50&status=completed&type=pdf
Headers: Authorization: Bearer {token}

# Get document details
GET /api/documents/{id}
Headers: Authorization: Bearer {token}

# Get processing status
GET /api/documents/{id}/status
Headers: Authorization: Bearer {token}

# Get download URL
GET /api/documents/{id}/download
Headers: Authorization: Bearer {token}

# Delete document
DELETE /api/documents/{id}
Headers: Authorization: Bearer {token}

# Get statistics
GET /api/documents/stats
Headers: Authorization: Bearer {token}
```

## Troubleshooting

### Services Won't Start

```bash
# Check Docker is running
docker ps

# Check ports are available
lsof -i :3001  # API
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :9000  # MinIO
lsof -i :9001  # MinIO Console

# View service status
docker-compose ps

# Check specific service logs
docker-compose logs api
```

### MinIO Connection Issues

```bash
# Verify MinIO is running
docker-compose ps minio

# Check MinIO logs
docker-compose logs minio

# Test MinIO endpoint
curl http://localhost:9000/minio/health/live

# Access console
open http://localhost:9001
```

### Worker Not Processing

```bash
# Check worker is running
docker-compose ps worker

# View worker logs
docker-compose logs -f worker

# Check Redis connection
docker-compose exec redis redis-cli ping

# View queue
docker-compose exec redis redis-cli KEYS "bull:*"
```

### Database Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U rag_user -d dynamic_rag -c "SELECT NOW();"

# View recent errors
docker-compose logs postgres | tail -50
```

### Build Errors

```bash
# Clean node_modules
rm -rf node_modules package-lock.json

# Reinstall dependencies
npm install

# Clean build
rm -rf dist
npm run build

# Rebuild Docker images
docker-compose build --no-cache
```

### File Upload Errors

**Error**: "File too large"
- Check customer config: `max_file_size_mb` (default: 50MB)
- Update in database if needed

**Error**: "Document type not allowed"
- Check customer config: `allowed_document_types`
- Supported: pdf, txt, html, md

**Error**: "Document limit reached"
- Check customer config: `max_documents` (default: 10,000)
- Delete old documents or increase limit

### Processing Errors

**Error**: "No OpenAI API key available"
- Verify `.env` has `OPENAI_API_KEY`
- Or set per-customer key in signup

**Error**: "Failed to parse PDF"
- Check PDF is not encrypted/password-protected
- Verify PDF is not corrupted
- Test with simple text file first

**Error**: "Out of memory"
- Increase Docker memory limit (Settings → Resources)
- Reduce worker concurrency
- Process smaller files

## Health Checks

### Quick Health Check

```bash
# API health
curl http://localhost:3001/health

# Expected response:
{
  "status": "healthy",
  "database": true,
  "timestamp": "2025-01-19T10:00:00.000Z",
  "version": "1.0.0"
}
```

### Detailed Service Check

```bash
# Check all services
docker-compose ps

# All should show "Up" with healthy status
# If any show "unhealthy", check logs
```

### Performance Check

```bash
# Check container resource usage
docker stats

# Monitor:
# - CPU % (should be < 50% idle)
# - Memory usage (should have headroom)
# - Network I/O
```

## Next Steps

1. **Explore the API**: Try different file types (PDF, TXT, MD, HTML)
2. **Test Web Scraping**: Process articles and documentation
3. **Check Metrics**: View embedding costs and token usage
4. **Scale Up**: Increase worker concurrency for faster processing
5. **Production Setup**: Configure AWS S3, enable HTTPS, set up monitoring

## Support

- **Documentation**: See `PHASE2_DOCUMENT_UPLOAD_COMPLETE.md` for full details
- **Architecture**: See `ARCHITECTURE.md` and `ARCHITECTURE_DIAGRAMS.md`
- **Issues**: Check logs with `docker-compose logs -f`

## Summary

You now have a fully functional document processing pipeline:

✅ File upload API
✅ Multi-format parsing (PDF, HTML, TXT, MD)
✅ Automatic chunking and embedding
✅ Vector storage in LanceDB
✅ Background processing with BullMQ
✅ Multi-tenant isolation
✅ Cost tracking

**Ready for Phase 3: RAG & Search!**
