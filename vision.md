
Custom Point-to-Point Integration Architecture & Project Plan
Shopify Plus ↔ Custom Event-Driven Middleware ↔ Legacy 3PL/WMS
Document type: Technical architecture specification and phased delivery plan Prepared: August 2026 Target API version: Shopify Admin GraphQL 2026-07 (latest stable at time of writing) Status: Draft for client review — contains open questions requiring merchant/3PL input

Evidence & Confidence Conventions
This document distinguishes verified platform behaviour from architectural judgement. Every load-bearing platform claim carries a marker:

Marker	Meaning
[VERIFIED]	Confirmed against official Shopify documentation (shopify.dev) during preparation of this document, August 2026
[INFERENCE]	My architectural recommendation or reasoning, not a documented platform fact
[UNVERIFIED]	Plausible but I could not confirm it; must be checked before it is designed around
[OPEN]	Requires input from the merchant or 3PL; cannot be resolved from the brief
Shopify ships quarterly API versions and deprecates aggressively. Anything marked [VERIFIED] was true in August 2026 and should be re-checked at the start of Phase 1 and again before cutover. I am not able to guarantee the state of the platform at the time you read this.

⚠️ Section 0 — Corrections to the Source Brief
Four items in the incoming requirements are out of date or rest on an assumption I believe is unsafe. These are stated first because two of them change the architecture, not just the syntax.

0.1 fulfillmentCreateV2 is deprecated
The brief specifies fulfillmentCreateV2. This mutation is now marked deprecated in the Admin GraphQL API, with fulfillmentCreate named as the replacement. fulfillmentTrackingInfoUpdateV2 is likewise deprecated in favour of fulfillmentTrackingInfoUpdate. [VERIFIED]

Action: All tracking write paths in this design target fulfillmentCreate and fulfillmentTrackingInfoUpdate. Note there are community reports of scope/permission friction on fulfillmentCreate where fulfillmentCreateV2 succeeded — treat this as a Phase 2 spike, not a Phase 4 discovery. [UNVERIFIED — community report, not reproduced by me]

0.2 Shopify now provides native idempotency — and it becomes mandatory
This is the most consequential finding. Shopify supports an @idempotent(key: "...") GraphQL directive on selected mutations. For the inventory mutations central to Workflow A:

As of API version 2026-01, the idempotency key is optional.
As of API version 2026-04, the idempotency key is required and must be supplied via the @idempotent directive. [VERIFIED]
The directive also works with bulk operations, where idempotency is applied per JSONL row rather than per bulk job — which is precisely the semantics you want for a nightly reconciliation. [VERIFIED]

Architectural impact: The brief asks for a Redis-based idempotency layer (Section 4). That layer is still required — but its role narrows. It now guards middleware-side duplicate work and non-idempotent 3PL calls. Duplicate-write protection at Shopify should use the platform directive, because platform-enforced idempotency survives middleware cache loss, deploys, and region failover in a way a Redis key does not. Building only the Redis layer and skipping the directive will fail on 2026-04+.

0.3 inventorySetOnHandQuantities is deprecated, and compare-and-swap semantics changed
inventorySetOnHandQuantities is deprecated in favour of inventorySetQuantities. [VERIFIED]

Further, the concurrency-control fields on inventorySetQuantities were redesigned in 2026-01: compareQuantity and ignoreCompareQuantity are being deprecated in favour of a single changeFromQuantity field. Under the new model you pass an integer to enable the compare-and-swap check, or explicitly pass null to bypass it. [VERIFIED]

Architectural impact: This is a gift for Workflow A. Compare-and-swap on inventory writes is the correct mechanism for the out-of-order-delivery problem the brief raises in Section 4, and it is now first-class. Design detailed in §4.5.

0.4 The Shopify Functions routing assumption is high-risk
The brief assumes Shopify Functions (Order Routing) can carry the dynamic splitting logic. I would not architect on that assumption. Specifically:

The Order Routing Location Rule API is Shopify Plus only and access-gated — you must request access from Shopify. [VERIFIED]
Functions are deterministic by design: no clock access, no randomness. [VERIFIED]
Function network access (fetch) requires separate approval and is not available on development stores or in developer preview. [VERIFIED]
There is a public, unresolved developer report of a location rule function emitting correct rankings while Shopify's routing engine declined to split the order as documented. [UNVERIFIED as a general platform limitation — single unresolved report, but directly on point]
Taken together: a Function cannot reach your middleware for live 3PL capacity on a dev store, cannot use wall-clock time for cutoff logic, requires two separate Shopify approvals, and may not reliably produce the split you asked it to.

Recommended posture [INFERENCE]: Treat Functions as an optimisation, not the mechanism. Let Shopify perform initial routing, then have the middleware correct the allocation post-creation using fulfillmentOrderSplit and fulfillmentOrderMove, triggered on fulfillment_orders/order_routing_complete. This keeps all allocation logic in a system you can observe, test, version, and hotfix. Pursue the Function in parallel as a Phase 5+ latency optimisation once access is granted. Full rationale in §5.

Availability check required: confirm fulfillmentOrderSplit exists and behaves as needed in your pinned API version. I believe it was introduced around 2023-10 but did not verify it directly for this document. [UNVERIFIED]

Section 0.5 — Open Questions Blocking Final Design
These cannot be answered from the brief. Each materially changes the build. This list is the agenda for the Phase 1 discovery workshop.

#	Question	Why it changes the architecture
Q1	For each of the 5+ locations: is it merchant-managed, or should the middleware own it as a registered FulfillmentService?	Determines access scopes, whether you receive callback notifications or webhooks, and whether you may write inventory at all. This is the single biggest fork. See §1.2.
Q2	Does the legacy WMS emit a stock-adjustment push, or is "real-time webhook" in the brief aspirational?	The brief says the 3PL has "no native webhook capabilities" but Workflow A requires "real-time stock adjustment webhooks". These contradict. If there is no push, Workflow A degrades to polling + batch, changing the freshness SLA.
Q3	Is the 3PL's inventory feed absolute on-hand or delta? Is it authoritative?	Selects inventorySetQuantities (absolute, 3PL is source of truth) vs inventoryAdjustQuantities (delta). Shopify's own guidance is to use inventorySetQuantities only when acting for a system that is genuinely the source of truth. [VERIFIED]
Q4	Exact EDI envelope: true X12 940/945 with an AS2/VAN partner, or CSV-shaped "EDI-like" flat files over SFTP?	Determines whether you need an EDI translator and trading-partner onboarding (adds 3–4 weeks) or just a CSV serialiser. Brief says "EDI 940 / CSV / JSON SOAP" — three very different builds.
Q5	Peak order volume, peak line-items/order, SKU count, and location count at steady state?	Drives rate-limit budget (§4.1) and whether reconciliation fits in a bulk operation. No sizing was provided.
Q6	Do any locations share physical stock (same pool, two Shopify locations)?	Shared pools make per-location absolute sets unsafe and force an allocation ledger in the middleware.
Q7	Required inventory freshness SLA, expressed as an oversell tolerance?	"Real-time + hourly + daily" is a mechanism list, not an SLA. Buffer sizing (§5.3) is unsolvable without it.
Q8	Data residency and PII retention obligations by jurisdiction?	Drives region selection, encryption scope, and log redaction policy. Not stated in brief.
Section 1 — High-Level Architecture & Technical Stack
1.1 Design Principles
The middleware owns allocation truth; Shopify owns commerce truth; the WMS owns physical truth. Every field has exactly one authoritative writer. Ambiguity here is the root cause of most integration drift. [INFERENCE]
Canonical schema in the middle. Shopify and the 3PL never see each other's payload shapes. This is the difference between a P2P integration and point-to-point spaghetti, and it is what makes the second 3PL cost 30% of the first. [INFERENCE]
Every external call is idempotent or made idempotent. Platform directive where available (§0.2), middleware key where not.
Durable-first, then process. Webhooks are persisted and acknowledged before any business logic executes. Shopify's delivery window is short and its retry budget finite; never do work inside the ack path.
Legacy incapacity is absorbed, never propagated. Batch windows, SOAP, and non-standard errors terminate at the connector layer.
Replayability is a first-class feature. Any event must be re-drivable from the event store without side effects. This is the single most valuable property during cutover.
1.2 The Critical Fork: FulfillmentService vs. Order-Management App
Resolving Q1 selects one of two integration modes. They are not interchangeable.

