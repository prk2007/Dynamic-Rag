# 🎉 Phase 1 Complete - Ready to Test!

## ✅ What's Been Implemented

### Core Infrastructure
- ✅ **PostgreSQL Database**
  - Complete schema with 8 tables
  - Migrations system
  - Customer & document management
  - Token usage tracking built-in

- ✅ **Authentication System**
  - JWT access & refresh tokens
  - Password hashing (bcrypt)
  - API key generation
  - OpenAI key encryption (AES-256)

- ✅ **Redis & BullMQ**
  - Queue system for async jobs
  - Document processing queue
  - Job status tracking

- ✅ **API Endpoints**
  - `/api/auth/signup` - Create account
  - `/api/auth/login` - Login
  - `/api/auth/refresh` - Refresh token
  - `/api/auth/logout` - Logout
  - `/api/auth/me` - Get user info
  - `/mcp` - MCP JSON-RPC (protected)

- ✅ **Middleware**
  - JWT authentication
  - Per-customer rate limiting
  - CORS configuration

- ✅ **Docker Setup**
  - Multi-container setup (PostgreSQL, Redis, API, Worker)
  - Development & production ready
  - Health checks included

---

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# 1. Navigate to project
cd /Users/prashantkhurana/Upwork/Dynamic-Rag

# 2. Create .env file
cp .env.example .env

# 3. Edit .env - Set these minimum values:
#    DB_PASSWORD=your_secure_password
#    JWT_SECRET=$(openssl rand -hex 32)
#    JWT_REFRESH_SECRET=$(openssl rand -hex 32)
#    ENCRYPTION_KEY=$(openssl rand -hex 32)

# 4. Start all services
docker-compose up -d

# 5. Wait for services to be healthy (30 seconds)
docker-compose ps

# 6. Initialize database
docker-compose exec api npm run db:setup

# 7. View logs
docker-compose logs -f api
```

### Option 2: Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL & Redis (separate terminals or Docker)
docker run -d --name postgres-rag \
  -e POSTGRES_DB=dynamic_rag \
  -e POSTGRES_USER=rag_user \
  -e POSTGRES_PASSWORD=changeme \
  -p 5432:5432 postgres:15-alpine

docker run -d --name redis-rag -p 6379:6379 redis:7-alpine

# 3. Setup .env
cp .env.example .env
# Edit .env with your values

# 4. Initialize database
npm run db:setup

# 5. Start server
npm run dev
```

---

## 🧪 Test the API

### 1. Health Check
```bash
curl http://localhost:3001/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "server": "dynamic-rag-server",
  "initialized": true,
  "services": {
    "database": { "healthy": true },
    "redis": { "healthy": true }
  }
}
```

### 2. Create Account
```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#",
    "company_name": "Test Company"
  }'
```

**Expected Response:**
```json
{
  "message": "Account created successfully",
  "customer": {
    "id": "uuid-here",
    "email": "test@example.com",
    "company_name": "Test Company",
    "api_key": "64-char-hex-string",
    "created_at": "2024-01-15T..."
  },
  "accessToken": "jwt-token-here",
  "refreshToken": "refresh-token-here",
  "expiresIn": "24h"
}
```

### 3. Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'
```

### 4. Access Protected Endpoint
```bash
# Get access token from signup/login response
TOKEN="your-access-token-here"

curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Test MCP Endpoint (with auth)
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

---

## 📊 Database Access

### Using Docker
```bash
# Access PostgreSQL shell
docker-compose exec postgres psql -U rag_user -d dynamic_rag

# Example queries:
SELECT * FROM customers;
SELECT * FROM customer_config;
SELECT * FROM usage_metrics;
```

### View Tables
```sql
-- List all tables
\dt

-- View customer data
SELECT id, email, company_name, status, created_at FROM customers;

-- View customer configs
SELECT
  c.email,
  cc.rate_limit_requests_per_minute,
  cc.max_documents,
  cc.monthly_budget_usd
FROM customers c
JOIN customer_config cc ON c.id = cc.customer_id;
```

---

## 🔧 Troubleshooting

### Services Won't Start

```bash
# Check logs
docker-compose logs

# Check individual service
docker-compose logs postgres
docker-compose logs redis
docker-compose logs api

# Restart a service
docker-compose restart api
```

### Database Connection Errors

