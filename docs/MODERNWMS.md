# ModernWMS — system reference

ModernWMS is an open-source warehouse management system embedded in this repo at [`ModernWMS/`](../ModernWMS/). It is a **standalone** Vue 3 + ASP.NET Core 7 application. wms-linker integrates with it via **REST** (push outbound dispatch, poll delivery status).

Upstream: [fjykTec/ModernWMS](https://github.com/fjykTec/ModernWMS)

---

## Architecture

```text
┌─────────────────────┐     JWT REST      ┌──────────────────────────┐
│ ModernWMS frontend  │ ◄──────────────► │ ModernWMS backend (.NET 7) │
│ Vue 3 + Vuetify     │   port 20011*  │ EF Core + MySQL/SQLite     │
└─────────────────────┘                  └──────────────────────────┘
         │                                           │
         │ ops: pick / pack / ship                   │ stock, ASN, dispatch
         ▼                                           ▼
   Warehouse staff UI                          Database (tenant-scoped)
```

\* Port varies by config: `Program.cs` defaults to **5555**; README/Docker use **20011** or **21011**. Set `baseUrl` explicitly in wms-linker warehouse config.

| Layer | Path | Technology |
|-------|------|------------|
| Frontend | `ModernWMS/frontend/` | Vue 3, Vite, Vuetify 3, VXE Table |
| Backend host | `ModernWMS/backend/ModernWMS/` | ASP.NET Core 7, Kestrel |
| Core | `ModernWMS/backend/ModernWMS.Core/` | JWT, EF, Swagger, Hangfire |
| WMS domain | `ModernWMS/backend/ModernWMS.WMS/` | Controllers, services, entities |

---

## Multi-tenancy and auth

- Login: `POST /login` with `{ user_name, password }` where **password is MD5-hashed** (see `frontend/src/components/login/login-form.vue`).
- Response envelope: `{ isSuccess, data: { access_token, refresh_token, expire, tenant_id, ... } }`.
- All API calls: `Authorization: Bearer <access_token>`.
- Data isolation: every entity has `tenant_id`; services filter by JWT `tenant_id`.
- Default demo credentials: `admin` / `1`.

Refresh: `POST /refresh-token` with access + refresh tokens.

---

## Master data hierarchy

```text
Company (tenant profile)
├── Warehouse → WarehouseArea → GoodsLocation (bins)
├── SPU (product) → SKU (variant, bar_code)
├── Customer (ship-to party)
├── GoodsOwner (consignor / 3PL owner)
└── Stock (sku + location + goods_owner + qty)
```

wms-linker maps **Shopify SKU → ModernWMS SKU `bar_code`** for dispatch lines.

---

## Inbound — ASN lifecycle

ASN moves stock **into** the warehouse.

| `asn_status` | Meaning | Typical API |
|--------------|---------|-----------|
| 0 | Notice / pending arrival | `POST /asn/asnmaster` |
| 1 | Arrived | `PUT /asn/confirm` |
| 2 | Unloaded | `PUT /asn/unload` |
| 3 | Sorted (ready for putaway) | `PUT /asn/sorted` |
| 4 | Putaway complete | `PUT /asn/putaway` → **creates/updates stock** |

Key routes: `/asn`, `/asn/asnmaster`, `/asn/putaway`.

Inbound sync from wms-linker is **phase 2** (not in initial integration).

---

## Outbound — dispatch lifecycle

Dispatch moves stock **out** of the warehouse. This is the primary integration path for Shopify orders.

| `dispatch_status` | Meaning | wms-linker role |
|-------------------|---------|-----------------|
| 0 | Pre-shipment draft | Created by linker push |
| 1 | New shipment | Ops may edit in MWMS UI |
| 2 | Goods to be picked | After `confirm-order` (stock allocated) |
| 3 | Picked | Ops in MWMS UI |
| 4 | Packaged | Optional |
| 5 | Weighed | Optional |
| 6 | **Out of warehouse (shipped)** | **Poller closes loop → shipGroup** |
| 7 | Signed in | Optional |

### Key outbound APIs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/dispatchlist` | Create dispatch lines (auto `dispatch_no`) |
| GET | `/dispatchlist/by-dispatch_no` | Fetch lines + status + tracking |
| POST | `/dispatchlist/confirm-order` | Allocate stock, create pick list (→ status 2) |
| PUT | `/dispatchlist/confirm-pick-dispatchlistno` | Confirm pick (→ status 3) |
| POST | `/dispatchlist/delivery` | Ship — deducts stock (→ status 6) |
| POST | `/dispatchlist/freightfee` | Set carrier / waybill |
| POST | `/stock/stock-list` | Query inventory by SKU |

Create payload (per line): `sku_id`, `qty`, `customer_id`, `customer_name`.

---

## Stock model

Stock rows are keyed by warehouse location, SKU, goods owner, and optional series/lot/expiry. Quantity changes at:

- **ASN putaway** — increase
- **Dispatch delivery** — decrease

Linker inventory sync (optional): poll `POST /stock/stock-list` → upsert wms-linker `warehouse_inventory`.

---

## Integration gaps (important)

| Gap | Impact |
|-----|--------|
| **No webhooks** | wms-linker must **poll** dispatch status |
| **No external_ref field** | Linker stores `dispatch_no` in `modernwms_links` |
| **Weak controller `[Authorize]`** | Use dedicated service account; restrict network |
| **Port inconsistency** | Configure `baseUrl` per warehouse |
| **Password MD5** | Client must hash before login |
| **SKU must exist in MWMS** | Seed SKUs with `bar_code` = Shopify SKU |

---

## Running locally

See [`ModernWMS/README.md`](../ModernWMS/README.md). Typical stack:

1. Start ModernWMS backend on port **20011**
2. Start wms-app-backend (`npm run dev`, port 3000)
3. Configure warehouse **Fulfillment mode → ModernWMS** in company portal
4. Seed matching SKUs in ModernWMS before simulating orders

---

## wms-linker module

Implementation: [`wms-app-backend/src/modules/modernwms/`](../wms-app-backend/src/modules/modernwms/)

| File | Role |
|------|------|
| `client.js` | Login (MD5), token cache, HTTP wrapper |
| `mapper.js` | Order/group → dispatch payload; SKU lookup |
| `service.js` | `pushOrder`, `pollDispatchStatus`, `syncInventory` |
| `poller.js` | Background poll → `shipGroup` when status ≥ 6 |
| `model.js` | `modernwms_links` Mongo collection |

Warehouse setting: `fulfillmentMode: 'modernwms' | 'sftp_edi'`.
