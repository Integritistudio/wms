# WMS Audit / Activity Log Microservice (`wms-audit-ms`)

Append-only **activity / audit logs** with filterable query + retention purge.

## Features

- Append single or bulk entries
- Query by type / order / warehouse / actor / date range
- Order timeline helper (`by-order`)
- Configurable retention (default 30 days)
- Tenant API keys (`wms_audit_…`) + admin secret
- OpenAPI `/docs`, health `/health/live` + `/health/ready`

## Stack

NestJS 12 · TypeORM · PostgreSQL

Default port **8722** · DB **`audit_ms`**

## Quick start

```bash
cp .env.example .env
npm install
npm run ensure-db
npm run build
set RUN_MIGRATIONS=true
npm run start:dev
# optional retention worker
npm run start:worker:dev
```

## Core flow

```http
POST /v1/admin/entries?companyId=…
Authorization: Bearer <ADMIN_API_SECRET>
{
  "type": "order_flow",
  "orderId": "…",
  "fromState": "received",
  "toState": "routed",
  "message": "received → routed"
}

GET /v1/admin/entries/by-order?companyId=…&orderId=…
```

## Linker env

```
AUDIT_MS_BASE_URL=http://127.0.0.1:8722
AUDIT_MS_ADMIN_SECRET=<ADMIN_API_SECRET>
```
