import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { GitBranch, Package, Plus, RefreshCw, Settings2, Warehouse as WarehouseIcon } from 'lucide-react'
import {
  Button,
  DataTable,
  FormField,
  ListToolbar,
  Modal,
  PageHeader,
  StatusBadge,
  StatusTabs,
  type DataTableColumn,
} from '../ui'
import {
  createRoutingRule,
  deleteRoutingRule,
  getRoutingConfig,
  getWarehouseInventory,
  listRoutingRules,
  reorderRoutingRules,
  saveRoutingConfig,
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

type RoutingTab = 'settings' | 'rules' | 'warehouses' | 'inventory'

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
    setRule({
      ...rule,
      conditions: [...rule.conditions, { field: 'line_item_count', operator: 'greater_than', value: '1' }],
    })
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
      if (!rule.warehouseId) throw new Error('Pick a target warehouse')
      const payload = {
        name: rule.name.trim() || 'Untitled rule',
        priority: rule.priority,
        enabled: rule.enabled,
        warehouseId: rule.warehouseId,
        conditionLogic: rule.conditionLogic,
        conditions: rule.conditions,
        requireAllItemsInStock: rule.requireAllItemsInStock,
      }
      if (rule._id) await updateRoutingRule(rule._id, payload)
      else await createRoutingRule(payload)
      onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="users-dialog-body routing-rule-form">
      <header className="users-dialog-hero">
        <div className={`users-dialog-hero-icon${rule._id ? ' is-edit' : ''}`} aria-hidden>
          <GitBranch size={22} />
        </div>
        <div>
          <h2>{rule._id ? 'Edit rule' : 'New rule'}</h2>
          <p>Match conditions and send qualifying orders to a warehouse.</p>
        </div>
      </header>

      <div className="users-dialog-grid">
        <FormField label="Rule name" required>
          <input
            className="demo-input"
            value={rule.name}
            onChange={(e) => setRule({ ...rule, name: e.target.value })}
            required
          />
        </FormField>
        <FormField label="Target warehouse" required>
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
        <FormField label="Priority" hint="Lower runs first">
          <input
            className="demo-input"
            type="number"
            min={1}
            value={rule.priority}
            onChange={(e) => setRule({ ...rule, priority: Number(e.target.value) || 10 })}
          />
        </FormField>
        <FormField label="Match logic">
          <select
            className="demo-input"
            value={rule.conditionLogic}
            onChange={(e) => setRule({ ...rule, conditionLogic: e.target.value as 'and' | 'or' })}
          >
            <option value="and">ALL conditions (AND)</option>
            <option value="or">ANY condition (OR)</option>
          </select>
        </FormField>
      </div>

      <div className="routing-toggle-grid">
        <label className={`routing-toggle${rule.enabled ? ' is-on' : ''}`}>
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
          />
          <span>
            <strong>Enabled</strong>
            <span>Include this rule in evaluation</span>
          </span>
        </label>
        <label className={`routing-toggle${rule.requireAllItemsInStock ? ' is-on' : ''}`}>
          <input
            type="checkbox"
            checked={rule.requireAllItemsInStock}
            onChange={(e) => setRule({ ...rule, requireAllItemsInStock: e.target.checked })}
          />
          <span>
            <strong>Require stock</strong>
            <span>All items must be available at the target warehouse</span>
          </span>
        </label>
      </div>

      <div className="routing-conditions">
        <div className="routing-conditions-head">
          <div>
            <strong>Conditions</strong>
            <span>
              {rule.conditions.length
                ? `${rule.conditions.length} condition(s)`
                : 'No conditions — matches all orders'}
            </span>
          </div>
          <button type="button" className="demo-btn demo-btn-sm" onClick={addCondition}>
            + Add condition
          </button>
        </div>
        {rule.conditions.length ? (
          <div className="routing-cond-list">
            {rule.conditions.map((cond, idx) => (
              <div key={idx} className="routing-cond-row">
                <select
                  className="demo-input"
                  value={cond.field}
                  onChange={(e) => updateCondition(idx, { field: e.target.value })}
                >
                  {categories.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {fields
                        .filter((f) => f.category === cat)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  className="demo-input"
                  value={cond.operator}
                  onChange={(e) => updateCondition(idx, { operator: e.target.value })}
                >
                  {operators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.label}
                    </option>
                  ))}
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
                <button type="button" className="demo-btn demo-btn-sm demo-btn-ghost" onClick={() => removeCondition(idx)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert tone="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}

      <footer className="users-dialog-footer">
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save rule'}
        </Button>
      </footer>
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
      <td>
        <div className="routing-wh-name-cell">
          <span className="routing-wh-icon" aria-hidden>
            <WarehouseIcon size={15} />
          </span>
          <span className="demo-cell-primary">{warehouse.name}</span>
        </div>
      </td>
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
      <td className="demo-cell-secondary routing-wh-geo">
        {warehouse.latitude != null && warehouse.longitude != null
          ? `${Number(warehouse.latitude).toFixed(3)}, ${Number(warehouse.longitude).toFixed(3)}`
          : warehouse.address || '—'}
      </td>
      <td className="routing-wh-actions">
        <button type="button" className="routing-action-btn" disabled={saving} onClick={() => void save()}>
          {saving ? '…' : 'Save'}
        </button>
        {msg ? <span className="routing-wh-msg">{msg}</span> : null}
      </td>
    </tr>
  )
}

export default function RoutingPanel() {
  const { company, setError, setNotice, refresh } = useCompanyPortal()
  const warehouses = company?.warehouses || []

  const [tab, setTab] = useState<RoutingTab>('settings')
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
  const [savingConfig, setSavingConfig] = useState(false)
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null)
  const [deletingRule, setDeletingRule] = useState<RoutingRule | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [ruleQ, setRuleQ] = useState('')
  const [ruleFilter, setRuleFilter] = useState<'all' | 'active' | 'off'>('all')
  const [inventoryWh, setInventoryWh] = useState('')
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [invQ, setInvQ] = useState('')
  const [invLoading, setInvLoading] = useState(false)
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

  useEffect(() => {
    void load()
  }, [])

  const counts = useMemo(() => {
    const active = rules.filter((r) => r.enabled).length
    return {
      rules: rules.length,
      active,
      off: rules.length - active,
      warehouses: warehouses.length,
    }
  }, [rules, warehouses])

  const filteredRules = useMemo(() => {
    const term = ruleQ.trim().toLowerCase()
    return rules.filter((r) => {
      if (ruleFilter === 'active' && !r.enabled) return false
      if (ruleFilter === 'off' && r.enabled) return false
      if (!term) return true
      return (
        r.name.toLowerCase().includes(term) ||
        (warehouses.find((w) => w.id === r.warehouseId)?.name || '').toLowerCase().includes(term)
      )
    })
  }, [rules, ruleQ, warehouses, ruleFilter])

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
    setSavingConfig(true)
    try {
      await saveRoutingConfig(config)
      setMsg('Routing config saved')
      setNotice('Routing config saved')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    }
    setSavingConfig(false)
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
    if (!whId) {
      setInventory([])
      return
    }
    setInvLoading(true)
    try {
      setInventory(await getWarehouseInventory(whId))
    } catch {
      setInventory([])
    } finally {
      setInvLoading(false)
    }
  }

  const inventoryStats = useMemo(() => {
    let onHand = 0
    let available = 0
    let reserved = 0
    for (const item of inventory) {
      onHand += item.quantityOnHand ?? 0
      available += item.quantityAvailable ?? 0
      reserved += item.reserved ?? 0
    }
    return { skus: inventory.length, onHand, available, reserved }
  }, [inventory])

  async function confirmDeleteRule() {
    if (!deletingRule || deleteBusy) return
    setDeleteBusy(true)
    try {
      await deleteRoutingRule(deletingRule._id)
      setDeletingRule(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete rule')
    } finally {
      setDeleteBusy(false)
    }
  }

  function openNewRule() {
    setEditingRule({
      _id: '',
      companyId: '',
      name: 'New Rule',
      priority: (rules.length + 1) * 10,
      enabled: true,
      warehouseId: warehouses[0]?.id || '',
      conditionLogic: 'and',
      conditions: [],
      requireAllItemsInStock: false,
    })
  }

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || id

  const ruleColumns: DataTableColumn<RoutingRule>[] = [
    {
      key: 'priority',
      header: 'Order',
      className: 'routing-col-order',
      render: (rule) => (
        <div className="routing-order-cell">
          <button
            type="button"
            className="routing-order-btn"
            disabled={reordering || ruleQ.trim().length > 0 || ruleFilter !== 'all'}
            title="Move up"
            onClick={() => void moveRule(rule._id, -1)}
          >
            ↑
          </button>
          <span>{rule.priority}</span>
          <button
            type="button"
            className="routing-order-btn"
            disabled={reordering || ruleQ.trim().length > 0 || ruleFilter !== 'all'}
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
        <div className="routing-rule-cell">
          <div className="demo-cell-primary">{rule.name}</div>
          <div className="demo-cell-secondary">
            {rule.conditions.length} condition(s) · {rule.conditionLogic.toUpperCase()}
            {rule.requireAllItemsInStock ? ' · stock required' : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      render: (rule) => <span className="routing-wh-chip">{whName(rule.warehouseId)}</span>,
    },
    {
      key: 'enabled',
      header: 'Status',
      render: (rule) => (
        <StatusBadge
          status={rule.enabled ? 'active' : 'skipped'}
          label={rule.enabled ? 'Active' : 'Off'}
          variant={rule.enabled ? 'success' : 'neutral'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (rule) => (
        <div className="routing-actions">
          <button type="button" className="routing-action-btn" onClick={() => setEditingRule(rule)}>
            Edit
          </button>
          <button
            type="button"
            className="routing-action-btn is-danger"
            onClick={() => setDeletingRule(rule)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="oj-page oj-skel routing-page">
      <PageHeader
        title="Order Routing"
        description="Rules first, then address / warehouse priority, then fallback. Stock below a threshold spills to the next location."
        count={counts.rules}
        actions={
          <button type="button" className="demo-btn demo-btn-sm routing-add-cta" onClick={openNewRule}>
            <Plus size={14} aria-hidden />
            Add rule
          </button>
        }
      />

      <div className="routing-stats" aria-label="Routing summary">
        <div className={`routing-stat${config.enabled ? ' is-ok' : ''}`}>
          <span className="routing-stat-label">Routing</span>
          <strong className="routing-stat-value">{config.enabled ? 'On' : 'Off'}</strong>
        </div>
        <div className="routing-stat">
          <span className="routing-stat-label">Rules</span>
          <strong className="routing-stat-value">{counts.rules}</strong>
        </div>
        <div className={`routing-stat${counts.active > 0 ? ' is-ok' : ''}`}>
          <span className="routing-stat-label">Active</span>
          <strong className="routing-stat-value">{counts.active}</strong>
        </div>
        <div className="routing-stat">
          <span className="routing-stat-label">Warehouses</span>
          <strong className="routing-stat-value">{counts.warehouses}</strong>
        </div>
      </div>

      <div className="routing-status-tabs">
        <StatusTabs
          activeId={tab}
          onChange={(id) => setTab(id as RoutingTab)}
          tabs={[
            { id: 'settings', label: 'Settings' },
            { id: 'rules', label: 'Rules', count: counts.rules || undefined },
            { id: 'warehouses', label: 'Warehouses', count: counts.warehouses || undefined },
            { id: 'inventory', label: 'Inventory' },
          ]}
        />
        <button
          type="button"
          className="orders-refresh-btn"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh routing"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

      {tab === 'settings' ? (
        <section className="routing-panel">
          <div className="routing-panel-head">
            <div>
              <div className="routing-kicker">
                <Settings2 size={14} aria-hidden />
                Config
              </div>
              <h2>Routing settings</h2>
              <p>Control when orders are routed, assigned, and sent to the warehouse.</p>
            </div>
          </div>

          <form onSubmit={saveConfigForm} className="routing-settings">
            <div className="routing-settings-block">
              <div className="routing-settings-block-head">
                <strong>Behavior</strong>
                <span>Master switches for routing, assignment, and 940 delivery.</span>
              </div>
              <div className="routing-toggle-grid is-stack">
                <label className={`routing-toggle${config.enabled ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  />
                  <span>
                    <strong>Enable automatic order routing</strong>
                    <span>
                      On: evaluate rules → address ranking → default → fallback. Off: leave warehouse blank until someone assigns it.
                    </span>
                  </span>
                </label>
                <label
                  className={`routing-toggle${config.autoAssignOnReceive ? ' is-on' : ''}${!config.enabled ? ' is-disabled' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={config.autoAssignOnReceive}
                    disabled={!config.enabled}
                    onChange={(e) => setConfig({ ...config, autoAssignOnReceive: e.target.checked })}
                  />
                  <span>
                    <strong>Auto-assign warehouse when order is received</strong>
                    <span>
                      On: commit the warehouse and continue. Off: only suggest — user must Accept or pick another.
                    </span>
                  </span>
                </label>
                <label className={`routing-toggle${config.autoDeliverSftp ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={config.autoDeliverSftp}
                    onChange={(e) => setConfig({ ...config, autoDeliverSftp: e.target.checked })}
                  />
                  <span>
                    <strong>Auto-deliver 940 via SFTP after routing</strong>
                    <span>Only after a warehouse is committed. Never on suggestion-only orders.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="routing-settings-block">
              <div className="routing-settings-block-head">
                <strong>Warehouses & ranking</strong>
                <span>Defaults, fallback, and how address matching picks a location.</span>
              </div>
              <div className="routing-settings-fields">
                <label className="routing-field-card">
                  <span className="routing-field-label">Default warehouse</span>
                  <select
                    className="demo-input"
                    value={config.defaultWarehouseId || ''}
                    onChange={(e) => setConfig({ ...config, defaultWarehouseId: e.target.value || null })}
                  >
                    <option value="">None</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <span className="routing-field-hint">Used when routing is on and no rule/address match.</span>
                </label>
                <label className="routing-field-card">
                  <span className="routing-field-label">Fallback warehouse</span>
                  <select
                    className="demo-input"
                    value={config.fallbackWarehouseId || ''}
                    onChange={(e) => setConfig({ ...config, fallbackWarehouseId: e.target.value || null })}
                  >
                    <option value="">None</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <span className="routing-field-hint">Last resort when nothing matches.</span>
                </label>
                <label className="routing-field-card">
                  <span className="routing-field-label">Address-based ranking</span>
                  <select
                    className="demo-input"
                    value={config.addressMode || 'off'}
                    onChange={(e) =>
                      setConfig({ ...config, addressMode: e.target.value as RoutingConfig['addressMode'] })
                    }
                  >
                    <option value="off">Off — warehouse priority only</option>
                    <option value="zip_prefix">ZIP / postal prefixes</option>
                    <option value="mapbox_distance">Nearest warehouse (Mapbox)</option>
                  </select>
                  <span className="routing-field-hint">When no rule matches: ZIP prefixes or nearest warehouse.</span>
                </label>
                <label className="routing-field-card">
                  <span className="routing-field-label">Partial inventory policy</span>
                  <select
                    className="demo-input"
                    value={config.partialPolicy || 'ship_available'}
                    onChange={(e) =>
                      setConfig({ ...config, partialPolicy: e.target.value as RoutingConfig['partialPolicy'] })
                    }
                  >
                    <option value="ship_available">Ship available (split / partial OK)</option>
                    <option value="hold_all">Hold entire order until complete</option>
                    <option value="allow_customer_partial">Allow customer partial shipments</option>
                  </select>
                  <span className="routing-field-hint">When stock is incomplete across warehouses.</span>
                </label>
              </div>
            </div>

            <div className="routing-settings-footer">
              <Button type="submit" disabled={savingConfig} aria-busy={savingConfig}>
                {savingConfig ? 'Saving…' : 'Save config'}
              </Button>
              {msg ? <span className="routing-save-msg">{msg}</span> : null}
            </div>
          </form>
        </section>
      ) : null}

      {tab === 'rules' ? (
        <section className="routing-panel">
          <div className="routing-panel-head">
            <div>
              <div className="routing-kicker">
                <GitBranch size={14} aria-hidden />
                Rules
              </div>
              <h2>Routing rules</h2>
              <p>Evaluated top-to-bottom. First match wins. Clear search before reordering.</p>
            </div>
            <button type="button" className="demo-btn demo-btn-sm routing-add-cta" onClick={openNewRule}>
              <Plus size={14} aria-hidden />
              Add rule
            </button>
          </div>

          <div className="routing-rule-filters">
            <StatusTabs
              activeId={ruleFilter}
              onChange={(id) => setRuleFilter(id as 'all' | 'active' | 'off')}
              tabs={[
                { id: 'all', label: 'All', count: counts.rules || undefined },
                { id: 'active', label: 'Active', count: counts.active || undefined },
                { id: 'off', label: 'Off', count: counts.off || undefined },
              ]}
            />
          </div>

          <ListToolbar
            search={ruleQ}
            searchPlaceholder="Search rules or warehouse…"
            onSearchChange={setRuleQ}
            resultCount={filteredRules.length}
            resultLabel="rules"
            onClear={() => setRuleQ('')}
          />

          <DataTable
            columns={ruleColumns}
            rows={filteredRules}
            rowKey={(rule) => rule._id}
            loading={loading}
            emptyTitle="No rules yet"
            emptyMessage="Add a rule to start routing orders automatically."
            onRowClick={(rule) => setEditingRule(rule)}
          />
        </section>
      ) : null}

      {tab === 'warehouses' ? (
        <section className="routing-panel">
          <div className="routing-panel-head">
            <div>
              <div className="routing-kicker">
                <WarehouseIcon size={14} aria-hidden />
                Priorities
              </div>
              <h2>Warehouse priorities & thresholds</h2>
              <p>
                Lower priority wins when ranking. Min stock skips a SKU here and tries the next warehouse. ZIP prefixes apply when address mode is ZIP.
              </p>
            </div>
          </div>

          {sortedWarehouses.length === 0 ? (
            <div className="routing-empty">
              <WarehouseIcon size={28} aria-hidden />
              <strong>No warehouses</strong>
              <p>Add warehouses first on the Stores & Warehouses page.</p>
            </div>
          ) : (
            <div className="demo-table-shell routing-wh-shell">
              <table className="demo-table routing-wh-table">
                <thead>
                  <tr>
                    <th>Warehouse</th>
                    <th>Priority</th>
                    <th>Min stock</th>
                    <th>ZIP prefixes</th>
                    <th>Geo / address</th>
                    <th className="is-right">Actions</th>
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
        </section>
      ) : null}

      {tab === 'inventory' ? (
        <section className="routing-panel">
          <div className="routing-panel-head">
            <div>
              <div className="routing-kicker">
                <Package size={14} aria-hidden />
                Stock
              </div>
              <h2>Inventory</h2>
              <p>
                Read-only view of warehouse stock used by routing. Inventory is managed in your WMS (or via Sync) — Linker does not add or edit SKUs here.
              </p>
            </div>
            {inventoryWh ? (
              <button
                type="button"
                className="demo-btn demo-btn-sm routing-add-cta"
                onClick={() => void loadInventory(inventoryWh)}
                disabled={invLoading}
              >
                <RefreshCw size={14} className={invLoading ? 'oj-skel-spin' : undefined} aria-hidden />
                Refresh stock
              </button>
            ) : null}
          </div>

          <div className="routing-inventory-toolbar">
            <FormField label="Warehouse" className="routing-inventory-wh">
              <select className="demo-input" value={inventoryWh} onChange={(e) => void loadInventory(e.target.value)}>
                <option value="">Select warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {inventoryWh ? (
            <>
              <div className="routing-inv-stats" aria-label="Inventory summary">
                <div className="routing-inv-stat">
                  <span className="routing-inv-stat-label">SKUs</span>
                  <strong className="routing-inv-stat-value">{inventoryStats.skus}</strong>
                </div>
                <div className="routing-inv-stat">
                  <span className="routing-inv-stat-label">On hand</span>
                  <strong className="routing-inv-stat-value">{inventoryStats.onHand}</strong>
                </div>
                <div className={`routing-inv-stat${inventoryStats.available > 0 ? ' is-ok' : ''}`}>
                  <span className="routing-inv-stat-label">Available</span>
                  <strong className="routing-inv-stat-value">{inventoryStats.available}</strong>
                </div>
                <div className="routing-inv-stat">
                  <span className="routing-inv-stat-label">Reserved</span>
                  <strong className="routing-inv-stat-value">{inventoryStats.reserved}</strong>
                </div>
              </div>

              <div className="routing-inv-note">
                Stock decreases when orders ship. Sync from ModernWMS on the warehouse page if levels look stale.
              </div>

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
                  { key: 'sku', header: 'SKU', render: (item) => <span className="routing-sku">{item.sku}</span> },
                  {
                    key: 'onHand',
                    header: 'On Hand',
                    align: 'right',
                    className: 'num',
                    render: (item) => item.quantityOnHand ?? 0,
                  },
                  {
                    key: 'available',
                    header: 'Available',
                    align: 'right',
                    className: 'num',
                    render: (item) => item.quantityAvailable ?? 0,
                  },
                  {
                    key: 'reserved',
                    header: 'Reserved',
                    align: 'right',
                    className: 'num',
                    render: (item) => item.reserved ?? 0,
                  },
                ]}
                rows={filteredInventory}
                rowKey={(item) => item.sku}
                loading={invLoading}
                emptyTitle="No inventory records"
                emptyMessage="No SKUs synced for this warehouse yet. Sync inventory from your WMS on the warehouse page."
              />
            </>
          ) : (
            <div className="routing-empty">
              <Package size={28} aria-hidden />
              <strong>Pick a warehouse</strong>
              <p>Select a warehouse to view synced stock used by routing rules.</p>
            </div>
          )}
        </section>
      ) : null}

      <Modal
        open={Boolean(editingRule)}
        onClose={() => setEditingRule(null)}
        title={editingRule?._id ? 'Edit rule' : 'New rule'}
        description="Match conditions and send qualifying orders to a warehouse."
        className="users-dialog routing-dialog"
      >
        {editingRule ? (
          <RoutingRuleEditor
            rule={editingRule}
            warehouses={warehouses}
            fields={fields}
            operators={operators}
            onCancel={() => setEditingRule(null)}
            onSave={async () => {
              setEditingRule(null)
              await load()
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deletingRule)}
        onClose={() => {
          if (!deleteBusy) setDeletingRule(null)
        }}
        title="Delete rule"
        description="Remove this routing rule permanently."
        className="users-dialog routing-dialog"
      >
        {deletingRule ? (
          <div className="users-dialog-body">
            <header className="users-dialog-hero">
              <div className="users-dialog-hero-icon is-danger" aria-hidden>
                <GitBranch size={22} />
              </div>
              <div>
                <h2>Delete {deletingRule.name}?</h2>
                <p>Orders will no longer match this rule. Warehouse priorities and inventory are unchanged.</p>
              </div>
            </header>
            <div className="wh-delete-callout">
              <strong>{deletingRule.name}</strong>
              <span>
                Priority {deletingRule.priority} · {whName(deletingRule.warehouseId)}
              </span>
            </div>
            <footer className="users-dialog-footer">
              <Button type="button" variant="secondary" disabled={deleteBusy} onClick={() => setDeletingRule(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={deleteBusy}
                aria-busy={deleteBusy}
                onClick={() => void confirmDeleteRule()}
              >
                {deleteBusy ? 'Deleting…' : 'Delete rule'}
              </Button>
            </footer>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
