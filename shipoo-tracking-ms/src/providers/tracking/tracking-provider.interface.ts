import { NormalizedTrackingStatus } from '../../common/enums.js';

export interface ProviderRegisterInput {
  tenantId: string;
  trackingRecordId: string;
  carrier: string;
  trackingNumber: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

export interface ProviderRegistrationResult {
  providerTrackId?: string;
  raw: Record<string, unknown>;
}

export interface ProviderTrackingCheckpoint {
  occurredAt: Date;
  providerStatus: string;
  normalizedStatus: NormalizedTrackingStatus;
  location?: string;
  message?: string;
  sequenceKey: string;
  raw: Record<string, unknown>;
}

export interface ProviderTrackingSnapshot {
  providerTrackId?: string;
  providerStatus?: string;
  normalizedStatus: NormalizedTrackingStatus;
  checkpoints: ProviderTrackingCheckpoint[];
  raw: Record<string, unknown>;
}

export interface ProviderInboundEvent {
  carrier: string;
  trackingNumber: string;
  providerStatus?: string;
  normalizedStatus: NormalizedTrackingStatus;
  occurredAt: Date;
  location?: string;
  message?: string;
  sequenceKey: string;
  idempotencyKey: string;
  raw: Record<string, unknown>;
}

export interface TrackingProvider {
  readonly name: string;
  registerTracking(input: ProviderRegisterInput): Promise<ProviderRegistrationResult>;
  getTrackingStatus(
    carrier: string,
    trackingNumber: string,
    tenantId: string,
  ): Promise<ProviderTrackingSnapshot>;
  parseInboundWebhook(
    payload: Record<string, unknown>,
  ): ProviderInboundEvent;
}

export const TRACKING_PROVIDER = Symbol('TRACKING_PROVIDER');
