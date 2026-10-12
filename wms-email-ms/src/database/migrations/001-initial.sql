CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  external_company_id VARCHAR(64) UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  daily_quota INT NOT NULL DEFAULT 2000,
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
CREATE INDEX IF NOT EXISTS idx_email_api_keys_prefix ON tenant_api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS smtp_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL DEFAULT 587,
  secure BOOLEAN NOT NULL DEFAULT FALSE,
  username_ciphertext TEXT,
  password_ciphertext TEXT,
  from_address VARCHAR(320) NOT NULL,
  from_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  subject_template TEXT NOT NULL,
  text_template TEXT NOT NULL DEFAULT '',
  html_template TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(128),
  template_key VARCHAR(100),
  to_addresses TEXT[] NOT NULL,
  cc_addresses TEXT[] NOT NULL DEFAULT '{}',
  bcc_addresses TEXT[] NOT NULL DEFAULT '{}',
  reply_to VARCHAR(320),
  subject VARCHAR(998) NOT NULL,
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority VARCHAR(16) NOT NULL DEFAULT 'normal',
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  provider_message_id VARCHAR(255),
  last_error TEXT NOT NULL DEFAULT '',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_messages_tenant_status ON email_messages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_email_messages_scheduled ON email_messages(scheduled_at) WHERE status = 'queued';
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_idempotency
  ON email_messages(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  reason VARCHAR(64) NOT NULL DEFAULT 'manual',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  message_id UUID REFERENCES email_messages(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  actor VARCHAR(255) NOT NULL DEFAULT 'system',
  success BOOLEAN NOT NULL DEFAULT TRUE,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_audit_tenant ON action_audit(tenant_id, created_at DESC);
