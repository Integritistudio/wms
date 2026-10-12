export enum TenantStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum NotificationType {
  ORDER_RECEIVED = 'order_received',
  ORDER_FULFILLED = 'order_fulfilled',
  ORDER_ERROR = 'order_error',
  SFTP_FAILED = 'sftp_failed',
  EDI_945_RECEIVED = '945_received',
  DLQ_ENTRY = 'dlq_entry',
  INVENTORY_REVERTED = 'inventory_reverted',
  SYSTEM = 'system',
}

export enum DevicePlatform {
  WEB = 'web',
  ANDROID = 'android',
  IOS = 'ios',
  FCM = 'fcm',
}

export enum PushStatus {
  NONE = 'none',
  QUEUED = 'queued',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum DeliveryStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum JobQueue {
  PUSH = 'notify.push',
  PUSH_TICK = 'notify.push_tick',
  PURGE_TICK = 'notify.purge_tick',
}

export enum AuditAction {
  NOTIFICATION_CREATE = 'notification_create',
  NOTIFICATION_READ = 'notification_read',
  NOTIFICATION_READ_ALL = 'notification_read_all',
  DEVICE_UPSERT = 'device_upsert',
  DEVICE_DISABLE = 'device_disable',
  PREFS_UPSERT = 'prefs_upsert',
  PUSH_OK = 'push_ok',
  PUSH_FAIL = 'push_fail',
}

export const ALLOWED_NOTIFICATION_TYPES = new Set<string>(
  Object.values(NotificationType),
);

export function normalizeNotificationType(type?: string): NotificationType {
  if (type && ALLOWED_NOTIFICATION_TYPES.has(type)) {
    return type as NotificationType;
  }
  return NotificationType.SYSTEM;
}
