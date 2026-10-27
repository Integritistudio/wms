import BrandLoader from '../BrandLoader'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  Pause,
  RefreshCw,
  Search,
  Store,
  Warehouse as WarehouseIcon,
} from 'lucide-react'
import {
  addCompanyWarehouse,
  deleteWarehouseTemplate,
  getWarehouseModernwmsConfig,
  getWarehouseTemplate,
  saveWarehouseModernwmsConfig,
  saveWarehouseTemplate,
  syncStoreInventory,
  syncWarehouseModernwmsInventory,
  testWarehouseModernwmsConnection,
  updateCompanyWarehouse,
  type ConditionGroup,
  type ConditionRule,
  type ConditionalValue,
  type OperatorOption,
  type Shop,
  type SftpConnection,
  type TemplateField,
  type Warehouse,
  type WarehouseModernwmsConfig,
} from '../../lib/api'
import { Button, CountryStateSelect, FormField, Modal, StatusBadge, ZipPostalField } from '../ui'
import { useCompanyPortal } from './CompanyPortalContext'
import WarehouseInventoryEditor from './WarehouseInventoryEditor'
import CompanyStoresPanel, { getStoreStatusKey, storeLinkedIds } from './CompanyStoresPanel'

function ConditionRuleEditor({ rule, paths, operators, onChange, onRemove }: {
  rule: ConditionRule
  paths: string[]
  operators: OperatorOption[]
  onChange: (r: ConditionRule) => void
  onRemove: () => void
}) {
  const needsValue = !['is_empty', 'is_not_empty'].includes(rule.operator)
  return (
    <div className="wh-cond-row">
      <select className="demo-input demo-input-w-lg" value={rule.field} onChange={(e) => onChange({ ...rule, field: e.target.value })}>
        <option value="">Select field</option>
        {paths.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className="demo-input demo-input-w-md" value={rule.operator} onChange={(e) => onChange({ ...rule, operator: e.target.value })}>
        {operators.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
      </select>
      {needsValue && (
        <input className="demo-input demo-input-w-sm" value={rule.value} onChange={(e) => onChange({ ...rule, value: e.target.value })} placeholder="value" />
      )}
      <button type="button" className="demo-btn demo-btn-sm" onClick={onRemove}>×</button>
    </div>
  )
}

function ConditionGroupEditor({ group, paths, operators, onChange, label }: {
  group: ConditionGroup
  paths: string[]
  operators: OperatorOption[]
  onChange: (g: ConditionGroup) => void
  label: string
}) {
  function addCondition() {
    onChange({ ...group, conditions: [...group.conditions, { field: paths[0] || '', operator: 'equals', value: '' }] })
  }
  function updateCondition(idx: number, rule: ConditionRule) {
    onChange({ ...group, conditions: group.conditions.map((c, i) => i === idx ? rule : c) })
  }
  function removeCondition(idx: number) {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) })
  }

  return (
    <div className="wh-cond-group">
      <div className="ui-inline-actions mb-1">
        <span className="wh-cond-label">{label}</span>
        <select className="demo-input demo-input-w-logic" value={group.logic} onChange={(e) => onChange({ ...group, logic: e.target.value as 'and' | 'or' })}>
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
      </div>
      <div className="ui-stack-sm">
        {group.conditions.map((rule, idx) => (
          <ConditionRuleEditor key={idx} rule={rule} paths={paths} operators={operators} onChange={(r) => updateCondition(idx, r)} onRemove={() => removeCondition(idx)} />
        ))}
      </div>
      <button type="button" className="demo-btn demo-btn-sm mt-1" onClick={addCondition}>+ Add condition</button>
    </div>
  )
}

