import { NotificationType, normalizeNotificationType } from './enums.js';

describe('normalizeNotificationType', () => {
  it('keeps known types', () => {
    expect(normalizeNotificationType('order_error')).toBe(
      NotificationType.ORDER_ERROR,
    );
    expect(normalizeNotificationType('dlq_entry')).toBe(NotificationType.DLQ_ENTRY);
  });

  it('falls back to system', () => {
    expect(normalizeNotificationType('nope')).toBe(NotificationType.SYSTEM);
    expect(normalizeNotificationType(undefined)).toBe(NotificationType.SYSTEM);
  });
});
