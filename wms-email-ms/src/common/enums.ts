export enum TenantStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum MailStatus {
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
  SUPPRESSED = 'suppressed',
  CANCELLED = 'cancelled',
}

export enum MailPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

export enum JobQueue {
  SEND_MAIL = 'email.send',
  MAIL_TICK = 'email.tick',
}

export enum AuditAction {
  ENQUEUE = 'enqueue',
  SEND_OK = 'send_ok',
  SEND_FAIL = 'send_fail',
  SUPPRESSED = 'suppressed',
  TEMPLATE_UPSERT = 'template_upsert',
  SMTP_UPSERT = 'smtp_upsert',
  SUPPRESSION_ADD = 'suppression_add',
  SUPPRESSION_REMOVE = 'suppression_remove',
}
