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
} from '../../components/ui'
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
  const [shopQ, setShopQ] = useState('')
  const [warehouseQ, setWarehouseQ] = useState('')
  const [shopDomain, setShopDomain] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [warehouseName, setWarehouseName] = useState('')
  const [warehouseCode, setWarehouseCode] = useState('')
  const [warehouseAddress, setWarehouseAddress] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const warehouses = company?.warehouses || []
  const shops = company?.shops || []

  const filteredWarehouses = useMemo(() => {
    const term = warehouseQ.trim().toLowerCase()
    if (!term) return warehouses
    return warehouses.filter(
      (w) =>
        w.name.toLowerCase().includes(term) ||
        (w.code || '').toLowerCase().includes(term) ||
        (w.address || '').toLowerCase().includes(term),
    )
  }, [warehouses, warehouseQ])

  const filteredShops = useMemo(() => {
    const term = shopQ.trim().toLowerCase()
    if (!term) return shops
    return shops.filter((s) => s.shopDomain.toLowerCase().includes(term))
  }, [shops, shopQ])

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

      <PageHeader
        title={company?.name || 'Company'}
        description={[company?.email, company?.status, company?.phone].filter(Boolean).join(' · ') || 'Tenant detail'}
        actions={
          <button className="demo-button demo-button-secondary" type="button" onClick={() => void onResend()}>
            Resend password invite
          </button>
        }
      />

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

      <PageSection title="Root access" description={company?.notes || 'No notes. The root email is the company login.'}>
        <p className="demo-muted text-sm m-0">
          Invite the root user again if they lost the original email.
        </p>
      </PageSection>

      <PageSection title="Warehouses" description="Locations used for routing and fulfillment.">
        <form className="mb-4 grid gap-3 md:grid-cols-3" onSubmit={onAddWarehouse}>
          <FormField label="Warehouse name">
            <input
              className="demo-input"
              value={warehouseName}
              onChange={(event) => setWarehouseName(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Code">
            <input
              className="demo-input"
              placeholder="Optional"
              value={warehouseCode}
              onChange={(event) => setWarehouseCode(event.target.value)}
            />
          </FormField>
          <FormField label="Address">
            <input
              className="demo-input"
              placeholder="Optional"
              value={warehouseAddress}
              onChange={(event) => setWarehouseAddress(event.target.value)}
            />
          </FormField>
          <div className="md:col-span-3">
            <button className="demo-button" type="submit">
              Add warehouse
            </button>
          </div>
        </form>
        <ListToolbar
          search={warehouseQ}
          searchPlaceholder="Search warehouses…"
          onSearchChange={setWarehouseQ}
          resultCount={filteredWarehouses.length}
          resultLabel="warehouses"
          onClear={() => setWarehouseQ('')}
        />
        <DataTable
          columns={[
            { key: 'name', header: 'Name', render: (w) => w.name },
            { key: 'code', header: 'Code', render: (w) => w.code || '—' },
            { key: 'address', header: 'Address', render: (w) => w.address || '—' },
          ]}
          rows={filteredWarehouses}
          rowKey={(w) => w.id}
          emptyTitle="No warehouses yet"
        />
      </PageSection>

      <PageSection title="Shopify stores" description="Allowlist the domain here, then install the Shopify app on that store.">
        <form className="mb-4 flex flex-wrap gap-3 items-end" onSubmit={onAttachShop}>
          <FormField label="Shop domain" className="min-w-[14rem] flex-1">
            <input
              className="demo-input w-full"
              placeholder="store.myshopify.com"
              value={shopDomain}
              onChange={(event) => setShopDomain(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Warehouse">
            <select
              className="demo-input min-w-[10rem]"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
            >
              <option value="">No warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </FormField>
          <button className="demo-button" type="submit">
            Attach store
          </button>
        </form>
        <ListToolbar
          search={shopQ}
          searchPlaceholder="Search stores…"
          onSearchChange={setShopQ}
          resultCount={filteredShops.length}
          resultLabel="stores"
          onClear={() => setShopQ('')}
        />
        <DataTable
          columns={[
            { key: 'domain', header: 'Domain', render: (shop) => shop.shopDomain },
            {
              key: 'enabled',
              header: 'Enabled',
              render: (shop) => <StatusBadge status={shop.enabled ? 'active' : 'skipped'} label={shop.enabled ? 'Yes' : 'No'} variant={shop.enabled ? 'success' : 'neutral'} />,
            },
            {
              key: 'installed',
              header: 'Installed',
              render: (shop) => <StatusBadge status={shop.installed ? 'fulfilled' : 'pending'} label={shop.installed ? 'Yes' : 'No'} variant={shop.installed ? 'success' : 'warning'} />,
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (shop) => (
                <div className="demo-action-group">
                  <button
                    className="demo-btn demo-btn-sm"
                    type="button"
                    onClick={() => void setShopEnabled(shop.id, !shop.enabled).then(refresh)}
                  >
                    {shop.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <Link
                    className="demo-btn demo-btn-sm no-underline"
                    to="/$consolePath/shops/$shopId"
                    params={{ consolePath: ADMIN_CONSOLE_PATH, shopId: shop.id }}
                  >
                    Orders
                  </Link>
                </div>
              ),
            },
          ]}
          rows={filteredShops}
          rowKey={(shop) => shop.id}
          emptyTitle="No stores yet"
        />
      </PageSection>
    </PlatformShell>
  )
}
