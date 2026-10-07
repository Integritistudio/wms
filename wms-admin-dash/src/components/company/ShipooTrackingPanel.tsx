import { useEffect, useState, type FormEvent } from 'react'
import { Copy, Radar, RefreshCw, Save } from 'lucide-react'
import { Alert, Button, FormField, PageHeader } from '../ui'
import {
  getShipooTrackingSettings,
  saveShipooTrackingSettings,
  type ShipooTrackingSettings,
} from '../../lib/api'

const emptySettings: ShipooTrackingSettings = {
  enabled: false,
  apiKeySet: false,
  webhookSecretSet: false,
  apiKeyMasked: '',
  webhookSecretMasked: '',
  destinationId: '',
  webhookUrl: '',
  shipooConfigured: false,
  lastRegisteredAt: null,
  lastWebhookAt: null,
}

export default function ShipooTrackingPanel() {
  const [settings, setSettings] = useState<ShipooTrackingSettings>(emptySettings)
  const [apiKey, setApiKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgTone, setMsgTone] = useState<'success' | 'danger'>('success')
  const [copied, setCopied] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const existing = await getShipooTrackingSettings()
      if (existing) setSettings(existing)
      setMsg('')
    } catch (err) {
      setMsgTone('danger')
      setMsg(err instanceof Error ? err.message : 'Unable to load tracking settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setMsg('')
    try {
      const saved = await saveShipooTrackingSettings({
        enabled: settings.enabled,
        destinationId: settings.destinationId,
        apiKey: apiKey.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
      })
      setSettings(saved)
      setApiKey('')
      setWebhookSecret('')
      setMsgTone('success')
      setMsg(
        saved.enabled
          ? 'Auto-tracking enabled. New shipments will register with Shipoo and advance from carrier events.'
          : 'Tracking settings saved.',
      )
    } catch (err) {
      setMsgTone('danger')
      setMsg(err instanceof Error ? err.message : 'Failed to save')
    }
    setSaving(false)
  }

  async function copyWebhookUrl() {
    if (!settings.webhookUrl) return
    try {
      await navigator.clipboard.writeText(settings.webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="oj-page shipoo-tracking-page">
      <PageHeader
        title="Auto Tracking"
        description="Connect Shipoo so labeled / transit / out for delivery / delivered / return stages update automatically when enabled for your company and allowed users."
        actions={
          <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} />
            Refresh
          </Button>
        }
      />

      {msg ? (
        <Alert tone={msgTone} onDismiss={() => setMsg('')}>
          {msg}
        </Alert>
      ) : null}

      {!settings.shipooConfigured ? (
        <Alert tone="danger">
          Shipoo base URL is not configured on the API server. Set SHIPOO_BASE_URL before enabling.
        </Alert>
      ) : null}

      <form className="shipoo-tracking-card" onSubmit={handleSave}>
        <div className="shipoo-tracking-card-head">
          <span className="shipoo-tracking-icon" aria-hidden>
            <Radar size={18} />
          </span>
          <div>
            <h2>Shipoo auto-tracking</h2>
            <p>
              When on, shipping a package registers tracking with Shipoo. Carrier events push status into the order
              timeline — Labeled, Transit, Out, Delivered, and Return.
            </p>
          </div>
        </div>

        <label className="shipoo-tracking-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
            disabled={loading}
          />
          <span>
            <strong>Enable auto-tracking for this company</strong>
            <small>Only users with the Tracking permission will see auto mode on order details.</small>
          </span>
        </label>

        <div className="shipoo-tracking-grid">
          <FormField label="Shipoo API key">
            <input
              className="demo-input"
              type="password"
              autoComplete="off"
              placeholder={settings.apiKeySet ? settings.apiKeyMasked || '•••• saved' : 'wms_trk_…'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </FormField>
          <FormField label="Webhook signing secret">
            <input
              className="demo-input"
              type="password"
              autoComplete="off"
              placeholder={
                settings.webhookSecretSet
                  ? settings.webhookSecretMasked || '•••• saved'
                  : 'Secret from Shipoo destination'
              }
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </FormField>
          <FormField label="Destination ID (optional)" className="span-2">
            <input
              className="demo-input"
              value={settings.destinationId || ''}
              onChange={(e) => setSettings((s) => ({ ...s, destinationId: e.target.value }))}
              placeholder="Shipoo webhook destination id"
            />
          </FormField>
        </div>

        <div className="shipoo-tracking-webhook">
          <span>Inbound webhook URL</span>
          <code>{settings.webhookUrl || '—'}</code>
          <Button type="button" variant="ghost" onClick={() => void copyWebhookUrl()} disabled={!settings.webhookUrl}>
            <Copy size={14} />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <p className="shipoo-tracking-hint">
          In Shipoo, create a webhook destination pointing at this URL for tracking events, then paste the one-time
          secret here. Grant users the <strong>Tracking</strong> permission under Users so they can use auto updates.
        </p>

        <div className="shipoo-tracking-actions">
          <Button type="submit" disabled={saving || loading}>
            <Save size={16} />
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
          {settings.lastWebhookAt ? (
            <span className="shipoo-tracking-meta">
              Last webhook {new Date(settings.lastWebhookAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  )
}
