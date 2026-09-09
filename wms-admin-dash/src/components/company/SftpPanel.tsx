import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
  PageHeader,
  PageSection,
  StatusBadge,
  type DataTableColumn,
} from '../ui'
import { useCompanyPortal } from './CompanyPortalContext'

function SftpConnectionCard({
  connection,
  onError,
  onNotice,
  onDone,
  onClose,
}: {
  connection: SftpConnection
  onError: (value: string) => void
  onNotice: (value: string) => void
  onDone: () => void
  onClose?: () => void
}) {
  const [name, setName] = useState(connection.name)
  const [enabled, setEnabled] = useState(connection.enabled)
  const [host, setHost] = useState(connection.host)
  const [port, setPort] = useState(String(connection.port || 22))
  const [username, setUsername] = useState(connection.username)
  const [password, setPassword] = useState('')
  const [remotePath, setRemotePath] = useState(connection.remotePath)

  useEffect(() => {
    setName(connection.name)
    setEnabled(connection.enabled)
    setHost(connection.host)
    setPort(String(connection.port || 22))
    setUsername(connection.username)
    setRemotePath(connection.remotePath)
  }, [connection])

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await updateSftpConnection(connection.id, {
        name,
        enabled,
        host,
        port: Number(port || 22),
        username,
        password: password || undefined,
        remotePath,
      })
      setPassword('')
      onNotice(`${name} saved.`)
      onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update SFTP')
    }
  }

  return (
    <PageSection
      title={`Edit: ${connection.name}`}
      description="Update credentials and remote path. Leave password blank to keep the current one."
      actions={
        onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null
      }
    >
      <form className="ui-form-grid" onSubmit={onSave}>
        <FormField label="Name">
          <input className="demo-input" value={name} onChange={(event) => setName(event.target.value)} required />
        </FormField>
        <label className="ui-checkbox-row self-end">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>Send 940s over this connection</span>
        </label>
        <FormField label="Host">
          <input className="demo-input" value={host} onChange={(event) => setHost(event.target.value)} />
        </FormField>
        <FormField label="Port">
          <input className="demo-input" value={port} onChange={(event) => setPort(event.target.value)} />
        </FormField>
        <FormField label="Username">
          <input className="demo-input" value={username} onChange={(event) => setUsername(event.target.value)} />
        </FormField>
        <FormField label="Password" hint={connection.passwordSet ? 'Leave blank to keep current password.' : undefined}>
          <input
            className="demo-input"
            type="password"
            placeholder={connection.passwordSet ? 'Password (unchanged)' : 'Password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        <FormField label="Remote path" className="span-2">
          <input
            className="demo-input"
            value={remotePath}
            onChange={(event) => setRemotePath(event.target.value)}
          />
        </FormField>
        <div className="ui-inline-actions span-2">
          <Button type="submit">Save</Button>
          <Button
            variant="secondary"
            onClick={() =>
              void testSftpConnection(connection.id)
                .then(() => onNotice(`${connection.name} connected`))
                .catch((err) => onError(err instanceof Error ? err.message : 'SFTP test failed'))
            }
          >
            Test connection
          </Button>
        </div>
      </form>
    </PageSection>
  )
}

export default function SftpPanel() {
  const { company, setError, setNotice, refresh } = useCompanyPortal()
  const connections = company?.sftpConnections || []

  const [q, setQ] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remotePath, setRemotePath] = useState('/inbound/940')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return connections
    return connections.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.host.toLowerCase().includes(term) ||
        c.username.toLowerCase().includes(term) ||
        (c.remotePath || '').toLowerCase().includes(term),
    )
  }, [connections, q])

  const editing = editingId ? connections.find((c) => c.id === editingId) : null

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await createSftpConnection({
        name,
        enabled,
        host,
        port: Number(port || 22),
        username,
        password: password || undefined,
        remotePath,
      })
      setName('')
      setHost('')
      setUsername('')
      setPassword('')
      setRemotePath('/inbound/940')
      setEnabled(true)
      setNotice('SFTP connection saved. Attach it to one or more warehouses.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save SFTP')
    }
  }

  const columns: DataTableColumn<SftpConnection>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => <span className="demo-cell-primary">{row.name}</span>,
    },
    {
      key: 'host',
      header: 'Host',
      render: (row) => (
        <div>
          <div>{row.host}</div>
          <div className="demo-cell-secondary">:{row.port || 22}</div>
        </div>
      ),
    },
    {
      key: 'username',
      header: 'Username',
      render: (row) => row.username || '—',
    },
    {
      key: 'path',
      header: 'Remote path',
      render: (row) => row.remotePath || '—',
    },
    {
      key: 'status',
      header: 'Status',
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
      render: (row) => (
        <div className="demo-action-group">
          <button
            type="button"
            className="demo-btn demo-btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              setEditingId(editingId === row.id ? null : row.id)
            }}
          >
            {editingId === row.id ? 'Close' : 'Edit'}
          </button>
          <button
            type="button"
            className="demo-btn demo-btn-sm demo-btn-ghost"
            onClick={(e) => {
              e.stopPropagation()
              void testSftpConnection(row.id)
                .then(() => setNotice(`${row.name} connected`))
                .catch((err) => setError(err instanceof Error ? err.message : 'SFTP test failed'))
            }}
          >
            Test
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-5">
      <PageHeader
        title="SFTP Connections"
        description="Warehouses pick a connection. When sending is on, 940s upload automatically."
        count={connections.length}
      />

      <PageSection title="Add an SFTP connection" description="Create a connection, then attach it on the Warehouses page.">
        <form className="ui-form-grid" onSubmit={onCreate}>
          <FormField label="Name">
            <input
              className="demo-input"
              placeholder="e.g. Main 3PL"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </FormField>
          <label className="ui-checkbox-row self-end">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>Send 940s over this connection</span>
          </label>
          <FormField label="Host">
            <input className="demo-input" value={host} onChange={(event) => setHost(event.target.value)} required />
          </FormField>
          <FormField label="Port">
            <input className="demo-input" value={port} onChange={(event) => setPort(event.target.value)} />
          </FormField>
          <FormField label="Username">
            <input
              className="demo-input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Password">
            <input
              className="demo-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          <FormField label="Remote path" className="span-2">
            <input
              className="demo-input"
              value={remotePath}
              onChange={(event) => setRemotePath(event.target.value)}
            />
          </FormField>
          <div className="span-2">
            <Button type="submit">Save connection</Button>
          </div>
        </form>
      </PageSection>

      <PageSection title="Your connections" description="Select a row to edit, or use Test to verify credentials." flush>
        <ListToolbar
          search={q}
          searchPlaceholder="Search connections…"
          onSearchChange={setQ}
          resultCount={filtered.length}
          resultLabel="connections"
          onClear={() => setQ('')}
        />

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          emptyTitle="No SFTP connections"
          emptyMessage="Add a connection above, then attach it to a warehouse."
          onRowClick={(row) => setEditingId(editingId === row.id ? null : row.id)}
          selectedKey={editingId}
        />
      </PageSection>

      {editing ? (
        <SftpConnectionCard
          connection={editing}
          onError={setError}
          onNotice={setNotice}
          onDone={() => void refresh()}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </div>
  )
}
