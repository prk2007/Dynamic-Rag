-- Dynamic RAG PostgresSQL Schema
-- Phase 1: Core Infrastructure + Enhanced Authentication

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CUSTOMERS TABLE (UPDATED with Email Verification & MFA)
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- Nullable for SSO-only accounts
    company_name VARCHAR(255),
    api_key VARCHAR(64) UNIQUE NOT NULL,
    openai_api_key TEXT, -- Encrypted
    jwt_secret TEXT NOT NULL, -- Per-customer JWT secret (encrypted)
    jwt_refresh_secret TEXT NOT NULL, -- Per-customer refresh token secret (encrypted)

    -- Email Verification
    email_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR(255),
    email_verification_expires TIMESTAMP,

    -- MFA/2FA
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret TEXT, -- Encrypted TOTP secret
    mfa_backup_codes TEXT, -- Encrypted JSON array of hashed codes

    -- Profile
    avatar_url TEXT,

    -- Status
    status VARCHAR(30) DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'active', 'suspended', 'deleted')),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_api_key ON customers(api_key);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_verification_token ON customers(email_verification_token);

-- =====================================================
-- EMAIL VERIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS email_verifications (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_verifications_token ON email_verifications(token);
CREATE INDEX idx_email_verifications_customer ON email_verifications(customer_id);
CREATE INDEX idx_email_verifications_expires ON email_verifications(expires_at);

-- =====================================================
-- MFA TRUSTED DEVICES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS mfa_trusted_devices (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    trusted_until TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(customer_id, device_fingerprint)
);

CREATE INDEX idx_mfa_trusted_devices_customer ON mfa_trusted_devices(customer_id);
CREATE INDEX idx_mfa_trusted_devices_fingerprint ON mfa_trusted_devices(device_fingerprint);
CREATE INDEX idx_mfa_trusted_devices_expires ON mfa_trusted_devices(trusted_until);

-- =====================================================
-- MFA EVENTS TABLE (Audit Log)
-- =====================================================
CREATE TABLE IF NOT EXISTS mfa_events (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- setup, enable, disable, verify_success, verify_fail, backup_used
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_mfa_events_customer ON mfa_events(customer_id);
CREATE INDEX idx_mfa_events_type ON mfa_events(event_type);
CREATE INDEX idx_mfa_events_created ON mfa_events(created_at DESC);

-- =====================================================
-- SSO PROVIDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS sso_providers (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- google, microsoft, github, etc.
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),
    provider_name VARCHAR(255),
    provider_avatar TEXT,
    access_token TEXT, -- Encrypted
    refresh_token TEXT, -- Encrypted
    token_expires_at TIMESTAMP,
    profile_data JSONB, -- Raw profile data from provider
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)
);

CREATE INDEX idx_sso_providers_customer ON sso_providers(customer_id);
CREATE INDEX idx_sso_providers_provider ON sso_providers(provider, provider_user_id);
CREATE INDEX idx_sso_providers_email ON sso_providers(provider_email);

-- =====================================================
-- SSO EVENTS TABLE (Audit Log)
-- =====================================================
CREATE TABLE IF NOT EXISTS sso_events (
    id BIGSERIAL PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- login, link, unlink, profile_sync
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sso_events_customer ON sso_events(customer_id);
CREATE INDEX idx_sso_events_provider ON sso_events(provider);
CREATE INDEX idx_sso_events_type ON sso_events(event_type);
CREATE INDEX idx_sso_events_created ON sso_events(created_at DESC);

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

CREATE TRIGGER update_sso_providers_updated_at BEFORE UPDATE ON sso_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECURITY VIEWS (for monitoring)
-- =====================================================

-- View for monitoring failed authentication attempts
CREATE OR REPLACE VIEW failed_auth_attempts AS
SELECT
    customer_id,
    COUNT(*) as attempt_count,
    MAX(created_at) as last_attempt,
    ip_address,
    user_agent
FROM mfa_events
WHERE success = false
    AND event_type IN ('verify_fail')
    AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY customer_id, ip_address, user_agent
HAVING COUNT(*) >= 5;

-- View for customers with MFA enabled
CREATE OR REPLACE VIEW customers_with_mfa AS
SELECT
    c.id,
    c.email,
    c.company_name,
    c.mfa_enabled,
    c.email_verified,
    COUNT(DISTINCT mtd.id) as trusted_devices_count,
    COUNT(DISTINCT sp.id) as sso_providers_count
FROM customers c
LEFT JOIN mfa_trusted_devices mtd ON c.id = mtd.customer_id AND mtd.trusted_until > NOW()
LEFT JOIN sso_providers sp ON c.id = sp.customer_id
WHERE c.mfa_enabled = true
GROUP BY c.id, c.email, c.company_name, c.mfa_enabled, c.email_verified;

-- =====================================================
-- CLEANUP JOBS (to be run periodically)
-- =====================================================

-- Function to cleanup expired email verification tokens
CREATE OR REPLACE FUNCTION cleanup_expired_verifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM email_verifications
    WHERE expires_at < NOW() AND verified_at IS NULL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired MFA trusted devices
CREATE OR REPLACE FUNCTION cleanup_expired_trusted_devices()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM mfa_trusted_devices
    WHERE trusted_until < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old audit logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS TABLE(mfa_events_deleted INTEGER, sso_events_deleted INTEGER) AS $$
DECLARE
    mfa_deleted INTEGER;
    sso_deleted INTEGER;
BEGIN
    DELETE FROM mfa_events
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS mfa_deleted = ROW_COUNT;

    DELETE FROM sso_events
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS sso_deleted = ROW_COUNT;

    RETURN QUERY SELECT mfa_deleted, sso_deleted;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INITIAL DATA / SEED
-- =====================================================

-- Note: Admin user creation will be handled by setup script
-- This is the enhanced schema with email verification, MFA, and SSO support
