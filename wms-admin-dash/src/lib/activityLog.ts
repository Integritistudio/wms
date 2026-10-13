import type { ActivityLogEntry } from './api'

function wordsFromIdentifier(value: string) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

export function titleCaseLabel(value?: string | null) {
  const words = wordsFromIdentifier(value || '')
  if (!words) return 'Pending'
  return words.replace(/\b\w/g, (char) => char.toUpperCase())
}

const SHOPIFY_MUTATION_LABELS: Record<string, string> = {
  fulfillmentOrderReportProgress: 'Reported fulfillment progress to Shopify',
  fulfillmentCreate: 'Created Shopify fulfillment',
  fulfillmentCreateV2: 'Created Shopify fulfillment',
  fulfillmentTrackingInfoUpdate: 'Updated Shopify tracking',
  fulfillmentTrackingInfoUpdateV2: 'Updated Shopify tracking',
  fulfillmentEventCreate: 'Recorded Shopify fulfillment event',
  orderClose: 'Closed order on Shopify',
  orderOpen: 'Reopened order on Shopify',
}

function humanShopifyMutation(mutation: string) {
  if (SHOPIFY_MUTATION_LABELS[mutation]) return SHOPIFY_MUTATION_LABELS[mutation]
  const labeled = titleCaseLabel(mutation)
  return labeled ? `Ran Shopify action: ${labeled}` : 'Ran Shopify action'
}

function humanStatusVerb(status: string) {
  const key = String(status || '').toLowerCase()
  if (key === 'success' || key === 'ok' || key === 'succeeded') return 'succeeded'
  if (key === 'error' || key === 'failed' || key === 'fail') return 'failed'
  return titleCaseLabel(status).toLowerCase()
}

/** Turn stored activity messages into short operator-facing copy. */
export function formatActivityMessage(log: Pick<ActivityLogEntry, 'message' | 'type' | 'meta'>) {
  const raw = String(log.message || '').trim()
  if (!raw) return '—'

  const shopifyMatch = raw.match(/^([A-Za-z][A-Za-z0-9]+)[_\s-]+(success|succeeded|ok|error|failed|fail)$/i)
  if (shopifyMatch || log.type === 'shopify_api') {
    const mutation =
      shopifyMatch?.[1] ||
      String((log.meta as { mutation?: string } | undefined)?.mutation || '').trim()
    const status =
      shopifyMatch?.[2] ||
      String((log.meta as { status?: string } | undefined)?.status || '').trim() ||
      'success'
    if (mutation) {
      const action = humanShopifyMutation(mutation)
      const verb = humanStatusVerb(status)
      if (verb === 'succeeded') return `${action}.`
      if (verb === 'failed') return `${action} failed.`
      return `${action} (${verb}).`
    }
  }

  const sftpMatch = raw.match(/^SFTP\s+(\w+)\s*:\s*(.+)$/i)
  if (sftpMatch || log.type === 'sftp_delivery') {
    const status = sftpMatch?.[1] || String((log.meta as { status?: string } | undefined)?.status || '')
    const filename = sftpMatch?.[2] || String((log.meta as { filename?: string } | undefined)?.filename || 'file')
    const verb = humanStatusVerb(status)
    if (verb === 'succeeded') return `Warehouse file ${filename} uploaded successfully.`
    if (verb === 'failed') return `Warehouse file ${filename} upload failed.`
    return `Warehouse file ${filename}: ${titleCaseLabel(status)}.`
  }

  if (/^\w+\s*→\s*\w+$/.test(raw) || /^\w+\s*->\s*\w+$/.test(raw)) {
    const [from, to] = raw.split(/\s*(?:→|->)\s*/)
    return `Moved from ${titleCaseLabel(from)} to ${titleCaseLabel(to)}.`
  }

  // Already sentence-like
  if (/[.!?]$/.test(raw) || /\s/.test(raw)) return raw

  return titleCaseLabel(raw)
}

export function formatActivityEvent(log: Pick<ActivityLogEntry, 'type' | 'toState' | 'fromState' | 'message' | 'meta'>) {
  if (log.toState) return titleCaseLabel(log.toState)
  if (log.type === 'shopify_api') return 'Shopify Sync'
  if (log.type === 'sftp_delivery') return 'SFTP Delivery'
  if (log.type === 'order_flow') return 'Order Update'
  if (log.type) return titleCaseLabel(log.type)
  return 'Event'
}
