export enum NormalizedTrackingStatus {
  UNKNOWN = 'UNKNOWN',
  PRE_TRANSIT = 'PRE_TRANSIT',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  DELIVERY_ATTEMPTED = 'DELIVERY_ATTEMPTED',
  EXCEPTION = 'EXCEPTION',
  FAILURE = 'FAILURE',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

export const TERMINAL_TRACKING_STATUSES: NormalizedTrackingStatus[] = [
  NormalizedTrackingStatus.DELIVERED,
  NormalizedTrackingStatus.RETURNED,
  NormalizedTrackingStatus.CANCELLED,
  NormalizedTrackingStatus.FAILURE,
];

export enum DomainEventType {
  TRACKING_REGISTERED = 'tracking.registered',
  TRACKING_UPDATED = 'tracking.updated',
  TRACKING_IN_TRANSIT = 'tracking.in_transit',
  TRACKING_OUT_FOR_DELIVERY = 'tracking.out_for_delivery',
  TRACKING_DELIVERED = 'tracking.delivered',
  TRACKING_EXCEPTION = 'tracking.exception',
  TRACKING_RETURNED = 'tracking.returned',
}

export enum WebhookDeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  DEAD = 'dead',
}

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export enum TrackingProviderName {
  SHIPPO = 'shippo',
}

export enum JobQueue {
  INBOUND_TRACKING_PROCESS = 'inbound.tracking.process',
  OUTBOUND_WEBHOOK_DELIVER = 'outbound.webhook.deliver',
  TRACKING_REGISTER = 'tracking.register',
  TRACKING_RECONCILE = 'tracking.reconcile',
}