```bash
# Test PostgreSQL connection
docker-compose exec postgres psql -U rag_user -d dynamic_rag

# If connection fails, check password in .env matches docker-compose.yml
```

### API Returns 500 Error

```bash
# Check API logs
docker-compose logs api

# Common issues:
# 1. Database not initialized - run: docker-compose exec api npm run db:setup
# 2. Missing environment variables - check .env file
# 3. Redis not running - check: docker-compose ps
```

### TypeScript Build Errors

```bash
# Rebuild
docker-compose build api

# Or locally:
npm run build
```

---

## 📁 Project Files Created

### Core Infrastructure
```
src/
├── auth/
│   ├── jwt.ts                  # JWT token generation/verification
│   ├── password.ts             # Password hashing/validation
│   └── encryption.ts           # OpenAI key encryption
├── database/
│   ├── connection.ts           # PostgreSQL connection pool
│   ├── schema.sql              # Database schema
│   ├── migrate.ts              # Migration runner
│   └── setup.ts                # Initial setup script
├── middleware/
│   ├── authenticate.ts         # JWT authentication middleware
│   └── rate-limit.ts           # Rate limiting middleware
├── models/
│   └── customer.ts             # Customer data access layer
├── queue/
│   ├── connection.ts           # Redis connection
│   └── queues.ts               # BullMQ queue definitions
└── routes/
    └── auth.ts                 # Authentication endpoints
```

### Docker & Config
```
.
├── Dockerfile                  # Application container
├── docker-compose.yml          # Multi-container setup
├── .dockerignore               # Docker build exclusions
├── .env.example                # Environment template
├── .gitignore                  # Updated for data/
├── SETUP.md                    # Setup instructions
└── READY_TO_TEST.md            # This file
```

---

## 🎯 Next Steps (Phase 2)

After testing Phase 1, we'll implement:

1. **Multi-tenant LanceDB Manager**
   - Connection pooling per customer
   - Per-customer OpenAI key usage
   - LRU cache for connections

2. **Document Processing Pipeline**
   - PDF parser
   - Web scraper
   - S3 integration
   - Chunking & embedding
   - BullMQ worker implementation

3. **Document API Endpoints**
   - Upload documents
   - Process documents
   - Query documents
   - View processing status

4. **Metrics & Monitoring**
   - Token usage tracking
   - Cost calculation
   - Usage dashboards

---

## ✅ Phase 1 Completion Checklist

- [x] PostgreSQL schema & migrations
- [x] JWT authentication system
- [x] Customer data models
- [x] Redis & BullMQ setup
- [x] Authentication middleware
- [x] Rate limiting middleware
- [x] Auth API endpoints
- [x] Docker setup
- [x] Documentation
- [ ] **Testing (YOU ARE HERE)**

---

## 📞 Support Commands

```bash
# View all services status
docker-compose ps

# Follow all logs
docker-compose logs -f

# Restart everything
docker-compose restart

# Stop everything
docker-compose down

# Stop and remove volumes (DELETES ALL DATA!)
docker-compose down -v

# Rebuild and restart
docker-compose up -d --build
```

---

## 🎓 What You Can Test

1. ✅ **Account Creation**: Signup with email/password
2. ✅ **Authentication**: Login and receive JWT tokens
3. ✅ **Token Refresh**: Use refresh token to get new access token
4. ✅ **Protected Endpoints**: Access `/api/auth/me` with Bearer token
5. ✅ **Rate Limiting**: Make 60+ requests in 1 minute to test limits
6. ✅ **MCP Integration**: Call MCP tools with authentication
7. ✅ **Database Persistence**: Stop/start containers, data persists
8. ✅ **Health Checks**: Monitor service health

---

## 🚨 Important Notes

### Security
- **Change default passwords** in `.env` before production
- **Generate strong secrets** for JWT_SECRET and ENCRYPTION_KEY
- **Never commit** `.env` file to git (already in .gitignore)

### Database
- PostgreSQL data persists in Docker volume `postgres_data`
- Redis data persists in Docker volume `redis_data`
- To reset: `docker-compose down -v` (DELETES ALL DATA!)

### Rate Limiting
- Default: 60 requests/minute per customer
- Configurable per customer in `customer_config` table

---

**🎉 You're all set! Start Docker and begin testing!**

```bash
docker-compose up -d
docker-compose logs -f
```
