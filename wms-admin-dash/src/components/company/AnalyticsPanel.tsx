import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Alert } from '../ui'
import { getCompanyAnalytics, listCompanyOrders, type CompanyAnalytics, type ShopOrder } from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'

const WarehouseMap = lazy(() => import('./WarehouseMap'))

const RANGE_OPTIONS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '365D', days: 365 },
]

const PIE_COLORS_LIGHT = ['#FF4D2E', '#8EA3B0', '#161616', '#F4E06D', '#D9381F', '#5F7380', '#FF7A63', '#3A454C']
const PIE_COLORS_DARK = ['#FF7A63', '#8EA3B0', '#F4E06D', '#FF4D2E', '#B0C0CA', '#F1EDE4', '#D9381F', '#5F7380']

function useChartTheme() {
  const [theme, setTheme] = useState({
    grid: '#D4CEB8',
    tick: '#8EA3B0',
    primary: '#FF4D2E',
    pie: PIE_COLORS_LIGHT,
  })

  useEffect(() => {
    const read = () => {
      const root = document.documentElement
      const styles = getComputedStyle(root)
      const dark = root.classList.contains('dark')
      setTheme({
        grid: styles.getPropertyValue('--outline-variant').trim() || (dark ? '#3a454c' : '#D4CEB8'),
        tick: styles.getPropertyValue('--outline').trim() || (dark ? '#8EA3B0' : '#8EA3B0'),
        primary: styles.getPropertyValue('--primary').trim() || (dark ? '#FF7A63' : '#FF4D2E'),
        pie: dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT,
      })
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style', 'data-accent'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

function labelize(key: string) {
  return String(key || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtOrderId(order: ShopOrder) {
  return order.orderNumber || order.shopifyOrderId || order.id.slice(0, 8)
}

export default function AnalyticsPanel() {
  const navigate = useNavigate()
  const { company } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const chartTheme = useChartTheme()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<CompanyAnalytics | null>(null)
  const [recentOrders, setRecentOrders] = useState<ShopOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [payload, ordersPage] = await Promise.all([
        getCompanyAnalytics({ days }),
        listCompanyOrders({ page: 1, limit: 8 }).catch(() => null),
      ])
      setData(payload)
      setRecentOrders(ordersPage?.items || [])
      setBannerDismissed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const summary = data?.summary
  const showCritical =
    !bannerDismissed &&
    !!summary &&
    (summary.unassigned > 0 || summary.failedDlq > 0 || summary.errors > 0)

  const warehouseMax = useMemo(() => {
    const ranks = data?.warehouseOrderRank || []
    return Math.max(1, ...ranks.map((r) => r.orderCount))
  }, [data])

  const funnelMax = useMemo(() => {
    const rows = data?.fulfillmentFunnel || []
    return Math.max(1, ...rows.map((r) => r.count))
  }, [data])

  const carrierTotal = useMemo(() => {
    return (data?.topCarriers || []).reduce((sum, c) => sum + c.count, 0) || 1
  }, [data])

  const returnsByStatus = useMemo(
    () => (data?.returnsByStatus || []).map((r) => ({ name: labelize(r.key), value: r.count, key: r.key })),
    [data],
  )

  const kpis = summary
    ? [
        {
          label: 'Total orders',
          value: summary.totalOrders,
          icon: 'inventory_2',
          hint: `${data?.range.days || days}d window`,
        },
        {
          label: 'In transit',
          value: summary.inTransit,
          icon: 'local_shipping',
          hint: 'Labeled / OOD',
        },
        {
          label: 'Fulfilled',
          value: summary.fulfilled,
          icon: 'task_alt',
          hint: `${summary.partiallyFulfilled} partial`,
        },
        {
          label: 'Returned',
          value: (summary.returned || 0) + (summary.partiallyReturned || 0),
          icon: 'assignment_return',
          hint: `${summary.openReturns} open RMAs`,
          warn: (summary.returned || 0) + (summary.partiallyReturned || 0) > 0,
        },
        {
          label: 'On hold',
          value: summary.onHold,
          icon: 'pause_circle',
          hint: 'Needs action',
          warn: summary.onHold > 0,
        },
        {
          label: 'Errors / DLQ',
          value: summary.errors + summary.failedDlq,
          icon: 'error',
          hint: `${summary.failedDlq} in DLQ`,
          warn: summary.errors + summary.failedDlq > 0,
          to: '/account/failed' as const,
        },
        {
          label: 'Unassigned',
          value: summary.unassigned,
          icon: 'wrong_location',
          hint: 'No warehouse',
          warn: summary.unassigned > 0,
          to: '/account/orders/' as const,
          search: { warehouse: 'unassigned' },
        },
      ]
    : []

  function goUnassignedOrders() {
    void navigate({ to: '/account/orders/', search: { warehouse: 'unassigned' } })
  }

  return (
    <div className="analytics-v2">
      <header className="analytics-v2-header">
        <div>
          <div className="analytics-v2-crumb">
            <span className="material-symbols-outlined">home</span>
            <span>/</span>
            <span>Company</span>
            <span>/</span>
            <strong>Analytics</strong>
          </div>
          <div className="analytics-v2-title-row">
            <h1>Intelligence &amp; Dispatch Analytics</h1>
            {summary ? (
              <span className="analytics-v2-pill">{summary.totalOrders} active orders</span>
            ) : null}
          </div>
        </div>
        <div className="analytics-v2-toolbar">
          <div className="analytics-range" role="group" aria-label="Date range">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                className={days === opt.days ? 'is-active' : undefined}
                onClick={() => setDays(opt.days)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button className="demo-button demo-button-secondary" type="button" onClick={() => void load()} disabled={loading}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
              refresh
            </span>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error ? (
        <Alert tone="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}

      {showCritical && summary ? (
        <div className="analytics-critical">
          <div className="analytics-critical-main">
            <div className="analytics-critical-icon">
              <span className="material-symbols-outlined">warning</span>
            </div>
            <div>
              <div className="analytics-critical-tags">
                <span className="analytics-critical-tag">Critical routing</span>
                {summary.unassigned > 0 ? (
                  <span className="analytics-critical-id">{summary.unassigned} unassigned</span>
                ) : null}
                {summary.failedDlq > 0 ? (
                  <span className="analytics-critical-id">{summary.failedDlq} DLQ</span>
                ) : null}
                {summary.errors > 0 ? <span className="analytics-critical-id">{summary.errors} errors</span> : null}
              </div>
              <p>
                {summary.unassigned > 0
                  ? `${summary.unassigned} order${summary.unassigned === 1 ? '' : 's'} still need a warehouse.`
                  : null}{' '}
                {summary.failedDlq > 0 || summary.errors > 0
                  ? `${summary.failedDlq + summary.errors} item${summary.failedDlq + summary.errors === 1 ? '' : 's'} need attention in Failed / error states.`
                  : null}
              </p>
            </div>
          </div>
          <div className="analytics-critical-actions">
            {summary.unassigned > 0 ? (
              <button className="demo-button" type="button" onClick={goUnassignedOrders}>
                View unassigned
              </button>
            ) : null}
            {summary.failedDlq > 0 || summary.errors > 0 ? (
              <button
                className="demo-button demo-button-secondary"
                type="button"
                onClick={() => void navigate({ to: '/account/failed' })}
              >
                Review failed
              </button>
            ) : null}
            <button
              className="app-icon-btn"
              type="button"
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
      ) : null}

      {loading && !data ? (
        <p className="analytics-empty">Loading analytics…</p>
      ) : data && summary ? (
        <>
          <div className="analytics-kpi-grid">
            {kpis.map((kpi) => {
              const clickable = Boolean(kpi.to)
              return (
                <button
                  key={kpi.label}
                  type="button"
                  className={`analytics-kpi${kpi.warn ? ' is-warn' : ''}${clickable ? ' is-clickable' : ''}`}
                  disabled={!clickable}
                  onClick={() => {
                    if (!kpi.to) return
                    void navigate({
                      to: kpi.to,
                      ...(kpi.search ? { search: kpi.search } : {}),
                    })
                  }}
                >
                  <div className="analytics-kpi-top">
                    <span className="analytics-kpi-label">{kpi.label}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--outline)' }}>
                      {kpi.icon}
                    </span>
                  </div>
                  <div className="analytics-kpi-value">{kpi.value}</div>
                  <div className="analytics-kpi-hint">
                    <strong>{kpi.hint}</strong>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="analytics-charts">
            <section className="analytics-card">
              <div className="analytics-card-head">
                <div>
                  <h2>Orders over time</h2>
                  <p className="analytics-card-desc">Daily order volume for the selected window</p>
                </div>
                <div className="analytics-legend">
                  <span>
                    <i /> Orders
                  </span>
                </div>
              </div>
              {data.ordersByDay.some((d) => d.count > 0) ? (
                <div className="analytics-chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.ordersByDay}>
                      <defs>
                        <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartTheme.tick }} minTickGap={28} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.tick }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Orders"
                        stroke={chartTheme.primary}
                        strokeWidth={2}
                        fill="url(#ordersFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="analytics-empty">No orders in this range.</p>
              )}
            </section>

            <section className="analytics-card">
              <div className="analytics-card-head">
                <div>
                  <h2>Fulfillment funnel</h2>
                  <p className="analytics-card-desc">Progress toward fulfilled</p>
                </div>
                <span className="analytics-card-badge is-primary">Live</span>
              </div>
              {data.fulfillmentFunnel.some((d) => d.count > 0) ? (
                <div className="analytics-funnel">
                  {data.fulfillmentFunnel.map((row, idx) => (
                    <div key={row.stage} className="analytics-funnel-row">
                      <div className="analytics-funnel-top">
                        <span>{labelize(row.stage)}</span>
                        <code>{row.count}</code>
                      </div>
                      <div className="analytics-funnel-bar">
                        <span
                          className={idx % 2 === 1 ? 'is-tertiary' : undefined}
                          style={{ width: `${Math.max(4, (row.count / funnelMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="analytics-empty">No funnel data yet.</p>
              )}
            </section>
          </div>

          <div className="analytics-breakdown">
            <section className="analytics-card">
              <div className="analytics-card-head">
                <div>
                  <h3>Warehouse volume</h3>
                  <p className="analytics-card-desc">Order share by location</p>
                </div>
              </div>
              {(data.warehouseOrderRank || []).length ? (
                <div className="analytics-wh-list">
                  {data.warehouseOrderRank.slice(0, 6).map((w, i) => (
                    <div key={w.warehouseId} className="analytics-wh-row">
                      <div className="analytics-wh-top">
                        <div className="analytics-wh-name">
                          <span className={`analytics-dot${i === 1 ? ' is-tertiary' : i > 1 ? ' is-secondary' : ''}`} />
                          <span className="truncate">{w.name}</span>
                        </div>
                        <span className="analytics-wh-count">{w.orderCount}</span>
                      </div>
                      <div className="analytics-wh-bar">
                        <span style={{ width: `${Math.max(4, (w.orderCount / warehouseMax) * 100)}%` }} />
                      </div>
                      <div className="analytics-wh-meta">
                        <span className="analytics-wh-code">{w.code || `RANK ${w.rank}`}</span>
                        <span>{Math.round((w.orderCount / warehouseMax) * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="analytics-empty">No warehouse volume yet.</p>
              )}
            </section>

            <section className="analytics-card">
              <div className="analytics-card-head">
                <div>
                  <h3>Carrier mix</h3>
                  <p className="analytics-card-desc">Shipment carriers in range</p>
                </div>
              </div>
              {data.topCarriers.length ? (
                <div className="analytics-carrier">
                  <div style={{ width: 140, height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.topCarriers.map((c) => ({ name: c.key, value: c.count }))}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={42}
                          outerRadius={64}
                          paddingAngle={2}
                        >
                          {data.topCarriers.map((_, i) => (
                            <Cell key={i} fill={chartTheme.pie[i % chartTheme.pie.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="analytics-carrier-legend">
                    {data.topCarriers.slice(0, 5).map((c, i) => (
                      <div key={c.key}>
                        <strong>
                          <span
                            className="analytics-dot"
                            style={{ background: chartTheme.pie[i % chartTheme.pie.length], display: 'inline-block', marginRight: 6 }}
                          />
                          {c.key}
                        </strong>
                        <span>
                          {c.count} · {Math.round((c.count / carrierTotal) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="analytics-empty">No carrier shipments yet.</p>
              )}
            </section>

            <section className="analytics-card">
              <div className="analytics-card-head">
                <div>
                  <h3>Returns breakdown</h3>
                  <p className="analytics-card-desc">RMA status mix</p>
                </div>
              </div>
              {returnsByStatus.length ? (
                <div className="analytics-return-list">
                  {returnsByStatus.map((row, i) => (
                    <div key={row.key} className="analytics-return-row">
                      <div className="analytics-return-top">
                        <div className="analytics-return-name">
                          <span className={`analytics-dot${i % 2 ? ' is-tertiary' : ''}`} />
                          {row.name}
                        </div>
                        <span className="analytics-return-count">{row.value}</span>
                      </div>
                      {/* <span className="analytics-return-sub">{row.key}</span> */}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="analytics-empty">No returns in this range.</p>
              )}
            </section>
          </div>

          <section className="analytics-card">
            <div className="analytics-card-head">
              <div>
                <h2>Routing mesh</h2>
                <p className="analytics-card-desc">Live warehouse locations — marker size scales with order volume</p>
              </div>
              <span className="analytics-card-badge">{data.map.warehouses.length} nodes</span>
            </div>
            <div className="analytics-map-wrap">
              <Suspense fallback={<p className="analytics-empty">Loading map…</p>}>
                <WarehouseMap points={data.map.warehouses} />
              </Suspense>
            </div>
          </section>

          {recentOrders.length ? (
            <section className="analytics-card analytics-dispatch">
              <div className="analytics-card-head">
                <div>
                  <h2>Recent dispatches</h2>
                  <p className="analytics-card-desc">Latest company orders</p>
                </div>
                <button
                  className="demo-button demo-button-secondary"
                  type="button"
                  onClick={() => void navigate({ to: '/account/orders' })}
                >
                  View all
                </button>
              </div>
              <div className="demo-table-shell">
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Status</th>
                      <th>Warehouse</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="is-clickable"
                        onClick={() => void navigate({ to: '/account/orders/$orderId', params: { orderId: order.id } })}
                      >
                        <td>
                          <code>{fmtOrderId(order)}</code>
                        </td>
                        <td>{labelize(order.status)}</td>
                        <td className="demo-cell-secondary">
                          {warehouses.find((w) => w.id === order.warehouseId)?.name ||
                            (order.warehouseId ? order.warehouseId.slice(0, 8) : '—')}
                        </td>
                        <td className="demo-cell-secondary">
                          {order.updatedAt ? new Date(order.updatedAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}