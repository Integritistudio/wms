import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import PlatformShell from '../../components/PlatformShell'
import {
  Alert,
  Button,
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

      {error ? (
        <Alert tone="danger" className="mb-4" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" className="mb-4" onDismiss={() => setMessage('')}>
          {message}
        </Alert>
      ) : null}

      <PageSection
        title="Data Retention & Soft-Deletion Policy"
        description="Set how long soft-deleted companies, returns, and associated records remain in the system before automated permanent purge."
      >
        <form onSubmit={onSave} className="ui-form-grid">
          <FormField
            label="Retention Period (Days)"
            hint="Default is 180 days (6 months). Any company or return soft-deleted longer than this will be permanently removed during cleanup cycles."
            className="span-2"
          >
            <input
              type="number"
              min="1"
              max="3650"
              className="demo-input"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              required
            />
          </FormField>

          <label className="ui-checkbox-row span-2">
            <input
              type="checkbox"
              className="demo-checkbox"
              checked={autoCleanupEnabled}
              onChange={(e) => setAutoCleanupEnabled(e.target.checked)}
            />
            <div>
              <span className="font-medium text-sm">Enable Automated 24h Cleanup Scheduler</span>
              <p className="demo-muted text-xs m-0">When enabled, the server runs a daily background audit and automatically purges expired records.</p>
            </div>
          </label>

          <label className="ui-checkbox-row span-2">
            <input
              type="checkbox"
              className="demo-checkbox"
              checked={webhooksEnabled}
              onChange={(e) => setWebhooksEnabled(e.target.checked)}
            />
            <div>
              <span className="font-medium text-sm">Process Shopify webhooks</span>
              <p className="demo-muted text-xs m-0">
                Kill switch for incidents. When off, webhooks are still accepted (HMAC + stored) but not queued for order processing. Env <code>WEBHOOKS_ENABLED=false</code> also forces pause.
              </p>
            </div>
          </label>

          <FormField
            label="DLQ alert email"
            hint="Optional. When SMTP is configured, email when open failed-order count reaches the threshold."
          >
            <input
              type="email"
              className="demo-input"
              value={dlqAlertEmail}
              onChange={(e) => setDlqAlertEmail(e.target.value)}
              placeholder="ops@example.com"
            />
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

          <div className="ui-inline-actions span-2">
            <Button type="submit" disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </PageSection>

      <PageSection
        title="Manual Retention Cleanup"
        description="Run an immediate audit and purge cycle using the current retention threshold."
      >
        <div className="ui-stack">
          <p className="text-sm m-0">
            Triggering manual cleanup immediately scans for all soft-deleted companies, members, warehouses, templates, failed orders, and returns whose deletion timestamp is older than <strong>{retentionDays} days</strong>.
          </p>
          <div className="ui-inline-actions">
            <Button
              variant="danger"
              type="button"
              onClick={() => void onRunCleanup()}
              disabled={cleaning || loading}
            >
              {cleaning ? 'Running Cleanup...' : 'Run Retention Cleanup Now'}
            </Button>
          </div>

          {settings?.lastCleanupAt ? (
            <Alert tone="neutral" title="Last Automated Cleanup Run">
              <div>Executed At: {new Date(settings.lastCleanupAt).toLocaleString()}</div>
              {settings.lastCleanupStats ? (
                <div className="mt-1 font-mono">
                  Purged: {(settings.lastCleanupStats as any).deletedCompanies || 0} companies, {(settings.lastCleanupStats as any).deletedReturns || 0} returns
                </div>
              ) : null}
            </Alert>
          ) : null}

          {lastResult ? (
            <Alert tone="info" title="Recent Execution Results">
              <div>Cutoff Date: {new Date(lastResult.cutoffDate).toLocaleString()}</div>
              <div>Purged Companies: {lastResult.deletedCompanies}</div>
              <div>Purged Returns: {lastResult.deletedReturns}</div>
            </Alert>
          ) : null}
        </div>
      </PageSection>
    </PlatformShell>
  )
}
