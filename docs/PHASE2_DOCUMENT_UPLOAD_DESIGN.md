# Phase 2: Document Upload - Design Document

## 📋 Overview

**Phase**: Phase 2 - Document Upload & Management
**Prerequisite**: Phase 1 (Authentication) ✅ Complete
**Goal**: Enable users to upload documents (PDF, TXT, MD, HTML) and store them for future embedding processing
**Status**: Design Phase - Awaiting Approval

---

## 🎯 Phase Objectives

### What We're Building
1. **Backend API** for document upload and management
2. **Frontend UI** for uploading and viewing documents
3. **File Storage** using local filesystem (S3 integration optional)
4. **PostgreSQL** metadata storage for tracking documents
5. **File Validation** for security and type checking

### What We're NOT Building (Yet)
- ❌ Document processing (PDF parsing, text extraction)
- ❌ Embedding generation with OpenAI
- ❌ LanceDB vector storage
- ❌ BullMQ job queue processing
- ❌ Document versioning

**Note**: This phase focuses ONLY on uploading and storing raw files. Processing will come in Phase 3.

---

## 🏗️ System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     User (Frontend)                          │
│  - Drag & drop files                                         │
│  - View document list                                        │
│  - Delete documents                                          │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP (REST API)
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               Express API Server                             │
│  Routes:                                                     │
│  - POST   /api/documents          (Upload file)             │
│  - GET    /api/documents          (List documents)          │
│  - GET    /api/documents/:id      (Get details)             │
│  - DELETE /api/documents/:id      (Delete document)         │
│  - GET    /api/documents/stats    (Get statistics)          │
└────────────┬───────────────────┬──────────────────────────┘
             │                   │
             │ (1) Upload to S3  │ (2) Save Metadata
             ▼                   ▼
    ┌─────────────────┐  ┌──────────────────┐
    │ MinIO (S3)      │  │   PostgreSQL     │
    │ Bucket:         │  │  documents table │
    │ dynamic-rag-    │  │                  │
    │ documents/      │  │  - id            │
    │ {customer_id}/  │  │  - customer_id   │
    │   {file_id}.pdf │  │  - title         │
    └─────────────────┘  │  - doc_type      │
    │  Port: 9000     │  │  - s3_key        │
    │  Console: 9001  │  │  - file_size     │
    └─────────────────┘  │  - status        │
                         │  - created_at    │
                         └──────────────────┘
```

---

## 📊 Detailed Flow Diagrams

### Flow 1: Document Upload

```
┌────────┐                                                    ┌────────┐
│Frontend│                                                    │Backend │
└───┬────┘                                                    └───┬────┘
    │                                                             │
    │ 1. User selects file (drag & drop or file picker)          │
    │    - Check file type (PDF, TXT, MD, HTML)                  │
    │    - Check file size (max 50MB default)                    │
    │                                                             │
    │ 2. POST /api/documents (multipart/form-data)               │
    │    Headers: Authorization: Bearer {accessToken}            │
    │    Body: file, title (optional)                            │
    ├────────────────────────────────────────────────────────────>│
    │                                                             │
    │                                      3. Validate JWT token │
    │                                      4. Check rate limits  │
    │                                      5. Validate file:      │
    │                                         - Type allowed?    │
    │                                         - Size < max?      │
    │                                         - MIME type valid? │
    │                                                             │
    │                                      6. Generate file_id   │
    │                                      7. Upload to MinIO:  │
    │                                         Bucket: dynamic-  │
    │                                         rag-documents     │
    │                                         Key: {customer}/  │
    │                                         {file_id}.{ext}   │
    │                                                             │
    │                                      8. Create DB record:  │
    │                                         INSERT INTO        │
    │                                         documents          │
    │                                         status='uploaded'  │
    │                                                             │
    │ 9. Response 201 Created                                    │
    │<────────────────────────────────────────────────────────────│
    │    {                                                        │
    │      id, title, doc_type,                                  │
    │      file_size, status, created_at                         │
    │    }                                                        │
    │                                                             │
    │ 10. Update UI:                                             │
    │     - Add to document list                                 │
    │     - Show success toast                                   │
    │                                                             │
    ▼                                                             ▼
