import { Link } from '@tanstack/react-router'
import { PageHeader, PageSection } from '../ui'

type GuideRow = { label: string; meaning: string }

type GuideSection = {
  id: string
  title: string
  href?: string
  rootOnly?: boolean
  summary: string
  youSee?: string[]
  options?: GuideRow[]
  optionsTitle?: string
  statuses?: GuideRow[]
  statusesTitle?: string
  workflows?: { title: string; steps: string[] }[]
  tips?: string[]
}

const SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    title: 'Getting started',
    summary:
      'WMS Linker sits between Shopify and your warehouses. Shopify sends orders in; Linker routes and allocates them; warehouses get work via EDI 940 (SFTP) or ModernWMS; shipments come back and tracking is pushed to Shopify.',
    youSee: [
      'Left nav shows only the modules your role/permissions allow.',
      'Top bar shows your company name, your user, and role (Company Root / Company User / Warehouse User).',
      'Appearance menu (palette) changes accent colors; Company Root can save company branding.',
      'Green banners = success notices. Red banners = errors. Both auto-clear after a few seconds or via ×.',
    ],
    options: [
      {
        label: 'Company Root',
        meaning: 'Full access. Sees Users, Notifications, Email, and every module. Manages invites and branding.',
      },
      {
        label: 'Company User',
        meaning: 'Sees only modules enabled on their user. Can work across assigned company data (not warehouse-scoped).',
      },
      {
        label: 'Warehouse User',
        meaning: 'Scoped to specific warehouses. Orders/analytics/returns are limited to those warehouses.',
      },
    ],
    optionsTitle: 'Roles',
    workflows: [
      {
        title: 'First-time setup (Root)',
        steps: [
          'Create SFTP connections (if using EDI) under SFTP.',
          'Create Warehouses — set address, fulfillment mode (SFTP/EDI or ModernWMS), attach SFTP or ModernWMS credentials.',
          'Add Products/SKUs inventory (or Sync inventory from ModernWMS). SKUs must match Shopify variant SKUs.',
          'Configure Routing (rules + fallback warehouse) so new orders do not sit unassigned.',
          'Invite Users and grant only the modules they need.',
          'Optional: Email Settings for SMTP alerts on failures.',
        ],
      },
      {
        title: 'Day-to-day ops',
        steps: [
          'Work Orders for allocate / ship / sync.',
          'Check Failed when something breaks (routing, stock, SFTP, ModernWMS).',
          'Process Returns when goods come back — only Restock puts inventory back.',
          'Use Analytics for volume and warehouse health.',
        ],
      },
    ],
    tips: [
      'Shopify order numbers (e.g. #1001) can be the same on different stores — always check Store + order together.',
      'If a page is missing from the nav, you do not have that permission — ask a Company Root.',
      'Visual process diagrams (flows, use cases, edge cases) live at /account/diagrams — not listed in the sidebar; bookmark the link.',
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    href: '/account/analytics',
    summary:
      'Operational dashboard: how many orders moved, what is stuck, which warehouses are busy, return rates, carriers, and where you ship.',
    youSee: [
      'Range dropdown + Refresh.',
      'KPI cards: Total orders, In transit, Fulfilled (with partial count), Open returns, On hold, Errors, Unassigned, Failed DLQ.',
      'Highlight cards: top warehouse by orders, warehouse with most returns.',
      'Charts: orders over time, fulfillment funnel, orders/shipments/returns by status, warehouse rankings, carriers, SFTP health, channel mix, ship-to countries/regions.',
      'Warehouse map and ranking lists.',
    ],
    options: [
      { label: '7 / 30 / 90 / 365 days', meaning: 'Limits all KPIs and charts to that window. Default is often 30 days.' },
      { label: 'In transit', meaning: 'Shipments in labeled / in transit / out for delivery stages — not “order status” alone.' },
      { label: 'Failed DLQ', meaning: 'Open failed-order queue count for the range — same backlog as Failed.' },
      { label: 'Unassigned', meaning: 'Orders still without a committed warehouse.' },
    ],
    optionsTitle: 'Controls & KPI meanings',
    workflows: [
      {
        title: 'Daily health check',
        steps: [
          'Set range to 7 or 30 days.',
          'Scan warn cards: Open returns, On hold, Errors, Unassigned, Failed DLQ.',
          'If Failed or Unassigned is high, open Failed / Orders next.',
          'Use warehouse rankings to see who is overloaded or generating returns.',
        ],
      },
    ],
    tips: [
      'Warehouse users only see metrics for warehouses they are assigned to.',
      'Empty charts mean no data in that range — not a broken page.',
    ],
  },
  {
    id: 'orders',
    title: 'Orders',
    href: '/account/orders',
    summary:
      'Find and fulfill Shopify orders: assign warehouse, allocate lines, send 940 or ModernWMS dispatch, ship / upload 945, sync tracking to Shopify.',
    youSee: [
      'Status tabs + filters for Status, Store, Warehouse.',
      'Search for order #, SKU, or customer.',
      'Table: Order (+ customer), Store, Warehouse, Status, SFTP, View flow.',
      'Order detail: meta, errors, shipment flow diagram, assign warehouse, ship/945 actions, fulfillment groups, shipment tracking, create return, activity events.',
    ],
    statuses: [
      { label: 'Received', meaning: 'Ingested from Shopify; may still need warehouse / allocation.' },
      { label: 'Allocated (or Needs accept)', meaning: 'Warehouse committed (or only suggested — Accept suggestion to commit). Includes 940-ready style states shown as Allocated.' },
      { label: 'Partial', meaning: 'Some lines/groups shipped; remainder still open.' },
      { label: 'Fulfilled', meaning: 'Order fully shipped / closed on Linker side (no active return covering it).' },
      { label: 'Partially returned', meaning: 'An active RMA covers some — but not all — shipped quantity.' },
      { label: 'Returned', meaning: 'Active RMA(s) cover all returnable/shipped quantity. Shopify may be cancelled or have an open return.' },
      { label: 'Error', meaning: 'Pipeline failed — check lastError and Failed queue.' },
      { label: 'Return (tab)', meaning: 'Orders in returned / partially_returned, or still linked to an open RMA.' },
      { label: 'On hold', meaning: 'Held (e.g. inventory policy). Not always a top tab; available in status filter.' },
    ],
    statusesTitle: 'List statuses (what the badges mean)',
    options: [
      { label: 'Clear allocation', meaning: 'Unassigns the warehouse, releases reserved stock, and removes open fulfillment groups so you can Assign a different warehouse. Disabled after anything has shipped.' },
      { label: 'Assign / Accept suggestion', meaning: 'Commits the primary warehouse on the order (and allocates).' },
      { label: 'Download 940', meaning: 'EDI 940 warehouse shipping order file (SFTP/EDI path).' },
      { label: 'Ship / Ship group', meaning: 'Records shipment + tracking; may create Shopify fulfillment.' },
      { label: 'Sample 945 / Upload 945', meaning: 'Download a sample ASN or upload warehouse 945 to mark shipped.' },
      { label: 'ModernWMS dispatch', meaning: 'When warehouse mode is ModernWMS, Linker pushes a dispatch and polls until shipped.' },
      { label: 'Push / Re-sync Shopify', meaning: 'Creates/updates Shopify fulfillments for shipped groups missing sync.' },
      { label: 'Events', meaning: 'Activity log for this order (routing, SFTP, ship, errors).' },
      { label: 'Create return', meaning: 'Starts an RMA from the order (usually after something has shipped).' },
      {
        label: 'Shipment stages',
        meaning: 'Labeled → In transit → Out for delivery → Delivered (also Failed / Returned). Use Mark … buttons for allowed next steps.',
      },
    ],
    optionsTitle: 'Detail actions & options',
    workflows: [
      {
        title: 'SFTP / EDI warehouse',
        steps: [
          'Open order → Assign warehouse (or Accept suggestion).',
          'Allocate / wait for groups → download or auto-deliver 940 via SFTP (if routing setting enabled).',
          'When warehouse ships: enter tracking + Ship, or Upload 945.',
          'Confirm Shopify sync shows Synced (or Push / Re-sync).',
        ],
      },
      {
        title: 'ModernWMS warehouse',
        steps: [
          'Assign warehouse with ModernWMS mode and working credentials.',
          'Dispatch is pushed to ModernWMS; detail shows dispatch # and status.',
          'Warehouse completes pick/ship in ModernWMS UI.',
          'Linker polls; when delivered, it ships the group and syncs Shopify. You can still ship manually if needed.',
        ],
      },
      {
        title: 'Split / multi-warehouse',
        steps: [
          'Use fulfillment groups table — each group has its own Ship / 945 actions.',
          'Do not rely on the single-row ship form when multiple groups exist.',
        ],
      },
    ],
    tips: [
      'Warehouse dropdown for assign only lists warehouses that can stock the order SKUs.',
      'Ship is disabled when the order is cancelled or already fulfilled.',
      '“Needs accept” = routing suggested a warehouse but Auto-assign was off — click Accept suggestion.',
      'Demo orders may show Demo for Shopify sync instead of real Admin API sync.',
    ],
  },
  {
    id: 'returns',
    title: 'Returns',
    href: '/account/returns',
    summary:
      'Internal RMA tool: authorize customer/RTS returns, receive goods, choose disposition, restock or scrap. This does not create a Shopify refund by itself.',
    youSee: [
      'Tabs: All, Requested, Authorized, In transit, Received, Restocked, Refunded, Cancelled.',
      'Search by RMA, tracking, or reason.',
      'Table: RMA (+ Manual / From shipment RTS), order link, status, lines, warehouse, Manage drawer.',
      'Drawer: line qty / received / restocked, warehouse, disposition, note, transition buttons, history.',
    ],
    statuses: [
      { label: 'requested → authorized', meaning: 'Approve the RMA. Order moves to Partially returned or Returned; Shopify opens a return (partial) or cancels the order (full).' },
      { label: 'authorized → in_transit / received', meaning: 'Customer shipping back, or already at dock.' },
      { label: 'received → inspected / restocked / scrapped', meaning: 'Decide quality path.' },
      { label: 'restocked / scrapped → refunded or exchanged', meaning: 'Close the commercial outcome; linked Shopify return is closed when present.' },
      { label: 'cancelled', meaning: 'Stop the RMA; order may return to Fulfilled if no other active RMAs.' },
    ],
    statusesTitle: 'Status flow (allowed moves)',
    options: [
      { label: 'restock', meaning: 'Sellable again. Increases linker inventory. On ModernWMS warehouses also ASN-putaways into ModernWMS.' },
      { label: 'refurbish', meaning: 'Needs work — does NOT add sellable stock.' },
      { label: 'damaged', meaning: 'Not for sale — does NOT restock.' },
      { label: 'quarantine', meaning: 'Hold for review — does NOT restock.' },
      { label: 'dispose', meaning: 'Throw away — does NOT restock.' },
      { label: 'Restock inventory (button)', meaning: 'Runs restock for eligible lines with disposition Restock. Requires a warehouse set on the RMA.' },
      { label: 'Sources', meaning: 'manual (created in UI), shipment_rts (auto from returned shipment), customer.' },
    ],
    optionsTitle: 'Dispositions & buttons (what each is for)',
    workflows: [
      {
        title: 'Happy path restock',
        steps: [
          'Create return from order (or open existing RMA).',
          'Authorize → Received (set warehouse).',
          'Set disposition to Restock.',
          'Click Restocked / Restock inventory.',
          'Optionally mark Refunded or Exchanged when you handle money/exchange outside Linker.',
        ],
      },
    ],
    tips: [
      'Only disposition Restock changes inventory. Refurbish is not restock.',
      'ModernWMS restock needs goods owner + area/bin already set up in ModernWMS; otherwise restock fails.',
      'Inspected / Scrapped / Exchanged exist as statuses even if not every tab is shown.',
    ],
  },
  {
    id: 'failed',
    title: 'Failed orders',
    href: '/account/failed',
    summary:
      'Dead-letter queue (DLQ) for orders that could not finish routing, allocation, SFTP, ModernWMS, Shopify sync, or similar. Fix the cause, then act.',
    youSee: [
      'Tabs: Open · Resolved.',
      'Search on reason/error text.',
      'Columns: Reason, Error, Attempts, Created, Actions.',
      'Nav badge = open count.',
    ],
    options: [
      { label: 'Retry', meaning: 'Re-run processing after you fixed stock, routing, credentials, etc.' },
      { label: 'Reassign…', meaning: 'Pick another warehouse, then continue resolution.' },
      { label: 'Skip', meaning: 'Remove from the open queue without successful fulfill (use when you will handle offline).' },
    ],
    optionsTitle: 'Actions (Open tab)',
    workflows: [
      {
        title: 'Clear a failure',
        steps: [
          'Read Reason + Error (e.g. product not found, no warehouse match, SFTP auth).',
          'Fix root cause in Warehouses / Routing / SFTP / ModernWMS / Shopify SKUs.',
          'Retry — or Reassign if the original warehouse was wrong.',
          'Only Skip when you intentionally will not reprocess in Linker.',
        ],
      },
    ],
    tips: ['Retrying without fixing the cause just increments Attempts.'],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    href: '/account/notifications',
    rootOnly: true,
    summary: 'In-app alert inbox for order and system events (failures, fulfillments, etc.). Separate from the Email Settings SMTP emails.',
    youSee: [
      'Mark all read.',
      'Tabs: All · Unread (+ unread badge in nav).',
      'Optional text filter on the current page (title / message / type).',
      'Columns: Type, Message, Time (may show emailed), Read/Unread, Mark read.',
    ],
    options: [
      { label: 'Mark read / Mark all read', meaning: 'Clears unread state and the nav badge.' },
      { label: 'emailed', meaning: 'This alert was also sent via company SMTP when that event type was enabled.' },
    ],
    optionsTitle: 'Actions',
    tips: [
      'Search only filters the loaded page — change page size or clear Unread to find older items.',
      'Company Root only in the portal nav.',
    ],
  },
  {
    id: 'team',
    title: 'Users',
    href: '/account/team',
    rootOnly: true,
    summary: 'Invite people, set role, warehouse scope, and which modules they can open. Company Root always has full access.',
    youSee: [
      'Invite form: Name, Email, Role Type, module checkboxes, warehouses (for warehouse users).',
      'Team table with Edit / Invite / Reset for non-root users.',
      'Edit drawer: name, role, status active/disabled, warehouses, permissions.',
    ],
    options: [
      { label: 'Company User (member)', meaning: 'Company-wide data for modules you enable — not limited to one warehouse.' },
      { label: 'Warehouse User', meaning: 'Must pick warehouses. Data is scoped to those sites.' },
      { label: 'Orders & Shipments', meaning: 'View, allocate, fulfill orders.' },
      { label: 'Returns', meaning: 'RMA receive / restock.' },
      { label: 'Failed', meaning: 'Failed / DLQ resolution.' },
      { label: 'Analytics', meaning: 'Dashboards and maps.' },
      { label: 'Warehouses', meaning: 'Warehouse CRUD, ModernWMS, inventory, 940 templates.' },
      { label: 'SFTP & EDI', meaning: 'Named SFTP connections.' },
      { label: 'Order Routing', meaning: 'Routing rules and policies.' },
      { label: 'Email Settings', meaning: 'SMTP and alert toggles.' },
      { label: 'active / disabled', meaning: 'Disabled users cannot sign in.' },
    ],
    optionsTitle: 'Roles & module permissions',
    workflows: [
      {
        title: 'Invite a warehouse operator',
        steps: [
          'Role = Warehouse User → select their warehouses.',
          'Enable orders (+ returns/failed if they handle exceptions). Leave warehouses/routing/email off unless they should configure them.',
          'Invite user — if email does not send, copy the invite link from the banner.',
          'They set a password from the invite link, then sign in at the company login.',
        ],
      },
    ],
    tips: [
      'Default invite often enables orders/returns/failed/analytics and leaves warehouses/sftp/routing/email off.',
      'Notifications and Users pages are Root-only in the shell — there is no checkbox for those.',
    ],
  },
  {
    id: 'warehouses',
    title: 'Warehouses',
    href: '/account/warehouses',
    summary:
      'Each warehouse is a fulfillment location: address for routing, fulfillment mode, credentials, on-hand SKUs, and optional 940 template.',
    youSee: [
      'Add warehouse form (name, code, street, city, country/state, ZIP, optional default SFTP).',
      'Cards with mode badge ModernWMS or SFTP/EDI, address, connection status.',
      'Detail tabs: Fulfillment · ModernWMS · Products · 940 template.',
    ],
    options: [
      {
        label: 'SFTP / EDI (sftp_edi)',
        meaning: 'Legacy path: Linker builds 940 files and can upload them over an SFTP connection. Warehouse returns via ship UI or 945 upload.',
      },
      {
        label: 'ModernWMS (modernwms)',
        meaning: 'REST path: Linker pushes a dispatch into ModernWMS and polls until shipped, then syncs Shopify.',
      },
      { label: 'SFTP connection', meaning: 'Which named connection (from SFTP page) this warehouse uses for 940 upload.' },
      { label: 'Base URL / Username / Password', meaning: 'ModernWMS login endpoint and service user.' },
      { label: 'Tenant ID', meaning: 'ModernWMS tenant (often filled after Test connection).' },
      { label: 'Default customer ID', meaning: 'ModernWMS customer used on outbound dispatches.' },
      { label: 'Goods owner ID', meaning: 'Required for inbound putaway (including return restock into ModernWMS).' },
      { label: 'Auto-confirm in ModernWMS', meaning: 'After push, Linker tries confirm-order so pick can start without manual confirm.' },
      { label: 'Test connection', meaning: 'Validates credentials; on success may switch mode to ModernWMS and store tenant.' },
      { label: 'Sync inventory', meaning: 'Pulls ModernWMS stock into Linker warehouse inventory (ModernWMS mode only).' },
      { label: 'Products — Add to stock', meaning: 'Increments on-hand/available for a SKU.' },
      { label: 'Products — Set on-hand', meaning: 'Sets absolute quantity for a SKU.' },
      { label: 'Reserved', meaning: 'Qty held by open allocations — not free to sell/allocate elsewhere.' },
      { label: '940 template csv / x12', meaning: 'Custom outbound file layout (columns/segments, static/conditional fields).' },
    ],
    optionsTitle: 'Fulfillment, ModernWMS, inventory, templates',
    workflows: [
      {
        title: 'Add an SFTP warehouse',
        steps: [
          'Create SFTP connection first (and Test it).',
          'Add warehouse with address + country/state/ZIP.',
          'Fulfillment tab: mode SFTP/EDI → pick connection → Save.',
          'Products: seed SKUs that match Shopify.',
          'Optional: customize 940 template.',
        ],
      },
      {
        title: 'Add a ModernWMS warehouse',
        steps: [
          'ModernWMS tab: URL, user, password, customer ID, goods owner ID.',
          'Test connection → Save settings → set mode ModernWMS.',
          'Sync inventory or manually add Products/SKUs.',
          'Confirm area/bins exist in ModernWMS UI so return restock putaway can work.',
        ],
      },
    ],
    tips: [
      'Country and state are required for valid warehouse location.',
      'Shopify SKU must equal Linker SKU / ModernWMS barcode or allocation fails.',
      'Changing mode mid-stream changes how new work is sent — existing open orders may still need manual handling.',
    ],
  },
  {
    id: 'sftp',
    title: 'SFTP',
    href: '/account/sftp',
    summary: 'Reusable SFTP endpoints. Warehouses pick one of these connections when fulfillment mode is SFTP/EDI.',
    youSee: [
      'List of connections with Enabled / Off.',
      'Add/edit: Name, Send 940s checkbox, Host, Port (default 22), Username, Password, Remote path (default /inbound/940).',
      'Save · Test · Edit.',
    ],
    options: [
      { label: 'Send 940s over this connection', meaning: 'Marks the connection as intended for outbound 940 delivery.' },
      { label: 'Remote path', meaning: 'Folder on the SFTP server where 940 files are uploaded.' },
      { label: 'Enabled / Off', meaning: 'Off connections can still appear in pickers labeled (off) — turn on before production use.' },
      { label: 'Test / Test connection', meaning: 'Verifies login and reachability without sending an order file.' },
    ],
    optionsTitle: 'Fields & actions',
    workflows: [
      {
        title: 'Wire a new 3PL drop folder',
        steps: [
          'Add connection with host/user/password/path.',
          'Test connection until it succeeds.',
          'On each warehouse Fulfillment tab, select this connection and Save.',
          'Optionally enable Auto-deliver 940 via SFTP after routing (Routing settings).',
        ],
      },
    ],
    tips: ['One connection can be shared by many warehouses.', 'Password updates require re-saving the connection.'],
  },
  {
    id: 'routing',
    title: 'Order routing',
    href: '/account/routing',
    summary:
      'Decides which warehouse gets a new order: ordered rules first, then address ranking / priority, then default/fallback. Prevents “unassigned” and Failed when configured well.',
    youSee: [
      'Settings checkboxes and dropdowns + Save Config.',
      'Warehouse priorities table (priority, min stock, ZIP prefixes).',
      'Rules list with reorder ↑↓, Edit, Delete, Add Rule.',
      'Optional inventory quick-add for testing stock conditions.',
    ],
    options: [
      {
        label: 'Enable automatic order routing',
        meaning: 'Master switch. Off = no automatic evaluation.',
      },
      {
        label: 'Auto-assign warehouse when order is received',
        meaning: 'On = commit warehouse immediately. Off = only suggest (order shows Needs accept until someone Accepts/Assigns).',
      },
      {
        label: 'Auto-deliver 940 via SFTP after routing',
        meaning: 'After a warehouse is committed, try uploading the 940 for SFTP warehouses.',
      },
      { label: 'Default warehouse', meaning: 'Preferred warehouse when rules do not force another (depending on evaluation).' },
      { label: 'Fallback warehouse', meaning: 'Last resort if nothing else matches. If empty and no match → Error / Failed + notification.' },
      {
        label: 'Address ranking: off',
        meaning: 'Do not rank by geography.',
      },
      {
        label: 'Address ranking: zip_prefix',
        meaning: 'Prefer warehouses whose ZIP prefixes match the ship-to ZIP.',
      },
      {
        label: 'Address ranking: mapbox_distance',
        meaning: 'Prefer nearer warehouses when Mapbox geocoding is available.',
      },
      {
        label: 'Partial inventory: ship_available',
        meaning: 'Ship what you can (split / partial OK).',
      },
      {
        label: 'Partial inventory: hold_all',
        meaning: 'Hold the whole order until every line can ship.',
      },
      {
        label: 'Partial inventory: allow_customer_partial',
        meaning: 'Allow customer-facing partial shipments.',
      },
      {
        label: 'Rule Match and / or',
        meaning: 'All conditions must match (and) vs any condition (or).',
      },
      {
        label: 'Require all items in stock',
        meaning: 'Rule only wins if the target warehouse can cover every line.',
      },
      {
        label: 'Condition fields',
        meaning:
          'Order (counts, totals, weight, B2B, tags, risk), Items (SKU equals/contains/list), Shipping (country/state/city/ZIP, expedited, method), Customer (email/domain), Inventory (in stock, SKU stock >=, warehouse has SKU).',
      },
      {
        label: 'Operators',
        meaning:
          'Equals, Not equals, Contains, Does not contain, Starts/Ends with, Greater/Less than (± equal), In list / Not in list, Is true/false, Is empty / not empty.',
      },
    ],
    optionsTitle: 'Settings, policies, and rule building blocks',
    workflows: [
      {
        title: 'Typical production config',
        steps: [
          'Enable routing + Auto-assign.',
          'Set a Fallback warehouse so unmatched orders do not die in Failed.',
          'Add specific rules first (VIP tags, SKU lists, country) with low priority numbers / correct order.',
          'Use ZIP prefixes or mapbox ranking for regional preference.',
          'Save Config, then place a test Shopify order and confirm warehouse on the order.',
        ],
      },
    ],
    tips: [
      'Rules are evaluated in list order — first match wins. Use ↑↓ to reorder (clear search first if reorder is disabled).',
      'Empty condition list on a rule can match everything — be careful.',
      'Inventory conditions need accurate Products stock (or ModernWMS sync).',
    ],
  },
  {
    id: 'email',
    title: 'Email settings',
    href: '/account/email',
    rootOnly: true,
    summary: 'Optional SMTP so Linker can email your team when important events happen (in addition to in-app Notifications).',
    youSee: [
      'SMTP server fields, Notify on checkboxes, Recipients chips.',
      'Save Settings · Send Test Email.',
    ],
    options: [
      { label: 'Host / Port / Username / Password', meaning: 'Your mail server. Port often 587 with TLS.' },
      { label: 'From Name / From Email', meaning: 'Appears as the sender (From Name defaults to WMS Linker).' },
      { label: 'Use TLS/SSL', meaning: 'Encrypt the SMTP connection.' },
      { label: 'Enabled', meaning: 'Master switch for outbound alert email.' },
      { label: 'order_error', meaning: 'Email when an order hits an error state.' },
      { label: 'sftp_failed', meaning: 'Email when 940/SFTP delivery fails.' },
      { label: 'dlq_entry', meaning: 'Email when something lands in Failed.' },
      { label: '945_received', meaning: 'Email when a 945 / ship confirmation is processed.' },
      { label: 'order_fulfilled', meaning: 'Email when an order is fulfilled.' },
      { label: 'order_received', meaning: 'Email when a new order is ingested (can be noisy).' },
      { label: 'Recipients', meaning: 'Who gets the emails — add/remove address chips.' },
      { label: 'Send Test Email', meaning: 'Verifies SMTP before you rely on it in production.' },
    ],
    optionsTitle: 'SMTP fields & notify events',
    workflows: [
      {
        title: 'Turn on failure alerts',
        steps: [
          'Fill SMTP → enable TLS if required → Enabled on.',
          'Check order_error, sftp_failed, dlq_entry (common defaults).',
          'Add ops@… recipients → Save → Send Test Email.',
          'Confirm inbox, then watch Failed / Notifications together.',
        ],
      },
    ],
    tips: [
      'Company Root only.',
      'If invites fail to email, the portal still shows a copyable invite link banner.',
    ],
  },
]

