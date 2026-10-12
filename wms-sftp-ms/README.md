# WMS SFTP / EDI Microservice (`wms-sftp-ms`)

Secure multi-tenant **SFTP transfer** service for EDI **940** (outbound) and **945** (inbound poll).

## Features

- Encrypted SFTP credentials (password and/or private key, AES-256-GCM)
- Queued uploads with exponential backoff (pg-boss)
- Connection test endpoint
- Inbound directory polling + dedupe by content hash
- Optional callback to Linker for 945 ingestion
- Host safety checks (private IP blocking configurable)
- Max file size, path traversal guards, audit trail
- Tenant API keys (`wms_sftp_…`) + admin secret
- OpenAPI `/docs`, health `/health/live` + `/health/ready`

## Stack

NestJS 12 · TypeORM · PostgreSQL · pg-boss · ssh2-sftp-client

Default port **8718** · DB **`sftp_ms`**

## Quick start

```sql
-- or: npm run ensure-db
CREATE DATABASE sftp_ms;
```

```bash
cp .env.example .env
# DB_USERNAME=postgres DB_PASSWORD=root DB_NAME=sftp_ms

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
POST /v1/admin/tenants
Authorization: Bearer <ADMIN_API_SECRET>
{ "name": "Acme", "slug": "acme", "externalCompanyId": "..." }

PUT /v1/connections
Authorization: Bearer <wms_sftp_...>
{
  "name": "WH1",
  "host": "sftp.example.com",
  "username": "wms",
  "password": "...",
  "remotePath": "/inbound/940",
  "inboundPath": "/outbound/945",
  "enabled": true
}

POST /v1/transfers
{
  "connectionId": "<uuid>",
  "fileName": "940-1001.edi",
  "body": "ISA*...",
  "documentType": "940",
  "idempotencyKey": "order-1001-940"
}

PUT /v1/pollers
{ "connectionId": "<uuid>", "remotePath": "/outbound/945", "fileGlob": "*.edi" }
```

## Linker env

```
SFTP_MS_BASE_URL=http://127.0.0.1:8718
SFTP_MS_ADMIN_SECRET=<ADMIN_API_SECRET>
SFTP_MS_CALLBACK_SECRET=<shared>
```

Inbound callback expected at Linker: `POST /api/internal/sftp-ms/inbound`.
