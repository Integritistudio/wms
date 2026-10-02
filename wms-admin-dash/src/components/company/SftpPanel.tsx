import { useMemo, useState, type FormEvent } from 'react'
import { Cable, Plus, RefreshCw, Server } from 'lucide-react'
import {
  createSftpConnection,
  testSftpConnection,
  updateSftpConnection,
  type SftpConnection,
} from '../../lib/api'
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
import { useCompanyPortal } from './CompanyPortalContext'

type SftpFilter = 'all' | 'enabled' | 'off'

const emptyForm = {
  name: '',
  enabled: true,
  host: '',
  port: '22',
  username: '',
  password: '',
  remotePath: '/inbound/940',
}

export default function SftpPanel() {
  const { company, setError, setNotice, refresh } = useCompanyPortal()
  const connections = company?.sftpConnections || []

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<SftpFilter>('all')
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<SftpConnection | null>(null)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const counts = useMemo(() => {
    let enabled = 0
    let off = 0
    let passwordSet = 0
    for (const c of connections) {
      if (c.enabled) enabled += 1
      else off += 1
      if (c.passwordSet) passwordSet += 1
    }
    return { total: connections.length, enabled, off, passwordSet }
  }, [connections])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return connections.filter((c) => {
      if (filter === 'enabled' && !c.enabled) return false
      if (filter === 'off' && c.enabled) return false
      if (!term) return true
      return (
        c.name.toLowerCase().includes(term) ||
        c.host.toLowerCase().includes(term) ||
        c.username.toLowerCase().includes(term) ||
        (c.remotePath || '').toLowerCase().includes(term)
      )
    })
  }, [connections, q, filter])

  function patchForm<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function openAdd() {
    setForm(emptyForm)
    setAddOpen(true)
  }

  function openEdit(connection: SftpConnection) {
    setEditing(connection)
    setForm({
      name: connection.name,
      enabled: connection.enabled,
      host: connection.host,
      port: String(connection.port || 22),
      username: connection.username,
      password: '',
      remotePath: connection.remotePath || '/inbound/940',
    })
  }

  async function reload() {
    setLoading(true)
    try {
      await refresh()
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh connections')
    } finally {
      setLoading(false)
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await createSftpConnection({
        name: form.name,
        enabled: form.enabled,
        host: form.host,
        port: Number(form.port || 22),
        username: form.username,
        password: form.password || undefined,
        remotePath: form.remotePath,
      })
      setAddOpen(false)
      setForm(emptyForm)
      setNotice('SFTP connection saved. Attach it to one or more warehouses.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save SFTP')
    } finally {
      setSaving(false)
    }
  }

  async function onSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || saving) return
    setSaving(true)
    try {
      await updateSftpConnection(editing.id, {
        name: form.name,
        enabled: form.enabled,
        host: form.host,
        port: Number(form.port || 22),
        username: form.username,
        password: form.password || undefined,
        remotePath: form.remotePath,
      })
      setEditing(null)
      setForm(emptyForm)
      setNotice(`${form.name} saved.`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update SFTP')
    } finally {
      setSaving(false)
    }
  }

  async function onTest(connection: SftpConnection) {
    if (testingId) return
    setTestingId(connection.id)
    try {
      await testSftpConnection(connection.id)
      setNotice(`${connection.name} connected`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SFTP test failed')
    } finally {
      setTestingId(null)
    }
  }

  const columns: DataTableColumn<SftpConnection>[] = [
    {
      key: 'name',
      header: 'Connection',
      className: 'sftp-col-name',
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="sftp-name-cell">
          <span className={`sftp-avatar${row.enabled ? '' : ' is-off'}`} aria-hidden>
            <Server size={16} />
          </span>
          <div>
            <div className="demo-cell-primary">{row.name}</div>
            <div className="demo-cell-secondary">
              {row.passwordSet ? 'Password set' : 'No password'} · path {row.remotePath || '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'host',
      header: 'Host',
      render: (row) => (
        <div className="sftp-host-cell">
          <div className="demo-cell-primary">{row.host || '—'}</div>
          <div className="demo-cell-secondary">Port {row.port || 22}</div>
        </div>
      ),
    },
    {
      key: 'username',
      header: 'Username',
      render: (row) => <span className="sftp-mono">{row.username || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      className: 'sftp-col-status',
      render: (row) => (
        <StatusBadge
          status={row.enabled ? 'active' : 'skipped'}
          label={row.enabled ? 'Enabled' : 'Off'}
          variant={row.enabled ? 'success' : 'neutral'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      className: 'sftp-col-actions',
      render: (row) => (
        <div className="sftp-actions">
          <button
            type="button"
            className="sftp-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              openEdit(row)
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="sftp-action-btn is-ghost"
            disabled={testingId === row.id}
            onClick={(e) => {
              e.stopPropagation()
              void onTest(row)
            }}
          >
            {testingId === row.id ? 'Testing…' : 'Test'}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="oj-page oj-skel sftp-page">
      <PageHeader
        title="SFTP & EDI"
        description="Named connections warehouses can share. When enabled, 940s upload automatically."
        count={counts.total}
        actions={
          <button type="button" className="demo-btn demo-btn-sm sftp-add-cta" onClick={openAdd}>
            <Plus size={14} aria-hidden />
            Add connection
          </button>
        }
      />

      <div className="sftp-stats" aria-label="SFTP summary">
        <div className="sftp-stat">
          <span className="sftp-stat-label">Connections</span>
          <strong className="sftp-stat-value">{counts.total}</strong>
        </div>
        <div className={`sftp-stat${counts.enabled > 0 ? ' is-ok' : ''}`}>
          <span className="sftp-stat-label">Enabled</span>
          <strong className="sftp-stat-value">{counts.enabled}</strong>
        </div>
        <div className="sftp-stat">
          <span className="sftp-stat-label">Off</span>
          <strong className="sftp-stat-value">{counts.off}</strong>
        </div>
        <div className="sftp-stat">
          <span className="sftp-stat-label">Password set</span>
          <strong className="sftp-stat-value">{counts.passwordSet}</strong>
        </div>
      </div>

      <div className="sftp-status-tabs">
        <StatusTabs
          activeId={filter}
          onChange={(id) => setFilter(id as SftpFilter)}
          tabs={[
            { id: 'all', label: 'All', count: counts.total || undefined },
            { id: 'enabled', label: 'Enabled', count: counts.enabled || undefined },
            { id: 'off', label: 'Off', count: counts.off || undefined },
          ]}
        />
        <button
          type="button"
          className="orders-refresh-btn"
          onClick={() => void reload()}
          disabled={loading}
          aria-label="Refresh connections"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

      <ListToolbar
        search={q}
        searchPlaceholder="Search name, host, username, or path…"
        onSearchChange={setQ}
        resultCount={filtered.length}
        resultLabel="connections"
        onClear={() => setQ('')}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        emptyTitle="No SFTP connections"
        emptyMessage={
          filter !== 'all' || q.trim()
            ? 'Try another filter or clear search.'
            : 'Add a connection, then attach it on the Warehouses page.'
        }
        onRowClick={openEdit}
        rowClassName={(row) => (row.enabled ? 'is-sftp-on' : 'is-sftp-off')}
      />

      <Modal
        open={addOpen}
        onClose={() => {
          if (!saving) setAddOpen(false)
        }}
        title="Add SFTP connection"
        description="Create a connection warehouses can share for 940 uploads."
        className="users-dialog sftp-dialog"
      >
        <form className="users-dialog-body" onSubmit={onCreate} aria-busy={saving}>
          <header className="users-dialog-hero">
            <div className="users-dialog-hero-icon" aria-hidden>
              <Cable size={22} />
            </div>
            <div>
              <h2>Add connection</h2>
              <p>Host, credentials, and the remote folder where 940 files land.</p>
            </div>
          </header>

          <div className="users-dialog-grid">
            <FormField label="Name" required>
              <input
                className="demo-input"
                placeholder="e.g. Main 3PL"
                value={form.name}
                onChange={(e) => patchForm('name', e.target.value)}
                required
              />
            </FormField>
            <label className={`sftp-enable-row${form.enabled ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => patchForm('enabled', e.target.checked)}
              />
              <span>
                <strong>Send 940s</strong>
                <span>Enable automatic uploads on this connection</span>
              </span>
            </label>
            <FormField label="Host" required>
              <input
                className="demo-input"
                value={form.host}
                onChange={(e) => patchForm('host', e.target.value)}
                required
                placeholder="sftp.example.com"
              />
            </FormField>
            <FormField label="Port">
              <input
                className="demo-input"
                value={form.port}
                onChange={(e) => patchForm('port', e.target.value)}
              />
            </FormField>
            <FormField label="Username" required>
              <input
                className="demo-input"
                value={form.username}
                onChange={(e) => patchForm('username', e.target.value)}
                required
              />
            </FormField>
            <FormField label="Password">
              <input
                className="demo-input"
                type="password"
                value={form.password}
                onChange={(e) => patchForm('password', e.target.value)}
              />
            </FormField>
            <FormField label="Remote path" className="span-2">
              <input
                className="demo-input"
                value={form.remotePath}
                onChange={(e) => patchForm('remotePath', e.target.value)}
                placeholder="/inbound/940"
              />
            </FormField>
          </div>

          <footer className="users-dialog-footer">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? 'Saving…' : 'Save connection'}
            </Button>
          </footer>
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => {
          if (!saving) setEditing(null)
        }}
        title={editing ? `Edit ${editing.name}` : 'Edit connection'}
        description="Update credentials and remote path. Leave password blank to keep the current one."
        className="users-dialog sftp-dialog"
      >
        {editing ? (
          <form className="users-dialog-body" onSubmit={onSaveEdit} aria-busy={saving}>
            <header className="users-dialog-hero">
              <div className="users-dialog-hero-icon is-edit" aria-hidden>
                <Server size={22} />
              </div>
              <div>
                <h2>Edit connection</h2>
                <p>
                  {editing.host}:{editing.port || 22}
                  {editing.passwordSet ? ' · password already set' : ''}
                </p>
              </div>
            </header>

            <div className="users-dialog-grid">
              <FormField label="Name" required>
                <input
                  className="demo-input"
                  value={form.name}
                  onChange={(e) => patchForm('name', e.target.value)}
                  required
                />
              </FormField>
              <label className={`sftp-enable-row${form.enabled ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => patchForm('enabled', e.target.checked)}
                />
                <span>
                  <strong>Send 940s</strong>
                  <span>Enable automatic uploads on this connection</span>
                </span>
              </label>
              <FormField label="Host" required>
                <input
                  className="demo-input"
                  value={form.host}
                  onChange={(e) => patchForm('host', e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Port">
                <input
                  className="demo-input"
                  value={form.port}
                  onChange={(e) => patchForm('port', e.target.value)}
                />
              </FormField>
              <FormField label="Username" required>
                <input
                  className="demo-input"
                  value={form.username}
                  onChange={(e) => patchForm('username', e.target.value)}
                  required
                />
              </FormField>
              <FormField
                label="Password"
                hint={editing.passwordSet ? 'Leave blank to keep the current password.' : undefined}
              >
                <input
                  className="demo-input"
                  type="password"
                  placeholder={editing.passwordSet ? 'Password (unchanged)' : 'Password'}
                  value={form.password}
                  onChange={(e) => patchForm('password', e.target.value)}
                />
              </FormField>
              <FormField label="Remote path" className="span-2">
                <input
                  className="demo-input"
                  value={form.remotePath}
                  onChange={(e) => patchForm('remotePath', e.target.value)}
                />
              </FormField>
            </div>

            <footer className="users-dialog-footer">
              <Button
                type="button"
                variant="secondary"
                disabled={saving || testingId === editing.id}
                onClick={() => void onTest(editing)}
              >
                {testingId === editing.id ? 'Testing…' : 'Test connection'}
              </Button>
              <div className="sftp-dialog-footer-spacer" />
              <Button type="button" variant="secondary" disabled={saving} onClick={() => setEditing(null)}>
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
