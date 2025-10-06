# Dependencies for BullMQ Implementation

## Required NPM Packages

### Core Queue System
```bash
npm install bullmq ioredis
npm install --save-dev @types/ioredis
```

### Authentication & Security
```bash
npm install jsonwebtoken bcrypt
npm install --save-dev @types/jsonwebtoken @types/bcrypt
```

### PostgreSQL
```bash
npm install pg
npm install --save-dev @types/pg
```

### AWS S3
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### Document Processing
```bash
npm install cheerio puppeteer  # Web scraping
npm install crypto              # For hashing (built-in Node.js)
```

### Utilities
```bash
npm install lru-cache           # LRU cache for DB connections
npm install dotenv              # Environment variables
```

## Complete package.json Dependencies

```json
{
  "dependencies": {
    "@lancedb/lancedb": "^0.15.0",
    "@langchain/community": "^0.3.24",
    "@langchain/openai": "latest",
    "@modelcontextprotocol/sdk": "1.1.1",
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/s3-request-presigner": "^3.700.0",
    "bullmq": "^5.28.2",
    "ioredis": "^5.4.2",
    "pg": "^8.13.1",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "express": "^4.21.2",
    "cors": "^2.8.5",
    "pdf-parse": "^1.1.1",
    "cheerio": "^1.0.0",
    "puppeteer": "^23.11.1",
    "lru-cache": "^11.0.2",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.19",
    "@types/pg": "^8.11.10",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/bcrypt": "^5.0.2",
    "@types/ioredis": "^5.0.0",
    "typescript": "^5.7.3",
    "tsx": "^4.19.2",
    "shx": "^0.3.4"
  }
}
```

## Environment Variables

Create `.env` file:

```bash
# Server
PORT=3001
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/dynamic_rag
DB_HOST=localhost
DB_PORT=5432
DB_USER=rag_user
DB_PASSWORD=your_password
DB_NAME=dynamic_rag

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=24h

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=dynamic-rag-documents
S3_REGION=us-east-1

# Customer Data
CUSTOMERS_DB_PATH=./data/customers
DEFAULT_DB_PATH=./data/default

# OpenAI (for customers without own key)
OPENAI_API_KEY=sk-fallback-key-optional

# Rate Limiting
DEFAULT_RATE_LIMIT_PER_MINUTE=60
DEFAULT_RATE_LIMIT_PER_DAY=10000

# Monitoring
ENABLE_METRICS=true
LOG_LEVEL=info
```

## BullMQ-Specific Configuration

### Key Differences from Bull:

1. **Import Changes**
   - Bull: `import Queue from 'bull'`
   - BullMQ: `import { Queue, Worker, QueueEvents } from 'bullmq'`

2. **Redis Connection**
   - Bull: Uses built-in Redis client
   - BullMQ: Requires `ioredis` with `maxRetriesPerRequest: null`

3. **Workers**
   - Bull: `queue.process(callback)`
   - BullMQ: `new Worker(queueName, callback, options)`

4. **Events**
   - Bull: Listen on queue directly
   - BullMQ: Use separate `QueueEvents` instance

5. **Job Options**
   - Similar but BullMQ has more granular control
   - Rate limiting built into Worker config

### Migration Notes:

If migrating from Bull to BullMQ:
- Queue names remain compatible
- Job data structure unchanged
- Can run both side-by-side during migration
- BullMQ can process existing Bull jobs

## Redis Setup

### Local Development (Docker)
```bash
docker run -d \
  --name redis-bullmq \
  -p 6379:6379 \
  redis:7-alpine
```

### Production Redis Config
```bash
# Recommended Redis settings for BullMQ
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

## PostgreSQL Setup

### Local Development (Docker)
```bash
docker run -d \
  --name postgres-rag \
  -e POSTGRES_DB=dynamic_rag \
  -e POSTGRES_USER=rag_user \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  postgres:15
```

### Initialize Schema
```bash
# Run migration after PostgreSQL is ready
psql -h localhost -U rag_user -d dynamic_rag -f migrations/001_initial_schema.sql
```

## Development Setup Commands

```bash
# Install all dependencies
npm install

# Setup local services (requires Docker)
docker-compose up -d postgres redis

# Initialize database schema
npm run migrate

# Start development server
npm run dev

# Start queue worker
npm run worker

# Run in watch mode
npm run watch
```

## BullMQ Benefits for This Project

1. **Per-customer Rate Limiting**: Built-in worker limiter
2. **Better Memory Management**: For 1000s of customers
3. **Job Groups**: Group jobs by customer for better organization
4. **Metrics**: Built-in metrics for monitoring
5. **TypeScript**: First-class TypeScript support
6. **Modern API**: Cleaner async/await patterns

## Next Steps

1. Update `package.json` with BullMQ dependencies
2. Create Redis connection module with IORedis
3. Implement queue service with Workers
4. Update job processors to use BullMQ API
5. Setup queue monitoring dashboard