```

### Flow 2: List Documents

```
┌────────┐                                                    ┌────────┐
│Frontend│                                                    │Backend │
└───┬────┘                                                    └───┬────┘
    │                                                             │
    │ 1. User navigates to Documents page                        │
    │    or page loads on mount                                  │
    │                                                             │
    │ 2. GET /api/documents?limit=20&offset=0&status=all         │
    │    Headers: Authorization: Bearer {accessToken}            │
    ├────────────────────────────────────────────────────────────>│
    │                                                             │
    │                                      3. Validate JWT token │
    │                                      4. Get customer_id    │
    │                                                             │
    │                                      5. Query PostgreSQL:  │
    │                                         SELECT * FROM      │
    │                                         documents WHERE    │
    │                                         customer_id = ?    │
    │                                         ORDER BY           │
    │                                         created_at DESC    │
    │                                         LIMIT ? OFFSET ?   │
    │                                                             │
    │                                      6. Get total count    │
    │                                                             │
    │ 7. Response 200 OK                                         │
    │<────────────────────────────────────────────────────────────│
    │    {                                                        │
    │      documents: [                                          │
    │        {id, title, doc_type,                               │
    │         status, file_size,                                 │
    │         created_at}                                        │
    │      ],                                                    │
    │      total: 42,                                            │
    │      limit: 20,                                            │
    │      offset: 0                                             │
    │    }                                                        │
    │                                                             │
    │ 8. Render document table                                   │
    │                                                             │
    ▼                                                             ▼
```

### Flow 3: Delete Document

```
┌────────┐                                                    ┌────────┐
│Frontend│                                                    │Backend │
└───┬────┘                                                    └───┬────┘
    │                                                             │
    │ 1. User clicks delete icon                                 │
    │    Show confirmation dialog                                │
    │                                                             │
    │ 2. DELETE /api/documents/{id}                              │
    │    Headers: Authorization: Bearer {accessToken}            │
    ├────────────────────────────────────────────────────────────>│
    │                                                             │
    │                                      3. Validate JWT token │
    │                                      4. Verify ownership:  │
    │                                         SELECT * FROM      │
    │                                         documents WHERE    │
    │                                         id = ? AND         │
    │                                         customer_id = ?    │
    │                                                             │
    │                                      5. Delete from MinIO  │
    │                                         using S3 key       │
    │                                                             │
    │                                      6. Delete DB record:  │
    │                                         DELETE FROM        │
    │                                         documents WHERE    │
    │                                         id = ?             │
    │                                                             │
    │ 7. Response 200 OK                                         │
    │<────────────────────────────────────────────────────────────│
    │    { message: "Document deleted" }                         │
    │                                                             │
    │ 8. Update UI:                                              │
    │    - Remove from list                                      │
    │    - Show success toast                                    │
    │                                                             │
    ▼                                                             ▼
```

### Flow 4: Get Document Stats

```
┌────────┐                                                    ┌────────┐
│Frontend│                                                    │Backend │
└───┬────┘                                                    └───┬────┘
    │                                                             │
    │ 1. Dashboard page loads                                    │
    │                                                             │
    │ 2. GET /api/documents/stats                                │
    │    Headers: Authorization: Bearer {accessToken}            │
    ├────────────────────────────────────────────────────────────>│
    │                                                             │
    │                                      3. Query PostgreSQL:  │
    │                                         SELECT COUNT(*),   │
    │                                         SUM(file_size)     │
    │                                         FROM documents     │
    │                                         WHERE              │
    │                                         customer_id = ?    │
    │                                         GROUP BY status    │
    │                                                             │
    │ 4. Response 200 OK                                         │
    │<────────────────────────────────────────────────────────────│
    │    {                                                        │
    │      total: 42,                                            │
    │      uploaded: 10,                                         │
    │      processing: 5,                                        │
    │      completed: 25,                                        │
    │      failed: 2,                                            │
    │      total_size_bytes: 123456789                           │
    │    }                                                        │
    │                                                             │
    │ 5. Update dashboard metrics                                │
    │                                                             │
    ▼                                                             ▼
