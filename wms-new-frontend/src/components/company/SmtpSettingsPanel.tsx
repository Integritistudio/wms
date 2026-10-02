import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Mail, Plus, RefreshCw, Send, Server } from 'lucide-react'
import { Alert, Button, DataTable, FormField, PageHeader, StatusTabs } from '../ui'
import {
  getSmtpSettings,
  saveSmtpSettings,
  testSmtpSettings,
  type SmtpSettings,
} from '../../lib/api'

type EmailTab = 'server' | 'alerts' | 'recipients'

const notifyOptions = [
  { value: 'order_error', label: 'Order Errors', desc: 'When an order hits an error state' },
  { value: 'sftp_failed', label: 'SFTP Failures', desc: 'When 940 / SFTP delivery fails' },
  { value: 'dlq_entry', label: 'Dead Letter Queue', desc: 'When something lands in Failed' },
  { value: '945_received', label: '945 Received', desc: 'When a ship confirmation is processed' },
  { value: 'order_fulfilled', label: 'Order Fulfilled', desc: 'When an order is fulfilled' },
  { value: 'order_received', label: 'Order Received', desc: 'When a new order is ingested' },
]

const emptySettings: SmtpSettings = {
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  fromName: 'WMS Linker',
  fromEmail: '',
  enabled: true,
  notifyOn: ['order_error', 'sftp_failed', 'dlq_entry'],
  recipients: [],
}

