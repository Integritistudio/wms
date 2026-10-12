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

## Linker env (optional)

```
EMAIL_MS_BASE_URL=http://127.0.0.1:8716
EMAIL_MS_ADMIN_SECRET=<ADMIN_API_SECRET>
```

BFF helper: `wms-app-backend/src/modules/emailMs/`.

## Cloudflare

Route e.g. `email.integritistudio.us` → `http://127.0.0.1:8716`.