export function TemplateEditor({ warehouseId, onClose }: { warehouseId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [format, setFormat] = useState<'x12' | 'csv'>('csv')
  const [csvDelimiter, setCsvDelimiter] = useState(',')
  const [csvHeaders, setCsvHeaders] = useState(true)
  const [fields, setFields] = useState<TemplateField[]>([])
  const [x12Config, setX12Config] = useState({ senderId: 'WMSLINKER', receiverId: 'WAREHOUSE', version: '004010' })
  const [paths, setPaths] = useState<string[]>([])
  const [operators, setOperators] = useState<OperatorOption[]>([])
  const [saving, setSaving] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  useEffect(() => {
    getWarehouseTemplate(warehouseId).then(({ template, shopifyPaths, operators: ops }) => {
      setPaths(shopifyPaths)
      setOperators(ops)
      if (template) {
        setFormat(template.format)
        setCsvDelimiter(template.csvDelimiter)
        setCsvHeaders(template.csvHeaders)
        setFields(template.fields)
        setX12Config(template.x12Config)
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [warehouseId])

  function addField() {
    setFields([...fields, { position: fields.length + 1, outputLabel: '', source: 'shopify', shopifyPath: paths[0] || '', staticValue: '', includeCondition: null, conditionalValues: [], fallbackValue: '' }])
  }

  function updateField(idx: number, patch: Partial<TemplateField>) {
    setFields(fields.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  function removeField(idx: number) {
    setFields(fields.filter((_, i) => i !== idx))
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  function addConditionalValue(idx: number) {
    const field = fields[idx]
    const cvs = [...(field.conditionalValues || []), { when: { logic: 'and' as const, conditions: [] }, then: '' }]
    updateField(idx, { conditionalValues: cvs })
  }

  function updateConditionalValue(fieldIdx: number, cvIdx: number, patch: Partial<ConditionalValue>) {
    const field = fields[fieldIdx]
    const cvs = (field.conditionalValues || []).map((cv, i) => i === cvIdx ? { ...cv, ...patch } : cv)
    updateField(fieldIdx, { conditionalValues: cvs })
  }

  function removeConditionalValue(fieldIdx: number, cvIdx: number) {
    const field = fields[fieldIdx]
    updateField(fieldIdx, { conditionalValues: (field.conditionalValues || []).filter((_, i) => i !== cvIdx) })
  }

  async function save() {
    setSaving(true)
    try {
      await saveWarehouseTemplate(warehouseId, { format, csvDelimiter, csvHeaders, fields, x12Config })
      onClose()
    } catch { /* ignore */ }
    setSaving(false)
  }

  async function reset() {
    await deleteWarehouseTemplate(warehouseId)
    onClose()
  }

  if (loading) return <BrandLoader compact label="Loading template..." />

  return (
    <div className="wh-template ui-stack">
      <div className="wh-template-toolbar">
        <label className="demo-label mb-0">Format</label>
        <select className="demo-input demo-input-fit" value={format} onChange={(e) => setFormat(e.target.value as 'x12' | 'csv')}>
          <option value="csv">CSV</option>
          <option value="x12">X12 EDI</option>
        </select>
        {format === 'csv' && (
          <>
            <label className="demo-label mb-0">Delimiter</label>
            <input className="demo-input demo-input-w-xs" value={csvDelimiter} onChange={(e) => setCsvDelimiter(e.target.value)} />
            <label className="ui-checkbox-row py-1 px-2">
              <input type="checkbox" checked={csvHeaders} onChange={(e) => setCsvHeaders(e.target.checked)} />
              <span>Headers</span>
            </label>
          </>
        )}
        {format === 'x12' && (
          <>
            <input className="demo-input demo-input-w-sm" placeholder="Sender ID" value={x12Config.senderId} onChange={(e) => setX12Config({ ...x12Config, senderId: e.target.value })} />
            <input className="demo-input demo-input-w-sm" placeholder="Receiver ID" value={x12Config.receiverId} onChange={(e) => setX12Config({ ...x12Config, receiverId: e.target.value })} />
          </>
        )}
      </div>

      {fields.map((field, idx) => (
        <div key={idx} className="wh-template-field">
          <div className="ui-inline-actions">
            <input className="demo-input demo-input-w-xs" type="number" value={field.position} onChange={(e) => updateField(idx, { position: Number(e.target.value) })} title="Position" />
            <input className="demo-input demo-input-w-md" value={field.outputLabel} onChange={(e) => updateField(idx, { outputLabel: e.target.value })} placeholder="Column name" />
            <select className="demo-input demo-input-w-lg" value={field.source} onChange={(e) => updateField(idx, { source: e.target.value as 'shopify' | 'static' | 'conditional' })}>
              <option value="shopify">Shopify field</option>
              <option value="static">Static value</option>
              <option value="conditional">Conditional (if/else)</option>
            </select>
            {field.source === 'shopify' && (
              <select className="demo-input demo-input-w-xl" value={field.shopifyPath} onChange={(e) => updateField(idx, { shopifyPath: e.target.value })}>
                {paths.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {field.source === 'static' && (
              <input className="demo-input demo-input-w-lg" value={field.staticValue} onChange={(e) => updateField(idx, { staticValue: e.target.value })} placeholder="Fixed value" />
            )}
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)} title="Show/hide conditions">
              {expandedIdx === idx ? 'Hide' : 'Show'} rules
            </button>
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => removeField(idx)} title="Remove field">×</button>
          </div>

          {expandedIdx === idx && (
            <div className="wh-template-rules ui-stack-sm">
              <div className="ui-stack-sm">
                <div className="ui-inline-actions">
                  <span className="wh-cond-label">Only include this field when:</span>
                  {!field.includeCondition?.conditions?.length && (
                    <button type="button" className="demo-btn demo-btn-sm" onClick={() => updateField(idx, { includeCondition: { logic: 'and', conditions: [{ field: paths[0] || '', operator: 'equals', value: '' }] } })}>
                      + Add include rule
                    </button>
                  )}
                  {(field.includeCondition?.conditions?.length ?? 0) > 0 && (
                    <button type="button" className="demo-btn demo-btn-sm" onClick={() => updateField(idx, { includeCondition: null })}>
                      Clear (always include)
                    </button>
                  )}
                </div>
                {field.includeCondition && field.includeCondition.conditions.length > 0 && (
                  <ConditionGroupEditor
                    group={field.includeCondition}
                    paths={paths}
                    operators={operators}
                    onChange={(g) => updateField(idx, { includeCondition: g })}
                    label="Include when"
                  />
                )}
              </div>

              {field.source === 'conditional' && (
                <div className="ui-stack-sm">
                  <span className="wh-cond-label">Value rules (first match wins):</span>
                  {(field.conditionalValues || []).map((cv, cvIdx) => (
                    <div key={cvIdx} className="wh-template-cv">
                      <div className="ui-inline-actions mb-1">
                        <span className="wh-cond-label">IF:</span>
                        <button type="button" className="demo-btn demo-btn-sm ml-auto" onClick={() => removeConditionalValue(idx, cvIdx)}>Remove rule</button>
                      </div>
                      <ConditionGroupEditor
                        group={cv.when}
                        paths={paths}
                        operators={operators}
                        onChange={(g) => updateConditionalValue(idx, cvIdx, { when: g })}
                        label={`Rule ${cvIdx + 1}`}
                      />
                      <div className="ui-inline-actions mt-1">
                        <span className="wh-cond-label">THEN value:</span>
                        <input className="demo-input demo-input-w-xl" value={cv.then} onChange={(e) => updateConditionalValue(idx, cvIdx, { then: e.target.value })} placeholder="Output value" />
                      </div>
                    </div>
                  ))}
                  <button type="button" className="demo-btn demo-btn-sm" onClick={() => addConditionalValue(idx)}>+ Add IF rule</button>
                  <div className="ui-inline-actions">
                    <span className="wh-cond-label">ELSE (fallback):</span>
                    <input className="demo-input demo-input-w-xl" value={field.fallbackValue || ''} onChange={(e) => updateField(idx, { fallbackValue: e.target.value })} placeholder="Default value" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="ui-inline-actions">
        <Button variant="secondary" onClick={addField}>+ Add field</Button>
        <Button disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save template'}</Button>
        <Button variant="secondary" onClick={reset}>Reset to default</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

function ModernWmsConfigEditor({
  warehouse,
  onClose,
  onError,
  onSaved,
  onNotice,
}: {
  warehouse: Warehouse
  onClose: () => void
  onError: (msg: string) => void
  onSaved: () => void
  onNotice: (msg: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testOk, setTestOk] = useState<string | null>(null)
  const [fulfillmentMode, setFulfillmentMode] = useState<'modernwms' | 'sftp_edi'>(warehouse.fulfillmentMode || 'sftp_edi')
  const [config, setConfig] = useState<WarehouseModernwmsConfig>({
    baseUrl: warehouse.modernwms?.baseUrl || 'https://wms-sys.integritistudio.us',
    username: warehouse.modernwms?.username || 'admin',
    passwordSet: Boolean(warehouse.modernwms?.passwordSet),
    tenantId: warehouse.modernwms?.tenantId ?? null,
    goodsOwnerId: warehouse.modernwms?.goodsOwnerId ?? null,
    defaultCustomerId: warehouse.modernwms?.defaultCustomerId ?? null,
    autoConfirmOrder: Boolean(warehouse.modernwms?.autoConfirmOrder),
  })
  const [password, setPassword] = useState('')

  useEffect(() => {
    getWarehouseModernwmsConfig(warehouse.id)
      .then((data) => {
        setFulfillmentMode(data.fulfillmentMode)
        setConfig({
          ...data.modernwms,
          baseUrl: data.modernwms.baseUrl || 'https://wms-sys.integritistudio.us',
          username: data.modernwms.username || 'admin',
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [warehouse.id])

  async function save() {
    setSaving(true)
    try {
      await saveWarehouseModernwmsConfig(warehouse.id, {
        fulfillmentMode,
        baseUrl: config.baseUrl,
        username: config.username,
        password: password || undefined,
        tenantId: config.tenantId,
        goodsOwnerId: config.goodsOwnerId,
        defaultCustomerId: config.defaultCustomerId,
        autoConfirmOrder: config.autoConfirmOrder,
      })
      setPassword('')
      onSaved()
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save ModernWMS config')
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    setTesting(true)
    setTestOk(null)
    try {
      if (!config.baseUrl.trim() || !config.username.trim()) {
        throw new Error('Base URL and username are required')
      }
      if (!password && !config.passwordSet) {
        throw new Error('Enter the ModernWMS password before testing')
      }

      const inlineCreds = password
        ? { baseUrl: config.baseUrl.trim(), username: config.username.trim(), password }
        : undefined

      const result = await testWarehouseModernwmsConnection(warehouse.id, inlineCreds)
      const msg = `Connected to ModernWMS${result.tenantId != null ? ` (tenant ${result.tenantId})` : ''}${result.message ? `: ${result.message}` : ''}`
      setTestOk(msg)
      onNotice(msg)
      onError('')

      // Persist credentials after a successful test so future calls work without re-entering password.
      await saveWarehouseModernwmsConfig(warehouse.id, {
        fulfillmentMode: 'modernwms',
        baseUrl: config.baseUrl.trim(),
        username: config.username.trim(),
        password: password || undefined,
        tenantId: result.tenantId ?? config.tenantId,
        goodsOwnerId: config.goodsOwnerId,
        defaultCustomerId: config.defaultCustomerId,
        autoConfirmOrder: config.autoConfirmOrder,
      })
      setPassword('')
      setConfig((prev) => ({ ...prev, passwordSet: true, tenantId: result.tenantId ?? prev.tenantId }))
      onSaved()
    } catch (err) {
      setTestOk(null)
      onError(err instanceof Error ? err.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  async function syncInventory() {
    setSyncing(true)
    try {
      const result = await syncWarehouseModernwmsInventory(warehouse.id)
      alert(`Synced ${result.synced} SKU(s) from ModernWMS`)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Inventory sync failed')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <BrandLoader compact label="Loading ModernWMS settings..." />

  const uiUrl = config.baseUrl ? config.baseUrl.replace(/\/+$/, '') : ''
  const credsReady = config.passwordSet || Boolean(password.trim())

  return (
    <div className="wh-config">
      <div className="wh-config-hero">
        <div className="wh-config-hero-copy">
          <h3 className="wh-config-title">ModernWMS connection</h3>
          <p className="wh-config-desc">
            Push outbound dispatches to ModernWMS and poll delivery status. Pick and ship in the ModernWMS UI.
          </p>
        </div>
        <div className="wh-config-hero-actions">
          <StatusBadge
            status={fulfillmentMode === 'modernwms' ? 'warehouse' : 'skipped'}
            label={fulfillmentMode === 'modernwms' ? 'Active route' : 'SFTP mode'}
            variant={fulfillmentMode === 'modernwms' ? 'success' : 'neutral'}
          />
          {uiUrl ? (
            <a href={uiUrl} target="_blank" rel="noreferrer" className="wh-link-btn">
              Open ModernWMS ↗
            </a>
          ) : null}
        </div>
      </div>

      {testOk ? <div className="wh-config-alert is-success">{testOk}</div> : null}

      <div className="wh-config-grid">
        <section className="wh-config-block">
          <h4 className="wh-config-block-title">Fulfillment</h4>
          <FormField label="Mode">
            <select
              className="demo-input"
              value={fulfillmentMode}
              onChange={(e) => setFulfillmentMode(e.target.value as 'modernwms' | 'sftp_edi')}
            >
              <option value="sftp_edi">SFTP / EDI (legacy)</option>
              <option value="modernwms">ModernWMS (REST)</option>
            </select>
          </FormField>
        </section>

        <section className="wh-config-block">
          <h4 className="wh-config-block-title">API credentials</h4>
          <div className="wh-config-fields">
            <FormField label="Base URL">
              <input
                className="demo-input"
                value={config.baseUrl}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                placeholder="https://wms-sys.integritistudio.us"
              />
            </FormField>
            <FormField label="Username">
              <input
                className="demo-input"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                autoComplete="username"
              />
            </FormField>
            <FormField
              label="Password"
              hint={config.passwordSet ? 'Leave blank to keep the saved password.' : 'Required before the first connection test.'}
            >
              <input
                className="demo-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={config.passwordSet ? 'Unchanged' : 'Enter password'}
                autoComplete="current-password"
              />
            </FormField>
          </div>
        </section>

        <section className="wh-config-block">
          <h4 className="wh-config-block-title">Integration IDs</h4>
          <p className="wh-config-block-desc">Must match records in ModernWMS (customer, goods owner, tenant).</p>
          <div className="wh-config-fields wh-config-fields-3">
            <FormField label="Default customer ID">
              <input
                className="demo-input"
                type="number"
                value={config.defaultCustomerId ?? ''}
                onChange={(e) => setConfig({ ...config, defaultCustomerId: e.target.value ? Number(e.target.value) : null })}
              />
            </FormField>
            <FormField label="Goods owner ID">
              <input
                className="demo-input"
                type="number"
                value={config.goodsOwnerId ?? ''}
                onChange={(e) => setConfig({ ...config, goodsOwnerId: e.target.value ? Number(e.target.value) : null })}
              />
            </FormField>
            <FormField label="Tenant ID">
              <input
                className="demo-input"
                type="number"
                value={config.tenantId ?? ''}
                onChange={(e) => setConfig({ ...config, tenantId: e.target.value ? Number(e.target.value) : null })}
              />
            </FormField>
          </div>
        </section>

        <section className="wh-config-block">
          <h4 className="wh-config-block-title">Dispatch behavior</h4>
          <label className="wh-check-row">
            <input
              type="checkbox"
              checked={config.autoConfirmOrder}
              onChange={(e) => setConfig({ ...config, autoConfirmOrder: e.target.checked })}
            />
            <span>
              <strong>Auto-confirm in ModernWMS</strong>
              <span className="wh-check-hint">Allocate stock immediately after push. Leave off to confirm in the MWMS UI.</span>
            </span>
          </label>
        </section>
      </div>

      <div className="wh-config-footer">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
        <Button
          variant="secondary"
          disabled={testing || !credsReady}
          onClick={() => void testConnection()}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
        <Button
          variant="secondary"
          disabled={syncing || fulfillmentMode !== 'modernwms'}
          onClick={() => void syncInventory()}
        >
          {syncing ? 'Syncing…' : 'Sync inventory'}
        </Button>
      </div>
    </div>
  )
}

export type WarehouseDetailTab = 'fulfillment' | 'modernwms' | 'products' | 'template'

function connectionLabel(connectionId: string | null, connections: { id: string; name: string; enabled: boolean }[]) {
  if (!connectionId) return 'No SFTP'
  const match = connections.find((c) => c.id === connectionId)
  if (!match) return 'Unknown connection'
  return match.enabled ? match.name : `${match.name} (off)`
}

type WhConnTone = 'ok' | 'warn' | 'bad'

function warehouseConnection(
  warehouse: Warehouse,
  connections: SftpConnection[],
): { tone: WhConnTone; title: string; detail: string; kind: 'ok' | 'needs_setup' | 'sftp_off' } {
  const mode = warehouse.fulfillmentMode || 'sftp_edi'
  if (mode === 'modernwms') {
    if (warehouse.modernwms?.passwordSet) {
      return { tone: 'ok', title: 'ModernWMS', detail: 'Configured', kind: 'ok' }
    }
    return { tone: 'bad', title: 'Not configured', detail: 'No ModernWMS credentials set', kind: 'needs_setup' }
  }
  if (!warehouse.sftpConnectionId) {
    return { tone: 'bad', title: 'Not configured', detail: 'No SFTP or ModernWMS set', kind: 'needs_setup' }
  }
  const match = connections.find((c) => c.id === warehouse.sftpConnectionId)
  if (!match) {
    return { tone: 'bad', title: 'Not configured', detail: 'Linked SFTP connection missing', kind: 'needs_setup' }
  }
  if (!match.enabled) {
    return { tone: 'warn', title: 'SFTP is off', detail: match.name, kind: 'sftp_off' }
  }
  return { tone: 'ok', title: 'SFTP', detail: match.name, kind: 'ok' }
}

function shortLocation(warehouse: Warehouse) {
  const raw = warehouse.geoPlaceName || warehouse.address || ''
  if (!raw) return '—'
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 3) return parts.slice(-3).join(', ')
  return raw
}

export function WarehouseDetailPanel({
  warehouse,
  connections,
  activeTab,
  onTabChange,
  onClose,
  onError,
  onNotice,
  onSaved,
}: {
  warehouse: Warehouse
  connections: { id: string; name: string; enabled: boolean }[]
  activeTab: WarehouseDetailTab
  onTabChange: (tab: WarehouseDetailTab) => void
  onClose: () => void
  onError: (msg: string) => void
  onNotice: (msg: string) => void
  onSaved: () => void
}) {
  const [fulfillmentMode, setFulfillmentMode] = useState<'modernwms' | 'sftp_edi'>(warehouse.fulfillmentMode || 'sftp_edi')
  const [sftpConnectionId, setSftpConnectionId] = useState(warehouse.sftpConnectionId || '')
  const [savingFulfillment, setSavingFulfillment] = useState(false)

  useEffect(() => {
    setFulfillmentMode(warehouse.fulfillmentMode || 'sftp_edi')
    setSftpConnectionId(warehouse.sftpConnectionId || '')
  }, [warehouse])

  async function saveFulfillment(event: FormEvent) {
    event.preventDefault()
    setSavingFulfillment(true)
    try {
      await updateCompanyWarehouse(warehouse.id, {
        fulfillmentMode,
        sftpConnectionId: sftpConnectionId || null,
      })
      onNotice(`${warehouse.name} fulfillment updated.`)
      onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update warehouse')
    } finally {
      setSavingFulfillment(false)
    }
  }

  const mode = fulfillmentMode === 'modernwms' ? 'ModernWMS' : 'SFTP / EDI'
  const mwmsReady = Boolean(warehouse.modernwms?.passwordSet)
  const sftpLabel = connectionLabel(warehouse.sftpConnectionId || sftpConnectionId || null, connections)
  const locationBits = [warehouse.address, warehouse.geoPlaceName].filter(Boolean)
  const tabs = [
    { id: 'fulfillment' as const, label: 'Fulfillment', icon: 'route', hint: 'Route & SFTP' },
    { id: 'modernwms' as const, label: 'ModernWMS', icon: 'cloud_sync', hint: 'API link' },
    { id: 'products' as const, label: 'Products', icon: 'inventory_2', hint: 'Stock map' },
    { id: 'template' as const, label: '940 template', icon: 'description', hint: 'EDI layout' },
  ]

  return (
    <div className="wh-detail wh-detail-v2">
      <header className="wh-detail-hero">
        <div className="wh-detail-hero-main">
          <nav className="wh-detail-crumb" aria-label="Breadcrumb">
            <button type="button" className="wh-detail-crumb-btn" onClick={onClose}>
              <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
              Warehouses
            </button>
            <span className="wh-detail-crumb-sep" aria-hidden>/</span>
            <span className="wh-detail-crumb-here">{warehouse.code || warehouse.name}</span>
          </nav>

          <div className="wh-detail-title-row">
            <span className="wh-detail-mark" aria-hidden>
              <span className="material-symbols-outlined">warehouse</span>
            </span>
            <div className="wh-detail-title-copy">
              <p className="wh-detail-kicker">Warehouse detail</p>
              <h1>{warehouse.name}</h1>
              <p className="wh-detail-sub">
                {locationBits.length
                  ? locationBits.join(' · ')
                  : 'No address on file — add one from the warehouses list.'}
              </p>
            </div>
          </div>
        </div>

        <div className="wh-detail-hero-aside">
          <StatusBadge
            status={fulfillmentMode === 'modernwms' ? 'warehouse' : 'sftp_delivery'}
            label={mode}
            variant={fulfillmentMode === 'modernwms' ? 'success' : 'info'}
          />
          <button type="button" className="wh-detail-back-chip" onClick={onClose}>
            All warehouses
          </button>
        </div>
      </header>

      <section className="wh-detail-pulse" aria-label="Warehouse snapshot">
        <div>
          <span>Code</span>
          <strong>{warehouse.code || '—'}</strong>
        </div>
        <div>
          <span>Fulfillment</span>
          <strong>{mode}</strong>
        </div>
        <div>
          <span>SFTP</span>
          <strong className={!warehouse.sftpConnectionId ? 'is-miss' : 'is-ok'}>{sftpLabel}</strong>
        </div>
        <div>
          <span>ModernWMS</span>
          <strong className={mwmsReady ? 'is-ok' : 'is-miss'}>{mwmsReady ? 'Configured' : 'Not set'}</strong>
        </div>
        <div>
          <span>Priority</span>
          <strong>{warehouse.routingPriority ?? '—'}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong className={warehouse.isActive !== false ? 'is-ok' : 'is-miss'}>
            {warehouse.isActive === false ? 'Inactive' : 'Active'}
          </strong>
        </div>
      </section>

      <nav className="wh-detail-tabs" aria-label="Warehouse sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`wh-detail-tab${activeTab === t.id ? ' is-active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            <span className="material-symbols-outlined" aria-hidden>{t.icon}</span>
            <span className="wh-detail-tab-copy">
              <strong>{t.label}</strong>
              <small>{t.hint}</small>
            </span>
          </button>
        ))}
      </nav>

      <div className="wh-detail-layout">
        <div className="wh-detail-body">
          {activeTab === 'fulfillment' ? (
            <section className="wh-detail-card">
              <header className="wh-detail-card-head">
                <div>
                  <span>01 / ROUTE</span>
                  <h2>Fulfillment route</h2>
                </div>
                <span className="material-symbols-outlined" aria-hidden>route</span>
              </header>
              <p className="wh-detail-card-lead">
                Choose how this location receives work — ModernWMS REST push or classic SFTP / EDI 940 files.
              </p>
              <form className="wh-fulfillment-form" onSubmit={(e) => void saveFulfillment(e)}>
                <div className="wh-detail-form-grid">
                  <FormField label="Fulfillment mode">
                    <select
                      className="demo-input"
                      value={fulfillmentMode}
                      onChange={(e) => setFulfillmentMode(e.target.value as 'modernwms' | 'sftp_edi')}
                    >
                      <option value="sftp_edi">SFTP / EDI — send 940 files</option>
                      <option value="modernwms">ModernWMS — REST dispatch push</option>
                    </select>
                  </FormField>
                  <FormField label="SFTP connection">
                    <select
                      className="demo-input"
                      value={sftpConnectionId}
                      onChange={(e) => setSftpConnectionId(e.target.value)}
                    >
                      <option value="">None</option>
                      {connections.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.name}
                          {connection.enabled ? '' : ' (off)'}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="wh-config-footer">
                  <Button type="submit" disabled={savingFulfillment}>
                    {savingFulfillment ? 'Saving…' : 'Save fulfillment'}
                  </Button>
                </div>
              </form>
            </section>
          ) : null}

          {activeTab === 'modernwms' ? (
            <ModernWmsConfigEditor
              warehouse={warehouse}
              onClose={onClose}
              onError={onError}
              onNotice={onNotice}
              onSaved={onSaved}
            />
          ) : null}

          {activeTab === 'products' ? (
            <section className="wh-detail-card wh-detail-card--flush">
              <header className="wh-detail-card-head">
                <div>
                  <span>03 / STOCK</span>
                  <h2>Products & inventory</h2>
                </div>
                <span className="material-symbols-outlined" aria-hidden>inventory_2</span>
              </header>
              <WarehouseInventoryEditor warehouseId={warehouse.id} warehouseName={warehouse.name} onError={onError} />
            </section>
          ) : null}

          {activeTab === 'template' ? (
            <section className="wh-detail-card">
              <header className="wh-detail-card-head">
                <div>
                  <span>04 / EDI</span>
                  <h2>940 template</h2>
                </div>
                <span className="material-symbols-outlined" aria-hidden>description</span>
              </header>
              <TemplateEditor warehouseId={warehouse.id} onClose={() => onTabChange('fulfillment')} />
            </section>
          ) : null}
        </div>

        <aside className="wh-detail-rail" aria-label="Warehouse record">
          <section className="wh-detail-rail-card">
            <header>
              <span>RECORD</span>
              <h2>Identity</h2>
            </header>
            <dl>
              <div>
                <dt>Name</dt>
                <dd>{warehouse.name}</dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>{warehouse.code || '—'}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{warehouse.address || '—'}</dd>
              </div>
              <div>
                <dt>Place</dt>
                <dd>{warehouse.geoPlaceName || '—'}</dd>
              </div>
              <div>
                <dt>Coordinates</dt>
                <dd>
                  {warehouse.latitude != null && warehouse.longitude != null
                    ? `${warehouse.latitude.toFixed(4)}, ${warehouse.longitude.toFixed(4)}`
                    : '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="wh-detail-rail-card">
            <header>
              <span>OPS</span>
              <h2>Routing & stock</h2>
            </header>
            <dl>
              <div>
                <dt>ZIP prefixes</dt>
                <dd>{(warehouse.zipPrefixes || []).join(', ') || '—'}</dd>
              </div>
              <div>
                <dt>Min stock</dt>
                <dd>{warehouse.minStockThreshold ?? '—'}</dd>
              </div>
              <div>
                <dt>FEFO</dt>
                <dd>{warehouse.enforceFefo ? 'Enforced' : 'Off'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>
                  {warehouse.createdAt
                    ? new Date(warehouse.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="wh-detail-rail-card wh-detail-rail-card--tint">
            <header>
              <span>LINKS</span>
              <h2>Integrations</h2>
            </header>
            <ul className="wh-detail-link-list">
              <li>
                <span className="material-symbols-outlined" aria-hidden>swap_horiz</span>
                <div>
                  <strong>SFTP</strong>
                  <small>{sftpLabel}</small>
                </div>
              </li>
              <li>
                <span className="material-symbols-outlined" aria-hidden>cloud_sync</span>
                <div>
                  <strong>ModernWMS</strong>
                  <small>{mwmsReady ? warehouse.modernwms?.baseUrl || 'Ready' : 'Credentials needed'}</small>
                </div>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default function WarehousePanel() {
  const navigate = useNavigate()
  const { company, setError, refresh } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const connections = company?.sftpConnections || []
  const [stores, setStores] = useState<Shop[]>([])
  const [view, setView] = useState<'stores' | 'warehouses'>('warehouses')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'modernwms' | 'sftp' | 'needs_setup'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('US')
  const [address, setAddress] = useState('')
  const [sftpConnectionId, setSftpConnectionId] = useState('')
  const [attnBusy, setAttnBusy] = useState<string | null>(null)

  const storeCountByWh = useMemo(() => {
    const map = new Map<string, number>()
    for (const shop of stores) {
      for (const id of storeLinkedIds(shop)) {
        map.set(id, (map.get(id) || 0) + 1)
      }
    }
    return map
  }, [stores])

  const counts = useMemo(() => {
    let mwms = 0
    let sftp = 0
    let needsSetup = 0
    for (const w of warehouses) {
      const mode = w.fulfillmentMode || 'sftp_edi'
      if (mode === 'modernwms') mwms += 1
      else sftp += 1
      const conn = warehouseConnection(w, connections)
      if (conn.kind !== 'ok') needsSetup += 1
    }
    return { total: warehouses.length, mwms, sftp, needsSetup }
  }, [warehouses, connections])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...warehouses]
      .filter((w) => {
        const mode = w.fulfillmentMode || 'sftp_edi'
        const conn = warehouseConnection(w, connections)
        if (filter === 'modernwms' && mode !== 'modernwms') return false
        if (filter === 'sftp' && mode === 'modernwms') return false
        if (filter === 'needs_setup' && conn.kind === 'ok') return false
        if (!term) return true
        return (
          w.name.toLowerCase().includes(term) ||
          (w.code || '').toLowerCase().includes(term) ||
          (w.address || '').toLowerCase().includes(term)
        )
      })
      .sort((a, b) => {
        const ca = warehouseConnection(a, connections)
        const cb = warehouseConnection(b, connections)
        const ra = ca.kind === 'needs_setup' ? 0 : ca.kind === 'sftp_off' ? 1 : 2
        const rb = cb.kind === 'needs_setup' ? 0 : cb.kind === 'sftp_off' ? 1 : 2
        if (ra !== rb) return ra - rb
        return a.name.localeCompare(b.name)
      })
  }, [warehouses, q, filter, connections])

  function openWarehouse(id: string, tab: WarehouseDetailTab = 'fulfillment') {
    void navigate({
      to: '/account/warehouses/$warehouseId',
      params: { warehouseId: id },
      search: tab === 'fulfillment' ? {} : { tab },
    })
  }

  const attention = useMemo(() => {
    type Attn = {
      id: string
      severity: 'red' | 'amber'
      kind: 'Store' | 'Warehouse'
      title: string
      detail: string
      warehouseId?: string
      shopId?: string
      reconnectHref?: string
      action: 'configure' | 'review_sftp' | 'sync'
    }
    const rows: Attn[] = []
    for (const shop of stores) {
      if (getStoreStatusKey(shop) !== 'sync_issue') continue
      rows.push({
        id: `store-${shop.id}`,
        severity: 'red',
        kind: 'Store',
        title: `${shop.shopDomain} has a sync issue`,
        detail: shop.inventorySyncError
          ? `“${shop.inventorySyncError}”${shop.inventorySyncedAt ? ` Last sync ${new Date(shop.inventorySyncedAt).toLocaleString()}.` : ''}`
          : 'Inventory sync failed for this store.',
        shopId: shop.id,
        reconnectHref: shop.reconnectUrl || shop.installUrl || undefined,
        action: 'sync',
      })
    }
    for (const w of warehouses) {
      const conn = warehouseConnection(w, connections)
      const linked = storeCountByWh.get(w.id) || 0
      if (conn.kind === 'needs_setup') {
        rows.push({
          id: `wh-setup-${w.id}`,
          severity: 'amber',
          kind: 'Warehouse',
          title: `${w.name} has no connection set up`,
          detail: `Neither SFTP/EDI nor ModernWMS is configured, so orders can’t be sent to this location.${linked ? ` It is linked to ${linked} store${linked === 1 ? '' : 's'}.` : ''}`,
          warehouseId: w.id,
          action: 'configure',
        })
      } else if (conn.kind === 'sftp_off') {
        rows.push({
          id: `wh-sftp-${w.id}`,
          severity: 'amber',
          kind: 'Warehouse',
          title: `${w.name} has SFTP switched off`,
          detail: `The SFTP connection “${conn.detail}” exists but is turned off.`,
          warehouseId: w.id,
          action: 'review_sftp',
        })
      }
    }
    return rows.slice(0, 8)
  }, [stores, warehouses, connections, storeCountByWh])

  function resetForm() {
    setName('')
    setCode('')
    setStreet('')
    setCity('')
    setState('')
    setZip('')
    setCountry('US')
    setAddress('')
    setSftpConnectionId('')
  }

  function openEdit(warehouse: Warehouse) {
    setEditing(warehouse)
    setName(warehouse.name || '')
    setCode(warehouse.code || '')
    setAddress(warehouse.address || '')
    setSftpConnectionId(warehouse.sftpConnectionId || '')
    setZip((warehouse.zipPrefixes || []).join(', '))
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await addCompanyWarehouse({
        name,
        code,
        street,
        city,
        state,
        zip,
        country,
        zipPrefixes: zip,
        sftpConnectionId: sftpConnectionId || undefined,
      })
      resetForm()
      setAddOpen(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add warehouse')
    } finally {
      setSaving(false)
    }
  }

  async function onSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || saving) return
    setSaving(true)
    try {
      await updateCompanyWarehouse(editing.id, {
        name,
        code,
        address,
        zipPrefixes: zip,
        sftpConnectionId: sftpConnectionId || null,
        geocode: true,
      })
      setEditing(null)
      resetForm()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update warehouse')
    } finally {
      setSaving(false)
    }
  }

  const storeIssueCount = useMemo(
    () => stores.filter((s) => getStoreStatusKey(s) === 'sync_issue').length,
    [stores],
  )
  const linkedWarehouseCount = useMemo(() => {
    let n = 0
    for (const w of warehouses) {
      if ((storeCountByWh.get(w.id) || 0) > 0) n += 1
    }
    return n
  }, [warehouses, storeCountByWh])

  return (
    <div className="oj-page oj-skel wh-page stores-wh-page sw-page analytics-anime">
      <header className="analytics-anime-hero stores-wh-hero" aria-label="Stores and warehouses overview">
        <div className="sw-hero-top">
          <div className="analytics-anime-hero-copy">
            <div className="analytics-anime-crumb">
              <WarehouseIcon size={14} strokeWidth={2} aria-hidden />
              <span>Company</span>
              <span>/</span>
              <strong>Stores &amp; Warehouses</strong>
            </div>
            <div className="analytics-anime-title-row">
              <h1>
                Stores in.
                <em> Warehouses out.</em>
              </h1>

            </div>
            <p>
              Manage store connections and fulfillment locations in one place.
            </p>
          </div>

        </div>

        <div className="sw-metric-strip" role="group" aria-label="Network snapshot">
          <div className="sw-metric">
            <span className="sw-metric-icon tone-blue" aria-hidden>
              <Store size={16} strokeWidth={2.2} />
            </span>
            <div className="sw-metric-copy">
              <strong>{stores.length}</strong>
              <span>Stores</span>
              {storeIssueCount > 0 ? (
                <small className="is-warn">{storeIssueCount} sync issue{storeIssueCount === 1 ? '' : 's'}</small>
              ) : (
                <small>Shopify connections</small>
              )}
            </div>
          </div>
          <div className="sw-metric">
            <span className="sw-metric-icon tone-green" aria-hidden>
              <WarehouseIcon size={16} strokeWidth={2.2} />
            </span>
            <div className="sw-metric-copy">
              <strong>{counts.total}</strong>
              <span>Warehouses</span>
              <small>{linkedWarehouseCount} linked</small>
            </div>
          </div>
          <div className={`sw-metric${counts.needsSetup ? ' is-warn' : ''}`}>
            <span className="sw-metric-icon tone-amber" aria-hidden>
              <Pause size={16} strokeWidth={2.2} />
            </span>
            <div className="sw-metric-copy">
              <strong>{counts.needsSetup}</strong>
              <span>Needs setup</span>
              <small>{counts.mwms} MWMS &middot; {counts.sftp} SFTP</small>
            </div>
          </div>
        </div>
      </header>

      {attention.length ? (
        <details className="sw-attn">
          <summary className="sw-attn-lead">
            <span className="sw-attn-icon" aria-hidden>
              <AlertTriangle size={16} strokeWidth={2.2} />
            </span>
            <div>
              <div className="sw-attn-tags">
                <span className="sw-attn-tag">Needs attention</span>
                <span className="sw-attn-n">{attention.length}</span>
              </div>
              <p>Connection and setup issues to review.</p>
            </div>
            <span className="sw-attn-toggle">Review issues</span>
          </summary>
          <ul className="sw-attn-list">
            {attention.map((item) => (
              <li key={item.id} className={`sw-attn-row is-${item.severity}`}>
                <div className="sw-attn-body">
                  <div className="sw-attn-title">
                    <span className="sw-kind">{item.kind}</span>
                    <b>{item.title}</b>
                  </div>
                  <div className="sw-attn-d">{item.detail}</div>
                </div>
                <div className="sw-attn-acts">
                  {item.reconnectHref ? (
                    <a className="sw-btn is-danger is-sm" href={item.reconnectHref} target="_blank" rel="noreferrer">
                      Reconnect app
                    </a>
                  ) : null}
                  {item.action === 'sync' && item.shopId ? (
                    <button
                      type="button"
                      className="sw-btn is-sm"
                      disabled={attnBusy === item.shopId}
                      onClick={() => {
                        void (async () => {
                          setAttnBusy(item.shopId!)
                          try {
                            await syncStoreInventory(item.shopId!)
                            await refresh()
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Unable to retry sync')
                          } finally {
                            setAttnBusy(null)
                          }
                        })()
                      }}
                    >
                      <RefreshCw size={14} aria-hidden />
                      {attnBusy === item.shopId ? 'Syncing…' : 'Sync inventory'}
                    </button>
                  ) : null}
                  {item.action === 'configure' && item.warehouseId ? (
                    <button
                      type="button"
                      className="sw-btn is-primary is-sm"
                      onClick={() => openWarehouse(item.warehouseId!, 'fulfillment')}
                    >
                      Configure
                    </button>
                  ) : null}
                  {item.action === 'review_sftp' && item.warehouseId ? (
                    <>
                      <button
                        type="button"
                        className="sw-btn is-primary is-sm"
                        onClick={() => openWarehouse(item.warehouseId!, 'fulfillment')}
                      >
                        Review SFTP
                      </button>
                      <Link to="/account/sftp" className="sw-btn is-sm">
                        SFTP page
                      </Link>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <nav className="sw-view-switch" aria-label="Network view">
        <button type="button" aria-pressed={view === 'warehouses'} onClick={() => setView('warehouses')}>
          <WarehouseIcon size={16} aria-hidden /> Warehouses <span>{counts.total}</span>
        </button>
        <button type="button" aria-pressed={view === 'stores'} onClick={() => setView('stores')}>
          <Store size={16} aria-hidden /> Stores <span>{stores.length}</span>
        </button>
      </nav>
      <div hidden={view !== 'stores'}>
        <CompanyStoresPanel onStoresChange={setStores} />
      </div>

      <section className="sw-section" aria-label="Warehouses" hidden={view !== 'warehouses'}>
        <div className="sw-section-head">
          <div className="sw-section-title">
            <h2>Warehouses</h2>
            <span className="sw-count">{counts.total}</span>
            <p>Manage locations, connections, and linked stores.</p>
          </div>
          <button type="button" className="sw-btn is-primary" onClick={() => setAddOpen(true)}>
            <WarehouseIcon size={14} aria-hidden />
            Add warehouse
          </button>
        </div>

        <div className="sw-toolbar">
          <div className="sw-tabs" role="tablist" aria-label="Warehouse filters">
            {(
              [
                ['all', 'All', counts.total],
                ['modernwms', 'ModernWMS', counts.mwms],
                ['sftp', 'SFTP / EDI', counts.sftp],
                ['needs_setup', 'Needs setup', counts.needsSetup],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={`sw-tab${filter === id ? ' is-on' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label} <em>{count}</em>
              </button>
            ))}
          </div>
          <label className="sw-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              value={q}
              aria-label="Search warehouses by name, code, or address"
              placeholder="Search name, code, or address"
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>

        {q || filter !== 'all' ? (
          <div className="sw-results" role="status">
            <span>{filtered.length} of {counts.total} warehouses</span>
            <button type="button" className="sw-search-clear" onClick={() => { setQ(''); setFilter('all') }}>Clear filters</button>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="sw-empty">
            <WarehouseIcon size={28} aria-hidden />
            <strong>{warehouses.length ? 'No warehouses match' : 'No warehouses'}</strong>
            <p>
              {warehouses.length
                ? 'Try another filter or clear search.'
                : 'Add a warehouse to start routing orders.'}
            </p>
            {!warehouses.length ? (
              <button type="button" className="sw-btn is-primary" onClick={() => setAddOpen(true)}>
                Add warehouse
              </button>
            ) : null}
          </div>
        ) : (
          <div className="sw-table-wrap">
            <table className="sw-table sw-table-wh">
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Warehouse</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Connection</th>
                  <th>Stores</th>
                  <th className="is-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((warehouse) => {
                  const mode = warehouse.fulfillmentMode || 'sftp_edi'
                  const isMwms = mode === 'modernwms'
                  const conn = warehouseConnection(warehouse, connections)
                  const active = warehouse.isActive !== false
                  const linked = storeCountByWh.get(warehouse.id) || 0
                  return (
                    <tr key={warehouse.id} className={conn.kind !== 'ok' ? 'is-issue' : undefined}>
                      <td>
                        <div className="sw-who">
                          <span className="sw-avatar is-wh" aria-hidden>
                            <WarehouseIcon size={16} />
                          </span>
                          <div className="sw-two">
                            <button
                              type="button"
                              className="sw-trunc sw-strong sw-name-btn"
                              onClick={() => openEdit(warehouse)}
                              title={`Edit ${warehouse.name}`}
                            >
                              {warehouse.name}
                            </button>
                            <span className="sw-sub">
                              <span className="sw-trunc2">{warehouse.code || 'No code'}</span>
                              {' · '}
                              <span className={active ? 'is-ok' : 'sw-muted'}>{active ? 'Active' : 'Inactive'}</span>
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="sw-muted">
                        <span className="sw-trunc" title={warehouse.address || warehouse.geoPlaceName || undefined}>
                          {shortLocation(warehouse)}
                        </span>
                      </td>
                      <td>
                        <span className={`sw-type ${isMwms ? 'is-green' : 'is-blue'}`}>
                          {isMwms ? 'ModernWMS' : 'SFTP / EDI'}
                        </span>
                      </td>
                      <td>
                        <div className="sw-conn">
                          <span className={`sw-dot is-${conn.tone}`} aria-hidden />
                          <div className="sw-two">
                            <span className="sw-strong">{conn.title}</span>
                            <span className="sw-sub">
                              <span className="sw-trunc2" title={conn.detail}>{conn.detail}</span>
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {linked > 0 ? (
                          <>
                            <span className="sw-strong">{linked}</span>{' '}
                            <span className="sw-muted">store{linked === 1 ? '' : 's'}</span>
                          </>
                        ) : (
                          <span className="sw-muted">Not linked</span>
                        )}
                      </td>
                      <td className="is-right">
                        {conn.kind === 'needs_setup' ? (
                          <button
                            type="button"
                            className="sw-btn is-primary is-sm"
                            onClick={() => openWarehouse(warehouse.id, 'fulfillment')}
                          >
                            Configure
                          </button>
                        ) : conn.kind === 'sftp_off' ? (
                          <button
                            type="button"
                            className="sw-btn is-primary is-sm"
                            onClick={() => openWarehouse(warehouse.id, 'fulfillment')}
                          >
                            Review SFTP
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="sw-btn is-outline is-sm"
                            onClick={() => openWarehouse(warehouse.id, 'fulfillment')}
                          >
                            Open
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={addOpen}
        onClose={() => {
          if (!saving) setAddOpen(false)
        }}
        title="Add warehouse"
        description="Create a location, then open it to configure fulfillment."
        className="users-dialog wh-add-dialog"
      >
        <form className="users-dialog-body" onSubmit={onCreate} aria-busy={saving}>
          <header className="users-dialog-hero">
            <div className="users-dialog-hero-icon" aria-hidden>
              <span className="material-symbols-outlined">warehouse</span>
            </div>
            <div>
              <h2>Add warehouse</h2>
              <p>Set the address and optional SFTP link. Configure ModernWMS after create.</p>
            </div>
          </header>

          <div className="users-dialog-grid">
            <FormField label="Name" required>
              <input
                className="demo-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Main DC"
              />
            </FormField>
            <FormField label="Code">
              <input
                className="demo-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="NYC-01"
              />
            </FormField>
            <FormField label="Street" required className="span-2">
              <input
                className="demo-input"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                required
                placeholder="123 Warehouse Rd"
              />
            </FormField>
            <FormField label="City" required>
              <input className="demo-input" value={city} onChange={(e) => setCity(e.target.value)} required />
            </FormField>
            <div className="span-2">
              <CountryStateSelect
                country={country}
                state={state}
                onCountryChange={setCountry}
                onStateChange={setState}
              />
            </div>
            <ZipPostalField country={country} state={state} value={zip} onChange={setZip} />
            <FormField label="Default SFTP connection" className="span-2">
              <select
                className="demo-input"
                value={sftpConnectionId}
                onChange={(e) => setSftpConnectionId(e.target.value)}
              >
                <option value="">None — assign later</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name}
                    {connection.enabled ? '' : ' (off)'}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <footer className="users-dialog-footer">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? 'Adding…' : 'Add warehouse'}
            </Button>
          </footer>
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => {
          if (!saving) {
            setEditing(null)
            resetForm()
          }
        }}
        title={editing ? `Edit ${editing.name}` : 'Edit warehouse'}
        description="Update warehouse details and SFTP link."
        className="users-dialog wh-add-dialog"
      >
        {editing ? (
          <form className="users-dialog-body" onSubmit={onSaveEdit} aria-busy={saving}>
            <header className="users-dialog-hero">
              <div className="users-dialog-hero-icon is-edit" aria-hidden>
                <span className="material-symbols-outlined">edit</span>
              </div>
              <div>
                <h2>Edit warehouse</h2>
                <p>{editing.code ? `Code ${editing.code}` : 'Update name, address, and routing link.'}</p>
              </div>
            </header>

            <div className="users-dialog-grid">
              <FormField label="Name" required>
                <input className="demo-input" value={name} onChange={(e) => setName(e.target.value)} required />
              </FormField>
              <FormField label="Code">
                <input className="demo-input" value={code} onChange={(e) => setCode(e.target.value)} />
              </FormField>
              <FormField label="Address" className="span-2">
                <textarea
                  className="demo-input"
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, city, state, ZIP, country"
                />
              </FormField>
              <FormField label="ZIP / postal prefixes" hint="Comma-separated" className="span-2">
                <input
                  className="demo-input"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="10001, 10002"
                />
              </FormField>
              <FormField label="Default SFTP connection" className="span-2">
                <select
                  className="demo-input"
                  value={sftpConnectionId}
                  onChange={(e) => setSftpConnectionId(e.target.value)}
                >
                  <option value="">None</option>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name}
                      {connection.enabled ? '' : ' (off)'}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <footer className="users-dialog-footer">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setEditing(null)
                  resetForm()
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving} aria-busy={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </footer>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
