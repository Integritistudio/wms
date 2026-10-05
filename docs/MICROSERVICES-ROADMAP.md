# WMS Linker — Microservices Plan

**Audience:** PM / CEO  
**Purpose:** What we still need to build as separate services, why it matters, and in what order.  
**Out of scope:** Work already started in the new backend scaffold (Shopify, ModernWMS, SFTP/EDI, core shells).

---

## Why this matters

Today most of the product runs as **one large backend**. That works for early customers, but it limits us as we add:

- More **store platforms** (not only Shopify)
- More **warehouse / 3PL systems** (not only ModernWMS and SFTP)
- Stronger **reliability**, **scale**, and **team ownership**

Microservices let us add or swap connectors **without rewriting the order engine**, and let one failing integration stay isolated so the rest of the product keeps running.

```text
Store platforms  →  Core order engine  →  Warehouses / 3PLs / carriers
  (plug in/out)         (stable)              (plug in/out)
```

---

## What we are *not* re-planning

These are **already underway** in the new architecture (do not treat as new asks):

- Login / companies / shops / warehouses
- Orders, routing, fulfillment, inventory, saga (lifecycle)
- Notifications, files, uploaders
- Shopify connector
- ModernWMS connector
- SFTP + EDI (940/945) connector
- API gateway & event bus basics

This document focuses on **what still needs to be built or fully migrated** for growth.

---

## 1. Core order flow (the product heart)

This is the path every order must take, no matter which store or WMS we use.

| Step | What the business gets | Status |
|---|---|---|
| **Order intake** | Every store order becomes one clean internal order | Needs full production migrate |
| **Routing** | Right warehouse chosen by rules (ZIP, stock, priority) | Needs full production migrate |
| **Allocation** | Stock reserved; multi-warehouse splits when needed | Needs full production migrate |
| **Dispatch** | Work sent to the correct WMS / 3PL | Needs full production migrate |
| **Lifecycle (saga)** | Clear status: received → allocated → shipped → fulfilled | Needs full production migrate |
| **Returns** | RMA, restock, store sync — not buried inside fulfillment | **New service to build** |
| **Shipments & tracking** | Carrier tracking timeline for ops and customers | **New service to build** |

**Business ask:** Finish the core path so new store/WMS deals do not require custom core rewrites.

---

## 2. Store (ecommerce) connectors

Each store platform is its **own service**. We keep the same internal “order language.”

| Connector | Why | Priority |
|---|---|---|
| Shopify | Live / already started | Maintain & harden |
| **WooCommerce** | Mid-market merchants | Build when deals require |
| **Amazon** | Marketplace volume | Build when deals require |
| **BigCommerce / Magento** | Enterprise / B2B pipeline | Build when deals require |
| **Custom API** | One-off storefronts without a full product build | Build once pattern is proven |

**Business ask:** Sell “we connect to X” by adding a connector, not by changing the whole app.

---

## 3. Warehouse / 3PL connectors

Same idea on the outbound side — warehouse systems plug in via `wmsProvider` on each warehouse.

| Connector | Why | Priority |
|---|---|---|
| ModernWMS | Live / already started | Maintain & harden |
| SFTP + EDI (940/945) | Classic 3PL integration | Maintain & harden |
| **ShipStation** | Common labeling / multi-carrier ops | High for many US merchants |
| **ShipHero** | Modern WMS buyers | As needed |
| **Generic REST WMS** | Fast onboarding for custom 3PL APIs | High leverage |
| **Email / file drop** | Small 3PLs with no API | Low-tech fallback |

**Business ask:** Close warehouse deals faster with a connector catalog instead of project work each time.

---

## 4. Carrier / tracking (later)

Optional services for labels and live tracking (UPS, FedEx, USPS, or a multi-carrier tracker).

Used by the shipments service — **not** required before core order flow is solid.

---

## 5. Ops & platform services still needed

These make the product operable for support, success, and leadership — not just engineers.

| Service | Business value |
|---|---|
| **Webhook intake** | Safe, replayable store/WMS webhooks (fewer “order never arrived” tickets) |
| **Activity log** | Audit trail on the order screen (“what happened and when”) |
| **Analytics** | Dashboards without slowing live order processing |
| **Failed orders / ops recovery** | Retry bad orders; clear DLQ for support |
| **Product catalog sync** *(optional split)* | SKU ↔ store mapping kept clean as inventory grows |

---

## 6. Recommended delivery order

### Wave A — Make the money path solid
1. Finish core: **orders → routing → allocate → dispatch → fulfill**  
2. Harden existing connectors: **Shopify, ModernWMS, SFTP/EDI**  
3. Reliable webhook intake + retry

**Outcome:** New customers on current stack run on the new architecture with confidence.

### Wave B — Ops visibility
4. Activity log  
5. Analytics  
6. Failed-order recovery  
7. Shipments / tracking service

**Outcome:** Support and CS can diagnose issues without engineering in the loop every time.

### Wave C — Returns & catalog
8. Returns service  
9. Product catalog (if inventory volume demands it)

**Outcome:** Full post-purchase loop; cleaner SKU management.

### Wave D — Growth connectors
10. Next store platform (Woo or Amazon — pick from pipeline)  
11. Next WMS (ShipStation or Generic REST)  
12. Carriers as deals require

**Outcome:** Sales can attach a connector name to a deal with a known build cost.

---

## 7. Success criteria (simple)

| Metric | Target meaning |
|---|---|
| New store platform | Shippable without changing core order services |
| New WMS / 3PL | Shippable without changing core order services |
| Order fail isolation | One bad connector does not take down allocation / portal |
| Ops recovery | Support can retry failed ingest without a deploy |
| Time-to-integrate | Connector work measured in days/weeks, not a full rewrite |

---

## 8. One-page checklist (remaining work)

**Core**
- [ ] Complete order intake & enrichment migrate  
- [ ] Complete routing migrate  
- [ ] Complete inventory reservation & allocation  
- [ ] Complete fulfillment dispatch orchestration  
- [ ] Complete lifecycle / saga  
- [ ] Build **Returns**  
- [ ] Build **Shipments / tracking**

**Connectors (as commercial need appears)**
- [ ] WooCommerce  
- [ ] Amazon  
- [ ] ShipStation  
- [ ] Generic REST WMS  
- [ ] Other store / WMS / carrier as deals require  

**Ops platform**
- [ ] Webhook intake  
- [ ] Activity log  
- [ ] Analytics  
- [ ] Failed-order recovery  

---

## Bottom line

We already have the **skeleton** for microservices and the first three connectors.  

What still matters for PM/CEO planning is:

1. **Finish the core order engine** so every order path is stable.  
2. **Add Returns + Shipments** as first-class product capabilities.  
3. **Grow a connector catalog** (stores + warehouses) driven by the sales pipeline.  
4. **Add ops services** so support and analytics scale with volume.

That sequence protects the current product while making “new integration” a repeatable product motion instead of custom engineering each time.
