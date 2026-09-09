import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import PlatformShell from '../../components/PlatformShell'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FormField,
  ListToolbar,
  PageHeader,
  PageSection,
  StatusBadge,
  StatusTabs,
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
          className="ui-inline-actions"
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
          <Button size="sm" type="submit">
            Attach
          </Button>
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
        <form className="ui-form-grid" onSubmit={onCreate}>
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
          <div className="ui-inline-actions span-2">
            <Button type="submit">Create and invite</Button>
          </div>
        </form>
        {notice ? (
          <Alert tone="success" className="mt-3" onDismiss={() => setNotice('')}>
            {notice}
          </Alert>
        ) : null}
        {inviteUrl ? (
          <div className="mt-3 ui-inline-actions">
            <input className="demo-input min-w-[18rem] flex-1" readOnly value={inviteUrl} />
            <Button
              variant="secondary"
              type="button"
              onClick={() => void navigator.clipboard.writeText(inviteUrl)}
            >
              Copy invite
            </Button>
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

      {error ? (
        <Alert tone="danger" className="mb-4" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}

      <PageSection title="Company Directory" description="Browse all registered tenants and manage approval states.">
        <StatusTabs
          tabs={[
            { id: 'all', label: 'All Active Companies' },
            { id: 'pending', label: 'Pending Approvals', count: pendingCount > 0 ? pendingCount : undefined },
            { id: 'active', label: 'Active' },
            { id: 'invited', label: 'Invited' },
            { id: 'disabled', label: 'Disabled' },
            { id: 'deleted', label: 'Soft Deleted (Retention)' },
          ]}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as TabKey)}
        />

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
                  return <span className="demo-badge demo-badge-danger">Deleted</span>
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
                <div className="ui-inline-actions justify-end">
                  {company.isDeleted ? (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => void handleRestore(company)}
                    >
                      Restore
                    </Button>
                  ) : (
                    <>
                      {company.status === 'pending' ? (
                        <>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => void handleApprove(company)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            type="button"
                            onClick={() => {
                              setRejectingCompany(company)
                              setRejectionReason('')
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}

                      {company.status === 'invited' ? (
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => void handleResendInvite(company)}
                        >
                          Re-invite
                        </Button>
                      ) : null}

                      <Button
                        size="sm"
                        type="button"
                        onClick={() => openEditModal(company)}
                      >
                        Edit
                      </Button>

                      <Link
                        className="demo-btn demo-btn-sm no-underline"
                        to="/$consolePath/companies/$companyId"
                        params={{ consolePath: ADMIN_CONSOLE_PATH, companyId: company.id }}
                      >
                        Open
                      </Link>

                      <Button
                        size="sm"
                        variant="danger"
                        type="button"
                        onClick={() => void handleSoftDelete(company)}
                      >
                        Delete
                      </Button>
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

      <Drawer
        open={Boolean(editingCompany)}
        onClose={() => setEditingCompany(null)}
        title={editingCompany ? `Edit Company: ${editingCompany.name}` : 'Edit Company'}
        footer={
          <div className="ui-inline-actions">
            <Button variant="secondary" type="button" onClick={() => setEditingCompany(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-company-form" disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {editingCompany ? (
          <form id="edit-company-form" onSubmit={handleSaveEdit} className="ui-form-grid">
            <FormField label="Company Name" className="span-2">
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

            <FormField label="Notes" className="span-2">
              <textarea
                className="demo-input"
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </FormField>
          </form>
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(rejectingCompany)}
        onClose={() => setRejectingCompany(null)}
        title={rejectingCompany ? `Reject Registration: ${rejectingCompany.name}` : 'Reject Registration'}
        subtitle="An email will be sent notifying the applicant with the reason provided below."
        footer={
          <div className="ui-inline-actions">
            <Button variant="secondary" type="button" onClick={() => setRejectingCompany(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="reject-company-form"
              variant="danger"
              disabled={submittingReject}
            >
              {submittingReject ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </div>
        }
      >
        {rejectingCompany ? (
          <form id="reject-company-form" onSubmit={handleRejectSubmit} className="ui-form-grid">
            <FormField label="Reason for Rejection (Optional)" className="span-2">
              <textarea
                className="demo-input"
                rows={3}
                placeholder="e.g. Incomplete business verification details..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </FormField>
          </form>
        ) : null}
      </Drawer>
    </PlatformShell>
  )
}
