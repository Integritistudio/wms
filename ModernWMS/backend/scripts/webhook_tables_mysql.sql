-- ModernWMS inventory webhook tables (MySQL)
-- Run once against the ModernWMS database before enabling webhooks.

CREATE TABLE IF NOT EXISTS `webhook_subscription` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT NOT NULL DEFAULT 1,
  `callback_url` VARCHAR(512) NOT NULL,
  `secret` VARCHAR(128) NOT NULL,
  `events` VARCHAR(256) NOT NULL DEFAULT 'inventory.quantity_changed',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `create_time` DATETIME NOT NULL,
  `last_update_time` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_callback` (`tenant_id`, `callback_url`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `webhook_outbox` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT NOT NULL DEFAULT 1,
  `sku_id` INT NOT NULL DEFAULT 0,
  `sku_code` VARCHAR(64) NOT NULL DEFAULT '',
  `reason` VARCHAR(64) NOT NULL DEFAULT '',
  `source_doc` VARCHAR(128) NOT NULL DEFAULT '',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `attempts` INT NOT NULL DEFAULT 0,
  `last_error` VARCHAR(1024) NOT NULL DEFAULT '',
  `next_attempt_at` DATETIME NULL,
  `create_time` DATETIME NOT NULL,
  `last_update_time` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_outbox_pending` (`status`, `next_attempt_at`, `tenant_id`, `sku_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
