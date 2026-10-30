import type { ProcessTopic } from './catalog'

export const CONNECTION_AND_SYNC_TOPICS: ProcessTopic[] = [
  {
    id: 'store-installation',
    title: 'Shopify installation & warehouse links',
    summary: 'Connect an existing store, authorize the app, map stock, and verify the connection.',
    diagrams: [
      {
        id: 'install-store', title: 'Install and connect a store', kind: 'flow',
        description: 'Company Root registers the domain; a Shopify user with app installation permissions completes approval.',
        mermaid: `flowchart TD
  A[Company Root opens Stores] --> B[Add myshopify.com domain]
  B --> C[Awaiting install]
  C --> D[Open Install app]
  D --> E[Sign in to intended Shopify store]
  E --> F[Review permissions and complete installation]
  F --> G[Refresh portal store list]
  G --> H[Edit store and enable it]
  H --> I[Select connected warehouses]
  I --> J[Select Shopify inventory location]
  J --> K[Choose WMS hold override]
  K --> L[Acknowledge overwrite warning and save]
  L --> M[Inventory sync queued]
  M --> N[View sync result until completion]
  N --> O[Verify known SKU in Shopify]`,
      },
      {
        id: 'reconnect-store', title: 'Installation or authorization incomplete', kind: 'flow', edgeCase: true,
        description: 'A store registration or queued sync alone does not prove a working connection.',
        mermaid: `flowchart TD
  A[Store connection issue] --> B{State?}
  B -->|Awaiting install| C[Complete Install app]
  B -->|Authorization error| D[Reconnect app]
  B -->|Shopify blocks installation| E[Check signed-in store and install permission]
  B -->|Callback error| F[Platform operator checks app URL and redirects]
  C --> G[Refresh store state]
  D --> G
  E --> C
  F --> C
  G --> H[Verify links and latest inventory sync result]`,
      },
    ],
  },
  {
    id: 'inventory-sync', title: 'Product catalog & Shopify inventory',
    summary: 'Catalog import and outbound stock sync are separate operations. Neither deletes Shopify products.',
    diagrams: [
      {
        id: 'catalog-import', title: 'Product catalog import confirmation', kind: 'flow',
        description: 'Imports Shopify variants into product links; it does not push warehouse stock.',
        mermaid: `flowchart TD
  A[Select Shopify store] --> B[Sync product catalog]
  B --> C[Review catalog confirmation popup]
  C -->|Cancel or close| STOP[No sync request]
  C --> ACK[Acknowledge product-link refresh]
  ACK --> D[Confirm catalog sync]
  D --> E[Read Shopify product variants]
  E --> F[Create or refresh platform SKU links]
  F --> G[Disable sync on links for missing or changed SKUs]
  G --> H[Show variants imported and matching warehouse SKUs]
  H --> NOTE[Shopify products and stock unchanged by this import]`,
      },
      {
        id: 'inventory-confirm', title: 'Stock overwrite: final confirmation', kind: 'flow',
        description: 'The popup blocks warehouse stock push and store inventory sync until the user acknowledges the effects.',
        mermaid: `flowchart TD
  A[Push stock or Sync inventory] --> B[Show target store or warehouse]
  B --> C[Warn that Shopify stock will be overwritten]
  C --> D[Explain missing WMS stock may become zero and unavailable]
  D --> E{Acknowledgment checked?}
  E -->|No| BLOCK[Sync button disabled]
  BLOCK --> E
  E -->|Yes| F[Overwrite inventory and sync]
  C -->|Cancel or close before starting| STOP[No sync request]
  F --> G[Update mapped Shopify locations]
  G --> H{Complete?}
  H -->|Yes| I[Inspect result and verify Shopify quantity]
  H -->|Error| J[Review error and stock already applied before retry]
  I --> NOTE[Products are not deleted]
  J --> NOTE`,
      },
      {
        id: 'shared-stock', title: 'Shared inventory pool and sync result', kind: 'flow',
        description: 'Connected stores draw from warehouse availability; a completed older sync does not prove the newest sync succeeded.',
        mermaid: `flowchart LR
  A[Warehouse on-hand stock] --> B[Subtract reservations]
  B --> C[Available stock by SKU]
  C --> D[Pool connected warehouse quantities for mapped locations]
  D --> E[Store A location inventory]
  D --> F[Store B location inventory]
  MISS[Shopify SKU missing in WMS] --> ZERO[Publish zero stock]
  ZERO --> E
  ZERO --> F
  REQ[Store sync requested] --> QUEUE[Queued]
  QUEUE --> RUN[In progress]
  RUN --> DONE[Completed with counters and time]
  RUN --> ERR[Failed with error]
  DONE --> CHECK[Compare known SKU in Shopify]`,
      },
    ],
  },
  {
    id: 'wms-edit-hold', title: 'Shopify edit hold before warehouse push',
    summary: 'An edit hold delays dispatch after allocation; it differs from an inventory shortage hold.',
    diagrams: [
      {
        id: 'hold-release', title: 'Reserve now, dispatch after the hold', kind: 'flow',
        description: 'Company policy and store override determine the hold. Later Shopify edits do not extend the original deadline.',
        mermaid: `flowchart TD
  A[Order assigned and stock reserved] --> B{Effective hold policy?}
  B -->|Off| PUSH[Push allocated warehouse work]
  B -->|On| C[Defer WMS push for 1 to 240 minutes]
  C --> EDIT[Apply eligible Shopify edits before dispatch]
  EDIT --> C
  C -->|Deadline reached or Release now| PUSH
  C -->|Cancel hold| CANCEL[Clear allocation and release reserved stock]
  CANCEL --> MANUAL[Review order before reassigning]
  PUSH --> MODE{Warehouse mode}
  MODE -->|SFTP / EDI| EDI[940 delivery if enabled or manual download]
  MODE -->|ModernWMS| MW[Push dispatch]
  NOTE[Store inherits company policy or forces on or off] -.-> B`,
      },
      {
        id: 'backorder-rule', title: 'Continue-selling SKU backorder rule', kind: 'flow', edgeCase: true,
        description: 'The rule identifies a specific short-stock SKU that allows continued selling. Routing does not create physical stock.',
        mermaid: `flowchart TD
  A[Refresh store product links] --> B[Verify variant continue-selling policy]
  B --> C[Choose target warehouse in rule]
  C --> D[Add Continue-selling SKU short of stock condition]
  D --> E[Enter exact SKU and leave Require all items in stock off]
  E --> F[Place before broader matching rules and save]
  F --> G[Check matching order routing and allocation]
  G --> H[Review shortage policy and replenish physical stock]`,
      },
    ],
  },
  {
    id: 'carrier-tracking', title: 'Carrier tracking with Shipoo',
    summary: 'Shopify fulfillment reports shipment; carrier events establish transit and delivery.',
    diagrams: [
      {
        id: 'tracking-setup', title: 'Enable automatic carrier updates', kind: 'flow',
        description: 'Configure the destination, signing secret, and API key before relying on automatic shipment timelines.',
        mermaid: `flowchart TD
  A[Platform Shipoo base URL configured] --> B[Copy company inbound webhook URL]
  B --> C[Create tracking destination in Shipoo]
  C --> D[Save API key and signing secret with optional destination ID]
  D --> E[Enable auto-tracking and save]
  E --> F[Create shipment with valid carrier and tracking]
  F --> G[Register new shipment with Shipoo]
  G --> H[Receive and verify signed tracking webhook]
  H --> I[Update shipment stage and timeline]
  I --> J[Check Last webhook and order events]`,
      },
      {
        id: 'shipment-states', title: 'Shipment stages versus order fulfillment', kind: 'state',
        description: 'Normal delivery progression; manual transitions and carrier exceptions can skip stages. Fulfilled alone does not mean delivered.',
        mermaid: `stateDiagram-v2
  [*] --> pending
  pending --> labeled
  pending --> in_transit
  labeled --> in_transit
  labeled --> out_for_delivery
  labeled --> delivered
  in_transit --> out_for_delivery
  in_transit --> delivered
  out_for_delivery --> delivered
  delivered --> returned
  failed --> in_transit
  failed --> delivered
  failed --> returned
  note right of in_transit: An order can already be fulfilled while its parcels are still in transit`,
      },
    ],
  },
]
