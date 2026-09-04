import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { DataTable, FormField, ListToolbar, PageHeader, PageSection, StatusBadge } from '../ui'
import {
  createCompanyUser,
  updateCompanyUser,
  inviteCompanyUser,
  listCompanyUsers,
  resetCompanyUser,
  type CompanyMember,
} from '../../lib/api'
import type { CompanyPermissions } from '../../lib/auth'
import { useCompanyPortal } from './CompanyPortalContext'

const ALL_MODULES: Array<{ key: keyof CompanyPermissions; label: string; desc: string }> = [
  { key: 'orders', label: 'Orders', desc: 'View, allocate & fulfill orders' },
  { key: 'returns', label: 'Returns', desc: 'Process RMA returns & restocking' },
  { key: 'failed', label: 'Failed Orders', desc: 'Dead-letter queue resolution' },
  { key: 'analytics', label: 'Analytics', desc: 'Dashboards, rankings, and maps' },
  { key: 'warehouses', label: 'Warehouses', desc: 'Manage warehouses & EDI templates' },
  { key: 'sftp', label: 'SFTP', desc: 'Manage SFTP server configurations' },
  { key: 'routing', label: 'Routing', desc: 'Order routing rules & inventory' },
  { key: 'email', label: 'Email Settings', desc: 'Configure SMTP and alerts' },
]