```

---

## 🗄️ Database Schema

### Documents Table (Already Exists)

```sql
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,          -- 'pdf', 'txt', 'md', 'html'
    source_url TEXT,                         -- NULL for uploads
    s3_key VARCHAR(500),                     -- NULL for local storage
    file_path VARCHAR(500),                  -- Local path: /uploads/{customer_id}/{file_id}.{ext}
    content_hash VARCHAR(64),                -- SHA-256 hash (for future versioning)
    file_size_bytes BIGINT,
    page_count INTEGER,                      -- NULL until processed
    chunk_count INTEGER DEFAULT 0,           -- 0 until processed
    character_count INTEGER DEFAULT 0,       -- 0 until processed
    -- Token usage metrics (Phase 3)
    embedding_tokens_used INTEGER DEFAULT 0,
    embedding_cost_usd DECIMAL(10, 6) DEFAULT 0,
    processing_time_ms INTEGER,
    -- Status
    status VARCHAR(50) DEFAULT 'uploaded',   -- 'uploaded', 'processing', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Status Flow for Phase 2:**
- `uploaded` → Document uploaded, waiting for processing (Phase 3)

---

## 🔌 API Endpoints

### 1. Upload Document

```http
POST /api/documents
Content-Type: multipart/form-data
Authorization: Bearer {accessToken}

Body:
  file: <binary>           # Required
  title: "My Document"     # Optional (defaults to filename)
```

**Response 201 Created:**
```json
{
  "message": "Document uploaded successfully",
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_id": "fa28379c-...",
    "title": "My Document.pdf",
    "doc_type": "pdf",
    "file_size_bytes": 1234567,
    "status": "uploaded",
    "created_at": "2025-10-19T12:00:00Z"
  }
}
```

**Validation:**
- File size ≤ 50MB (configurable per customer)
- Allowed types: PDF, TXT, MD, HTML
- MIME type check
- Filename sanitization

---

### 2. List Documents

```http
GET /api/documents?limit=20&offset=0&status=all&sort_by=created_at&sort_order=desc
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `limit` (default: 20, max: 100)
- `offset` (default: 0)
- `status` (all, uploaded, processing, completed, failed)
- `sort_by` (created_at, title, status)
- `sort_order` (asc, desc)

**Response 200 OK:**
```json
{
  "documents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "My Document.pdf",
      "doc_type": "pdf",
      "file_size_bytes": 1234567,
      "status": "uploaded",
      "created_at": "2025-10-19T12:00:00Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0,
  "has_more": true
}
```

---

### 3. Get Document Details

```http
GET /api/documents/:id
Authorization: Bearer {accessToken}
```

**Response 200 OK:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "customer_id": "fa28379c-...",
  "title": "My Document.pdf",
  "doc_type": "pdf",
  "file_size_bytes": 1234567,
  "status": "uploaded",
  "created_at": "2025-10-19T12:00:00Z",
  "updated_at": "2025-10-19T12:00:00Z"
}
```

---

### 4. Delete Document

```http
DELETE /api/documents/:id
Authorization: Bearer {accessToken}
```

**Response 200 OK:**
```json
{
  "message": "Document deleted successfully"
}
```

**What Happens:**
1. Verify ownership (customer_id match)
2. Delete file from filesystem
3. Delete database record
4. Return success

---

### 5. Get Document Statistics

```http
GET /api/documents/stats
Authorization: Bearer {accessToken}
```

**Response 200 OK:**
```json
{
  "total": 42,
  "uploaded": 10,
  "processing": 5,
  "completed": 25,
  "failed": 2,
  "total_size_bytes": 123456789,
  "total_size_mb": 117.7
}
```

---

## 🎨 Frontend UI Design

### Documents Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Dynamic RAG                         [Profile] [Logout]      │
├─────────────────────────────────────────────────────────────┤
│  [Dashboard] [Documents] [API Keys] [Profile]               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📄 Documents                                               │
│  ──────────────────────────────────────────────────────     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  📤 Upload Documents                                │    │
│  │                                                      │    │
│  │  Drag and drop files here, or click to browse      │    │
│  │                                                      │    │
│  │  Supported: PDF, TXT, MD, HTML (max 50MB)          │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  📊 Statistics                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │  Total   │ │ Uploaded │ │Completed │ │  Failed  │     │
│  │   42     │ │    10    │ │    25    │ │    2     │     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │
│                                                              │
│  📋 Document List                          [🔍 Search]      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Name              Type   Size    Status   Created    │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ My Document.pdf   📄PDF  2.3MB  ⏳Uploaded  2h ago  🗑│  │
│  │ Notes.txt         📝TXT  15KB   ✅Completed 1d ago  🗑│  │
│  │ README.md         📋MD   8KB    ❌Failed    3d ago  🗑│  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  [← Previous]  Page 1 of 3  [Next →]                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key UI Components

