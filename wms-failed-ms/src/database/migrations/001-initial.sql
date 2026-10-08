CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  external_company_id VARCHAR(64) NOT NULL UNIQUE,
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
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_prefix ON tenant_api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS failed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_order_id VARCHAR(64) NOT NULL,
  external_shop_id VARCHAR(64) NOT NULL,
  external_company_id VARCHAR(64) NOT NULL,
  external_warehouse_id VARCHAR(64),
  reason VARCHAR(64) NOT NULL,
  error_message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INT NOT NULL DEFAULT 1,
  max_attempts INT NOT NULL DEFAULT 5,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  resolution VARCHAR(32),
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(255) NOT NULL DEFAULT '',
  auto_retry_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_retry_at TIMESTAMPTZ,
  last_retry_at TIMESTAMPTZ,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_failed_items_tenant_status ON failed_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_failed_items_next_retry ON failed_items(next_retry_at) WHERE status = 'open' AND auto_retry_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_failed_items_order ON failed_items(external_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_failed_items_open_order
  ON failed_items(tenant_id, external_order_id)
  WHERE status IN ('open', 'retrying');

CREATE TABLE IF NOT EXISTS retry_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  max_attempts INT NOT NULL DEFAULT 5,
  base_delay_seconds INT NOT NULL DEFAULT 30,
  max_delay_seconds INT NOT NULL DEFAULT 900,
  multiplier NUMERIC(6,2) NOT NULL DEFAULT 2,
  jitter BOOLEAN NOT NULL DEFAULT TRUE,
  retryable_reasons TEXT[] NOT NULL DEFAULT ARRAY[
    'SFTP_ERROR','SHOPIFY_ERROR','MODERNWMS_ERROR','MAPPING_EXCEPTION','ROUTING_NO_MATCH'
  ],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  failed_item_id UUID REFERENCES failed_items(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  actor VARCHAR(255) NOT NULL DEFAULT 'system',
  success BOOLEAN NOT NULL DEFAULT TRUE,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_audit_item ON action_audit(failed_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_audit_tenant ON action_audit(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  depth_threshold INT NOT NULL DEFAULT 5,
  age_threshold_minutes INT NOT NULL DEFAULT 0,
  cooldown_seconds INT NOT NULL DEFAULT 300,
  webhook_url TEXT,
  email_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  open_count INT NOT NULL,
  channel VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_events_tenant ON alert_events(tenant_id, created_at DESC);
