import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import PlatformShell from '../../components/PlatformShell'
import {
  Alert,
  Button,
  DataTable,
  CountryStateSelect,
  FormField,
  ListToolbar,
  PageHeader,
  PageSection,
  StatusBadge,
  ZipPostalField,
} from '../../components/ui'
import {
  attachShop,
  getCompany,
  getPlatformShipooTrackingSettings,
  resendCompanyInvite,
  savePlatformShipooTrackingSettings,
  setShopEnabled,
  type Company,
  type ShipooTrackingSettings,
} from '../../lib/api'
import { isPlatformAuthenticated } from '../../lib/auth'
import { ADMIN_CONSOLE_PATH } from '../../lib/config'

const emptyShipooSettings: ShipooTrackingSettings = {
  enabled: false,
  apiKeySet: false,
  webhookSecretSet: false,
  apiKeyMasked: '',
  webhookSecretMasked: '',
  destinationId: '',
  webhookUrl: '',
  shipooConfigured: false,
  lastRegisteredAt: null,
  lastWebhookAt: null,
}

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
  const [inviteUrl, setInviteUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [shipoo, setShipoo] = useState<ShipooTrackingSettings>(emptyShipooSettings)
  const [shipooApiKey, setShipooApiKey] = useState('')
  const [shipooWebhookSecret, setShipooWebhookSecret] = useState('')
  const [shipooSaving, setShipooSaving] = useState(false)
  const [shipooCopied, setShipooCopied] = useState(false)

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
      const [nextCompany, nextShipoo] = await Promise.all([
        getCompany(companyId),
        getPlatformShipooTrackingSettings(companyId).catch(() => emptyShipooSettings),
      ])
      setCompany(nextCompany)
      setShipoo(nextShipoo)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load company')
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId])

  async function onSaveShipoo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (shipooSaving) return
    setShipooSaving(true)
    try {
      const saved = await savePlatformShipooTrackingSettings(companyId, {
        enabled: shipoo.enabled,
        destinationId: shipoo.destinationId,
        apiKey: shipooApiKey.trim() || undefined,
        webhookSecret: shipooWebhookSecret.trim() || undefined,
      })
      setShipoo(saved)
      setShipooApiKey('')
      setShipooWebhookSecret('')
      setNotice(
        saved.enabled
          ? 'Shipoo auto-tracking enabled for this company.'
          : 'Shipoo tracking settings saved.',
      )
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save Shipoo settings')
    } finally {
      setShipooSaving(false)
    }
  }

  async function copyShipooWebhookUrl() {
    if (!shipoo.webhookUrl) return
    try {
      await navigator.clipboard.writeText(shipoo.webhookUrl)
      setShipooCopied(true)
      setTimeout(() => setShipooCopied(false), 1600)
    } catch {
      setShipooCopied(false)
    }
  }

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
          <div className="ui-inline-actions">
            <Button variant="secondary" type="button" onClick={() => void onResend()}>
              Resend password invite
            </Button>
          </div>
        }
      />

      {error ? (
        <Alert tone="danger" className="mb-4" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="success" className="mb-4" onDismiss={() => setNotice('')}>
          {notice}
        </Alert>
      ) : null}
      {inviteUrl ? (
        <div className="mb-4 ui-inline-actions">
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

      <PageSection title="Root access" description={company?.notes || 'No notes. The root email is the company login.'}>
        <p className="demo-muted text-sm m-0">
          Invite the root user again if they lost the original email.
        </p>
      </PageSection>

      <PageSection
        title="Shipoo auto-tracking"
        description="When enabled, this company’s shipment timeline (Labeled → Transit → Out → Delivered → Return) updates from Shipoo carrier events."
      >
        <form className="shipoo-tracking-card" onSubmit={onSaveShipoo}>
          {!shipoo.shipooConfigured ? (
            <Alert tone="danger">
              Shipoo base URL is not configured on the API server. Set SHIPOO_BASE_URL before enabling.
            </Alert>
          ) : null}

          <label className="shipoo-tracking-toggle">
            <input
              type="checkbox"
              checked={shipoo.enabled}
              onChange={(event) => setShipoo((s) => ({ ...s, enabled: event.target.checked }))}
            />
            <span>
              <strong>Enable auto-tracking for this company</strong>
              <small>
                Company users also need the Tracking permission to see auto mode on order details.
              </small>
            </span>
          </label>

          <div className="shipoo-tracking-grid">
            <FormField label="Shipoo API key">
              <input
                className="demo-input"
                type="password"
                autoComplete="off"
                placeholder={shipoo.apiKeySet ? shipoo.apiKeyMasked || '•••• saved' : 'wms_trk_…'}
                value={shipooApiKey}
                onChange={(event) => setShipooApiKey(event.target.value)}
              />
            </FormField>
            <FormField label="Webhook signing secret">
              <input
                className="demo-input"
                type="password"
                autoComplete="off"
                placeholder={
                  shipoo.webhookSecretSet
                    ? shipoo.webhookSecretMasked || '•••• saved'
                    : 'Secret from Shipoo destination'
                }
                value={shipooWebhookSecret}
                onChange={(event) => setShipooWebhookSecret(event.target.value)}
              />
            </FormField>
            <FormField label="Destination ID (optional)" className="span-2">
              <input
                className="demo-input"
                value={shipoo.destinationId || ''}
                onChange={(event) => setShipoo((s) => ({ ...s, destinationId: event.target.value }))}
                placeholder="Shipoo webhook destination id"
              />
            </FormField>
          </div>

          <div className="shipoo-tracking-webhook">
            <span>Inbound webhook URL</span>
            <code>{shipoo.webhookUrl || '—'}</code>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copyShipooWebhookUrl()}
              disabled={!shipoo.webhookUrl}
            >
              {shipooCopied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="shipoo-tracking-actions">
            <Button type="submit" disabled={shipooSaving}>
              {shipooSaving ? 'Saving…' : 'Save tracking settings'}
            </Button>
            {shipoo.lastWebhookAt ? (
              <span className="shipoo-tracking-meta">
                Last webhook {new Date(shipoo.lastWebhookAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </form>
      </PageSection>

      <PageSection title="Warehouses" description="Locations used for routing and fulfillment.">
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
        <form className="mb-4 ui-form-grid" onSubmit={onAttachShop}>
          <FormField label="Shop domain">
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
              className="demo-input"
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
          <div className="ui-inline-actions span-2">
            <Button type="submit">Attach store</Button>
          </div>
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

// impersonation component removed — platform shows single-page company details only
