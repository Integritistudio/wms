import { useEffect, useState, type FormEvent } from 'react'
import { DataTable, FormField, PageHeader, PageSection } from '../ui'
import {
  getSmtpSettings,
  saveSmtpSettings,
  testSmtpSettings,
  type SmtpSettings,
} from '../../lib/api'

export default function SmtpSettingsPanel() {
  const [settings, setSettings] = useState<SmtpSettings>({
    host: '', port: 587, secure: false, username: '', password: '', fromName: 'WMS Linker', fromEmail: '', enabled: true, notifyOn: ['order_error', 'sftp_failed', 'dlq_entry'], recipients: [],
  })
  const [recipientInput, setRecipientInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const existing = await getSmtpSettings()
        if (existing) setSettings(existing)
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      await saveSmtpSettings(settings)
      setMsg('Saved!')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save')
    }
    setSaving(false)
  }

  async function handleTest() {
    setTesting(true)
    setMsg('')
    try {
      await testSmtpSettings()
      setMsg('Test email sent successfully!')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Test failed')
    }
    setTesting(false)
  }

  function addRecipient() {
    const email = recipientInput.trim()
    if (email && !settings.recipients.includes(email)) {
      setSettings({ ...settings, recipients: [...settings.recipients, email] })
    }
    setRecipientInput('')
  }

  const notifyOptions = [
    { value: 'order_error', label: 'Order Errors' },
    { value: 'sftp_failed', label: 'SFTP Failures' },
    { value: 'dlq_entry', label: 'Dead Letter Queue' },
    { value: '945_received', label: '945 Received' },
    { value: 'order_fulfilled', label: 'Order Fulfilled' },
    { value: 'order_received', label: 'Order Received' },
  ]

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Email Settings" description="Configure SMTP for email notifications" />
        <DataTable columns={[]} rows={[]} rowKey={() => ''} loading loadingRows={3} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Email Settings"
        description="Configure SMTP for order alerts and failures."
      />

      <PageSection title="SMTP server" description="Credentials and From address used for outbound mail.">
        <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="SMTP Host">
              <input className="demo-input w-full" value={settings.host} onChange={(e) => setSettings({ ...settings, host: e.target.value })} required placeholder="smtp.gmail.com" />
            </FormField>
            <FormField label="Port">
              <input className="demo-input w-full" type="number" value={settings.port} onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Username">
              <input className="demo-input w-full" value={settings.username} onChange={(e) => setSettings({ ...settings, username: e.target.value })} required />
            </FormField>
            <FormField label="Password">
              <input className="demo-input w-full" type="password" value={settings.password} onChange={(e) => setSettings({ ...settings, password: e.target.value })} required />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="From Name">
              <input className="demo-input w-full" value={settings.fromName} onChange={(e) => setSettings({ ...settings, fromName: e.target.value })} />
            </FormField>
            <FormField label="From Email">
              <input className="demo-input w-full" type="email" value={settings.fromEmail} onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })} required />
            </FormField>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={settings.secure} onChange={(e) => setSettings({ ...settings, secure: e.target.checked })} id="smtp-secure" />
            <label htmlFor="smtp-secure" className="text-sm">Use TLS/SSL</label>
            <span className="mx-4" />
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} id="smtp-enabled" />
            <label htmlFor="smtp-enabled" className="text-sm">Enabled</label>
          </div>

          <FormField label="Notify On">
            <div className="flex flex-wrap gap-2 mt-1">
              {notifyOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={settings.notifyOn.includes(opt.value)} onChange={(e) => {
                    const next = e.target.checked ? [...settings.notifyOn, opt.value] : settings.notifyOn.filter((v) => v !== opt.value)
                    setSettings({ ...settings, notifyOn: next })
                  }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </FormField>

          <FormField label="Recipients">
            <div className="flex gap-2 mt-1">
              <input className="demo-input flex-1" type="email" value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)} placeholder="email@example.com" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient() } }} />
              <button type="button" className="demo-btn demo-btn-sm" onClick={addRecipient}>Add</button>
            </div>
            {settings.recipients.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {settings.recipients.map((r) => (
                  <span key={r} className="demo-badge demo-badge-neutral inline-flex items-center gap-1">
                    {r}
                    <button type="button" className="demo-btn demo-btn-ghost demo-btn-sm" onClick={() => setSettings({ ...settings, recipients: settings.recipients.filter((x) => x !== r) })}>×</button>
                  </span>
                ))}
              </div>
            )}
          </FormField>

          {msg && <p className="demo-cell-secondary">{msg}</p>}
          <div className="demo-action-group">
            <button type="submit" className="demo-button" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
            <button type="button" className="demo-button demo-button-secondary" onClick={handleTest} disabled={testing}>{testing ? 'Sending...' : 'Send Test Email'}</button>
          </div>
        </form>
      </PageSection>
    </div>
  )
}
