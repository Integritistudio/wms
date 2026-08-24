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
import { createCompany, listCompanies, listShops, assignShop, type Company, type Shop } from '../../lib/api'
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

function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [orphanShops, setOrphanShops] = useState<Shop[]>([])
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const filteredCompanies = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return companies
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.email || '').toLowerCase().includes(term) ||
        (c.phone || '').toLowerCase().includes(term),
    )
  }, [companies, q])

  async function refresh() {
    setLoading(true)
    try {
      const [nextCompanies, nextShops] = await Promise.all([listCompanies(), listShops()])
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

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
            {companies.map((company) => (
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
    <PlatformShell title="Companies" subtitle="Create tenants, then attach Shopify stores and warehouses.">
      <PageHeader
        title="Companies"
        description="Create tenants, then attach Shopify stores and warehouses."
        count={companies.length}
      />

      <PageSection title="Add a company" description="They get an email to set a password. Attach stores on the company page.">
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

      <PageSection title="All companies" description="Manage tenants, stores, and warehouses.">
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
                  <div className="demo-cell-primary">{company.name}</div>
                  <div className="demo-cell-secondary">{company.email}</div>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (company) => <StatusBadge status={company.status} variant={company.status === 'active' ? 'success' : 'warning'} />,
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
                <Link
                  className="demo-btn demo-btn-sm no-underline"
                  to="/$consolePath/companies/$companyId"
                  params={{ consolePath: ADMIN_CONSOLE_PATH, companyId: company.id }}
                >
                  Open
                </Link>
              ),
            },
          ] satisfies DataTableColumn<Company>[]}
          rows={filteredCompanies}
          rowKey={(company) => company.id}
          loading={loading}
          emptyTitle="No companies yet"
          emptyMessage="Create a company above to get started."
        />
      </PageSection>
    </PlatformShell>
  )
}