1. **Upload Zone**
   - Drag & drop area
   - Click to browse
   - File type/size hints
   - Progress bar during upload
   - Success/error messages

2. **Statistics Cards**
   - Total documents
   - Count by status
   - Total storage used
   - Quick metrics

3. **Document Table**
   - Sortable columns
   - Status badges (uploaded, processing, completed, failed)
   - File type icons
   - Delete action
   - Pagination
   - Search/filter

4. **Status Indicators**
   - 🟡 Uploaded (yellow)
   - 🔵 Processing (blue)
   - 🟢 Completed (green)
   - 🔴 Failed (red)

---

## 📁 File Storage Strategy

### MinIO (S3-Compatible Storage) - Phase 2 Implementation ✅

**Why MinIO?**
- ✅ **S3-Compatible API**: Works with AWS SDK (easy migration to AWS S3 later)
- ✅ **Local Development**: No AWS credentials needed
- ✅ **Docker Integration**: Runs as a container
- ✅ **Production Ready**: Can be used in production or replaced with AWS S3
- ✅ **Web Console**: Built-in UI at http://localhost:9001

**MinIO Setup (Docker):**
```yaml
# docker-compose.yml
minio:
  image: minio/minio:latest
  ports:
    - "9000:9000"  # API
    - "9001:9001"  # Console UI
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin123
  volumes:
    - minio_data:/data
  command: server /data --console-address ":9001"
```

**S3 Key Structure:**
```
Bucket: dynamic-rag-documents
  ├── {customer_id_1}/
  │   ├── {document_id_1}.pdf
  │   ├── {document_id_2}.txt
  │   └── {document_id_3}.md
  ├── {customer_id_2}/
  │   ├── {document_id_4}.pdf
  │   └── {document_id_5}.html
  └── ...
```

**Access URLs:**
- **API Endpoint**: http://localhost:9000
- **Console UI**: http://localhost:9001 (login: minioadmin/minioadmin123)

**Pros:**
- ✅ S3-compatible (same code works with AWS S3)
- ✅ No AWS account needed for development
- ✅ Persistent storage with Docker volumes
- ✅ Production-ready (can run MinIO in production)
- ✅ Easy migration to AWS S3 later (just change endpoint)
- ✅ Built-in web console for debugging
- ✅ Supports all S3 features (versioning, lifecycle, etc.)

**Cons:**
- ❌ Need to manage MinIO server (but Docker handles it)
- ❌ Slightly more complex than local filesystem
- ⚠️ For production, AWS S3 is more reliable (but MinIO works too)

---

### Production Deployment Options

**For Production, you have two options:**

**Option 1: Keep Using MinIO**
- Deploy MinIO container in production
- Scale with MinIO distributed mode
- Good for self-hosted solutions

**Option 2: Switch to AWS S3**
- Change environment variables:
  ```bash
  S3_ENDPOINT=        # Empty = use AWS S3
  S3_ACCESS_KEY=your-aws-access-key
  S3_SECRET_KEY=your-aws-secret-key
  S3_REGION=us-east-1
  S3_USE_SSL=true
  ```
- **Code changes**: NONE! (S3-compatible API)
- Deploy with empty S3_ENDPOINT to use AWS S3

**Same code works for both!** 🎉

---

## 🔒 Security & Validation

### File Upload Validation

```typescript
// Validation checks
1. Authentication: Valid JWT token
2. Rate Limiting: Per-customer upload limits
3. File Type:
   - Extension check: .pdf, .txt, .md, .html
   - MIME type check:
     - application/pdf
     - text/plain
     - text/markdown
     - text/html
4. File Size: ≤ 50MB (configurable)
5. Filename: Sanitize special characters
6. Quota Check: Total storage limit per customer
```

### File Handling Security

```typescript
// Prevent directory traversal
- Sanitize filename: Remove /, .., etc.
- Generate UUID for storage
- Store with UUID, not original filename
- Validate MIME type matches extension
- Scan for malicious content (future)
```

---

## 🚀 Implementation Phases

### Phase 2.1: Backend Core (Priority 1)
**Files to Create:**
- `src/models/document.ts` - Database operations (CRUD)
- `src/routes/documents.ts` - API endpoints
- `src/services/s3-storage.ts` - MinIO/S3 client (AWS SDK)
- `src/utils/file-validation.ts` - File validation helpers

