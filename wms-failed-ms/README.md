# WMS Failed Orders Microservice (`wms-failed-ms`)

Dead-letter queue for failed WMS orders: ingest, triage (retry / reassign / skip), **auto-retry with exponential backoff**, alerts, audit trail, and metrics.

## Stack

- NestJS 12 (ESM), TypeScript, PostgreSQL, **pg-boss** (async jobs)
- REST + OpenAPI at `/docs`
- Separate **API** and **worker** processes
- Own database `failed_ms` (default port **8714**)

## Architecture

`wms-app-backend` remains the BFF. The Failed Orders UI still calls `/company/failed-orders*`. Linker proxies to this service and exposes `/api/internal/failed-ms/execute` so the MS can run retry/reassign against real order allocation.

```
UI → Linker /company/failed-orders* → wms-failed-ms
Producers (fulfillment/orders) → failedOrderService.create → MS ingest
MS auto-retry worker → Linker /internal/failed-ms/execute → allocateOrder
```

## Quick start

1. Copy `.env.example` → `.env` and set secrets.
2. Start stack:

```bash
docker compose up --build
```

Services: `postgres` (:8715→5432), `api` (:8714), `worker`.

Or locally:

```bash
npm install
# start Postgres (compose postgres only), then:
set RUN_MIGRATIONS=true
npm run start:dev
# other terminal
npm run start:worker:dev
```

Health:

- `GET /health/live`
- `GET /health/ready`
- Swagger: `/docs`

## Auth

| Caller | Auth |
|--------|------|
| Tenant API | `Authorization: Bearer wms_fail_…` |
| Admin / Linker BFF | `Authorization: Bearer <ADMIN_API_SECRET>` on `/v1/admin/*` |
| Linker callback | Header `X-Failed-Ms-Secret: <FAILED_MS_CALLBACK_SECRET>` |

Create a tenant:

```http
POST /v1/admin/tenants
Authorization: Bearer <ADMIN_API_SECRET>
Content-Type: application/json

{ "name": "Acme", "slug": "acme", "externalCompanyId": "<mongoCompanyId>" }
```

Linker usually uses admin routes with `companyId` query/body and auto-`ensure`s the tenant.

## Main API groups

| Area | Prefix |
|------|--------|
| Failures (tenant) | `/v1/failures` |
| Failures (admin/BFF) | `/v1/admin/failures` |
| Retry policies | `/v1/retry-policies` |
| Alert rules | `/v1/alert-rules` |
| Metrics | `/v1/admin/metrics/summary` |
| Tenants | `/v1/admin/tenants` |
| Health | `/health/live`, `/health/ready` |

### Actions

- `POST /v1/failures` — ingest / bump open item
- `POST .../retry` | `.../reassign` | `.../skip` | `.../note`
- `POST /v1/failures/bulk` — `{ action: "retry"|"skip", ids: [] }`
- Auto-retry worker picks due items (`next_retry_at`) for retryable reasons

## Linker env

In `wms-app-backend`:

```
FAILED_MS_BASE_URL=http://127.0.0.1:8714
FAILED_MS_ADMIN_SECRET=<same as ADMIN_API_SECRET here>
FAILED_MS_CALLBACK_SECRET=<shared with this service>
```

In `wms-failed-ms`:

```
WMS_LINKER_BASE_URL=http://127.0.0.1:3000
FAILED_MS_CALLBACK_SECRET=<same>
ADMIN_API_SECRET=<same as FAILED_MS_ADMIN_SECRET>
```

When `FAILED_MS_BASE_URL` is empty, Linker falls back to the Mongo `failed_orders` collection.

## Migrate open Mongo DLQ rows

```bash
cd wms-app-backend
node scripts/migrate-dlq-to-failed-ms.js
```

## Cloudflare Tunnel

Point a hostname (e.g. `failed.integritistudio.us`) at `http://127.0.0.1:8714` in `/etc/cloudflared/config.yml` (use key `hostname`, not a typo), then restart `cloudflared`.

## Tests

```bash
npm run lint
npm run test
```
