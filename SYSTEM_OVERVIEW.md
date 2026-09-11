# WMS Linker — System Overview

What works today, how it flows, and how we should improve the UI.

---

## What it is

**Shopify ↔ warehouse middleware.** Orders come in from Shopify, get routed and allocated to warehouses, go out as EDI 940 / ModernWMS work, come back as shipments (945 / ship), and sync fulfillments back to Shopify.

| Piece | Role |
|-------|------|
| **Platform console** | Ops: companies, shops, kill switches |
| **Company portal** | Day-to-day: orders, routing, warehouses, team |
| **Warehouse uploader** | Limited ship / 945 upload |
| **Backend** | Source of truth (webhooks, pipeline, Shopify API) |
| **Shopify app** | Install / OAuth connector only |

---

## Working features

### Setup & access
- Multi-company tenancy (invite, signup approve/reject, soft-delete)
- JWT auth + roles (root / member / warehouse) + module RBAC
- Shopify OAuth (allowlisted shops) + HMAC webhooks
- Named SFTP connections, ModernWMS connection per warehouse

### Order pipeline
- Ingest Shopify orders → route → allocate inventory → fulfillment groups
- **Track A:** EDI 940 → SFTP (manual 945 / ship back)
- **Track B:** Push ModernWMS → poll → auto-close ship
- Sync Shopify fulfillment + tracking
- Partial fulfillments, cancel + release stock, activity logs

### Ops tools
- Failed-order DLQ (retry / reassign / skip) + alerts
- Returns (RMA receive / restock — internal, not Shopify refund; ModernWMS warehouses also ASN-putaway on restock)
- Analytics (KPIs, charts, warehouse map)
- Demo/simulate order, webhook replay, webhook kill switch
- Routing rules, ZIP / Mapbox ranking, inventory CRUD

---

## System flow

### Big picture

```mermaid
flowchart TB
  subgraph actors [People]
    PA[Platform admin]
    CO[Company user]
    UP[Warehouse uploader]
  end

  subgraph surfaces [Apps]
    CON[Platform console]
    PORT[Company portal]
    UPL["Uploader /u"]
    APP[Shopify app]
  end

  subgraph core [Core]
    BE["Backend + MongoDB"]
    SH[Shopify]
    WH["Warehouse / 3PL"]
  end

  PA --> CON --> BE
  CO --> PORT --> BE
  UP --> UPL --> BE
  APP -->|OAuth| BE
  SH -->|webhooks| BE
  BE -->|"940 / dispatch"| WH
  WH -->|"945 / ship"| BE
  BE -->|fulfillmentCreate| SH
```

### Order lifecycle

```mermaid
flowchart LR
  A[Shopify order] --> B[Ingest]
  B --> C[Route]
  C --> D[Allocate]
  D --> E[Fulfillment group]
  E --> F{Mode?}
  F -->|SFTP| G["940 to SFTP"]
  F -->|ModernWMS| H["Push + poll"]
  G --> I["Ship / 945"]
  H --> I
  I --> J[Shopify fulfilled]
```

### Two warehouse tracks

```mermaid
flowchart TB
  subgraph trackA ["Track A - SFTP / EDI"]
    A1[940 file] --> A2[SFTP PUT]
    A2 --> A3[3PL ships]
    A3 --> A4[Manual 945 or ship form]
  end

  subgraph trackB ["Track B - ModernWMS"]
    B1[Push dispatch] --> B2["WMS picks/packs"]
    B2 --> B3["Status poll >= 6"]
    B3 --> B4[Auto ship group]
  end

  A4 --> S[Shopify fulfillment]
  B4 --> S
```

### Who does what

```mermaid
sequenceDiagram
  participant M as Merchant
  participant S as Shopify
  participant B as Backend
  participant C as Company portal
  participant W as Warehouse

  M->>S: Installs app
  S->>B: OAuth and token
  S->>B: orders create webhook
  B->>B: Route allocate and dispatch
  B->>W: Work arrives
  W->>C: Ship or 945 upload
  C->>B: Confirm shipment
  B->>S: fulfillmentCreate and tracking
```

---

## UI improvement

The product logic works; the **admin / portal UI needs a real design pass**. Current UI is functional but not brand-polished or consistently designed.

### Option A — Full design in Figma, then implement

1. Designer produces screens (flows, components, states) in Figma  
2. Dev implements pixel-faithful UI from the designs  

**Best when:** you want a polished, consistent product look and clear UX for all portals.  
**Tradeoff:** more designer time and a longer design → build cycle.

### Option B — Branding only, developer builds UI

1. Designer (or brand kit) gives logo, colors, type, a few examples  
2. Dev builds layouts/components using that brand  

**Best when:** you need something better **fast**, with lighter design cost.  
**Tradeoff:** UX consistency and polish depend more on the developer; may need a later redesign.
