import { describe, expect, it } from 'vitest';
import { NormalizedTrackingStatus } from '../../common/enums.js';
import { mapShippoStatus } from './shippo-status.mapper.js';

describe('mapShippoStatus', () => {
  it('maps transit statuses', () => {
    expect(mapShippoStatus('TRANSIT')).toBe(NormalizedTrackingStatus.IN_TRANSIT);
  });

  it('maps substatus out for delivery', () => {
    expect(mapShippoStatus('TRANSIT', 'out_for_delivery')).toBe(
      NormalizedTrackingStatus.OUT_FOR_DELIVERY,
    );
  });

  it('maps unknown provider values to UNKNOWN', () => {
    expect(mapShippoStatus('SOMETHING_NEW')).toBe(NormalizedTrackingStatus.UNKNOWN);
  });
});
