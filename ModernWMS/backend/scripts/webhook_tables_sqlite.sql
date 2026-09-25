-- ModernWMS inventory webhook tables (SQLite)
-- Run once against wms.db if using SQLite.

CREATE TABLE IF NOT EXISTS webhook_subscription (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  callback_url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT 'inventory.quantity_changed',
  enabled INTEGER NOT NULL DEFAULT 1,
  create_time TEXT NOT NULL,
  last_update_time TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_tenant_callback
  ON webhook_subscription (tenant_id, callback_url);

CREATE TABLE IF NOT EXISTS webhook_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  sku_id INTEGER NOT NULL DEFAULT 0,
  sku_code TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  source_doc TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  next_attempt_at TEXT NULL,
  create_time TEXT NOT NULL,
  last_update_time TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_outbox_pending
  ON webhook_outbox (status, next_attempt_at, tenant_id, sku_id);
