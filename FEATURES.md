# WMS Linker — Platform Features

WMS Linker is a multi-tenant **Shopify ↔ warehouse / 3PL middleware**. It translates Shopify orders into warehouse work (EDI 940 / ModernWMS), receives shipments back (945 / ship events), and closes the loop with Shopify fulfillments.

**Portals**
- **Platform console** — operators invite/approve companies, attach stores, run retention & kill switches
- **Company portal** — merchants / 3PLs manage orders, warehouses, routing, team, returns
- **Warehouse uploader** — limited ship / 945 upload for assigned warehouses

---

## 1. Multi-tenancy & companies

- Companies with statuses: invited → active → disabled (plus soft-delete / restore)
- Public company signup → pending → platform approve / reject
- Platform creates companies and sends invite emails (or copy-paste invite URL)
- One company → many Shopify stores + many warehouses
- Soft-delete retention with scheduled purge (default 180 days, configurable)
- Unassigned shops (no `companyId`) visible on the platform console

---

## 2. Auth & access control

- JWT auth for platform admins, company users, and warehouse uploaders
- Company roles: **root** | **member** | **warehouse** (warehouse users scoped to assigned warehouses)
- Module RBAC: `orders`, `returns`, `failed`, `warehouses`, `sftp`, `routing`, `email`
- Invite members, resend invite, set password, forgot / reset password
- Platform admin login behind a secret console path (`ADMIN_CONSOLE_PATH`)
- Warehouse uploader accounts (shop-scoped and company warehouse users)

---

## 3. Shopify integration

- OAuth install; offline token stored for allowlisted shops
- HMAC-verified webhooks with persist-then-queue (`webhook_events` + job worker)
- Topics: `orders/create`, `orders/cancelled`, `app/uninstalled`, GDPR compliance topics
- Webhook replay from platform shop detail
- Order ingest → canonical order document
- Shopify `fulfillmentCreate` with tracking (not V2)
- Stable fulfillment idempotency keys (reuse on retry; skip if already synced)
- Optional Fulfillment Service registration (`FULFILLMENT_SERVICE_ENABLED`)
- Demo / simulate order without a live Shopify store
- Mark fulfillment orders in progress after WMS allocation (`fulfillmentOrderReportProgress`)
- Shipment status → Shopify fulfillment tracking events
- **Webhook kill switch** — pause processing from Platform Settings or `WEBHOOKS_ENABLED=false` (HMAC + store still run)

---

## 4. Order & fulfillment pipeline

Canonical flow:

```text
ORDER → LINES → ALLOCATION → FULFILLMENT GROUP(s) → SHIPMENT(s) → TRACKING → Shopify fulfill
```

- Order statuses through received → 940_ready → 945_received → partially_fulfilled / fulfilled (+ error, on_hold, cancelled)
- Multi-SKU orders
- Fulfillment groups + shipments (multi-warehouse splits)
- Inventory allocation with reserve
- Partial policies: `hold_all` / `ship_available` / `allow_customer_partial`
- Per-group EDI 940 + SFTP status
- Ship group / upload 945 / sync Shopify
- Shipment status history (pending → labeled → in_transit → out_for_delivery → delivered / failed / returned)
- Order activity logs (flow transitions, SFTP delivery, Shopify API calls)
- Cancel order releases reserved inventory

---

## 5. Routing & inventory

- Company routing config (enable, auto-assign, auto SFTP, default/fallback warehouse, address mode, partial policy)
- Rule engine with field conditions (SKU, geo, B2B, risk, inventory checks, and more)
- ZIP prefix ranking + optional Mapbox distance ranking
- Manual warehouse assign / accept suggested warehouse
- Per-warehouse inventory CRUD
- ModernWMS inventory sync endpoint

---

## 6. EDI, files & SFTP

- Generic X12 **940** writer / **945** parser
- Per-mapping `edi_mappings` for 3PL-specific maps
- Per-warehouse EDI field templates (conditional mappings)
- Named SFTP connections (AES-encrypted passwords), test connection, migrate legacy company SFTP
- Multiple warehouses can share one SFTP connection
- 940 file storage (Cloudflare R2 or local disk)
- Password-protected download links; optional email of file link
- **940 reuse on retry** — same file body resent so the WMS does not get duplicate ship orders
- Sample 945 download for testing
- Manual 945 upload (X12, JSON, or `TRACKING:` text) or tracking + carrier form

---

## 7. ModernWMS closed loop

