# WMS Carrier Tracking Microservice (`shipoo-tracking-ms`)

Multi-tenant shipment tracking service for the WMS Linker platform. Registers **existing** carrier tracking numbers (via Shippo Tracking API), normalizes status updates, accepts Shippo `track_updated` webhooks, and delivers signed outbound webhooks to tenant-configured destinations.

## Stack

- NestJS 12 (ESM), TypeScript, PostgreSQL, **pg-boss** (async jobs)
- REST + OpenAPI at `/docs`
- Separate **API** and **worker** processes

## Quick start (local)

1. Copy [`.env.example`](.env.example) to `.env` and set `ENCRYPTION_KEY`, `ADMIN_API_SECRET`, and `SHIPPO_PLATFORM_API_TOKEN`.
2. Start Postgres: `docker compose up postgres -d`
3. Install and run migrations + API:

```bash
npm install
npm run build
set RUN_MIGRATIONS=true
npm run start:dev
```

4. In another terminal, run the worker:

```bash
npm run start:worker:dev
```

## Docker Compose (full stack)

```bash
docker compose up --build
```

Services: `postgres`, `api` (:8181), `worker`, `webhook-receiver` (:9090).

## Authentication

- **Tenants:** `Authorization: Bearer <api_secret>` (prefix `wms_trk_…`)
- **Admin:** `Authorization: Bearer <ADMIN_API_SECRET>` for `/v1/admin/*`

Create a tenant:

```http
POST /v1/admin/tenants
Authorization: Bearer <ADMIN_API_SECRET>
Content-Type: application/json

{ "name": "Acme WMS", "slug": "acme" }
```

The response includes a one-time API key.

## Main API groups

| Area | Prefix |
|------|--------|
| Tracking | `/v1/tracking` |
| Webhook destinations | `/v1/webhook-destinations` |
| Shippo inbound | `/v1/webhooks/shippo/track-updated` |
| Admin | `/v1/admin` |
| Health | `/health/live`, `/health/ready` |

## Tests

```bash
npm run lint
npm run test
npm run test:e2e
# Full API flow (Postgres required; Shippo HTTP mocked):
npm run test:e2e:flow
```

`test:e2e:flow` covers tenant create → tracking register/idempotency → isolation → 3 outbound destinations (A/C succeed, B fails) → Shippo inbound webhook → dedupe → out-of-order events → HMAC verify → refresh → admin failed deliveries. It boots API + workers in-process and allows `127.0.0.1` webhook receivers via `OUTBOUND_WEBHOOK_ALLOW_PRIVATE=true` (set only in e2e setup).

Shippo HTTP calls are not required for unit/e2e flow tests; fixtures live under `test/fixtures/shippo/`.

## Architecture notes

- **TrackingProvider** abstraction (`src/providers/tracking/`) — Shippo is the default implementation.
- Inbound webhooks ACK quickly after dedupe + pg-boss enqueue.
- Each outbound domain event creates **independent** delivery jobs per matching destination.
- Reconciliation worker polls stale non-terminal shipments on a schedule.
