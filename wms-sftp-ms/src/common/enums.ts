export enum TenantStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum TransferDirection {
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
}

export enum TransferStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum EdiDocumentType {
  EDI_940 = '940',
  EDI_945 = '945',
  OTHER = 'other',
}

export enum JobQueue {
  TRANSFER = 'sftp.transfer',
  TRANSFER_TICK = 'sftp.transfer_tick',
  INBOUND_TICK = 'sftp.inbound_tick',
}

export enum AuditAction {
  CONNECTION_UPSERT = 'connection_upsert',
  CONNECTION_TEST = 'connection_test',
  TRANSFER_ENQUEUE = 'transfer_enqueue',
  TRANSFER_OK = 'transfer_ok',
  TRANSFER_FAIL = 'transfer_fail',
  INBOUND_FOUND = 'inbound_found',
  INBOUND_DELIVERED = 'inbound_delivered',
  POLLER_UPSERT = 'poller_upsert',
}