- Per-warehouse `fulfillmentMode`: `sftp_edi` | `modernwms`
- Push dispatch to ModernWMS
- Poll status (≥ 6) → ship group / close loop
- Link collection `modernwms_links`
- Connection test + inventory sync in company portal
- Embedded / companion ModernWMS stack in-repo

---

## 8. Returns (RMA)

- Create returns and drive status transitions
- Receive / restock flows
- Soft-delete returns (included in retention cleanup)
- Company portal Returns UI (module-permission gated)

---

## 9. Failed orders (DLQ) & reliability

- Dead-letter queue for failed orders (SFTP, Shopify, mapping, ModernWMS, product-not-found, etc.)
- List, count badge, retry, reassign warehouse, skip
- In-app notifications for DLQ entries and key order events
- **DLQ email alerts** — threshold + ops email in Platform Settings (SMTP required)
- Webhook dedupe by Shopify webhook ID
- Saga-style order step tracking for fulfillment stages

---

## 10. Platform operator features

- Secret-path console for platform admins
- Companies list / create / detail / soft-delete / restore
- Attach Shopify stores; enable / disable shops
- Add warehouses; manage uploaders
- Simulate demo orders; replay webhook events
- Platform settings: retention days, auto cleanup, webhook processing, DLQ alerts
- Manual retention cleanup run

---

## 11. Company portal UI

| Area | Capabilities |
|------|----------------|
| Analytics | Order volume, in-transit, warehouse rankings, returns, funnel, carriers, destinations, warehouse map |
| Orders | List/detail, assign warehouse, fulfillment groups, send/download 940, ship, upload 945, sync Shopify |
| Failed | DLQ list with retry / reassign / skip |
| Returns | RMA workflow |
| Notifications | In-app alerts |
| Team | Invite members / warehouse users, roles, permissions |
| Warehouses | CRUD, SFTP picker, ModernWMS config, inventory, EDI templates |
| SFTP | Named connections, create/edit/test |
| Routing | Rules, policies, inventory-aware assignment |
| Email | Company email-related settings (module gated) |

---

## 11a. Analytics dashboard

- Summary KPIs: total orders, in transit, fulfilled, open returns, on hold, errors, unassigned, DLQ
- Highlight cards: top warehouse by orders + warehouse with most returns
- Charts: orders over time (area), fulfillment funnel (bar), order/shipment/return status (donut/pie)
- Warehouse rankings (bar) for orders and returns
- Carrier mix, SFTP health, channel mix
- Destination countries / regions (horizontal bars)
- Interactive warehouse map (OpenStreetMap) — marker size by order volume
- Date range presets: 7 / 30 / 90 / 365 days
- Module permission: `analytics` (defaults on if user has `orders`)
- Warehouse users see analytics scoped to their warehouses

---

## 12. Warehouse uploader UI

- Login at `/u`
- Orders for assigned warehouse(s) only
- Ship / upload 945 actions

---

## 13. Ops & developer tooling

- API docs (Swagger / Scalar) at `/api/docs`
- Health endpoints
- Smoke / e2e scripts under `wms-app-backend/scripts/` (routing, 945 lifecycle, ModernWMS, RBAC, Shopify diagnose, splits)
- Structured logging (Pino); optional log file
- Helmet / CORS basics

---

## 14. Stack (for context)

| Layer | Tech |
|-------|------|
| Backend | Fastify 5, MongoDB / Mongoose, Zod, JWT |
| Admin UI | TanStack Start, React 19, Tailwind 4 |
| Shopify app | OAuth connector (`wms-app/`) |
| Integrations | Shopify Admin GraphQL, SFTP, R2, SMTP, Mapbox (optional), ModernWMS REST |

---

## Not in product yet (high level)

These are documented as gaps / roadmap — not shipped as full product features:

- Automatic SFTP **945 inbound poll** (ModernWMS poll exists; SFTP 945 is manual)
- Shopify inventory CAS sync (`inventorySetQuantities`)
- Shopify fulfillment-order split/move APIs as source of truth
- Shopify GraphQL rate governor
- Billing / usage metering
- Actor-level audit log (who clicked retry / assign)
- Customer-facing tracking page
- Multi-channel (Amazon, etc.)
- Waves / pick / pack UI, kitting, FEFO enforcement UI, dock appointments
- Full AWS EventBridge / SQS / Step Functions architecture from `vision.md`
- Automatic returns → Shopify refund

See also: `ROADMAP.md`, `FULFILLMENT.md`, `PROGRESS.md`, `docs/CLOSED_LOOPS.md`.