**Tasks:**
1. ✅ Add MinIO to docker-compose.yml
2. Install AWS SDK: `npm install @aws-sdk/client-s3`
3. Create S3 storage service (MinIO-compatible)
4. Initialize bucket on startup (create if not exists)
5. Create document model with CRUD operations
6. Create upload endpoint with multer middleware
7. Implement file validation
8. Create list/get/delete endpoints
9. Add statistics endpoint
10. Test MinIO integration

**Estimated Time:** 6-8 hours

---

### Phase 2.2: Frontend UI (Priority 2)
**Files to Create:**
- `frontend/src/pages/dashboard/DocumentsPage.tsx` - Main page
- `frontend/src/components/documents/FileUpload.tsx` - Upload component
- `frontend/src/components/documents/DocumentTable.tsx` - List component
- `frontend/src/components/documents/DocumentStats.tsx` - Stats cards
- `frontend/src/services/document.service.ts` - API client
- `frontend/src/types/document.types.ts` - TypeScript types

**Tasks:**
1. Create Documents page route
2. Build file upload component (drag & drop)
3. Build document table with pagination
4. Add statistics cards
5. Integrate with backend API
6. Add loading states and error handling
7. Add delete confirmation dialog

**Estimated Time:** 6-8 hours

---

### Phase 2.3: Polish & Testing (Priority 3)
**Tasks:**
1. Add upload progress indicator
2. Add file type icons
3. Add status badges with colors
4. Test file upload (all types)
5. Test pagination
6. Test delete flow
7. Test error scenarios (invalid file, too large, etc.)
8. Add toast notifications
9. Responsive design testing

**Estimated Time:** 2-3 hours

---

## ✅ Success Criteria

Before moving to Phase 3, we should have:

- [x] Backend API endpoints working
  - [ ] POST /api/documents (upload)
  - [ ] GET /api/documents (list)
  - [ ] GET /api/documents/:id (details)
  - [ ] DELETE /api/documents/:id (delete)
  - [ ] GET /api/documents/stats (statistics)

- [x] Frontend UI working
  - [ ] Upload page with drag & drop
  - [ ] Document list with pagination
  - [ ] Statistics dashboard
  - [ ] Delete functionality

- [x] File Storage working
  - [ ] Files saved to local filesystem
  - [ ] Customer-specific folders
  - [ ] Files deleted on document delete

- [x] Security & Validation
  - [ ] JWT authentication on all endpoints
  - [ ] File type validation
  - [ ] File size validation
  - [ ] Ownership verification for delete

- [x] Testing
  - [ ] Upload PDF file
  - [ ] Upload TXT file
  - [ ] Upload MD file
  - [ ] Upload HTML file
  - [ ] List documents
  - [ ] Delete document
  - [ ] View statistics

---

## 🔄 Future Enhancements (Phase 3+)

**Not included in Phase 2:**
- Document processing (PDF parsing, text extraction)
- Embedding generation
- LanceDB storage
- BullMQ job queue
- Document versioning
- S3 integration
- Webhook notifications
- Batch uploads
- Search functionality

---

## 📝 Notes

1. **Keep it simple**: This phase is ONLY about uploading and storing files
2. **No processing**: Files will sit in "uploaded" status until Phase 3
3. **Local storage first**: S3 can be added later with minimal changes
4. **Customer isolation**: Each customer's files in separate folder
5. **Status tracking**: Track upload status in PostgreSQL

---

## 🎯 Next Steps

**After Approval:**
1. Start with Phase 2.1 (Backend)
2. Test backend with Postman/curl
3. Move to Phase 2.2 (Frontend)
4. Test end-to-end flow
5. Polish and bug fixes (Phase 2.3)
6. Commit and move to Phase 3

**Questions to Resolve:**
- ✅ Use local filesystem or S3 for Phase 2? → **Local filesystem**
- ✅ Maximum file size limit? → **50MB (configurable)**
- ✅ Allowed file types? → **PDF, TXT, MD, HTML**
- ✅ Should we support drag & drop? → **Yes**

---

**Status:** ⏸️ Awaiting Design Approval

**Estimated Total Time:** 12-17 hours (spread over 2-3 days)

**Ready to proceed?** 🚀
