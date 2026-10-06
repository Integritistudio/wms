import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TrackingProviderName } from '../../common/enums.js';
import {
  ProviderInboundEvent,
  ProviderRegisterInput,
  ProviderRegistrationResult,
  ProviderTrackingCheckpoint,
  ProviderTrackingSnapshot,
  TrackingProvider,
} from '../tracking/tracking-provider.interface.js';
import { ShippoHttpClient } from './shippo-http.client.js';
import { mapShippoStatus } from './shippo-status.mapper.js';

interface ShippoTrackResponse {
  tracking_number?: string;
  carrier?: string;
  tracking_status?: {
    status?: string;
    status_details?: string;
    status_date?: string;
    location?: { city?: string; state?: string; country?: string };
    substatus?: { code?: string; text?: string };
  };
  tracking_history?: Array<{
    status?: string;
    status_details?: string;
    status_date?: string;
    location?: { city?: string; state?: string; country?: string };
    object_id?: string;
    substatus?: { code?: string; text?: string };
  }>;
  object_id?: string;
}

@Injectable()
export class ShippoTrackingProvider implements TrackingProvider {
  readonly name = TrackingProviderName.SHIPPO;

  constructor(private readonly http: ShippoHttpClient) {}

  async registerTracking(
    input: ProviderRegisterInput,
  ): Promise<ProviderRegistrationResult> {
    const metadata = JSON.stringify({
      tenantId: input.tenantId,
      trackingRecordId: input.trackingRecordId,
      correlationId: input.correlationId,
      ...(input.metadata ?? {}),
    });
    const raw = await this.http.request<ShippoTrackResponse>(
      input.tenantId,
      '/tracks/',
      {
        method: 'POST',
        body: JSON.stringify({
          carrier: input.carrier,
          tracking_number: input.trackingNumber,
          metadata,
        }),
      },
    );
    return {
      providerTrackId: raw.object_id,
      raw: raw as unknown as Record<string, unknown>,
    };
  }

  async getTrackingStatus(
    carrier: string,
    trackingNumber: string,
    tenantId: string,
  ): Promise<ProviderTrackingSnapshot> {
    const encodedCarrier = encodeURIComponent(carrier);
    const encodedNumber = encodeURIComponent(trackingNumber);
    const raw = await this.http.request<ShippoTrackResponse>(
      tenantId,
      `/tracks/${encodedCarrier}/${encodedNumber}/`,
      { method: 'GET' },
    );
    return this.toSnapshot(raw);
  }

  parseInboundWebhook(payload: Record<string, unknown>): ProviderInboundEvent {
    const data = (payload.data ?? payload) as ShippoTrackResponse;
    const status = data.tracking_status;
    const providerStatus = status?.status ?? 'UNKNOWN';
    const sub = status?.substatus?.code ?? status?.substatus?.text;
    const normalizedStatus = mapShippoStatus(providerStatus, sub);
    const occurredAt = status?.status_date
      ? new Date(status.status_date)
      : new Date();
    const locationParts = [
      status?.location?.city,
      status?.location?.state,
      status?.location?.country,
    ].filter(Boolean);
    const sequenceKey =
      (status as { object_id?: string })?.object_id ??
      `${providerStatus}:${occurredAt.toISOString()}`;
    const idempotencyKey = createHash('sha256')
      .update(
        `${data.carrier}:${data.tracking_number}:${providerStatus}:${occurredAt.toISOString()}:${sequenceKey}`,
      )
      .digest('hex');
    return {
      carrier: (data.carrier ?? '').toLowerCase(),
      trackingNumber: data.tracking_number ?? '',
      providerStatus,
      normalizedStatus,
      occurredAt,
      location: locationParts.join(', ') || undefined,
      message: status?.status_details,
      sequenceKey,
      idempotencyKey,
      raw: payload,
    };
  }

  private toSnapshot(raw: ShippoTrackResponse): ProviderTrackingSnapshot {
    const providerStatus = raw.tracking_status?.status;
    const sub =
      raw.tracking_status?.substatus?.code ??
      raw.tracking_status?.substatus?.text;
    const normalizedStatus = mapShippoStatus(providerStatus, sub);
    const checkpoints: ProviderTrackingCheckpoint[] = (
      raw.tracking_history ?? []
    ).map((item, index) => {
      const occurredAt = item.status_date
        ? new Date(item.status_date)
        : new Date();
      const loc = [item.location?.city, item.location?.state, item.location?.country]
        .filter(Boolean)
        .join(', ');
      const pStatus = item.status ?? 'UNKNOWN';
      const nStatus = mapShippoStatus(
        pStatus,
        item.substatus?.code ?? item.substatus?.text,
      );
      return {
        occurredAt,
        providerStatus: pStatus,
        normalizedStatus: nStatus,
        location: loc || undefined,
        message: item.status_details,
        sequenceKey: item.object_id ?? `${pStatus}:${occurredAt.toISOString()}:${index}`,
        raw: item as unknown as Record<string, unknown>,
      };
    });
    return {
      providerTrackId: raw.object_id,
      providerStatus,
      normalizedStatus,
      checkpoints,
      raw: raw as unknown as Record<string, unknown>,
    };
  }
}
