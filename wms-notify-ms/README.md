# WMS Notify Microservice (`wms-notify-ms`)

Multi-tenant **in-app + push** notifications for WMS Linker.

## Features

- In-app notifications (create / list / unread / mark read)
- Device registration (web push, FCM/Android/iOS)
- Per-type channel preferences (`in_app`, `push`, `email`)
- Queued push delivery with retries (pg-boss)
- Providers: Web Push (VAPID), FCM legacy HTTP, generic webhook, or log (dev)
- Read retention + TTL purge
- Tenant API keys (`wms_ntfy_…`) + admin secret
- OpenAPI `/docs`, health `/health/live` + `/health/ready`

## Stack

NestJS 12 · TypeORM · PostgreSQL · pg-boss · web-push

Default port **8720** · DB **`notify_ms`**

## Quick start

```bash
cp .env.example .env
# DB_USERNAME=postgres DB_PASSWORD=root DB_NAME=notify_ms

npm install
npm run ensure-db
npm run build
set RUN_MIGRATIONS=true
npm run start:dev
# other terminal
npm run start:worker:dev
```

## Core flow

```http
POST /v1/admin/tenants/ensure
Authorization: Bearer <ADMIN_API_SECRET>
{ "externalCompanyId": "…", "name": "Acme" }

POST /v1/admin/notifications?companyId=…
{
  "type": "order_error",
  "title": "Order failed",
  "message": "SKU missing",
  "channels": ["in_app", "push"]
}

PUT /v1/admin/devices?companyId=…
{
  "platform": "web",
  "token": "https://…",
  "p256dh": "…",
  "auth": "…"
}
```

## Linker env

```
NOTIFY_MS_BASE_URL=http://127.0.0.1:8720
NOTIFY_MS_ADMIN_SECRET=<ADMIN_API_SECRET>
```

Email channel remains on `wms-email-ms` / existing SMTP settings in Linker.
