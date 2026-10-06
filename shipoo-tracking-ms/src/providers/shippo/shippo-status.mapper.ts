import { NormalizedTrackingStatus } from '../../common/enums.js';

const STATUS_MAP: Record<string, NormalizedTrackingStatus> = {
  UNKNOWN: NormalizedTrackingStatus.UNKNOWN,
  PRE_TRANSIT: NormalizedTrackingStatus.PRE_TRANSIT,
  TRANSIT: NormalizedTrackingStatus.IN_TRANSIT,
  IN_TRANSIT: NormalizedTrackingStatus.IN_TRANSIT,
  DELIVERED: NormalizedTrackingStatus.DELIVERED,
  RETURNED: NormalizedTrackingStatus.RETURNED,
  FAILURE: NormalizedTrackingStatus.FAILURE,
  UNKNOWN_DELIVERY: NormalizedTrackingStatus.EXCEPTION,
};

export function mapShippoStatus(status?: string, substatus?: string): NormalizedTrackingStatus {
  const key = (status ?? '').toUpperCase();
  const sub = (substatus ?? '').toUpperCase();
  if (sub.includes('OUT_FOR_DELIVERY')) {
    return NormalizedTrackingStatus.OUT_FOR_DELIVERY;
  }
  if (sub.includes('DELIVERY_ATTEMPTED')) {
    return NormalizedTrackingStatus.DELIVERY_ATTEMPTED;
  }
  if (sub.includes('CANCEL')) {
    return NormalizedTrackingStatus.CANCELLED;
  }
  if (sub.includes('EXCEPTION')) {
    return NormalizedTrackingStatus.EXCEPTION;
  }
  return STATUS_MAP[key] ?? NormalizedTrackingStatus.UNKNOWN;
}
