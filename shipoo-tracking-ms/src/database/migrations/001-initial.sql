CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(128) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS tenant_provider_credentials (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  shippo_api_token_ciphertext TEXT,
  shippo_webhook_id VARCHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracking_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_shipment_id VARCHAR(255) NOT NULL,
  carrier VARCHAR(64) NOT NULL,
  tracking_number VARCHAR(128) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'shippo',
  provider_track_id VARCHAR(128),
  current_status VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  last_provider_status VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}',
  registered_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  reconcile_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, external_shipment_id),
  UNIQUE (tenant_id, carrier, tracking_number)
);
CREATE INDEX IF NOT EXISTS idx_tracking_records_tenant_status ON tracking_records(tenant_id, current_status);
CREATE INDEX IF NOT EXISTS idx_tracking_records_carrier_number ON tracking_records(carrier, tracking_number);

CREATE TABLE IF NOT EXISTS tracking_event_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_record_id UUID NOT NULL REFERENCES tracking_records(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  normalized_status VARCHAR(32) NOT NULL,
  provider_status VARCHAR(64),
  occurred_at TIMESTAMPTZ NOT NULL,
  location VARCHAR(255),
  message TEXT,
  raw JSONB NOT NULL DEFAULT '{}',
  sequence_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tracking_event_history_record ON tracking_event_history(tracking_record_id, occurred_at);

CREATE TABLE IF NOT EXISTS inbound_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_inbound_provider_events_processed ON inbound_provider_events(processed_at);

CREATE TABLE IF NOT EXISTS domain_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tracking_record_id UUID NOT NULL REFERENCES tracking_records(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  correlation_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_domain_events_tenant ON domain_events(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url VARCHAR(2048) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  secret_ciphertext TEXT NOT NULL,
  secret_prefix VARCHAR(8) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_destinations_tenant ON webhook_destinations(tenant_id);

CREATE TABLE IF NOT EXISTS webhook_destination_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID NOT NULL REFERENCES webhook_destinations(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  UNIQUE (destination_id, event_type)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_event_id UUID NOT NULL REFERENCES domain_events(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES webhook_destinations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  last_http_status INT,
  next_retry_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  correlation_id VARCHAR(64),
  pgboss_job_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant ON webhook_deliveries(tenant_id);
