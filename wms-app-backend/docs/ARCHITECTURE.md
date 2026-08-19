# WMS Linker architecture

Shopify orders enter **wms-app-backend** only. The Shopify app (`wms-app`) is an install identity and, in local `shopify app dev`, a thin proxy. It is not deployed.

```
Shopify  --OAuth/webhooks-->  Fastify (wms-app-backend)
Platform admin console      -->  Fastify
Company users               -->  Fastify  (invite + login)
Warehouse uploader          -->  Fastify  (945 upload)
Fastify                     -->  Cloudflare R2 (or local disk)
Fastify                     -->  Shopify GraphQL fulfillment
```

## Modules

Each folder under `src/modules/` owns its models, routes, and services. Talk to another module through its `index.js` exports only.

| Module | Role |
|---|---|
| `platform` | Platform admin login (secret console path, rate limit, JWT `aud=platform_admin`) |
| `companies` | Tenants. Admin creates a company and emails the root user a password invite. A company can have many Shopify stores and many warehouses. JWT `aud=company` |
| `shops` | Allowlisted Shopify domains, `companyId` / optional `warehouseId`, enable flag, encrypted offline token |
| `events` | Raw Shopify webhook store, webhook-id dedupe, replay |
| `shopify` | OAuth, HMAC webhooks, fulfillmentCreate |
| `orders` | Canonical order + status |
| `edi` | Generic X12 940 writer / 945 parser + mapping documents |
| `files` | R2/local storage, password-protected download links, optional SMTP |
| `uploaders` | Limited warehouse logins that can upload 945s for assigned shops |

Existing company auth (`/auth/register`, `company_root`) is unused by the new UI. Leave it in place.

## Order pipeline

1. Admin creates a company (root email gets a password invite).
2. Admin attaches one or more Shopify domains and warehouses to that company.
3. Shop installs the app → OAuth stores the token **only if the domain is allowlisted**.
4. Shopify webhook is HMAC-verified, persisted, then processed. `orders/create` upserts a canonical order and writes a 940. Unknown or disabled shops are ignored with HTTP 200. `orders/cancelled` marks the order cancelled.
5. Warehouse, company, or platform records a shipment (tracking form, JSON, or X12 945) → parse → `fulfillmentCreate` on Shopify when the shop is installed.
6. Platform can **simulate an order** on any allowlisted shop to run the 940 → 945 loop without waiting on Shopify.

Unknown installs never create orders.

## Adding a 3PL mapping later

1. Insert a document in `edi_mappings` (copy `generic`, change sender/receiver/field paths).
2. Optionally add `src/modules/edi/maps/<key>.js` if segment layout differs.
3. Set `shops.mappingKey` to that key.

Do not change `shopify`, `orders`, or `files` for a new 3PL spec.

## Local Shopify CLI

`shopify app dev` tunnels to `wms-app` Express. Express proxies `/shopify/*` to Fastify at `WMS_BACKEND_URL` (default `http://127.0.0.1:3000`).
