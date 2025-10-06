-- Dynamic RAG PostgreSQL Schema
-- Phase 1: Core Infrastructure

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CUSTOMERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    api_key VARCHAR(64) UNIQUE NOT NULL,
    openai_api_key TEXT, -- Encrypted
    jwt_secret TEXT NOT NULL, -- Per-customer JWT secret (encrypted)
    jwt_refresh_secret TEXT NOT NULL, -- Per-customer refresh token secret (encrypted)
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_api_key ON customers(api_key);
CREATE INDEX idx_customers_status ON customers(status);

-- =====================================================
-- CUSTOMER CONFIGURATION TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS customer_config (
    id SERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    rate_limit_requests_per_minute INTEGER DEFAULT 60,
    rate_limit_requests_per_day INTEGER DEFAULT 10000,
    max_documents INTEGER DEFAULT 10000,
    max_file_size_mb INTEGER DEFAULT 50,
    allowed_document_types TEXT[] DEFAULT ARRAY['pdf', 'txt', 'html', 'md'],
    chunking_size INTEGER DEFAULT 1000,
    chunking_overlap INTEGER DEFAULT 200,
    embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small',
    monthly_budget_usd DECIMAL(10, 2) DEFAULT 100.00,
    budget_alert_threshold DECIMAL(3, 2) DEFAULT 0.80,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(customer_id)
);

CREATE INDEX idx_customer_config_customer ON customer_config(customer_id);

-- =====================================================
-- DOCUMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    source_url TEXT,
    s3_key VARCHAR(500),
    content_hash VARCHAR(64),
    file_size_bytes BIGINT,
    page_count INTEGER,
    chunk_count INTEGER DEFAULT 0,
    character_count INTEGER DEFAULT 0,
    -- Token usage metrics
    embedding_tokens_used INTEGER DEFAULT 0,
    embedding_cost_usd DECIMAL(10, 6) DEFAULT 0,
    processing_time_ms INTEGER,
    -- Status
    status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_documents_customer ON documents(customer_id);
CREATE INDEX idx_documents_hash ON documents(content_hash);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created ON documents(customer_id, created_at DESC);

-- =====================================================
-- DOCUMENT VERSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS document_versions (
    id SERIAL PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    s3_key VARCHAR(500),
    changes_summary TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(document_id, version)
);

CREATE INDEX idx_versions_document ON document_versions(document_id);
CREATE INDEX idx_versions_active ON document_versions(document_id, is_active);

-- =====================================================
-- WEBHOOKS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    webhook_url VARCHAR(500) UNIQUE NOT NULL,
    trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN ('manual', 'scheduled', 'event')),
    config JSONB,
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhooks_customer ON webhooks(customer_id);
CREATE INDEX idx_webhooks_url ON webhooks(webhook_url);

-- =====================================================
-- USAGE METRICS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS usage_metrics (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('api_call', 'embedding_tokens', 'storage_bytes', 'document_processed', 'search_query')),
    metric_value BIGINT NOT NULL,
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    metadata JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metrics_customer_time ON usage_metrics(customer_id, timestamp DESC);
CREATE INDEX idx_metrics_type ON usage_metrics(metric_type);
CREATE INDEX idx_metrics_document ON usage_metrics(document_id);
CREATE INDEX idx_metrics_cost ON usage_metrics(customer_id, cost_usd);

-- =====================================================
-- RATE LIMIT TRACKER TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS rate_limit_tracker (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP NOT NULL,
    window_end TIMESTAMP NOT NULL,
    UNIQUE(customer_id, endpoint, window_start)
);

CREATE INDEX idx_rate_limit_window ON rate_limit_tracker(customer_id, endpoint, window_end);

-- =====================================================
-- REFRESH TOKENS TABLE (for JWT)
-- =====================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    revoked BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_refresh_tokens_customer ON refresh_tokens(customer_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_config_updated_at BEFORE UPDATE ON customer_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INITIAL DATA / SEED
-- =====================================================

-- Note: Admin user creation will be handled by setup script
-- This is just the schema
