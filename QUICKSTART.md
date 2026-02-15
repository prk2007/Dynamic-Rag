# 🚀 Quick Start Guide

Get Dynamic RAG running in **under 5 minutes** with full automation!

## Prerequisites

- **Docker** and **Docker Compose** installed
- **Git** (to clone the repository)
- **8GB RAM** minimum
- **Ports available**: 3000, 3001, 5432, 6379, 9000, 9001

## One-Command Setup

### Option 1: Automated Setup Script (Recommended)

Run this single command to set up everything automatically:

```bash
chmod +x setup.sh && ./setup.sh
```

**What it does automatically:**
- ✅ Creates `.env` file from template
- ✅ Generates secure `ENCRYPTION_KEY` (64-char hex)
- ✅ Generates random database password
- ✅ Creates frontend `.env` file
- ✅ Builds all Docker containers
- ✅ Starts all services
- ✅ Runs database migrations automatically
- ✅ Installs pgvector extension
- ✅ Creates MinIO bucket
- ✅ Waits for all services to be healthy

**Time**: 2-5 minutes (depending on your internet speed)

### Option 2: Manual Docker Compose (If setup.sh fails)

```bash
# 1. Create environment files
cp .env.example .env
cp frontend/.env.example frontend/.env

# 2. Generate encryption key and update .env
openssl rand -hex 32
# Copy the output and replace ENCRYPTION_KEY value in .env

# 3. Start services (migrations run automatically via entrypoint)
docker-compose up -d

# 4. Check status
docker-compose ps
```

## Access the Application

Once setup is complete:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Create new account |
| **API** | http://localhost:3001 | - |
| **Health Check** | http://localhost:3001/health | - |
| **MinIO Console** | http://localhost:9001 | minioadmin / minioadmin123 |

## First Steps

1. **Open the application**: Visit http://localhost:3000

2. **Create an account**:
   - Click "Sign Up"
   - Enter email and password
   - Submit the form

3. **Verify email**:
   - If SendGrid is configured: Check your email
   - If SendGrid is NOT configured: Check container logs:
     ```bash
     docker-compose logs api | grep "verification"
     ```
   - Click the verification link or manually activate:
     ```bash
     docker-compose exec postgres psql -U rag_user -d dynamic_rag \
       -c "UPDATE customers SET status = 'active' WHERE email = 'your@email.com';"
     ```

4. **Add OpenAI API Key** (Required for embeddings):
   - Log in to the dashboard
   - Go to Profile → API Settings
   - Add your OpenAI API key

5. **Upload your first document**:
   - Navigate to "Upload" page
   - Drag & drop a PDF, TXT, HTML, or Markdown file
   - Wait for processing (check "Documents" page)

6. **Search your documents**:
   - Go to "Search" page
   - Enter a natural language query
   - View semantic search results!

## What Gets Created Automatically

### On First `docker-compose up`:

1. **PostgreSQL Database**:
   - `dynamic_rag` database created
   - `pgvector` extension installed automatically
   - All tables created from schema
   - Indexes created for performance

2. **MinIO Storage**:
   - `dynamic-rag-documents` bucket created
   - Ready for document uploads

3. **Redis**:
   - Ready for job queue (BullMQ)
   - Ready for rate limiting

4. **All Services Started**:
   - Frontend (React + nginx)
   - API (Express + TypeScript)
   - Worker (BullMQ document processor)
   - PostgreSQL with pgvector
   - Redis
   - MinIO

## Useful Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f postgres
```

### Service Management
```bash
# Check service status
docker-compose ps

# Restart a service
docker-compose restart api

# Stop all services
docker-compose down

# Stop and remove all data (⚠️ DELETES EVERYTHING)
docker-compose down -v
```

### Database Access
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U rag_user -d dynamic_rag

# Check tables
docker-compose exec postgres psql -U rag_user -d dynamic_rag -c '\dt'

# Verify pgvector
docker-compose exec postgres psql -U rag_user -d dynamic_rag -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### Manual Operations (Usually Not Needed)
```bash
# Rebuild containers (after code changes)
docker-compose build --no-cache
docker-compose up -d

# Manually run migrations (already runs automatically)
docker-compose exec api node dist/database/migrate.js

# Create admin user manually (optional)
docker-compose exec api node dist/database/setup.js
```

## Troubleshooting

### Services Not Starting?

```bash
# Check logs
docker-compose logs --tail=50

# Check specific service
docker-compose logs api --tail=50
```

### Database Connection Errors?

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U rag_user -d dynamic_rag -c 'SELECT 1;'
```

### API Not Responding?

```bash
# Check health endpoint
curl http://localhost:3001/health

# Check API logs
docker-compose logs api --tail=100
```

### Worker Not Processing Documents?

```bash
# Check worker logs
docker-compose logs worker --tail=50

# Check Redis connection
docker-compose exec redis redis-cli ping
```

### Complete Reset

If something goes wrong and you want to start fresh:

```bash
# Stop everything and remove all data
docker-compose down -v

# Remove built images (optional)
docker-compose down --rmi all

# Run setup again
./setup.sh
```

## Configuration

### Optional Environment Variables

You can customize these in `.env`:

```bash
# Email (for verification emails)
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=noreply@yourdomain.com

# OpenAI (fallback - users can use their own keys)
OPENAI_API_KEY=sk-your-openai-api-key

# Logging
LOG_LEVEL=info  # or debug

# Rate Limiting
DEFAULT_RATE_LIMIT_PER_MINUTE=60
```

### Production Deployment

For production, update `.env`:

```bash
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
EMAIL_VERIFICATION_URL=https://api.yourdomain.com/api/auth/verify-email

# Use strong passwords
DB_PASSWORD=<strong-random-password>
ENCRYPTION_KEY=<64-char-hex-string>
```

## Next Steps

- 📖 Read the full [README.md](README.md)
- 🏗️ Check [Architecture Documentation](docs/ARCHITECTURE.md)
- 🔌 Learn about [MCP Integration](docs/MCP_SETUP.md)
- 🤝 [Contribute](README.md#contributing)

## Support

- 💬 [GitHub Discussions](https://github.com/yourusername/dynamic-rag/discussions)
- 🐛 [Report Issues](https://github.com/yourusername/dynamic-rag/issues)
- 📚 [Full Documentation](docs/)

---

**That's it!** You now have a fully functional multi-tenant RAG system running locally. 🎉
