# Zoya ModernWMS + Shopify seed pack

Self-serve checklist. You add these in ModernWMS UI and Shopify admin yourself.

**Rule:** Shopify **SKU** = ModernWMS SKU **`bar_code`**. Linker maps on that.

---

## 1) Separate tenant for Zoya (do NOT add under admin)

`admin` / `1` is **tenant 1** (existing / shared). Zoya needs her **own tenant** so customer / goods owner / stock / dispatches are isolated.

### Create a new tenant from the ModernWMS login screen

1. Open `https://wms-sys.integritistudio.us` (or your MW URL).
2. On the **login** page, use **Register / Sign up / Create tenant** (wording varies by language).
3. Register:

| Field | Value |
| --- | --- |
| Company / tenant name | `Integriti Zoya Test` |
| **Username** | `zoya.siddiqui` |
| Email | `zoya.siddiqui@integriti.io` |
| **Password** | `ZoyaWms#2026` |

4. After register, log in as `zoya.siddiqui` / `ZoyaWms#2026`.
5. In Linker → warehouse → **Test connection**. Copy the returned **Tenant ID** (it will **not** be `1`). Paste it into **Tenant ID** and save.

> Do **not** create Zoya as a staff user under `admin`. That keeps her on tenant `1`. Registration creates a new `tenant_id`.

### After login (still as Zoya), seed her tenant only

Under **her** tenant, create fresh master data (IDs will restart at 1 *inside her tenant* — that is normal and still isolated):

| Record | Suggested name |
| --- | --- |
| Warehouse | `Zoya Test WH` |
| Area + location / bin | `A-01` |
| Goods owner | `Zoya Owner` |
| Customer (ship-to) | `Zoya Shopify` |
| SKUs | see section 3 (`bar_code` = Shopify SKU) |

Then put **Default customer ID** / **Goods owner ID** = those IDs from **her** tenant (often `1` and `1` again — fine, because tenant differs).

---

## 2) Linker warehouse integration fields

In **company portal → Warehouses → (Zoya test warehouse) → ModernWMS**:

| Setting | Value |
| --- | --- |
| Fulfillment mode | ModernWMS (REST) |
| **Base URL** | `https://wms-sys.integritistudio.us` |
| **Username** | `zoya.siddiqui` |
| **Password** | `ZoyaWms#2026` |
| **Tenant ID** | from Test connection after Zoya login — **must not stay `1` if `1` is admin’s tenant** |
| Default customer ID | Zoya’s customer id (often `1` in *her* tenant) |
| Goods owner ID | Zoya’s goods owner id (often `1` in *her* tenant) |
| Dispatch behavior | **Auto-confirm OFF** while testing |

Customer / goods owner IDs can both be `1` **and still be a different tenant**, because MW scopes them by `tenant_id`. What must differ is the **user + tenant**, not necessarily those local IDs.

### Prove isolation

- Log in as `admin` → you should **not** see Zoya’s warehouse / SKUs / dispatches.
- Log in as `zoya.siddiqui` → you should **not** see admin’s prod stock.
- Linker warehouse using Zoya’s creds only pushes into Zoya’s tenant.

---

## 3) Dummy products in ModernWMS

Create **SPU + SKU** rows. Set **`bar_code`** exactly to the SKU column below (case-sensitive match recommended → use as written).

Suggested warehouse location qty: **100** each.

### Product A — Integriti Crew Hoodie

| SKU / bar_code | Size | Color | Qty |
| --- | --- | --- | --- |
| `INT-HOODIE-BLK-S` | S | Black | 100 |
| `INT-HOODIE-BLK-M` | M | Black | 100 |
| `INT-HOODIE-BLK-L` | L | Black | 100 |
| `INT-HOODIE-GRY-M` | M | Gray | 100 |
| `INT-HOODIE-GRY-L` | L | Gray | 100 |

### Product B — Integriti Cap

| SKU / bar_code | Size | Color | Qty |
| --- | --- | --- | --- |
| `INT-CAP-NVY-OS` | One Size | Navy | 100 |
| `INT-CAP-BLK-OS` | One Size | Black | 100 |

### Product C — Integriti Tote Bag

| SKU / bar_code | Title | Qty |
| --- | --- | --- |
| `INT-TOTE-NAT-OS` | Natural tote | 100 |

### Product D — Integriti Water Bottle

| SKU / bar_code | Title | Qty |
| --- | --- | --- |
| `INT-BOTTLE-SLV-OS` | Silver bottle 750ml | 100 |

All of these are **physical / requires shipping** (good for WMS testing). Skip digital-only SKUs for MW stock.

---

## 4) Shopify CSV (upload this)

File in this folder:

**[`shopify-products-zoya.csv`](./shopify-products-zoya.csv)**

Shopify Admin → **Products → Import →** upload that CSV.

After import, confirm each variant **SKU** matches the MW `bar_code` list above.

---

## 5) Quick verification order

1. In Shopify (dev store): place a test order with `INT-HOODIE-BLK-M` + `INT-CAP-NVY-OS`.
2. In linker: order appears → routes to the ModernWMS warehouse that uses Zoya’s credentials.
3. In ModernWMS: dispatch created / visible under Zoya’s tenant.
4. Complete pick → ship in MW → linker poll should close and sync fulfillment.

---

## Credential card (live — created via REST)

```text
ModernWMS login
  url:   https://wms-sys.integritistudio.us
  user:  zoya.siddiqui
  pass:  ZoyaWms#2026
  email: zoya.siddiqui@integriti.io

Tenant ID:         3   (NOT admin’s tenant 1)
Company:           1 — Integriti Zoya Test
Warehouse ID:      3 — Zoya Test WH
Area ID:           3 — MAIN
Location ID:       3 — A-01
Customer ID:       3 — Zoya Shopify
Goods owner ID:    3 — Zoya Owner

Linker warehouse ModernWMS
  baseUrl:            https://wms-sys.integritistudio.us
  username:           zoya.siddiqui
  password:           ZoyaWms#2026
  tenantId:           3
  defaultCustomerId:  3
  goodsOwnerId:       3
  autoConfirmOrder:   false

Sample SKUs (qty 100 each):
  INT-HOODIE-BLK-S / M / L
  INT-HOODIE-GRY-M / L
  INT-CAP-NVY-OS / INT-CAP-BLK-OS
  INT-TOTE-NAT-OS / INT-BOTTLE-SLV-OS
```

Re-seed: `node wms-app-backend/scripts/modernwms-seed-zoya.js`

Change the password after first login if this file is shared.
