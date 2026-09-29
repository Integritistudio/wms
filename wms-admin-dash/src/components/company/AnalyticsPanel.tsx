import { useCallback, useEffect, useMemo, useState, type ComponentType, type CSSProperties, type SVGProps } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Filter,
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
  ChevronRight,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Alert } from '../ui'
import { getCompanyAnalytics, listCompanyOrders, type CompanyAnalytics, type ShopOrder } from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>
type KpiTone = 'mint' | 'sky' | 'lavender' | 'peach' | 'rose' | 'ink' | 'amber'

const RANGE_OPTIONS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '365D', days: 365 },
]

const COBALT_SHADES = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#0f172a']
const PIE_COLORS = ['#2563eb', '#60a5fa', '#f59e0b', '#1d4ed8', '#93c5fd', '#3b82f6', '#0f172a', '#d97706']
const FUNNEL_COLORS = ['#bfdbfe', '#93c5fd', '#60a5fa', '#2563eb', '#1e40af']
const RETURN_COLORS = ['#f59e0b', '#60a5fa', '#2563eb', '#d97706', '#93c5fd', '#1d4ed8', '#0f172a']
const TONE_HEX: Record<KpiTone, string> = {
  mint: '#3b82f6',
  sky: '#2563eb',
  lavender: '#1d4ed8',
  peach: '#d97706',
  rose: '#f59e0b',
  ink: '#0f172a',
  amber: '#f59e0b',
}

function returnAt(index: number) {
  return RETURN_COLORS[index % RETURN_COLORS.length]
}

function shadeAt(index: number) {
  return COBALT_SHADES[index % COBALT_SHADES.length]
}

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
}

