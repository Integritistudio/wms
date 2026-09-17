import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FormField,
  ListToolbar,
  PageHeader,
  PageSection,
  StatusBadge,
  type DataTableColumn,
} from '../ui'
import {
  createRoutingRule,
  deleteInventoryItem,
  deleteRoutingRule,
  getRoutingConfig,
  getWarehouseInventory,
  listRoutingRules,
  reorderRoutingRules,
  saveRoutingConfig,
  saveWarehouseInventory,
  updateCompanyWarehouse,
  updateRoutingRule,
  type InventoryItem,
  type RoutingCondition,
  type RoutingConfig,
  type RoutingField,
  type RoutingOperator,
  type RoutingRule,
  type Warehouse,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'

export function RoutingRuleEditor({
  rule: initial,
  warehouses,
  fields,
  operators,
  onCancel,
  onSave,
}: {
  rule: RoutingRule
  warehouses: Array<{ id: string; name: string }>
  fields: RoutingField[]
  operators: RoutingOperator[]
  onCancel: () => void
  onSave: () => void
}) {
  const [rule, setRule] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const categories = [...new Set(fields.map((f) => f.category))]

  function addCondition() {
    setRule({ ...rule, conditions: [...rule.conditions, { field: 'line_item_count', operator: 'greater_than', value: '1' }] })
  }

  function updateCondition(idx: number, patch: Partial<RoutingCondition>) {
    const next = [...rule.conditions]
    next[idx] = { ...next[idx], ...patch }
    setRule({ ...rule, conditions: next })
  }

  function removeCondition(idx: number) {
    setRule({ ...rule, conditions: rule.conditions.filter((_, i) => i !== idx) })
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (!rule.warehouseId) {
        throw new Error('Pick a target warehouse')
      }
      const payload = {
        name: rule.name.trim() || 'Untitled rule',
        priority: rule.priority,
        enabled: rule.enabled,
        warehouseId: rule.warehouseId,
        conditionLogic: rule.conditionLogic,
        conditions: rule.conditions,
        requireAllItemsInStock: rule.requireAllItemsInStock,
      }
      if (rule._id) {
        await updateRoutingRule(rule._id, payload)
      } else {
        await createRoutingRule(payload)
      }
      onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="ui-stack">
      <div className="ui-form-grid">
        <FormField label="Rule Name" required>
          <input className="demo-input" value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} required />
        </FormField>
        <FormField label="Target Warehouse" required>
          <select
            className="demo-input"
            value={rule.warehouseId}
            onChange={(e) => setRule({ ...rule, warehouseId: e.target.value })}
            required
          >
            {!rule.warehouseId ? <option value="">Select warehouse…</option> : null}
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Priority (lower runs first)">
          <input
            className="demo-input"
            type="number"
            min={1}
            value={rule.priority}
            onChange={(e) => setRule({ ...rule, priority: Number(e.target.value) || 10 })}
          />
        </FormField>
        <FormField label="Match logic">
          <select className="demo-input" value={rule.conditionLogic} onChange={(e) => setRule({ ...rule, conditionLogic: e.target.value as 'and' | 'or' })}>
            <option value="and">ALL conditions (AND)</option>
            <option value="or">ANY condition (OR)</option>
          </select>
        </FormField>
      </div>

      <div className="ui-checkbox-grid">
        <label className="ui-checkbox-row">
          <input type="checkbox" checked={rule.enabled} onChange={(e) => setRule({ ...rule, enabled: e.target.checked })} />
          <span>Enabled</span>
        </label>
        <label className="ui-checkbox-row">
          <input type="checkbox" checked={rule.requireAllItemsInStock} onChange={(e) => setRule({ ...rule, requireAllItemsInStock: e.target.checked })} />
          <span>Require all items in stock</span>
        </label>
      </div>

      <div className="ui-stack-sm">
        <div className="ui-inline-actions justify-between">
          <span className="demo-label mb-0">Conditions</span>
          <Button variant="ghost" size="sm" onClick={addCondition}>+ Add Condition</Button>
        </div>
        {rule.conditions.length === 0 ? (
          <p className="demo-muted text-xs">No conditions — rule matches all orders.</p>
        ) : (
          <div className="ui-stack-sm">
            {rule.conditions.map((cond, idx) => (
              <div key={idx} className="routing-cond-row">
                <select className="demo-input" value={cond.field} onChange={(e) => updateCondition(idx, { field: e.target.value })}>
                  {categories.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {fields.filter((f) => f.category === cat).map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select className="demo-input" value={cond.operator} onChange={(e) => updateCondition(idx, { operator: e.target.value })}>
                  {operators.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
                </select>
                {!['is_true', 'is_false', 'all_items_in_stock', 'any_item_in_stock'].includes(cond.field) ? (
                  <input
                    className="demo-input"
                    placeholder="Value"
                    value={cond.value}
                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                  />
                ) : (
                  <span className="routing-cond-spacer" aria-hidden />
                )}
                <Button variant="ghost" size="sm" onClick={() => removeCondition(idx)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <Alert tone="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}
      <div className="ui-inline-actions">
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Rule'}</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

function WarehouseRoutingRow({
  warehouse,
  onSaved,
}: {
  warehouse: Warehouse
  onSaved: () => void
}) {
  const [priority, setPriority] = useState(String(warehouse.routingPriority ?? 100))
  const [threshold, setThreshold] = useState(String(warehouse.minStockThreshold ?? 0))
  const [zips, setZips] = useState((warehouse.zipPrefixes || []).join(', '))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      await updateCompanyWarehouse(warehouse.id, {
        routingPriority: Number(priority) || 100,
        minStockThreshold: Math.max(0, Number(threshold) || 0),
        zipPrefixes: zips,
        geocode: true,
      })
      setMsg('Saved')
      onSaved()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    }
    setSaving(false)
  }

  return (
    <tr className="routing-wh-row">
      <td className="demo-cell-primary routing-wh-name">{warehouse.name}</td>
      <td>
        <input
          className="demo-input routing-wh-num"
          type="number"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          aria-label={`${warehouse.name} priority`}
        />
      </td>
      <td>
        <input
          className="demo-input routing-wh-num"
          type="number"
          min={0}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          aria-label={`${warehouse.name} min stock`}
        />
      </td>
      <td>
        <input
          className="demo-input routing-wh-zips"
          placeholder="902, 10001, M5V"
          value={zips}
          onChange={(e) => setZips(e.target.value)}
          aria-label={`${warehouse.name} zip prefixes`}
        />
      </td>
      <td className="demo-cell-secondary text-xs routing-wh-geo">
        {warehouse.latitude != null && warehouse.longitude != null
          ? `${Number(warehouse.latitude).toFixed(3)}, ${Number(warehouse.longitude).toFixed(3)}`
          : warehouse.address || '—'}
      </td>
      <td className="routing-wh-actions">
        <button type="button" className="demo-btn demo-btn-sm" disabled={saving} onClick={() => void save()}>
          {saving ? '…' : 'Save'}
        </button>
        {msg ? <span className="demo-cell-secondary text-xs">{msg}</span> : null}
      </td>
    </tr>
  )
}

export default function RoutingPanel() {
  const { company, setError, setNotice, refresh } = useCompanyPortal()
  const warehouses = company?.warehouses || []

  const [config, setConfig] = useState<RoutingConfig>({
    enabled: false,
    autoAssignOnReceive: true,
    autoDeliverSftp: true,
    defaultWarehouseId: null,
    fallbackWarehouseId: null,
    partialPolicy: 'ship_available',
    addressMode: 'off',
  })
  const [rules, setRules] = useState<RoutingRule[]>([])
  const [fields, setFields] = useState<RoutingField[]>([])
  const [operators, setOperators] = useState<RoutingOperator[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null)
  const [ruleQ, setRuleQ] = useState('')
  const [inventoryWh, setInventoryWh] = useState('')
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [invQ, setInvQ] = useState('')
  const [invSku, setInvSku] = useState('')
  const [invQty, setInvQty] = useState('0')
  const [reordering, setReordering] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [cfg, ruleList] = await Promise.all([getRoutingConfig(), listRoutingRules()])
      setConfig({
        fallbackWarehouseId: null,
        addressMode: 'off',
        ...cfg.config,
      })
      setFields(cfg.fields)
      setOperators(cfg.operators)
      setRules(ruleList)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load routing')
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const filteredRules = useMemo(() => {
    const term = ruleQ.trim().toLowerCase()
    if (!term) return rules
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (warehouses.find((w) => w.id === r.warehouseId)?.name || '').toLowerCase().includes(term),
    )
  }, [rules, ruleQ, warehouses])

  const filteredInventory = useMemo(() => {
    const term = invQ.trim().toLowerCase()
    if (!term) return inventory
    return inventory.filter((item) => item.sku.toLowerCase().includes(term))
  }, [inventory, invQ])

  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((a, b) => (a.routingPriority ?? 100) - (b.routingPriority ?? 100)),
    [warehouses],
  )

  async function saveConfigForm(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    try {
      await saveRoutingConfig(config)
      setMsg('Routing config saved')
      setNotice('Routing config saved')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function moveRule(ruleId: string, direction: -1 | 1) {
    const idx = rules.findIndex((r) => r._id === ruleId)
    if (idx < 0) return
    const next = idx + direction
    if (next < 0 || next >= rules.length) return
    const ordered = [...rules]
    const [item] = ordered.splice(idx, 1)
    ordered.splice(next, 0, item)
    setReordering(true)
    try {
      const updated = await reorderRoutingRules(ordered.map((r) => r._id))
      setRules(updated)
      setNotice('Rule order updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reorder failed')
    }
    setReordering(false)
  }

  async function loadInventory(whId: string) {
    setInventoryWh(whId)
    setInvQ('')
    if (!whId) { setInventory([]); return }
    try {
      setInventory(await getWarehouseInventory(whId))
    } catch { setInventory([]) }
  }

  async function addInventory(e: FormEvent) {
    e.preventDefault()
    if (!inventoryWh || !invSku.trim()) return
    const amount = Number(invQty)
    if (!Number.isFinite(amount) || amount < 0) return
    await saveWarehouseInventory(inventoryWh, [{ sku: invSku.trim(), adjustBy: amount }])
    setInvSku('')
    setInvQty('1')
    await loadInventory(inventoryWh)
  }

  if (loading) {
    return (
      <div className="ui-stack">
        <PageHeader title="Order Routing" description="Auto-assign orders to warehouses based on rules" />
        <DataTable columns={[]} rows={[]} rowKey={() => ''} loading />
      </div>
    )
  }

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || id

  const ruleColumns: DataTableColumn<RoutingRule>[] = [
    {
      key: 'priority',
      header: 'Order',
      className: 'num',
      render: (rule) => (
        <div className="demo-action-group justify-end">
          <button
            type="button"
            className="demo-btn demo-btn-sm"
            disabled={reordering || ruleQ.trim().length > 0}
            title="Move up (higher priority)"
            onClick={() => void moveRule(rule._id, -1)}
          >
            ↑
          </button>
          <span className="tabular-nums w-8 text-center">{rule.priority}</span>
          <button
            type="button"
            className="demo-btn demo-btn-sm"
            disabled={reordering || ruleQ.trim().length > 0}
            title="Move down"
            onClick={() => void moveRule(rule._id, 1)}
          >
            ↓
          </button>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Rule',
      render: (rule) => (
        <div>
          <div className="demo-cell-primary">{rule.name}</div>
          <div className="demo-cell-secondary">{rule.conditions.length} condition(s) · {rule.conditionLogic.toUpperCase()}{rule.requireAllItemsInStock ? ' · stock required' : ''}</div>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      render: (rule) => whName(rule.warehouseId),
    },
    {
      key: 'enabled',
      header: 'Status',
      render: (rule) => <StatusBadge status={rule.enabled ? 'active' : 'skipped'} label={rule.enabled ? 'Active' : 'Disabled'} variant={rule.enabled ? 'success' : 'neutral'} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (rule) => (
        <div className="demo-action-group">
          <button className="demo-btn demo-btn-sm" type="button" onClick={() => setEditingRule(rule)}>Edit</button>
          <button className="demo-btn demo-btn-sm demo-btn-danger" type="button" onClick={async () => { await deleteRoutingRule(rule._id); await load() }}>Delete</button>
        </div>
      ),
    },
  ]

  return (
    <div className="routing-page ui-stack">
      <PageHeader
        title="Order Routing"
        description="Rules first, then address / warehouse priority, then fallback. Stock below a warehouse threshold spills to the next location."
        count={rules.length}
      />

      <PageSection title="Settings" description="Control when orders are routed, assigned, and sent to the warehouse.">
        <form onSubmit={saveConfigForm} className="routing-settings ui-stack">
          <div className="routing-settings-toggles ui-stack-sm">
            <label className="ui-checkbox-row">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              />
              <span>
                <strong>Enable automatic order routing</strong>
                <span className="demo-muted block text-xs mt-0.5">
                  On: evaluate rules → address ranking → default → fallback. Off: leave warehouse blank until someone assigns it manually.
                </span>
              </span>
            </label>
            <label className="ui-checkbox-row">
              <input
                type="checkbox"
                checked={config.autoAssignOnReceive}
                disabled={!config.enabled}
                onChange={(e) => setConfig({ ...config, autoAssignOnReceive: e.target.checked })}
              />
              <span>
                <strong>Auto-assign warehouse when order is received</strong>
                <span className="demo-muted block text-xs mt-0.5">
                  On: commit the chosen warehouse and continue (940 / SFTP). Off: only suggest the best warehouse — user must Accept or pick another.
                </span>
              </span>
            </label>
            <label className="ui-checkbox-row">
              <input
                type="checkbox"
                checked={config.autoDeliverSftp}
                onChange={(e) => setConfig({ ...config, autoDeliverSftp: e.target.checked })}
              />
              <span>
                <strong>Auto-deliver 940 via SFTP after routing</strong>
                <span className="demo-muted block text-xs mt-0.5">
                  Only after a warehouse is committed (auto-assign or Accept). Never on suggestion-only orders.
                </span>
              </span>
            </label>
          </div>

          <div className="ui-form-grid routing-settings-fields">
            <FormField
              label="Default warehouse"
              hint="Home warehouse when routing is on and no rule/address match. Not used when routing is off."
            >
              <select className="demo-input" value={config.defaultWarehouseId || ''} onChange={(e) => setConfig({ ...config, defaultWarehouseId: e.target.value || null })}>
                <option value="">None</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </FormField>
            <FormField
              label="Fallback warehouse"
              hint="Last resort when nothing matches. If unset and nothing matches → order goes to Error + notification."
            >
              <select className="demo-input" value={config.fallbackWarehouseId || ''} onChange={(e) => setConfig({ ...config, fallbackWarehouseId: e.target.value || null })}>
                <option value="">None</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </FormField>
            <FormField label="Address-based ranking" hint="When no rule matches (and for inventory spill order): ZIP prefixes or Mapbox nearest warehouse.">
              <select
                className="demo-input"
                value={config.addressMode || 'off'}
                onChange={(e) => setConfig({ ...config, addressMode: e.target.value as RoutingConfig['addressMode'] })}
              >
                <option value="off">Off — warehouse priority only</option>
                <option value="zip_prefix">ZIP / postal prefixes</option>
                <option value="mapbox_distance">Nearest warehouse (Mapbox)</option>
              </select>
            </FormField>
            <FormField label="Partial inventory policy" hint="What to do when stock is incomplete across warehouses.">
              <select
                className="demo-input"
                value={config.partialPolicy || 'ship_available'}
                onChange={(e) => setConfig({ ...config, partialPolicy: e.target.value as RoutingConfig['partialPolicy'] })}
              >
                <option value="ship_available">Ship available (split / partial OK)</option>
                <option value="hold_all">Hold entire order until complete</option>
                <option value="allow_customer_partial">Allow customer partial shipments</option>
              </select>
            </FormField>
          </div>

          <div className="ui-inline-actions">
            <Button type="submit">Save Config</Button>
            {msg ? <span className="demo-cell-secondary">{msg}</span> : null}
          </div>
        </form>
      </PageSection>

      <PageSection
        title="Warehouse priorities & thresholds"
        description="Lower priority number wins when ranking. Min stock: if available qty is at or below this, that SKU is skipped here and other warehouses are tried. ZIP prefixes used when address mode is ZIP."
      >
        {sortedWarehouses.length === 0 ? (
          <p className="demo-muted text-sm">Add warehouses first.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="demo-table routing-wh-table w-full text-sm">
              <thead>
                <tr>
                  <th>Warehouse</th>
                  <th>Priority</th>
                  <th>Min stock</th>
                  <th>ZIP prefixes</th>
                  <th>Geo / address</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedWarehouses.map((w) => (
                  <WarehouseRoutingRow key={w.id} warehouse={w} onSaved={() => void refresh()} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      <PageSection
        title="Rules"
        description="Rules are evaluated top-to-bottom (↑ / ↓ to change priority). First match wins. Clear search before reordering."
        actions={(
          <Button
            variant="secondary"
            onClick={() => setEditingRule({
              _id: '', companyId: '', name: 'New Rule', priority: (rules.length + 1) * 10, enabled: true,
              warehouseId: warehouses[0]?.id || '', conditionLogic: 'and', conditions: [], requireAllItemsInStock: false,
            })}
          >
            Add Rule
          </Button>
        )}
      >
        <ListToolbar
          search={ruleQ}
          searchPlaceholder="Search rules…"
          onSearchChange={setRuleQ}
          resultCount={filteredRules.length}
          resultLabel="rules"
          onClear={() => setRuleQ('')}
        />
        <DataTable columns={ruleColumns} rows={filteredRules} rowKey={(rule) => rule._id} emptyTitle="No rules yet" emptyMessage="Add a rule to start routing orders automatically." />
      </PageSection>

      <Drawer
        open={Boolean(editingRule)}
        wide
        title={editingRule?._id ? 'Edit Rule' : 'New Rule'}
        subtitle="Match conditions and send qualifying orders to a warehouse."
        onClose={() => setEditingRule(null)}
      >
        {editingRule ? (
          <RoutingRuleEditor
            rule={editingRule}
            warehouses={warehouses}
            fields={fields}
            operators={operators}
            onCancel={() => setEditingRule(null)}
            onSave={async () => { setEditingRule(null); await load() }}
          />
        ) : null}
      </Drawer>

      <PageSection title="Inventory" description="Add product SKUs and quantities. Stock decreases automatically when orders ship. You can also manage this under Warehouses → Manage products.">
        <div className="ui-stack">
          <div className="routing-inventory-toolbar">
            <FormField label="Warehouse" className="routing-inventory-wh">
              <select className="demo-input" value={inventoryWh} onChange={(e) => loadInventory(e.target.value)}>
                <option value="">Select warehouse...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </FormField>
            {inventoryWh ? (
              <form onSubmit={addInventory} className="routing-inventory-add">
                <FormField label="SKU">
                  <input
                    className="demo-input"
                    placeholder="SKU"
                    value={invSku}
                    onChange={(e) => setInvSku(e.target.value)}
                    aria-label="SKU"
                  />
                </FormField>
                <FormField label="Qty">
                  <input
                    className="demo-input"
                    type="number"
                    min={0}
                    placeholder="Qty"
                    value={invQty}
                    onChange={(e) => setInvQty(e.target.value)}
                    aria-label="Quantity to add"
                  />
                </FormField>
                <div className="routing-inventory-add-action">
                  <Button type="submit" size="sm">
                    Add stock
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
          {inventoryWh ? (
            <>
              <ListToolbar
                search={invQ}
                searchPlaceholder="Search SKUs…"
                onSearchChange={setInvQ}
                resultCount={filteredInventory.length}
                resultLabel="SKUs"
                onClear={() => setInvQ('')}
              />
              <DataTable
                columns={[
                  { key: 'sku', header: 'SKU', render: (item) => item.sku },
                  { key: 'onHand', header: 'On Hand', align: 'right', className: 'num', render: (item) => item.quantityOnHand ?? 0 },
                  { key: 'available', header: 'Available', align: 'right', className: 'num', render: (item) => item.quantityAvailable ?? 0 },
                  { key: 'reserved', header: 'Reserved', align: 'right', className: 'num', render: (item) => item.reserved ?? 0 },
                  {
                    key: 'actions',
                    header: 'Actions',
                    align: 'right',
                    render: (item) => (
                      <button
                        className="demo-btn demo-btn-sm demo-btn-danger"
                        type="button"
                        onClick={async () => {
                          const skuKey = String(item.sku || '').trim()
                          if (!skuKey || !inventoryWh) return
                          const previous = inventory
                          setInventory((prev) => prev.filter((row) => row.sku !== skuKey))
                          try {
                            await deleteInventoryItem(inventoryWh, skuKey)
                            setNotice(`Removed ${skuKey}`)
                            await loadInventory(inventoryWh)
                          } catch (err) {
                            setInventory(previous)
                            setError(err instanceof Error ? err.message : 'Unable to remove')
                          }
                        }}
                      >
                        Remove
                      </button>
                    ),
                  },
                ]}
                rows={filteredInventory}
                rowKey={(item) => item.sku}
                emptyTitle="No inventory records"
              />
            </>
          ) : null}
        </div>
      </PageSection>
    </div>
  )
}
