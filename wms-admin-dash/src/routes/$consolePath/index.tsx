import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import PlatformShell from '../../components/PlatformShell'
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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

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

  return (
    <PlatformShell title="Companies" subtitle="Create tenants, then attach Shopify stores and warehouses.">
      <section className="island-shell mb-6 rounded-3xl p-6">
        <h2 className="demo-section-title mb-3">Add a company</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
          <input
            className="demo-input"
            placeholder="Company name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <input
            className="demo-input"
            type="email"
            placeholder="Root email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            className="demo-input"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <input
            className="demo-input"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="md:col-span-2">
            <button className="demo-button" type="submit">
              Create and invite
            </button>
          </div>
        </form>
        <p className="demo-muted mt-3 text-sm">
          They get an email to set a password. Attach Shopify stores and warehouses on the company
          page.
        </p>
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
      </section>

      {orphanShops.length > 0 ? (
        <section className="island-shell mb-6 rounded-3xl p-6">
          <h2 className="demo-section-title mb-3">Unassigned stores</h2>
          <p className="demo-muted mb-4 text-sm">
            These Shopify domains are allowlisted but not attached to a company yet.
          </p>
          <div className="demo-table-shell">
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Company</th>
                </tr>
              </thead>
              <tbody>
                {orphanShops.map((shop) => (
                  <tr key={shop.id}>
                    <td>{shop.shopDomain}</td>
                    <td>
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
                        <button className="demo-button demo-button-secondary px-3 py-2 text-xs" type="submit">
                          Attach
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {error ? <p className="demo-alert-danger demo-alert mb-4">{error}</p> : null}

      <section className="demo-table-shell">
        {loading ? (
          <p className="p-4 demo-muted">Loading…</p>
        ) : (
          <table className="demo-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Stores</th>
                <th>Warehouses</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={5}>No companies yet</td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr key={company.id}>
                    <td>
                      {company.name}
                      <div className="demo-muted text-xs">{company.email}</div>
                    </td>
                    <td>{company.status}</td>
                    <td>{company.shopCount ?? 0}</td>
                    <td>{company.warehouseCount ?? 0}</td>
                    <td>
                      <Link
                        className="demo-button px-3 py-2 text-xs no-underline"
                        to="/$consolePath/companies/$companyId"
                        params={{ consolePath: ADMIN_CONSOLE_PATH, companyId: company.id }}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>
    </PlatformShell>
  )
}
