# ✅ Docker Setup Complete - Phase 1 Ready for Testing

## 🎉 What's Working

Phase 1 implementation is complete and Docker containers are running successfully:

- ✅ PostgreSQL database with complete schema
- ✅ Redis for BullMQ job queue
- ✅ API server with authentication endpoints
- ✅ Worker container (ready for Phase 2)
- ✅ Per-customer JWT secrets implementation
- ✅ Password hashing with bcrypt
- ✅ AES-256 encryption for sensitive data
- ✅ Health check endpoints
- ✅ Docker multi-stage builds optimized for production

## 🚀 Quick Start

### 1. Start the System

```bash
docker-compose up -d
```

### 2. Check Container Status

```bash
docker-compose ps
```

Expected output:
```
NAME                   STATUS         PORTS
dynamicrag-api         Up (healthy)   0.0.0.0:3001->3001/tcp
dynamicrag-postgres    Up (healthy)   0.0.0.0:5432->5432/tcp
dynamicrag-redis       Up (healthy)   0.0.0.0:6379->6379/tcp
dynamicrag-worker      Up
```

### 3. View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
```

## 🧪 API Testing

### Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": true,
  "timestamp": "2025-10-05T18:58:21.932Z",
  "version": "1.0.0"
}
```

### Create Account (Signup)

```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123#",
    "company_name": "My Company"
  }'
```

Expected response:
```json
{
  "message": "Account created successfully",
  "customer": {
    "id": "uuid-here",
    "email": "user@example.com",
    "company_name": "My Company",
    "api_key": "generated-api-key",
    "created_at": "timestamp"
  },
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "expiresIn": "24h"
}
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123#"
  }'
```

### Get Current User

```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Refresh Token

```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

### Logout

```bash
curl -X POST http://localhost:3001/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

### Logout from All Devices

```bash
curl -X POST http://localhost:3001/api/auth/logout-all \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 📊 Database Access

### Connect to PostgreSQL

```bash
docker-compose exec postgres psql -U rag_user -d dynamic_rag
```

### View Tables

```sql
\dt

-- View customers
SELECT id, email, company_name, status, created_at FROM customers;

-- View customer config
SELECT customer_id, rate_limit_requests_per_minute, max_documents FROM customer_config;

-- View refresh tokens
SELECT customer_id, created_at, expires_at, revoked FROM refresh_tokens;
```

### Redis Access

```bash
docker-compose exec redis redis-cli

# View all keys
KEYS *

# View BullMQ queues
KEYS bull:document-processing:*
```

## 🔒 Security Features Implemented

### Per-Customer JWT Secrets ✅

Each customer gets unique JWT secrets:
- **Access token secret**: 128-character hex string (encrypted at rest)
- **Refresh token secret**: 128-character hex string (encrypted at rest)
- **Encryption**: AES-256-CBC for all secrets in database
- **Benefits**:
  - Compromising one customer's secret doesn't affect others
  - Can revoke specific customer's tokens by rotating their secrets
  - Enterprise-grade multi-tenant security

### Password Security ✅

- **Hashing**: bcrypt with 10 rounds
- **Validation**: Requires uppercase, lowercase, number, special character
- **Minimum length**: 8 characters

### Data Encryption ✅

All sensitive data encrypted with AES-256:
- OpenAI API keys
- JWT secrets
- Any other customer-sensitive data

## 🛠️ Development Commands

### Rebuild Containers

```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### Reset Database

```bash
docker-compose down -v  # Remove volumes
docker-compose up -d
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
async function setup() {
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync('/app/schema.sql', 'utf8');
    await client.query(schema);
    console.log('✅ Database initialized');
  } finally {
    client.release();
    await pool.end();
  }
}
setup().catch(console.error);
"
```

### Stop All Containers

```bash
docker-compose down
```

### Stop and Remove Everything (including volumes)

```bash
docker-compose down -v
```

## 📋 Environment Variables

Key variables in `.env`:

```bash
# Database
DB_PASSWORD=SecurePassword123!

# Encryption (REQUIRED - must be 64 hex characters)
ENCRYPTION_KEY=your-64-character-hex-string

# JWT token expiration
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Optional (for future phases)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET=
OPENAI_API_KEY=
```

## 📦 What's Included

### Containers

1. **dynamicrag-api**: Express API server
   - Authentication endpoints
   - JWT token management
   - Rate limiting (ready)
   - Health checks

2. **dynamicrag-worker**: BullMQ worker
   - Ready for document processing (Phase 2)
   - Connected to Redis queue

3. **dynamicrag-postgres**: PostgreSQL 16
   - 8 tables for multi-tenant system
   - Proper indexes and constraints
   - Health checks

4. **dynamicrag-redis**: Redis 7
   - BullMQ job queue backend
   - Persistent storage

### Database Schema

- `customers`: User accounts with encrypted secrets
- `customer_config`: Per-customer configuration
- `refresh_tokens`: JWT refresh token tracking
- `documents`: Document metadata (Phase 2)
- `document_versions`: Version tracking (Phase 2)
- `webhooks`: n8n webhook configuration (Phase 4)
- `usage_metrics`: Token usage tracking (Phase 3)
- `rate_limits`: Rate limit tracking

## 🔍 Troubleshooting

### API not responding

```bash
docker-compose logs api
docker-compose restart api
```

### Database connection issues

```bash
docker-compose logs postgres
docker-compose exec postgres pg_isready -U rag_user
```

### Redis connection issues

```bash
docker-compose logs redis
docker-compose exec redis redis-cli ping
```

### Encryption key errors

Make sure `ENCRYPTION_KEY` in `.env` is exactly 64 hex characters:

```bash
# Generate new key
openssl rand -hex 32

# Update .env and restart
docker-compose down
docker-compose up -d
```

## ✅ Testing Checklist

- [x] Health endpoint returns 200
- [x] Signup creates customer with unique JWT secrets
- [x] Login returns access + refresh tokens
- [x] /me endpoint returns customer data with valid token
- [x] Token refresh works
- [x] Logout revokes refresh token
- [x] Database schema created successfully
- [x] Redis connection working
- [x] Docker containers all healthy

## 🚀 Next Steps (Phase 2)

- [ ] Multi-tenant LanceDB manager
- [ ] Document processing pipeline (PDF, web scraping)
- [ ] S3 file upload integration
- [ ] Document API endpoints
- [ ] Worker implementation for async processing

---

**Status**: ✅ Phase 1 Complete - Ready for Testing

**Docker Compose Version**: Compatible with Docker Compose v2
**Node Version**: 20-alpine
**Database**: PostgreSQL 16
**Redis**: 7-alpine
