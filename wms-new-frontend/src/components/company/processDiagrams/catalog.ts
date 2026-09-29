export type DiagramKind = 'flow' | 'sequence' | 'usecase' | 'state'

export type ProcessDiagram = {
  id: string
  title: string
  description: string
  kind: DiagramKind
  /** When true, listed under Edge cases for the topic. */
  edgeCase?: boolean
  mermaid: string
}

export type ProcessTopic = {
  id: string
  title: string
  summary: string
  diagrams: ProcessDiagram[]
}

export const PROCESS_TOPICS: ProcessTopic[] = [
  {
    id: 'system',
    title: 'System overview',
    summary: 'How Shopify, Linker, warehouses, and people connect.',
    diagrams: [
      {
        id: 'system-big-picture',
        title: 'Big picture',
        description: 'Actors, apps, and the backend that ties Shopify to warehouses.',
        kind: 'flow',
        mermaid: `flowchart TB
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
    BE[Backend + MongoDB]
    SH[Shopify]
    WH[Warehouse / 3PL]
  end
  PA --> CON --> BE
  CO --> PORT --> BE
  UP --> UPL --> BE
  APP -->|OAuth| BE
  SH -->|webhooks| BE
  BE -->|"940 / dispatch"| WH
  WH -->|"945 / ship"| BE
  BE -->|fulfillmentCreate| SH`,
      },
      {
        id: 'system-sequence',
        title: 'End-to-end sequence',
        description: 'Merchant installs → order → warehouse work → tracking on Shopify.',
        kind: 'sequence',
        mermaid: `sequenceDiagram
  participant M as Merchant
  participant S as Shopify
  participant B as Backend
  participant C as Company portal
  participant W as Warehouse
  M->>S: Installs app
  S->>B: OAuth and token
  S->>B: orders/create webhook
  B->>B: Route allocate dispatch
  B->>W: Work arrives
  W->>C: Ship or 945 upload
  C->>B: Confirm shipment
  B->>S: fulfillmentCreate + tracking`,
      },
      {
        id: 'system-usecases',
        title: 'Use cases — who does what',
        description: 'Primary capabilities by role across the product.',
        kind: 'usecase',
        mermaid: `flowchart LR
  subgraph actors [Actors]
    Root((Company Root))
    Member((Company User))
    WhUser((Warehouse User))
    Uploader((Uploader))
    Platform((Platform Admin))
  end
  subgraph portal [Company portal]
    UC1[Manage warehouses & SFTP]
    UC2[Configure routing]
    UC3[Fulfill & ship orders]
    UC4[Process returns]
    UC5[Triage failed orders]
    UC6[Invite users]
    UC7[View analytics]
  end
  subgraph up [Uploader]
    UC8[Upload 945 / enter tracking]
  end
  subgraph plat [Platform]
    UC9[Approve companies / shops]
  end
  Root --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7
  Member --> UC3 & UC4 & UC5 & UC7
  WhUser --> UC3 & UC4 & UC7
  Uploader --> UC8
  Platform --> UC9`,
      },
    ],
  },
  {
    id: 'order-lifecycle',
    title: 'Order lifecycle',
    summary: 'Happy-path order from Shopify ingest through Shopify fulfillment.',
    diagrams: [
      {
        id: 'order-happy-path',
        title: 'Happy path',
        description: 'Ingest → route → allocate → warehouse mode → ship → Shopify.',
        kind: 'flow',
        mermaid: `flowchart LR
  A[Shopify order] --> B[Ingest]
  B --> C[Route]
  C --> D[Allocate]
  D --> E[Fulfillment group]
  E --> F{Mode?}
  F -->|SFTP / EDI| G[940 to SFTP]
  F -->|ModernWMS| H[Push + poll]
  G --> I[Ship / 945]
  H --> I
  I --> J[Shopify fulfilled]`,
      },
      {
        id: 'order-states',
        title: 'Order status states',
        description: 'Statuses you see on Orders and Analytics.',
        kind: 'state',
        mermaid: `stateDiagram-v2
  [*] --> received
  received --> allocated: warehouse committed
  received --> on_hold: hold policy
  received --> error: routing / stock fail
  allocated --> partially_fulfilled: some groups shipped
  allocated --> fulfilled: all shipped
  partially_fulfilled --> fulfilled: remainder shipped
  fulfilled --> partially_returned: partial RMA
  fulfilled --> returned: full RMA
  partially_returned --> returned: remainder returned
  error --> received: retry / reassign
  on_hold --> allocated: release hold`,
      },
      {
        id: 'order-usecases',
        title: 'Use cases — order ops',
        description: 'What operators do on an order in the portal.',
        kind: 'usecase',
        mermaid: `flowchart TB
  Op((Operator))
  Op --> A[Search & filter orders]
  Op --> B[Assign / Accept warehouse]
  Op --> C[Clear allocation]
  Op --> D[Download 940]
  Op --> E[Ship or Upload 945]
  Op --> F[Push / Re-sync Shopify]
  Op --> G[Create return]
  Op --> H[Read activity events]`,
      },
      {
        id: 'order-needs-accept',
        title: 'Needs accept (suggestion only)',
        description: 'Routing on, auto-assign off — warehouse is suggested until Accept.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TD
  A[Order ingested] --> B{Routing on?}
  B -->|No| C[Blank warehouse]
  B -->|Yes| D{Auto-assign on?}
  D -->|Yes| E[Commit warehouse + allocate]
  D -->|No| F[Suggest warehouse]
  F --> G[Badge: Needs accept]
  G --> H[User Accepts or Assigns]
  H --> E
  C --> I[Manual Assign]
  I --> E`,
      },
      {
        id: 'order-cancel',
        title: 'Cancel & release stock',
        description: 'Cancelled orders release reserved inventory and stop ship actions.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart LR
  A[Open order with reserve] --> B[Cancel]
  B --> C[Release reserved stock]
  C --> D[Ship actions disabled]
  D --> E[Activity log recorded]`,
      },
    ],
  },
  {
    id: 'routing',
    title: 'Routing & assignment',
    summary: 'Rules, ZIP/Mapbox ranking, fallback, and manual assign.',
    diagrams: [
      {
        id: 'routing-engine',
        title: 'Routing engine flow',
        description: 'How Linker picks a warehouse for a new order.',
        kind: 'flow',
        mermaid: `flowchart TD
  A[New order] --> B{Routing enabled?}
  B -->|No| C[Wait for manual Assign]
  B -->|Yes| D[Evaluate rules]
  D --> E{Match?}
  E -->|Yes| F[Rank candidates]
  F --> G{Auto-assign?}
  G -->|Yes| H[Commit + allocate]
  G -->|No| I[Suggest only]
  E -->|No| J{Fallback set?}
  J -->|Yes| K[Use fallback WH]
  J -->|No| L[error ROUTING_NO_MATCH]
  K --> G`,
      },
      {
        id: 'routing-matrix',
        title: 'Settings matrix',
        description: 'Routing ON/OFF × Auto-assign ON/OFF outcomes.',
        kind: 'flow',
        mermaid: `flowchart TB
  subgraph on_auto [Routing ON + Auto-assign ON]
    A1[Auto route + commit + dispatch]
  end
  subgraph on_manual [Routing ON + Auto-assign OFF]
    A2[Suggest WH - user Accepts]
  end
  subgraph off [Routing OFF]
    A3[Blank WH until manual Assign]
  end`,
      },
      {
        id: 'routing-usecases',
        title: 'Use cases — routing admin',
        description: 'Company Root configures how orders find warehouses.',
        kind: 'usecase',
        mermaid: `flowchart LR
  Root((Company Root))
  Root --> R1[Toggle routing on/off]
  Root --> R2[Toggle auto-assign]
  Root --> R3[Edit priority rules]
  Root --> R4[Set fallback warehouse]
  Root --> R5[Review no-match failures]`,
      },
      {
        id: 'routing-no-match',
        title: 'No match + no fallback',
        description: 'Order errors into Failed / DLQ with ROUTING_NO_MATCH.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TD
  A[Rules evaluated] --> B[No warehouse match]
  B --> C{Fallback?}
  C -->|Yes| D[Assign fallback]
  C -->|No| E[status error]
  E --> F[DLQ + notification]
  F --> G[Reassign / Retry in Failed]`,
      },
    ],
  },
  {
    id: 'allocation-split',
    title: 'Allocation & split orders',
    summary: 'Inventory reserve, fulfillment groups, partial policies, multi-warehouse splits.',
    diagrams: [
      {
        id: 'alloc-main',
        title: 'Allocation model',
        description: 'Order lines become reserved stock and one or more fulfillment groups.',
        kind: 'flow',
        mermaid: `flowchart LR
  O[Order] --> L[Order lines]
  L --> A[Allocation]
  A --> G1[Fulfillment group A]
  A --> G2[Fulfillment group B]
  G1 --> S1[Shipment]
  G2 --> S2[Shipment]
  S1 --> T[Tracking]
  S2 --> T`,
      },
      {
        id: 'alloc-usecases',
        title: 'Use cases — split fulfillment',
        description: 'Operators ship each group independently.',
        kind: 'usecase',
        mermaid: `flowchart TB
  Op((Operator))
  Op --> U1[View fulfillment groups]
  Op --> U2[Ship group A]
  Op --> U3[Ship group B]
  Op --> U4[Upload 945 per group]
  Op --> U5[Clear allocation before ship]`,
      },
      {
        id: 'alloc-split-wh',
        title: 'Edge: multi-warehouse split',
        description: 'Different SKUs or stock levels route to different warehouses.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TD
  A[Multi-SKU order] --> B[Inventory check per WH]
  B --> C{All at one WH?}
  C -->|Yes| D[Single fulfillment group]
  C -->|No| E[Split into groups]
  E --> F[WH East: SKU A]
  E --> G[WH West: SKU B]
  F --> H[940 / dispatch each]
  G --> H
  H --> I[Ship each group]
  I --> J[Order partially_fulfilled then fulfilled]`,
      },
      {
        id: 'alloc-partial-policy',
        title: 'Edge: partial stock policies',
        description: 'hold_all vs ship_available vs allow_customer_partial.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TD
  A[Some lines short on stock] --> B{partialPolicy}
  B -->|hold_all| C[Hold entire order]
  B -->|ship_available| D[Ship what is in stock]
  B -->|allow_customer_partial| E[Partial OK for customer]
  C --> F[on_hold / wait restock]
  D --> G[Group for available qty]
  E --> G
  G --> H[Remainder open or backorder]`,
      },
      {
        id: 'alloc-clear',
        title: 'Edge: clear allocation',
        description: 'Unassign WH and release reserve — blocked after any ship.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart LR
  A[Allocated order] --> B{Anything shipped?}
  B -->|Yes| C[Clear disabled]
  B -->|No| D[Clear allocation]
  D --> E[Release stock]
  E --> F[Remove open groups]
  F --> G[Re-Assign warehouse]`,
      },
    ],
  },
  {
    id: 'edi-sftp',
    title: 'EDI 940 / 945 (SFTP)',
    summary: 'Track A — warehouse shipping orders out, ASN / ship back in.',
    diagrams: [
      {
        id: 'edi-loop',
        title: 'Track A closed loop',
        description: '940 generated per group, optional SFTP PUT, 945 or ship closes the loop.',
        kind: 'flow',
        mermaid: `flowchart LR
  Shopify[Shopify webhook]
  Backend[wms-app-backend]
  Route[Routing]
  Alloc[Allocate]
  EDI940[X12 940]
  SFTP[SFTP PUT]
  WMSOps[3PL / WMS]
  Upload945[945 or ship]
  ShopifyFulfill[Shopify fulfillment]
  Shopify --> Backend --> Route --> Alloc --> EDI940 --> SFTP --> WMSOps --> Upload945 --> Backend --> ShopifyFulfill`,
      },
      {
        id: 'edi-sequence',
        title: '940 → SFTP → 945 sequence',
        description: 'Actors involved in the EDI path.',
        kind: 'sequence',
        mermaid: `sequenceDiagram
  participant B as Backend
  participant E as EDI builder
  participant S as SFTP
  participant W as Warehouse
  participant P as Portal / Uploader
  participant Sh as Shopify
  B->>E: create940 per group
  E->>S: PUT if autoDeliverSftp
  S->>W: File arrives
  W->>P: Ship / upload 945
  P->>B: apply945 / shipGroup
  B->>Sh: fulfillmentCreate`,
      },
      {
        id: 'edi-usecases',
        title: 'Use cases — SFTP & EDI',
        description: 'Setup and day-to-day EDI actions.',
        kind: 'usecase',
        mermaid: `flowchart LR
  Root((Root))
  Op((Operator))
  Up((Uploader))
  Root --> C1[Create named SFTP connection]
  Root --> C2[Attach SFTP to warehouse]
  Op --> C3[Download 940]
  Op --> C4[Upload 945]
  Op --> C5[Check SFTP status badge]
  Up --> C4`,
      },
      {
        id: 'edi-sftp-fail',
        title: 'Edge: SFTP delivery failure',
        description: 'PUT fails → error / DLQ / email if configured.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TD
  A[940 ready] --> B[SFTP PUT]
  B --> C{Success?}
  C -->|Yes| D[sftpStatus delivered]
  C -->|No| E[SFTP_ERROR]
  E --> F[Failed queue + notify]
  F --> G[Fix connection / Retry]`,
      },
      {
        id: 'edi-manual-ship',
        title: 'Edge: ship without 945 file',
        description: 'Portal ship form with tracking still closes the group.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart LR
  A[940 delivered] --> B[Warehouse ships]
  B --> C{How report?}
  C -->|945 upload| D[Parse ASN]
  C -->|Ship form| E[Enter tracking + carrier]
  D --> F[shipGroup]
  E --> F
  F --> G[Shopify sync]`,
      },
    ],
  },
  {
    id: 'modernwms',
    title: 'ModernWMS',
    summary: 'Track B — push dispatch, poll status, auto-ship when complete.',
    diagrams: [
      {
        id: 'mw-loop',
        title: 'Track B closed loop',
        description: 'Dispatch push → WMS pick/pack → poll ≥ 6 → auto ship + Shopify.',
        kind: 'flow',
        mermaid: `flowchart LR
  Shopify[Shopify]
  Backend[Backend]
  Alloc[Allocate]
  Push[POST dispatchlist]
  WMS[ModernWMS]
  Poll[Status poll]
  Ship[Auto ship group]
  SF[Shopify fulfillment]
  Shopify --> Backend --> Alloc --> Push --> WMS
  WMS --> Poll
  Poll -->|status >= 6| Ship --> SF`,
      },
      {
        id: 'mw-sequence',
        title: 'Push & poll sequence',
        description: 'Backend and ModernWMS handshake.',
        kind: 'sequence',
        mermaid: `sequenceDiagram
  participant B as Backend
  participant M as ModernWMS
  participant S as Shopify
  B->>M: Push dispatch
  M-->>B: dispatch #
  loop Poll
    B->>M: Get status
    M-->>B: status code
  end
  Note over B: status >= 6
  B->>B: shipGroup
  B->>S: fulfillmentCreate`,
      },
      {
        id: 'mw-usecases',
        title: 'Use cases — ModernWMS warehouse',
        description: 'Setup credentials and monitor dispatch on order detail.',
        kind: 'usecase',
        mermaid: `flowchart LR
  Root((Root))
  Op((Operator))
  Wh((WMS picker))
  Root --> U1[Set fulfillmentMode modernwms]
  Root --> U2[Save API credentials]
  Root --> U3[Sync inventory from MW]
  Op --> U4[Watch dispatch status]
  Op --> U5[Manual ship if needed]
  Wh --> U6[Pick pack ship in MW UI]`,
      },
      {
        id: 'mw-manual-fallback',
        title: 'Edge: poll stuck — manual ship',
        description: 'If ModernWMS does not advance, operators can still ship in portal.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TD
  A[Dispatch pushed] --> B[Poller waiting]
  B --> C{Status advances?}
  C -->|Yes| D[Auto ship]
  C -->|No / timeout| E[Operator Ship / 945]
  D --> F[Shopify sync]
  E --> F`,
      },
    ],
  },
  {
    id: 'returns',
    title: 'Returns (RMA)',
    summary: 'Authorize → receive → disposition → restock/scrap; Shopify return/cancel sync.',
    diagrams: [
      {
        id: 'returns-flow',
        title: 'Return lifecycle',
        description: 'Internal RMA states from request through restock or scrap.',
        kind: 'state',
        mermaid: `stateDiagram-v2
  [*] --> requested
  requested --> authorized: Approve
  authorized --> in_transit: Customer ships
  authorized --> received: At dock
  in_transit --> received
  received --> inspected
  inspected --> restocked
  inspected --> scrapped
  requested --> cancelled
  authorized --> cancelled`,
      },
      {
        id: 'returns-shopify',
        title: 'Shopify sync on authorize',
        description: 'Partial vs full return impact on Shopify and order status.',
        kind: 'flow',
        mermaid: `flowchart TD
  A[Authorize RMA] --> B{Coverage}
  B -->|Partial qty| C[Shopify returnCreate]
  C --> D[Order: partially_returned]
  B -->|Full returnable qty| E[Shopify orderCancel]
  E --> F[Order: returned]
  D --> G[Receive → disposition]
  F --> G`,
      },
      {
        id: 'returns-usecases',
        title: 'Use cases — returns desk',
        description: 'Portal Returns module actions.',
        kind: 'usecase',
        mermaid: `flowchart LR
  Op((Returns operator))
  Op --> R1[Create RMA from order]
  Op --> R2[Authorize / cancel]
  Op --> R3[Mark in transit / received]
  Op --> R4[Set disposition]
  Op --> R5[Restock or scrap]
  Op --> R6[Search by RMA / tracking]`,
      },
      {
        id: 'returns-restock-mw',
        title: 'Edge: restock into ModernWMS',
        description: 'Restock may trigger ASN putaway for ModernWMS warehouses.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart LR
  A[Received + inspected] --> B[Restock]
  B --> C[Increase Linker inventory]
  B --> D{WH mode ModernWMS?}
  D -->|Yes| E[ASN putaway to MW]
  D -->|No| F[Local stock only]`,
      },
      {
        id: 'returns-not-refund',
        title: 'Edge: no Shopify refund',
        description: 'RMA is warehouse/ops — refunds stay in Shopify Admin.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TD
  A[RMA restocked] --> B[Inventory updated]
  A -.-> C[Shopify refund NOT created]
  C --> D[Merchant refunds in Shopify if needed]`,
      },
    ],
  },
  {
    id: 'failed',
    title: 'Failed orders & errors',
    summary: 'DLQ triage: retry, reassign, skip; common failure codes.',
    diagrams: [
      {
        id: 'failed-flow',
        title: 'Failure handling flow',
        description: 'Pipeline error → Failed queue → operator action.',
        kind: 'flow',
        mermaid: `flowchart TD
  A[Pipeline step fails] --> B[Order error + lastError]
  B --> C[DLQ / Failed list]
  C --> D{Action}
  D -->|Retry| E[Re-run pipeline]
  D -->|Reassign| F[Pick warehouse]
  D -->|Skip| G[Close without fulfill]
  E --> H{Success?}
  H -->|Yes| I[Back to happy path]
  H -->|No| C`,
      },
      {
        id: 'failed-usecases',
        title: 'Use cases — triage',
        description: 'Who works Failed and what they can do.',
        kind: 'usecase',
        mermaid: `flowchart LR
  Op((Ops user))
  Op --> F1[Open Failed module]
  Op --> F2[Read error code]
  Op --> F3[Retry]
  Op --> F4[Reassign warehouse]
  Op --> F5[Skip / dismiss]
  Op --> F6[Jump to order detail]`,
      },
      {
        id: 'failed-codes',
        title: 'Edge: common error codes',
        description: 'Typical codes and first fix.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TB
  subgraph codes [Codes]
    P[PRODUCT_NOT_FOUND]
    R[ROUTING_NO_MATCH]
    S[SFTP_ERROR]
    I[INSUFFICIENT_STOCK]
  end
  P --> P1[Add SKU inventory / fix SKU]
  R --> R1[Add rule or fallback WH]
  S --> S1[Fix SFTP credentials / path]
  I --> I1[Restock or change policy]`,
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications & email',
    summary: 'In-app alerts for root; optional SMTP for event emails.',
    diagrams: [
      {
        id: 'notif-flow',
        title: 'Alert delivery',
        description: 'Events create in-app notifications and optional email.',
        kind: 'flow',
        mermaid: `flowchart LR
  E[Domain event] --> N[Create notification]
  N --> I[In-app list]
  E --> T{Email toggle on?}
  T -->|Yes| SMTP[SMTP send]
  T -->|No| X[Skip email]
  SMTP --> M[Inbox]`,
      },
      {
        id: 'notif-usecases',
        title: 'Use cases — alerts',
        description: 'Root watches Notifications; Root configures Email.',
        kind: 'usecase',
        mermaid: `flowchart LR
  Root((Company Root))
  Root --> N1[View notifications]
  Root --> N2[Mark read]
  Root --> N3[Configure SMTP]
  Root --> N4[Toggle event emails]
  Root --> N5[Receive order_error / sftp_failed / 945_received]`,
      },
      {
        id: 'notif-events',
        title: 'Edge: event catalog',
        description: 'Examples of events that can notify or email.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TB
  A[Events] --> B[order_error]
  A --> C[sftp_failed]
  A --> D[dlq_entry]
  A --> E[945_received]
  B & C & D & E --> F[Notification row]
  B & C & D & E --> G[Optional email]`,
      },
    ],
  },
  {
    id: 'uploader',
    title: 'Warehouse uploader',
    summary: 'Limited /u portal for 945 upload and tracking entry.',
    diagrams: [
      {
        id: 'uploader-flow',
        title: 'Uploader flow',
        description: 'Auth → list orders → ship / upload 945.',
        kind: 'flow',
        mermaid: `flowchart LR
  A[Uploader login] --> B[JWT aud=uploader]
  B --> C[List warehouse orders]
  C --> D{Action}
  D -->|Tracking + Ship| E[ship API]
  D -->|Upload 945| F[apply945]
  E --> G[Backend closes group]
  F --> G
  G --> H[Shopify sync]`,
      },
      {
        id: 'uploader-usecases',
        title: 'Use cases — uploader',
        description: 'Narrow surface for dock / 3PL staff.',
        kind: 'usecase',
        mermaid: `flowchart LR
  U((Uploader))
  U --> A[Sign in]
  U --> B[Filter orders]
  U --> C[Enter tracking]
  U --> D[Upload 945 file]
  U -.-> E[No routing / users / analytics]`,
      },
      {
        id: 'uploader-vs-portal',
        title: 'Edge: uploader vs company portal',
        description: 'Same ship APIs; different auth and UI scope.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TB
  subgraph portal [Company portal]
    P1[Full order detail]
    P2[Assign / returns / failed]
  end
  subgraph up [Uploader /u]
    U1[Order list + ship only]
  end
  portal --> API[Same ship / 945 APIs]
  up --> API`,
      },
    ],
  },
  {
    id: 'setup',
    title: 'First-time setup',
    summary: 'Recommended Root onboarding before live Shopify orders.',
    diagrams: [
      {
        id: 'setup-flow',
        title: 'Setup checklist flow',
        description: 'SFTP → warehouses → inventory → routing → users → email.',
        kind: 'flow',
        mermaid: `flowchart TD
  A[Company approved] --> B[Create SFTP connections]
  B --> C[Create warehouses]
  C --> D[Set mode SFTP or ModernWMS]
  D --> E[Attach credentials]
  E --> F[Load SKU inventory]
  F --> G[Configure routing + fallback]
  G --> H[Invite users + permissions]
  H --> I[Optional SMTP]
  I --> J[Ready for Shopify orders]`,
      },
      {
        id: 'setup-usecases',
        title: 'Use cases — onboarding',
        description: 'Root-only setup capabilities.',
        kind: 'usecase',
        mermaid: `flowchart LR
  Root((Company Root))
  Root --> S1[Warehouses CRUD]
  Root --> S2[SFTP connections]
  Root --> S3[Routing rules]
  Root --> S4[Invite team]
  Root --> S5[Email settings]
  Root --> S6[Company branding]`,
      },
      {
        id: 'setup-sku-mismatch',
        title: 'Edge: SKU mismatch',
        description: 'Shopify variant SKU must match Linker inventory SKU.',
        kind: 'flow',
        edgeCase: true,
        mermaid: `flowchart TD
  A[Order line SKU] --> B{Inventory row?}
  B -->|Yes| C[Allocate OK]
  B -->|No| D[PRODUCT_NOT_FOUND]
  D --> E[Add / sync SKU]
  E --> F[Retry Failed]`,
      },
    ],
  },
]

export function kindLabel(kind: DiagramKind) {
  switch (kind) {
    case 'flow':
      return 'Flow'
    case 'sequence':
      return 'Sequence'
    case 'usecase':
      return 'Use case'
    case 'state':
      return 'State'
    default:
      return kind
  }
}
