# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dynamic RAG** is a multi-tenant SaaS platform providing ready-made RAG (Retrieval-Augmented Generation) pipelines for multiple customers. The system combines document processing, vector search, and LLM integration with enterprise-grade security features including per-customer JWT secrets, encrypted data storage, and complete tenant isolation.

### Current Status: **Phase 1 Complete** ✅

Phase 1 implements the authentication and infrastructure foundation:
- Multi-tenant authentication system with per-customer JWT secrets
- PostgreSQL database with complete schema
- Redis-backed BullMQ job queue
- Docker containerization ready for production
- Security: AES-256 encryption, bcrypt password hashing, rate limiting

## Quick Start

### Development Mode

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development (watch mode)
npm run dev

# Run API server
npm start
```

### Production Mode (Docker)

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down
```

## Architecture Overview

### Current Implementation (Phase 1) ✅

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                       │
│            (Next.js Dashboard, n8n, Cursor, API)             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Express API Server                          │
│                  (dynamicrag-api:3001)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Authentication Routes  (/api/auth/*)                 │   │
│  │  - Signup, Login, Refresh, Logout, /me               │   │
│  │  - Per-customer JWT secret management                │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐
    │PostgreSQL│ │  Redis  │ │ Worker  │
    │    16   │ │    7    │ │Container│
    └─────────┘ └─────────┘ └─────────┘
```

### Database Schema (8 Tables)

**Core Tables:**
- `customers`: User accounts with encrypted JWT secrets
- `customer_config`: Per-customer settings (rate limits, quotas)
- `refresh_tokens`: JWT refresh token tracking

**Future Tables (Phase 2+):**
- `documents`: Document metadata and status
- `document_versions`: Version control and content hashing
- `webhooks`: n8n webhook configurations
- `usage_metrics`: Token usage and cost tracking
- `rate_limits`: Real-time rate limit tracking

See: `src/database/schema.sql`

## Key Features Implemented

### 🔐 Per-Customer JWT Secrets

**Every customer gets unique JWT secrets** for enhanced security isolation:

- **Access Token Secret**: 128-character hex string (expires: 24h)
- **Refresh Token Secret**: 128-character hex string (expires: 7d)
- **Encryption**: All secrets encrypted with AES-256 before storage
- **Isolation**: Compromising one customer's secret doesn't affect others

**Implementation Files:**
- `src/auth/jwt.ts` - Token generation and verification
- `src/models/customer.ts` - Secret generation and storage
- `src/middleware/authenticate.ts` - Token verification middleware

**How It Works:**
1. Signup: Generate unique secrets → Encrypt → Store in DB
2. Login: Fetch encrypted secrets → Decrypt → Generate tokens
3. Verification: Decode token → Get customer ID → Fetch secret → Verify signature

See: `PER_CUSTOMER_JWT_UPDATE.md` for detailed documentation

### 🔒 Security Features

1. **Password Security**
   - bcrypt hashing (10 rounds)
   - Validation: 8+ chars, uppercase, lowercase, number, special char
   - Implementation: `src/auth/password.ts`

2. **Data Encryption**
   - AES-256-CBC encryption for sensitive data
   - Encrypted fields: JWT secrets, OpenAI keys, customer data
   - Master key: `ENCRYPTION_KEY` environment variable (64 hex chars)
   - Implementation: `src/auth/encryption.ts`

3. **Rate Limiting**
   - Per-customer configurable limits
   - Default: 60 req/min, 10,000 req/day
   - Implementation: `src/middleware/rate-limit.ts`

4. **Multi-Tenant Isolation**
   - Filesystem isolation: Separate LanceDB per customer
   - Database isolation: Row-level filtering by customer_id
   - S3 isolation: Customer-specific prefixes

### 🐳 Docker Setup

**4 Containers:**
- `dynamicrag-api` - Express API server (Node 20 Alpine)
- `dynamicrag-worker` - BullMQ worker for async processing (Node 20 Alpine)
- `dynamicrag-postgres` - PostgreSQL 16 database
- `dynamicrag-redis` - Redis 7 for job queue

**Features:**
- Multi-stage builds for optimized images
- Health checks on all containers
- Persistent volumes for data
- Automatic restart policies
- Native module support (bcrypt)

See: `docker-compose.yml`, `Dockerfile`

## API Endpoints (Phase 1)

### Authentication Endpoints

```bash
# Health Check
GET /health
→ Returns server status and database connectivity

# Signup
POST /api/auth/signup
Body: { email, password, company_name?, openai_api_key? }
→ Creates customer with unique JWT secrets
→ Returns: customer data, accessToken, refreshToken

# Login
POST /api/auth/login
Body: { email, password }
→ Authenticates user with per-customer secrets
→ Returns: customer data, accessToken, refreshToken

# Get Current User
GET /api/auth/me
Header: Authorization: Bearer <accessToken>
→ Returns: customer data and configuration

# Refresh Token
POST /api/auth/refresh
Body: { refreshToken }
→ Generates new token pair, revokes old refresh token
→ Returns: new accessToken, new refreshToken

# Logout
POST /api/auth/logout
Header: Authorization: Bearer <accessToken>
Body: { refreshToken }
→ Revokes specific refresh token

# Logout All Devices
POST /api/auth/logout-all
Header: Authorization: Bearer <accessToken>
→ Revokes all refresh tokens for customer
```

See: `DOCKER_READY.md` for testing examples

## Environment Variables

Required variables in `.env`:

```bash
# Server
PORT=3001
NODE_ENV=development

# PostgreSQL Database
DATABASE_URL=postgresql://rag_user:password@postgres:5432/dynamic_rag
DB_HOST=postgres
DB_PORT=5432
DB_USER=rag_user
DB_PASSWORD=your_secure_password
DB_NAME=dynamic_rag

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Encryption (REQUIRED - 64 hex characters)
ENCRYPTION_KEY=your-64-character-hex-string

# Generate with: openssl rand -hex 32
```

**Optional (Phase 2+):**
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`
- `OPENAI_API_KEY` (fallback key)
- `CUSTOMERS_DB_PATH`, `DEFAULT_DB_PATH` (LanceDB paths)

See: `.env.example`

## Directory Structure

```
/
├── src/
│   ├── server.ts              # Main API server (Phase 1)
│   ├── index.ts               # Original MCP server (legacy)
│   │
│   ├── auth/                  # Authentication & Security
│   │   ├── jwt.ts             # Per-customer JWT management
│   │   ├── password.ts        # Password hashing & validation
│   │   └── encryption.ts      # AES-256 encryption utilities
│   │
│   ├── database/              # Database Layer
│   │   ├── connection.ts      # PostgreSQL connection pool
│   │   ├── schema.sql         # Complete DB schema (8 tables)
│   │   ├── migrate.ts         # Migration runner
│   │   └── setup.ts           # Initial setup script
│   │
│   ├── models/                # Data Models
│   │   └── customer.ts        # Customer CRUD + JWT secrets
│   │
│   ├── routes/                # API Routes
│   │   └── auth.ts            # Authentication endpoints
│   │
│   ├── middleware/            # Middleware
│   │   ├── authenticate.ts    # JWT verification (async)
│   │   └── rate-limit.ts      # Per-customer rate limiting
│   │
│   ├── queue/                 # Job Queue (Phase 2)
│   │   ├── connection.ts      # Redis/BullMQ connection
│   │   └── queues.ts          # Queue definitions
│   │
│   ├── workers/               # Background Workers (Phase 2)
│   │   └── document-worker.ts # Document processing worker
│   │
│   ├── lancedb/               # Vector Database (Legacy MCP)
│   │   └── client.ts          # LanceDB connection
│   │
│   └── tools/                 # MCP Tools (Legacy)
│       ├── registry.ts        # Tool management
│       └── operations/        # Tool implementations
│
├── dist/                      # Compiled JavaScript (gitignored)
│
├── Seed Script/               # Data seeding utilities
│   ├── seed.py                # Ollama-based seeding
│   ├── seed_openai.py         # OpenAI-based seeding
│   └── seed_gemini.py         # Gemini-based seeding
│
├── docker-compose.yml         # Multi-container setup
├── Dockerfile                 # Multi-stage Node.js build
├── .dockerignore              # Docker build exclusions
│
├── .env                       # Environment variables (gitignored)
├── .env.example               # Environment template
│
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration
│
└── Documentation/
    ├── ARCHITECTURE.md        # Complete system architecture
    ├── ARCHITECTURE_DIAGRAMS.md  # Flow diagrams (10 diagrams)
    ├── DOCKER_READY.md        # Docker setup & testing guide
    ├── PER_CUSTOMER_JWT_UPDATE.md  # JWT implementation details
    ├── DEPENDENCIES.md        # BullMQ migration guide
    ├── SETUP.md               # Local setup instructions
    └── README.md              # Project overview
```

## Development Workflow

### Making Changes

1. **Edit TypeScript files** in `src/`
2. **Build**: `npm run build` (or `npm run watch` for dev)
3. **Test locally**: `npm run dev`
4. **Test in Docker**: `docker-compose build && docker-compose up -d`

### Database Changes

```bash
# Edit schema
vim src/database/schema.sql

# Rebuild and restart
docker-compose down -v  # Remove volumes to reset DB
docker-compose up -d

# Apply schema
docker cp src/database/schema.sql dynamicrag-api:/app/schema.sql
docker-compose exec api node -e "
  const { Pool } = require('pg');
  const fs = require('fs');
  const pool = new Pool({
    host: 'postgres',
    port: 5432,
    user: 'rag_user',
    password: 'SecurePassword123!',
    database: 'dynamic_rag',
  });
  (async () => {
    const client = await pool.connect();
    try {
      const schema = fs.readFileSync('/app/schema.sql', 'utf8');
      await client.query(schema);
      console.log('✅ Schema applied');
    } finally {
      client.release();
      await pool.end();
    }
  })().catch(console.error);
"
```

### Adding New API Endpoints

1. Create route handler in `src/routes/`
2. Register in `src/server.ts`: `app.use('/api/your-route', yourRoutes)`
3. Add authentication: Use `authenticate` middleware
4. Test with curl examples
5. Document in relevant MD files

### Common Issues & Solutions

**Issue**: `ENCRYPTION_KEY` error
**Solution**: Generate proper 64-char hex key:
```bash
openssl rand -hex 32
```
Add to `.env` and restart: `docker-compose restart api`

**Issue**: bcrypt native module error
**Solution**: Dockerfile includes build dependencies (python3, make, g++)

**Issue**: Package lock out of sync
**Solution**:
```bash
rm -f package-lock.json
npm install
docker-compose build
```

**Issue**: Database not initialized
**Solution**: See "Database Changes" section above

## Testing

### Manual Testing

```bash
# Health check
curl http://localhost:3001/health

# Create test account
curl -X POST http://localhost:3001/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"Test123#","company_name":"Test Co"}'

# Save the accessToken from response

# Test authenticated endpoint
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

See: `DOCKER_READY.md` for complete testing guide

### Database Inspection

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U rag_user -d dynamic_rag

# View customers
SELECT id, email, company_name, status, created_at FROM customers;

# View customer configs
SELECT customer_id, rate_limit_requests_per_minute, max_documents FROM customer_config;

# View refresh tokens
SELECT customer_id, created_at, expires_at, revoked FROM refresh_tokens;
```

### Redis Inspection

```bash
# Connect to Redis
docker-compose exec redis redis-cli

# View all keys
KEYS *

# View BullMQ queues (Phase 2)
KEYS bull:document-processing:*
```

## Dependencies

### Production Dependencies

```json
{
  "@lancedb/lancedb": "^0.15.0",          // Vector database
  "@langchain/openai": "^0.3.12",         // OpenAI embeddings
  "@modelcontextprotocol/sdk": "1.1.1",   // MCP protocol
  "@aws-sdk/client-s3": "^3.700.0",       // S3 file storage
  "bcrypt": "^5.1.1",                     // Password hashing
  "bullmq": "^5.28.2",                    // Job queue
  "cheerio": "^1.0.0",                    // HTML parsing
  "cors": "^2.8.5",                       // CORS middleware
  "dotenv": "^16.4.7",                    // Environment variables
  "express": "^4.21.2",                   // Web server
  "ioredis": "^5.4.2",                    // Redis client
  "jsonwebtoken": "^9.0.2",               // JWT tokens
  "lru-cache": "^11.0.2",                 // Caching
  "pdf-parse": "^1.1.1",                  // PDF parsing
  "pg": "^8.13.1"                         // PostgreSQL client
}
```

### Development Dependencies

```json
{
  "@types/bcrypt": "^5.0.2",
  "@types/express": "^5.0.0",
  "@types/jsonwebtoken": "^9.0.7",
  "@types/node": "^22.10.7",
  "@types/pg": "^8.11.10",
  "shx": "^0.3.4",                        // Cross-platform shell
  "tsx": "^4.19.2",                       // TypeScript execution
  "typescript": "^5.7.3"
}
```

## Roadmap

### Phase 1: Foundation ✅ COMPLETE

- [x] Multi-tenant authentication system
- [x] Per-customer JWT secrets
- [x] PostgreSQL database with complete schema
- [x] Redis integration for job queue
- [x] Docker containerization
- [x] Security: encryption, password hashing, rate limiting
- [x] API endpoints: signup, login, refresh, logout
- [x] Health checks and monitoring

### Phase 2: Document Processing 🚧 NEXT

- [ ] Multi-tenant LanceDB manager with connection pooling
- [ ] Document upload API (S3 integration)
- [ ] Document processing pipeline (PDF, HTML, TXT)
- [ ] Text chunking and embedding generation
- [ ] BullMQ worker implementation
- [ ] Document versioning and deduplication
- [ ] Document API endpoints (CRUD)
- [ ] Web scraping integration

### Phase 3: RAG & Search 📋 PLANNED

- [ ] Vector search API endpoints
- [ ] RAG query pipeline
- [ ] Context retrieval and ranking
- [ ] Token usage tracking and metrics
- [ ] Budget monitoring and alerts
- [ ] Usage analytics dashboard

### Phase 4: n8n Integration 📋 PLANNED

- [ ] Webhook management API
- [ ] n8n workflow templates
- [ ] Real-time document sync
- [ ] Event-driven processing
- [ ] n8n node package

### Phase 5: Frontend Dashboard 📋 PLANNED

- [ ] Next.js dashboard application
- [ ] Document management UI
- [ ] Webhook configuration UI
- [ ] Usage metrics visualization
- [ ] Customer settings panel

## Important Notes for AI Assistants

### When Working on Phase 1 (Current)

- **Main server**: `src/server.ts` (NOT `src/index.ts`)
- **Authentication**: Always use per-customer JWT secrets
- **Middleware**: `authenticate.ts` is async (uses `await verifyAccessToken()`)
- **Database**: All customer operations must include encryption/decryption
- **Security**: Never store secrets unencrypted

### When Starting Phase 2

- **LanceDB**: Create per-customer database instances
- **S3 Integration**: Use customer-specific prefixes
- **Workers**: Implement in `src/workers/document-worker.ts`
- **Job Queue**: Use BullMQ with Redis
- **Document Types**: Support PDF, HTML, TXT initially

### Code Quality Standards

- Use TypeScript strict mode
- Handle errors gracefully
- Log important events
- Add JSDoc comments to functions
- Follow existing code structure
- Write secure code (validate inputs, sanitize data)

### Security Requirements

- Always encrypt sensitive data before storage
- Use bcrypt for password hashing
- Implement rate limiting on all endpoints
- Validate all user inputs
- Use parameterized queries (prevent SQL injection)
- Implement proper CORS policies

## Documentation References

- **ARCHITECTURE.md**: Complete system architecture and tech stack
- **ARCHITECTURE_DIAGRAMS.md**: 10 detailed flow diagrams
- **DOCKER_READY.md**: Docker setup and testing guide
- **PER_CUSTOMER_JWT_UPDATE.md**: JWT implementation details
- **DEPENDENCIES.md**: BullMQ migration guide
- **SETUP.md**: Local development setup
- **README.md**: Project overview

## Quick Reference Commands

```bash
# Development
npm run dev              # Run in watch mode
npm run build            # Build TypeScript
npm start                # Start production server

# Docker
docker-compose up -d     # Start all services
docker-compose down      # Stop all services
docker-compose logs -f   # View logs
docker-compose ps        # Check status

# Database
docker-compose exec postgres psql -U rag_user -d dynamic_rag

# Redis
docker-compose exec redis redis-cli

# Rebuild everything
docker-compose down -v
docker-compose build
docker-compose up -d
```

---

**Project Status**: Phase 1 Complete ✅
**Production Ready**: Yes (Phase 1 features)
**Docker Ready**: Yes
**Documentation**: Complete
**Next Phase**: Document Processing (Phase 2)
