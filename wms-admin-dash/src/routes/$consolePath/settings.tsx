import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import PlatformShell from '../../components/PlatformShell'
import {
  FormField,
  PageHeader,
  PageSection,
} from '../../components/ui'
import {
  getPlatformSettings,
  updatePlatformSettings,
  runPlatformCleanup,
  type PlatformSettings,
  type PlatformCleanupResult,
} from '../../lib/api'
import { isPlatformAuthenticated } from '../../lib/auth'

export const Route = createFileRoute('/$consolePath/settings')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (!isPlatformAuthenticated()) {
      throw redirect({ to: '/$consolePath/login', params })
    }
  },
  component: PlatformSettingsPage,
})

function PlatformSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [retentionDays, setRetentionDays] = useState(180)
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(true)
  const [webhooksEnabled, setWebhooksEnabled] = useState(true)
  const [dlqAlertEmail, setDlqAlertEmail] = useState('')
  const [dlqAlertThreshold, setDlqAlertThreshold] = useState(5)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState<PlatformCleanupResult | null>(null)

  async function loadSettings() {
    setLoading(true)
    try {
      const data = await getPlatformSettings()
      setSettings(data)
      setRetentionDays(data.retentionDays || 180)
      setAutoCleanupEnabled(data.autoCleanupEnabled !== false)
      setWebhooksEnabled(data.webhooksEnabled !== false)
      setDlqAlertEmail(data.dlqAlertEmail || '')
      setDlqAlertThreshold(data.dlqAlertThreshold || 5)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const updated = await updatePlatformSettings({
        retentionDays: Number(retentionDays) || 180,
        autoCleanupEnabled,
        webhooksEnabled,
        dlqAlertEmail,
        dlqAlertThreshold: Number(dlqAlertThreshold) || 5,
      })
      setSettings(updated)
      setMessage('Platform settings updated successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  async function onRunCleanup() {
    if (!window.confirm(`Are you sure you want to run retention cleanup? This will permanently purge soft-deleted companies and returns older than ${retentionDays} days.`)) {
      return
    }
    setCleaning(true)
    setMessage('')
    setError('')
    try {
      const result = await runPlatformCleanup(retentionDays)
      setLastResult(result)
      setMessage(`Cleanup executed: permanently purged ${result.deletedCompanies} company(s) and ${result.deletedReturns} return(s) older than ${new Date(result.cutoffDate).toLocaleDateString()}.`)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleanup failed')
    } finally {
      setCleaning(false)
    }
  }

  return (
    <PlatformShell
      title="Platform Settings"
      subtitle="Manage data retention, webhook kill switch, DLQ alerts, and platform-wide configurations."
      activeId="settings"
    >
      <PageHeader
        title="Platform Settings"
        description="Configure automated data retention cycles and company lifecycle management."
      />

      {error ? <p className="demo-alert-danger demo-alert mb-4">{error}</p> : null}
      {message ? <p className="demo-alert demo-alert-success mb-4" style={{ padding: '0.75rem 1rem', background: '#f0fdf4', color: '#166534', borderRadius: '6px', border: '1px solid #bbf7d0' }}>{message}</p> : null}

      <PageSection
        title="Data Retention & Soft-Deletion Policy"
        description="Set how long soft-deleted companies, returns, and associated records remain in the system before automated permanent purge."
      >
        <form onSubmit={onSave} className="grid gap-4 max-w-xl">
          <FormField label="Retention Period (Days)">
            <input
              type="number"
              min="1"
              max="3650"
              className="demo-input"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              required
            />
            <p className="demo-muted mt-1 text-xs">
              Default is 180 days (6 months). Any company or return soft-deleted longer than this will be permanently removed during cleanup cycles.
            </p>
          </FormField>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="demo-checkbox"
              checked={autoCleanupEnabled}
              onChange={(e) => setAutoCleanupEnabled(e.target.checked)}
            />
            <div>
              <span className="font-medium text-sm">Enable Automated 24h Cleanup Scheduler</span>
              <p className="demo-muted text-xs">When enabled, the server runs a daily background audit and automatically purges expired records.</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="demo-checkbox"
              checked={webhooksEnabled}
              onChange={(e) => setWebhooksEnabled(e.target.checked)}
            />
            <div>
              <span className="font-medium text-sm">Process Shopify webhooks</span>
              <p className="demo-muted text-xs">
                Kill switch for incidents. When off, webhooks are still accepted (HMAC + stored) but not queued for order processing. Env <code>WEBHOOKS_ENABLED=false</code> also forces pause.
              </p>
            </div>
          </label>

          <FormField label="DLQ alert email">
            <input
              type="email"
              className="demo-input"
              value={dlqAlertEmail}
              onChange={(e) => setDlqAlertEmail(e.target.value)}
              placeholder="ops@example.com"
            />
            <p className="demo-muted mt-1 text-xs">
              Optional. When SMTP is configured, email when open failed-order count reaches the threshold.
            </p>
          </FormField>

          <FormField label="DLQ alert threshold">
            <input
              type="number"
              min="1"
              className="demo-input"
              value={dlqAlertThreshold}
              onChange={(e) => setDlqAlertThreshold(Number(e.target.value))}
            />
          </FormField>

          <div>
            <button className="demo-button" type="submit" disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </PageSection>

      <PageSection
        title="Manual Retention Cleanup"
        description="Run an immediate audit and purge cycle using the current retention threshold."
      >
        <div className="flex flex-col gap-3 max-w-xl">
          <p className="text-sm">
            Triggering manual cleanup immediately scans for all soft-deleted companies, members, warehouses, templates, failed orders, and returns whose deletion timestamp is older than <strong>{retentionDays} days</strong>.
          </p>
          <div>
            <button
              className="demo-btn demo-btn-danger"
              type="button"
              onClick={() => void onRunCleanup()}
              disabled={cleaning || loading}
            >
              {cleaning ? 'Running Cleanup...' : 'Run Retention Cleanup Now'}
            </button>
          </div>

          {settings?.lastCleanupAt ? (
            <div className="mt-4 p-3 rounded bg-[var(--card-subtle,#f9fafb)] border border-[var(--border,#e5e7eb)] text-xs">
              <div className="font-semibold text-sm mb-1">Last Automated Cleanup Run</div>
              <div>Executed At: {new Date(settings.lastCleanupAt).toLocaleString()}</div>
              {settings.lastCleanupStats ? (
                <div className="mt-1 font-mono">
                  Purged: {(settings.lastCleanupStats as any).deletedCompanies || 0} companies, {(settings.lastCleanupStats as any).deletedReturns || 0} returns
                </div>
              ) : null}
            </div>
          ) : null}

          {lastResult ? (
            <div className="mt-2 p-3 rounded bg-blue-50 border border-blue-200 text-xs text-blue-900">
              <div className="font-semibold mb-1">Recent Execution Results:</div>
              <div>Cutoff Date: {new Date(lastResult.cutoffDate).toLocaleString()}</div>
              <div>Purged Companies: {lastResult.deletedCompanies}</div>
              <div>Purged Returns: {lastResult.deletedReturns}</div>
            </div>
          ) : null}
        </div>
      </PageSection>
    </PlatformShell>
  )
}
