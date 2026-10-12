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
CREATE INDEX IF NOT EXISTS idx_notify_api_keys_prefix ON tenant_api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_user_id VARCHAR(64),
  type VARCHAR(64) NOT NULL DEFAULT 'system',
  title VARCHAR(512) NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  push_status VARCHAR(32) NOT NULL DEFAULT 'none',
  push_attempts INT NOT NULL DEFAULT 0,
  push_last_error TEXT,
  idempotency_key VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notify_tenant_created ON notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notify_tenant_unread ON notifications(tenant_id, read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notify_idempotency
  ON notifications(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_user_id VARCHAR(64),
  platform VARCHAR(32) NOT NULL,
  token TEXT NOT NULL,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT,
  label VARCHAR(128),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, token)
);
CREATE INDEX IF NOT EXISTS idx_notify_devices_tenant ON devices(tenant_id, enabled);

CREATE TABLE IF NOT EXISTS preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_user_id VARCHAR(64),
  notification_type VARCHAR(64) NOT NULL,
  in_app BOOLEAN NOT NULL DEFAULT TRUE,
  push BOOLEAN NOT NULL DEFAULT TRUE,
  email BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notify_prefs_unique
  ON preferences(tenant_id, COALESCE(external_user_id, ''), notification_type);

CREATE TABLE IF NOT EXISTS push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_queued
  ON push_deliveries(status, scheduled_at);

CREATE TABLE IF NOT EXISTS action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  notification_id UUID,
  action VARCHAR(64) NOT NULL,
  actor VARCHAR(255) NOT NULL DEFAULT 'system',
  success BOOLEAN NOT NULL DEFAULT TRUE,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notify_audit_tenant ON action_audit(tenant_id, created_at DESC);
