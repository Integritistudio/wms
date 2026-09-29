# wms-new-backend

Plug-and-play microservices conversion of `wms-app-backend`.

```text
ecommerce connectors  →  CORE (orders / fulfillment / saga / …)  →  WMS connectors
     (add/remove)              (stable)                              (add/remove)
```

## Quick start

```bash
cd wms-new-backend
cp .env.example .env
npm install
npm run infra:up          # Postgres + RabbitMQ
node scripts/wait-infra.js
npm run db:create
npm run db:migrate
npm run services:dev      # all services watch mode
```

Gateway: `http://127.0.0.1:4000/health`  
RabbitMQ UI: `http://127.0.0.1:15672` (linker / linker)

Postgres: `localhost:5432` user `postgres` / `root` — one DB per service (`linker_orders`, `linker_fulfillment`, …).

## Service ports

| Service | Port | DB |
|---|---|---|
| api-gateway | 4000 | — |
| auth | 4001 | linker_auth |
| platform | 4002 | linker_platform |
| companies | 4003 | linker_companies |
| shops | 4004 | linker_shops |
| orders | 4005 | linker_orders |
| fulfillment | 4006 | linker_fulfillment |
| routing | 4007 | linker_routing |
| saga | 4008 | linker_saga |
| inventory | 4009 | linker_inventory |
| files | 4010 | linker_files |
| notifications | 4011 | linker_notifications |
| uploaders | 4012 | linker_uploaders |
| ecommerce-shopify | 4013 | linker_ecommerce_shopify |
| wms-modernwms | 4014 | linker_wms_modernwms |
| wms-sftp-edi | 4015 | linker_wms_sftp_edi |

## Add a new WMS (1–3 folders)

1. Copy `services/wms-modernwms` → `services/wms-<name>`
2. Rewrite `src/index.js` client/mapper (and poller if needed)
3. Subscribe to `linker.wms.commands` with pattern `<name>.wms.shipment.dispatch`
4. Publish `wms.shipment.confirmed` on the events exchange
5. Set warehouse `wmsProvider` to `<name>` via companies API

Core fulfillment never branches on vendor names — it routes by `wmsProvider`.

## Add a new ecommerce

1. Copy `services/ecommerce-shopify` → `services/ecommerce-<name>`
2. Map vendor webhooks → `ecommerce.order.created` (canonical contract in `@linker/contracts`)
3. Consume `linker.ecommerce.commands` with pattern `<name>.ecommerce.fulfillment.create`
4. Set shop `ecommerceProvider` to `<name>`

## Env mapping from monolith

| Monolith (`wms-app-backend`) | Microservice |
|---|---|
| `src/modules/shopify` | `services/ecommerce-shopify` |
| `src/modules/modernwms` | `services/wms-modernwms` |
| `src/modules/edi` + SFTP | `services/wms-sftp-edi` |
| `src/modules/orders` | `services/orders` |
| `src/modules/fulfillment` | `services/fulfillment` |
| `src/modules/saga` | `services/saga` |
| `src/modules/routing` | `services/routing` |
| `src/modules/companies` | `services/companies` |
| `src/modules/shops` | `services/shops` |
| Mongo `job_queue` | RabbitMQ + per-service outbox |
| Single Mongo DB | Postgres DB per service |

## Smoke checklist

1. `POST /companies` → create company  
2. `POST /companies/:id/warehouses` with `wmsProvider: "modernwms"` and `MOCK_MODERNWMS=1`  
3. `POST /shops` linking company + warehouse, `ecommerceProvider: "shopify"`  
4. `POST /shopify/webhooks` with topic `orders/create` (HMAC optional if no secret)  
5. Watch orders → fulfillment allocate → modernwms link  
6. `POST /modernwms/links/:groupId/confirm` → fulfillment → shopify fulfill command  
7. Check `GET /saga/:orderId` reaches `FULFILLED`

For SFTP/EDI path use `wmsProvider: "sftp_edi"` and `MOCK_SFTP=1`, then `POST /edi/945`.

## Infrastructure notes

- **Postgres** must be running on `localhost:5432` (`postgres` / `root`). `npm run db:create` creates all `linker_*` databases.
- **RabbitMQ** must be reachable at `amqp://linker:linker@localhost:5672`. Prefer `docker compose up -d rabbitmq` (management UI on `:15672`). Services retry bus connect for ~60s on boot.
- If Docker is unavailable, install RabbitMQ locally and create user `linker` / `linker` with permission to vhost `/`.

## Seed

```bash
node scripts/seed-platform-admin.js
# default admin / admin
```
