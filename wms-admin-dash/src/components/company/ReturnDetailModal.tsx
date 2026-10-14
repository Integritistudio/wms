import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  MapPin,
  PackageCheck,
  RotateCcw,
  Truck,
} from 'lucide-react'
import { FormField, Modal, StatusBadge } from '../ui'
import {
  getReturn,
  receiveReturn,
  restockReturn,
  RETURN_STATUS_ACTIONS,
  updateReturnStatus,
  type ReturnRecord,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'

const DISPOSITION_COMPLETE_LABEL: Record<string, string> = {
  restock: 'Restock inventory',
  refurbish: 'Mark refurbished',
  damaged: 'Mark damaged',
  quarantine: 'Mark quarantined',
  dispose: 'Mark disposed',
}

const RETURN_FLOW = ['requested', 'authorized', 'in_transit', 'received', 'resolved'] as const

function returnFlowIndex(status: string) {
  if (status === 'requested') return 0
  if (status === 'authorized') return 1
  if (status === 'in_transit') return 2
  if (status === 'received' || status === 'inspected') return 3
  return 4
}

function formatReturnDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

type ReturnDetail = {
  return: ReturnRecord
  order: { id: string; orderNumber: string } | null
  allowedNext: string[]
}

export default function ReturnDetailModal({
  returnId,
  onClose,
  onUpdated,
  hideOrderLink = false,
}: {
  returnId: string | null
  onClose: () => void
  onUpdated?: () => void
  hideOrderLink?: boolean
}) {
  const { company, setError, setNotice } = useCompanyPortal()
  const warehouses = company?.warehouses || []

  const [detail, setDetail] = useState<ReturnDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [disposition, setDisposition] = useState('restock')

  useEffect(() => {
    if (!returnId) {
      setDetail(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const data = await getReturn(returnId)
        if (cancelled) return
        setDetail(data)
        setWarehouseId(
          data.return.warehouseId ||
            company?.warehouses?.find((w) => w.isActive !== false)?.id ||
            company?.warehouses?.[0]?.id ||
            '',
        )
        setDisposition(data.return.disposition || 'restock')
        setNote('')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unable to load return')
        setDetail(null)
        onClose()
      }
    })()
    return () => {
      cancelled = true
    }
    // Intentionally only re-fetch when returnId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnId])

  async function runAction(action: string) {
    if (!returnId) return
    setBusy(true)
    try {
      let result
      if (action === 'received') {
        result = await receiveReturn(returnId, {
          note: note || 'Received at warehouse',
          warehouseId: warehouseId || null,
        })
      } else if (action === 'restocked' || action === 'apply_disposition') {
        result = await restockReturn(returnId, {
          note: note || undefined,
          warehouseId: warehouseId || null,
          disposition,
        })
      } else {
        result = await updateReturnStatus(returnId, {
          status: action,
          note: note || undefined,
          warehouseId: warehouseId || null,
          disposition:
            action === 'inspected' ||
            action === 'scrapped' ||
            action === 'restocked' ||
            action === 'refurbished' ||
            action === 'damaged' ||
            action === 'quarantined' ||
            action === 'disposed'
              ? disposition
              : undefined,
        })
      }
      setDetail(result)
      setNotice(`Return marked ${String(result?.return?.status || action).replace(/_/g, ' ')}`)
      onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
    setBusy(false)
  }

  const whName = (id?: string | null) => warehouses.find((w) => w.id === id)?.name || (id ? id.slice(-6) : '—')
  const allowedLabels = RETURN_STATUS_ACTIONS.filter((a) => detail?.allowedNext.includes(a.value))
  const open = Boolean(returnId && detail)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={detail?.return.rmaNumber || 'Return'}
      description={detail?.return.reason || 'Return workflow'}
      className="return-modal"
    >
      {detail ? (() => {
        const flowIndex = returnFlowIndex(detail.return.status)
        const totalUnits = (detail.return.lines || []).reduce((sum, line) => sum + (line.quantity || 0), 0)
        const receivedUnits = (detail.return.lines || []).reduce((sum, line) => sum + (line.receivedQty || 0), 0)
        const resolved = flowIndex === RETURN_FLOW.length - 1
        const canApplyDisposition = ['authorized', 'in_transit', 'received', 'inspected'].includes(detail.return.status)

        return (
          <div className="return-modal-shell">
            <header className="return-modal-hero">
              <div className="return-modal-hero-glow" aria-hidden />
              <div className="return-modal-mark" aria-hidden><RotateCcw size={24} /></div>
              <div className="return-modal-title">
                <span className="return-modal-eyebrow">RETURN WORKSPACE</span>
                <div className="return-modal-title-row">
                  <h2>{detail.return.rmaNumber}</h2>
                  <StatusBadge status={detail.return.status} />
                </div>
                <p>{detail.return.reason || 'No return reason was supplied.'}</p>
              </div>
              <div className="return-modal-hero-meta">
                {!hideOrderLink && detail.order ? (
                  <Link to="/account/orders/$orderId" params={{ orderId: detail.order.id }} className="return-modal-order-link">
                    Order {detail.order.orderNumber} <ArrowUpRight size={14} aria-hidden />
                  </Link>
                ) : detail.order ? (
                  <span className="return-modal-order-link">Order {detail.order.orderNumber}</span>
                ) : null}
                <span>{detail.return.source === 'shipment_rts' ? 'Shipment RTS' : 'Manual RMA'}</span>
              </div>
            </header>

            <div className="return-modal-progress" aria-label={`Return status: ${detail.return.status.replace(/_/g, ' ')}`}>
              {RETURN_FLOW.map((step, index) => (
                <div className={`${index <= flowIndex ? 'is-complete ' : ''}${index === flowIndex ? 'is-current' : ''}`} key={step}>
                  <span>{index < flowIndex || resolved ? <Check size={14} aria-hidden /> : index + 1}</span>
                  <small>{step.replace(/_/g, ' ')}</small>
                </div>
              ))}
            </div>

            <section className="return-modal-facts" aria-label="Return summary">
              <div><Boxes size={17} aria-hidden /><span>ITEMS<strong>{detail.return.lines.length} {detail.return.lines.length === 1 ? 'SKU' : 'SKUs'} · {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}</strong></span></div>
              <div><PackageCheck size={17} aria-hidden /><span>RECEIVED<strong>{receivedUnits} of {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}</strong></span></div>
              <div><MapPin size={17} aria-hidden /><span>WAREHOUSE<strong>{whName(detail.return.warehouseId)}</strong></span></div>
              <div><Clock3 size={17} aria-hidden /><span>OPENED<strong>{formatReturnDate(detail.return.createdAt)}</strong></span></div>
            </section>

            <div className="return-modal-content">
              <div className="return-modal-main">
                <section className="return-modal-card return-modal-lines">
                  <div className="return-modal-section-head">
                    <div><span>RETURN CONTENTS</span><h3>Items coming back</h3></div>
                    <b>{totalUnits} UNITS</b>
                  </div>
                  <div className="return-modal-table-wrap">
                    <table>
                      <thead><tr><th>Product</th><th>SKU</th><th className="num">Qty</th><th className="num">Received</th><th className="num">Restocked</th></tr></thead>
                      <tbody>
                        {(detail.return.lines || []).map((line, idx) => (
                          <tr key={`${line.sku}-${idx}`}>
                            <td><strong>{line.title || 'Untitled item'}</strong><small>{line.disposition ? line.disposition.replace(/_/g, ' ') : 'Awaiting disposition'}</small></td>
                            <td><code>{line.sku || '—'}</code></td>
                            <td className="num"><b>{line.quantity}</b></td>
                            <td className="num">{line.receivedQty || 0}</td>
                            <td className="num">{line.restockedQty || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {(detail.return.trackingNumber || detail.return.carrier) ? (
                  <section className="return-modal-card return-modal-shipment">
                    <div className="return-modal-section-head"><div><span>INBOUND SHIPMENT</span><h3>Return logistics</h3></div><Truck size={20} aria-hidden /></div>
                    <div className="return-modal-shipment-row"><span><small>CARRIER</small><strong>{detail.return.carrier || 'Not supplied'}</strong></span><span><small>TRACKING</small><strong>{detail.return.trackingNumber || 'Not supplied'}</strong></span></div>
                  </section>
                ) : null}

                <section className="return-modal-card return-modal-history">
                  <div className="return-modal-section-head"><div><span>AUDIT TRAIL</span><h3>Status history</h3></div><Clock3 size={20} aria-hidden /></div>
                  {(detail.return.statusHistory || []).length ? (
                    <ol>
                      {[...(detail.return.statusHistory || [])].reverse().map((history, index) => (
                        <li key={`${history.status}-${index}`}>
                          <span className="return-history-dot"><Check size={12} aria-hidden /></span>
                          <div><strong>{history.status.replace(/_/g, ' ')}</strong><p>{history.note || 'Status updated'}</p></div>
                          <time dateTime={history.at}>{formatReturnDate(history.at)}</time>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="return-modal-empty">No status changes have been recorded yet.</p>}
                </section>
              </div>

              <aside className="return-modal-actions">
                <div className="return-modal-actions-head">
                  <span className="return-modal-action-icon"><ClipboardCheck size={20} aria-hidden /></span>
                  <div><span>OPERATION DESK</span><h3>Process this return</h3><p>Choose the receiving location, record a note, then move the RMA forward.</p></div>
                </div>

                <div className="return-modal-fields">
                  <FormField label="Receiving warehouse" htmlFor="return-warehouse">
                    <select id="return-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                      <option value="">Select warehouse</option>
                      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Final disposition" htmlFor="return-disposition">
                    <select id="return-disposition" value={disposition} onChange={(event) => setDisposition(event.target.value)}>
                      <option value="restock">Restock inventory</option>
                      <option value="refurbish">Refurbish</option>
                      <option value="damaged">Mark damaged</option>
                      <option value="quarantine">Quarantine</option>
                      <option value="dispose">Dispose</option>
                    </select>
                  </FormField>
                  <FormField label="Internal note" htmlFor="return-note" hint="Saved to the return history.">
                    <textarea id="return-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add inspection notes or handling instructions…" rows={3} />
                  </FormField>
                </div>

                <div className="return-modal-next-actions">
                  <span>NEXT WORKFLOW STEP</span>
                  {allowedLabels.length ? allowedLabels.map((action) => (
                    <button
                      key={action.value}
                      type="button"
                      className={/cancel|scrap|disposed|damaged/i.test(action.value) ? 'is-danger' : ''}
                      disabled={busy}
                      onClick={() => void runAction(action.value)}
                    >
                      <span>{action.label}</span><ChevronRight size={16} aria-hidden />
                    </button>
                  )) : <p>This return has no pending workflow transitions.</p>}
                </div>

                {canApplyDisposition ? (
                  <button
                    type="button"
                    className="return-modal-primary-action"
                    disabled={busy || (disposition === 'restock' && !warehouseId)}
                    onClick={() => void runAction('apply_disposition')}
                  >
                    <PackageCheck size={17} aria-hidden />
                    <span>{busy ? 'Updating return…' : DISPOSITION_COMPLETE_LABEL[disposition] || 'Apply disposition'}</span>
                  </button>
                ) : null}
                {disposition === 'restock' && canApplyDisposition && !warehouseId ? <p className="return-modal-action-hint">Select a warehouse before restocking inventory.</p> : null}
                <div className="return-modal-current"><span>Current state</span><StatusBadge status={detail.return.status} /></div>
              </aside>
            </div>
          </div>
        )
      })() : null}
    </Modal>
  )
}
