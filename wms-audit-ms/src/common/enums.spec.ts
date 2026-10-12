import { AuditEntryType, normalizeEntryType } from './enums.js';

describe('normalizeEntryType', () => {
  it('keeps known types', () => {
    expect(normalizeEntryType('order_flow')).toBe(AuditEntryType.ORDER_FLOW);
    expect(normalizeEntryType('sftp_delivery')).toBe(AuditEntryType.SFTP_DELIVERY);
  });

  it('sanitizes custom types', () => {
    expect(normalizeEntryType('Custom Event!')).toBe('custom_event_');
    expect(normalizeEntryType(undefined)).toBe(AuditEntryType.OTHER);
  });
});
