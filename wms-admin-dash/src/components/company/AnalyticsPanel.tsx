import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState, FormField, PageHeader, PageSection } from '../ui'
import { getCompanyAnalytics, type CompanyAnalytics } from '../../lib/api'

const WarehouseMap = lazy(() => import('./WarehouseMap'))

const RANGE_OPTIONS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
]

const PIE_COLORS = ['#ea580c', '#0f766e', '#2563eb', '#7c3aed', '#b45309', '#dc2626', '#0891b2', '#4b5563']

function labelize(key: string) {
  return String(key || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function StatCard({
  label,
  value,
  hint,
  warn,
}: {
  label: string
  value: number | string
  hint?: string
  warn?: boolean
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: warn ? '#fdba74' : 'var(--border, #e5e7eb)',
        background: warn ? '#fff7ed' : 'var(--card, #fff)',
      }}
    >
      <div className="text-xs uppercase tracking-wide text-[var(--muted,#6b7280)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: warn ? '#c2410c' : 'inherit' }}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-[var(--muted,#6b7280)]">{hint}</div> : null}
    </div>
  )
}

function ChartCard({
  title,
  description,
  children,
  empty,
}: {
  title: string
  description?: string
  children: ReactNode
  empty?: boolean
}) {
  return (
    <PageSection title={title} description={description}>
      {empty ? (
        <EmptyState title="No data in this range" message="Try a wider date range or wait for more order activity." />
      ) : (
        <div className="h-72 w-full min-w-0">{children}</div>
      )}
    </PageSection>
  )
}

