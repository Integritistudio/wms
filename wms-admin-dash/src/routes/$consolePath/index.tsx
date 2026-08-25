import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import PlatformShell from '../../components/PlatformShell'
import {
  DataTable,
  FormField,
  ListToolbar,
  PageHeader,
  PageSection,
  StatusBadge,
  type DataTableColumn,
} from '../../components/ui'
import {
  createCompany,
  listCompanies,
  updateCompany,
  softDeleteCompany,
  restoreCompany,
  approveCompany,
  rejectCompany,
  resendCompanyInvite,
  listShops,
  assignShop,
  type Company,
  type Shop,
} from '../../lib/api'
import { isPlatformAuthenticated } from '../../lib/auth'
import { ADMIN_CONSOLE_PATH } from '../../lib/config'

export const Route = createFileRoute('/$consolePath/')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (!isPlatformAuthenticated()) {
      throw redirect({ to: '/$consolePath/login', params })
    }
  },
  component: CompaniesPage,
})

type TabKey = 'all' | 'pending' | 'active' | 'invited' | 'disabled' | 'deleted'

function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [orphanShops, setOrphanShops] = useState<Shop[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Edit Modal State
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState<Company['status']>('active')
  const [savingEdit, setSavingEdit] = useState(false)

  // Reject Modal State
  const [rejectingCompany, setRejectingCompany] = useState<Company | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [submittingReject, setSubmittingReject] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const [nextCompanies, nextShops] = await Promise.all([
        listCompanies({ includeDeleted: true }),
        listShops(),
      ])
      setCompanies(nextCompanies)
      setOrphanShops(nextShops.filter((shop) => !shop.companyId))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load companies')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const pendingCount = useMemo(() => {
    return companies.filter((c) => c.status === 'pending' && !c.isDeleted).length
  }, [companies])

  const filteredCompanies = useMemo(() => {
    let list = companies
    if (activeTab === 'pending') {
      list = list.filter((c) => c.status === 'pending' && !c.isDeleted)
    } else if (activeTab === 'active') {
      list = list.filter((c) => c.status === 'active' && !c.isDeleted)
    } else if (activeTab === 'invited') {
      list = list.filter((c) => c.status === 'invited' && !c.isDeleted)
    } else if (activeTab === 'disabled') {
      list = list.filter((c) => c.status === 'disabled' && !c.isDeleted)
    } else if (activeTab === 'deleted') {
      list = list.filter((c) => c.isDeleted === true)
    } else {
      list = list.filter((c) => !c.isDeleted)
    }

    const term = q.trim().toLowerCase()
    if (!term) return list
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.email || '').toLowerCase().includes(term) ||
        (c.phone || '').toLowerCase().includes(term),
    )
  }, [companies, activeTab, q])

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      const result = await createCompany({ name, email, phone, notes })
      setName('')
      setEmail('')
      setPhone('')
      setNotes('')
      setInviteUrl(result.inviteUrl || '')
      setNotice(
        result.inviteSent
          ? `Invite emailed to ${result.company?.email || email}`
          : 'Company created. Email was not sent — copy the invite link below.',
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add company')
    }
  }

  function openEditModal(company: Company) {
    setEditingCompany(company)
    setEditName(company.name)
    setEditEmail(company.email)
    setEditPhone(company.phone || '')
    setEditNotes(company.notes || '')
    setEditStatus(company.status)
  }

  async function handleSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingCompany) return
    setSavingEdit(true)
    setError('')
    try {
      await updateCompany(editingCompany.id, {
        name: editName,
        email: editEmail,
        phone: editPhone,
        notes: editNotes,
        status: editStatus,
      })
      setEditingCompany(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update company')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleApprove(company: Company) {
    if (!window.confirm(`Approve and activate company "${company.name}"?`)) return
    setError('')
    try {
      await approveCompany(company.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve company')
    }
  }

  async function handleRejectSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!rejectingCompany) return
    setSubmittingReject(true)
    setError('')
    try {
      await rejectCompany(rejectingCompany.id, rejectionReason)
      setRejectingCompany(null)
      setRejectionReason('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject company')
    } finally {
      setSubmittingReject(false)
    }
  }

  async function handleSoftDelete(company: Company) {
    if (
      !window.confirm(
        `Are you sure you want to soft-delete "${company.name}"? It will be disabled and kept in the 6-month retention cycle before permanent purge.`,
      )
    ) {
      return
    }
    setError('')
    try {
      await softDeleteCompany(company.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete company')
    }
  }

  async function handleRestore(company: Company) {
    setError('')
    try {
      await restoreCompany(company.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore company')
    }
  }

  async function handleResendInvite(company: Company) {
    setError('')
    try {
      const res = await resendCompanyInvite(company.id)
      if (res.inviteUrl) {
        setInviteUrl(res.inviteUrl)
        setNotice('Invite link generated below.')
      } else {
        setNotice(`Invite email resent to ${company.email}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invite')
    }
  }

  const orphanColumns: DataTableColumn<Shop>[] = [
    {
      key: 'domain',
      header: 'Domain',
      render: (shop) => <span className="demo-cell-primary">{shop.shopDomain}</span>,
    },
    {
      key: 'company',
      header: 'Attach to company',
      render: (shop) => (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            const selected = new FormData(form).get('companyId')
            if (typeof selected === 'string' && selected) {
              void assignShop(shop.id, selected).then(refresh)
            }
          }}
        >
          <select className="demo-input" name="companyId" required>
            <option value="">Choose company</option>
            {companies
              .filter((c) => !c.isDeleted)
              .map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
          </select>
          <button className="demo-btn demo-btn-sm" type="submit">
            Attach
          </button>
        </form>
      ),
    },
  ]

  return (
    <PlatformShell title="Companies" subtitle="Manage tenants, approvals, stores, and warehouses.">
      <PageHeader
        title="Companies"
        description="Manage company registrations, approval requests, Shopify stores, and retention lifecycle."
        count={companies.filter((c) => !c.isDeleted).length}
      />

      <PageSection
        title="Invite a company"
        description="Operators can onboard a new tenant directly. An activation invite email is sent automatically."
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
          <FormField label="Company name">
            <input
              className="demo-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Root email">
            <input
              className="demo-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Phone">
            <input
              className="demo-input"
              placeholder="Optional"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </FormField>
          <FormField label="Notes">
            <input
              className="demo-input"
              placeholder="Optional"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </FormField>
          <div className="md:col-span-2">
            <button className="demo-button" type="submit">
              Create and invite
            </button>
          </div>
        </form>
        {notice ? <p className="demo-muted mt-3">{notice}</p> : null}
        {inviteUrl ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="demo-input min-w-[18rem] flex-1" readOnly value={inviteUrl} />
            <button
              className="demo-button demo-button-secondary"
              type="button"
              onClick={() => void navigator.clipboard.writeText(inviteUrl)}
            >
              Copy invite
            </button>
          </div>
        ) : null}
      </PageSection>

      {orphanShops.length > 0 ? (
        <PageSection
          title="Unassigned stores"
          description="These Shopify domains are allowlisted but not attached to a company yet."
        >
          <DataTable
            columns={orphanColumns}
            rows={orphanShops}
            rowKey={(shop) => shop.id}
            emptyTitle="No unassigned stores"
          />
        </PageSection>
      ) : null}

      {error ? <p className="demo-alert-danger demo-alert mb-4">{error}</p> : null}

      <PageSection title="Company Directory" description="Browse all registered tenants and manage approval states.">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'All Active Companies' },
            { key: 'pending', label: `Pending Approvals ${pendingCount > 0 ? `(${pendingCount})` : ''}`, highlight: pendingCount > 0 },
            { key: 'active', label: 'Active' },
            { key: 'invited', label: 'Invited' },
            { key: 'disabled', label: 'Disabled' },
            { key: 'deleted', label: 'Soft Deleted (Retention)' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as TabKey)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: activeTab === tab.key ? 600 : 400,
                background: activeTab === tab.key ? 'var(--accent, #2563eb)' : 'var(--card-subtle, #f3f4f6)',
                color: activeTab === tab.key ? '#fff' : 'inherit',
                border: tab.highlight && activeTab !== tab.key ? '1px solid #f59e0b' : '1px solid var(--border, #e5e7eb)',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ListToolbar
          search={q}
          searchPlaceholder="Search companies…"
          onSearchChange={setQ}
          resultCount={filteredCompanies.length}
          resultLabel="companies"
          onClear={() => setQ('')}
        />

        <DataTable
          columns={[
            {
              key: 'company',
              header: 'Company',
              render: (company) => (
                <div>
                  <div className="demo-cell-primary font-medium">{company.name}</div>
                  <div className="demo-cell-secondary text-xs">{company.email}</div>
                  {company.rejectionReason ? (
                    <div className="text-xs text-red-600 mt-1">Rejection: {company.rejectionReason}</div>
                  ) : null}
                  {company.isDeleted && company.deletedAt ? (
                    <div className="text-xs text-rose-600 mt-1 font-mono">
                      Deleted on: {new Date(company.deletedAt).toLocaleDateString()}
                    </div>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (company) => {
                if (company.isDeleted) {
                  return <span style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '9999px', background: '#ffe4e6', color: '#9f1239' }}>Deleted</span>
                }
                const variantMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
                  active: 'success',
                  pending: 'warning',
                  invited: 'info',
                  rejected: 'danger',
                  disabled: 'danger',
                }
                return <StatusBadge status={company.status} variant={variantMap[company.status] || 'warning'} />
              },
            },
            {
              key: 'stores',
              header: 'Stores',
              align: 'right',
              className: 'num',
              render: (company) => company.shopCount ?? 0,
            },
            {
              key: 'warehouses',
              header: 'Warehouses',
              align: 'right',
              className: 'num',
              render: (company) => company.warehouseCount ?? 0,
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (company) => (
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                  {company.isDeleted ? (
                    <button
                      className="demo-btn demo-btn-sm"
                      type="button"
                      onClick={() => void handleRestore(company)}
                    >
                      Restore
                    </button>
                  ) : (
                    <>
                      {company.status === 'pending' ? (
                        <>
                          <button
                            className="demo-btn demo-btn-sm"
                            style={{ background: '#16a34a', color: '#fff' }}
                            type="button"
                            onClick={() => void handleApprove(company)}
                          >
                            Approve
                          </button>
                          <button
                            className="demo-btn demo-btn-sm demo-btn-danger"
                            type="button"
                            onClick={() => {
                              setRejectingCompany(company)
                              setRejectionReason('')
                            }}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}

                      {company.status === 'invited' ? (
                        <button
                          className="demo-btn demo-btn-sm"
                          type="button"
                          onClick={() => void handleResendInvite(company)}
                        >
                          Re-invite
                        </button>
                      ) : null}

                      <button
                        className="demo-btn demo-btn-sm"
                        type="button"
                        onClick={() => openEditModal(company)}
                      >
                        Edit
                      </button>

                      <Link
                        className="demo-btn demo-btn-sm no-underline"
                        to="/$consolePath/companies/$companyId"
                        params={{ consolePath: ADMIN_CONSOLE_PATH, companyId: company.id }}
                      >
                        Open
                      </Link>

                      <button
                        className="demo-btn demo-btn-sm demo-btn-danger"
                        type="button"
                        onClick={() => void handleSoftDelete(company)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ] satisfies DataTableColumn<Company>[]}
          rows={filteredCompanies}
          rowKey={(company) => company.id}
          loading={loading}
          emptyTitle="No companies found"
          emptyMessage="No companies matched your filter criteria."
        />
      </PageSection>

      {/* Edit Company Modal */}
      {editingCompany ? (
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
              maxWidth: '500px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', fontWeight: 600 }}>
              Edit Company: {editingCompany.name}
            </h3>
            <form onSubmit={handleSaveEdit} className="grid gap-3">
              <FormField label="Company Name">
                <input
                  className="demo-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </FormField>

              <FormField label="Email">
                <input
                  className="demo-input"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />
              </FormField>

              <FormField label="Phone">
                <input
                  className="demo-input"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </FormField>

              <FormField label="Status">
                <select
                  className="demo-input"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as Company['status'])}
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="invited">Invited</option>
                  <option value="rejected">Rejected</option>
                  <option value="disabled">Disabled</option>
                </select>
              </FormField>

              <FormField label="Notes">
                <textarea
                  className="demo-input"
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </FormField>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  className="demo-btn demo-btn-secondary"
                  onClick={() => setEditingCompany(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="demo-button" disabled={savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Reject Reason Modal */}
      {rejectingCompany ? (
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
              maxWidth: '450px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', fontWeight: 600 }}>
              Reject Registration: {rejectingCompany.name}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              An email will be sent notifying the applicant with the reason provided below.
            </p>
            <form onSubmit={handleRejectSubmit} className="grid gap-3">
              <FormField label="Reason for Rejection (Optional)">
                <textarea
                  className="demo-input"
                  rows={3}
                  placeholder="e.g. Incomplete business verification details..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </FormField>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  className="demo-btn demo-btn-secondary"
                  onClick={() => setRejectingCompany(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="demo-btn demo-btn-danger"
                  disabled={submittingReject}
                >
                  {submittingReject ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PlatformShell>
  )
}
