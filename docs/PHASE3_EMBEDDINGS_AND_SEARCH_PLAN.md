# Phase 3: Embeddings & Semantic Search Integration Plan

**Date**: 2025-01-21
**Status**: Planning Phase
**Goal**: Connect document upload pipeline with existing MCP server for semantic search

## Executive Summary

We have completed:
- ✅ Phase 1: Multi-tenant authentication system
- ✅ Phase 2: Document upload and processing pipeline
- ✅ Frontend: Complete UI with document management

**Next Step**: Phase 3 - Integrate embeddings generation with the existing MCP server for semantic search

## Current State Analysis

### What We Have

#### 1. Document Upload Pipeline (Phase 2)
**Location**: Backend API Server (port 3001)

**Components**:
- ✅ Document upload API (`/api/documents/upload`)
- ✅ URL processing API (`/api/documents/url`)
- ✅ File storage (MinIO/S3)
- ✅ Document worker (`src/workers/document-worker.ts`)
- ✅ File parsers (PDF, HTML, TXT, MD)
- ✅ Text chunking service (`src/services/embedding.service.ts`)
- ✅ Multi-tenant LanceDB service (`src/services/lancedb.service.ts`)

**Current Flow**:
```
Upload Document
    ↓
Store in MinIO
    ↓
Queue Job (BullMQ)
    ↓
Worker Processes:
  - Download file from MinIO
  - Parse content (PDF/HTML/TXT/MD)
  - Chunk text (paragraph-based with overlap)
  - **GENERATE EMBEDDINGS** ✅ (OpenAI text-embedding-3-small)
  - **STORE IN LANCEDB** ✅ (per-customer databases)
  - Update document status
```

**What Works**:
- Documents uploaded and stored ✅
- Content parsed and chunked ✅
- Embeddings generated using OpenAI ✅
- Vectors stored in per-customer LanceDB ✅

#### 2. MCP Server (Existing Legacy)
**Location**: `src/index.ts` (Same port 3001, but different routes)

**Components**:
- ✅ MCP protocol server
- ✅ Tool registry (`src/tools/registry.ts`)
- ✅ Existing search tools:
  - `chunks_search` - Semantic search in chunks
  - `catalog_search` - Document catalog search
  - `broad_chunks_search` - Broader semantic search
- ✅ LanceDB client (`src/lancedb/client.ts`)
- ✅ OpenAI embeddings integration

**Current Configuration**:
```typescript
// From src/lancedb/client.ts
- Uses OpenAI text-embedding-3-small
- Has hardcoded OPENAI_API_KEY (needs to be fixed)
- Connects to a SINGLE database (not multi-tenant)
- Has "chunks" and "catalog" tables
```

**Issues with Current MCP Server**:
1. ❌ **Not Multi-Tenant**: Uses single database for all users
2. ❌ **Hardcoded Credentials**: OpenAI API key is hardcoded
3. ❌ **No Customer Isolation**: All customers share same vector store
4. ❌ **Different Schema**: Expects different table structure
5. ❌ **Separate from API**: Not integrated with document upload flow

### The Gap

**Phase 2 Created**:
- Multi-tenant LanceDB (per customer: `/data/customers/{customerId}/`)
- Schema: `id, document_id, customer_id, content, vector, chunk_index, etc.`
- Table name: `documents`

**MCP Server Expects**:
- Single-tenant LanceDB (single database path)
- Schema: LangChain format with `metadata.source, metadata.page`
- Table names: `chunks`, `catalog`

## Phase 3 Goals

### Primary Objectives

1. **Enable Semantic Search**: Allow users to search their uploaded documents using natural language
2. **Multi-Tenant Search**: Ensure customer isolation (users only search their own documents)
3. **MCP Integration**: Leverage existing MCP tools for Claude/Cursor integration
4. **API Endpoints**: Provide REST API for frontend to perform searches
5. **Unified System**: Bridge the Phase 2 pipeline with MCP server

### Success Criteria

- [x] Users can upload documents via frontend
- [ ] Documents are automatically embedded and indexed
- [ ] Users can search documents via frontend
- [ ] Search returns relevant chunks with context
- [ ] Customer data isolation is maintained
- [ ] MCP tools work with multi-tenant data
- [ ] Frontend displays search results beautifully
- [ ] Performance: Search completes in <2 seconds

