# WMS Linker MVP Enhancement Roadmap
**Goal:** Production-ready pilot with first paying customer in 4–6 weeks  
**Team:** You + 1–2 part-time devs  
**Constraint:** Must handle real Shopify order flow without losing orders or creating duplicates

---

## Phase 0: Pre-Pilot (Week −1, now)
**Do this before anything else.** Define the pilot scope so you're building for them, not for everyone.

### Pilot Interview Checklist
- [ ] How many orders/day initially? Peak?
- [ ] How many warehouses? Do they share stock pools?
- [ ] What WMS software? (SAP, Oracle, custom, Shopify?)
  - Does it emit webhooks/API for stock changes?
  - Or is stock polling the only option?
- [ ] Shipping methods: ≤5 carriers or many?
- [ ] Do they need split shipments, or always single-warehouse?
- [ ] Is your app replacing a manual process or integrating alongside existing automation?
- [ ] What's the **deal**? License fee, per-order, SaaS? (This drives your infrastructure spend.)

**Why this matters:** If they're 10 orders/day, no splits, no inventory feed, you can defer ~50% of the roadmap. If they're 500/day with real-time stock + splits, you need different priorities.

---

## Phase 1A: Reliability & Observability (Weeks 1–2, parallel track)
**Not a feature. This is your foundation.** Ship with zero lost orders and visibility into what's happening.

### 1A.1 — Idempotency (Critical path)
**Shopify sends webhooks at-least-once. You must not duplicate orders or shipments.**

