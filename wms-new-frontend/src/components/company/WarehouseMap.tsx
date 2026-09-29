import { useMemo, useState } from 'react'

export type WarehouseMapPoint = {
  id: string
  name: string
  code?: string
  latitude: number
  longitude: number
  geoPlaceName?: string
  orderCount: number
  returnCount: number
  fulfilledCount?: number
  errorCount?: number
  onHoldCount?: number
  isActive?: boolean
  sharePct?: number
  returnRate?: number
  hot?: boolean
}

type NetworkPulse = {
  nodeCount: number
  routedOrders: number
  totalReturns: number
  concentrationPct: number
  leaderId: string | null
  leaderName: string | null
  hottestId: string | null
  hottestName: string | null
  hottestReturnRate: number
  unassignedOrders: number
  shipTo: Array<{ key: string; count: number }>
  nodes: WarehouseMapPoint[]
}

type WarehouseMapProps = {
  points: WarehouseMapPoint[]
  pulse?: NetworkPulse | null
  destinations?: {
    countries?: Array<{ key: string; count: number }>
    regions?: Array<{ key: string; count: number }>
  }
}

const STRIP = ['#2563eb', '#3b82f6', '#14b8a6', '#60a5fa', '#0d9488', '#93c5fd']

function placeLabel(p: WarehouseMapPoint) {
  if (!p.geoPlaceName) return p.code || '—'
  const parts = p.geoPlaceName.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`
  return parts[0]
}

export default function WarehouseMap({ points, pulse }: WarehouseMapProps) {
  const ranked = useMemo(() => {
    if (pulse?.nodes?.length) return pulse.nodes
    const total = Math.max(1, points.reduce((s, p) => s + p.orderCount, 0))
    return [...points]
      .sort((a, b) => b.orderCount - a.orderCount || b.returnCount - a.returnCount)
      .map((p) => {
        const sharePct = Math.round((p.orderCount / total) * 100)
        const returnRate =
          p.orderCount > 0
            ? Math.round((p.returnCount / p.orderCount) * 100)
            : p.returnCount > 0
              ? 100
              : 0
        return {
          ...p,
          sharePct,
          returnRate,
          hot: p.returnCount > 0 && returnRate >= 40,
        }
      })
  }, [points, pulse])

  const leader = ranked[0]
  const concentration = pulse?.concentrationPct ?? leader?.sharePct ?? 0
  const totalReturns = pulse?.totalReturns ?? ranked.reduce((s, p) => s + p.returnCount, 0)
  const routed = pulse?.routedOrders ?? ranked.reduce((s, p) => s + p.orderCount, 0)
  const hottest = useMemo(() => {
    if (pulse?.hottestName) return { name: pulse.hottestName, rate: pulse.hottestReturnRate }
    const hot = ranked.find((p) => p.hot)
    return hot ? { name: hot.name, rate: hot.returnRate || 0 } : null
  }, [pulse, ranked])
  const shipTo = (pulse?.shipTo || []).slice(0, 3)
  const [focusId, setFocusId] = useState<string | null>(leader?.id ?? null)
  const focused = ranked.find((p) => p.id === focusId) || leader || null

  if (!ranked.length) {
    return <div className="analytics-map-empty">No warehouse volume yet.</div>
  }

  return (
    <div className="analytics-whnet">
      <div className="analytics-whnet-hero">
        <div className="analytics-whnet-stats">
          <div>
            <strong>{concentration}%</strong>
            <span>top-node share</span>
          </div>
          <div>
            <strong>{routed}</strong>
            <span>routed orders</span>
          </div>
          <div>
            <strong>{totalReturns}</strong>
            <span>returns</span>
          </div>
        </div>
        <p className="analytics-whnet-insight">
          {hottest && hottest.rate > 0 ? (
            <>
              Returns press hardest at <b>{hottest.name}</b>
              {typeof hottest.rate === 'number' ? ` (${hottest.rate}%)` : ''}.
            </>
          ) : (
            <>Volume concentrates at <b>{leader?.name}</b> — returns stay quiet.</>
          )}
          {pulse?.unassignedOrders ? (
            <> · <em>{pulse.unassignedOrders} unassigned</em></>
          ) : null}
        </p>
      </div>

      <div className="analytics-whnet-strip" role="img" aria-label="Warehouse order share">
        {ranked.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`analytics-whnet-strip-seg${focusId === p.id ? ' is-on' : ''}${p.hot ? ' is-hot' : ''}`}
            style={{
              flexGrow: Math.max(p.orderCount, 0.35),
              flexBasis: 0,
              background: p.hot ? '#f59e0b' : STRIP[i % STRIP.length],
            }}
            title={`${p.name}: ${p.sharePct ?? 0}%`}
            onClick={() => setFocusId(p.id)}
          />
        ))}
      </div>

      <ul className="analytics-whnet-list">
        {ranked.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`analytics-whnet-row${focusId === p.id ? ' is-on' : ''}${p.hot ? ' is-hot' : ''}`}
              onClick={() => setFocusId(p.id)}
            >
              <span className="analytics-whnet-row-name">
                <strong className="truncate">{p.name}</strong>
                <em className="truncate">{placeLabel(p)}</em>
              </span>
              <span className="analytics-whnet-meters" aria-hidden>
                <span className="analytics-whnet-meter">
                  <span style={{ width: `${Math.max(p.sharePct || 0, p.orderCount > 0 ? 6 : 0)}%` }} />
                </span>
                <span className={`analytics-whnet-meter is-return${p.hot ? ' is-hot' : ''}`}>
                  <span
                    style={{
                      width: `${Math.min(100, Math.max(p.returnRate || 0, p.returnCount > 0 ? 8 : 0))}%`,
                    }}
                  />
                </span>
              </span>
              <span className="analytics-whnet-nums">
                <b>{p.orderCount}</b>
                <em>{p.returnCount > 0 ? `${p.returnCount} ret` : 'clean'}</em>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="analytics-whnet-foot">
        {focused ? (
          <span className="analytics-whnet-focus">
            <b>{focused.name}</b>
            {' · '}
            {focused.fulfilledCount ?? 0} fulfilled
            {(focused.errorCount || 0) > 0 ? ` · ${focused.errorCount} err` : ''}
            {(focused.onHoldCount || 0) > 0 ? ` · ${focused.onHoldCount} hold` : ''}
          </span>
        ) : null}
        {shipTo.length ? (
          <span className="analytics-whnet-shipto">
            Ship-to{' '}
            {shipTo.map((d) => (
              <em key={d.key}>
                {d.key} <b>{d.count}</b>
              </em>
            ))}
          </span>
        ) : (
          <span className="analytics-whnet-key" aria-hidden>
            <span>
              <i className="is-vol" /> Volume
            </span>
            <span>
              <i className="is-ret" /> Returns
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
