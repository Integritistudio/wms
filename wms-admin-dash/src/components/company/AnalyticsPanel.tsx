import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Filter,
  ChevronRight,
  History,
  LayoutDashboard,
  MapPinned,
  Package,
  PackageX,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  Truck,
  Warehouse,
  X,
} from 'lucide-react'
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

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>

type KpiTone = 'mint' | 'sky' | 'lavender' | 'peach' | 'rose' | 'ink' | 'amber'

const RANGE_OPTIONS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '365D', days: 365 },
]

const HERO_IMG = '/analytics-hero.jpg'

/** Soft anime pastel palette */
const PIE_COLORS_LIGHT = ['#34D399', '#FB7185', '#60A5FA', '#A78BFA', '#FB923C', '#F472B6', '#38BDF8', '#94A3B8']
const PIE_COLORS_DARK = ['#6EE7B7', '#FDA4AF', '#93C5FD', '#C4B5FD', '#FDBA74', '#F9A8D4', '#7DD3FC', '#CBD5E1']
const FUNNEL_TONES = ['mint', 'sky', 'lavender', 'peach', 'rose'] as const
const RANK_TONES = ['mint', 'sky', 'lavender', 'peach', 'rose', 'amber'] as const
const TONE_HEX: Record<KpiTone, string> = {
  mint: '#34D399',
  sky: '#60A5FA',
  lavender: '#A78BFA',
  peach: '#FB923C',
  rose: '#FB7185',
  ink: '#64748B',
  amber: '#FBBF24',
}

