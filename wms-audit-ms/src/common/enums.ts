export enum TenantStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum AuditEntryType {
  ORDER_FLOW = 'order_flow',
  SFTP_DELIVERY = 'sftp_delivery',
  SHOPIFY_API = 'shopify_api',
  NOTIFICATION = 'notification',
  AUTH = 'auth',
  ADMIN = 'admin',
  SYSTEM = 'system',
  OTHER = 'other',
}

export const ALLOWED_ENTRY_TYPES = new Set<string>(Object.values(AuditEntryType));

export function normalizeEntryType(type?: string): string {
  if (!type) return AuditEntryType.OTHER;
  if (ALLOWED_ENTRY_TYPES.has(type)) return type;
  // allow custom types that look safe
  const cleaned = String(type).trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '_');
  return cleaned.slice(0, 64) || AuditEntryType.OTHER;
}
