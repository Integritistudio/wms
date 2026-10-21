import BrandLoader from '../BrandLoader'
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Activity, ArrowDown, ArrowUp, ChevronRight, Layers3, Pencil, ShieldCheck, Trash2, GitBranch, GripVertical, Package, Plus, RefreshCw, Settings2, Warehouse as WarehouseIcon } from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  FormField,
  ListToolbar,
  Modal,
  StatusBadge,
} from '../ui'
import {
  createRoutingRule,
  deleteRoutingRule,
  getRoutingConfig,
  getWarehouseInventory,
  listRoutingRules,
  reorderWarehouseRouting,
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
import '../../styles/routing.css'

type InventoryRow = InventoryItem & { warehouseId: string; warehouseName: string }

type RoutingTab = 'settings' | 'rules' | 'warehouses' | 'inventory'

export function RoutingRuleEditor({
  rule: initial,
  warehouses,
  fields,
  operators,
  onCancel,
  onSave,
  onBusyChange,
}: {
  rule: RoutingRule
  warehouses: Array<{ id: string; name: string }>
  fields: RoutingField[]
  operators: RoutingOperator[]
  onCancel: () => void
  onSave: () => void | Promise<void>
  onBusyChange?: (busy: boolean) => void
}) {
  const editorId = useId()
  const [rule, setRule] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const conditionFields = fields.filter((field) => !['risk_level', 'is_b2b'].includes(field.id))
  const categories = [...new Set(conditionFields.map((field) => field.category))]

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
    if (saving) return
    setSaving(true)
    onBusyChange?.(true)
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
      await onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
    setSaving(false)
    onBusyChange?.(false)
  }

  return (
    <form onSubmit={handleSave} className="users-dialog-body routing-rule-form">
      <header className="routing-editor-header">
        <h2>{rule._id ? 'Edit routing rule' : 'Create routing rule'}</h2>
        <p>Set the destination and conditions for this rule.</p>
      </header>

      <fieldset className="routing-editor-fields" disabled={saving}>
      <div className="users-dialog-grid">
        <FormField htmlFor={`${editorId}-name`} label="Rule name" required>
          <input
            className="demo-input"
            id={`${editorId}-name`}
            placeholder="Rule name"
            maxLength={120}
            value={rule.name}
            onChange={(e) => setRule({ ...rule, name: e.target.value })}
            required
          />
        </FormField>
        <FormField htmlFor={`${editorId}-warehouse`} label="Target warehouse" required>
          <select
            className="demo-input"
            id={`${editorId}-warehouse`}
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
        <FormField htmlFor={`${editorId}-logic`} label="Match logic">
          <select
            className="demo-input"
            id={`${editorId}-logic`}
            value={rule.conditionLogic}
            onChange={(e) => setRule({ ...rule, conditionLogic: e.target.value as 'and' | 'or' })}
          >
            <option value="and">Match all conditions</option>
            <option value="or">Match any condition</option>
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
            <strong>Active</strong>
            <span>Use this rule when routing orders</span>
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
                ? `${rule.conditions.length} ${rule.conditions.length === 1 ? 'condition' : 'conditions'}`
                : 'Matches all orders'}
            </span>
          </div>
          <button type="button" className="demo-btn demo-btn-sm" onClick={addCondition}>
            <Plus size={14} aria-hidden /> Add condition
          </button>
        </div>
        {rule.conditions.length ? (
          <div className="routing-cond-list">
            {rule.conditions.map((cond, idx) => (
              <div key={idx} className="routing-cond-row">
                <select
                  className="demo-input"
                  aria-label={`Condition ${idx + 1} field`}
                  value={cond.field}
                  onChange={(e) => updateCondition(idx, { field: e.target.value })}
                >
                  {categories.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {conditionFields
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
                  aria-label={`Condition ${idx + 1} operator`}
                  value={cond.operator}
                  onChange={(e) => updateCondition(idx, { operator: e.target.value })}
                >
                  {operators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.label}
                    </option>
                  ))}
                </select>
                {!['is_true', 'is_false'].includes(cond.operator) && !['all_items_in_stock', 'any_item_in_stock'].includes(cond.field) ? (
                  <input
                    className="demo-input"
                    placeholder="Value"
                    aria-label={`Condition ${idx + 1} value`}
                    value={cond.value}
                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                  />
                ) : (
                  <span className="routing-cond-spacer" aria-hidden />
                )}
                <button type="button" className="demo-btn demo-btn-sm demo-btn-ghost" onClick={() => removeCondition(idx)} aria-label={`Remove condition ${idx + 1}`} title="Remove condition">
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        ) : <p className="routing-condition-empty">No conditions added. This rule applies to all orders.</p>}
      </div>
      </fieldset>

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
          {saving ? 'Saving...' : rule._id ? 'Save changes' : 'Create rule'}
        </Button>
      </footer>
    </form>
  )
}

function WarehouseRoutingCard({
  warehouse,
  rank,
  dragEnabled,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onSaved,
  onMove,
  last,
}: {
  warehouse: Warehouse
  rank: number
  dragEnabled: boolean
  dragging: boolean
  onDragStart: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
  onSaved: () => void
  onMove: (direction: -1 | 1) => void
  last: boolean
}) {
  const [threshold, setThreshold] = useState(String(warehouse.minStockThreshold ?? 0))
  const [zips, setZips] = useState((warehouse.zipPrefixes || []).join(', '))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setThreshold(String(warehouse.minStockThreshold ?? 0))
    setZips((warehouse.zipPrefixes || []).join(', '))
  }, [warehouse.id, warehouse.minStockThreshold, warehouse.zipPrefixes])

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      await updateCompanyWarehouse(warehouse.id, {
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

  const dirty = threshold !== String(warehouse.minStockThreshold ?? 0) || zips !== (warehouse.zipPrefixes || []).join(', ')

  const modeLabel = warehouse.fulfillmentMode === 'modernwms' ? 'ModernWMS' : 'SFTP / EDI'

  return (
    <article
      className={`routing-wh-card${rank === 1 ? ' is-first' : ''}${dragging ? ' is-dragging' : ''}${dragEnabled ? ' is-draggable' : ''}`}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
    >
      <div className="routing-wh-card-main">
        <button
          type="button"
          className="routing-wh-grip"
          aria-label={`Drag to reorder ${warehouse.name}`}
          title={dragEnabled ? 'Drag to set priority' : 'Clear filters to reorder'}
          disabled={!dragEnabled}
          draggable={dragEnabled}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', warehouse.id)
            onDragStart()
          }}
        >
          <GripVertical size={18} aria-hidden />
        </button>
        <div className="routing-priority-number"><span>{String(rank).padStart(2, '0')}</span><small>Priority</small></div>
        <span className="routing-priority-building"><WarehouseIcon size={22} aria-hidden /></span>
        <div className="routing-wh-card-copy">
          <div className="routing-wh-name-cell">
            <span className="routing-wh-icon" aria-hidden>
              <WarehouseIcon size={15} />
            </span>
            <strong>{warehouse.name}</strong>
            {rank === 1 ? <span className="routing-first-choice">First choice</span> : null}
            <StatusBadge
              status={warehouse.fulfillmentMode || 'sftp_edi'}
              label={modeLabel}
              variant={warehouse.fulfillmentMode === 'modernwms' ? 'info' : 'neutral'}
            />
          </div>
          <p className="routing-wh-geo">
            {warehouse.address || 'No address added'}
          </p>
        </div>
        <div className="routing-priority-move">
          <button type="button" disabled={!dragEnabled || rank === 1} onClick={() => onMove(-1)} aria-label={`Move ${warehouse.name} up`} title="Move up"><ArrowUp size={15} aria-hidden /></button>
          <button type="button" disabled={!dragEnabled || last} onClick={() => onMove(1)} aria-label={`Move ${warehouse.name} down`} title="Move down"><ArrowDown size={15} aria-hidden /></button>
        </div>
      </div>
      <div className="routing-wh-card-fields">
        <label>
          <span>Minimum stock</span>
          <input
            className="demo-input routing-wh-num"
            type="number"
            min={0}
            disabled={saving}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            aria-label={`${warehouse.name} min stock`}
          />
        </label>
        <label className="routing-wh-zips-field">
          <span>ZIP prefixes</span>
          <input
            className="demo-input routing-wh-zips"
            disabled={saving}
            placeholder="e.g. 902, 10001, M5V"
            value={zips}
            onChange={(e) => setZips(e.target.value)}
            aria-label={`${warehouse.name} zip prefixes`}
          />
        </label>
        <div className="routing-wh-actions">
          <button type="button" className="routing-warehouse-save" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          {msg ? <span role="status" className={`routing-wh-msg${msg !== 'Saved' ? ' is-error' : ''}`}>{msg}</span> : null}
        </div>
      </div>
    </article>
  )
}

