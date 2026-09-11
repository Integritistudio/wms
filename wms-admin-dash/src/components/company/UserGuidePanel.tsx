import { Link } from '@tanstack/react-router'
import { PageHeader, PageSection } from '../ui'

type GuideSection = {
  id: string
  title: string
  href?: string
  rootOnly?: boolean
  summary: string
  steps: string[]
  tips?: string[]
}

const SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    title: 'Getting started',
    summary:
      'WMS Linker connects your Shopify stores to warehouses. Orders arrive from Shopify, get routed to a warehouse, go out as warehouse work (EDI 940 or ModernWMS), then ship back with tracking into Shopify.',
    steps: [
      'Connect warehouses and choose fulfillment mode (SFTP/EDI or ModernWMS).',
      'Configure routing so new orders auto-assign a warehouse when possible.',
      'Keep inventory or ModernWMS stock in sync so allocation can succeed.',
      'Use Orders for day-to-day fulfill, Failed for exceptions, Returns for RMA restock.',
    ],
    tips: [
      'Company Root users see every module. Other users only see modules granted in Users.',
      'Warehouse users are scoped to their assigned warehouses.',
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    href: '/account/analytics',
    summary: 'Dashboard for order volume, fulfillment health, warehouse rankings, returns, and destination mix.',
    steps: [
      'Open Analytics to review KPIs for the selected date range (7 / 30 / 90 / 365 days).',
      'Check top warehouses by orders and returns, fulfillment funnel, and carrier mix.',
      'Use the warehouse map to see where volume is concentrated.',
    ],
    tips: ['Warehouse-scoped users only see metrics for warehouses they can access.'],
  },
  {
    id: 'orders',
    title: 'Orders',
    href: '/account/orders',
    summary: 'Search, filter, allocate, push warehouse work, ship, and sync fulfillments back to Shopify.',
    steps: [
      'Find an order by number, customer, SKU, status, shop, or warehouse.',
      'Open the order to assign a warehouse (if needed), review line items and fulfillment groups.',
      'For SFTP warehouses: send/download the 940, then ship or upload a 945 when the warehouse finishes.',
      'For ModernWMS warehouses: push creates a dispatch; when MWMS marks it shipped, Linker closes the loop and syncs Shopify.',
      'Use cancel / release paths carefully — they free reserved inventory when supported.',
    ],
    tips: [
      'Shopify order numbers can repeat across stores — always confirm shop + order together.',
      'SKU on Shopify must match ModernWMS barcode / linker inventory SKU for allocation.',
    ],
  },
  {
    id: 'returns',
    title: 'Returns',
    href: '/account/returns',
    summary: 'Internal RMA workflow: authorize, receive, inspect, then restock or dispose. This is not a Shopify refund.',
    steps: [
      'Create an RMA from an order or the Returns list.',
      'Authorize → receive (and optionally inspect) at the warehouse.',
      'Set disposition per line. Only Restock adds inventory back.',
      'Restock updates linker inventory. On ModernWMS warehouses it also putaways stock in ModernWMS.',
    ],
    tips: [
      'Refurbish, damaged, quarantine, and dispose do not increase sellable stock.',
      'Choose the correct warehouse before restocking.',
    ],
  },
  {
    id: 'failed',
    title: 'Failed orders',
    href: '/account/failed',
    summary: 'Dead-letter queue for orders that could not route, allocate, push, or fulfill automatically.',
    steps: [
      'Open Failed to see why an order stopped (routing miss, missing SKU, SFTP error, ModernWMS error, etc.).',
      'Retry after fixing the underlying issue (inventory, credentials, routing).',
      'Reassign to another warehouse when appropriate, or skip if the order should leave the queue.',
    ],
    tips: ['A badge on Failed means items still need attention.'],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    href: '/account/notifications',
    rootOnly: true,
    summary: 'In-app alerts for order events, failures, and operational updates.',
    steps: [
      'Open Notifications to review unread alerts.',
      'Mark one or all as read when handled.',
      'Pair with Email Settings if you also want SMTP alerts.',
    ],
  },
  {
    id: 'team',
    title: 'Users',
    href: '/account/team',
    rootOnly: true,
    summary: 'Invite company and warehouse users and control which modules they can open.',
    steps: [
      'Invite by email. Copy the invite link if email delivery is unavailable.',
      'Assign role: Company Root, Company User, or Warehouse User.',
      'For non-root users, enable module permissions (orders, returns, warehouses, routing, …).',
      'Warehouse users should also be assigned specific warehouses.',
    ],
  },
  {
    id: 'warehouses',
    title: 'Warehouses',
    href: '/account/warehouses',
    summary: 'Define fulfillment locations, inventory, and how each site talks to your WMS.',
    steps: [
      'Create a warehouse with address / country so routing and shipping context are valid.',
      'Pick fulfillment mode: SFTP/EDI or ModernWMS.',
      'SFTP mode: attach a named SFTP connection and EDI templates as needed.',
      'ModernWMS mode: set base URL, username/password, tenant, customer, and goods owner; test connection.',
      'Maintain Products / SKUs inventory used for allocation (or sync from ModernWMS when available).',
    ],
    tips: [
      'ModernWMS restock on returns requires goods owner plus area/bin locations in ModernWMS.',
      'Barcode / SKU must match Shopify variant SKUs.',
    ],
  },
  {
    id: 'sftp',
    title: 'SFTP',
    href: '/account/sftp',
    summary: 'Named SFTP connections that warehouses can share for outbound 940 files.',
    steps: [
      'Create a connection with host, port, credentials, and remote path.',
      'Test the connection before attaching it to warehouses.',
      'Assign the connection on each warehouse that uses SFTP/EDI fulfillment.',
    ],
  },
  {
    id: 'routing',
    title: 'Order routing',
    href: '/account/routing',
    summary: 'Rules and policies that choose a warehouse automatically when an order arrives.',
    steps: [
      'Turn routing on and decide auto-assign vs suggest-only behavior.',
      'Add ordered rules with conditions (shop, ZIP, SKU, inventory, tags, etc.).',
      'Set a fallback warehouse for when no rule matches (otherwise orders may go to Failed).',
      'Keep inventory accurate so inventory-aware conditions work.',
    ],
    tips: ['Rule order matters — first match wins.'],
  },
  {
    id: 'email',
    title: 'Email settings',
    href: '/account/email',
    rootOnly: true,
    summary: 'Optional SMTP so important events can email your ops team.',
    steps: [
      'Enter SMTP host, port, auth, and from address.',
      'Choose which events should notify (failures, shipments, etc.).',
      'Add recipient addresses and save.',
    ],
  },
]

export default function UserGuidePanel() {
  return (
    <div className="user-guide">
      <PageHeader
        title="User guide"
        description="How each section of the company portal works — from routing and warehouses to orders, returns, and exceptions."
      />

      <PageSection title="Jump to a section" description="Click a topic to scroll, or open the live page when you have access.">
        <nav className="user-guide-toc" aria-label="Guide sections">
          {SECTIONS.map((section) => (
            <a key={section.id} className="user-guide-toc-link" href={`#guide-${section.id}`}>
              {section.title}
              {section.rootOnly ? <span className="user-guide-pill">Root</span> : null}
            </a>
          ))}
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
                <p className="user-guide-note">Usually available to Company Root users.</p>
              ) : null}
              <ol className="user-guide-steps">
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
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