- [ ] **Webhook deduplication**
  - Store webhook ID + hash in MongoDB on first receipt
  - Reject duplicates with 200 OK (Shopify thinks it succeeded)
  - TTL: 24h (Shopify's max retry window)
  - Current code: you have `X-Shopify-Webhook-Id` already; ensure it's the dedupe key

- [ ] **Outbound 940 deduplication**
  - Before sending 940 to SFTP: store `(fulfillmentOrderId, attemptN)` + file hash in DB
  - On SFTP retry: send same file hash, not regenerated
  - Don't let a retry generate a new 940 — you'll send two to the WMS

- [ ] **fulfillmentCreate idempotency** (Shopify-side)
  - Generate UUID once per shipment, store in DB
  - Add `@idempotent(key: $uuid)` to fulfillmentCreate GraphQL mutation (2026-04+ mandatory)
  - Reuse same UUID on every retry — never generate a new one

### 1A.2 — Error Visibility (DLQ + Manual Override)
**When something breaks, the ops person needs to see it and fix it without code.**

- [ ] **Failed order queue (DLQ)**
  - Create `failed_orders` collection with state: `HMAC_FAIL | MAPPING_EXCEPTION | SFTP_ERROR | SHOPIFY_ERROR`
  - Each row: order + error message + timestamp + attempts
  - Show count in dashboard sidebar (red alert if > 0)

- [ ] **Manual override UI**
  - Platform console: "Failed Orders" tab
  - For each: see error, retry button, reassign warehouse button, skip button
  - Logging: who clicked what, when, why (dropdown: "Correct warehouse", "Bad data, notify customer", etc.)

- [ ] **Alerting**
  - Email/Slack: DLQ depth > 5 (something is wrong)
  - Check every 5 minutes, don't spam

**Deliverable:** A Saturday-morning ops person can fix a stuck order in 3 minutes without you.

### 1A.3 — Observability
**Minimal logging infrastructure. Not beautiful, but sufficient.**

- [ ] **Order flow log**
  - Every state transition: `{timestamp, orderId, fromState, toState, warehouseId, message}`
  - Searchable in dashboard
  - You should be able to grep logs and see: received → 940_ready → 940_sent → 945_received → fulfilled

- [ ] **SFTP delivery log**
  - Every upload attempt: `{timestamp, warehouseId, filename, status, bytes, duration, retries}`
  - Alert if upload > 10s (indicates network issue or WMS is slow)

- [ ] **Shopify API errors**
  - Every API call result: `{timestamp, mutation, cost, status, userErrors[]}`
  - Alert on repeated 429 THROTTLED (you're hitting rate limits)
  - Log on `userErrors` (almost always a mapping problem)

**Implementation:** Add a `logs` collection, TTL 30 days (cheap in MongoDB). Query via the order detail page.

---

## Phase 1B: Production Infrastructure (Weeks 1–2, parallel)
**Your MVP is running on your laptop or a $5 VPS. This won't work for a paying customer.**

### Choose your hosting tier (pick one):

**Option A — Render / Railway (simplest, $50–100/month)**
- Deploy backend (Node) + admin dashboard (React) + MongoDB Atlas
- Env vars for secrets (Shopify API key, SFTP creds)
- Auto-deploys on git push
- Free for first few weeks, then PAYG
- **Suitable for:** <100 orders/day, one pilot, okay with minimal ops

**Option B — AWS Fargate (more control, $100–300/month)**
- Docker container for backend
- Auto-scaling if you hit traffic spikes
- Secrets Manager for SFTP creds
- CloudWatch for logs
- **Suitable for:** planning to onboard 5+ customers, need observability
- **Setup cost:** ~2 days (you know AWS from integritistudio)

### For the pilot, pick A. Upgrade to B after customer 2.

### SFTP to their WMS
- [ ] Test with real SFTP credentials (don't use sandbox)
- [ ] Verify they can receive your 940 format
- [ ] Build a retry loop: fail, backoff, alert if > 3 retries

**Week 1 deliverable:** Backend running on Render, orders flowing end-to-end.

---

## Phase 2: Core Gaps (Weeks 3–4)
**Now you have a foundation. Build what the pilot actually needs.**

### 2.1 — Inventory Sync (IF the pilot needs it)
**Does their WMS push stock changes? Or only polling?**

**If WMS has a stock webhook/API:**
- [ ] Accept inbound stock update via API
  - POST `/warehouse/:id/stock` with `[{sku, location, quantity}]`
  - Store in `inventory_ledger` collection
  - On next order: check stock before assigning warehouse
  - **Don't allocate from zero-stock locations** (current code has no check)

**If polling only (daily/hourly file):**
- [ ] Scheduled task: every 2 hours, fetch stock from WMS
  - Store in `inventory_cache` with timestamp
  - Use for allocation logic
  - Alert if file is >4h stale

**Idempotency on stock writes:**
- Compare-and-swap: `inventorySetQuantities` with `changeFromQuantity`
  - On conflict (concurrent write), re-read and retry (max 3x)
  - Never bypass with `null` unless WMS is definitionally authoritative

**Decision:** Can defer if pilot doesn't need live inventory. Add a feature flag: `INVENTORY_SYNC_ENABLED = false` for now, true if needed.

### 2.2 — Allocation Logic (IF pilot needs splits)
**Current: you assign orders to a warehouse manually. Real scenario: algorithm picks.**

**If single-warehouse only:** Skip this, stay manual.

**If splits needed:**
```
Shopify routes initially (maybe wrong).
You evaluate: "Can warehouse A ship all? If not, split to B?"
Use fulfillmentOrderSplit + fulfillmentOrderMove on order_routing_complete webhook.
```

- [ ] Receive `fulfillment_orders/order_routing_complete` webhook (not orders/create)
- [ ] Load order + fulfillmentOrders + location inventory
- [ ] Run allocation algorithm (greedy set-cover)
- [ ] If split needed: `fulfillmentOrderSplit`, then `fulfillmentOrderMove`
- [ ] Store allocation plan in DB for audit

**Timeline:** 4–5 days, medium complexity. Defer if pilot is okay with manual assignment for now.

### 2.3 — Shipment Tracking (945 Ingestion)
**You have a manual file upload. Make it automatic if WMS pushes.**

- [ ] Scheduled poll: every 30 min, check SFTP for 945 files
  - Parse X12 or JSON (support both)
  - File-hash dedupe (don't process same file twice)
  - Extract: order ref, tracking, carrier, qty shipped
  - Match back to fulfillment order (might arrive out-of-order — keep in pending_correlation 24h)
  - Call `fulfillmentCreate` with tracking info
  - Move file to archive

- [ ] Manual upload still works (for one-offs)

**Rate limiting:** Check Shopify throttleStatus, queue if THROTTLED, retry exponentially.

---

## Phase 3: Customer-Ready Polish (Weeks 5–6)

### 3.1 — Onboarding Flow
- [ ] Invite company admin → set password → add warehouse + SFTP creds
  - Test SFTP connection before save (give clear error if it fails)
- [ ] First order: run through full flow, show status at each step
- [ ] Sample files: downloadable 940 + 945 template (let them test locally)

### 3.2 — Documentation (Honest!)
- [ ] "What we tested" (how many orders, what scenarios)
- [ ] "Known limitations" (no multi-location inventory sharing yet, no Rate Governor yet, etc.)
- [ ] WMS integration checklist: what X12 format do you emit? We assume X; if different, tell us.
- [ ] Runbook: "Order is stuck. What do I do?" → link to failed-orders dashboard

### 3.3 — Security Pre-Flight
- [ ] SFTP passwords encrypted in DB (AES-256-GCM — already done)
- [ ] Shopify API key in Secrets Manager, not .env
- [ ] HMAC verification on webhooks, constant-time compare (already done)
- [ ] Audit log: who logged in, who assigned a warehouse, who hit retry
- [ ] Don't log full payloads — strip PII (customer email, address on outbound to 3PL not needed)

### 3.4 — Rollback Procedure
**If something breaks production, you need one page of steps.**
- [ ] Pause all webhook processing (feature flag: `WEBHOOKS_ENABLED=false`)
- [ ] Inventory snapshot to CSV
- [ ] Notify pilot: "Paused, investigating"
- [ ] Fix + redeploy
- [ ] Verify no duplicates before resume
- [ ] Restart webhook processing

---

## What to **Defer** (Post-Pilot)

| Feature | Why Later |
|---------|-----------|
| Rate limiter on Shopify calls | Phase 1A logs will show if you're hitting 429. Add proper token bucket after customer 2. |
| Inventory CAS in production | If stock updates fail, you'll see it in DLQ. Document workaround (manual reconciliation). |
| Multi-location inventory pools | Only needed if pilot has shared stock. Ask in Week −1. |
| Order Routing Function | Nice-to-have optimization. Middleware logic (fulfillmentOrderSplit/Move) is fine for now. |
| Billing & usage metering | You're piloting; charge a flat monthly fee or per-order after month 1. |
| Customer-facing tracking page | Not in scope for pilot. Promise it for v1.1. |
| AWS event-driven architecture | Run everything on Render for now. Migrate if you hit >1000 orders/day. |

---

## Weekly Milestones

### Week 1
- **Mon:** Pilot interview. Answer Phase 0 checklist.
- **Tue–Wed:** Idempotency + DLQ + manual override UI (1A)
- **Thu–Fri:** Deploy to Render, test end-to-end with real pilot SFTP creds (1B)
- **EOW:** One full order cycle (Shopify → 940 → SFTP → pilot WMS) working. Zero duplicates on retry.

### Week 2
- **Mon–Tue:** SFTP delivery log + observability dashboard (1A.3)
- **Wed–Thu:** Inventory sync IF needed (2.1), or skip if pilot doesn't need it
- **Fri:** Load test: send 100 orders rapid-fire, verify no lost orders, check for dups
- **EOW:** Production infra solid. Ops person can manually fix a broken order.

### Week 3–4
- **If splits needed:** Allocation logic (2.2)
- **Otherwise:** Improve error messages, build sample data, write docs
- **EOW:** Test with pilot on their real store (read-only or sandbox first)

### Week 5–6
- **Mon–Tue:** Onboarding flow (3.1), docs (3.2)
- **Wed:** Security audit (3.3)
- **Thu–Fri:** Dry-run cutover: shadow mode (compute what you'd do, log, don't actually ship)
- **EOW:** Ready for go-live

---

## Go-Live Readiness Checklist (Week 6 end)

- [ ] Zero test-loop duplicates on 10 retry cycles
- [ ] SFTP delivery log shows every sent file
- [ ] DLQ empty (or every error is understood + has a fix)
- [ ] Failed order can be retried from dashboard
- [ ] 945 inbound produces correct fulfillmentCreate (no duplicate shipments)
- [ ] Rollback documented + tested
- [ ] Pilot has a support contact (you, on Slack)
- [ ] Pilot data backed up daily (MongoDB Atlas snapshots)

---

## Post-Launch Iteration Loop

### Week 7: Hypercare
- [ ] You + one dev on call for any issues
- [ ] Daily sync with pilot: "What broke?"
- [ ] Log every error for v1.1 improvements

### Week 8: v1.1 Planning
- Based on real usage, prioritize:
  - Rate limiter if hitting 429 often
  - Better error messages based on what confused the pilot
  - Inventory CAS if oversells happened
  - Split logic if they needed it

---

## Code Refactors While You Build

**Don't refactor for perfection; refactor for clarity on what broke.**

- [ ] Extract SFTP logic to a standalone module (test it offline)
- [ ] Separate Shopify API calls from business logic (mock Shopify in tests)
- [ ] Move constants to config: HMAC secret, API version, WMS timeout, retry counts
- [ ] Comment every state transition (why we move from 940_ready to 940_sent)

---

## Budget Estimate

| Item | Cost | Notes |
|------|------|-------|
| Render hosting | $50–100/mo | Scales auto, pay per use first month |
| MongoDB Atlas | $9/mo | M0 free tier, M2 $9 if needed |
| Cloudflare (DNS + CDN) | $0 | Free tier sufficient |
| **Total** | **~$60/mo** | Per pilot. Charge them $500–2k/mo depending on volume. |

---

## Key Insight for Your Team

**This roadmap is not about feature completeness. It's about trust.**

Your first paying customer needs to know:
1. Orders never get lost (idempotency)
2. If something breaks, they can see it and I can fix it (DLQ + dashboard)
3. I can roll back in 5 minutes without losing data (versioning + audit log)

Features (splits, inventory CAS, rate limiting) come after they trust the system. Ship the foundation first.