function useChartTheme() {
  const [theme, setTheme] = useState({
    grid: '#e2e8f0',
    tick: '#94a3b8',
    primary: '#2563eb',
    surface: '#ffffff',
    ink: '#0f172a',
  })

  useEffect(() => {
    const read = () => {
      const dark = document.documentElement.classList.contains('dark')
      setTheme({
        grid: dark ? '#334155' : '#e2e8f0',
        tick: '#94a3b8',
        primary: dark ? '#60a5fa' : '#2563eb',
        surface: dark ? '#1e293b' : '#ffffff',
        ink: dark ? '#f8fafc' : '#0f172a',
      })
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

function CardIcon({ icon: Icon }: { icon: LucideIcon; tone?: string }) {
  return (
    <span className="analytics-card-icon tone-ink" aria-hidden>
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
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function labelize(key: string) {
  return String(key || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function statusTone(status?: string): KpiTone {
  const s = String(status || '').toLowerCase()
  if (s.includes('error') || s.includes('fail') || s.includes('dlq')) return 'peach'
  if (s.includes('return')) return 'rose'
  if (s.includes('hold') || s.includes('pause')) return 'amber'
  if (s.includes('fulfill') || s.includes('deliver') || s.includes('complete')) return 'mint'
  if (s.includes('ready') || s.includes('label') || s.includes('transit') || s.includes('ship')) return 'sky'
  if (s.includes('unassign') || s.includes('pending')) return 'lavender'
  return 'ink'
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

function CarrierTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; payload?: { percent?: number } }>
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]
  return (
    <div className="analytics-chart-tooltip">
      <strong>{row.name}</strong>
      <span>
        {row.value ?? 0} · {row.payload?.percent ?? 0}%
      </span>
    </div>
  )
}

function ReturnsStack({
  rows,
  total,
  colorAt,
}: {
  rows: Array<{ key: string; name: string; value: number }>
  total: number
  colorAt: (index: number) => string
}) {
  const [tip, setTip] = useState<{ name: string; value: number; pct: number; color: string; x: number } | null>(
    null,
  )

  return (
    <div
      className="analytics-returns-stack"
      onMouseLeave={() => setTip(null)}
      style={tip ? ({ ['--tip-x' as string]: `${tip.x}px` } as CSSProperties) : undefined}
    >
      {rows.map((row, i) => {
        const pct = Math.max(3, Math.round((row.value / total) * 100))
        const color = colorAt(i)
        return (
          <button
            key={row.key}
            type="button"
            aria-label={`${row.name}: ${row.value} (${pct}%)`}
            style={{ width: `${pct}%`, background: color }}
            onMouseEnter={(e) => {
              const parent = e.currentTarget.parentElement
              if (!parent) return
              const parentBox = parent.getBoundingClientRect()
              const box = e.currentTarget.getBoundingClientRect()
              setTip({
                name: row.name,
                value: row.value,
                pct: Math.round((row.value / total) * 100),
                color,
                x: box.left - parentBox.left + box.width / 2,
              })
            }}
            onFocus={(e) => {
              const parent = e.currentTarget.parentElement
              if (!parent) return
              const parentBox = parent.getBoundingClientRect()
              const box = e.currentTarget.getBoundingClientRect()
              setTip({
                name: row.name,
                value: row.value,
                pct: Math.round((row.value / total) * 100),
                color,
                x: box.left - parentBox.left + box.width / 2,
              })
            }}
            onBlur={() => setTip(null)}
          />
        )
      })}
      {tip ? (
        <div className="analytics-returns-tip" role="tooltip">
          <strong>
            <i style={{ background: tip.color }} />
            {tip.name}
          </strong>
          <em>
            {tip.value} · {tip.pct}%
          </em>
        </div>
      ) : null}
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="analytics-skel" aria-hidden>
      <div className="analytics-skel-hero" />
      <div className="analytics-skel-kpis">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="analytics-skel-kpi" />
        ))}
      </div>
      <div className="analytics-skel-charts">
        <div className="analytics-skel-card analytics-skel-card--wide" />
        <div className="analytics-skel-card" />
      </div>
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
        listCompanyOrders({ page: 1, limit: 25 }).catch(() => null),
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

  const returnsByStatus = useMemo(() => {
    const rows = (data?.returnsByStatus || [])
      .map((r) => ({ name: labelize(r.key), value: r.count, key: r.key }))
      .sort((a, b) => b.value - a.value)
    const sum = rows.reduce((acc, r) => acc + r.value, 0)
    const total = sum || 1
    const top = rows.slice(0, 4)
    const rest = rows.slice(4)
    const otherValue = rest.reduce((acc, r) => acc + r.value, 0)
    const display =
      otherValue > 0
        ? [...top, { name: `Other (${rest.length})`, value: otherValue, key: '__other' }]
        : top
    return { rows, display, total, sum, otherLabels: rest.map((r) => `${r.name} ${r.value}`) }
  }, [data])

  const funnelRadial = useMemo(() => {
    const rows = data?.fulfillmentFunnel || []
    return rows.map((row, idx) => ({
      name: labelize(row.stage),
      value: row.count,
      fill: FUNNEL_COLORS[idx % FUNNEL_COLORS.length],
      full: funnelMax,
    }))
  }, [data, funnelMax])

  const carrierPie = useMemo(
    () =>
      (data?.topCarriers || []).map((c) => ({
        name: c.key,
        value: c.count,
        percent: Math.round((c.count / carrierTotal) * 100),
      })),
    [data, carrierTotal],
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
      <motion.header
        className="analytics-anime-hero"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="analytics-anime-hero-mist" aria-hidden />
        <div className="analytics-anime-hero-orb analytics-anime-hero-orb--a" aria-hidden />
        <div className="analytics-anime-hero-orb analytics-anime-hero-orb--b" aria-hidden />

        <div className="analytics-anime-hero-copy">
          <div className="analytics-anime-crumb">
            <LayoutDashboard size={14} strokeWidth={2} aria-hidden />
            <span>Company</span>
            <span>/</span>
            <strong>Analytics</strong>
          </div>
          <div className="analytics-anime-title-row">
            <h1>
              Orders in.
              <em> Insight out.</em>
            </h1>
            {summary ? (
              <span className="analytics-anime-pill">
                <Activity size={12} strokeWidth={2.4} aria-hidden />
                {summary.totalOrders} orders
              </span>
            ) : null}
          </div>
          <p>Volume, fulfillment, carriers, and warehouse share — live across your routing mesh.</p>
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
      </motion.header>

      {error ? (
        <Alert tone="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}

      <AnimatePresence>
        {showCritical && summary ? (
          <motion.div
            className="analytics-critical"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
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
          </motion.div>
        ) : null}
      </AnimatePresence>

      {loading && !data ? (
        <AnalyticsSkeleton />
      ) : data && summary ? (
        <>
          <div className="analytics-kpi-grid">
            {kpis.map((kpi, index) => {
              const clickable = Boolean(kpi.to)
              const Icon = kpi.icon
              return (
                <motion.button
                  key={kpi.label}
                  type="button"
                  className={`analytics-kpi tone-${kpi.tone}${kpi.warn ? ' is-warn' : ''}${clickable ? ' is-clickable' : ''}`}
                  disabled={!clickable}
                  {...fadeUp}
                  transition={{ duration: 0.35, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => {
                    if (!kpi.to) return
                    void navigate({
                      to: kpi.to,
                      ...(kpi.search ? { search: kpi.search as never } : {}),
                    })
                  }}
                >
                  <span className="analytics-kpi-icon" aria-hidden>
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <div className="analytics-kpi-body">
                    <span className="analytics-kpi-label">{kpi.label}</span>
                    <div className="analytics-kpi-value">{kpi.value.toLocaleString()}</div>
                    <div className="analytics-kpi-hint">{kpi.hint}</div>
                  </div>
                  <KpiSpark id={kpi.spark} color={TONE_HEX[kpi.tone]} series={sparkSeriesByKpi[kpi.spark]} />
                </motion.button>
              )
            })}
          </div>

          <div className="analytics-breakdown">
            <motion.section className="analytics-card" {...fadeUp} transition={{ duration: 0.4, delay: 0.12 }}>
              <div className="analytics-card-head">
                <div>
                  <h3>
                    <CardIcon icon={Warehouse} tone="mint" />
                    Warehouse volume
                  </h3>
                  <p className="analytics-card-desc">Order share by location</p>
                </div>
              </div>
              {(data.warehouseOrderRank || []).length ? (
                <div className="analytics-panel-scroll">
                  <div className="analytics-wh-list">
                    {data.warehouseOrderRank.map((w, i) => (
                      <div key={w.warehouseId} className="analytics-wh-row analytics-hover-lift">
                        <div className="analytics-wh-top">
                          <div className="analytics-wh-name">
                            <span className="analytics-dot" style={{ background: shadeAt(i + 2) }} />
                            <span className="truncate">{w.name}</span>
                          </div>
                          <span className="analytics-wh-count">{w.orderCount}</span>
                        </div>
                        <div className="analytics-wh-bar">
                          <span
                            style={{
                              width: `${Math.max(4, (w.orderCount / warehouseMax) * 100)}%`,
                              background: shadeAt(i + 2),
                            }}
                          />
                        </div>
                        <div className="analytics-wh-meta">
                          <span className="analytics-wh-code">{w.code || `RANK ${w.rank}`}</span>
                          <span>{Math.round((w.orderCount / warehouseMax) * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="analytics-empty">No warehouse volume yet.</p>
              )}
            </motion.section>

            <motion.section className="analytics-card" {...fadeUp} transition={{ duration: 0.4, delay: 0.16 }}>
              <div className="analytics-card-head">
                <div>
                  <h3>
                    <CardIcon icon={Truck} tone="sky" />
                    Carrier mix
                  </h3>
                  <p className="analytics-card-desc">Shipment carriers in range</p>
                </div>
              </div>
              {carrierPie.length ? (
                <div className="analytics-carrier analytics-carrier--stack">
                  <div className="analytics-donut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={carrierPie}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={52}
                          outerRadius={74}
                          paddingAngle={3}
                          stroke="transparent"
                          animationDuration={900}
                        >
                          {carrierPie.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CarrierTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="analytics-donut-center">
                      <strong>{carrierTotal.toLocaleString()}</strong>
                      <span>shipments</span>
                    </div>
                  </div>
                  <div className="analytics-panel-scroll analytics-panel-scroll--sm">
                    <div className="analytics-carrier-legend">
                      {carrierPie.map((c, i) => (
                        <div key={c.name} className="analytics-carrier-legend-row">
                          <strong>
                            <span
                              className="analytics-dot"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                            />
                            {c.name}
                          </strong>
                          <span>
                            {c.value} · {c.percent}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="analytics-empty">No carrier shipments yet.</p>
              )}
            </motion.section>

            <motion.section className="analytics-card analytics-returns-card" {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }}>
              <div className="analytics-card-head">
                <div>
                  <h3>
                    <CardIcon icon={ArrowLeftRight} tone="amber" />
                    Returns mix
                  </h3>
                  <p className="analytics-card-desc">Status share across open and closed RMAs</p>
                </div>
              </div>
              {returnsByStatus.display.length ? (
                <div className="analytics-returns-compact">
                  <div className="analytics-returns-hero">
                    <div>
                      <strong>{returnsByStatus.sum}</strong>
                      <span>RMAs</span>
                    </div>
                    <ReturnsStack rows={returnsByStatus.display} total={returnsByStatus.total} colorAt={returnAt} />
                  </div>
                  <ul className="analytics-returns-rank">
                    {returnsByStatus.display.map((row, i) => {
                      const pct = Math.round((row.value / returnsByStatus.total) * 100)
                      const color = returnAt(i)
                      return (
                        <li
                          key={row.key}
                          className="analytics-returns-rank-row"
                          title={row.key === '__other' ? returnsByStatus.otherLabels.join(', ') : undefined}
                        >
                          <span className="analytics-returns-rank-name">
                            <i style={{ background: color }} />
                            {row.name}
                          </span>
                          <span className="analytics-returns-rank-bar" aria-hidden>
                            <span style={{ width: `${Math.max(6, pct)}%`, background: color }} />
                          </span>
                          <span className="analytics-returns-rank-meta">
                            <strong>{row.value}</strong>
                            <em>{pct}%</em>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <p className="analytics-empty">No returns in this range.</p>
              )}
            </motion.section>
          </div>

          <div className="analytics-charts">
            <motion.section
              className="analytics-card analytics-orders-card"
              {...fadeUp}
              transition={{ duration: 0.4, delay: 0.24 }}
            >
              <div className="analytics-card-head">
                <div>
                  <h2>
                    <CardIcon icon={Activity} tone="sky" />
                    Orders over time
                  </h2>
                  <p className="analytics-card-desc">Daily volume across the selected window</p>
                </div>
                <div className="analytics-legend">
                  <span>
                    <i className="tone-ink" /> Daily volume
                  </span>
                </div>
              </div>
              {data.ordersByDay.some((d) => d.count > 0) ? (
                <div className="analytics-chart-box analytics-chart-box--tall">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.ordersByDay} margin={{ top: 16, right: 10, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0f172a" stopOpacity={0.14} />
                          <stop offset="55%" stopColor="#0f172a" stopOpacity={0.04} />
                          <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 10" stroke={chartTheme.grid} vertical={false} />
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
                        cursor={{ stroke: '#0f172a', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.35 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Orders"
                        stroke="#0f172a"
                        strokeWidth={2.5}
                        fill="url(#ordersFill)"
                        activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: '#2563eb' }}
                        dot={{ r: 3, strokeWidth: 0, fill: '#2563eb' }}
                        animationDuration={900}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="analytics-empty">No orders in this range.</p>
              )}
            </motion.section>

            <motion.section className="analytics-card analytics-ring-card" {...fadeUp} transition={{ duration: 0.4, delay: 0.28 }}>
              <div className="analytics-card-head">
                <div>
                  <h2>
                    <CardIcon icon={Filter} tone="mint" />
                    Fulfillment ring
                  </h2>
                  <p className="analytics-card-desc">Stages toward fulfilled</p>
                </div>
                <span className="analytics-anime-pill is-soft">Live</span>
              </div>
              {funnelRadial.some((d) => d.value > 0) ? (
                <div className="analytics-radial-wrap analytics-radial-wrap--stack">
                  <div className="analytics-radial-chart analytics-radial-chart--lg">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        data={funnelRadial}
                        innerRadius="28%"
                        outerRadius="98%"
                        startAngle={90}
                        endAngle={-270}
                        barSize={16}
                      >
                        <PolarAngleAxis type="number" domain={[0, funnelMax]} tick={false} />
                        <RadialBar
                          dataKey="value"
                          background={{ fill: 'rgba(37, 99, 235, 0.08)' }}
                          cornerRadius={10}
                          animationDuration={1000}
                        >
                          {funnelRadial.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </RadialBar>
                        <Tooltip
                          formatter={(value) => [`${value ?? 0}`, 'Orders']}
                          contentStyle={{
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
                          }}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="analytics-radial-center">
                      <strong>{funnelMax.toLocaleString()}</strong>
                      <span>peak stage</span>
                    </div>
                  </div>
                  <ul className="analytics-radial-chips">
                    {funnelRadial.map((row) => (
                      <li key={row.name} className="analytics-chip" style={{ ['--chip' as string]: row.fill }}>
                        <i style={{ background: row.fill }} />
                        <span>{row.name}</span>
                        <strong>{row.value.toLocaleString()}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="analytics-empty">No funnel data yet.</p>
              )}
            </motion.section>
          </div>

          <div className="analytics-mesh-row">
            <motion.section
              className="analytics-card analytics-throughput"
              {...fadeUp}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <div className="analytics-card-head">
                <div>
                  <h2>
                    <CardIcon icon={Warehouse} />
                    Warehouse throughput
                  </h2>
                  <p className="analytics-card-desc">Routed orders by warehouse</p>
                </div>
                <span className="analytics-anime-pill is-soft">
                  {data.warehouseOrderRank.length} {data.warehouseOrderRank.length === 1 ? 'site' : 'sites'}
                </span>
              </div>
              {data.warehouseOrderRank.length ? <div className="analytics-throughput-chart" role="group" aria-label="Routed orders by warehouse">
                <div className="analytics-throughput-grid" aria-hidden="true"><span /><span /><span /></div>
                <div className="analytics-throughput-bars" role="list">
                  {data.warehouseOrderRank.slice(0, 6).map((warehouse, index) => <div className="analytics-throughput-item" role="listitem" key={warehouse.warehouseId} title={`${warehouse.name}: ${warehouse.orderCount.toLocaleString()} routed orders`} aria-label={`${warehouse.name}: ${warehouse.orderCount.toLocaleString()} routed orders`}>
                    <span className="analytics-throughput-track"><span className="analytics-throughput-column" style={{ height: `${Math.max(warehouse.orderCount ? 8 : 0, warehouse.orderCount / warehouseMax * 100)}%`, ['--bar-color' as string]: index % 2 ? '#60a5fa' : '#2563eb' }}><strong>{warehouse.orderCount.toLocaleString()}</strong><span className="analytics-throughput-bar" /></span></span>
                    <small>{warehouse.name}</small>
                  </div>)}
                </div>
                {data.warehouseOrderRank.length > 6 ? <span className="analytics-throughput-note">Top 6 of {data.warehouseOrderRank.length} warehouses</span> : null}
              </div> : <p className="analytics-empty">No routed orders in this range.</p>}
            </motion.section>

            <motion.section
              className="analytics-card analytics-dispatch"
              {...fadeUp}
              transition={{ duration: 0.4, delay: 0.34 }}
            >
              <div className="analytics-card-head">
                <div>
                  <h2>
                    <CardIcon icon={History} />
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
                <div className="analytics-dispatch-scroll">
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
                              void navigate({
                                to: '/account/orders/$orderId',
                                params: { orderId: order.id },
                              })
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
                </div>
              ) : (
                <p className="analytics-empty">No recent dispatches yet.</p>
              )}
            </motion.section>
          </div>
        </>
      ) : null}
    </div>
  )
}
