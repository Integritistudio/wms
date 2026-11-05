import { useId, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Alert, Button, FormField } from '../ui'
import {
  createRoutingRule,
  updateRoutingRule,
  type RoutingCondition,
  type RoutingField,
  type RoutingOperator,
  type RoutingRule,
} from '../../lib/api'

export default function RoutingRuleEditor({
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
            <span>All items must be available at the target warehouse. Leave off for backorder routing. Use the continue-selling SKU condition to route a specific out-of-stock product.</span>
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

