#!/bin/sh
set -e

echo "🚀 Dynamic RAG API Container Starting..."
echo "📋 Waiting for dependencies to be ready..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
max_retries=30
counter=0
until node -e "
  const pg = require('pg');
  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  pool.query('SELECT 1')
    .then(() => { console.log('✅ PostgreSQL is ready'); process.exit(0); })
    .catch(() => process.exit(1));
" 2>/dev/null; do
  counter=$((counter + 1))
  if [ $counter -ge $max_retries ]; then
    echo "❌ PostgreSQL connection timeout"
    exit 1
  fi
  echo "   Retry $counter/$max_retries..."
  sleep 2
done

# Wait for Redis to be ready
echo "⏳ Waiting for Redis..."
counter=0
until node -e "
  const Redis = require('ioredis');
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  });
  redis.ping()
    .then(() => { console.log('✅ Redis is ready'); redis.quit(); process.exit(0); })
    .catch(() => process.exit(1));
" 2>/dev/null; do
  counter=$((counter + 1))
  if [ $counter -ge $max_retries ]; then
    echo "❌ Redis connection timeout"
    exit 1
  fi
  echo "   Retry $counter/$max_retries..."
  sleep 2
done

# Check if database needs initialization
echo "🔍 Checking database state..."
DB_INITIALIZED=$(node -e "
  const pg = require('pg');
  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  pool.query(\"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers')\")
    .then(res => { console.log(res.rows[0].exists ? 'true' : 'false'); pool.end(); })
    .catch(() => { console.log('false'); pool.end(); });
" 2>/dev/null || echo "false")

if [ "$DB_INITIALIZED" = "false" ]; then
  echo "📋 Database not initialized - running migrations..."
  node dist/database/migrate.js

  if [ $? -eq 0 ]; then
    echo "✅ Database migrations completed successfully"
  else
    echo "❌ Database migration failed"
    exit 1
  fi
else
  echo "✅ Database already initialized - skipping migrations"
fi

# Ensure MinIO bucket exists (S3 service will handle this)
echo "📦 S3/MinIO bucket will be created on first use"

echo "✅ All initialization checks passed"
echo "🚀 Starting Dynamic RAG API server..."
echo ""

# Execute the main command (node dist/server.js)
exec "$@"
