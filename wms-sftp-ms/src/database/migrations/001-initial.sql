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
CREATE INDEX IF NOT EXISTS idx_sftp_api_keys_prefix ON tenant_api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS sftp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id VARCHAR(64),
  name VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL DEFAULT 22,
  username VARCHAR(255) NOT NULL,
  password_ciphertext TEXT,
  private_key_ciphertext TEXT,
  remote_path VARCHAR(512) NOT NULL DEFAULT '/inbound/940',
  inbound_path VARCHAR(512) NOT NULL DEFAULT '/outbound/945',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sftp_conn_tenant ON sftp_connections(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sftp_conn_external
  ON sftp_connections(tenant_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES sftp_connections(id) ON DELETE CASCADE,
  direction VARCHAR(16) NOT NULL DEFAULT 'upload',
  document_type VARCHAR(16) NOT NULL DEFAULT '940',
  file_name VARCHAR(255) NOT NULL,
  remote_path VARCHAR(1024) NOT NULL,
  body_text TEXT,
  body_hash VARCHAR(64),
  idempotency_key VARCHAR(128),
  external_order_id VARCHAR(64),
  external_group_id VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT NOT NULL DEFAULT '',
  bytes INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transfers_queue ON transfers(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_transfers_tenant ON transfers(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfers_idempotency
  ON transfers(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS inbound_pollers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL UNIQUE REFERENCES sftp_connections(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  remote_path VARCHAR(512) NOT NULL DEFAULT '/outbound/945',
  file_glob VARCHAR(128) NOT NULL DEFAULT '*.edi',
  delete_after_fetch BOOLEAN NOT NULL DEFAULT FALSE,
  last_polled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES sftp_connections(id) ON DELETE CASCADE,
  remote_path VARCHAR(1024) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  body_hash VARCHAR(64) NOT NULL,
  body_text TEXT NOT NULL,
  document_type VARCHAR(16) NOT NULL DEFAULT '945',
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, body_hash)
);

CREATE TABLE IF NOT EXISTS action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  connection_id UUID,
  transfer_id UUID,
  action VARCHAR(64) NOT NULL,
  actor VARCHAR(255) NOT NULL DEFAULT 'system',
  success BOOLEAN NOT NULL DEFAULT TRUE,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sftp_audit_tenant ON action_audit(tenant_id, created_at DESC);