export default function SmtpSettingsPanel() {
  const [settings, setSettings] = useState<SmtpSettings>(emptySettings)
  const [recipientInput, setRecipientInput] = useState('')
  const [tab, setTab] = useState<EmailTab>('server')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgTone, setMsgTone] = useState<'success' | 'danger'>('success')

  async function load() {
    setLoading(true)
    try {
      const existing = await getSmtpSettings()
      if (existing) setSettings(existing)
      setMsg('')
    } catch (err) {
      setMsgTone('danger')
      setMsg(err instanceof Error ? err.message : 'Unable to load email settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const counts = useMemo(() => {
    const hostSet = Boolean(settings.host.trim())
    const fromSet = Boolean(settings.fromEmail.trim())
    return {
      enabled: settings.enabled,
      recipients: settings.recipients.length,
      alerts: settings.notifyOn.length,
      configured: hostSet && fromSet ? 1 : 0,
    }
  }, [settings])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setMsg('')
    try {
      await saveSmtpSettings(settings)
      setMsgTone('success')
      setMsg('Email settings saved.')
    } catch (err) {
      setMsgTone('danger')
      setMsg(err instanceof Error ? err.message : 'Failed to save')
    }
    setSaving(false)
  }

  async function handleTest() {
    if (testing) return
    setTesting(true)
    setMsg('')
    try {
      await testSmtpSettings()
      setMsgTone('success')
      setMsg('Test email sent successfully.')
    } catch (err) {
      setMsgTone('danger')
      setMsg(err instanceof Error ? err.message : 'Test failed')
    }
    setTesting(false)
  }

  function addRecipient() {
    const email = recipientInput.trim()
    if (!email) return
    if (!settings.recipients.includes(email)) {
      setSettings({ ...settings, recipients: [...settings.recipients, email] })
    }
    setRecipientInput('')
  }

  function toggleNotify(value: string, checked: boolean) {
    const next = checked
      ? [...settings.notifyOn, value]
      : settings.notifyOn.filter((v) => v !== value)
    setSettings({ ...settings, notifyOn: next })
  }

  if (loading) {
    return (
      <div className="oj-page oj-skel email-page">
        <PageHeader title="Email Settings" description="Configure SMTP for email notifications" />
        <DataTable columns={[]} rows={[]} rowKey={() => ''} loading loadingRows={3} />
      </div>
    )
  }

  return (
    <div className="oj-page oj-skel email-page">
      <PageHeader
        title="Email Settings"
        description="Optional SMTP so Linker can email your team when important events happen — in addition to in-app Notifications."
        count={counts.recipients}
        actions={
          <button
            type="button"
            className="demo-btn demo-btn-sm email-add-cta"
            onClick={() => setTab('recipients')}
          >
            <Plus size={14} aria-hidden />
            Add recipient
          </button>
        }
      />

      <div className="email-stats" aria-label="Email summary">
        <div className={`email-stat${counts.enabled ? ' is-ok' : ''}`}>
          <span className="email-stat-label">Outbound</span>
          <strong className="email-stat-value">{counts.enabled ? 'On' : 'Off'}</strong>
        </div>
        <div className={`email-stat${counts.configured ? ' is-ok' : ''}`}>
          <span className="email-stat-label">SMTP</span>
          <strong className="email-stat-value">{counts.configured ? 'Ready' : 'Setup'}</strong>
        </div>
        <div className="email-stat">
          <span className="email-stat-label">Alerts</span>
          <strong className="email-stat-value">{counts.alerts}</strong>
        </div>
        <div className="email-stat">
          <span className="email-stat-label">Recipients</span>
          <strong className="email-stat-value">{counts.recipients}</strong>
        </div>
      </div>

      <div className="email-status-tabs">
        <StatusTabs
          activeId={tab}
          onChange={(id) => setTab(id as EmailTab)}
          tabs={[
            { id: 'server', label: 'SMTP server' },
            { id: 'alerts', label: 'Notify on', count: counts.alerts || undefined },
            { id: 'recipients', label: 'Recipients', count: counts.recipients || undefined },
          ]}
        />
        <button
          type="button"
          className="orders-refresh-btn"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh email settings"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

      {msg ? (
        <Alert tone={msgTone} onDismiss={() => setMsg('')}>
          {msg}
        </Alert>
      ) : null}

      <form onSubmit={handleSave} className="email-form">
        {tab === 'server' ? (
          <section className="email-panel">
            <div className="email-panel-head">
              <div>
                <div className="email-kicker">
                  <Server size={14} aria-hidden />
                  Connection
                </div>
                <h2>SMTP server</h2>
                <p>Credentials and From address used for outbound alert mail.</p>
              </div>
            </div>

            <div className="email-toggle-grid">
              <label className={`email-toggle${settings.enabled ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                  id="smtp-enabled"
                />
                <span>
                  <strong>Enabled</strong>
                  <span>Master switch for outbound alert email</span>
                </span>
              </label>
              <label className={`email-toggle${settings.secure ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={settings.secure}
                  onChange={(e) => setSettings({ ...settings, secure: e.target.checked })}
                  id="smtp-secure"
                />
                <span>
                  <strong>Use TLS / SSL</strong>
                  <span>Encrypt the SMTP connection</span>
                </span>
              </label>
            </div>

            <div className="users-dialog-grid email-fields">
              <FormField label="SMTP Host" required>
                <input
                  className="demo-input"
                  value={settings.host}
                  onChange={(e) => setSettings({ ...settings, host: e.target.value })}
                  required
                  placeholder="smtp.gmail.com"
                  autoComplete="off"
                />
              </FormField>
              <FormField label="Port">
                <input
                  className="demo-input"
                  type="number"
                  value={settings.port}
                  onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Username" required>
                <input
                  className="demo-input"
                  value={settings.username}
                  onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                  required
                  autoComplete="off"
                />
              </FormField>
              <FormField label="Password" required>
                <input
                  className="demo-input"
                  type="password"
                  value={settings.password}
                  onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                  required
                  autoComplete="new-password"
                />
              </FormField>
              <FormField label="From Name">
                <input
                  className="demo-input"
                  value={settings.fromName}
                  onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
                  placeholder="WMS Linker"
                />
              </FormField>
              <FormField label="From Email" required>
                <input
                  className="demo-input"
                  type="email"
                  value={settings.fromEmail}
                  onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })}
                  required
                />
              </FormField>
            </div>
          </section>
        ) : null}

        {tab === 'alerts' ? (
          <section className="email-panel">
            <div className="email-panel-head">
              <div>
                <div className="email-kicker">
                  <Mail size={14} aria-hidden />
                  Events
                </div>
                <h2>Notify on</h2>
                <p>Choose which events trigger outbound email alerts.</p>
              </div>
            </div>

            <div className="email-toggle-grid">
              {notifyOptions.map((opt) => {
                const on = settings.notifyOn.includes(opt.value)
                return (
                  <label key={opt.value} className={`email-toggle${on ? ' is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => toggleNotify(opt.value, e.target.checked)}
                    />
                    <span>
                      <strong>{opt.label}</strong>
                      <span>{opt.desc}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
        ) : null}

        {tab === 'recipients' ? (
          <section className="email-panel">
            <div className="email-panel-head">
              <div>
                <div className="email-kicker">
                  <Send size={14} aria-hidden />
                  Delivery
                </div>
                <h2>Recipients</h2>
                <p>Addresses that receive alert emails when an enabled event fires.</p>
              </div>
            </div>

            <FormField label="Add recipient">
              <div className="email-recipient-add">
                <input
                  className="demo-input"
                  type="email"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  placeholder="ops@example.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addRecipient()
                    }
                  }}
                />
                <button type="button" className="demo-btn demo-btn-sm email-add-cta" onClick={addRecipient}>
                  <Plus size={14} aria-hidden />
                  Add
                </button>
              </div>
            </FormField>

            {settings.recipients.length > 0 ? (
              <ul className="email-recipient-list">
                {settings.recipients.map((r) => (
                  <li key={r} className="email-recipient-chip">
                    <span>{r}</span>
                    <button
                      type="button"
                      className="email-recipient-remove"
                      aria-label={`Remove ${r}`}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          recipients: settings.recipients.filter((x) => x !== r),
                        })
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="email-empty">
                <strong>No recipients yet</strong>
                <p>Add at least one address so alerts have somewhere to go.</p>
              </div>
            )}
          </section>
        ) : null}

        <div className="email-actions">
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
          <Button variant="secondary" type="button" onClick={() => void handleTest()} disabled={testing} aria-busy={testing}>
            {testing ? 'Sending…' : 'Send Test Email'}
          </Button>
        </div>
      </form>
    </div>
  )
}
