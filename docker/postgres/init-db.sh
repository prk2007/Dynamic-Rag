#!/bin/bash
set -e

# This script runs automatically when the postgres container is first initialized
# It creates the pgvector extension in the database

echo "🔧 Initializing PostgreSQL database..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create pgvector extension
    CREATE EXTENSION IF NOT EXISTS vector;

    -- Verify installation
    SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

    -- Log success
    DO \$\$
    BEGIN
        RAISE NOTICE '✅ pgvector extension successfully installed';
    END
    \$\$;
EOSQL

echo "✅ PostgreSQL initialization complete - pgvector extension installed"
