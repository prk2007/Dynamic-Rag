# Dynamic RAG - Setup Guide

## Quick Start with Docker

### Prerequisites
- Docker & Docker Compose installed
- Git

### 1. Clone and Setup Environment

```bash
# Clone repository
cd /Users/prashantkhurana/Upwork/Dynamic-Rag

# Copy environment file
cp .env.example .env

# Edit .env and set required variables (minimum):
# - DB_PASSWORD
# - JWT_SECRET
# - JWT_REFRESH_SECRET
# - ENCRYPTION_KEY (run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 2. Start Services

```bash
# Start all services (PostgreSQL, Redis, API, Worker)
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### 3. Initialize Database

```bash
# Run migrations and create admin user
docker-compose exec api npm run db:setup
```

This will:
- Create all database tables
- Create an admin user with credentials from `.env`
- Display the admin API key

### 4. Test the API

```bash
# Health check
curl http://localhost:3001/health

# Test signup
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#",
    "company_name": "Test Company"
  }'

# Test login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'
```

---

## Development Setup (Without Docker)

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup PostgreSQL

```bash
# Start PostgreSQL (if using Homebrew on Mac)
brew services start postgresql@15

# Or use Docker
docker run -d \
  --name postgres-rag \
  -e POSTGRES_DB=dynamic_rag \
  -e POSTGRES_USER=rag_user \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  postgres:15-alpine
```

### 3. Setup Redis

```bash
# Start Redis (if using Homebrew on Mac)
brew services start redis

# Or use Docker
docker run -d \
  --name redis-rag \
  -p 6379:6379 \
  redis:7-alpine
```

### 4. Configure Environment

```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env with your values
# Required:
DB_PASSWORD=your_secure_password
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-token-secret
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 5. Initialize Database

```bash
# Run migrations
npm run migrate

# Or run full setup (migrations + admin user)
npm run db:setup
```

### 6. Start Development Server

```bash
# Start API server (with hot reload)
npm run dev

# In another terminal, start worker
npm run worker
```

---

## Docker Commands

### Management

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart a specific service
docker-compose restart api

# View logs
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f postgres

# Execute commands in container
docker-compose exec api npm run migrate
docker-compose exec api sh
```

### Database Management

```bash
# Access PostgreSQL
docker-compose exec postgres psql -U rag_user -d dynamic_rag

# Backup database
docker-compose exec postgres pg_dump -U rag_user dynamic_rag > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U rag_user -d dynamic_rag

# Reset database (CAREFUL - DELETES ALL DATA!)
docker-compose exec postgres psql -U rag_user -d dynamic_rag -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker-compose exec api npm run db:setup
```

### Cleanup

```bash
# Stop and remove containers, networks
docker-compose down

# Also remove volumes (DELETES ALL DATA!)
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

---

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| DB_PASSWORD | PostgreSQL password | `secure_password_123` |
| JWT_SECRET | JWT signing secret | `random-64-char-string` |
| JWT_REFRESH_SECRET | Refresh token secret | `another-random-string` |
| ENCRYPTION_KEY | Data encryption key | `hex-encoded-32-bytes` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | API server port |
| NODE_ENV | development | Environment |
| OPENAI_API_KEY | - | Fallback OpenAI key |
| AWS_REGION | - | S3 region |
| AWS_ACCESS_KEY_ID | - | S3 access key |
| AWS_SECRET_ACCESS_KEY | - | S3 secret |
| S3_BUCKET | - | S3 bucket name |
| ADMIN_EMAIL | admin@example.com | Admin user email |
| ADMIN_PASSWORD | - | Admin password |

---

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout
- `POST /api/auth/logout-all` - Logout all devices
- `GET /api/auth/me` - Get current user

### Health & Info

- `GET /health` - Health check
- `GET /` - Server info
- `GET /tools` - List MCP tools

### MCP Integration

- `POST /mcp` - MCP JSON-RPC endpoint

---

## Project Structure

```
Dynamic-Rag/
├── src/
│   ├── auth/               # Authentication (JWT, passwords, encryption)
│   ├── database/           # PostgreSQL (schema, migrations, connection)
│   ├── middleware/         # Express middleware (auth, rate limiting)
│   ├── models/             # Data access layer (customers, etc.)
│   ├── queue/              # BullMQ (queues, workers)
│   ├── routes/             # API routes
│   ├── lancedb/            # LanceDB integration
│   ├── tools/              # MCP tools
│   └── index.ts            # Main server
├── data/                   # LanceDB storage (gitignored)
├── Dockerfile              # Container image
├── docker-compose.yml      # Multi-container setup
├── .env.example            # Environment template
└── package.json            # Dependencies & scripts
```

---

## Troubleshooting

### Docker Issues

**Services won't start:**
```bash
# Check logs
docker-compose logs

# Ensure ports are free
lsof -i :3001  # API
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
```

**Database connection failed:**
```bash
# Test PostgreSQL
docker-compose exec postgres psql -U rag_user -d dynamic_rag

# Check credentials in .env match docker-compose.yml
```

**Redis connection failed:**
```bash
# Test Redis
docker-compose exec redis redis-cli ping
```

### Development Issues

**Port already in use:**
```bash
# Kill process on port
lsof -ti:3001 | xargs kill -9
```

**Database migration failed:**
```bash
# Drop and recreate (DEV ONLY!)
npm run db:setup
```

**TypeScript compilation errors:**
```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

---

## Next Steps

1. ✅ Services running
2. ✅ Database initialized
3. ✅ Admin user created
4. Test authentication endpoints
5. Implement document processing (Phase 2)
6. Build frontend dashboard (Phase 3)
7. Setup n8n integration (Phase 4)

---

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Review `ARCHITECTURE.md` for system design
3. See `PHASE1_PROGRESS.md` for implementation status
