CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  external_company_id VARCHAR(64) UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_prefix VARCHAR(16) NOT NULL,
  secret_hash VARCHAR(255) NOT NULL,
  label VARCHAR(128),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_api_keys_prefix ON tenant_api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS audit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  actor VARCHAR(255) NOT NULL DEFAULT 'system',
  order_id VARCHAR(64),
  warehouse_id VARCHAR(64),
  external_user_id VARCHAR(64),
  from_state VARCHAR(128) NOT NULL DEFAULT '',
  to_state VARCHAR(128) NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_entries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_type ON audit_entries(tenant_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_order ON audit_entries(tenant_id, order_id, created_at DESC)
  WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_entries(created_at);
