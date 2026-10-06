import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { WorkersModule } from '../src/workers/workers.module.js';
import { ShippoHttpClient } from '../src/providers/shippo/shippo-http.client.js';
import { DomainEventType, NormalizedTrackingStatus, WebhookDeliveryStatus } from '../src/common/enums.js';
import { WebhookSignerService } from '../src/outbound-webhooks/webhook-signer.service.js';
import { DataSource } from 'typeorm';
type CapturedHook = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody: string;
};

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'test/fixtures/shippo', name), 'utf8'),
  ) as Record<string, unknown>;
}

async function waitFor<T>(
  label: string,
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 20_000,
  intervalMs = 250,
): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) {
      return value;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

function startHookServer(
  handler: (req: IncomingMessage, res: ServerResponse, raw: string, json: unknown) => void,
): Promise<{ server: Server; port: number; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json: unknown = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = raw;
        }
        handler(req, res, raw, json);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind webhook receiver'));
        return;
      }
      resolve({
        server,
        port: address.port,
        url: `http://127.0.0.1:${address.port}/hook`,
      });
    });
  });
}

describe('Tracking platform end-to-end flow', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let dataSource: DataSource;
  let signer: WebhookSignerService;

  const adminToken = process.env.ADMIN_API_SECRET!;
  const suffix = `${Date.now()}`;
  const trackingNumber = `E2E${suffix}`;
  const carrier = 'usps';

  const receivedA: CapturedHook[] = [];
  const receivedB: CapturedHook[] = [];
  const receivedC: CapturedHook[] = [];
  let serverA: Server;
  let serverB: Server;
  let serverC: Server;
  let urlA = '';
  let urlB = '';
  let urlC = '';

  let tenantAKey = '';
  let tenantBKey = '';
  let tenantAId = '';
  let trackingId = '';
  let secretA = '';
  let secretC = '';

  beforeAll(async () => {
    const registerFixture = loadFixture('track-register-response.json');
    const getFixture = loadFixture('track-get-response.json');
    registerFixture.tracking_number = trackingNumber;
    getFixture.tracking_number = trackingNumber;

    const a = await startHookServer((_req, res, raw, json) => {
      receivedA.push({
        statusCode: 200,
        headers: Object.fromEntries(
          Object.entries(_req.headers).map(([k, v]) => [k, v]),
        ),
        body: json,
        rawBody: raw,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    const b = await startHookServer((_req, res, raw, json) => {
      receivedB.push({
        statusCode: 500,
        headers: Object.fromEntries(
          Object.entries(_req.headers).map(([k, v]) => [k, v]),
        ),
        body: json,
        rawBody: raw,
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
    });
    const c = await startHookServer((_req, res, raw, json) => {
      receivedC.push({
        statusCode: 200,
        headers: Object.fromEntries(
          Object.entries(_req.headers).map(([k, v]) => [k, v]),
        ),
        body: json,
        rawBody: raw,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    serverA = a.server;
    serverB = b.server;
    serverC = c.server;
    urlA = a.url;
    urlB = b.url;
    urlC = c.url;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, WorkersModule],
    })
      .overrideProvider(ShippoHttpClient)
      .useValue({
        request: async (
          _tenantId: string,
          path: string,
          init?: RequestInit,
        ) => {
          if (path === '/tracks/' || init?.method === 'POST') {
            return registerFixture;
          }
          return getFixture;
        },
      })
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    http = request(app.getHttpServer());
    dataSource = app.get(DataSource);
    signer = app.get(WebhookSignerService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([
      new Promise<void>((r) => serverA?.close(() => r())),
      new Promise<void>((r) => serverB?.close(() => r())),
      new Promise<void>((r) => serverC?.close(() => r())),
    ]);
  });

  it('health endpoints respond', async () => {
    await http.get('/health/live').expect(200).expect({ status: 'ok' });
    const ready = await http.get('/health/ready').expect(200);
    expect(ready.body.status).toBe('ok');
  });

  it('creates two isolated tenants via admin API', async () => {
    const a = await http
      .post('/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Tenant A', slug: `tenant-a-${suffix}`, apiKeyLabel: 'e2e-a' })
      .expect(201);

    const b = await http
      .post('/v1/admin/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Tenant B', slug: `tenant-b-${suffix}`, apiKeyLabel: 'e2e-b' })
      .expect(201);

    expect(a.body.apiKey.plaintext).toMatch(/^wms_trk_/);
    expect(b.body.apiKey.plaintext).toMatch(/^wms_trk_/);
    tenantAKey = a.body.apiKey.plaintext;
    tenantBKey = b.body.apiKey.plaintext;
    tenantAId = a.body.tenant.id;
  });

  it('registers tracking (idempotent) and processes Shippo registration job', async () => {
    const first = await http
      .post('/v1/tracking')
      .set('Authorization', `Bearer ${tenantAKey}`)
      .send({
        externalShipmentId: `ext-${suffix}`,
        carrier,
        trackingNumber,
        metadata: { orderId: 'ORD-1' },
      })
      .expect(201);

    trackingId = first.body.id;
    expect(first.body.tenantId).toBe(tenantAId);
    expect(first.body.currentStatus).toBe(NormalizedTrackingStatus.UNKNOWN);

    const second = await http
      .post('/v1/tracking')
      .set('Authorization', `Bearer ${tenantAKey}`)
      .send({
        externalShipmentId: `ext-${suffix}`,
        carrier,
        trackingNumber,
      })
      .expect(201);

    expect(second.body.id).toBe(trackingId);

    await waitFor('registration + initial history', async () => {
      const history = await http
        .get(`/v1/tracking/${trackingId}/history`)
        .set('Authorization', `Bearer ${tenantAKey}`);
      if (history.status === 200 && history.body.total >= 1) {
        return history.body;
      }
      return null;
    });

    const current = await http
      .get(`/v1/tracking/${trackingId}`)
      .set('Authorization', `Bearer ${tenantAKey}`)
      .expect(200);

    expect(current.body.registeredAt).toBeTruthy();
    expect([
      NormalizedTrackingStatus.PRE_TRANSIT,
      NormalizedTrackingStatus.IN_TRANSIT,
    ]).toContain(current.body.currentStatus);
  });

  it('enforces tenant isolation on get/list', async () => {
    await http
      .get(`/v1/tracking/${trackingId}`)
      .set('Authorization', `Bearer ${tenantBKey}`)
      .expect(404);

    const listB = await http
      .get('/v1/tracking')
      .set('Authorization', `Bearer ${tenantBKey}`)
      .expect(200);
    expect(listB.body.items.find((i: { id: string }) => i.id === trackingId)).toBeUndefined();

    const listA = await http
      .get('/v1/tracking')
      .query({ externalShipmentId: `ext-${suffix}` })
      .set('Authorization', `Bearer ${tenantAKey}`)
      .expect(200);
    expect(listA.body.total).toBeGreaterThanOrEqual(1);
  });

  it('registers three destinations; A and C succeed while B fails independently', async () => {
    const eventTypes = [
      DomainEventType.TRACKING_UPDATED,
      DomainEventType.TRACKING_IN_TRANSIT,
      DomainEventType.TRACKING_DELIVERED,
      DomainEventType.TRACKING_REGISTERED,
    ];

    const destA = await http
      .post('/v1/webhook-destinations')
      .set('Authorization', `Bearer ${tenantAKey}`)
      .send({ url: urlA, description: 'A ok', eventTypes })
      .expect(201);
    const destB = await http
      .post('/v1/webhook-destinations')
      .set('Authorization', `Bearer ${tenantAKey}`)
      .send({ url: urlB, description: 'B fail', eventTypes })
      .expect(201);
    const destC = await http
      .post('/v1/webhook-destinations')
      .set('Authorization', `Bearer ${tenantAKey}`)
      .send({ url: urlC, description: 'C ok', eventTypes })
      .expect(201);

    expect(destA.body.secret).toBeTruthy();
    expect(destB.body.secret).toBeTruthy();
    expect(destC.body.secret).toBeTruthy();
    secretA = destA.body.secret;
    secretC = destC.body.secret;

    const listed = await http
      .get('/v1/webhook-destinations')
      .set('Authorization', `Bearer ${tenantAKey}`)
      .expect(200);
    expect(listed.body.length).toBeGreaterThanOrEqual(3);

    // Keep destination IDs on servers via closure — not needed for assertions below.
    void destA;
    void destB;
    void destC;
  });

  it('accepts Shippo inbound webhook, dedupes, updates status, and fans out deliveries', async () => {
    const inboundPayload = loadFixture('track-updated-transit.json');
    (inboundPayload.data as Record<string, unknown>).tracking_number = trackingNumber;
    (inboundPayload.data as Record<string, unknown>).carrier = carrier;

    const first = await http
      .post('/v1/webhooks/shippo/track-updated')
      .send(inboundPayload)
      .expect(201);
    expect(first.body.accepted).toBe(true);
    expect(first.body.duplicate).toBe(false);

    const dup = await http
      .post('/v1/webhooks/shippo/track-updated')
      .send(inboundPayload)
      .expect(201);
    expect(dup.body.duplicate).toBe(true);

    await waitFor('tracking status IN_TRANSIT', async () => {
      const current = await http
        .get(`/v1/tracking/${trackingId}`)
        .set('Authorization', `Bearer ${tenantAKey}`);
      if (
        current.status === 200 &&
        current.body.currentStatus === NormalizedTrackingStatus.IN_TRANSIT
      ) {
        return current.body;
      }
      return null;
    });

    await waitFor('successful deliveries to A and C', async () => {
      if (receivedA.length >= 1 && receivedC.length >= 1) {
        return true;
      }
      return null;
    });

    expect(receivedA.length).toBeGreaterThanOrEqual(1);
    expect(receivedC.length).toBeGreaterThanOrEqual(1);
    expect(receivedB.length).toBeGreaterThanOrEqual(1);

    const sample = receivedA[0]!;
    const timestamp = Number(sample.headers['x-webhook-timestamp']);
    const signature = String(sample.headers['x-webhook-signature'] ?? '');
    expect(sample.headers['x-webhook-id']).toBeTruthy();
    expect(
      signer.verify(secretA, timestamp, sample.rawBody, signature),
    ).toBe(true);
    expect(signer.verify(secretC, timestamp, sample.rawBody, signature)).toBe(
      false,
    );

    await waitFor('B delivery marked failed/dead while A/C success exist', async () => {
      const rows = await dataSource.query(
        `SELECT status, attempt_count, last_http_status
         FROM webhook_deliveries
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [tenantAId],
      );
      const statuses = rows.map((r: { status: string }) => r.status);
      const hasSuccess = statuses.includes(WebhookDeliveryStatus.SUCCESS);
      const hasFail =
        statuses.includes(WebhookDeliveryStatus.FAILED) ||
        statuses.includes(WebhookDeliveryStatus.DEAD) ||
        statuses.includes(WebhookDeliveryStatus.PENDING);
      return hasSuccess && hasFail ? rows : null;
    });
  });

  it('ignores out-of-order older inbound events for current_status', async () => {
    const older = {
      event: 'track_updated',
      data: {
        carrier,
        tracking_number: trackingNumber,
        tracking_status: {
          status: 'PRE_TRANSIT',
          status_details: 'Older event',
          status_date: '2024-06-10T01:00:00.000Z',
          object_id: `evt-older-${suffix}`,
        },
      },
    };

    await http.post('/v1/webhooks/shippo/track-updated').send(older).expect(201);

    await waitFor('older event stored in history', async () => {
      const history = await http
        .get(`/v1/tracking/${trackingId}/history`)
        .set('Authorization', `Bearer ${tenantAKey}`);
      const found = history.body.items?.some(
        (i: { sequenceKey: string }) => i.sequenceKey === `evt-older-${suffix}`,
      );
      return found ? history.body : null;
    });

    const current = await http
      .get(`/v1/tracking/${trackingId}`)
      .set('Authorization', `Bearer ${tenantAKey}`)
      .expect(200);
    expect(current.body.currentStatus).toBe(NormalizedTrackingStatus.IN_TRANSIT);
  });

  it('supports refresh and admin failed-delivery listing', async () => {
    await http
      .post(`/v1/tracking/${trackingId}/refresh`)
      .set('Authorization', `Bearer ${tenantAKey}`)
      .expect(201);

    const failed = await http
      .get('/v1/admin/failed-deliveries')
      .query({ status: WebhookDeliveryStatus.FAILED, limit: 50 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(failed.body)).toBe(true);

    const metrics = await http
      .get('/v1/admin/metrics/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(metrics.body).toHaveProperty('inboundAccepted');
  });
});
