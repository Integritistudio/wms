export enum TenantStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum FailureReason {
  HMAC_FAIL = 'HMAC_FAIL',
  MAPPING_EXCEPTION = 'MAPPING_EXCEPTION',
  SFTP_ERROR = 'SFTP_ERROR',
  SHOPIFY_ERROR = 'SHOPIFY_ERROR',
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  ROUTING_NO_MATCH = 'ROUTING_NO_MATCH',
  MODERNWMS_ERROR = 'MODERNWMS_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export enum FailureStatus {
  OPEN = 'open',
  RETRYING = 'retrying',
  RESOLVED = 'resolved',
  DISCARDED = 'discarded',
}

export enum FailureResolution {
  RETRIED = 'retried',
  REASSIGNED = 'reassigned',
  SKIPPED = 'skipped',
  AUTO_RETRIED = 'auto_retried',
  EXPIRED = 'expired',
}

export enum AuditAction {
  INGEST = 'ingest',
  MANUAL_RETRY = 'manual_retry',
  AUTO_RETRY = 'auto_retry',
  REASSIGN = 'reassign',
  SKIP = 'skip',
  NOTE = 'note',
  BULK_RETRY = 'bulk_retry',
  BULK_SKIP = 'bulk_skip',
  ACK_SUCCESS = 'ack_success',
  ACK_FAILURE = 'ack_failure',
  EXPIRE = 'expire',
  POLICY_UPDATE = 'policy_update',
  ALERT_UPDATE = 'alert_update',
}

export enum JobQueue {
  EXECUTE_ACTION = 'failed.execute_action',
  AUTO_RETRY_TICK = 'failed.auto_retry_tick',
  ALERT_TICK = 'failed.alert_tick',
  STALE_SWEEP_TICK = 'failed.stale_sweep_tick',
}

export const DEFAULT_RETRYABLE_REASONS: FailureReason[] = [
  FailureReason.SFTP_ERROR,
  FailureReason.SHOPIFY_ERROR,
  FailureReason.MODERNWMS_ERROR,
  FailureReason.MAPPING_EXCEPTION,
  FailureReason.ROUTING_NO_MATCH,
];
