# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dynamic RAG** is a multi-tenant SaaS platform providing RAG (Retrieval-Augmented Generation) pipelines for multiple customers. Express + TypeScript backend, React + Vite frontend, PostgreSQL, Redis/BullMQ, LanceDB vectors, MinIO/S3 storage.

**Completed:** Auth with per-customer JWT secrets, email verification, document upload/processing pipeline with embeddings, React dashboard.
**In Progress:** Phase 3 - RAG search/query endpoints.

## Build & Dev Commands

```bash
npm install            # Install dependencies
npm run build          # Compile TypeScript (tsc → dist/)
npm run dev            # Dev server with watch mode (tsx watch src/server.ts)
npm start              # Production server (node dist/server.js)
npm run worker         # Run document processing worker
npm run migrate        # Run database migrations
npm run db:setup       # Initial database setup
```

No test framework is configured. Testing is done manually via curl (see `DOCKER_READY.md`).

### Docker (6 containers)

```bash
docker-compose up -d                    # Start all services
docker-compose down                     # Stop all services
docker-compose down -v                  # Stop + wipe data volumes
docker-compose build && docker-compose up -d  # Rebuild after changes
docker-compose exec postgres psql -U rag_user -d dynamic_rag  # DB shell
docker-compose exec redis redis-cli     # Redis shell
```

Containers: `postgres` (15-alpine), `redis` (7-alpine), `minio` (S3-compatible storage), `api` (Express on :3001), `worker` (BullMQ document processor), `frontend` (React on :3000 via nginx).

### Frontend

```bash
cd frontend && npm install && npm run dev   # Dev server on :5173
cd frontend && npm run build                # Production build
```

React 18 + Vite + TypeScript + TailwindCSS + Zustand (state) + React Router v6 + Axios + React Hook Form/Zod.

## Architecture

### Request Flow

```
Client → Express (:3001) → authenticate middleware → Route handler → PostgreSQL
                                                   → S3/MinIO (file storage)
                                                   → BullMQ queue → Worker → LanceDB (vectors)
```

### Key Architectural Decisions

**Per-customer JWT secrets:** Every customer gets unique 128-char hex JWT secrets (access + refresh), encrypted with AES-256-CBC before storage. Token verification requires DB lookup to fetch and decrypt the customer's secret. This means `authenticate` middleware is async.

**Multi-tenant isolation:** Row-level DB filtering by `customer_id`, separate LanceDB instances per customer, customer-specific S3 prefixes.

**Document processing is async:** Upload → S3 → BullMQ job → Worker picks up → Parse (PDF/HTML/TXT/MD) → Chunk → Embed (OpenAI) → Store in LanceDB → Update status in PostgreSQL. Worker concurrency: 5, rate limit: 10/sec.

**Customer status flow:** `pending_verification` → `active` (after email verification). Login is blocked until email is verified. `password_hash` is nullable to support future SSO-only accounts.

### Entry Points

- **API server:** `src/server.ts` (NOT `src/index.ts` which is the legacy MCP server)
- **Worker:** `src/workers/document-worker.ts`
- **Frontend:** `frontend/src/main.tsx` → `App.tsx`

### Route Registration (src/server.ts)

```
/api/auth/*       → src/routes/auth.ts       (signup, login, refresh, logout, verify-email, resend-verification)
/api/documents/*  → src/routes/documents.ts  (upload, url-ingest, list, stats, detail, status, delete, download)
/api/profile/*    → src/routes/profile.ts    (get profile, manage OpenAI key)
/health           → inline health check
```

All `/api/documents/*` and `/api/profile/*` routes require the `authenticate` middleware. Auth routes selectively apply it.

### Data Layer

- **Models** (`src/models/`): Raw SQL queries via `pg` pool — no ORM. Customer, CustomerConfig, Document, EmailVerification.
- **Services** (`src/services/`): Business logic — S3 (upload/download/presigned URLs), LanceDB (vector storage), embedding generation, email (SendGrid), email verification.
- **Database** (`src/database/`): Connection pool (`connection.ts`), schema (`schema.sql` — 11+ tables including future MFA/SSO tables), migrations.

### Module System

ES Modules (`"type": "module"` in package.json). All internal imports use `.js` extensions (e.g., `import { query } from '../database/connection.js'`). TypeScript target: ES2020.

## Critical Patterns

### Encryption

All sensitive fields (JWT secrets, OpenAI API keys) are encrypted with AES-256-CBC before DB storage and decrypted on read. Use `encrypt()`/`decrypt()` from `src/auth/encryption.ts`. The `ENCRYPTION_KEY` env var must be 64 hex chars (`openssl rand -hex 32`).

### Authentication Middleware

`authenticate` from `src/middleware/authenticate.ts` is async. It attaches `req.customerId`, `req.customerEmail`, `req.customerConfig`, and `req.user` to the request. There's also `optionalAuthenticate` that doesn't fail on missing tokens.

### Adding New Routes

1. Create route file in `src/routes/`
2. Register in `src/server.ts` with `app.use('/api/your-route', yourRoutes)`
3. Apply `authenticate` middleware to protected endpoints
4. Use `req.customerId` for tenant-scoped queries

### Database Queries

Use `query()` from `src/database/connection.ts`. Always parameterized queries (`$1`, `$2`, etc.). Always filter by `customer_id` for tenant isolation.

## Environment

Required: `ENCRYPTION_KEY` (64 hex chars), `DB_*` (PostgreSQL), `REDIS_*`, `S3_*`/`MINIO_*`, `OPENAI_API_KEY`.
Optional: `SENDGRID_API_KEY`, `FRONTEND_URL`, `EMAIL_*`.
See `.env.example` for all variables.

## Common Issues

- **`ENCRYPTION_KEY` error:** Generate with `openssl rand -hex 32`, must be exactly 64 hex chars.
- **bcrypt native module error:** Dockerfile includes python3/make/g++ for native compilation.
- **Schema not applied:** After `docker-compose down -v`, schema must be reapplied (see `DOCKER_READY.md`).
- **Import errors:** All imports must use `.js` extension (ES modules requirement).