Mode A — Middleware registers as a FulfillmentService (recommended for the 3PL nodes) [INFERENCE]

Registering via fulfillmentServiceCreate causes Shopify to automatically create an associated Location to which fulfillment orders are assigned. [VERIFIED] Shopify then notifies the service of fulfillment and cancellation requests by POSTing to {callbackUrl}/fulfillment_order_notification. [VERIFIED]

Note two changes: as of 2026-01 callbackUrl is optional on fulfillmentServiceCreate/Update — if omitted while inventoryManagement or trackingSupport are enabled, you must submit that data via the API instead of being polled. [VERIFIED] I recommend omitting the callback URL and driving everything through webhooks + API writes [INFERENCE]: it gives you one delivery mechanism to secure, observe, and replay instead of two, and it removes Shopify's fetch_stock/fetch_tracking_numbers polling from your latency budget.

Mode B — Order-management app on merchant-managed locations (for internal nodes)

The middleware holds write_merchant_managed_fulfillment_orders and drives fulfillmentOrderSubmitFulfillmentRequest itself. [VERIFIED] No auto-created location; the merchant owns the location record.

Recommendation: a hybrid. Internal nodes in Mode B, external 3PLs in Mode A, with the location-mapping table (§3.1) as the single reconciliation point. Required scopes span write_fulfillments, read_assigned_fulfillment_orders, write_assigned_fulfillment_orders, plus merchant-managed and third-party fulfillment-order scopes as applicable. [VERIFIED] Confirm the exact set against the access-scopes reference at Phase 1 — over-requesting scopes will slow app review.

1.3 Component Architecture
Observability & Recovery
Legacy 3PL / WMS
Egress Connectors
State Layer
Integration Core
Ingress / Trust Boundary
Shopify Plus
signed POST
persist first
replay path
split · move · hold
pull 945 · stock
nightly recon
exhausted
redrive
optional ranking
Webhook Subscriptions(EventBridge or HTTPS)
Admin GraphQL 2026-07
Order Routing Function(Phase 5+, gated)
Bulk Operations API
API Gateway + WAF
HMAC Verifier(constant-time compare)
Raw Event StoreS3 · immutable · WORM
Ingress QueueSQS FIFO by order_id
NormaliserShopify → Canonical
Allocation Enginerouting + split + reserve
Saga OrchestratorStep Functions
TransformerCanonical → 3PL
PostgreSQLorder state · mappingsallocation ledger · outbox
Redis / ElastiCacheidempotency · rate tokenshot inventory cache
Secrets Manager+ KMS CMK
Circuit Breaker + TokenBucket
SFTP / EDI Connector940 out · 945 in
REST / SOAP Connector
Batch PollerEventBridge Scheduler
SFTP Endpoint
REST / SOAP Endpoints
DLQ + Redrive
OpenTelemetry → Datadog
PagerDuty · Slack
Ops Consolereplay · manual override
1.4 Stack Recommendation
Assumes AWS. Equivalent GCP mappings noted. All effort/cost implications are [INFERENCE].

