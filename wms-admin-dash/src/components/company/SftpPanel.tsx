import PageBanner, { BannerSnapshot } from '../ui/PageBanner'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
  Pagination,
  StatusBadge,
  StatusTabs,
  type DataTableColumn,
} from '../ui'
import { useCompanyPortal } from './CompanyPortalContext'

export type SftpFilter = 'all' | 'enabled' | 'off'

const emptyForm = {
  name: '',
  enabled: true,
  host: '',
  port: '22',
  username: '',
  password: '',
  remotePath: '/inbound/940',
}

export default function SftpPanel({ filter, onTabChange: setFilter }: {
  filter: SftpFilter
  onTabChange: (tab: SftpFilter) => void
}) {
  const { company, setError, setNotice, refresh } = useCompanyPortal()
  const connections = company?.sftpConnections || []

  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  useEffect(() => { setPage(1) }, [q, filter])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<SftpConnection | null>(null)
  const [editError, setEditError] = useState('')
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
        String(c.port || 22).includes(term) ||
        `${c.host}:${c.port || 22}`.toLowerCase().includes(term) ||
        c.username.toLowerCase().includes(term) ||
        (c.remotePath || '').toLowerCase().includes(term)
      )
    })
  }, [connections, q, filter])
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / limit)))

  function patchForm<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function openAdd() {
    setEditError('')
    setError('')
    setForm(emptyForm)
    setAddOpen(true)
  }

  function openEdit(connection: SftpConnection) {
    setEditError('')
    setError('')
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
    setEditError('')
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
      setEditError(err instanceof Error ? err.message : 'Unable to save SFTP')
    } finally {
      setSaving(false)
    }
  }

  async function onSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || saving) return
    setEditError('')
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
      await refresh().catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to refresh connections')
      })
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to update SFTP')
    } finally {
      setSaving(false)
    }
  }

  async function onTest(connection: SftpConnection, inEditModal = false) {
    if (testingId) return
    if (inEditModal) setEditError('')
    setTestingId(connection.id)
    try {
      await testSftpConnection(connection.id)
      setNotice(`${connection.name} connected`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SFTP test failed'
      if (inEditModal) setEditError(message)
      else setError(message)
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
      <PageBanner className="snapshot-hero" variant="sftp" label="SFTP & EDI" stats={<BannerSnapshot label="SFTP & EDI overview" items={[
 { label: 'Connections', value: counts.total, hint: 'Shared across warehouses' },
 { label: 'Enabled', value: counts.enabled, hint: 'Ready for file delivery' },
 { label: 'Off', value: counts.off, hint: 'Connections paused' },
 { label: 'Password set', value: counts.passwordSet, hint: 'Credentials saved' },
 ]} />}>
 <div className="analytics-anime-hero-copy">
  <div className="analytics-anime-crumb"><span>Company</span><span>/</span><strong>SFTP & EDI</strong></div>
  <div className="analytics-anime-title-row"><h1>SFTP &<em> EDI.</em></h1></div>
  <p>Secure warehouse connections and shipping files, together in one place.</p>
 </div>
 </PageBanner>



      <div className="sftp-status-tabs">

        <StatusTabs
          activeId={filter}
          onChange={(id) => setFilter(id as SftpFilter)}
          tabs={[
            { id: 'all', label: 'All', count: filter === 'all' ? counts.total : undefined },
            { id: 'enabled', label: 'Enabled', count: filter === 'enabled' ? counts.enabled : undefined },
            { id: 'off', label: 'Off', count: filter === 'off' ? counts.off : undefined },
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
        searchPlaceholder="Search name, host, port, username, or path…"
        onSearchChange={setQ}
      >
        <span className="sftp-search-count" role="status">
          {filtered.length} {filtered.length === 1 ? 'connection' : 'connections'}
        </span>
        <button type="button" className="demo-btn demo-btn-sm sftp-add-cta" onClick={openAdd}>
            <Plus size={14} aria-hidden />
            Add Connection
          </button>
      </ListToolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        pagination={{ page: currentPage, limit }}
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
      <Pagination
        page={currentPage}
        limit={limit}
        total={filtered.length}
        onPageChange={setPage}
        onLimitChange={(next) => { setLimit(next); setPage(1) }}
        limitOptions={[10, 25, 50, 100]}
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
          {editError ? <p className="ui-field-error" role="alert">{editError}</p> : null}
          <header className="users-dialog-hero">
            <div className="users-dialog-hero-icon" aria-hidden>
              <Cable size={22} />
            </div>
            <div>
              <h2>Add Connection</h2>
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
            <FormField label="Send 940s" hint="Automatically upload shipping files to this connection.">
              <label className={`sftp-enable-row${form.enabled ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={form.enabled}
                  onChange={(e) => patchForm('enabled', e.target.checked)}
                />
                <span>Automatic uploads</span>
              </label>
            </FormField>
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
            {editError ? (
              <p role="alert" style={{ margin: '1rem 1.5rem', color: 'var(--error, #b91c1c)' }}>{editError}</p>
            ) : null}
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
              <FormField label="Send 940s" hint="Automatically upload shipping files to this connection.">
                <label className={`sftp-enable-row${form.enabled ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={form.enabled}
                    onChange={(e) => patchForm('enabled', e.target.checked)}
                  />
                  <span>Automatic uploads</span>
                </label>
              </FormField>
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
                onClick={() => void onTest(editing, true)}
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