function useChartTheme() {
  const [theme, setTheme] = useState({
    grid: '#E2E8F0',
    tick: '#94A3B8',
    primary: '#34D399',
    pie: PIE_COLORS_LIGHT,
  })

  useEffect(() => {
    const read = () => {
      const root = document.documentElement
      const dark = root.classList.contains('dark')
      setTheme({
        grid: dark ? '#334155' : '#E2E8F0',
        tick: dark ? '#94A3B8' : '#94A3B8',
        primary: dark ? '#6EE7B7' : '#34D399',
        pie: dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT,
      })
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

function CardIcon({ icon: Icon, tone = 'mint' }: { icon: LucideIcon; tone?: string }) {
  return (
    <span className={`analytics-card-icon tone-${tone}`} aria-hidden>
      <Icon size={15} strokeWidth={2} />
    </span>
  )
}

function KpiSpark({ color, series, id }: { color: string; series: { v: number }[]; id: string }) {
  if (!series.length) return null
  const gradId = `spark-${id}`
  return (
    <div className="analytics-kpi-spark" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.6}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function statusTone(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('fulfill')) return 'mint'
  if (s.includes('return')) return 'rose'
  if (s.includes('transit') || s.includes('ship')) return 'sky'
  if (s.includes('hold') || s.includes('error') || s.includes('fail')) return 'peach'
  if (s.includes('940') || s.includes('ready') || s.includes('alloc')) return 'lavender'
  return 'ink'
}

function labelize(key: string) {
  return String(key || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtOrderId(order: ShopOrder) {
  return order.orderNumber || order.shopifyOrderId || order.id.slice(0, 8)
}

function formatRelative(iso?: string) {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  const mins = Math.max(0, Math.round(ms / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h`
  const daysAgo = Math.round(hrs / 24)
  if (daysAgo < 14) return `${daysAgo}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatChartDay(date: string) {
  const d = new Date(`${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function OrdersTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="analytics-chart-tooltip">
      <strong>{label ? formatChartDay(label) : ''}</strong>
      <span>{payload[0]?.value ?? 0} orders</span>
    </div>
  )
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
        listCompanyOrders({ page: 1, limit: 10 }).catch(() => null),
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

  const sparkSeriesByKpi = useMemo(() => {
    const rows = data?.kpiByDay?.length
      ? data.kpiByDay
      : (data?.ordersByDay || []).map((d) => ({
          date: d.date,
          total: d.count,
          inTransit: 0,
          fulfilled: 0,
          returned: 0,
          onHold: 0,
          errors: 0,
          unassigned: 0,
        }))
    const slice = rows.slice(-14)
    return {
      total: slice.map((d) => ({ v: d.total })),
      inTransit: slice.map((d) => ({ v: d.inTransit })),
      fulfilled: slice.map((d) => ({ v: d.fulfilled })),
      returned: slice.map((d) => ({ v: d.returned })),
      onHold: slice.map((d) => ({ v: d.onHold })),
      errors: slice.map((d) => ({ v: d.errors })),
      unassigned: slice.map((d) => ({ v: d.unassigned })),
    }
  }, [data])

  const kpis = summary
    ? [
        {
          label: 'Total orders',
          value: summary.totalOrders,
          icon: Package as LucideIcon,
          tone: 'ink' as KpiTone,
          hint: `${data?.range.days || days}d window`,
          spark: 'total' as const,
        },
        {
          label: 'In transit',
          value: summary.inTransit,
          icon: Truck as LucideIcon,
          tone: 'sky' as KpiTone,
          hint: 'Labeled / OOD',
          spark: 'inTransit' as const,
        },
        {
          label: 'Fulfilled',
          value: summary.fulfilled,
          icon: CheckCircle2 as LucideIcon,
          tone: 'mint' as KpiTone,
          hint: `${summary.partiallyFulfilled} partial`,
          spark: 'fulfilled' as const,
        },
        {
          label: 'Returned',
          value: (summary.returned || 0) + (summary.partiallyReturned || 0),
          icon: RotateCcw as LucideIcon,
          tone: 'rose' as KpiTone,
          hint: `${summary.openReturns} open RMAs`,
          warn: (summary.returned || 0) + (summary.partiallyReturned || 0) > 0,
          spark: 'returned' as const,
        },
        {
          label: 'On hold',
          value: summary.onHold,
          icon: PauseCircle as LucideIcon,
          tone: 'amber' as KpiTone,
          hint: 'Needs action',
          warn: summary.onHold > 0,
          spark: 'onHold' as const,
        },
        {
          label: 'Errors / DLQ',
          value: summary.errors + summary.failedDlq,
          icon: PackageX as LucideIcon,
          tone: 'peach' as KpiTone,
          hint: `${summary.failedDlq} in DLQ`,
          warn: summary.errors + summary.failedDlq > 0,
          to: '/account/failed' as const,
          spark: 'errors' as const,
        },
        {
          label: 'Unassigned',
          value: summary.unassigned,
          icon: MapPinned as LucideIcon,
          tone: 'lavender' as KpiTone,
          hint: 'No warehouse',
          warn: summary.unassigned > 0,
          to: '/account/orders' as const,
          search: { warehouse: 'unassigned' },
          spark: 'unassigned' as const,
        },
      ]
    : []

  function goUnassignedOrders() {
    void navigate({ to: '/account/orders', search: { warehouse: 'unassigned' } as never })
  }

  return (
    <div className="analytics-v2 analytics-anime oj-page">
      <header className="analytics-anime-hero">
        <div className="analytics-anime-hero-art" aria-hidden>
          <img src={HERO_IMG} alt="" />
          <div className="analytics-anime-hero-fade" />
        </div>
        <div className="analytics-anime-hero-copy">
          <div className="analytics-anime-crumb">
            <LayoutDashboard size={14} strokeWidth={2} aria-hidden />
            <span>Company</span>
            <span>/</span>
            <strong>Analytics</strong>
          </div>
          <div className="analytics-anime-title-row">
            <h1>Dispatch analytics</h1>
            {summary ? (
              <span className="analytics-anime-pill">
                <Activity size={12} strokeWidth={2.4} aria-hidden />
                {summary.totalOrders} orders
              </span>
            ) : null}
          </div>
          <p>Volume, fulfillment funnel, carriers, and warehouse share for the selected window.</p>
        </div>
        <div className="analytics-anime-hero-tools">
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
          <button
            type="button"
            className="analytics-anime-icon-btn"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh analytics"
            title="Refresh"
          >
            <RefreshCw size={16} strokeWidth={2.1} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
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
              <AlertTriangle size={18} strokeWidth={2.2} aria-hidden />
            </div>
            <div>
              <div className="analytics-critical-tags">
                <span className="analytics-critical-tag">Needs attention</span>
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
              <button className="analytics-anime-btn" type="button" onClick={goUnassignedOrders}>
                View unassigned
              </button>
            ) : null}
            {summary.failedDlq > 0 || summary.errors > 0 ? (
              <button
                className="analytics-anime-btn is-ghost"
                type="button"
                onClick={() => void navigate({ to: '/account/failed' })}
              >
                Review failed
              </button>
            ) : null}
            <button
              className="analytics-anime-icon-btn is-ink"
              type="button"
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}
            >
              <X size={15} strokeWidth={2.2} aria-hidden />
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
              const Icon = kpi.icon
              return (
                <button
                  key={kpi.label}
                  type="button"
                  className={`analytics-kpi tone-${kpi.tone}${kpi.warn ? ' is-warn' : ''}${clickable ? ' is-clickable' : ''}`}
                  disabled={!clickable}
                  onClick={() => {
                    if (!kpi.to) return
                    void navigate({
                      to: kpi.to,
                      ...(kpi.search ? { search: kpi.search as never } : {}),
                    })
                  }}
                >
                  <div className="analytics-kpi-top">
                    <span className="analytics-kpi-label">{kpi.label}</span>
                    <span className="analytics-kpi-icon" aria-hidden>
                      <Icon size={15} strokeWidth={2.1} />
                    </span>
                  </div>
                  <div className="analytics-kpi-value">{kpi.value}</div>
                  <div className="analytics-kpi-hint">
                    <strong>{kpi.hint}</strong>
                  </div>
                  <KpiSpark id={kpi.spark} color={TONE_HEX[kpi.tone]} series={sparkSeriesByKpi[kpi.spark]} />
                </button>
              )
            })}
          </div>

          <div className="analytics-charts">
            <section className="analytics-card analytics-orders-card">
              <div className="analytics-card-head">
                <div>
                  <h2>
                    <CardIcon icon={Activity} tone="mint" />
                    Orders over time
                  </h2>
                  <p className="analytics-card-desc">Daily order volume for the selected window</p>
                </div>
                <div className="analytics-legend">
                  <span>
                    <i className="tone-mint" /> Daily volume
                  </span>
                </div>
              </div>
              {data.ordersByDay.some((d) => d.count > 0) ? (
                <div className="analytics-chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.ordersByDay} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.28} />
                          <stop offset="70%" stopColor={chartTheme.primary} stopOpacity={0.06} />
                          <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 8" stroke={chartTheme.grid} vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatChartDay}
                        tick={{ fontSize: 11, fill: chartTheme.tick, fontWeight: 600 }}
                        minTickGap={36}
                        axisLine={false}
                        tickLine={false}
                        dy={6}
                      />
                      <YAxis
                        allowDecimals={false}
                        width={36}
                        tick={{ fontSize: 11, fill: chartTheme.tick, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<OrdersTooltip />}
                        cursor={{ stroke: chartTheme.primary, strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.45 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Orders"
                        stroke={chartTheme.primary}
                        strokeWidth={2.5}
                        fill="url(#ordersFill)"
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: chartTheme.primary }}
                        dot={false}
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
                  <h2>
                    <CardIcon icon={Filter} tone="lavender" />
                    Fulfillment funnel
                  </h2>
                  <p className="analytics-card-desc">Progress toward fulfilled</p>
                </div>
                <span className="analytics-anime-pill is-soft">Live</span>
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
                          className={`tone-${FUNNEL_TONES[idx % FUNNEL_TONES.length]}`}
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
                  <h3>
                    <CardIcon icon={Warehouse} tone="sky" />
                    Warehouse volume
                  </h3>
                  <p className="analytics-card-desc">Order share by location</p>
                </div>
              </div>
              {(data.warehouseOrderRank || []).length ? (
                <div className="analytics-wh-list">
                  {data.warehouseOrderRank.slice(0, 6).map((w, i) => (
                    <div key={w.warehouseId} className="analytics-wh-row">
                      <div className="analytics-wh-top">
                        <div className="analytics-wh-name">
                          <span className={`analytics-dot tone-${RANK_TONES[i % RANK_TONES.length]}`} />
                          <span className="truncate">{w.name}</span>
                        </div>
                        <span className="analytics-wh-count">{w.orderCount}</span>
                      </div>
                      <div className="analytics-wh-bar">
                        <span
                          className={`tone-${RANK_TONES[i % RANK_TONES.length]}`}
                          style={{ width: `${Math.max(4, (w.orderCount / warehouseMax) * 100)}%` }}
                        />
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
                  <h3>
                    <CardIcon icon={Truck} tone="mint" />
                    Carrier mix
                  </h3>
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
                          stroke="transparent"
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
                  <h3>
                    <CardIcon icon={ArrowLeftRight} tone="rose" />
                    Returns breakdown
                  </h3>
                  <p className="analytics-card-desc">RMA status mix</p>
                </div>
              </div>
              {returnsByStatus.length ? (
                <div className="analytics-return-list">
                  {returnsByStatus.map((row, i) => (
                    <div key={row.key} className="analytics-return-row">
                      <div className="analytics-return-top">
                        <div className="analytics-return-name">
                          <span className={`analytics-dot tone-${RANK_TONES[i % RANK_TONES.length]}`} />
                          {row.name}
                        </div>
                        <span className="analytics-return-count">{row.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="analytics-empty">No returns in this range.</p>
              )}
            </section>
          </div>

          <div className="analytics-mesh-row">
            <section className="analytics-card analytics-mesh-map">
              <div className="analytics-card-head">
                <div>
                  <h2>
                    <CardIcon icon={MapPinned} tone="sky" />
                    Routing mesh
                  </h2>
                  <p className="analytics-card-desc">Warehouse nodes sized by order volume</p>
                </div>
                <span className="analytics-anime-pill is-soft">{data.map.warehouses.length}</span>
              </div>
              <div className="analytics-map-wrap">
                <Suspense fallback={<p className="analytics-empty">Loading map…</p>}>
                  <WarehouseMap points={data.map.warehouses} height={280} />
                </Suspense>
              </div>
            </section>

            <section className="analytics-card analytics-dispatch">
              <div className="analytics-card-head">
                <div>
                  <h2>
                    <CardIcon icon={History} tone="lavender" />
                    Recent dispatches
                  </h2>
                  <p className="analytics-card-desc">Latest movement across the network</p>
                </div>
                <button
                  className="analytics-anime-btn is-ghost"
                  type="button"
                  onClick={() => void navigate({ to: '/account/orders' })}
                >
                  All
                </button>
              </div>
              {recentOrders.length ? (
                <ul className="analytics-dispatch-feed">
                  {recentOrders.map((order) => {
                    const wh =
                      warehouses.find((w) => w.id === order.warehouseId)?.name ||
                      (order.warehouseId ? 'Assigned' : 'Unassigned')
                    const detail = [order.carrier || order.shipmentStatus || order.channel || null, wh]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                      <li key={order.id}>
                        <button
                          type="button"
                          className="analytics-dispatch-row"
                          onClick={() =>
                            void navigate({ to: '/account/orders/$orderId', params: { orderId: order.id } })
                          }
                        >
                          <div className="analytics-dispatch-copy">
                            <strong>#{String(fmtOrderId(order)).replace(/^#/, '')}</strong>
                            <span>{detail}</span>
                          </div>
                          <span className={`analytics-status-pill tone-${statusTone(order.status)}`}>
                            {labelize(order.status)}
                          </span>
                          <time dateTime={order.updatedAt || order.createdAt}>
                            {formatRelative(order.updatedAt || order.createdAt)}
                          </time>
                          <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="analytics-empty">No recent dispatches yet.</p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}