Concern	Recommendation	Rationale
Language	TypeScript on Node.js 22 LTS	Shopify's first-party libraries and Admin API typings are strongest in TS; the generated GraphQL types eliminate an entire class of mapping bug. Go is defensible if the team has depth, but you will hand-roll more Shopify plumbing.
Compute — ingress	Lambda behind API Gateway	Webhook ack must be sub-second and bursty. Serverless is the right shape.
Compute — workers	ECS Fargate, not Lambda	Long-lived SFTP sessions, EDI translation, and a stateful shared rate-limit budget are hostile to Lambda's concurrency model. Fargate lets one process own the Shopify token bucket.
Queue	SQS FIFO, MessageGroupId = shopify_order_id	Guarantees per-order ordering — this is the primary mitigation for the out-of-order problem in §4.4 — while retaining cross-order parallelism. GCP: Pub/Sub with ordering keys.
Orchestration	AWS Step Functions	Multi-step sagas with compensations across two systems need visual, durable state. Hand-rolled state machines in code become unauditable by month six.
Relational store	Aurora PostgreSQL Serverless v2	Needs ACID for the allocation ledger and transactional outbox. JSONB for canonical payload snapshots.
Cache / coordination	ElastiCache Redis	Idempotency keys, distributed rate-limit tokens, hot inventory. Never the sole record of anything.
Secrets	Secrets Manager + KMS CMK, rotation enabled	3PL SFTP keys and Shopify tokens. Automatic rotation for SFTP creds is usually blocked by the 3PL — expect manual rotation runbooks. [OPEN]
Observability	OpenTelemetry SDK → Datadog	Vendor-neutral instrumentation. Non-negotiable: propagate a correlation_id derived from shopify_order_id across every hop including EDI filenames. Without it, exception triage is archaeology.
Alerting	Datadog Monitors → PagerDuty (P1/P2), Slack (P3)	
Ops console	Internal app: DLQ inspection, event replay, manual allocation override	Frequently cut for budget, then rebuilt in a panic during week 11. Fund it in Phase 2.
Webhook transport: prefer EventBridge over HTTPS [INFERENCE]
Shopify supports delivering webhooks to Amazon EventBridge as an alternative to HTTPS endpoints. Where available for your topics, this is the stronger choice: it removes your public endpoint from the attack surface, removes HMAC verification from the hot path, and Shopify's delivery guarantees land against AWS infrastructure rather than your gateway's availability. Verify topic coverage for the fulfillment_orders/* family before committing. [UNVERIFIED for this specific topic family]

If HTTPS is used, HMAC verification is mandatory — see §1.5.

1.5 Security & Compliance
Webhook authentication. Verify the X-Shopify-Hmac-Sha256 header: base64-encoded HMAC-SHA256 of the raw, unparsed request body using the app's client secret, compared in constant time. Two failure modes cause most real breaches here: (a) verifying a re-serialised body instead of raw bytes, and (b) using ==, which leaks via timing. Reject on failure with 401 and alert — repeated failures indicate either a rotated secret or an active probe. [VERIFIED mechanism; header name high confidence]

Deduplication at ingress. Shopify may deliver a webhook more than once. Use the webhook/event ID header as the dedupe key with a TTL exceeding Shopify's retry window. Confirm the exact header name against the current webhooks reference. [UNVERIFIED — I believe it is X-Shopify-Webhook-Id, but did not confirm]

Ack discipline. Return 2xx immediately after durable persist. Shopify enforces a short response timeout and retries a bounded number of times before disabling the subscription. I did not verify the current timeout or retry count and you should not design around specific values — design so the ack path does no work at all, which is correct under any policy. [UNVERIFIED — check the webhooks reference]

Encryption. TLS 1.3 in transit (1.2 floor where the 3PL cannot negotiate 1.3 — expect this [OPEN]). AES-256 at rest via KMS CMK on RDS, S3, and SQS. SFTP over SSH with key-based auth; disable password auth.

PII minimisation. The 3PL needs a ship-to address and a contact method. It does not need customer email, marketing consent, payment metadata, or lifetime order history. Strip at the transformer, not at the connector. Log payloads with a redaction allowlist — allowlist, not denylist, because the denylist will miss the field added next quarter.

Protected customer data. Shopify gates access to customer PII behind Protected Customer Data approval, which is a prerequisite for fulfillment-service apps. [VERIFIED] This is an approval lead time on the critical path — file it in Phase 1 Week 1, not Phase 4. [INFERENCE]

Retention. Raw events in S3 with Object Lock, lifecycle to Glacier. Canonical records retained per the merchant's policy. Right-to-erasure requests must be satisfiable across raw store, canonical store, and 3PL — confirm the 3PL can honour deletion, as many legacy WMS platforms cannot. [OPEN]

Section 2 — Workflow Sequence Diagrams
2.1 Order Ingestion, Allocation Correction & 3PL Transmission
Note the ordering: Shopify routes first, the middleware corrects, and only then transmits. This is the §0.4 recommendation made concrete.

sequenceDiagram
    autonumber
    participant S as Shopify Plus
    participant GW as Gateway/HMAC
    participant EV as Event Store
    participant Q as SQS FIFO
    participant AL as Allocation Engine
    participant DB as PostgreSQL
    participant SG as Saga Orchestrator
    participant TR as Transformer
    participant CB as Circuit Breaker
    participant T as Legacy 3PL

    S->>GW: POST fulfillment_orders/order_routing_complete
    GW->>GW: Verify HMAC (constant-time)
    GW->>EV: Persist raw payload
    GW->>Q: Enqueue (MessageGroupId = order_id)
    GW-->>S: 200 OK
    Note over GW,S: Ack before any business logic

    Q->>AL: Deliver event
    AL->>DB: Upsert order, state = RECEIVED
    AL->>S: query order + fulfillmentOrders + risk assessment
    S-->>AL: FulfillmentOrder[] + risk level

    alt Risk flagged / AVS fail / high value
        AL->>S: fulfillmentOrderHold(reason, notifyMerchant)
        AL->>DB: state = ON_HOLD
        AL->>SG: Emit hold-review task
        Note over AL,SG: No 3PL transmission. Awaits<br/>fulfillment_orders/hold_released
    else Cleared
        AL->>AL: Evaluate allocation plan (see §5.2)
        opt Shopify allocation differs from plan
            AL->>S: fulfillmentOrderSplit(lineItems)
            AL->>S: fulfillmentOrderMove(newLocationId)
            Note over AL,S: Correcting Shopify's routing.<br/>Each mutation costs 10 points.
        end
        AL->>DB: Write allocation ledger + reserve buffer
        AL->>SG: Start saga per fulfillment order
        SG->>TR: Transform to canonical, then 3PL format
        TR->>TR: SKU normalise, ship-method map, address format
        alt Transform validation fails
            TR->>DB: state = EXCEPTION_MAPPING
            TR->>SG: Halt, alert P2, do not transmit
        else Valid
            TR->>CB: Deliver (EDI 940 / CSV / SOAP)
            alt Breaker open or 3PL down
                CB->>DB: Enqueue store-and-forward
                Note over CB,DB: Retained; drained on recovery.<br/>Shopify state unchanged.
            else Accepted
                CB->>T: Transmit
                T-->>CB: ACK (997 or HTTP 2xx)
                CB->>DB: state = SENT_TO_3PL, persist 3PL ref
                SG->>S: fulfillmentOrderAcceptFulfillmentRequest
            end
        end
    end
2.2 Shipment Confirmation & Tracking Sync
Shopify Plus
Rate Governor
Saga Orchestrator
PostgreSQL
945 Parser
Batch Poller
Legacy 3PL
Shopify Plus
Rate Governor
Saga Orchestrator
PostgreSQL
945 Parser
Batch Poller
Legacy 3PL
alt
[Hash already
processed]
[New file]
loop
[Scheduled poll]
Confirmation beat transmission.
Retried on arrival. See §4.4.
Ship the order. Never block
a real shipment on a lookup miss.
alt
[Carrier unmapped]
[Mapped]
alt
[Order unknown (out-of-order arrival)]
[Correlated]
alt
[Permanent (already fulfilled, qty
mismatch)]
[Transient (THROTTLED)]
alt
[userErrors returned]
[Success]
NOT fulfillmentTrackingInfoUpdateV2 (deprecated)
opt
[Later tracking revision]
List /outbound (SFTP)
1
945 / shipconfirm files
2
Register file hash (dedupe)
3
Discard, log
4
Parse
5
Resolve 3PL ref → fulfillment_order_id
6
Park in pending_correlation, TTL 24h
7
Normalise carrier code, validate tracking
8
state = EXCEPTION_CARRIER
9
fulfillmentCreate with company only, no URL
10
Queue fulfillment write
11
Request budget
12
Check token bucket vs throttleStatus
13
Granted
14
fulfillmentCreate(lineItemsByFulfillmentOrder,
trackingInfo, notifyCustomer: true)
15
extensions.cost.throttleStatus
16
Update budget from live throttleStatus
17
Classify permanent vs transient
18
state = EXCEPTION_RECONCILE, P2 alert
19
Backoff, requeue
20
state = FULFILLED
21
Updated tracking
22
fulfillmentTrackingInfoUpdate
23
2.3 Inventory Sync — Delta and Full Reconciliation
Shopify Plus
PostgreSQL
Redis
Inventory Engine
Poller / Scheduler
Legacy WMS
Shopify Plus
PostgreSQL
Redis
Inventory Engine
Poller / Scheduler
Legacy WMS
Delta path — hourly
Never guess a mapping.
An unmapped SKU is an ops task.
Largest single rate-limit saving
in the whole system.
Correct behaviour. A conflict means
a concurrent writer, not a bug.
alt
[Compare-and-swap conflict]
[Applied]
alt
[No change]
[Changed]
alt
[Mapping missing]
[Resolved]
Full reconciliation — nightly, low traffic
Mass drift means a broken mapping
or a bad WMS export. Do NOT
auto-apply thousands of writes.
Bulk ops are exempt from
single-query cost and rate limits.
alt
[Drift beyond threshold]
[Within tolerance]
Fetch 846 / stock delta
1
Rows (wms_location, sku, qty)
2
Batch
3
Resolve WMS loc → Shopify Location GID
4
Resolve SKU → InventoryItem GID
5
Quarantine row, P3 alert
6
Apply buffer: sellable = onhand - reserve
7
Compare vs last-known
8
Suppress write
9
inventorySetQuantities @idempotent(key)
changeFromQuantity = last-known
10
userError
11
Re-read current, recompute, retry (max 3)
12
Update last-known
13
Append audit row
14
Fetch full snapshot
15
All SKU × location
16
Snapshot
17
bulkOperationQuery: InventoryLevel by location
18
JSONL result URL
19
Three-way diff (WMS vs Shopify vs ledger)
20
Persist drift report
21
Freeze auto-correct, P1 alert
22
Bulk mutation, @idempotent per JSONL row
23
Why bulk operations for reconciliation [VERIFIED]: bulk operations do not carry the max-cost or rate limits that single queries face. A nightly full reconciliation over a large catalogue is the canonical use case, and attempting it through single queries will consume the entire daily rate budget.

Section 3 — Canonical Data Contracts & Field Mapping
3.1 Mapping Tables (PostgreSQL — the integration's backbone)
These four tables are the highest-value artefact in the build. Every unmapped value must fail loudly into a queue a human works, never silently default.

sql
-- Location topology. One row per Shopify location.
CREATE TABLE location_map (
  shopify_location_gid   TEXT PRIMARY KEY,
  wms_location_code      TEXT NOT NULL,
  node_type              TEXT NOT NULL,  -- INTERNAL | PRIMARY_3PL | REGIONAL_3PL
  integration_mode       TEXT NOT NULL,  -- FULFILLMENT_SERVICE | MERCHANT_MANAGED
  fulfillment_service_id TEXT,
  service_zones          JSONB NOT NULL, -- ["ON","QC"] postal/state coverage
  cost_rank              INT  NOT NULL,
  cutoff_time_local      TIME NOT NULL,
  timezone               TEXT NOT NULL,
  supports_split         BOOLEAN NOT NULL DEFAULT TRUE,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  shares_pool_with       TEXT REFERENCES location_map(shopify_location_gid), -- Q6
  UNIQUE (wms_location_code)
);

-- SKU identity. Legacy WMS SKU rules rarely match Shopify's.
CREATE TABLE sku_map (
  shopify_variant_gid   TEXT PRIMARY KEY,
  shopify_sku           TEXT NOT NULL,
  inventory_item_gid    TEXT NOT NULL,
  wms_sku               TEXT NOT NULL,
  wms_uom               TEXT NOT NULL DEFAULT 'EA',
  units_per_wms_uom     INT  NOT NULL DEFAULT 1,  -- case-pack handling
  requires_serial       BOOLEAN NOT NULL DEFAULT FALSE,
  requires_lot          BOOLEAN NOT NULL DEFAULT FALSE,
  is_bundle             BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (wms_sku)
);

-- Shipping method translation. A frequent silent-failure source.
CREATE TABLE ship_method_map (
  shopify_service_code  TEXT NOT NULL,
  destination_country   TEXT NOT NULL DEFAULT '*',
  wms_ship_code         TEXT NOT NULL,
  carrier_scac          TEXT,
  edi_service_level     TEXT,
  PRIMARY KEY (shopify_service_code, destination_country)
);

-- Carrier normalisation for inbound tracking.
CREATE TABLE carrier_map (
  wms_carrier_code      TEXT PRIMARY KEY,
  shopify_company_name  TEXT NOT NULL,  -- must match Shopify's recognised list
  tracking_url_template TEXT,
  is_shopify_recognised BOOLEAN NOT NULL DEFAULT TRUE
);
Practical note [INFERENCE]: Shopify auto-generates tracking URLs when company matches a carrier it recognises. Supplying both a recognised company and a custom URL can produce inconsistent customer-facing links. Set company alone for recognised carriers; supply url only for regional carriers Shopify does not know. Verify current behaviour against the FulfillmentTrackingInput reference. [UNVERIFIED]

3.2 Canonical Fulfillment Request Schema
The stable contract. Shopify changes; the 3PL changes; this does not.

json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CanonicalFulfillmentRequest",
  "type": "object",
  "required": ["envelope", "order", "allocation", "shipTo", "lines"],
  "properties": {
    "envelope": {
      "type": "object",
      "required": ["messageId", "correlationId", "schemaVersion", "emittedAt", "idempotencyKey"],
      "properties": {
        "messageId":      { "type": "string", "format": "uuid" },
        "correlationId":  { "type": "string", "description": "Derived from shopify order id; spans all hops" },
        "schemaVersion":  { "type": "string", "const": "1.0.0" },
        "emittedAt":      { "type": "string", "format": "date-time" },
        "idempotencyKey": { "type": "string", "description": "UUID; reused verbatim on every retry" },
        "replayOf":       { "type": ["string", "null"] }
      }
    },
    "order": {
      "type": "object",
      "required": ["shopifyOrderGid", "orderName", "placedAt"],
      "properties": {
        "shopifyOrderGid":     { "type": "string" },
        "fulfillmentOrderGid": { "type": "string" },
        "orderName":           { "type": "string", "description": "Human ref, e.g. #1001" },
        "placedAt":            { "type": "string", "format": "date-time" },
        "isB2B":               { "type": "boolean", "default": false },
        "poNumber":            { "type": ["string", "null"] },
        "riskLevel":           { "enum": ["NONE", "LOW", "MEDIUM", "HIGH"] },
        "giftMessage":         { "type": ["string", "null"] }
      }
    },
    "allocation": {
      "type": "object",
      "required": ["shopifyLocationGid", "wmsLocationCode", "allocationReason"],
      "properties": {
        "shopifyLocationGid": { "type": "string" },
        "wmsLocationCode":    { "type": "string" },
        "allocationReason":   { "enum": ["SINGLE_SOURCE", "PROXIMITY", "COST", "SPLIT_AVAILABILITY", "FALLBACK_BACKORDER", "MANUAL_OVERRIDE"] },
        "isPartialShipment":  { "type": "boolean" },
        "splitGroupId":       { "type": ["string", "null"], "description": "Links sibling splits of one order" },
        "sequence":           { "type": "integer", "minimum": 1 },
        "ofTotal":            { "type": "integer", "minimum": 1 }
      }
    },
    "shipTo": {
      "type": "object",
      "required": ["name", "line1", "city", "countryCode"],
      "properties": {
        "name":         { "type": "string", "maxLength": 35, "description": "EDI N1 constraint" },
        "company":      { "type": ["string", "null"], "maxLength": 35 },
        "line1":        { "type": "string", "maxLength": 55 },
        "line2":        { "type": ["string", "null"], "maxLength": 55 },
        "city":         { "type": "string", "maxLength": 30 },
        "provinceCode": { "type": ["string", "null"], "maxLength": 2 },
        "postalCode":   { "type": ["string", "null"] },
        "countryCode":  { "type": "string", "minLength": 2, "maxLength": 2 },
        "phone":        { "type": ["string", "null"] },
        "isResidential":{ "type": ["boolean", "null"] },
        "avsStatus":    { "enum": ["VERIFIED", "CORRECTED", "UNVERIFIED", "FAILED"] }
      }
    },
    "shipping": {
      "type": "object",
      "properties": {
        "shopifyServiceCode": { "type": "string" },
        "wmsShipCode":        { "type": "string" },
        "carrierScac":        { "type": ["string", "null"] },
        "requestedShipDate":  { "type": ["string", "null"], "format": "date" },
        "isExpedited":        { "type": "boolean", "default": false }
      }
    },
    "lines": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["fulfillmentOrderLineItemGid", "wmsSku", "quantity"],
        "properties": {
          "fulfillmentOrderLineItemGid": { "type": "string" },
          "shopifyVariantGid":           { "type": "string" },
          "shopifySku":                  { "type": "string" },
          "wmsSku":                      { "type": "string" },
          "quantity":                    { "type": "integer", "minimum": 1 },
          "wmsUom":                      { "type": "string", "default": "EA" },
          "requiresSerial":              { "type": "boolean" },
          "requiresLot":                 { "type": "boolean" },
          "unitPrice":                   { "type": ["number", "null"] }
        }
      }
    }
  }
}
3.3 Field Mapping — Shopify → Canonical → EDI 940
[VERIFIED] for Shopify field paths. [UNVERIFIED] for the specific EDI segment/element positions — these are from general X12 knowledge and must be validated against the 3PL's published implementation guide, which always contains partner-specific deviations. Do not treat this column as authoritative.

Shopify GraphQL path	Canonical	EDI 940 (indicative)	Transformation
fulfillmentOrder.id	order.fulfillmentOrderGid	W05-02 (Depositor Order No.)	Strip gid://shopify/FulfillmentOrder/. Use the FO id, not the order id — one order yields many FOs.
order.name	order.orderName	W05-03	Strip leading #. Human reference only.
order.poNumber	order.poNumber	N9*PO	B2B/draft orders only; null on DTC.
fulfillmentOrder.assignedLocation.location.id	allocation.shopifyLocationGid	N1*WH	Join location_map. Fail hard if absent.
fulfillmentOrder.destination.firstName + lastName	shipTo.name	N1*ST-02	Concatenate, collapse whitespace, truncate to 35. Log truncation.
destination.address1 / address2	shipTo.line1 / line2	N3-01 / N3-02	Truncate 55. If line2 overflows, append to line1 before dropping — never silently discard address data.
destination.city	shipTo.city	N4-01	Truncate 30.
destination.province	shipTo.provinceCode	N4-02	Must be 2-char code, not name. Normalise via lookup.
destination.countryCode	shipTo.countryCode	N4-04	ISO 3166-1 alpha-2.
destination.zip	shipTo.postalCode	N4-03	Strip spaces for CA (M5V 3A8 → M5V3A8) only if the 3PL requires it [OPEN]. Zero-pad US 5-digit.
destination.phone	shipTo.phone	PER*IC	E.164. If null, fall back to store support number — many carriers reject missing phone on residential.
order.shippingLine.code	shipping.shopifyServiceCode	W66-01 + W66-05	Join ship_method_map on (code, country). Unmapped → hard fail, do not default to Ground. A wrong service level is worse than a held order.
fulfillmentOrderLineItem.id	lines[].fulfillmentOrderLineItemGid	W01 loop ref	Required for the return fulfillmentCreate call.
lineItem.sku	lines[].shopifySku → wmsSku	W01-04 (W01-03 = VN)	Join sku_map. Case-normalise.
fulfillmentOrderLineItem.remainingQuantity	lines[].quantity	W01-01	Use remainingQuantity, not totalQuantity. totalQuantity re-ships already-fulfilled units on a partial. This is the single most common duplicate-shipment bug in Shopify 3PL integrations. [INFERENCE — high confidence]
—	lines[].wmsUom	W01-02	From sku_map. Divide quantity by units_per_wms_uom for case-pack SKUs; reject non-integer results into exceptions.
order.riskLevel (via risk assessment)	order.riskLevel	not transmitted	Gates transmission (§2.1). Never sent to 3PL.
order.customer.email	excluded	excluded	PII minimisation. 3PL does not need it.
3.4 Field Mapping — 945 → fulfillmentCreate
Target mutation is fulfillmentCreate, not fulfillmentCreateV2. [VERIFIED]

945 source (indicative)	Canonical	FulfillmentInput path	Transformation
W06-02	shipment.orderRef	(resolves FO id)	Lookup fulfillment_order_id. Unresolved → pending_correlation (§4.4).
W27-02	shipment.carrierScac	trackingInfo.company	Join carrier_map. Unmapped → transmit company string only, flag P3.
W12 / W27 tracking	shipment.trackingNumbers[]	trackingInfo.numbers[]	Strip whitespace. Deduplicate. Multi-parcel → array in one call.
—	—	trackingInfo.url	Omit for Shopify-recognised carriers; set only for unrecognised regional carriers.
W12-01 shipped qty	lines[].quantityShipped	lineItemsByFulfillmentOrder[].fulfillmentOrderLineItems[].quantity	Must not exceed remainingQuantity. Excess → EXCEPTION_OVERSHIP, do not clamp silently.
W12-02 SKU	—	fulfillmentOrderLineItemId	Reverse-join sku_map, then resolve to the FO line item GID.
Serial / lot	lines[].serials[]	no native field	Store in middleware; surface via order metafield or note. Shopify has no first-class serial field on fulfillments. [INFERENCE]
—	—	notifyCustomer	true for DTC first shipment. false for B2B and for backfill/replay writes — otherwise cutover replay emails every customer twice.
—	—	originAddress	Set where the 3PL origin differs from the Shopify location address.
Grouping constraint: a single fulfillmentCreate call covers fulfillment orders belonging to the same order and assigned to the same location. [VERIFIED] There are also historical reports of Shopify rejecting payloads containing duplicate fulfillment order IDs. [UNVERIFIED — community report] Group your writes accordingly: one call per (order, location) tuple, never one call per line item.

Section 4 — Exception Handling, Resiliency & Edge Cases
4.1 Shopify Rate Limiting
Verified mechanics [VERIFIED]:

GraphQL Admin API uses calculated query cost on a leaky bucket, scoped to the app + store combination — your app's usage is isolated from other apps on the same store.
Restore rates: Standard 100 pts/s · Advanced 200 pts/s · Shopify Plus 1000 pts/s · Commerce Components 2000 pts/s.
Field costs: scalars and enums 0, objects 1, connections sized by first/last, mutations 10, interfaces/unions the max of possible selections.
A single query may not exceed 1,000 points, regardless of plan.
Both a requested cost (pre-execution, worst case) and an actual cost (post-execution) are computed; the bucket is refunded the difference.
Input arrays cap at 250 items.
Every response carries extensions.cost.throttleStatus with maximumAvailable, currentlyAvailable, restoreRate.
Shopify-GraphQL-Cost-Debug: 1 returns a per-field cost breakdown.
Shopify may temporarily reduce rate limits to protect platform stability.
Implementation [INFERENCE]:

Never hardcode the bucket. Read throttleStatus.maximumAvailable and restoreRate from live responses into a Redis-backed distributed token bucket. The published table gives restore rates, not bucket sizes, and Shopify reserves the right to reduce limits without notice. A hardcoded constant is a latent outage.
Budget by workload class. Reserve ~60% for real-time order/fulfillment paths, ~30% for inventory deltas, ~10% headroom. Real-time work must be able to starve inventory sync, never the reverse — a late stock update costs an oversell; a late fulfillment write costs customer trust.
Request first: conservatively. Requested cost assumes the worst case. first: 250 reserves the full 250 even when 3 rows return. Page with first: 25.
Debug costs in CI. Run the cost-debug header against every production query in a test and fail the build on regression above threshold. Query cost creeps silently as fields are added.
On THROTTLED: never tight-retry. Compute wait from (requestedCost − currentlyAvailable) / restoreRate, add jitter, requeue. Shopify's own guidance suggests roughly one second as a baseline backoff, but the computed value is strictly better.
Bulk operations for anything large — exempt from single-query cost and rate limits.
4.2 Legacy 3PL Downtime
Failure	Detection	Response	Alert
SFTP connection refused	Connect timeout 10s	Circuit breaker: 5 failures/60s → open 5 min, half-open probe	P3 → P2 at 15 min
SFTP auth failure	Immediate	Do not retry (lockout risk). Open breaker, page.	P1
REST/SOAP 5xx	HTTP status	Exponential backoff 1/2/4/8/16s + jitter, 5 attempts	P3 → P2 at 5 fails
REST/SOAP timeout	30s	Same, but treat as indeterminate — the call may have succeeded. Requires idempotency key; if none available, query 3PL state before retry.	P2
HTTP 200 with error body	Body inspection	Legacy systems return 200 on failure. Validate body, never status alone. Classify permanent vs transient.	P2
Expected file absent	Scheduled poll	Alert only after grace period (batch jobs run late). Escalate at 2× expected interval.	P3 → P1
Malformed EDI/CSV	Schema validation	Quarantine whole file, do not partially process. Alert with parse offset.	P2
Partial file (mid-write)	Size stable + trailer present	Skip until stable across two polls. Prefer .done sentinel files. [OPEN]	—
Store-and-forward is the core pattern. When the breaker is open, outbound messages persist to the outbox table with state = PENDING_3PL. Shopify state remains untouched — no fulfillment request is accepted, no customer is notified. On recovery, drain in FIFO order per order at a throttled rate. Do not thundering-herd a 3PL that just came back up; you will knock it over again and lose credibility with their ops team.

4.3 Data Quality Exceptions
Scenario	Behaviour	Rationale
SKU absent from sku_map	Halt that FO. EXCEPTION_UNMAPPED_SKU. Ops queue. Never pass through the raw Shopify SKU.	A guessed SKU ships the wrong product. A held order ships late. Late beats wrong.
Shipping method unmapped	Halt. EXCEPTION_UNMAPPED_SHIPMETHOD.	Defaulting to Ground on an express order is a chargeback and a support ticket.
AVS failure / undeliverable	fulfillmentOrderHold with reason. Notify merchant. Await correction, then release.	Shopify's hold mechanism keeps the merchant in the loop natively rather than stranding the order in middleware only ops can see.
Address exceeds EDI field length	Truncate per §3.3 with structured warning log. Fail if line1 or city would truncate.	Some loss is survivable; losing the street is not.
3PL reports stockout after acceptance	fulfillmentOrderRejectFulfillmentRequest with reason, re-run allocation, attempt fallback location. If none, hold + notify.	Reject is the correct primitive. Cancelling the FO loses the audit trail.
Ships more than requested	EXCEPTION_OVERSHIP. Fulfil up to remainingQuantity, flag remainder.	Never let a 3PL over-fulfil into Shopify — it corrupts financial reconciliation downstream.
Split shipment, partial arrival	Normal path. fulfillmentCreate per (order, location) group. notifyCustomer: true on first only.	
Duplicate 945 for same shipment	File-hash dedupe + fulfillment_order_id state check	Two layers, because legacy SFTP re-drops files routinely.
4.4 Out-of-Order Execution
Four defences, layered:

SQS FIFO with MessageGroupId = shopify_order_id. Serialises all events for one order while preserving cross-order concurrency. Eliminates most of the class.
pending_correlation parking (24h TTL). A 945 arriving before transmission completes parks rather than errors. Re-drive on transmission completion. Alert if TTL expires — that is a genuine anomaly, not a race.
State machine with explicit legal transitions. RECEIVED → ALLOCATED → SENT_TO_3PL → ACCEPTED → FULFILLED, plus ON_HOLD, EXCEPTION_*, CANCELLED. Reject illegal transitions and log them; do not coerce.
Monotonic sequencing on inventory. Every write carries the source watermark (WMS export timestamp or sequence). A write whose watermark predates the last applied write for that (item, location) is dropped, not applied. Prevents a slow batch from reverting a fresh real-time update — the classic phantom-oversell cause.
4.5 Idempotency Strategy
Three complementary layers. The first is new and mandatory; do not skip it.

Layer 1 — Platform idempotency (Shopify-side) [VERIFIED]

Use the @idempotent(key: $uuid) directive on every mutation that accepts it. For inventorySetQuantities / inventorySetOnHandQuantities / inventoryAdjustQuantities, this is optional from 2026-01 and required from 2026-04. Generate a UUID once, persist it with the outbound record, and reuse it verbatim on every retry. Regenerating the key on retry defeats the entire mechanism — this is the most common implementation error. For bulk mutations, pass the key per JSONL row; idempotency applies per row, not per job.

Layer 2 — Compare-and-swap on inventory [VERIFIED]

Supply changeFromQuantity (2026-01+; previously compareQuantity) with the last-known value. A mismatch means a concurrent writer touched the level — re-read, recompute, retry, bounded at 3 attempts. Bypass by passing null only for the nightly reconciliation where the WMS is definitionally authoritative. Shopify explicitly warns that opting out of the comparison check risks inaccurate quantities under concurrency. Treat blanket bypass as a design smell.

Layer 3 — Middleware idempotency (for the 3PL side and internal work)

The 3PL almost certainly has no idempotency support. Compensate:

Guard	Key	TTL	Purpose
Webhook dedupe	Shopify webhook/event ID	> retry window	Shopify at-least-once delivery
Payload dedupe	sha256(canonical_payload) minus envelope	7d	Catches semantically identical redeliveries with new message IDs
Outbound EDI dedupe	(fulfillment_order_id, attempt_generation)	Permanent (DB)	Prevents duplicate 940 for one FO
Inbound file dedupe	sha256(file_bytes) + filename	30d	Legacy SFTP re-drops
Fulfillment write guard	(fulfillment_order_id, line_hash) in Postgres UNIQUE	Permanent	Last line of defence against duplicate customer shipping notifications
Redis is a cache, not a record. Every idempotency decision that must survive a Redis flush is also written to Postgres. Redis is the fast path; Postgres is the truth. A cache eviction must degrade throughput, never correctness.

4.6 Alert Routing
Severity	Trigger	Route	Target response
P1	Order flow stopped >15 min; auth failure; inventory drift beyond threshold; DLQ depth >50	PagerDuty, wake	15 min
P2	Single order stuck >1h; mapping exception; 3PL breaker open >15 min; sustained throttling	PagerDuty business hours + Slack	4 h
P3	Unmapped carrier; truncation warning; late batch within grace	Slack + daily digest	Next business day
Section 5 — Multi-Warehouse Routing Logic
5.1 Where the Logic Lives
Restating §0.4 because it drives everything below. Allocation logic lives in the middleware, not in a Shopify Function. Shopify performs initial routing; the middleware corrects it via fulfillmentOrderSplit and fulfillmentOrderMove on fulfillment_orders/order_routing_complete.

Why [INFERENCE]: the Function path requires two separate Shopify approvals (Order Routing API access, plus network access for fetch), cannot use wall-clock time for cutoff logic due to the determinism constraint [VERIFIED], cannot reach your middleware at all on a development store [VERIFIED], and has at least one public unresolved report of correct rankings not producing the expected split [UNVERIFIED]. Middleware logic is testable, observable, versionable, and hotfixable on your release cadence rather than Shopify's.

Trade-off, stated honestly: correcting after the fact means the customer may briefly see a different fulfillment location in the admin, and you spend mutation cost (10 points each) on splits and moves that a Function would have avoided. For a Plus store at 1000 pts/s this is not a real constraint. Revisit the Function once access is granted and the middleware logic has stabilised.

5.2 Allocation Decision Tree
Fail
Pass
Yes, one
Yes, several
No
Yes
No
Yes
No
No
Yes
Yes
No
order_routing_completereceived
Risk / AVS / value gate
fulfillmentOrderHoldnotify merchantawait hold_released
Load line items(remainingQuantity)
Build candidate set:active, zone-eligible, beforecutoff
Any candidatefully in stock?
Allocate whole orderreason = SINGLE_SOURCE
Rank: zone match >cost_rank > capacity
Allocate to winnerreason = PROXIMITY orCOST
Greedy set cover:minimise parcel count
All linescoverable?
Split into N groupsreason =SPLIT_AVAILABILITY
Partition: coverablevs uncoverable
Ship coverable now
Fallback node hasinbound ETA?
Route to fallbackreason =FALLBACK_BACKORDERset fulfillment deadline
Hold backordered lines onlynotify merchant
Compare plan vsShopify's assignment
Differs?
Reserve bufferwrite ledger
fulfillmentOrderSplitthen fulfillmentOrderMove
Mutations succeeded?
EXCEPTION_ALLOCATIONP2 · fall back toShopify's assignment
Transmit to 3PL
Note the failure posture at U: if the correction mutations fail, ship from wherever Shopify assigned rather than blocking. A suboptimal shipping cost is a rounding error; an unshipped order is a refund. [INFERENCE]

5.3 Allocation Pseudocode
typescript
type AllocationPlan = {
  groups: Array<{
    shopifyLocationGid: string;
    lineItems: Array<{ foLineItemGid: string; quantity: number }>;
    reason: AllocationReason;
  }>;
  backordered: Array<{ foLineItemGid: string; quantity: number }>;
};

async function planAllocation(
  fo: FulfillmentOrder,
  destination: Address
): Promise<AllocationPlan> {

  // 1. Candidate locations. Cutoff evaluated in each location's own timezone —
  //    a common bug is comparing against UTC and shipping a day late.
  const candidates = (await locationMap.active())
    .filter(loc => zoneMatches(loc.serviceZones, destination))
    .filter(loc => isBeforeCutoff(loc.cutoffTimeLocal, loc.timezone, now()))
    .sort((a, b) =>
      zoneRank(a, destination) - zoneRank(b, destination) ||
      a.costRank - b.costRank
    );

  if (candidates.length === 0) {
    // Zone rules excluded everything. Do NOT silently fall back to any
    // location — that is how orders ship from the wrong continent.
    throw new AllocationException("NO_ELIGIBLE_LOCATION", fo.id);
  }

  // 2. Sellable = on-hand minus buffer. Buffer is per (location, velocity band),
  //    not a global constant: a fast-moving SKU needs more protection than a
  //    slow one at the same absolute quantity.
  //    NOTE: buffer sizing is unsolvable without the oversell tolerance in Q7.
  const sellable = new Map<string, Map<string, number>>();
  for (const loc of candidates) {
    for (const line of fo.lineItems) {
      const onHand = await inventory.get(loc.gid, line.inventoryItemGid);
      const reserved = await ledger.reservedFor(loc.gid, line.inventoryItemGid);
      const buffer = bufferFor(loc, line);
      sellable.get(loc.gid)!.set(
        line.inventoryItemGid,
        Math.max(0, onHand - reserved - buffer)
      );
    }
  }

  // 3. Single-source preferred. Shopify's own default strategy minimises
  //    split fulfillments, and so should we: each additional parcel adds
  //    shipping cost, packaging, and a second "where is my order" contact.
  const single = candidates.find(loc => coversAll(sellable.get(loc.gid)!, fo.lineItems));
  if (single) {
    return {
      groups: [{
        shopifyLocationGid: single.gid,
        lineItems: fo.lineItems.map(toAlloc),
        reason: candidates[0].gid === single.gid ? "PROXIMITY" : "COST"
      }],
      backordered: []
    };
  }

  // 4. Greedy set cover. Not provably optimal, but O(n·m) and adequate.
  //    An exact solver is not worth the complexity at realistic line counts —
  //    revisit only if Q5 reveals unusually large baskets.
  const groups = [];
  let remaining = fo.lineItems.map(toAlloc);

  for (const loc of candidates) {
    if (remaining.length === 0) break;
    if (!loc.supportsSplit && groups.length > 0) continue;

    const takeable = remaining
      .map(li => ({
        ...li,
        quantity: Math.min(li.quantity, sellable.get(loc.gid)!.get(li.inventoryItemGid) ?? 0)
      }))
      .filter(li => li.quantity > 0);

    if (takeable.length === 0) continue;

    groups.push({
      shopifyLocationGid: loc.gid,
      lineItems: takeable,
      reason: "SPLIT_AVAILABILITY"
    });
    remaining = subtract(remaining, takeable);
  }

  // 5. Residual → backorder. In-stock lines ship immediately; this is an
  //    explicit requirement and the correct customer outcome.
  return { groups, backordered: remaining };
}
5.4 Applying the Plan
typescript
async function applyPlan(fo: FulfillmentOrder, plan: AllocationPlan) {
  // Split first, then move. Order matters: you cannot move a subset
  // of line items out of an unsplit fulfillment order.
  if (plan.groups.length > 1) {
    const splits = await shopify.fulfillmentOrderSplit({
      fulfillmentOrderSplits: plan.groups.slice(1).map(g => ({
        fulfillmentOrderId: fo.id,
        fulfillmentOrderLineItems: g.lineItems
      }))
    });
    // Correlate returned FO ids back to plan groups before moving.
  }

  for (const [foId, group] of correlate(plan.groups)) {
    if (currentLocation(foId) !== group.shopifyLocationGid) {
      await shopify.fulfillmentOrderMove({
        id: foId,
        newLocationId: group.shopifyLocationGid
      });
    }
  }

  if (plan.backordered.length > 0) {
    await shopify.fulfillmentOrderHold({
      id: backorderFoId,
      fulfillmentHold: {
        reason: "INVENTORY_OUT_OF_STOCK",
        reasonNotes: `Awaiting inbound. ETA ${eta}.`,
        notifyMerchant: true
      }
    });
  }
}
Verify fulfillmentOrderSplit input shape and availability in your pinned version — I did not confirm the exact argument structure. [UNVERIFIED]

Section 6 — Phased Implementation Roadmap
6.1 Timeline
The 12-week structure below follows the brief. I want to be direct about the risk: for a 5+ location build with hybrid EDI/SFTP/SOAP transport and gated Shopify APIs, 12 weeks is achievable but not comfortable. The specific threats are approval lead times (Protected Customer Data, and Order Routing access if pursued) and 3PL responsiveness during connector development — neither of which your team controls. If Q4 resolves to true X12 EDI with VAN/AS2 onboarding, add 3–4 weeks. Say this to the client in week 1, not week 9. [INFERENCE]

6.2 Phase Detail & Exit Criteria
Phase 1 — Discovery & Foundation (Weeks 1–2) Deliverables: answers to Q1–Q8; canonical schema v1 signed by merchant and 3PL; 3PL implementation guide reviewed with the sample-file discrepancies documented (there are always discrepancies); test credentials in hand; IaC deployed across dev/staging/prod; observability live; API version pinned with deprecation audit against §0. Exit: schema signed off. 3PL test SFTP round-trip proven with a dummy file. No test credentials by end of Week 2 → escalate, this is the most common cause of Phase 3 slip.

Phase 2 — Core Engine (Weeks 3–5) Deliverables: Shopify app installed with minimum viable scopes; webhook ingress verifying HMAC in constant time with durable persist-then-ack; replay from raw store working; rate governor reading live throttleStatus; all three idempotency layers including the @idempotent directive; mapping tables with admin CRUD; saga skeleton; ops console v1. Exit: replay a stored webhook and produce zero duplicate side effects. This single test is the best predictor of whether cutover will go well.

Phase 3 — Logic & Connectors (Weeks 6–8) Deliverables: allocation engine with unit tests covering every §5.2 branch; split/move application; hold and fraud gating; 940 outbound accepted by 3PL; 945 inbound producing correct fulfillmentCreate; inventory delta with compare-and-swap; bulk reconciliation; bi-directional cancellation. Exit: full order lifecycle in staging across three locations including one split and one backorder. 3PL confirms receipt of a valid 940 from their side, not just a successful upload from yours.

Phase 4 — Testing (Weeks 9–10) Deliverables: E2E suite; chaos suite (3PL down mid-transmission, Redis flushed, worker killed between mutation and state write, 945 before 940, duplicate file drop, forced THROTTLED); load test at 3× projected peak sustained 60 min; joint UAT with 3PL ops; security review. Exit: zero duplicate fulfillments and zero lost orders under chaos. Rate governor holds below limit at 3× peak. 3PL signs UAT.

Phase 5 — Cutover (Weeks 11–12) Deliverables: shadow-mode dark launch (compute allocations and log intended actions, write nothing); diff report vs. incumbent; pilot on one location at 5%; progressive ramp; hypercare with daily reconciliation. Exit: pilot clean for 72h. Ramp to 100% with drift within tolerance. Runbooks handed over and rehearsed.

Shadow mode is the highest-value week in the plan [INFERENCE]. It reveals mapping gaps and allocation disagreements against real order flow at zero customer risk. Teams cut it under schedule pressure and then discover the same defects in production. If something must be cut, cut the progressive ramp duration, not shadow mode.

6.3 Go-Live Readiness Checklist
Platform

 API version pinned; deprecation audit re-run against §0 (confirm fulfillmentCreate and inventorySetQuantities still current)
 @idempotent directive applied to every mutation that accepts it — mandatory on inventory mutations at 2026-04+
 Protected Customer Data approval granted
 All required scopes granted; no unused scopes requested
 Webhook subscriptions registered for every topic in §6.6; delivery confirmed end-to-end
 HMAC verification constant-time; verified against raw body bytes
 Rate governor reads live throttleStatus; no hardcoded bucket constants
 Query cost regression test in CI
Data

 100% of active SKUs mapped; unmapped count = 0
 All locations mapped with zones, cost ranks, cutoffs, timezones
 All shipping methods mapped for every destination country
 All 3PL carrier codes mapped
 Inventory reconciled to within tolerance immediately pre-cutover
 Buffer stock configured per location and agreed with merchant
Resiliency

 Chaos suite green
 DLQ redrive tested from the ops console by someone who is not the author
 Circuit breakers tuned against real 3PL behaviour, not defaults
 Store-and-forward drain tested with >1000 queued messages
 Secrets rotation runbook written; 3PL rotation constraints documented
Operational

 Runbooks for every EXCEPTION_* state, written for the on-call engineer at 3am
 On-call rota with named humans and escalation to the 3PL's ops contact
 Dashboards: order flow rate, exception depth, inventory drift, rate consumption, 3PL latency
 Rollback tested end-to-end in staging within the last 7 days
 Merchant CS team briefed on split-shipment and backorder customer messaging
6.4 Rollback Plan
Design principle: rollback must be decidable in minutes by one on-call engineer without a group call. [INFERENCE]

Level 1 — Pause (seconds, reversible) Feature flag halts outbound transmission. Ingress keeps running; events accumulate durably. Use for: elevated but non-corrupting error rates. Recovery: unset flag, drain queue.

Level 2 — Selective disable (minutes, reversible) Disable one workflow or one location while others continue. Use for: single-location mapping defect, or an inventory feed gone bad. Recovery: fix, re-enable, reconcile that scope.

Level 3 — Revert to previous version (minutes) Deploy previous immutable artefact. Requires backward-compatible schema migrations — expand/contract only, never destructive in a single release. Use for: regression in new code. Recovery: forward-fix, redeploy.

Level 4 — Full fallback to incumbent (hours) Route order flow back to the previous system or manual 3PL portal entry. Use for: data corruption or sustained outage. Steps: (1) disable all Shopify webhook subscriptions to stop new intake; (2) freeze inventory writes; (3) export in-flight orders by state to CSV for manual handling; (4) notify 3PL to expect manual submissions; (5) reconcile inventory manually; (6) confirm no order is in both pipelines — this is the step that gets missed and causes double shipments.

Decision authority: on-call engineer may invoke L1 and L2 unilaterally. L3 needs tech lead. L4 needs merchant ops sign-off. Waiting for consensus on L1 is how a five-minute pause becomes a two-hour incident.

Data safety invariants (must hold at every level):

Raw event store is append-only and never rolled back — it is the recovery substrate
Idempotency records in Postgres survive all rollback levels
No destructive migration ships without a tested reverse path
Inventory writes are always compare-and-swap, so a stale rolled-back worker cannot clobber current state
6.5 Top Risks
Risk	Impact	Mitigation
3PL spec diverges from actual behaviour	High / Likely	Round-trip a real file in Week 1–2. Treat their documentation as a hypothesis.
Approval lead times (PCD, Order Routing)	High / Medium	File Week 1. Design so Order Routing Function is optional (§5.1).
Inventory oversell during ramp	High / Medium	Conservative buffers during ramp, tightened after 2 weeks of drift data.
Q4 resolves to true X12 EDI + VAN	Medium / Medium	Flag as schedule contingency in Week 1, not a change order in Week 9.
Mapping data incomplete at cutover	High / Likely	Mapping completeness gate at end of Phase 3, not Phase 5. Unmapped count must read zero.
Shopify deprecates an API mid-build	Medium / Low	Pin version. Subscribe to the developer changelog. Re-audit at Phase 4 entry.
Key-person dependency on 3PL side	Medium / Medium	Insist on a named backup contact in the SOW.
6.6 Webhook Subscription Inventory
Confirmed topics available to fulfillment service apps [VERIFIED]:

fulfillment_orders/order_routing_complete · fulfillment_orders/fulfillment_request_submitted · fulfillment_orders/fulfillment_request_accepted · fulfillment_orders/fulfillment_request_rejected · fulfillment_orders/placed_on_hold · fulfillment_orders/hold_released · fulfillment_orders/scheduled_fulfillment_order_ready · fulfillment_orders/rescheduled · fulfillment_orders/cancellation_request_submitted · fulfillment_orders/cancellation_request_accepted · fulfillment_orders/cancellation_request_rejected · fulfillment_orders/cancelled · fulfillment_orders/fulfillment_service_failed_to_complete

Plus, for this design: fulfillment_orders/moved, orders/cancelled, orders/edited, inventory_levels/update (for detecting out-of-band changes), and the mandatory GDPR compliance topics.

Subscribe to order_routing_complete, not orders/create. orders/create fires before Shopify has assigned locations, so the fulfillment orders you need may not exist yet. [INFERENCE — high confidence]

fulfillment_orders/moved matters more than it looks: it fires when a merchant manually reassigns a location in the admin. Without handling it, your ledger silently diverges from Shopify and the 3PL receives orders for stock it does not hold.

Appendix A — Sources
All Shopify platform claims marked [VERIFIED] were checked against official documentation at shopify.dev in August 2026, specifically:

shopify.dev/docs/api/usage/limits — rate limits, cost calculation, single-query cap, input array cap, bulk operation exemption
shopify.dev/docs/api/usage/idempotent-requests — idempotency keys and the @idempotent directive, including per-row bulk semantics
shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentCreateV2 — deprecation notice naming fulfillmentCreate as replacement
shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentCreate — grouping constraint (same order, same location)
shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetOnHandQuantities — deprecation, and the 2026-01 optional / 2026-04 required idempotency key timeline
shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities — compare-and-set semantics and source-of-truth guidance
shopify.dev/changelog/compare-and-swap-redesign-for-inventory-set-quantities — changeFromQuantity replacing compareQuantity
shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentservicecreate and .../queries/fulfillmentService — callback endpoint behaviour, auto-created Location
shopify.dev/changelog/fulfillment-service-callback-url-is-now-optional — 2026-01 optional callbackUrl
shopify.dev/docs/apps/build/orders-fulfillment/fulfillment-service-apps/build-for-fulfillment-services — scopes, webhook topic list, Protected Customer Data prerequisite
shopify.dev/docs/api/functions/latest/order-routing-location-rule — Plus-only, access by request
shopify.dev/docs/apps/build/functions/network-access — network access restrictions
shopify.dev/docs/apps/fulfillment/order-management-apps/order-routing — Plus requirement, 2025-07+ version requirement
Items marked [UNVERIFIED] include: webhook header names and retry/timeout policy; fulfillmentOrderSplit availability and input shape; fulfillmentCreate scope friction; EDI segment/element positions; tracking URL auto-generation behaviour; EventBridge coverage for fulfillment_orders/*. Two claims rest on single unresolved community forum posts and are labelled as such rather than presented as platform behaviour.

X12 940/945/846 transaction set purposes are drawn from general EDI knowledge, not a cited standards document. The 3PL's own implementation guide overrides everything in §3.3.

No effort estimates, cost figures, or volume assumptions in this document are derived from measured data. They are planning inferences and should be replaced with real numbers once Q5 is answered.

