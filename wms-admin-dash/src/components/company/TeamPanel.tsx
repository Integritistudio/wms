import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { Building2, Check, Mail, RefreshCw, Shield, UserPlus, Warehouse } from 'lucide-react'
import {
  Alert,
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
import {
  createCompanyUser,
  updateCompanyUser,
  inviteCompanyUser,
  listCompanyUsers,
  resetCompanyUser,
  getInviteEmailReady,
  type CompanyMember,
} from '../../lib/api'
import type { CompanyPermissions } from '../../lib/auth'
import { useCompanyPortal } from './CompanyPortalContext'

const DEFAULT_PERMISSIONS: CompanyPermissions = {
  orders: true,
  returns: true,
  failed: true,
  analytics: true,
  warehouses: false,
  sftp: false,
  routing: false,
  email: false,
  tracking: false,
}

const ALL_MODULES: Array<{ key: keyof CompanyPermissions; label: string; desc: string }> = [
  { key: 'analytics', label: 'Analytics', desc: 'Dashboards, rankings, and maps' },
  { key: 'orders', label: 'Orders & Shipments', desc: 'View, allocate & fulfill orders' },
  { key: 'returns', label: 'Returns', desc: 'Process RMA returns & restocking' },
  { key: 'failed', label: 'Failed', desc: 'Dead-letter queue resolution' },
  { key: 'warehouses', label: 'Warehouses', desc: 'Manage warehouses & EDI templates' },
  { key: 'sftp', label: 'SFTP & EDI', desc: 'Manage SFTP server configurations' },
  { key: 'routing', label: 'Order Routing', desc: 'Order routing rules & inventory' },
  { key: 'email', label: 'Email Settings', desc: 'Configure SMTP and alerts' },
  { key: 'tracking', label: 'Auto Tracking', desc: 'Shipoo auto shipment timeline updates' },
]

function initials(name: string, email: string) {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function roleLabel(role: string) {
  if (role === 'root') return 'Root'
  if (role === 'warehouse') return 'Warehouse'
  return 'Company'
}

function PermissionGrid({
  values,
  onToggle,
  onSelectAll,
  onClear,
}: {
  values: CompanyPermissions
  onToggle: (key: keyof CompanyPermissions) => void
  onSelectAll?: () => void
  onClear?: () => void
}) {
  const enabledCount = ALL_MODULES.filter((m) => values[m.key]).length
  return (
    <div className="users-perm-block">
      <div className="users-perm-head">
        <div>
          <strong>Module permissions</strong>
          <span>
            {enabledCount} of {ALL_MODULES.length} enabled
          </span>
        </div>
        {onSelectAll || onClear ? (
          <div className="users-perm-head-actions">
            {onSelectAll ? (
              <button type="button" className="users-perm-link" onClick={onSelectAll}>
                Select all
              </button>
            ) : null}
            {onClear ? (
              <button type="button" className="users-perm-link" onClick={onClear}>
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="users-perm-grid">
        {ALL_MODULES.map((mod) => {
          const on = Boolean(values[mod.key])
          return (
            <label key={mod.key} className={`users-perm-row${on ? ' is-on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => onToggle(mod.key)} />
              <span className="users-perm-check" aria-hidden>
                {on ? <Check size={12} strokeWidth={3} /> : null}
              </span>
              <span className="users-perm-copy">
                <strong>{mod.label}</strong>
                <span>{mod.desc}</span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

type UserFilter = 'all' | 'active' | 'pending' | 'disabled' | 'warehouse'

export default function TeamPanel() {
  const { company, setNotice, setInviteUrl, setError, refresh } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const [users, setUsers] = useState<CompanyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<UserFilter>('all')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'warehouse'>('member')
  const [warehouseIds, setWarehouseIds] = useState<string[]>([])
  const [permissions, setPermissions] = useState<CompanyPermissions>({ ...DEFAULT_PERMISSIONS })
  const [inviting, setInviting] = useState(false)
  const [smtpReady, setSmtpReady] = useState<boolean | null>(null)
  const [smtpMessage, setSmtpMessage] = useState('')
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)

  const [editingUser, setEditingUser] = useState<CompanyMember | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'member' | 'warehouse'>('member')
  const [editStatus, setEditStatus] = useState<string>('active')
  const [editWarehouseIds, setEditWarehouseIds] = useState<string[]>([])
  const [editPermissions, setEditPermissions] = useState<CompanyPermissions>({})
  const [savingEdit, setSavingEdit] = useState(false)

  async function loadUsers() {
    setLoading(true)
    try {
      setUsers(await listCompanyUsers())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users')
    } finally {
      setLoading(false)
    }
  }

  async function loadSmtpReady() {
    try {
      const status = await getInviteEmailReady()
      setSmtpReady(Boolean(status.ready))
      setSmtpMessage(
        status.ready
          ? ''
          : status.message || 'Set up SMTP in Email Settings before inviting users.',
      )
    } catch {
      setSmtpReady(null)
      setSmtpMessage('')
    }
  }

  useEffect(() => {
    void loadUsers()
    void loadSmtpReady()
  }, [])

  const counts = useMemo(() => {
    let active = 0
    let pending = 0
    let disabled = 0
    let warehouse = 0
    for (const u of users) {
      if (u.role === 'warehouse') warehouse += 1
      if (u.status === 'active') active += 1
      else if (u.status === 'disabled') disabled += 1
      else pending += 1
    }
    return { total: users.length, active, pending, disabled, warehouse }
  }, [users])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return users.filter((u) => {
      if (filter === 'active' && u.status !== 'active') return false
      if (filter === 'disabled' && u.status !== 'disabled') return false
      if (filter === 'pending' && (u.status === 'active' || u.status === 'disabled')) return false
      if (filter === 'warehouse' && u.role !== 'warehouse') return false
      if (!term) return true
      return (
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term) ||
        (u.status || '').toLowerCase().includes(term)
      )
    })
  }, [users, q, filter])

  function togglePermission(key: keyof CompanyPermissions) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleEditPermission(key: keyof CompanyPermissions) {
    setEditPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function setAllPermissions(target: 'invite' | 'edit', on: boolean) {
    const next = Object.fromEntries(ALL_MODULES.map((m) => [m.key, on])) as CompanyPermissions
    if (target === 'invite') setPermissions(next)
    else setEditPermissions(next)
  }

  function resetInviteForm() {
    setName('')
    setEmail('')
    setRole('member')
    setWarehouseIds([])
    setPermissions({ ...DEFAULT_PERMISSIONS })
  }

  function openInvite() {
    resetInviteForm()
    setInviteOpen(true)
    void loadSmtpReady()
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inviting) return

    if (smtpReady === false) {
      setError(smtpMessage || 'Set up SMTP in Email Settings before inviting users.')
      return
    }

    setInviting(true)
    setError('')
    const inviteEmail = email.trim()
    const inviteName = name.trim()
    try {
      const result = await createCompanyUser({
        name: inviteName,
        email: inviteEmail,
        role,
        warehouseIds: role === 'warehouse' ? warehouseIds : [],
        permissions,
      })
      resetInviteForm()
      setInviteOpen(false)
      setInviteUrl(result.inviteUrl || '')
      setNotice(
        result.inviteSent
          ? `Invite emailed to ${inviteEmail}`
          : 'Invite email was not sent. Copy the link.',
      )
      await Promise.all([loadUsers(), loadSmtpReady(), refresh()])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to add user'
      setError(message)
      if (/smtp/i.test(message)) {
        setSmtpReady(false)
        setSmtpMessage(message)
      }
    } finally {
      setInviting(false)
    }
  }

  function openEditModal(user: CompanyMember) {
    setEditingUser(user)
    setEditName(user.name)
    setEditRole(user.role === 'warehouse' ? 'warehouse' : 'member')
    setEditStatus(user.status || 'active')
    setEditWarehouseIds(user.warehouseIds || [])
    setEditPermissions(user.permissions || { ...DEFAULT_PERMISSIONS })
  }

  async function handleSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingUser) return
    setSavingEdit(true)
    setError('')
    try {
      await updateCompanyUser(editingUser.id, {
        name: editName,
        role: editRole,
        status: editStatus,
        warehouseIds: editRole === 'warehouse' ? editWarehouseIds : [],
        permissions: editPermissions,
      })
      setEditingUser(null)
      await loadUsers()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSavingEdit(false)
    }
  }

  const columns: DataTableColumn<CompanyMember>[] = [
    {
      key: 'user',
      header: 'User',
      className: 'users-col-user',
      sortable: true,
      sortValue: (user) => user.name,
      render: (user) => (
        <div className="users-user-cell">
          <span
            className={`users-avatar tone-${user.role === 'root' ? 'root' : user.role === 'warehouse' ? 'wh' : 'member'}`}
            aria-hidden
          >
            {initials(user.name, user.email)}
          </span>
          <div className="users-user-copy">
            <div className="demo-cell-primary">{user.name}</div>
            <div className="demo-cell-secondary">{user.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      className: 'users-col-role',
      render: (user) => (
        <div className="users-role-cell">
          <StatusBadge status={user.role} label={roleLabel(user.role)} />
          {user.role === 'warehouse' && (user.warehouseIds || []).length > 0 ? (
            <span className="users-wh-count">
              {user.warehouseIds.length} warehouse{(user.warehouseIds || []).length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      className: 'users-col-perms',
      render: (user) => {
        if (user.role === 'root') {
          return <span className="users-root-chip">All modules</span>
        }
        const enabled = ALL_MODULES.filter((m) => user.permissions?.[m.key])
        if (!enabled.length) {
          return <span className="users-perm-none">None</span>
        }
        const shown = enabled.slice(0, 3)
        const rest = enabled.length - shown.length
        return (
          <div className="users-perm-chips">
            {shown.map((m) => (
              <span key={m.key} className="users-perm-chip">
                {m.label}
              </span>
            ))}
            {rest > 0 ? <span className="users-perm-chip is-more">+{rest}</span> : null}
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      className: 'users-col-status',
      render: (user) => (
        <StatusBadge
          status={user.status}
          variant={user.status === 'active' ? 'success' : user.status === 'disabled' ? 'danger' : 'warning'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      className: 'users-col-actions',
      render: (user) => {
        const canInvite =
          user.role !== 'root' && user.status !== 'active' && user.status !== 'invited'
        const busy = rowBusyId === user.id

        return (
          <div className="users-actions">
            {user.role !== 'root' ? (
              <button className="users-action-btn" type="button" onClick={() => openEditModal(user)}>
                Edit
              </button>
            ) : null}
            {canInvite ? (
              <button
                className="users-action-btn is-primary"
                type="button"
                disabled={busy || smtpReady === false}
                aria-busy={busy}
                onClick={() => {
                  if (rowBusyId) return
                  if (smtpReady === false) {
                    setError(smtpMessage || 'Set up SMTP in Email Settings before inviting users.')
                    return
                  }
                  setRowBusyId(user.id)
                  void inviteCompanyUser(user.id)
                    .then((result) => {
                      setInviteUrl(result.inviteUrl || '')
                      setNotice(result.inviteSent ? 'Invite sent' : 'Copy the invite link')
                      return loadUsers()
                    })
                    .catch((err) => {
                      const message = err instanceof Error ? err.message : 'Unable to invite'
                      setError(message)
                      if (/smtp/i.test(message)) {
                        setSmtpReady(false)
                        setSmtpMessage(message)
                      }
                    })
                    .finally(() => setRowBusyId(null))
                }}
              >
                {busy ? 'Inviting…' : 'Invite'}
              </button>
            ) : null}
            {user.role !== 'root' ? (
              <button
                className="users-action-btn is-ghost"
                type="button"
                disabled={busy}
                aria-busy={busy}
                onClick={() => {
                  if (rowBusyId) return
                  setRowBusyId(user.id)
                  void resetCompanyUser(user.id)
                    .then((result) => {
                      setInviteUrl(result.resetUrl || '')
                      setNotice(result.sent ? 'Reset email sent' : 'Copy the reset link')
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : 'Unable to reset'))
                    .finally(() => setRowBusyId(null))
                }}
              >
                {busy ? 'Working…' : 'Reset'}
              </button>
            ) : null}
          </div>
        )
      },
    },
  ]

  return (
    <div className="oj-page oj-skel users-page">
      <PageHeader
        title="Users"
        description="Invite company and warehouse users, assign module access, and manage activation."
        count={counts.total}
        actions={
          <button type="button" className="demo-btn demo-btn-sm users-invite-cta" onClick={openInvite}>
            <UserPlus size={14} aria-hidden />
            Invite user
          </button>
        }
      />

      <div className="users-stats" aria-label="User summary">
        <div className="users-stat">
          <span className="users-stat-label">Total</span>
          <strong className="users-stat-value">{counts.total}</strong>
        </div>
        <div className="users-stat is-ok">
          <span className="users-stat-label">Active</span>
          <strong className="users-stat-value">{counts.active}</strong>
        </div>
        <div className={`users-stat${counts.pending > 0 ? ' is-warn' : ''}`}>
          <span className="users-stat-label">Pending</span>
          <strong className="users-stat-value">{counts.pending}</strong>
        </div>
        <div className="users-stat">
          <span className="users-stat-label">Warehouse</span>
          <strong className="users-stat-value">{counts.warehouse}</strong>
        </div>
      </div>

      <div className="users-status-tabs">
        <StatusTabs
          activeId={filter}
          onChange={(id) => setFilter(id as UserFilter)}
          tabs={[
            { id: 'all', label: 'All', count: counts.total || undefined },
            { id: 'active', label: 'Active', count: counts.active || undefined },
            { id: 'pending', label: 'Pending', count: counts.pending || undefined },
            { id: 'warehouse', label: 'Warehouse', count: counts.warehouse || undefined },
            { id: 'disabled', label: 'Disabled', count: counts.disabled || undefined },
          ]}
        />
        <button
          type="button"
          className="orders-refresh-btn"
          onClick={() => void loadUsers()}
          disabled={loading}
          aria-label="Refresh users"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

      <ListToolbar
        search={q}
        searchPlaceholder="Search name, email, role…"
        onSearchChange={setQ}
        resultCount={filtered.length}
        resultLabel="users"
        onClear={() => setQ('')}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(user) => user.id}
        loading={loading}
        emptyTitle="No users match"
        emptyMessage={
          filter === 'all' && !q.trim()
            ? 'Invite your first team member with Invite user.'
            : 'Try another filter or clear search.'
        }
      />

      <Modal
        open={inviteOpen}
        onClose={() => {
          if (!inviting) setInviteOpen(false)
        }}
        title="Invite user"
        description="Send an activation invite and choose which modules they can access."
        className="users-dialog"
      >
        <form className="users-dialog-body" onSubmit={onCreate} aria-busy={inviting}>
          <header className="users-dialog-hero">
            <div className="users-dialog-hero-icon" aria-hidden>
              <UserPlus size={22} />
            </div>
            <div>
              <h2>Invite user</h2>
              <p>They’ll receive an email link to set a password and join this company.</p>
            </div>
          </header>

          {smtpReady === false ? (
            <Alert tone="danger">
              {smtpMessage || 'Set up SMTP before inviting users.'}{' '}
              <Link to="/account/email" className="demo-link" onClick={() => setInviteOpen(false)}>
                Open Email Settings
              </Link>
            </Alert>
          ) : (
            <div className="users-smtp-ready">
              <Mail size={14} aria-hidden />
              Invite email is ready to send
            </div>
          )}

          <fieldset disabled={inviting} className="users-dialog-fields">
            <div className="users-dialog-grid">
              <FormField label="Full name">
                <input
                  className="demo-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Jane Cooper"
                />
              </FormField>
              <FormField label="Work email">
                <input
                  className="demo-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="jane@company.com"
                />
              </FormField>
            </div>

            <div className="users-role-picker" role="radiogroup" aria-label="Role type">
              <button
                type="button"
                className={`users-role-card${role === 'member' ? ' is-active' : ''}`}
                onClick={() => setRole('member')}
                aria-pressed={role === 'member'}
              >
                <Building2 size={18} aria-hidden />
                <strong>Company user</strong>
                <span>Access all data within granted modules</span>
              </button>
              <button
                type="button"
                className={`users-role-card${role === 'warehouse' ? ' is-active' : ''}`}
                onClick={() => setRole('warehouse')}
                aria-pressed={role === 'warehouse'}
              >
                <Warehouse size={18} aria-hidden />
                <strong>Warehouse user</strong>
                <span>Scoped to selected warehouses only</span>
              </button>
            </div>

            {role === 'warehouse' ? (
              <FormField label="Assigned warehouses" hint="Hold Ctrl/Cmd to select multiple">
                <select
                  className="demo-input users-wh-select"
                  multiple
                  value={warehouseIds}
                  onChange={(e) =>
                    setWarehouseIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                  }
                  required
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code || 'No code'})
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}

            <PermissionGrid
              values={permissions}
              onToggle={togglePermission}
              onSelectAll={() => setAllPermissions('invite', true)}
              onClear={() => setAllPermissions('invite', false)}
            />
          </fieldset>

          <footer className="users-dialog-footer">
            <Button type="button" variant="secondary" disabled={inviting} onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviting || smtpReady === false} aria-busy={inviting}>
              <UserPlus size={15} aria-hidden />
              {inviting ? 'Sending…' : 'Send invite'}
            </Button>
          </footer>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingUser)}
        onClose={() => {
          if (!savingEdit) setEditingUser(null)
        }}
        title={editingUser ? `Edit ${editingUser.name}` : 'Edit user'}
        description="Update profile, role, status, and module permissions."
        className="users-dialog"
      >
        {editingUser ? (
          <form id="edit-user-form" className="users-dialog-body" onSubmit={handleSaveEdit}>
            <header className="users-dialog-hero">
              <div className="users-dialog-hero-icon is-edit" aria-hidden>
                <Shield size={22} />
              </div>
              <div>
                <h2>Edit user & permissions</h2>
                <p>{editingUser.email}</p>
              </div>
            </header>

            <div className="users-perm-summary" aria-label="Current permissions">
              <span className="users-perm-summary-label">Enabled now</span>
              <div className="users-perm-summary-chips">
                {ALL_MODULES.filter((m) => editPermissions[m.key]).length ? (
                  ALL_MODULES.filter((m) => editPermissions[m.key]).map((m) => (
                    <span key={m.key} className="users-perm-chip">
                      {m.label}
                    </span>
                  ))
                ) : (
                  <span className="users-perm-none">No modules enabled</span>
                )}
              </div>
            </div>

            <div className="users-dialog-grid">
              <FormField label="Full name" className="span-2">
                <input
                  className="demo-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Status">
                <select
                  className="demo-input"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </FormField>
            </div>

            <div className="users-role-picker" role="radiogroup" aria-label="Role type">
              <button
                type="button"
                className={`users-role-card${editRole === 'member' ? ' is-active' : ''}`}
                onClick={() => setEditRole('member')}
                aria-pressed={editRole === 'member'}
              >
                <Building2 size={18} aria-hidden />
                <strong>Company user</strong>
                <span>Access all data within granted modules</span>
              </button>
              <button
                type="button"
                className={`users-role-card${editRole === 'warehouse' ? ' is-active' : ''}`}
                onClick={() => setEditRole('warehouse')}
                aria-pressed={editRole === 'warehouse'}
              >
                <Warehouse size={18} aria-hidden />
                <strong>Warehouse user</strong>
                <span>Scoped to selected warehouses only</span>
              </button>
            </div>

            {editRole === 'warehouse' ? (
              <FormField label="Assigned warehouses" hint="Hold Ctrl/Cmd to select multiple">
                <select
                  className="demo-input users-wh-select"
                  multiple
                  value={editWarehouseIds}
                  onChange={(e) =>
                    setEditWarehouseIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                  }
                  required
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code || 'No code'})
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}

            <PermissionGrid
              values={editPermissions}
              onToggle={toggleEditPermission}
              onSelectAll={() => setAllPermissions('edit', true)}
              onClear={() => setAllPermissions('edit', false)}
            />

            <footer className="users-dialog-footer">
              <Button type="button" variant="secondary" disabled={savingEdit} onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit} aria-busy={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save changes'}
              </Button>
            </footer>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
