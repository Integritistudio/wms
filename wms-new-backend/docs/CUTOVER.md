# Cutover from wms-app-backend (Mongo monolith)

## What stays the same

Order semantics: webhook ingest → allocate → WMS dispatch → ship confirm → ecommerce fulfill → saga `FULFILLED`.

## What changes

| Concern | Monolith | New |
|---|---|---|
| Process model | One Fastify process | 16 services + gateway |
| Data store | MongoDB | Postgres DB **per service** |
| Jobs | Mongo `job_queue` | RabbitMQ + transactional outbox |
| Shopify | `src/modules/shopify` | `services/ecommerce-shopify` |
| ModernWMS | `src/modules/modernwms` | `services/wms-modernwms` (`client.js` / `mapper.js`) |
| EDI/SFTP | `src/modules/edi` | `services/wms-sftp-edi` (`mapper.js` / `maps/*`) |

## Provider registration

Warehouse:

```http
PATCH /warehouses/:id
{ "wmsProvider": "modernwms", "wmsConfig": { "baseUrl": "...", "username": "...", "password": "..." } }
```

Shop:

```http
PATCH /shops/:id
{ "ecommerceProvider": "shopify" }
```

Fulfillment publishes to `linker.wms.commands` / `{wmsProvider}.wms.shipment.dispatch` — no core code change for new providers.

## Suggested cutover steps

1. Run new stack in parallel (new ports 4000+).
2. Point a staging Shopify webhook to `ecommerce-shopify:4013/shopify/webhooks`.
3. Replay smoke: create → allocate → confirm → fulfill.
4. Migrate allowlisted shops / companies (export Mongo → seed scripts).
5. Flip DNS / tunnel to gateway `:4000`.
6. Freeze monolith writes.

Do **not** dual-write production until a dedicated migration script exists.
