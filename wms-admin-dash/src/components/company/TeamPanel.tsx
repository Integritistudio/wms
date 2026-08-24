import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { DataTable, FormField, ListToolbar, PageHeader, PageSection, StatusBadge } from '../ui'
import {
  createCompanyUser,
  inviteCompanyUser,
  listCompanyUsers,
  resetCompanyUser,
  type CompanyMember,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'

export default function TeamPanel() {
  const { company, setNotice, setInviteUrl, setError, refresh } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const [users, setUsers] = useState<CompanyMember[]>([])
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'warehouse'>('member')
  const [warehouseIds, setWarehouseIds] = useState<string[]>([])

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

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const result = await createCompanyUser({
        name,
        email,
        role,
        warehouseIds: role === 'warehouse' ? warehouseIds : [],
      })
      setName('')
      setEmail('')
      setWarehouseIds([])
      setInviteUrl(result.inviteUrl || '')
      setNotice(result.inviteSent ? `Invite emailed to ${email}` : 'Invite email was not sent. Copy the link.')
      await loadUsers()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add user')
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader title="Users" description="Invite company and warehouse users." count={users.length} />

      <PageSection title="Invite user" description="New users receive an invite link to set their password.">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
          <FormField label="Name">
            <input className="demo-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Email">
            <input className="demo-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </FormField>
          <FormField label="Role">
            <select className="demo-input" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'warehouse')}>
              <option value="member">Company user</option>
              <option value="warehouse">Warehouse user</option>
            </select>
          </FormField>
          {role === 'warehouse' ? (
            <FormField label="Warehouses" hint="Hold Ctrl/Cmd to select multiple">
              <select
                className="demo-input"
                multiple
                value={warehouseIds}
                onChange={(e) => setWarehouseIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                required
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : (
            <p className="demo-muted self-end text-sm">Can view all orders and upload 945s.</p>
          )}
          <div className="md:col-span-2">
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
                <div className="demo-cell-primary">{user.name}</div>
                <div className="demo-cell-secondary">{user.email}</div>
              </div>
            ),
          },
          {
            key: 'role',
            header: 'Role',
            render: (user) => <StatusBadge status={user.role} />,
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
              <div className="demo-action-group">
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
                  Resend invite
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
                  Password reset
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
    </div>
  )
}