## Architecture Plan

### Option A: Unified Multi-Tenant MCP Server (RECOMMENDED)

**Approach**: Refactor MCP server to be multi-tenant aware

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (React)                    │
│            http://localhost:3000                     │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│              API Server (Express)                    │
│            http://localhost:3001                     │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Document API Routes                        │    │
│  │  /api/documents/*                           │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Search API Routes (NEW)                    │    │
│  │  /api/search/semantic                       │    │
│  │  /api/search/documents                      │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  MCP Routes (Enhanced)                      │    │
│  │  /mcp/*  (for Claude/Cursor)                │    │
│  │  - Multi-tenant aware                       │    │
│  │  - Customer ID from auth header             │    │
│  └────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐
    │LanceDB  │ │ MinIO   │ │PostgreSQL│
    │Customer1│ │         │ │         │
    └─────────┘ └─────────┘ └─────────┘
    ┌─────────┐
    │LanceDB  │
    │Customer2│
    └─────────┘
```

**Benefits**:
- ✅ Single codebase for both upload and search
- ✅ Maintains customer isolation
- ✅ Reuses existing embedding service
- ✅ MCP tools work for Claude/Cursor
- ✅ REST API for frontend

**Trade-offs**:
- Requires refactoring MCP server
- Need to update tool schemas

### Option B: Separate Search Service (NOT RECOMMENDED)

**Approach**: Keep MCP server separate, create new search service

**Issues**:
- Code duplication
- Two sources of truth
- Complex deployment

## Implementation Plan

### Phase 3.1: Backend - Multi-Tenant MCP Integration

#### Task 1: Refactor LanceDB Client
**File**: `src/lancedb/client.ts`

**Changes**:
1. Remove hardcoded OpenAI API key
2. Make multi-tenant aware
3. Connect to customer-specific databases
4. Support both "documents" table (new) and "chunks" table (legacy)

**New Interface**:
```typescript
export class MCPLanceDBClient {
  // Get customer-specific connection
  async getCustomerConnection(customerId: string): Promise<Connection>

  // Get customer vector store
  async getCustomerVectorStore(customerId: string): Promise<LanceDB>

  // Search in customer's documents
  async searchDocuments(
    customerId: string,
    query: string,
    maxResults?: number
  ): Promise<SearchResult[]>
}
```

#### Task 2: Update MCP Tools for Multi-Tenancy
**Files**:
- `src/tools/operations/chunks_search.ts`
- `src/tools/operations/catalog_search.ts`
- `src/tools/operations/broad_chunks_search.ts`

**Changes**:
1. Accept `customerId` parameter
2. Use customer-specific vector store
3. Update schema to match Phase 2 format
4. Add customer isolation checks

**Updated Tool Schema**:
```typescript
interface ChunksSearchParams {
  customerId: string; // NEW - from auth token
  text: string;
  maxResults?: number;
  useDetailedFormat?: boolean;
}
```

#### Task 3: Create Search API Routes
**New File**: `src/routes/search.ts`

**Endpoints**:
```typescript
POST /api/search/semantic
- Body: { query: string, maxResults?: number }
- Auth: Required (JWT)
- Returns: { results: SearchResult[], query: string, totalResults: number }

POST /api/search/documents
- Body: { query: string, filters?: DocumentFilter }
- Auth: Required (JWT)
- Returns: { documents: Document[], query: string }

GET /api/search/suggestions
- Query: q=partial_query
- Auth: Required (JWT)
- Returns: { suggestions: string[] }
```

**Implementation**:
```typescript
router.post('/semantic', authenticate, async (req, res) => {
  const { query, maxResults = 10 } = req.body;
  const customerId = req.user!.id;

  // Use refactored MCP client
  const client = new MCPLanceDBClient();
  const results = await client.searchDocuments(
    customerId,
    query,
    maxResults
  );

  res.json({ results, query, totalResults: results.length });
});
```

#### Task 4: Update Document Worker
**File**: `src/workers/document-worker.ts`

**Changes**:
1. Ensure embeddings are stored in correct format
2. Add metadata compatible with MCP search
3. Store in "documents" table (already done ✅)

**Metadata Mapping**:
```typescript
// Phase 2 format (current)
{
  id: `${documentId}_${chunkIndex}`,
  document_id: documentId,
  customer_id: customerId,
  content: chunkText,
  vector: embedding,
  chunk_index: chunkIndex,
  title: documentTitle
}

// Add MCP-compatible metadata
{
  ...existing,
  metadata: {
    source: documentTitle,
    page: Math.floor(chunkIndex / 3), // Approximate
    chunk_id: chunkIndex
  }
}
```

### Phase 3.2: Frontend - Search Interface

#### Task 5: Create Search Page
**New File**: `frontend/src/pages/dashboard/SearchPage.tsx`

**Features**:
- Search input with auto-suggest
- Search results display
- Source document links
- Pagination
- Filters (by document, date, type)

**UI Components**:
```tsx
<SearchPage>
  <SearchBar
    onSearch={handleSearch}
    suggestions={suggestions}
  />

  <SearchFilters
    onFilterChange={handleFilterChange}
    documents={userDocuments}
  />

  <SearchResults
    results={results}
    query={query}
    onDocumentClick={handleDocumentClick}
  />

  <Pagination
    page={page}
    totalPages={totalPages}
    onPageChange={setPage}
  />
</SearchPage>
```

#### Task 6: Create Search Components
**New Files**:
- `frontend/src/components/search/SearchBar.tsx`
- `frontend/src/components/search/SearchResult.tsx`
- `frontend/src/components/search/SearchFilters.tsx`

**SearchBar.tsx**:
```tsx
- Input field with search icon
- Auto-suggest dropdown
- Clear button
- Loading indicator
- Keyboard shortcuts (Cmd+K)
```

**SearchResult.tsx**:
```tsx
- Highlighted query terms
- Source document badge
- Chunk index indicator
- Relevance score (optional)
- "View in document" button
- Expand/collapse for full content
```

#### Task 7: Add Search to Navigation
**File**: `frontend/src/components/layout/DashboardLayout.tsx`

**Changes**:
1. Add "Search" to sidebar navigation
2. Add search icon to top bar (optional)
3. Add keyboard shortcut (Cmd+K) to open search

#### Task 8: Integrate Search API
**New File**: `frontend/src/services/search.service.ts`

**Implementation**:
```typescript
export const searchService = {
  async semanticSearch(query: string, maxResults = 10) {
    const response = await api.post('/api/search/semantic', {
      query,
      maxResults,
    });
    return response.data;
  },

  async getSuggestions(partialQuery: string) {
    const response = await api.get('/api/search/suggestions', {
      params: { q: partialQuery },
    });
    return response.data.suggestions;
  },
};
```

### Phase 3.3: Testing & Optimization

#### Task 9: End-to-End Testing
**Test Flow**:
```
1. Upload document (PDF/HTML/TXT)
2. Wait for processing to complete
3. Perform semantic search
4. Verify relevant chunks returned
5. Check customer isolation (user A can't search user B's docs)
6. Test MCP tools via Cursor/Claude
7. Performance test (<2s search time)
```

#### Task 10: Search Quality Improvements
**Optimizations**:
- Implement hybrid search (vector + keyword)
- Add re-ranking for better relevance
- Tune chunk size and overlap
- Add query expansion
- Implement caching for common queries

### Phase 3.4: MCP Client Integration

#### Task 11: Update MCP Client Configuration
**For Claude Desktop / Cursor**

**Configuration File** (`~/.config/claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "dynamic-rag": {
      "command": "node",
      "args": ["/path/to/Dynamic-Rag/dist/index.js"],
      "env": {
        "CUSTOMER_ID": "your_customer_id_here",
        "OPENAI_API_KEY": "your_openai_key"
      }
    }
  }
}
```

#### Task 12: Document MCP Usage
**Documentation**:
- How to configure MCP client
- How to use search tools in Claude
- Example queries
- Troubleshooting guide

## Data Flow

### Upload to Search Flow

```
┌─────────────────────────────────────────────────────┐
│ 1. USER UPLOADS DOCUMENT                            │
│    POST /api/documents/upload                       │
│    - File: report.pdf                               │
│    - Title: "Q4 Sales Report"                       │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 2. STORE IN MINIO                                   │
│    Key: customer123/documents/doc456/report.pdf     │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 3. QUEUE PROCESSING JOB                             │
│    Job: { documentId: 'doc456', customerId: 'cust123' } │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 4. WORKER PROCESSES                                 │
│    - Download from MinIO                            │
│    - Parse PDF → Extract text                       │
│    - Chunk: 50 chunks with 200 char overlap         │
│    - Generate embeddings (OpenAI)                   │
│    - Store in LanceDB: /data/customers/cust123/     │
│      Table: documents                               │
│      Records: 50 vector records                     │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 5. UPDATE STATUS                                    │
│    Document status: processing → completed          │
│    chunk_count: 50                                  │
│    embedding_tokens_used: 12,500                    │
└─────────────────────────────────────────────────────┘

              [DOCUMENT READY FOR SEARCH]

┌─────────────────────────────────────────────────────┐
│ 6. USER SEARCHES                                    │
│    POST /api/search/semantic                        │
│    Body: { query: "Q4 revenue growth" }             │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 7. GENERATE QUERY EMBEDDING                         │
│    OpenAI: "Q4 revenue growth" → [0.123, -0.456, ...]│
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 8. VECTOR SEARCH                                    │
│    LanceDB: /data/customers/cust123/documents       │
│    Query: cosine similarity with query vector       │
│    Results: Top 10 most similar chunks              │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ 9. RETURN RESULTS                                   │
│    [                                                │
│      {                                              │
│        content: "Q4 revenue grew 23% YoY...",       │
│        document_id: "doc456",                       │
│        chunk_index: 12,                             │
│        score: 0.89,                                 │
│        title: "Q4 Sales Report"                     │
│      },                                             │
│      ...                                            │
│    ]                                                │
└─────────────────────────────────────────────────────┘
```

## Technical Specifications

### API Specifications

#### Semantic Search API
```http
POST /api/search/semantic
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "query": "What was the Q4 revenue?",
  "maxResults": 10,
  "filters": {
    "documentIds": ["doc123", "doc456"],
    "dateRange": {
      "from": "2024-01-01",
      "to": "2024-12-31"
    }
  }
}

Response 200:
{
  "query": "What was the Q4 revenue?",
  "results": [
    {
      "id": "doc456_12",
      "document_id": "doc456",
      "title": "Q4 Sales Report",
      "content": "Q4 revenue reached $5.2M, representing...",
      "score": 0.89,
      "chunk_index": 12,
      "metadata": {
        "start_char": 2400,
        "end_char": 3600,
        "created_at": "2024-01-20T10:30:00Z"
      }
    }
  ],
  "totalResults": 8,
  "processingTime": 245
}
```

### LanceDB Schema

#### Documents Table (Multi-Tenant)
```typescript
interface DocumentVectorRecord {
  // Primary key
  id: string; // Format: {documentId}_{chunkIndex}

  // Foreign keys
  document_id: string;
  customer_id: string;

  // Content
  content: string; // Chunk text
  vector: number[]; // 1536 dims for text-embedding-3-small

  // Chunk metadata
  chunk_index: number;
  start_char: number;
  end_char: number;

  // Document metadata
  title?: string;
  doc_type?: 'pdf' | 'txt' | 'html' | 'md';

  // Timestamps
  created_at: string; // ISO 8601

  // MCP compatibility (optional)
  metadata?: {
    source: string;
    page: number;
    chunk_id: number;
  };
}
```

### Performance Requirements

| Metric | Target | Maximum |
|--------|--------|---------|
| Search latency | <500ms | <2s |
| Upload to searchable | <30s | <2min |
| Concurrent searches | 10 RPS | 50 RPS |
| Results relevance | >0.7 score | >0.5 score |
| Memory per customer | <100MB | <500MB |

## Security Considerations

### Multi-Tenancy
- ✅ Customer isolation at database level
- ✅ Authentication required for all search APIs
- ✅ Customer ID from JWT token
- ✅ Row-level filtering (customer_id)

### API Security
- ✅ Rate limiting on search endpoints
- ✅ Input validation (query length, maxResults)
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS prevention (sanitize output)

### OpenAI API Key Management
- ✅ Per-customer keys (from customer_config)
- ✅ Fallback to system key
- ✅ Encrypted storage
- ✅ Key rotation support

## Migration Strategy

### Existing Data
- No existing MCP data to migrate (single-tenant, not production)
- Fresh start with multi-tenant architecture
- Old MCP server config can be archived

### Rollout Plan
1. **Week 1**: Backend refactoring (Tasks 1-4)
2. **Week 2**: Frontend implementation (Tasks 5-8)
3. **Week 3**: Testing and optimization (Tasks 9-10)
4. **Week 4**: MCP integration and docs (Tasks 11-12)

## Dependencies

### External Services
- OpenAI API (embeddings)
- PostgreSQL (metadata)
- Redis (caching - future)
- MinIO (file storage)

### NPM Packages
**Backend**:
- `@lancedb/lancedb` - Vector database
- `@langchain/openai` - Embeddings
- `@langchain/community` - LanceDB integration

**Frontend**:
- `react-markdown` - Render markdown in results
- `react-syntax-highlighter` - Code highlighting (optional)

## Monitoring & Metrics

### Key Metrics to Track
- Search queries per user
- Average search latency
- Embedding generation time
- Vector store size per customer
- Top search queries
- Search result click-through rate

### Logging
```typescript
// Search event log
{
  event: 'search',
  customer_id: 'cust123',
  query: 'Q4 revenue',
  results_count: 8,
  latency_ms: 245,
  timestamp: '2024-01-20T10:30:00Z'
}
```

## Success Metrics

### Technical Success
- [ ] Search returns results in <2 seconds
- [ ] >90% search relevance score
- [ ] Zero cross-customer data leakage
- [ ] 99.9% uptime

### User Success
- [ ] Users can find information in their documents
- [ ] Search feels "natural" and intuitive
- [ ] Results are ranked correctly
- [ ] MCP tools work in Claude/Cursor

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Poor search quality | High | Medium | Tune chunking, add re-ranking |
| Slow search performance | High | Low | Implement caching, optimize queries |
| Cross-tenant data leak | Critical | Very Low | Strict testing, code review |
| OpenAI API rate limits | Medium | Medium | Implement retry logic, caching |
| Large vector stores | Medium | Medium | Implement cleanup, limits |

## Next Steps

### Immediate Actions
1. ✅ **Review this plan** with stakeholders
2. **Get approval** for Option A (Unified Multi-Tenant MCP)
3. **Start Task 1**: Refactor LanceDB client
4. **Set up metrics** dashboard

### Questions to Resolve
- [ ] What embedding model to use? (Currently: text-embedding-3-small)
- [ ] Chunk size and overlap? (Currently: ~1000 chars, 200 overlap)
- [ ] Search results limit? (Suggest: 10 default, 50 max)
- [ ] Re-ranking strategy?
- [ ] Caching strategy?

## Appendix

### Related Documentation
- `PHASE2_DOCUMENT_UPLOAD_COMPLETE.md` - Document upload system
- `ARCHITECTURE.md` - Overall system architecture
- `DOCKER_READY.md` - Deployment guide

### File Structure (After Phase 3)
```
src/
├── routes/
│   ├── auth.ts
│   ├── documents.ts
│   └── search.ts ← NEW
├── services/
│   ├── embedding.service.ts ✅
│   ├── lancedb.service.ts ✅
│   └── mcp-lancedb.service.ts ← NEW (refactored)
├── tools/
│   ├── registry.ts (updated)
│   └── operations/
│       ├── chunks_search.ts (updated for multi-tenant)
│       ├── catalog_search.ts (updated)
│       └── broad_chunks_search.ts (updated)
└── workers/
    └── document-worker.ts ✅

frontend/src/
├── pages/
│   └── dashboard/
│       ├── SearchPage.tsx ← NEW
│       ├── DocumentsPage.tsx ✅
│       └── UploadPage.tsx ✅
├── components/
│   └── search/ ← NEW
│       ├── SearchBar.tsx
│       ├── SearchResult.tsx
│       └── SearchFilters.tsx
└── services/
    └── search.service.ts ← NEW
```

---

**Status**: Ready for implementation
**Estimated Effort**: 3-4 weeks
**Priority**: High
**Owner**: Development Team
