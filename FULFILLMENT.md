# Fulfillment progression

WMS Linker models fulfillment as:

```text
ORDER → ORDER LINES → ALLOCATION → FULFILLMENT GROUP(s) → SHIPMENT(s) → TRACKING
```

Not as a single `Order → Fulfilled` flag.

## Implemented (Levels 1–6)

| Level | Capability | Status |
|-------|------------|--------|
| 1 | Single order pick/pack/ship via 940 → 945 | Working |
| 2 | Multi-SKU orders | Working (line items on groups) |
| 3 | Inventory allocation + reserve | Working when inventory rows exist |
| 4 | Partial fulfillment (`partialPolicy`) | Working: `hold_all` / `ship_available` / `allow_customer_partial` |
| 5 | Split shipments | Working (one group per warehouse → multiple shipments) |
| 6 | Multi-warehouse via routing + split | Working |

### Smoke checklist

1. Enable routing (or assign a warehouse manually)
2. Create a demo order (or receive Shopify webhook)
3. Expand the order → see fulfillment group(s)
4. Confirm 940 download / SFTP status
5. Ship group with tracking → shipment appears → order becomes `fulfilled` or `partially_fulfilled`
6. Cancel order → reserved inventory released

## Scaffolded (Levels 7–28)

Fields and collections exist; UIs/workflows are not built yet.

| Level | Capability | Scaffold |
|-------|------------|----------|
| 7–9 | Waves / batch / zone pick | `Wave` model, `waveId`, `pickTasks[]`, `zone` |
| 10–11 | Dropship / multi-method | `method` on fulfillment group |
| 12 | Backorders / PO | `backorderedQty`, `purchaseOrderId` |
| 13 | Cross-dock | `crossDock` flag |
| 14–15 | Serial / lot / FEFO | `serials`, `lot`, `expiry` on lines; `enforceFefo` on warehouse |
| 16–18 | Kitting / assembly / personalization | `kitComponents[]`, `workOrderId` |
| 19–22 | Returns / RMA / failed delivery | `Return` collection; shipment `failed`/`returned` |
| 23–26 | Multi-channel / EDI compliance | `channel`, `complianceProfileId` on order |
| 27 | Dock appointments | `dockAppointmentId` on shipment |
| 28 | Enterprise orchestration | Saga + group metadata |

## Key modules

- `wms-app-backend/src/modules/fulfillment/` — groups, shipments, allocate, ship
- `wms-app-backend/src/modules/routing/` — warehouse rules + inventory
- `wms-app-backend/src/modules/edi/` — 940/945 per group
- Company portal Orders expand → fulfillment panel
