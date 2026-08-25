type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const STATUS_MAP: Record<string, BadgeVariant> = {
  received: 'info',
  '940_ready': 'info',
  allocated: 'info',
  '945_received': 'warning',
  partially_fulfilled: 'warning',
  fulfilled: 'success',
  cancelled: 'neutral',
  ignored: 'neutral',
  error: 'danger',
  on_hold: 'warning',
  returns: 'warning',
  return: 'warning',
  picking: 'info',
  picked: 'info',
  packing: 'info',
  packed: 'info',
  shipped: 'success',
  pending: 'warning',
  labeled: 'info',
  in_transit: 'info',
  out_for_delivery: 'warning',
  delivered: 'success',
  returned: 'warning',
  failed: 'danger',
  requested: 'warning',
  authorized: 'info',
  inspected: 'info',
  restocked: 'success',
  scrapped: 'danger',
  refunded: 'success',
  exchanged: 'info',
  skipped: 'neutral',
  sent: 'success',
  HMAC_FAIL: 'danger',
  MAPPING_EXCEPTION: 'danger',
  SFTP_ERROR: 'danger',
  SHOPIFY_ERROR: 'danger',
  PRODUCT_NOT_FOUND: 'danger',
  root: 'info',
  member: 'neutral',
  warehouse: 'success',
  dlq_entry: 'danger',
  sftp_failed: 'danger',
  order_error: 'danger',
  order_flow: 'info',
  shopify_api: 'info',
  sftp_delivery: 'warning',
  '945_received_notif': 'success',
}

function variantFor(value: string): BadgeVariant {
  return STATUS_MAP[value] || STATUS_MAP[value.toLowerCase()] || 'neutral'
}

function labelFor(value: string): string {
  return value.replace(/_/g, ' ')
}

type StatusBadgeProps = {
  status: string
  label?: string
  variant?: BadgeVariant
}

export default function StatusBadge({ status, label, variant }: StatusBadgeProps) {
  const resolved = variant || variantFor(status)
  return (
    <span className={`demo-badge demo-badge-${resolved}`}>
      {label || labelFor(status)}
    </span>
  )
}
