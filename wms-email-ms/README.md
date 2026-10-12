# WMS Email Microservice (`wms-email-ms`)

Secure, multi-tenant **email delivery** service for the WMS platform.

## Features

- Queued send via **pg-boss** with exponential backoff
- Per-tenant **encrypted SMTP credentials** (AES-256-GCM)
- **Templates** with safe `{{var}}` substitution (no code execution)
- HTML **sanitization** (`sanitize-html`)
- **Suppression list** (bounces / unsubscribes / manual)
- **Idempotency keys**, daily quotas, recipient limits
- **Action audit** trail
- Tenant API keys (`wms_mail_…`) + admin secret
- Helmet + throttling + correlation IDs
- OpenAPI at `/docs`, health at `/health/live` + `/health/ready`

## Stack

NestJS 12 (ESM) · TypeORM · PostgreSQL · pg-boss · nodemailer

Default API port: **8716** · DB name: **email_ms**

## Quick start (shared Postgres)

Your host Postgres (`postgres` / `root`). Create the DB once:

```sql
CREATE DATABASE email_ms;
```

```bash
cp .env.example .env
# DB_HOST=localhost DB_USERNAME=postgres DB_PASSWORD=root DB_NAME=email_ms

npm install
npm run build
set RUN_MIGRATIONS=true
npm run start:dev
# other terminal
npm run start:worker:dev
```

## Create tenant + send

```http
POST /v1/admin/tenants
Authorization: Bearer <ADMIN_API_SECRET>
{ "name": "Acme", "slug": "acme", "externalCompanyId": "..." }

PUT /v1/smtp
Authorization: Bearer <wms_mail_...>
{ "host": "smtp.example.com", "port": 587, "username": "...", "password": "...", "fromAddress": "noreply@example.com" }

POST /v1/mail
Authorization: Bearer <wms_mail_...>
{
  "to": ["ops@example.com"],
  "subject": "Hello",
  "text": "Hi from wms-email-ms",
  "idempotencyKey": "welcome-1"
}
```

## SMTP priority

1. **Tenant SMTP** (`smtp_credentials`) — always preferred  
2. **Platform env `SMTP_*`** — only if tenant has no SMTP **and** `tenants.allow_platform_smtp_fallback = true` (admin can toggle)

## Linker env

```
EMAIL_MS_BASE_URL=https://wms-email-ms.integritistudio.us
EMAIL_MS_ADMIN_SECRET=<same as ADMIN_API_SECRET on email-ms>
```

BFF helper: `wms-app-backend/src/modules/emailMs/`.

When configured, Linker routes:
- notification emails
- invite / link emails
- company SMTP save/test

through this service. Message rows in `email_messages` + `action_audit` are the send logs.

## Cloudflare

`wms-email-ms.integritistudio.us` → `http://127.0.0.1:8716`
