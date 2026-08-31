import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  addCompanyWarehouse,
  deleteWarehouseTemplate,
  getWarehouseModernwmsConfig,
  getWarehouseTemplate,
  saveWarehouseModernwmsConfig,
  saveWarehouseTemplate,
  syncWarehouseModernwmsInventory,
  testWarehouseModernwmsConnection,
  updateCompanyWarehouse,
  type ConditionGroup,
  type ConditionRule,
  type ConditionalValue,
  type OperatorOption,
  type TemplateField,
  type Warehouse,
  type WarehouseModernwmsConfig,
} from '../../lib/api'
import { CountryStateSelect, DataTable, FormField, ListToolbar, PageHeader, PageSection, ZipPostalField } from '../ui'
import { useCompanyPortal } from './CompanyPortalContext'
import WarehouseInventoryEditor from './WarehouseInventoryEditor'

function ConditionRuleEditor({ rule, paths, operators, onChange, onRemove }: {
  rule: ConditionRule
  paths: string[]
  operators: OperatorOption[]
  onChange: (r: ConditionRule) => void
  onRemove: () => void
}) {
  const needsValue = !['is_empty', 'is_not_empty'].includes(rule.operator)
  return (
    <div className="flex items-center gap-1 mb-1" style={{ fontSize: '0.75rem' }}>
      <select className="demo-input" style={{ width: 140 }} value={rule.field} onChange={(e) => onChange({ ...rule, field: e.target.value })}>
        <option value="">Select field?</option>
        {paths.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className="demo-input" style={{ width: 120 }} value={rule.operator} onChange={(e) => onChange({ ...rule, operator: e.target.value })}>
        {operators.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
      </select>
      {needsValue && (
        <input className="demo-input" style={{ width: 100 }} value={rule.value} onChange={(e) => onChange({ ...rule, value: e.target.value })} placeholder="value" />
      )}
      <button type="button" className="demo-btn demo-btn-sm" onClick={onRemove}>x</button>
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
    <div style={{ background: 'var(--surface-alt, #f5f5f5)', borderRadius: 6, padding: '0.5rem', marginTop: '0.25rem' }}>
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{label}</span>
        <select className="demo-input" style={{ width: 60, fontSize: '0.7rem' }} value={group.logic} onChange={(e) => onChange({ ...group, logic: e.target.value as 'and' | 'or' })}>
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
      </div>
      {group.conditions.map((rule, idx) => (
        <ConditionRuleEditor key={idx} rule={rule} paths={paths} operators={operators} onChange={(r) => updateCondition(idx, r)} onRemove={() => removeCondition(idx)} />
      ))}
      <button type="button" className="demo-btn demo-btn-sm" onClick={addCondition} style={{ fontSize: '0.7rem' }}>+ Add condition</button>
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

  if (loading) return <p className="demo-muted">Loading template?</p>

  return (
    <div style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '1rem', marginTop: '0.5rem' }}>
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium">Format:</label>
        <select className="demo-input" value={format} onChange={(e) => setFormat(e.target.value as 'x12' | 'csv')}>
          <option value="csv">CSV</option>
          <option value="x12">X12 EDI</option>
        </select>
        {format === 'csv' && (
          <>
            <label className="text-sm">Delimiter:</label>
            <input className="demo-input" style={{ width: 40 }} value={csvDelimiter} onChange={(e) => setCsvDelimiter(e.target.value)} />
            <label className="text-sm"><input type="checkbox" checked={csvHeaders} onChange={(e) => setCsvHeaders(e.target.checked)} /> Headers</label>
          </>
        )}
        {format === 'x12' && (
          <>
            <input className="demo-input" style={{ width: 100 }} placeholder="Sender ID" value={x12Config.senderId} onChange={(e) => setX12Config({ ...x12Config, senderId: e.target.value })} />
            <input className="demo-input" style={{ width: 100 }} placeholder="Receiver ID" value={x12Config.receiverId} onChange={(e) => setX12Config({ ...x12Config, receiverId: e.target.value })} />
          </>
        )}
      </div>

      {fields.map((field, idx) => (
        <div key={idx} style={{ border: '1px solid var(--border, #e0e0e0)', borderRadius: 6, padding: '0.5rem', marginBottom: '0.5rem' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <input className="demo-input" type="number" style={{ width: 40 }} value={field.position} onChange={(e) => updateField(idx, { position: Number(e.target.value) })} title="Position" />
            <input className="demo-input" style={{ width: 120 }} value={field.outputLabel} onChange={(e) => updateField(idx, { outputLabel: e.target.value })} placeholder="Column name" />
            <select className="demo-input" style={{ width: 130 }} value={field.source} onChange={(e) => updateField(idx, { source: e.target.value as 'shopify' | 'static' | 'conditional' })}>
              <option value="shopify">Shopify field</option>
              <option value="static">Static value</option>
              <option value="conditional">Conditional (if/else)</option>
            </select>
            {field.source === 'shopify' && (
              <select className="demo-input" style={{ width: 160 }} value={field.shopifyPath} onChange={(e) => updateField(idx, { shopifyPath: e.target.value })}>
                {paths.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {field.source === 'static' && (
              <input className="demo-input" style={{ width: 140 }} value={field.staticValue} onChange={(e) => updateField(idx, { staticValue: e.target.value })} placeholder="Fixed value" />
            )}
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)} title="Show/hide conditions">
              {expandedIdx === idx ? '?' : '?'} Rules
            </button>
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => removeField(idx)} title="Remove field">?</button>
          </div>

          {expandedIdx === idx && (
            <div style={{ marginTop: '0.5rem', paddingLeft: '0.5rem', borderLeft: '3px solid var(--border, #ccc)' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Only include this field when:</span>
                  {!field.includeCondition?.conditions?.length && (
                    <button type="button" className="demo-btn demo-btn-sm" style={{ fontSize: '0.7rem' }} onClick={() => updateField(idx, { includeCondition: { logic: 'and', conditions: [{ field: paths[0] || '', operator: 'equals', value: '' }] } })}>
                      + Add include rule
                    </button>
                  )}
                  {(field.includeCondition?.conditions?.length ?? 0) > 0 && (
                    <button type="button" className="demo-btn demo-btn-sm" style={{ fontSize: '0.7rem' }} onClick={() => updateField(idx, { includeCondition: null })}>
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
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Value rules (first match wins):</span>
                  {(field.conditionalValues || []).map((cv, cvIdx) => (
                    <div key={cvIdx} style={{ marginTop: '0.25rem', padding: '0.4rem', background: 'var(--surface, #fff)', borderRadius: 4, border: '1px solid var(--border, #e8e8e8)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ fontSize: '0.7rem' }}>IF:</span>
                        <button type="button" className="demo-btn demo-btn-sm" onClick={() => removeConditionalValue(idx, cvIdx)} style={{ fontSize: '0.7rem', marginLeft: 'auto' }}>Remove rule</button>
                      </div>
                      <ConditionGroupEditor
                        group={cv.when}
                        paths={paths}
                        operators={operators}
                        onChange={(g) => updateConditionalValue(idx, cvIdx, { when: g })}
                        label={`Rule ${cvIdx + 1}`}
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <span style={{ fontSize: '0.7rem' }}>THEN value:</span>
                        <input className="demo-input" style={{ width: 160 }} value={cv.then} onChange={(e) => updateConditionalValue(idx, cvIdx, { then: e.target.value })} placeholder="Output value" />
                      </div>
                    </div>
                  ))}
                  <button type="button" className="demo-btn demo-btn-sm mt-1" onClick={() => addConditionalValue(idx)} style={{ fontSize: '0.7rem' }}>+ Add IF rule</button>
                  <div className="flex items-center gap-2 mt-2">
                    <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>ELSE (fallback):</span>
                    <input className="demo-input" style={{ width: 160 }} value={field.fallbackValue || ''} onChange={(e) => updateField(idx, { fallbackValue: e.target.value })} placeholder="Default value" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="mt-3 flex gap-2 flex-wrap">
        <button type="button" className="demo-button demo-button-secondary" onClick={addField}>+ Add field</button>
        <button type="button" className="demo-button" disabled={saving} onClick={save}>{saving ? 'Saving?' : 'Save template'}</button>
        <button type="button" className="demo-button demo-button-secondary" onClick={reset}>Reset to default</button>
        <button type="button" className="demo-button demo-button-secondary" onClick={onClose}>Cancel</button>
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

  if (loading) return <p className="demo-muted">Loading ModernWMS settings…</p>

  const uiUrl = config.baseUrl ? config.baseUrl.replace(/\/+$/, '') : ''

  return (
    <div style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '1rem', marginTop: '0.5rem' }}>
      <h4 className="order-flow-heading">ModernWMS connection</h4>
      <p className="demo-muted text-sm mb-3">
        Push outbound dispatches to ModernWMS and poll delivery status. Ops complete pick/ship in the ModernWMS UI.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Fulfillment mode">
          <select
            className="demo-input"
            value={fulfillmentMode}
            onChange={(e) => setFulfillmentMode(e.target.value as 'modernwms' | 'sftp_edi')}
          >
            <option value="sftp_edi">SFTP / EDI (legacy)</option>
            <option value="modernwms">ModernWMS (REST)</option>
          </select>
        </FormField>
        <FormField label="ModernWMS UI">
          {uiUrl ? (
            <a href={uiUrl} target="_blank" rel="noreferrer" className="demo-cell-primary">
              Open ModernWMS ↗
            </a>
          ) : (
            <span className="demo-muted">Set base URL</span>
          )}
        </FormField>
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
          />
        </FormField>
        <FormField label={`Password${config.passwordSet ? ' (saved)' : ''}`}>
          <input
            className="demo-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={config.passwordSet ? 'Leave blank to keep' : 'Required'}
          />
        </FormField>
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
        <FormField label="Auto confirm order in MWMS">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.autoConfirmOrder}
              onChange={(e) => setConfig({ ...config, autoConfirmOrder: e.target.checked })}
            />
            Confirm dispatch after push (default: ops confirm in MWMS UI)
          </label>
        </FormField>
      </div>
      {testOk ? (
        <p className="demo-alert text-sm mt-3" style={{ borderColor: 'rgba(47, 106, 74, 0.35)', background: 'rgba(47, 106, 74, 0.1)' }}>
          {testOk}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2 flex-wrap">
        <button type="button" className="demo-button" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="demo-button demo-button-secondary" disabled={testing} onClick={() => void testConnection()}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="button"
          className="demo-button demo-button-secondary"
          disabled={syncing || fulfillmentMode !== 'modernwms'}
          onClick={() => void syncInventory()}
        >
          {syncing ? 'Syncing…' : 'Sync inventory'}
        </button>
        <button type="button" className="demo-button demo-button-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function WarehousePanel() {
  const { company, setError, setNotice, refresh } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const connections = company?.sftpConnections || []
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('US')
  const [sftpConnectionId, setSftpConnectionId] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [inventoryWarehouseId, setInventoryWarehouseId] = useState<string | null>(null)
  const [modernwmsWarehouseId, setModernwmsWarehouseId] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<'template' | 'inventory' | 'modernwms' | null>(null)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return warehouses
    return warehouses.filter(
      (w) =>
        w.name.toLowerCase().includes(term) ||
        (w.code || '').toLowerCase().includes(term) ||
        (w.address || '').toLowerCase().includes(term),
    )
  }, [warehouses, q])

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      setName('')
      setCode('')
      setStreet('')
      setCity('')
      setState('')
      setZip('')
      setCountry('US')
      setSftpConnectionId('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add warehouse')
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Warehouses"
        description="Locations, SFTP or ModernWMS, 940 templates, and product stock (SKU quantities)."
        count={warehouses.length}
      />

      <PageSection title="Add warehouse" description="Several warehouses can share one SFTP connection.">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
          <FormField label="Name">
            <input className="demo-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Code">
            <input className="demo-input" value={code} onChange={(e) => setCode(e.target.value)} />
          </FormField>
          <FormField label="Street">
            <input className="demo-input" value={street} onChange={(e) => setStreet(e.target.value)} required placeholder="123 Warehouse Rd" />
          </FormField>
          <FormField label="City">
            <input className="demo-input" value={city} onChange={(e) => setCity(e.target.value)} required />
          </FormField>
          <CountryStateSelect
            country={country}
            state={state}
            onCountryChange={setCountry}
            onStateChange={setState}
          />
          <ZipPostalField country={country} state={state} value={zip} onChange={setZip} />
          <FormField label="SFTP connection">
            <select className="demo-input" value={sftpConnectionId} onChange={(e) => setSftpConnectionId(e.target.value)}>
              <option value="">No SFTP yet</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name}
                  {connection.enabled ? '' : ' (off)'}
                </option>
              ))}
            </select>
          </FormField>
          <div className="md:col-span-2">
            <button className="demo-button" type="submit">Add warehouse</button>
          </div>
        </form>
      </PageSection>

      <ListToolbar
        search={q}
        searchPlaceholder="Search warehouses?"
        onSearchChange={setQ}
        resultCount={filtered.length}
        resultLabel="warehouses"
        onClear={() => setQ('')}
      />

      <DataTable
        columns={[
          {
            key: 'name',
            header: 'Name',
            sortable: true,
            sortValue: (w) => w.name,
            render: (w) => <span className="demo-cell-primary">{w.name}</span>,
          },
          { key: 'code', header: 'Code', render: (w) => w.code || '?' },
          { key: 'address', header: 'Address', render: (w) => w.address || '?' },
          {
            key: 'fulfillment',
            header: 'Fulfillment',
            render: (warehouse) => (
              <select
                className="demo-input min-w-[9rem]"
                aria-label={`Fulfillment mode for ${warehouse.name}`}
                value={warehouse.fulfillmentMode || 'sftp_edi'}
                onClick={(e) => e.stopPropagation()}
                onChange={(event) =>
                  void updateCompanyWarehouse(warehouse.id, {
                    fulfillmentMode: event.target.value as 'modernwms' | 'sftp_edi',
                  })
                    .then(() => refresh())
                    .catch((err) => setError(err instanceof Error ? err.message : 'Unable to update'))
                }
              >
                <option value="sftp_edi">SFTP/EDI</option>
                <option value="modernwms">ModernWMS</option>
              </select>
            ),
          },
          {
            key: 'modernwms',
            header: 'ModernWMS',
            align: 'right',
            render: (warehouse) => (
              <button
                type="button"
                className="demo-btn demo-btn-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  if (panelMode === 'modernwms' && modernwmsWarehouseId === warehouse.id) {
                    setPanelMode(null)
                    setModernwmsWarehouseId(null)
                    return
                  }
                  setPanelMode('modernwms')
                  setModernwmsWarehouseId(warehouse.id)
                  setEditingTemplateId(null)
                  setInventoryWarehouseId(null)
                }}
              >
                {panelMode === 'modernwms' && modernwmsWarehouseId === warehouse.id ? 'Close MWMS' : 'Configure'}
              </button>
            ),
          },
          {
            key: 'sftp',
            header: 'SFTP',
            render: (warehouse) => (
              <select
                className="demo-input min-w-[10rem]"
                aria-label={`SFTP for ${warehouse.name}`}
                value={warehouse.sftpConnectionId || ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(event) =>
                  void updateCompanyWarehouse(warehouse.id, {
                    sftpConnectionId: event.target.value || null,
                  })
                    .then(() => refresh())
                    .catch((err) => setError(err instanceof Error ? err.message : 'Unable to update'))
                }
              >
                <option value="">None</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name}
                  </option>
                ))}
              </select>
            ),
          },
          {
            key: 'products',
            header: 'Products',
            align: 'right',
            render: (warehouse) => (
              <button
                type="button"
                className="demo-btn demo-btn-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  if (panelMode === 'inventory' && inventoryWarehouseId === warehouse.id) {
                    setPanelMode(null)
                    setInventoryWarehouseId(null)
                    return
                  }
                  setPanelMode('inventory')
                  setInventoryWarehouseId(warehouse.id)
                  setEditingTemplateId(null)
                  setModernwmsWarehouseId(null)
                }}
              >
                {panelMode === 'inventory' && inventoryWarehouseId === warehouse.id ? 'Close products' : 'Manage products'}
              </button>
            ),
          },
          {
            key: 'template',
            header: '940 Template',
            align: 'right',
            render: (warehouse) => (
              <button
                type="button"
                className="demo-btn demo-btn-sm demo-btn-ghost"
                onClick={() => {
                  if (panelMode === 'template' && editingTemplateId === warehouse.id) {
                    setPanelMode(null)
                    setEditingTemplateId(null)
                    return
                  }
                  setPanelMode('template')
                  setEditingTemplateId(warehouse.id)
                  setInventoryWarehouseId(null)
                  setModernwmsWarehouseId(null)
                }}
              >
                {panelMode === 'template' && editingTemplateId === warehouse.id ? 'Close' : 'Edit template'}
              </button>
            ),
          },
        ]}
        rows={filtered}
        rowKey={(w) => w.id}
        emptyTitle="No warehouses"
        emptyMessage="Add a warehouse to start routing orders."
        expandedKey={
          panelMode === 'inventory'
            ? inventoryWarehouseId
            : panelMode === 'template'
              ? editingTemplateId
              : panelMode === 'modernwms'
                ? modernwmsWarehouseId
                : null
        }
        selectedKey={
          panelMode === 'inventory'
            ? inventoryWarehouseId
            : panelMode === 'template'
              ? editingTemplateId
              : panelMode === 'modernwms'
                ? modernwmsWarehouseId
                : null
        }
        renderExpanded={(warehouse) => {
          if (panelMode === 'inventory') {
            return (
              <WarehouseInventoryEditor
                warehouseId={warehouse.id}
                warehouseName={warehouse.name}
                onError={setError}
              />
            )
          }
          if (panelMode === 'modernwms') {
            return (
              <ModernWmsConfigEditor
                warehouse={warehouse}
                onClose={() => {
                  setPanelMode(null)
                  setModernwmsWarehouseId(null)
                }}
                onError={setError}
                onNotice={setNotice}
                onSaved={() => void refresh()}
              />
            )
          }
          return (
            <TemplateEditor warehouseId={warehouse.id} onClose={() => { setPanelMode(null); setEditingTemplateId(null) }} />
          )
        }}
      />
    </div>
  )
}