export default function RoutingPanel() {
  const { company, setError, setNotice, refresh } = useCompanyPortal()
  const warehouses = company?.warehouses || []

  const [tab, setTab] = useState<RoutingTab>('rules')
  const [config, setConfig] = useState<RoutingConfig>({
    enabled: false,
    autoAssignOnReceive: true,
    autoDeliverSftp: true,
    defaultWarehouseId: null,
    fallbackWarehouseId: null,
    partialPolicy: 'ship_available',
    addressMode: 'off',
    wmsPushHoldEnabled: false,
    wmsPushHoldMinutes: 15,
  })
  const [rules, setRules] = useState<RoutingRule[]>([])
  const [fields, setFields] = useState<RoutingField[]>([])
  const [operators, setOperators] = useState<RoutingOperator[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null)
  const [editingBusy, setEditingBusy] = useState(false)
  const [deletingRule, setDeletingRule] = useState<RoutingRule | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [ruleQ, setRuleQ] = useState('')
  const [ruleWarehouse, setRuleWarehouse] = useState('')
  const [dragRuleId, setDragRuleId] = useState<string | null>(null)
  const [dropRuleId, setDropRuleId] = useState<string | null>(null)
  const ruleSaveLock = useRef(false)
  const [ruleFilter, setRuleFilter] = useState<'all' | 'active' | 'off'>('all')
  const [inventoryWh, setInventoryWh] = useState('')
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [invQ, setInvQ] = useState('')
  const [invLoading, setInvLoading] = useState(false)
  const [invError, setInvError] = useState('')
  const inventoryRequest = useRef(0)
  const [reordering, setReordering] = useState(false)
  const [whOrder, setWhOrder] = useState<Warehouse[]>([])
  const [whQ, setWhQ] = useState('')
  const [whMode, setWhMode] = useState<'all' | 'modernwms' | 'sftp_edi'>('all')
  const [whGeo, setWhGeo] = useState<'all' | 'mapped' | 'unmapped'>('all')
  const [dragWhId, setDragWhId] = useState<string | null>(null)
  const [reorderingWh, setReorderingWh] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [cfg, ruleList] = await Promise.all([getRoutingConfig(), listRoutingRules()])
      setConfig({
        fallbackWarehouseId: null,
        addressMode: 'off',
        wmsPushHoldEnabled: false,
        wmsPushHoldMinutes: 15,
        ...cfg.config,
      })
      setFields(cfg.fields)
      setOperators(cfg.operators)
      setRules([...ruleList].sort((a, b) => a.priority - b.priority))
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
    return {
      rules: rules.length,
      active: rules.filter((rule) => rule.enabled).length,
      warehouses: warehouses.length,
    }
  }, [rules, warehouses])

  const filteredRules = useMemo(() => {
    const term = ruleQ.trim().toLowerCase()
    return rules.filter((r) => {
      if (ruleWarehouse && r.warehouseId !== ruleWarehouse) return false
      if (ruleFilter === 'active' && !r.enabled) return false
      if (ruleFilter === 'off' && r.enabled) return false
      if (!term) return true
      return (
        r.name.toLowerCase().includes(term) ||
        (warehouses.find((w) => w.id === r.warehouseId)?.name || '').toLowerCase().includes(term)
      )
    })
  }, [rules, ruleQ, warehouses, ruleFilter, ruleWarehouse])

  const filteredInventory = useMemo(() => {
    const term = invQ.trim().toLowerCase()
    if (!term) return inventory
    return inventory.filter((item) => `${item.sku} ${item.warehouseName}`.toLowerCase().includes(term))
  }, [inventory, invQ])

  useEffect(() => {
    setWhOrder([...warehouses].sort((a, b) => (a.routingPriority ?? 100) - (b.routingPriority ?? 100)))
  }, [warehouses])

  const filteredWarehouses = useMemo(() => {
    const term = whQ.trim().toLowerCase()
    return whOrder.filter((w) => {
      if (whMode === 'modernwms' && w.fulfillmentMode !== 'modernwms') return false
      if (whMode === 'sftp_edi' && w.fulfillmentMode === 'modernwms') return false
      if (whGeo === 'mapped' && (w.latitude == null || w.longitude == null)) return false
      if (whGeo === 'unmapped' && w.latitude != null && w.longitude != null) return false
      if (!term) return true
      const hay = [w.name, w.code, w.address, ...(w.zipPrefixes || [])].join(' ').toLowerCase()
      return hay.includes(term)
    })
  }, [whOrder, whQ, whMode, whGeo])

  const whFiltersActive = Boolean(whQ.trim()) || whMode !== 'all' || whGeo !== 'all'

  function previewWarehouseMove(fromId: string, toId: string) {
    if (!fromId || !toId || fromId === toId || reorderingWh || whFiltersActive) return
    setWhOrder((prev) => {
      const fromIdx = prev.findIndex((w) => w.id === fromId)
      const toIdx = prev.findIndex((w) => w.id === toId)
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev
      const next = [...prev]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      return next
    })
  }

  async function commitWarehouseOrder(order = whOrder) {
    if (reorderingWh) return
    const ids = order.map((w) => w.id)
    const current = [...warehouses]
      .sort((a, b) => (a.routingPriority ?? 100) - (b.routingPriority ?? 100))
      .map((w) => w.id)
    if (ids.length === 0 || ids.join(',') === current.join(',')) return
    setReorderingWh(true)
    try {
      const updated = await reorderWarehouseRouting(ids)
      setWhOrder(updated)
      setNotice('Warehouse priority order saved')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save warehouse order')
      setWhOrder([...warehouses].sort((a, b) => (a.routingPriority ?? 100) - (b.routingPriority ?? 100)))
    } finally {
      setReorderingWh(false)
    }
  }

  async function saveConfigForm(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    setSavingConfig(true)
    try {
      await saveRoutingConfig(config)
      setMsg('Routing settings saved')
      setNotice('Routing settings saved')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    }
    setSavingConfig(false)
  }

  const ruleReorderDisabled = loading || reordering || Boolean(ruleQ.trim()) || ruleFilter !== 'all'

  async function saveRuleOrder(ordered: RoutingRule[]) {
    if (ruleSaveLock.current) return
    ruleSaveLock.current = true
    setReordering(true)
    const previous = rules
    const numbered = ordered.map((rule, index) => ({ ...rule, priority: index + 1 }))
    setRules(numbered)
    try {
      // Use existing updates: the bulk reorder endpoint assigns priorities in tens.
      const results = await Promise.allSettled(numbered
        .filter((rule) => previous.find((old) => old._id === rule._id)?.priority !== rule.priority)
        .map((rule) => updateRoutingRule(rule._id, { priority: rule.priority })))
      if (results.some((result) => result.status === 'rejected')) {
        throw new Error('Some priorities could not be saved. Reloaded the saved order; please try again.')
      }
      setNotice('Rule order saved')
    } catch (err) {
      setRules(previous)
      await load()
      setError(err instanceof Error ? err.message : 'Unable to save rule order')
    } finally {
      ruleSaveLock.current = false
      setReordering(false)
    }
  }

  async function moveRule(ruleId: string, targetId: string) {
    if (ruleReorderDisabled || ruleSaveLock.current || ruleId === targetId) return
    const scoped = rules.filter((rule) => !ruleWarehouse || rule.warehouseId === ruleWarehouse)
    const from = scoped.findIndex((rule) => rule._id === ruleId)
    const to = scoped.findIndex((rule) => rule._id === targetId)
    if (from < 0 || to < 0) return
    const [item] = scoped.splice(from, 1)
    scoped.splice(to, 0, item)
    let index = 0
    // Keep other warehouses in their existing evaluation slots.
    await saveRuleOrder(rules.map((rule) =>
      !ruleWarehouse || rule.warehouseId === ruleWarehouse ? scoped[index++] : rule))
  }

  async function loadInventory(whId: string) {
    const requestId = ++inventoryRequest.current
    setInventoryWh(whId)
    setInvQ('')
    setInvError('')
    setInventory([])
    if (!whId) { setInvLoading(false); return }
    setInvLoading(true)
    try {
      const selected = whId === 'all' ? warehouses : warehouses.filter((warehouse) => warehouse.id === whId)
      const batches = await Promise.all(selected.map(async (warehouse) => {
        const items = await getWarehouseInventory(warehouse.id)
        return items.map((item) => ({ ...item, warehouseId: warehouse.id, warehouseName: warehouse.name }))
      }))
      if (requestId === inventoryRequest.current) setInventory(batches.flat())
    } catch (err) {
      if (requestId === inventoryRequest.current) setInvError(err instanceof Error ? err.message : 'Unable to load inventory. Please try again.')
    } finally {
      if (requestId === inventoryRequest.current) setInvLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'inventory' && !inventoryWh && warehouses.length > 0) void loadInventory('all')
  }, [tab, inventoryWh, warehouses])

  const inventoryStats = useMemo(() => {
    let onHand = 0
    let available = 0
    let reserved = 0
    for (const item of inventory) {
      onHand += item.quantityOnHand ?? 0
      available += item.quantityAvailable ?? 0
      reserved += item.reserved ?? 0
    }
    return { skus: new Set(inventory.map((item) => item.sku)).size, onHand, available, reserved }
  }, [inventory])

  async function confirmDeleteRule() {
    if (!deletingRule || deleteBusy) return
    setDeleteBusy(true)
    try {
      await deleteRoutingRule(deletingRule._id)
      setDeletingRule(null)
      const remaining = await listRoutingRules()
      await saveRuleOrder([...remaining].sort((a, b) => a.priority - b.priority))
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
      priority: Math.max(0, ...rules.map((rule) => rule.priority)) + 1,
      enabled: true,
      warehouseId: ruleWarehouse || warehouses[0]?.id || '',
      conditionLogic: 'and',
      conditions: [],
      requireAllItemsInStock: false,
    })
  }

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || id

  if (loading) return <BrandLoader label="Loading routing..." />

  return (
    <div className="oj-page oj-skel routing-page">
      <header className="routing-header">
        <div>
          <div className="analytics-v2-crumb"><span>Workspace</span><ChevronRight size={12} aria-hidden /><strong>Order routing</strong></div>
          <div className="routing-title-row"><h1>Order routing</h1><span className={`routing-live-badge${config.enabled ? ' is-on' : ''}`}><span />{config.enabled ? 'Routing enabled' : 'Routing paused'}</span></div>
          <p>Connect every order to the right warehouse.</p>
        </div>
        <button type="button" className="demo-btn routing-primary" onClick={openNewRule} disabled={loading || reordering || warehouses.length === 0}>
          <Plus size={16} aria-hidden />Create rule
        </button>
      </header>

      <div className="routing-stats" aria-label="Routing summary">
        {[
          { label: 'Routing status', value: config.enabled ? 'Enabled' : 'Paused', hint: 'Automatic assignment', icon: Activity },
          { label: 'Total rules', value: counts.rules, hint: 'Across all warehouses', icon: GitBranch },
          { label: 'Active rules', value: counts.active, hint: 'Ready to route orders', icon: ShieldCheck },
          { label: 'Warehouses', value: counts.warehouses, hint: 'Connected destinations', icon: WarehouseIcon },
        ].map(({ label, value, hint, icon: Icon }) => (
          <div className="routing-stat" key={label}>
            <div className="routing-stat-top"><span className="routing-stat-label">{label}</span><Icon size={16} aria-hidden /></div>
            <strong className="routing-stat-value">{value}</strong>
            <span className="routing-stat-hint">{hint}</span>
          </div>
        ))}
      </div>

      <div className="routing-status-tabs">
        <nav className="routing-section-nav" aria-label="Routing sections">
          {([
            { id: 'rules', label: 'Rules', icon: GitBranch },
            { id: 'settings', label: 'Settings', icon: Settings2 },
            { id: 'warehouses', label: 'Warehouse priority', icon: WarehouseIcon },
            { id: 'inventory', label: 'Inventory', icon: Package },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-pressed={tab === id}
              onClick={() => setTab(id)}><Icon size={16} aria-hidden />{label}</button>
          ))}
        </nav>
        <button type="button" className="orders-refresh-btn" onClick={() => void load()}
          disabled={loading || reordering} aria-label="Refresh routing" title="Refresh routing">
          <RefreshCw size={16} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

      {tab === 'settings' ? (
        <section className="routing-panel routing-settings-panel">
          <div className="routing-panel-head">
            <div>
              <div className="routing-kicker">
                <Settings2 size={14} aria-hidden />
                Configuration
              </div>
              <h2>Routing settings</h2>
              <p>Control when orders are routed, assigned, and sent to the warehouse.</p>
            </div>
          </div>

          <form onSubmit={saveConfigForm} className="routing-settings">
            <fieldset className="routing-settings-lock" disabled={loading || savingConfig}>
            <div className="routing-settings-block">
              <div className="routing-settings-block-head">
                <strong>Automation</strong>
                <span>Choose when orders are assigned and sent for fulfillment.</span>
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
                      Assign orders using your rules and warehouse preferences.
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
                    <strong>Assign on receipt</strong>
                    <span>
                      Assign a warehouse immediately, or turn off to review suggestions first.
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
                    <strong>Send fulfillment orders via SFTP</strong>
                    <span>Send the 940 file after a warehouse has been assigned.</span>
                  </span>
                </label>
                <label className={`routing-toggle${config.wmsPushHoldEnabled ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={Boolean(config.wmsPushHoldEnabled)}
                    onChange={(e) => setConfig({ ...config, wmsPushHoldEnabled: e.target.checked })}
                  />
                  <span>
                    <strong>Allow time for Shopify edits</strong>
                    <span>
                      Reserve stock now and delay fulfillment while order edits settle. Stores can override this setting.
                    </span>
                  </span>
                </label>
                {config.wmsPushHoldEnabled ? (
                  <label className="routing-field-card">
                    <span className="routing-field-label">Hold window (minutes)</span>
                    <input
                      className="demo-input"
                      type="number"
                      min={1}
                      max={240}
                      value={config.wmsPushHoldMinutes ?? 15}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          wmsPushHoldMinutes: Math.min(240, Math.max(1, Number(e.target.value) || 15)),
                        })
                      }
                    />
                    <span className="routing-field-hint">Starts when the order is assigned. Later edits do not extend the hold.</span>
                  </label>
                ) : null}
              </div>
            </div>

            <div className="routing-settings-block">
              <div className="routing-settings-block-head">
                <strong>Warehouse preferences</strong>
                <span>Set warehouse preferences for orders with no matching rule or multiple warehouse candidates.</span>
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
                  <span className="routing-field-hint">Preferred destination when no rule or address match selects a warehouse.</span>
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
                  <span className="routing-field-hint">Final destination when no suitable warehouse can be selected.</span>
                </label>
                <label className="routing-field-card">
                  <span className="routing-field-label">Warehouse selection method</span>
                  <select
                    className="demo-input"
                    value={config.addressMode || 'off'}
                    onChange={(e) =>
                      setConfig({ ...config, addressMode: e.target.value as RoutingConfig['addressMode'] })
                    }
                  >
                    <option value="off">Warehouse priority</option>
                    <option value="zip_prefix">ZIP / postal prefixes</option>
                    <option value="mapbox_distance">Nearest warehouse</option>
                  </select>
                  <span className="routing-field-hint">Rank eligible warehouse candidates by priority, ZIP / postal prefix, or distance.</span>
                </label>
                <label className="routing-field-card">
                  <span className="routing-field-label">Partial fulfillment policy</span>
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
                  <span className="routing-field-hint">Choose how to fulfill an order when no single warehouse has all items in stock.</span>
                </label>
              </div>
            </div>

            <div className="routing-settings-footer">
              <Button type="submit" disabled={savingConfig} aria-busy={savingConfig}>
                {savingConfig ? 'Saving…' : 'Save settings'}
              </Button>
              {msg ? <span className="routing-save-msg">{msg}</span> : null}
            </div>
            </fieldset>
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
              <p>Manage how orders are assigned to your warehouses.</p>
            </div>
            <span className="routing-panel-total">{filteredRules.length} {filteredRules.length === 1 ? 'rule' : 'rules'}</span>
          </div>

          <nav className="routing-warehouse-tabs" aria-label="Filter rules by warehouse">
            {[{ id: '', name: 'All warehouses' }, ...warehouses].map((warehouse) => {
              const Icon = warehouse.id ? WarehouseIcon : Layers3
              const count = rules.filter((rule) => !warehouse.id || rule.warehouseId === warehouse.id).length
              return <button key={warehouse.id} type="button" disabled={reordering}
                className={ruleWarehouse === warehouse.id ? 'is-active' : ''} aria-pressed={ruleWarehouse === warehouse.id}
                onClick={() => { setRuleWarehouse(warehouse.id); setDragRuleId(null); setDropRuleId(null) }}>
                <Icon size={16} aria-hidden /><span>{warehouse.name}</span><span className="routing-tab-count">{count}</span>
              </button>
            })}
          </nav>

          <ListToolbar search={ruleQ} searchPlaceholder="Search rules..." onSearchChange={setRuleQ}
            filters={[{ key: 'status', label: 'Status', value: ruleFilter,
              options: [{ value: 'all', label: 'All rules' }, { value: 'active', label: 'Active rules' }, { value: 'off', label: 'Off rules' }],
              onChange: (value) => setRuleFilter(value as 'all' | 'active' | 'off') }]}
            onClear={() => { setRuleQ(''); setRuleFilter('all') }} />
          <div className="routing-list-heading"><span>Rule / destination</span><span>Status & actions</span></div>
          <span className="sr-only" role="status" aria-live="polite">{reordering ? 'Saving order...' : `${filteredRules.length} rules`}</span>
          {ruleQ.trim() || ruleFilter !== 'all' ? <p className="routing-filter-note">Clear filters to change rule order.</p> : null}
          <div className="routing-rule-list" aria-busy={loading || reordering}>
            {loading ? <BrandLoader label="Loading rules..." /> : filteredRules.length === 0 ? (
              <div className="routing-empty"><span className="routing-empty-icon"><GitBranch size={24} aria-hidden /></span><strong>{ruleQ || ruleFilter !== 'all' ? 'No matching rules' : 'Your routing starts here'}</strong><p>{ruleQ || ruleFilter !== 'all' ? 'Try another search or clear your filters.' : 'Create a rule to send orders to this warehouse.'}</p><button type="button" className="demo-btn routing-primary" disabled={warehouses.length === 0} onClick={openNewRule}><Plus size={15} aria-hidden />Create rule</button></div>
            ) : filteredRules.map((rule, index) => (
              <article key={rule._id}
                className={`routing-rule-card${dragRuleId === rule._id ? ' is-dragging' : ''}${dropRuleId === rule._id ? ' is-drop-target' : ''}`}
                onDragOver={(e) => {
                  if (!dragRuleId || ruleReorderDisabled || dragRuleId === rule._id) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDropRuleId(rule._id)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragRuleId) void moveRule(dragRuleId, rule._id)
                  setDragRuleId(null)
                  setDropRuleId(null)
                }}>
                <button type="button" className="routing-wh-grip" draggable={!ruleReorderDisabled}
                  disabled={ruleReorderDisabled} aria-label={`Drag to reorder ${rule.name}`}
                  title="Drag to reorder; or use the up and down buttons"
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', rule._id)
                    setDragRuleId(rule._id)
                  }}
                  onDragEnd={() => { setDragRuleId(null); setDropRuleId(null) }}>
                  <GripVertical size={18} aria-hidden />
                </button>
                <span className="routing-wh-rank" title="Overall evaluation order">{rules.findIndex((item) => item._id === rule._id) + 1}</span>
                <div className="routing-rule-copy">
                  <strong>{rule.name}</strong>
                  <span><WarehouseIcon size={12} aria-hidden />{whName(rule.warehouseId)}<span className="routing-meta-dot" />{rule.conditions.length === 0 ? 'All orders' : `${rule.conditions.length} ${rule.conditions.length === 1 ? 'condition' : 'conditions'}`}{rule.requireAllItemsInStock ? <ShieldCheck size={13} aria-label="Stock required" /> : null}</span>
                </div>
                <StatusBadge status={rule.enabled ? 'active' : 'skipped'} label={rule.enabled ? 'Active' : 'Off'} variant={rule.enabled ? 'success' : 'neutral'} />
                <div className="routing-actions">
                  <button type="button" className="routing-order-btn" disabled={ruleReorderDisabled || index === 0}
                    aria-label={`Move ${rule.name} up`} title="Move up" onClick={() => void moveRule(rule._id, filteredRules[index - 1]._id)}><ArrowUp size={15} aria-hidden /></button>
                  <button type="button" className="routing-order-btn" disabled={ruleReorderDisabled || index === filteredRules.length - 1}
                    aria-label={`Move ${rule.name} down`} title="Move down" onClick={() => void moveRule(rule._id, filteredRules[index + 1]._id)}><ArrowDown size={15} aria-hidden /></button>
                  <button type="button" className="routing-action-btn" disabled={reordering} onClick={() => setEditingRule(rule)} aria-label={`Edit ${rule.name}`} title="Edit rule"><Pencil size={15} aria-hidden /></button>
                  <button type="button" className="routing-action-btn is-danger" disabled={reordering} onClick={() => setDeletingRule(rule)} aria-label={`Delete ${rule.name}`} title="Delete rule"><Trash2 size={15} aria-hidden /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'warehouses' ? (
        <section className="routing-panel routing-priority-panel">
          <div className="routing-panel-head">
            <div>
              <div className="routing-kicker">
                <WarehouseIcon size={14} aria-hidden />
                Priorities
              </div>
              <h2>Warehouse priority</h2>
              <p>
                Set your preferred fulfillment order and stock requirements for each warehouse.
              </p>
            </div>
          </div>

          {loading ? <BrandLoader label="Loading warehouses..." /> : whOrder.length === 0 ? (
            <div className="routing-empty">
              <WarehouseIcon size={28} aria-hidden />
              <strong>No warehouses</strong>
              <p>Connect a warehouse to set its fulfillment priority.</p>
            </div>
          ) : (
            <>
              <ListToolbar
                search={whQ}
                searchPlaceholder="Search name, code, ZIP…"
                onSearchChange={setWhQ}
                filters={[
                  {
                    key: 'mode',
                    label: 'Fulfillment',
                    value: whMode,
                    options: [
                      { value: 'all', label: 'All modes' },
                      { value: 'modernwms', label: 'ModernWMS' },
                      { value: 'sftp_edi', label: 'SFTP / EDI' },
                    ],
                    onChange: (v) => setWhMode(v as 'all' | 'modernwms' | 'sftp_edi'),
                  },
                  {
                    key: 'geo',
                    label: 'Location',
                    value: whGeo,
                    options: [
                      { value: 'all', label: 'All locations' },
                      { value: 'mapped', label: 'Mapped' },
                      { value: 'unmapped', label: 'Address needed' },
                    ],
                    onChange: (v) => setWhGeo(v as 'all' | 'mapped' | 'unmapped'),
                  },
                ]}
                resultCount={filteredWarehouses.length}
                resultLabel="warehouses"
                onClear={() => {
                  setWhQ('')
                  setWhMode('all')
                  setWhGeo('all')
                }}
              />
              {whFiltersActive ? (
                <p className="routing-wh-filter-hint">Clear filters to drag and reorder priorities.</p>
              ) : (
                <p className="routing-wh-filter-hint">Drag warehouses to change their order.</p>
              )}
              {filteredWarehouses.length === 0 ? (
                <div className="routing-empty">
                  <strong>No warehouses match</strong>
                  <p>Try another search or clear filters.</p>
                </div>
              ) : (
                <div className={`routing-wh-dnd${reorderingWh ? ' is-busy' : ''}`} aria-busy={reorderingWh}>
                  {filteredWarehouses.map((w) => {
                    const rank = whOrder.findIndex((row) => row.id === w.id) + 1
                    return (
                      <WarehouseRoutingCard
                        key={w.id}
                        warehouse={w}
                        rank={rank}
                        last={rank === whOrder.length}
                        onMove={(direction) => {
                          if (whFiltersActive || reorderingWh) return
                          const next = [...whOrder]
                          const index = rank - 1
                          const target = index + direction
                          if (target < 0 || target >= next.length) return
                          ;[next[index], next[target]] = [next[target], next[index]]
                          setWhOrder(next)
                          void commitWarehouseOrder(next)
                        }}
                        dragEnabled={!whFiltersActive && !reorderingWh}
                        dragging={dragWhId === w.id}
                        onDragStart={() => setDragWhId(w.id)}
                        onDragOver={(e) => {
                          if (!dragWhId || dragWhId === w.id || whFiltersActive) return
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          previewWarehouseMove(dragWhId, w.id)
                        }}
                        onDrop={() => {
                          setDragWhId(null)
                          void commitWarehouseOrder()
                        }}
                        onDragEnd={() => {
                          setDragWhId(null)
                          void commitWarehouseOrder()
                        }}
                        onSaved={() => void refresh()}
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {tab === 'inventory' ? (
        <section className="routing-panel routing-inventory-panel">
          <div className="routing-panel-head">
            <div>
              <div className="routing-kicker">
                <Package size={14} aria-hidden />
                Stock
              </div>
              <h2>Inventory</h2>
              <p>
                View the latest stock available for routing at each warehouse.
              </p>
            </div>
          </div>

          {warehouses.length > 0 ? <div className="routing-inventory-navigation"><nav className="routing-warehouse-tabs" aria-label="Inventory warehouse">
            <button type="button" className={inventoryWh === 'all' ? 'is-active' : ''} aria-pressed={inventoryWh === 'all'} onClick={() => void loadInventory('all')}><Layers3 size={16} aria-hidden />All warehouses</button>
            {warehouses.map((warehouse) => <button key={warehouse.id} type="button"
              className={inventoryWh === warehouse.id ? 'is-active' : ''} aria-pressed={inventoryWh === warehouse.id}
              onClick={() => void loadInventory(warehouse.id)}><WarehouseIcon size={16} aria-hidden />{warehouse.name}</button>)}
          </nav>
            <button type="button" className="orders-refresh-btn" aria-label="Refresh stock" title="Refresh stock"
              disabled={invLoading || !inventoryWh} aria-busy={invLoading}
              onClick={() => void loadInventory(inventoryWh)}>
              <RefreshCw size={16} className={invLoading ? 'oj-skel-spin' : undefined} aria-hidden />
            </button>
          </div> : null}

          {inventoryWh ? (
            <>
              <div className="routing-inv-stats" aria-label="Inventory summary">
                <div className="routing-inv-stat">
                  <span className="routing-inv-stat-label">SKUs</span>
                  <strong className="routing-inv-stat-value">{invLoading ? "-" : inventoryStats.skus.toLocaleString()}</strong>
                </div>
                <div className="routing-inv-stat">
                  <span className="routing-inv-stat-label">On hand</span>
                  <strong className="routing-inv-stat-value">{invLoading ? "-" : inventoryStats.onHand.toLocaleString()}</strong>
                </div>
                <div className={`routing-inv-stat${inventoryStats.available > 0 ? ' is-ok' : ''}`}>
                  <span className="routing-inv-stat-label">Available</span>
                  <strong className="routing-inv-stat-value">{invLoading ? "-" : inventoryStats.available.toLocaleString()}</strong>
                </div>
                <div className="routing-inv-stat">
                  <span className="routing-inv-stat-label">Reserved</span>
                  <strong className="routing-inv-stat-value">{invLoading ? "-" : inventoryStats.reserved.toLocaleString()}</strong>
                </div>
              </div>

              {invError ? <Alert tone="danger" onDismiss={() => setInvError('')}>{invError}</Alert> : null}
              <div className="routing-inv-note">
                Inventory is synced from your warehouse and updates as orders ship.
              </div>

              <ListToolbar
                search={invQ}
                searchPlaceholder="Search SKU or warehouse..."
                onSearchChange={setInvQ}
                resultCount={filteredInventory.length}
                resultLabel="stock records"
                onClear={() => setInvQ('')}
              />
              <DataTable
                columns={[
                  { key: 'warehouse', header: 'Warehouse', render: (item) => <span className="routing-inventory-location"><WarehouseIcon size={13} aria-hidden />{item.warehouseName}</span> },
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
                rowKey={(item) => `${item.warehouseId}:${item.sku}`}
                loading={invLoading}
                emptyTitle={invError ? "Inventory unavailable" : "No inventory records"}
                emptyMessage={invError ? "Use Refresh stock to try again." : "Sync this warehouse to see its stock here."}
              />
            </>
          ) : (
            <div className="routing-empty">
              <Package size={28} aria-hidden />
<strong>{warehouses.length ? "Select a warehouse" : "No warehouses connected"}</strong>
              <p>{warehouses.length ? "Choose a warehouse above to view its stock." : "Connect a warehouse to view inventory availability."}</p>
            </div>
          )}
        </section>
      ) : null}

      <Modal
        open={Boolean(editingRule)}
        onClose={() => { if (!editingBusy) setEditingRule(null) }}
        title={editingRule?._id ? 'Edit rule' : 'New rule'}
        description="Match conditions and send qualifying orders to a warehouse."
        className="users-dialog routing-dialog"
      >
        {editingRule ? (
          <RoutingRuleEditor
            onBusyChange={setEditingBusy}
            rule={editingRule}
            warehouses={warehouses}
            fields={fields}
            operators={operators}
            onCancel={() => setEditingRule(null)}
            onSave={async () => {
              const updated = await listRoutingRules()
              await saveRuleOrder([...updated].sort((a, b) => a.priority - b.priority))
              setEditingRule(null)
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deletingRule)}
        onClose={() => {
          if (!deleteBusy) setDeletingRule(null)
        }}
        title="Delete routing rule?"
        description="Permanently delete this routing rule."
        className="users-dialog routing-dialog routing-delete-dialog"
      >
        {deletingRule ? (
          <div className="users-dialog-body">
            <header className="routing-delete-header">
              <span className="routing-delete-icon"><Trash2 size={20} aria-hidden /></span>
              <h2>Delete routing rule?</h2>
              <p>Orders will follow your remaining rules once this rule is removed.</p>
            </header>
            <div className="routing-delete-rule">
              <GitBranch size={18} aria-hidden />
              <div><strong>{deletingRule.name}</strong><span><WarehouseIcon size={13} aria-hidden />{whName(deletingRule.warehouseId)}</span></div>
              <StatusBadge status={deletingRule.enabled ? 'active' : 'skipped'} label={deletingRule.enabled ? 'Active' : 'Off'} variant={deletingRule.enabled ? 'success' : 'neutral'} />
            </div>
            <p className="routing-delete-warning">This action cannot be undone.</p>
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
                {deleteBusy ? 'Deleting...' : 'Delete rule'}
              </Button>
            </footer>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