export default function TeamPanel() {
  const { company, setNotice, setInviteUrl, setError, refresh } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const [users, setUsers] = useState<CompanyMember[]>([])
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'warehouse'>('member')
  const [warehouseIds, setWarehouseIds] = useState<string[]>([])
  const [permissions, setPermissions] = useState<CompanyPermissions>({
    orders: true,
    returns: true,
    failed: true,
    analytics: true,
    warehouses: false,
    sftp: false,
    routing: false,
    email: false,
  })

  // Edit User State
  const [editingUser, setEditingUser] = useState<CompanyMember | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'member' | 'warehouse'>('member')
  const [editStatus, setEditStatus] = useState<string>('active')
  const [editWarehouseIds, setEditWarehouseIds] = useState<string[]>([])
  const [editPermissions, setEditPermissions] = useState<CompanyPermissions>({})
  const [savingEdit, setSavingEdit] = useState(false)

  async function loadUsers() {
    try {
      setUsers(await listCompanyUsers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users')
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term),
    )
  }, [users, q])

  function togglePermission(key: keyof CompanyPermissions) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleEditPermission(key: keyof CompanyPermissions) {
    setEditPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      const result = await createCompanyUser({
        name,
        email,
        role,
        warehouseIds: role === 'warehouse' ? warehouseIds : [],
        permissions,
      })
      setName('')
      setEmail('')
      setWarehouseIds([])
      setPermissions({
        orders: true,
        returns: true,
        failed: true,
        analytics: true,
        warehouses: false,
        sftp: false,
        routing: false,
        email: false,
      })
      setInviteUrl(result.inviteUrl || '')
      setNotice(result.inviteSent ? `Invite emailed to ${email}` : 'Invite email was not sent. Copy the link.')
      await loadUsers()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add user')
    }
  }

  function openEditModal(user: CompanyMember) {
    setEditingUser(user)
    setEditName(user.name)
    setEditRole(user.role === 'warehouse' ? 'warehouse' : 'member')
    setEditStatus(user.status || 'active')
    setEditWarehouseIds(user.warehouseIds || [])
    setEditPermissions(user.permissions || {
      orders: true,
      returns: true,
      failed: true,
      analytics: true,
      warehouses: false,
      sftp: false,
      routing: false,
      email: false,
    })
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

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Users & Permissions"
        description="Invite company users, assign warehouse-level scoping, and configure fine-grained module access."
        count={users.length}
      />

      <PageSection title="Invite User" description="New users receive an activation invite link to set their password.">
        <form className="grid gap-4" onSubmit={onCreate}>
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Name">
              <input className="demo-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label="Email">
              <input className="demo-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </FormField>
            <FormField label="Role Type">
              <select className="demo-input" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'warehouse')}>
                <option value="member">Company User (All Assigned Data)</option>
                <option value="warehouse">Warehouse User (Warehouse Scoped)</option>
              </select>
            </FormField>
          </div>

          {role === 'warehouse' ? (
            <FormField label="Assigned Warehouses" hint="Hold Ctrl/Cmd to select multiple">
              <select
                className="demo-input"
                multiple
                value={warehouseIds}
                onChange={(e) => setWarehouseIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
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

          <div>
            <span className="block text-sm font-medium mb-2">Module Permissions</span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {ALL_MODULES.map((mod) => (
                <label
                  key={mod.key}
                  className="flex items-center gap-2 p-2 rounded border border-[var(--border,#e5e7eb)] cursor-pointer text-xs select-none hover:bg-[var(--card-subtle,#f9fafb)]"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(permissions[mod.key])}
                    onChange={() => togglePermission(mod.key)}
                  />
                  <div>
                    <div className="font-semibold">{mod.label}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <button className="demo-button" type="submit">
              Invite user
            </button>
          </div>
        </form>
      </PageSection>

      <ListToolbar
        search={q}
        searchPlaceholder="Search name, email, role…"
        onSearchChange={setQ}
        resultCount={filtered.length}
        resultLabel="users"
        onClear={() => setQ('')}
      />

      <DataTable
        columns={[
          {
            key: 'user',
            header: 'User',
            sortable: true,
            sortValue: (user) => user.name,
            render: (user) => (
              <div>
                <div className="demo-cell-primary font-medium">{user.name}</div>
                <div className="demo-cell-secondary text-xs">{user.email}</div>
              </div>
            ),
          },
          {
            key: 'role',
            header: 'Role',
            render: (user) => (
              <div>
                <StatusBadge status={user.role} />
                {user.role === 'warehouse' && (user.warehouseIds || []).length > 0 ? (
                  <div className="text-xs text-gray-500 mt-1">
                    {user.warehouseIds.length} warehouse(s)
                  </div>
                ) : null}
              </div>
            ),
          },
          {
            key: 'permissions',
            header: 'Permissions',
            render: (user) => {
              if (user.role === 'root') {
                return <span className="text-xs font-semibold text-blue-600">All Modules (Root)</span>
              }
              const enabled = ALL_MODULES.filter((m) => user.permissions?.[m.key])
              if (!enabled.length) {
                return <span className="text-xs text-gray-400">None</span>
              }
              return (
                <div className="flex flex-wrap gap-1">
                  {enabled.map((m) => (
                    <span
                      key={m.key}
                      style={{
                        padding: '0.15rem 0.45rem',
                        fontSize: '0.7rem',
                        borderRadius: '4px',
                        background: 'var(--card-subtle, #f3f4f6)',
                        border: '1px solid var(--border, #e5e7eb)',
                      }}
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
              )
            },
          },
          {
            key: 'status',
            header: 'Status',
            render: (user) => (
              <StatusBadge status={user.status} variant={user.status === 'active' ? 'success' : 'warning'} />
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (user) => (
              <div className="demo-action-group flex items-center justify-end gap-1.5">
                {user.role !== 'root' ? (
                  <button
                    className="demo-btn demo-btn-sm"
                    type="button"
                    onClick={() => openEditModal(user)}
                  >
                    Edit
                  </button>
                ) : null}
                <button
                  className="demo-btn demo-btn-sm"
                  type="button"
                  onClick={() =>
                    void inviteCompanyUser(user.id)
                      .then((result) => {
                        setInviteUrl(result.inviteUrl || '')
                        setNotice(result.inviteSent ? 'Invite sent' : 'Copy the invite link')
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to invite'))
                  }
                >
                  Invite
                </button>
                <button
                  className="demo-btn demo-btn-sm demo-btn-ghost"
                  type="button"
                  onClick={() =>
                    void resetCompanyUser(user.id)
                      .then((result) => {
                        setInviteUrl(result.resetUrl || '')
                        setNotice(result.sent ? 'Reset email sent' : 'Copy the reset link')
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to reset'))
                  }
                >
                  Reset
                </button>
              </div>
            ),
          },
        ]}
        rows={filtered}
        rowKey={(user) => user.id}
        emptyTitle="No users yet"
        emptyMessage="Invite your first team member above."
      />

      {/* Edit User Modal */}
      {editingUser ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'var(--card-bg, #fff)',
              borderRadius: '8px',
              maxWidth: '550px',
              width: '100%',
              padding: '1.5rem',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', fontWeight: 600 }}>
              Edit User: {editingUser.email}
            </h3>

            <form onSubmit={handleSaveEdit} className="grid gap-3">
              <FormField label="Full Name">
                <input
                  className="demo-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Role Type">
                  <select
                    className="demo-input"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as 'member' | 'warehouse')}
                  >
                    <option value="member">Company User</option>
                    <option value="warehouse">Warehouse User</option>
                  </select>
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

              {editRole === 'warehouse' ? (
                <FormField label="Assigned Warehouses" hint="Hold Ctrl/Cmd to select multiple">
                  <select
                    className="demo-input"
                    multiple
                    value={editWarehouseIds}
                    onChange={(e) => setEditWarehouseIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
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

              <div>
                <span className="block text-sm font-medium mb-1">Module Permissions</span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {ALL_MODULES.map((mod) => (
                    <label
                      key={mod.key}
                      className="flex items-center gap-2 p-2 rounded border border-[var(--border,#e5e7eb)] cursor-pointer text-xs select-none hover:bg-[var(--card-subtle,#f9fafb)]"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(editPermissions[mod.key])}
                        onChange={() => toggleEditPermission(mod.key)}
                      />
                      <div>
                        <div className="font-semibold">{mod.label}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  className="demo-btn demo-btn-secondary"
                  onClick={() => setEditingUser(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="demo-button" disabled={savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
