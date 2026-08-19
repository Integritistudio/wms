import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import PlatformShell from '../../components/PlatformShell'
import {
  addWarehouse,
  attachShop,
  getCompany,
  resendCompanyInvite,
  setShopEnabled,
  type Company,
} from '../../lib/api'
import { isPlatformAuthenticated } from '../../lib/auth'
import { ADMIN_CONSOLE_PATH } from '../../lib/config'

export const Route = createFileRoute('/$consolePath/companies/$companyId')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (!isPlatformAuthenticated()) {
      throw redirect({ to: '/$consolePath/login', params: { consolePath: params.consolePath } })
    }
  },
  component: CompanyDetailPage,
})

function CompanyDetailPage() {
  const { companyId } = Route.useParams()
  const [company, setCompany] = useState<Company | null>(null)
  const [shopDomain, setShopDomain] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [warehouseName, setWarehouseName] = useState('')
  const [warehouseCode, setWarehouseCode] = useState('')
  const [warehouseAddress, setWarehouseAddress] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    try {
      setCompany(await getCompany(companyId))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load company')
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId])

  async function onAttachShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await attachShop(companyId, {
        shopDomain,
        warehouseId: warehouseId || undefined,
      })
      setShopDomain('')
      setWarehouseId('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to attach store')
    }
  }

  async function onAddWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await addWarehouse(companyId, {
        name: warehouseName,
        code: warehouseCode,
        address: warehouseAddress,
      })
      setWarehouseName('')
      setWarehouseCode('')
      setWarehouseAddress('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add warehouse')
    }
  }

  async function onResend() {
    try {
      const result = await resendCompanyInvite(companyId)
      setInviteUrl(result.inviteUrl || '')
      setNotice(result.inviteSent ? 'Invite emailed' : 'Email was not sent — copy the invite link.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend invite')
    }
  }

  return (
    <PlatformShell
      title={company?.name || 'Company'}
      subtitle={[company?.email, company?.status, company?.phone].filter(Boolean).join(' · ')}
    >
      <p className="demo-muted mb-4 text-sm">
        <Link to="/$consolePath" params={{ consolePath: ADMIN_CONSOLE_PATH }}>
          Companies
        </Link>
        {' / '}
        {company?.name || 'Company'}
      </p>
      {error ? <p className="demo-alert-danger demo-alert mb-4">{error}</p> : null}
      {notice ? <p className="demo-muted mb-4">{notice}</p> : null}
      {inviteUrl ? (
        <div className="mb-4 flex flex-wrap gap-2">
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

      <section className="island-shell mb-6 rounded-3xl p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="demo-section-title m-0">Root access</h2>
          <button className="demo-button demo-button-secondary" type="button" onClick={() => void onResend()}>
            Resend password invite
          </button>
        </div>
        <p className="demo-muted text-sm">
          {company?.notes || 'No notes. The root email is the company login.'}
        </p>
      </section>

      <section className="island-shell mb-6 rounded-3xl p-6">
        <h2 className="demo-section-title mb-3">Warehouses</h2>
        <form className="mb-4 grid gap-3 md:grid-cols-3" onSubmit={onAddWarehouse}>
          <input
            className="demo-input"
            placeholder="Warehouse name"
            value={warehouseName}
            onChange={(event) => setWarehouseName(event.target.value)}
            required
          />
          <input
            className="demo-input"
            placeholder="Code (optional)"
            value={warehouseCode}
            onChange={(event) => setWarehouseCode(event.target.value)}
          />
          <input
            className="demo-input"
            placeholder="Address (optional)"
            value={warehouseAddress}
            onChange={(event) => setWarehouseAddress(event.target.value)}
          />
          <div className="md:col-span-3">
            <button className="demo-button" type="submit">
              Add warehouse
            </button>
          </div>
        </form>
        <div className="demo-table-shell">
          <table className="demo-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {(company?.warehouses || []).length === 0 ? (
                <tr>
                  <td colSpan={3}>None yet</td>
                </tr>
              ) : (
                company?.warehouses?.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td>{warehouse.name}</td>
                    <td>{warehouse.code || '—'}</td>
                    <td>{warehouse.address || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="island-shell rounded-3xl p-6">
        <h2 className="demo-section-title mb-3">Shopify stores</h2>
        <form className="mb-4 flex flex-wrap gap-3" onSubmit={onAttachShop}>
          <input
            className="demo-input max-w-md flex-1"
            placeholder="store.myshopify.com"
            value={shopDomain}
            onChange={(event) => setShopDomain(event.target.value)}
            required
          />
          <select
            className="demo-input max-w-xs"
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
          >
            <option value="">No warehouse</option>
            {(company?.warehouses || []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
          <button className="demo-button" type="submit">
            Attach store
          </button>
        </form>
        <p className="demo-muted mb-4 text-sm">
          Allowlist the domain here, then install the Shopify app on that store.
        </p>
        <div className="demo-table-shell">
          <table className="demo-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Enabled</th>
                <th>Installed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(company?.shops || []).length === 0 ? (
                <tr>
                  <td colSpan={4}>None yet</td>
                </tr>
              ) : (
                company?.shops?.map((shop) => (
                  <tr key={shop.id}>
                    <td>{shop.shopDomain}</td>
                    <td>{shop.enabled ? 'Yes' : 'No'}</td>
                    <td>{shop.installed ? 'Yes' : 'No'}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="demo-button demo-button-secondary px-3 py-2 text-xs"
                          type="button"
                          onClick={() => void setShopEnabled(shop.id, !shop.enabled).then(refresh)}
                        >
                          {shop.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <Link
                          className="demo-button px-3 py-2 text-xs no-underline"
                          to="/$consolePath/shops/$shopId"
                          params={{ consolePath: ADMIN_CONSOLE_PATH, shopId: shop.id }}
                        >
                          Orders
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PlatformShell>
  )
}