function OptionTable({ title, rows }: { title: string; rows: GuideRow[] }) {
  return (
    <div className="user-guide-table-wrap">
      <h4 className="user-guide-subtitle">{title}</h4>
      <table className="user-guide-table">
        <thead>
          <tr>
            <th scope="col">Option</th>
            <th scope="col">What it is for</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function UserGuidePanel() {
  return (
    <div className="user-guide">
      <PageHeader
        title="User guide"
        description="Detailed reference for every company portal section — what each screen is for, what the options mean, and how to run common workflows without guessing."
        actions={
          <Link to="/account/diagrams" className="demo-button demo-button-secondary ui-btn-sm">
            Process diagrams
          </Link>
        }
      />

      <PageSection
        title="Process diagrams"
        description="Visual flows, use cases, and edge cases (split orders, routing failures, SFTP errors, and more). Not shown in the sidebar — open from this link."
        actions={
          <Link to="/account/diagrams" className="demo-button">
            Open all diagrams
          </Link>
        }
      >
        <p className="user-guide-note">
          Direct URL: <code className="process-diagrams-path">/account/diagrams</code> — all diagrams on one
          page.
        </p>
      </PageSection>

      <PageSection
        title="Jump to a section"
        description="Use the list below, or open the live page when your permissions allow."
      >
        <nav className="user-guide-toc" aria-label="Guide sections">
          {SECTIONS.map((section) => (
            <a key={section.id} className="user-guide-toc-link" href={`#guide-${section.id}`}>
              {section.title}
              {section.rootOnly ? <span className="user-guide-pill">Root</span> : null}
            </a>
          ))}
          <Link className="user-guide-toc-link" to="/account/diagrams">
            Process diagrams
            <span className="user-guide-pill">All on one page</span>
          </Link>
        </nav>
      </PageSection>

      <div className="user-guide-sections">
        {SECTIONS.map((section) => (
          <div key={section.id} id={`guide-${section.id}`} className="user-guide-section-wrap">
            <PageSection
              title={section.title}
              description={section.summary}
              actions={
                section.href ? (
                  <Link className="demo-button demo-button-secondary ui-btn-sm" to={section.href as never}>
                    Open {section.title}
                  </Link>
                ) : null
              }
            >
              {section.rootOnly ? (
                <p className="user-guide-note">Usually available to Company Root users only.</p>
              ) : null}

              {section.youSee?.length ? (
                <div className="user-guide-block">
                  <h4 className="user-guide-subtitle">What you see</h4>
                  <ul className="user-guide-list">
                    {section.youSee.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {section.statuses?.length ? (
                <OptionTable title={section.statusesTitle || 'Statuses'} rows={section.statuses} />
              ) : null}

              {section.options?.length ? (
                <OptionTable title={section.optionsTitle || 'Options'} rows={section.options} />
              ) : null}

              {section.workflows?.length ? (
                <div className="user-guide-block">
                  <h4 className="user-guide-subtitle">Common workflows</h4>
                  {section.workflows.map((flow) => (
                    <div key={flow.title} className="user-guide-workflow">
                      <p className="user-guide-workflow-title">{flow.title}</p>
                      <ol className="user-guide-steps">
                        {flow.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : null}

              {section.tips?.length ? (
                <ul className="user-guide-tips">
                  {section.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              ) : null}
            </PageSection>
          </div>
        ))}
      </div>
    </div>
  )
}