export default function AnalyticsPanel() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<CompanyAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await getCompanyAnalytics({ days })
      setData(payload)
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

  const ordersByStatus = useMemo(
    () => (data?.ordersByStatus || []).map((r) => ({ name: labelize(r.key), value: r.count })),
    [data],
  )
  const shipmentsByStatus = useMemo(
    () => (data?.shipmentsByStatus || []).map((r) => ({ name: labelize(r.key), value: r.count })),
    [data],
  )
  const returnsByStatus = useMemo(
    () => (data?.returnsByStatus || []).map((r) => ({ name: labelize(r.key), value: r.count })),
    [data],
  )
  const warehouseOrders = useMemo(
    () =>
      (data?.warehouseOrderRank || []).map((r) => ({
        name: r.code || r.name,
        fullName: r.name,
        orders: r.orderCount,
        rank: r.rank,
      })),
    [data],
  )
  const warehouseReturns = useMemo(
    () =>
      (data?.warehouseReturnRank || []).map((r) => ({
        name: r.code || r.name,
        fullName: r.name,
        returns: r.returnCount,
        rank: r.rank,
      })),
    [data],
  )
  const topWarehouse = data?.warehouseOrderRank?.[0]
  const topReturnWarehouse = data?.warehouseReturnRank?.[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Orders, transit, warehouse rankings, returns, and fulfillment health."
        count={data?.summary.totalOrders}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Range">
              <select
                className="demo-input"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {RANGE_OPTIONS.map((opt) => (
                  <option key={opt.days} value={opt.days}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormField>
            <button className="demo-button demo-button-secondary" type="button" onClick={() => void load()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        }
      />

      {error ? <p className="demo-alert-danger demo-alert">{error}</p> : null}

      {loading && !data ? (
        <p className="demo-muted">Loading analytics…</p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
            <StatCard label="Total orders" value={data.summary.totalOrders} hint={`${data.range.days} day window`} />
            <StatCard label="In transit" value={data.summary.inTransit} hint="Labeled / in transit / out for delivery" />
            <StatCard label="Fulfilled" value={data.summary.fulfilled} hint={`${data.summary.partiallyFulfilled} partial`} />
            <StatCard label="Open returns" value={data.summary.openReturns} hint={`${data.summary.totalReturns} total RMAs`} warn={data.summary.openReturns > 0} />
            <StatCard label="On hold" value={data.summary.onHold} warn={data.summary.onHold > 0} />
            <StatCard label="Errors" value={data.summary.errors} warn={data.summary.errors > 0} />
            <StatCard label="Unassigned" value={data.summary.unassigned} hint="No warehouse yet" warn={data.summary.unassigned > 0} />
            <StatCard label="Failed DLQ" value={data.summary.failedDlq} warn={data.summary.failedDlq > 0} />
          </div>

          {(topWarehouse || topReturnWarehouse) && (
            <div className="grid gap-3 md:grid-cols-2">
              {topWarehouse ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-orange-800">Top warehouse by orders</div>
                  <div className="mt-1 text-lg font-semibold text-orange-950">
                    #{topWarehouse.rank} {topWarehouse.name}
                    {topWarehouse.code ? ` (${topWarehouse.code})` : ''}
                  </div>
                  <div className="mt-1 text-sm text-orange-900">{topWarehouse.orderCount} orders in range</div>
                </div>
              ) : null}
              {topReturnWarehouse ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Most returns</div>
                  <div className="mt-1 text-lg font-semibold text-amber-950">
                    #{topReturnWarehouse.rank} {topReturnWarehouse.name}
                    {topReturnWarehouse.code ? ` (${topReturnWarehouse.code})` : ''}
                  </div>
                  <div className="mt-1 text-sm text-amber-900">{topReturnWarehouse.returnCount} returns in range</div>
                </div>
              ) : null}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Orders over time" description="Daily order volume" empty={!data.ordersByDay.some((d) => d.count > 0)}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.ordersByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" name="Orders" stroke="#ea580c" fill="#fdba74" fillOpacity={0.45} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Fulfillment funnel" description="How orders progress toward fulfilled" empty={!data.fulfillmentFunnel.some((d) => d.count > 0)}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.fulfillmentFunnel} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="stage" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Orders" fill="#0f766e" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Orders by status" description="Circular breakdown of order states" empty={!ordersByStatus.length}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ordersByStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {ordersByStatus.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Shipments by status" description="In transit vs delivered vs failed" empty={!shipmentsByStatus.length}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={shipmentsByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95}>
                    {shipmentsByStatus.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Warehouse ranking — orders" description="Which warehouses handle the most orders" empty={!warehouseOrders.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={warehouseOrders} margin={{ bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [value as number, 'Orders']} labelFormatter={(_, payload) => (payload?.[0]?.payload?.fullName as string) || ''} />
                  <Bar dataKey="orders" name="Orders" fill="#ea580c" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Warehouse ranking — returns" description="Which warehouses have the most returns" empty={!warehouseReturns.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={warehouseReturns} margin={{ bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [value as number, 'Returns']} labelFormatter={(_, payload) => (payload?.[0]?.payload?.fullName as string) || ''} />
                  <Bar dataKey="returns" name="Returns" fill="#b45309" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Returns by status" description="RMA pipeline mix" empty={!returnsByStatus.length}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={returnsByStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                    {returnsByStatus.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[(i + 1) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top carriers" description="Shipment carrier mix" empty={!data.topCarriers.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topCarriers.map((c) => ({ name: c.key, count: c.count }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Shipments" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="SFTP delivery health" description="940 push outcomes in range" empty={!data.sftpByStatus.length}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.sftpByStatus.map((s) => ({ name: labelize(s.key), value: s.count }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                  >
                    {data.sftpByStatus.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Channel mix" description="Order channel breakdown" empty={!data.channelMix.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.channelMix.map((c) => ({ name: labelize(c.key), count: c.count }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Orders" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Ship-to countries" description="Top destination countries from shipping addresses" empty={!data.destinations.countries.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.destinations.countries.map((c) => ({ name: labelize(c.key), count: c.count }))}
                  layout="vertical"
                  margin={{ left: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Orders" fill="#0891b2" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Ship-to regions" description="Top provinces / states / cities" empty={!data.destinations.regions.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.destinations.regions.map((c) => ({ name: labelize(c.key), count: c.count }))}
                  layout="vertical"
                  margin={{ left: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Orders" fill="#4b5563" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <PageSection
            title="Warehouse map"
            description="Marker size scales with order volume. Amber markers indicate higher return share."
          >
            <Suspense
              fallback={
                <div className="flex h-[360px] items-center justify-center rounded-lg border text-sm text-[var(--muted,#6b7280)]">
                  Loading map…
                </div>
              }
            >
              <WarehouseMap points={data.map.warehouses} />
            </Suspense>
            {(data.warehouseOrderRank.length > 0 || data.warehouseReturnRank.length > 0) && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Order volume ranking</h4>
                  <ol className="space-y-1 text-sm">
                    {data.warehouseOrderRank.slice(0, 8).map((w) => (
                      <li key={w.warehouseId} className="flex justify-between gap-3 border-b border-[var(--border,#e5e7eb)] py-1.5">
                        <span>
                          <span className="mr-2 tabular-nums text-[var(--muted,#6b7280)]">#{w.rank}</span>
                          {w.name}
                        </span>
                        <span className="font-medium tabular-nums">{w.orderCount}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Returns ranking</h4>
                  <ol className="space-y-1 text-sm">
                    {data.warehouseReturnRank.slice(0, 8).map((w) => (
                      <li key={w.warehouseId} className="flex justify-between gap-3 border-b border-[var(--border,#e5e7eb)] py-1.5">
                        <span>
                          <span className="mr-2 tabular-nums text-[var(--muted,#6b7280)]">#{w.rank}</span>
                          {w.name}
                        </span>
                        <span className="font-medium tabular-nums">{w.returnCount}</span>
                      </li>
                    ))}
                    {!data.warehouseReturnRank.length ? (
                      <li className="text-[var(--muted,#6b7280)]">No returns in this range.</li>
                    ) : null}
                  </ol>
                </div>
              </div>
            )}
          </PageSection>
        </>
      ) : null}
    </div>
  )
}
