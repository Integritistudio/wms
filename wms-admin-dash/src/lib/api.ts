import { API_URL } from './config'
import { getCompanySession, getPlatformSession, getUploaderSession, type CompanyPermissions } from './auth'

export type ApiResponse<T> = {
  success: boolean
  message: string
  data: T | null
  errors: unknown
}

export type Shop = {
  id: string
  shopDomain: string
  companyId: string | null
  warehouseId: string | null
  companyName?: string | null
  enabled: boolean
  installed: boolean
  mappingKey: string
  installedAt: string | null
  createdAt: string
  reconnectUrl?: string
}

export type WarehouseModernwmsConfig = {
  baseUrl: string
  username: string
  passwordSet: boolean
  tenantId: number | null
  goodsOwnerId: number | null
  defaultCustomerId: number | null
  autoConfirmOrder: boolean
}

export type Warehouse = {
  id: string
  companyId: string
  name: string
  code: string
  address: string
  sftpConnectionId: string | null
  isActive: boolean
  enforceFefo?: boolean
  routingPriority?: number
  minStockThreshold?: number
  zipPrefixes?: string[]
  latitude?: number | null
  longitude?: number | null
  geoPlaceName?: string
  fulfillmentMode?: 'modernwms' | 'sftp_edi'
  modernwms?: WarehouseModernwmsConfig
  createdAt: string
}

export type ModernWmsOrderLink = {
  id: string
  orderId: string
  groupId: string
  warehouseId: string
  dispatchNo: string
  dispatchStatus: number
  statusLabel: string
  waitingOnOps: boolean
  closed: boolean
  lastPolledAt: string | null
  pushError?: string
}

export type SftpConnection = {
  id: string
  companyId: string
  name: string
  enabled: boolean
  host: string
  port: number
  username: string
  remotePath: string
  passwordSet: boolean
  createdAt: string
}

export type Company = {
  id: string
  name: string
  email: string
  phone: string
  notes: string
  status: 'invited' | 'pending' | 'active' | 'rejected' | 'disabled'
  rejectionReason?: string
  isDeleted?: boolean
  deletedAt?: string | null
  createdAt: string
  shopCount?: number
  warehouseCount?: number
  shops?: Shop[]
  warehouses?: Warehouse[]
  sftpConnections?: SftpConnection[]
  appearance?: {
    accentId: string
    customAccent: string
  }
  sftp?: {
    enabled: boolean
    host: string
    port: number
    username: string
    remotePath: string
    passwordSet: boolean
  }
}

export type CompanyMember = {
  id: string
  companyId: string
  name: string
  email: string
  role: 'root' | 'member' | 'warehouse'
  warehouseIds: string[]
  permissions?: CompanyPermissions
  status: string
  companyName?: string
}

export type PlatformSettings = {
  retentionDays: number
  autoCleanupEnabled: boolean
  webhooksEnabled?: boolean
  dlqAlertEmail?: string
  dlqAlertThreshold?: number
  lastCleanupAt: string | null
  lastCleanupStats: Record<string, unknown>
  updatedAt?: string
}

export type PlatformCleanupResult = {
  retentionDays: number
  cutoffDate: string
  deletedCompanies: number
  deletedReturns: number
  executedAt: string
}

export type CompanySession = {
  company: Company
  user: CompanyMember
}

export type CompanyInviteResult = {
  company?: Company
  inviteSent: boolean
  inviteUrl?: string
}

export type OrderAddress = {
  name?: string
  firstName?: string
  lastName?: string
  company?: string
  address1?: string
  address2?: string
  city?: string
  province?: string
  provinceCode?: string
  zip?: string
  country?: string
  countryCode?: string
  phone?: string
}

export type OrderLineItem = {
  id?: string
  sku?: string
  title?: string
  variantTitle?: string
  name?: string
  quantity?: number
  price?: string
  totalDiscount?: string
  vendor?: string
  requiresShipping?: boolean
  fulfillmentStatus?: string
  variantId?: string
  productId?: string
  status?: string
  allocatedQty?: number
  shippedQty?: number
  backorderedQty?: number
  wmsUom?: string
}

export type ShopOrder = {
  id: string
  shopId: string
  shopifyOrderId: string
  orderNumber: string
  customerName: string
  email: string
  phone?: string
  status: string
  source?: string
  trackingNumber: string
  carrier: string
  warehouseId?: string | null
  suggestedWarehouseId?: string | null
  routingReason?: string
  lastError?: string
  sftpStatus?: string
  sftpError?: string
  fileLink: {
    token: string
    url: string
    passwordRequired: boolean
    fileName: string
  } | null
  lineItems?: OrderLineItem[]
  shippingAddress?: OrderAddress
  billingAddress?: OrderAddress
  currency?: string
  totals?: {
    subtotal?: string
    totalTax?: string
    totalDiscounts?: string
    totalShipping?: string
    totalPrice?: string
  }
  tags?: string
  isB2B?: boolean
  poNumber?: string
  riskLevel?: string
  giftMessage?: string
  shippingMethod?: {
    title?: string
    shopifyServiceCode?: string
    carrierScac?: string | null
    price?: string
    isExpedited?: boolean
    wmsShipCode?: string
  }
  channel?: string
  createdAt: string
  updatedAt?: string
}

export type Uploader = {
  id: string
  username: string
  shopIds: string[]
}

export type WebhookEvent = {
  id: string
  webhookId: string
  topic: string
  shopDomain: string
  status: string
  error: string
  processedAt: string | null
  createdAt: string
}

export type Actor = 'platform' | 'company' | 'uploader'

function actorToken(actor: Actor) {
  if (actor === 'company') {
    return companyToken()
  }
  if (actor === 'uploader') {
    return uploaderToken()
  }
  return platformToken()
}

async function parseJson<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiResponse<T>
  if (!json.success) {
    throw new Error(json.message || 'Request failed')
  }
  // Some endpoints return message-only success (data: null), e.g. mark notification read.
  return (json.data ?? null) as T
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string; json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`)
  }

  const method = (init.method || 'GET').toUpperCase()
  let jsonBody = init.json
  if (
    jsonBody === undefined &&
    init.body === undefined &&
    (method === 'POST' || method === 'PUT' || method === 'PATCH')
  ) {
    jsonBody = {}
  }

  if (jsonBody !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : init.body,
  })

  return parseJson<T>(response)
}

function platformToken() {
  const token = getPlatformSession()?.token
  if (!token) {
    throw new Error('Not signed in')
  }
  return token
}

function uploaderToken() {
  const token = getUploaderSession()?.token
  if (!token) {
    throw new Error('Not signed in')
  }
  return token
}

function companyToken() {
  const token = getCompanySession()?.token
  if (!token) {
    throw new Error('Not signed in')
  }
  return token
}

export function platformLogin(input: { username: string; password: string }) {
  return request<{ token: string; user: { id: string; username: string; isActive: boolean } }>(
    '/platform/auth/login',
    { method: 'POST', json: input },
  )
}

export function uploaderLogin(input: { username: string; password: string }) {
  return request<{ token: string; user: Uploader }>('/uploader/auth/login', {
    method: 'POST',
    json: input,
  })
}

export function listShops() {
  return request<Shop[]>('/platform/shops', { token: platformToken() })
}

export function listCompanies(params?: { includeDeleted?: boolean; onlyDeleted?: boolean; status?: string }) {
  return request<Company[]>(`/platform/companies${toQuery(params || {})}`, { token: platformToken() })
}

export function getCompany(id: string) {
  return request<Company>(`/platform/companies/${id}`, { token: platformToken() })
}

export function createCompany(input: { name: string; email: string; phone?: string; notes?: string }) {
  return request<CompanyInviteResult>('/platform/companies', {
    method: 'POST',
    token: platformToken(),
    json: input,
  })
}

export function updateCompany(id: string, input: Partial<Company>) {
  return request<Company>(`/platform/companies/${id}`, {
    method: 'PATCH',
    token: platformToken(),
    json: input,
  })
}

export function softDeleteCompany(id: string) {
  return request<Company>(`/platform/companies/${id}`, {
    method: 'DELETE',
    token: platformToken(),
  })
}

export function restoreCompany(id: string) {
  return request<Company>(`/platform/companies/${id}/restore`, {
    method: 'POST',
    token: platformToken(),
  })
}

export function approveCompany(id: string) {
  return request<Company>(`/platform/companies/${id}/approve`, {
    method: 'POST',
    token: platformToken(),
  })
}

export function rejectCompany(id: string, reason?: string) {
  return request<Company>(`/platform/companies/${id}/reject`, {
    method: 'POST',
    token: platformToken(),
    json: { reason },
  })
}

export function getPlatformSettings() {
  return request<PlatformSettings>('/platform/settings', { token: platformToken() })
}

export function updatePlatformSettings(input: Partial<PlatformSettings>) {
  return request<PlatformSettings>('/platform/settings', {
    method: 'PUT',
    token: platformToken(),
    json: input,
  })
}

export function runPlatformCleanup(retentionDays?: number) {
  return request<PlatformCleanupResult>('/platform/settings/cleanup', {
    method: 'POST',
    token: platformToken(),
    json: retentionDays ? { retentionDays } : {},
  })
}

export function resendCompanyInvite(id: string) {
  return request<CompanyInviteResult>(`/platform/companies/${id}/invite`, {
    method: 'POST',
    token: platformToken(),
  })
}

export function attachShop(
  companyId: string,
  input: { shopDomain: string; warehouseId?: string; enabled?: boolean },
) {
  return request<Shop>(`/platform/companies/${companyId}/shops`, {
    method: 'POST',
    token: platformToken(),
    json: { ...input, enabled: input.enabled ?? true },
  })
}

export type LocationCountry = {
  id: string
  name: string
  isoCode: string
  currency: string
  phoneCode: string
}

export type LocationState = {
  id: string
  name: string
  isoCode: string
  countryId: string
  countryIsoCode: string
}

export function listCountries() {
  return request<LocationCountry[]>('/locations/countries')
}

export function listStates(countryIsoCode: string) {
  return request<LocationState[]>(`/locations/countries/${encodeURIComponent(countryIsoCode)}/states`)
}

export type PostalRules = {
  countryIsoCode: string
  stateIsoCode: string | null
  example: string
  hint: string
  pattern: string
}

export function getPostalRules(countryIsoCode: string, stateIsoCode?: string) {
  const qs = new URLSearchParams({ country: countryIsoCode })
  if (stateIsoCode) qs.set('state', stateIsoCode)
  return request<PostalRules>(`/locations/postal-rules?${qs.toString()}`)
}

export function addWarehouse(
  companyId: string,
  input: {
    name: string
    code?: string
    address?: string
    street?: string
    city?: string
    state?: string
    zip?: string
    country?: string
    zipPrefixes?: string[] | string
  },
) {
  return request<Warehouse>(`/platform/companies/${companyId}/warehouses`, {
    method: 'POST',
    token: platformToken(),
    json: input,
  })
}

export function peekInvite(token: string) {
  return request<{ name: string; email: string; role?: string }>(`/company/auth/invite/${token}`)
}

export function setCompanyPassword(input: { token: string; password: string }) {
  return request<{ token: string; user: CompanyMember }>('/company/auth/set-password', {
    method: 'POST',
    json: input,
  })
}

export function companySignup(input: {
  name: string
  contactName?: string
  email: string
  password: string
  phone?: string
  notes?: string
}) {
  return request<{ company: Company; message: string }>('/company/auth/signup', {
    method: 'POST',
    json: input,
  })
}

export function companyLogin(input: { email: string; password: string; expectedRole?: string }) {
  return request<{ token: string; user: CompanyMember }>('/company/auth/login', {
    method: 'POST',
    json: input,
  })
}

export function forgotPassword(email: string) {
  return request<{ sent?: boolean; resetUrl?: string }>('/company/auth/forgot-password', {
    method: 'POST',
    json: { email },
  })
}

export function resetPassword(input: { token: string; password: string }) {
  return request<{ token: string; user: CompanyMember }>('/company/auth/reset-password', {
    method: 'POST',
    json: input,
  })
}

export function getCompanyMe() {
  return request<CompanySession>('/company/me', { token: companyToken() })
}

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  limit: number
}

export type OrderListQuery = {
  q?: string
  status?: string
  shopId?: string
  warehouseId?: string
  page?: number
  limit?: number
}

function toQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export function listCompanyOrders(query: OrderListQuery = {}) {
  return request<Paginated<ShopOrder>>(`/company/orders${toQuery(query)}`, { token: companyToken() })
}

export function listCompanyUsers() {
  return request<CompanyMember[]>('/company/users', { token: companyToken() })
}

export function createCompanyUser(input: {
  name: string
  email: string
  role: 'member' | 'warehouse'
  warehouseIds?: string[]
  permissions?: CompanyPermissions
}) {
  return request<{ user: CompanyMember; inviteSent: boolean; inviteUrl?: string }>('/company/users', {
    method: 'POST',
    token: companyToken(),
    json: input,
  })
}

export function updateCompanyUser(
  id: string,
  input: {
    name?: string
    role?: 'member' | 'warehouse'
    status?: string
    warehouseIds?: string[]
    permissions?: CompanyPermissions
  },
) {
  return request<CompanyMember>(`/company/users/${id}`, {
    method: 'PATCH',
    token: companyToken(),
    json: input,
  })
}

export function resetCompanyUser(id: string) {
  return request<{ sent: boolean; resetUrl?: string }>(`/company/users/${id}/reset`, {
    method: 'POST',
    token: companyToken(),
  })
}

export function inviteCompanyUser(id: string) {
  return request<{ inviteSent: boolean; inviteUrl?: string }>(`/company/users/${id}/invite`, {
    method: 'POST',
    token: companyToken(),
  })
}

export function addCompanyWarehouse(input: {
  name: string
  code?: string
  address?: string
  street?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  zipPrefixes?: string[] | string
  sftpConnectionId?: string
}) {
  return request<Warehouse>('/company/warehouses', {
    method: 'POST',
    token: companyToken(),
    json: input,
  })
}

export function updateCompanyWarehouse(
  id: string,
  input: {
    name?: string
    code?: string
    address?: string
    sftpConnectionId?: string | null
    routingPriority?: number
    minStockThreshold?: number
    zipPrefixes?: string[] | string
    geocode?: boolean
    fulfillmentMode?: 'modernwms' | 'sftp_edi'
  },
) {
  return request<Warehouse>(`/company/warehouses/${id}`, {
    method: 'PATCH',
    token: companyToken(),
    json: input,
  })
}

export type ModernWmsWarehouseConfigPayload = {
  fulfillmentMode?: 'modernwms' | 'sftp_edi'
  baseUrl?: string
  username?: string
  password?: string
  tenantId?: number | null
  goodsOwnerId?: number | null
  defaultCustomerId?: number | null
  autoConfirmOrder?: boolean
}

export function getWarehouseModernwmsConfig(warehouseId: string) {
  return request<{
    warehouseId: string
    fulfillmentMode: 'modernwms' | 'sftp_edi'
    modernwms: WarehouseModernwmsConfig
  }>(`/company/warehouses/${warehouseId}/modernwms-config`, {
    token: companyToken(),
  })
}

export function saveWarehouseModernwmsConfig(warehouseId: string, input: ModernWmsWarehouseConfigPayload) {
  return request<{
    warehouseId: string
    fulfillmentMode: 'modernwms' | 'sftp_edi'
    modernwms: WarehouseModernwmsConfig
  }>(`/company/warehouses/${warehouseId}/modernwms-config`, {
    method: 'PUT',
    token: companyToken(),
    json: input,
  })
}

export function testWarehouseModernwmsConnection(
  warehouseId: string,
  input?: Pick<ModernWmsWarehouseConfigPayload, 'baseUrl' | 'username' | 'password'>,
) {
  return request<{ ok: boolean; tenantId?: number; message?: string }>(
    `/company/warehouses/${warehouseId}/modernwms-config/test`,
    { method: 'POST', token: companyToken(), json: input || {} },
  )
}

export function syncWarehouseModernwmsInventory(warehouseId: string) {
  return request<{ synced: number }>(`/company/warehouses/${warehouseId}/modernwms/sync-inventory`, {
    method: 'POST',
    token: companyToken(),
  })
}

export function getOrderModernwmsStatus(orderId: string) {
  return request<ModernWmsOrderLink[]>(`/company/orders/${orderId}/modernwms-status`, {
    token: companyToken(),
  })
}

export function createSftpConnection(input: {
  name: string
  enabled?: boolean
  host: string
  port?: number
  username: string
  password?: string
  remotePath?: string
}) {
  return request<SftpConnection>('/company/sftp-connections', {
    method: 'POST',
    token: companyToken(),
    json: input,
  })
}

export function updateSftpConnection(
  id: string,
  input: {
    name?: string
    enabled?: boolean
    host?: string
    port?: number
    username?: string
    password?: string
    remotePath?: string
  },
) {
  return request<SftpConnection>(`/company/sftp-connections/${id}`, {
    method: 'PATCH',
    token: companyToken(),
    json: input,
  })
}

export function testSftpConnection(id: string) {
  return request<{ ok: boolean }>(`/company/sftp-connections/${id}/test`, {
    method: 'POST',
    token: companyToken(),
  })
}

export function assignCompanyOrderWarehouse(orderId: string, warehouseId: string | null) {
  return request<ShopOrder>(`/company/orders/${orderId}/warehouse`, {
    method: 'PATCH',
    token: companyToken(),
    json: { warehouseId },
  })
}

export function setShopEnabled(id: string, enabled: boolean) {
  return request<Shop>(`/platform/shops/${id}`, {
    method: 'PATCH',
    token: platformToken(),
    json: { enabled },
  })
}

export function assignShop(id: string, companyId: string) {
  return request<Shop>(`/platform/shops/${id}`, {
    method: 'PATCH',
    token: platformToken(),
    json: { companyId },
  })
}

export function getShop(id: string) {
  return request<Shop>(`/platform/shops/${id}`, { token: platformToken() })
}

export function testShopConnection(id: string) {
  return request<{ ok: boolean; shopName: string; myshopifyDomain: string }>(
    `/platform/shops/${id}/test-connection`,
    { method: 'POST', token: platformToken(), json: {} },
  )
}

export function testCompanyShopConnection(id: string) {
  return request<{ ok: boolean; shopName: string; myshopifyDomain: string }>(
    `/company/shops/${id}/test-connection`,
    { method: 'POST', token: companyToken(), json: {} },
  )
}

export function listShopOrders(shopId: string, query: OrderListQuery = {}) {
  return request<Paginated<ShopOrder>>(`/platform/shops/${shopId}/orders${toQuery(query)}`, {
    token: platformToken(),
  })
}

export function protectOrderLink(orderId: string, password: string) {
  return request<ShopOrder>(`/platform/orders/${orderId}/file-link`, {
    method: 'POST',
    token: platformToken(),
    json: { password },
  })
}

export function emailOrderLink(orderId: string, to?: string) {
  return request<{ sent: boolean }>(`/platform/orders/${orderId}/email-link`, {
    method: 'POST',
    token: platformToken(),
    json: { to },
  })
}

export function listUploaders(shopId: string) {
  return request<Uploader[]>(`/platform/shops/${shopId}/uploaders`, { token: platformToken() })
}

export function createUploader(shopId: string, input: { username: string; password: string }) {
  return request<Uploader>(`/platform/shops/${shopId}/uploaders`, {
    method: 'POST',
    token: platformToken(),
    json: input,
  })
}

export async function upload945(
  orderId: string,
  file: File,
  actor: Actor = 'platform',
  opts?: { fulfillmentGroupId?: string },
) {
  const form = new FormData()
  form.append('file', file)
  const qs = opts?.fulfillmentGroupId
    ? `?fulfillmentGroupId=${encodeURIComponent(opts.fulfillmentGroupId)}`
    : ''
  const path =
    actor === 'company'
      ? `/company/orders/${orderId}/945${qs}`
      : actor === 'uploader'
        ? `/uploader/orders/${orderId}/945${qs}`
        : `/platform/orders/${orderId}/945${qs}`
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${actorToken(actor)}` },
    body: form,
  })
  return parseJson<ShopOrder>(response)
}

export function shipOrder(
  orderId: string,
  input: { trackingNumber: string; carrier?: string; fulfillmentGroupId?: string },
  actor: Actor = 'platform',
) {
  const path =
    actor === 'company'
      ? `/company/orders/${orderId}/ship`
      : actor === 'uploader'
        ? `/uploader/orders/${orderId}/ship`
        : `/platform/orders/${orderId}/ship`
  return request<ShopOrder>(path, {
    method: 'POST',
    token: actorToken(actor),
    json: input,
  })
}

export function simulateOrder(shopId: string, input: { sku?: string; quantity?: number; customerName?: string } = {}) {
  return request<ShopOrder>(`/platform/shops/${shopId}/simulate-order`, {
    method: 'POST',
    token: platformToken(),
    json: input,
  })
}

export async function downloadSample945(
  orderId: string,
  actor: Actor = 'platform',
  opts?: { trackingNumber?: string; carrier?: string; fulfillmentGroupId?: string },
) {
  const qs = new URLSearchParams()
  if (opts?.trackingNumber) qs.set('trackingNumber', opts.trackingNumber)
  if (opts?.carrier) qs.set('carrier', opts.carrier)
  if (opts?.fulfillmentGroupId) qs.set('fulfillmentGroupId', opts.fulfillmentGroupId)
  const suffix = qs.toString() ? `?${qs}` : ''
  const path =
    actor === 'company'
      ? `/company/orders/${orderId}/sample-945${suffix}`
      : `/platform/orders/${orderId}/sample-945${suffix}`
  const data = await request<{ fileName: string; body: string }>(path, { token: actorToken(actor) })
  const blob = new Blob([data.body], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = data.fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function listShopEvents(shopId: string) {
  return request<WebhookEvent[]>(`/platform/shops/${shopId}/events`, { token: platformToken() })
}

export function replayEvent(id: string) {
  return request<WebhookEvent>(`/platform/events/${id}/replay`, {
    method: 'POST',
    token: platformToken(),
  })
}

export function listUploaderOrders(query: OrderListQuery = {}) {
  return request<Paginated<ShopOrder>>(`/uploader/orders${toQuery(query)}`, { token: uploaderToken() })
}

// --- DLQ (Failed Orders) ---

export type FailedOrder = {
  id: string
  orderId: string
  shopId: string
  companyId: string
  reason: string
  errorMessage: string
  attempts: number
  resolvedAt: string | null
  resolvedBy: string
  resolution: string | null
  createdAt: string
  updatedAt: string
}

export function listFailedOrders(opts: { resolved?: boolean; q?: string; page?: number; limit?: number } = {}) {
  return request<Paginated<FailedOrder>>(
    `/company/failed-orders${toQuery({
      resolved: opts.resolved ?? false,
      q: opts.q,
      page: opts.page,
      limit: opts.limit,
    })}`,
    { token: companyToken() },
  )
}

export function failedOrdersCount() {
  return request<{ count: number }>('/company/failed-orders/count', { token: companyToken() })
}

export function retryFailedOrder(id: string) {
  return request<unknown>(`/company/failed-orders/${id}/retry`, { method: 'POST', token: companyToken() })
}

export function reassignFailedOrder(id: string, warehouseId: string) {
  return request<unknown>(`/company/failed-orders/${id}/reassign`, { method: 'POST', token: companyToken(), json: { warehouseId } })
}

export function skipFailedOrder(id: string) {
  return request<unknown>(`/company/failed-orders/${id}/skip`, { method: 'POST', token: companyToken() })
}

// --- Activity Logs ---

export type ActivityLogEntry = {
  id: string
  type: string
  orderId: string | null
  warehouseId: string | null
  companyId: string | null
  fromState: string
  toState: string
  message: string
  meta: Record<string, unknown>
  createdAt: string
}

export function listOrderLogs(orderId: string) {
  return request<ActivityLogEntry[]>(`/company/orders/${orderId}/logs`, { token: companyToken() })
}

// --- Warehouse 940 Template ---

export type ConditionRule = {
  field: string
  operator: string
  value: string
}

export type ConditionGroup = {
  logic: 'and' | 'or'
  conditions: ConditionRule[]
}

export type ConditionalValue = {
  when: ConditionGroup
  then: string
}

export type TemplateField = {
  position: number
  outputLabel: string
  source: 'shopify' | 'static' | 'conditional'
  shopifyPath: string
  staticValue: string
  includeCondition?: ConditionGroup | null
  conditionalValues?: ConditionalValue[]
  fallbackValue?: string
}

export type OperatorOption = { id: string; label: string }

export type WarehouseTemplate = {
  id: string
  warehouseId: string
  companyId: string
  format: 'x12' | 'csv'
  csvDelimiter: string
  csvHeaders: boolean
  fields: TemplateField[]
  x12Config: { senderId: string; receiverId: string; version: string }
  createdAt: string
  updatedAt: string
}

export async function getWarehouseTemplate(warehouseId: string): Promise<{ template: WarehouseTemplate | null; shopifyPaths: string[]; operators: OperatorOption[] }> {
  const res = await fetch(`${API_URL}/company/warehouses/${warehouseId}/template`, {
    headers: { Authorization: `Bearer ${companyToken()}` },
  })
  const json = await res.json()
  return { template: json.data ?? null, shopifyPaths: json.meta?.shopifyPaths ?? [], operators: json.meta?.operators ?? [] }
}

export function saveWarehouseTemplate(warehouseId: string, template: Partial<WarehouseTemplate>) {
  return request<WarehouseTemplate>(`/company/warehouses/${warehouseId}/template`, { method: 'PUT', token: companyToken(), json: template })
}

export function deleteWarehouseTemplate(warehouseId: string) {
  return request<unknown>(`/company/warehouses/${warehouseId}/template`, { method: 'DELETE', token: companyToken() })
}

// --- Notifications ---
export type AppNotification = {
  _id: string
  id?: string
  companyId: string
  type: string
  title: string
  message: string
  meta: Record<string, unknown>
  read: boolean
  emailSent: boolean
  createdAt: string
}

export async function getNotifications(
  opts: { unread?: boolean; page?: number; limit?: number } | boolean = false,
): Promise<{ data: Paginated<AppNotification>; unreadCount: number }> {
  const normalized = typeof opts === 'boolean' ? { unread: opts } : opts
  const res = await fetch(
    `${API_URL}/company/notifications${toQuery({
      unread: normalized.unread ?? false,
      page: normalized.page,
      limit: normalized.limit,
    })}`,
    { headers: { Authorization: `Bearer ${companyToken()}` } },
  )
  const json = await res.json()
  const payload = json.data
  const page: Paginated<AppNotification> = Array.isArray(payload)
    ? { items: payload, total: payload.length, page: 1, limit: payload.length || 25 }
    : {
        items: payload?.items ?? [],
        total: payload?.total ?? 0,
        page: payload?.page ?? 1,
        limit: payload?.limit ?? 25,
      }
  return {
    data: page,
    unreadCount: payload?.unreadCount ?? json.unreadCount ?? json.meta?.unreadCount ?? 0,
  }
}

export function markNotificationRead(id: string) {
  return request<unknown>(`/company/notifications/${id}/read`, { method: 'POST', token: companyToken() })
}

export function markAllNotificationsRead() {
  return request<unknown>(`/company/notifications/read-all`, { method: 'POST', token: companyToken() })
}

// --- SMTP Settings ---
export type SmtpSettings = {
  _id?: string
  companyId?: string
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  fromName: string
  fromEmail: string
  enabled: boolean
  notifyOn: string[]
  recipients: string[]
}

export function getSmtpSettings(): Promise<SmtpSettings | null> {
  return fetch(`${API_URL}/company/smtp-settings`, {
    headers: { Authorization: `Bearer ${companyToken()}` },
  })
    .then((res) => res.json())
    .then((json) => json.data ?? null)
}

export function getInviteEmailReady() {
  return request<{ ready: boolean; message?: string }>(`/company/invite-email-ready`, {
    token: companyToken(),
  })
}

export function saveSmtpSettings(settings: Partial<SmtpSettings>) {
  return request<SmtpSettings>(`/company/smtp-settings`, { method: 'PUT', token: companyToken(), json: settings })
}

export type CompanyAppearance = {
  accentId: string
  customAccent: string
}

export function getCompanyAppearance() {
  return request<CompanyAppearance>(`/company/appearance`, { token: companyToken() })
}

export function saveCompanyAppearance(appearance: CompanyAppearance) {
  return request<CompanyAppearance>(`/company/appearance`, {
    method: 'PUT',
    token: companyToken(),
    json: appearance,
  })
}

export function testSmtpSettings() {
  return request<unknown>(`/company/smtp-settings/test`, { method: 'POST', token: companyToken() })
}

// --- Order Routing ---
export type RoutingField = { id: string; label: string; category: string; type: string }
export type RoutingOperator = { id: string; label: string }

export type RoutingCondition = {
  field: string
  operator: string
  value: string
}

export type RoutingRule = {
  _id: string
  companyId: string
  name: string
  priority: number
  enabled: boolean
  warehouseId: string
  conditionLogic: 'and' | 'or'
  conditions: RoutingCondition[]
  requireAllItemsInStock: boolean
}

export type RoutingConfig = {
  enabled: boolean
  autoAssignOnReceive: boolean
  autoDeliverSftp: boolean
  defaultWarehouseId: string | null
  fallbackWarehouseId?: string | null
  partialPolicy?: 'hold_all' | 'ship_available' | 'allow_customer_partial'
  addressMode?: 'off' | 'zip_prefix' | 'mapbox_distance'
}

export type InventoryItem = {
  _id?: string
  sku: string
  quantityOnHand?: number
  quantityAvailable?: number
  reserved?: number
  /** When set, increments on-hand and available by this amount (receive stock). */
  adjustBy?: number
}

export function getWarehouseInventory(warehouseId: string) {
  return request<InventoryItem[]>(`/company/warehouses/${warehouseId}/inventory`, { token: companyToken() })
}

export function saveWarehouseInventory(
  warehouseId: string,
  items: Array<Pick<InventoryItem, 'sku'> & Partial<InventoryItem>>,
) {
  return request<InventoryItem[]>(`/company/warehouses/${warehouseId}/inventory`, {
    method: 'PUT',
    token: companyToken(),
    json: { items },
  })
}

export async function getRoutingConfig(): Promise<{ config: RoutingConfig; fields: RoutingField[]; operators: RoutingOperator[] }> {
  const res = await fetch(`${API_URL}/company/routing/config`, { headers: { Authorization: `Bearer ${companyToken()}` } })
  const json = await res.json()
  return { config: json.data, fields: json.meta?.fields ?? [], operators: json.meta?.operators ?? [] }
}

export function saveRoutingConfig(config: Partial<RoutingConfig>) {
  return request<RoutingConfig>(`/company/routing/config`, { method: 'PUT', token: companyToken(), json: config })
}

export function listRoutingRules() {
  return request<RoutingRule[]>(`/company/routing/rules`, { token: companyToken() })
}

export function createRoutingRule(rule: Partial<RoutingRule>) {
  return request<RoutingRule>(`/company/routing/rules`, { method: 'POST', token: companyToken(), json: rule })
}

export function updateRoutingRule(id: string, rule: Partial<RoutingRule>) {
  return request<RoutingRule>(`/company/routing/rules/${id}`, { method: 'PUT', token: companyToken(), json: rule })
}

export function deleteRoutingRule(id: string) {
  return request<unknown>(`/company/routing/rules/${id}`, { method: 'DELETE', token: companyToken() })
}

export function reorderRoutingRules(orderedIds: string[]) {
  return request<RoutingRule[]>(`/company/routing/rules/reorder`, { method: 'POST', token: companyToken(), json: { orderedIds } })
}

export function testRouting(order: Record<string, unknown>) {
  return request<{ result: { warehouseId: string; ruleName: string; reason: string } | null; evaluations: Array<{ ruleName: string; matched: boolean }> }>(`/company/routing/test`, { method: 'POST', token: companyToken(), json: { order } })
}

export type FulfillmentGroup = {
  id: string
  orderId: string
  warehouseId: string | null
  status: string
  method: string
  lines: Array<{ orderLineId: string; sku: string; title: string; quantity: number; allocatedQty: number }>
  sftpStatus: string
  sftpError: string
  metadata?: Record<string, unknown>
  fileLink: ShopOrder['fileLink']
  shipmentId: string | null
  createdAt?: string
  updatedAt?: string
}

export type ShipmentRecord = {
  id: string
  orderId: string
  fulfillmentGroupId: string
  warehouseId: string | null
  status: string
  carrier: string
  trackingNumber: string
  trackingUrl?: string
  shopifyFulfillmentId?: string
  statusHistory?: Array<{ status: string; note?: string; source?: string; at?: string }>
  createdAt?: string
  updatedAt?: string
}

export type OrderFulfillmentPayload = {
  order: ShopOrder
  groups: FulfillmentGroup[]
  shipments: ShipmentRecord[]
  logs: ActivityLogEntry[]
  returns?: ReturnRecord[]
}

export type ReturnLine = {
  orderLineId?: string
  sku: string
  title?: string
  quantity: number
  receivedQty?: number
  restockedQty?: number
  disposition?: string
}

export type ReturnRecord = {
  id: string
  orderId: string
  companyId: string
  shopId?: string | null
  shipmentId?: string | null
  warehouseId?: string | null
  status: string
  lines: ReturnLine[]
  disposition?: string
  reason?: string
  rmaNumber: string
  trackingNumber?: string
  carrier?: string
  source?: string
  statusHistory?: Array<{ status: string; note?: string; at?: string }>
  receivedAt?: string | null
  restockedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export function listReturns(params?: { status?: string; orderId?: string; q?: string }) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.orderId) qs.set('orderId', params.orderId)
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<ReturnRecord[]>(`/company/returns${suffix}`, { token: companyToken() })
}

export type AnalyticsCount = { key: string; count: number }

export type CompanyAnalytics = {
  range: { from: string; to: string; days: number }
  summary: {
    totalOrders: number
    fulfilled: number
    partiallyFulfilled: number
    returned?: number
    partiallyReturned?: number
    inTransit: number
    onHold: number
    errors: number
    cancelled: number
    unassigned: number
    openReturns: number
    totalReturns: number
    failedDlq: number
    warehouseCount: number
    shopCount: number
  }
  ordersByStatus: AnalyticsCount[]
  ordersByDay: Array<{ date: string; count: number }>
  shipmentsByStatus: AnalyticsCount[]
  returnsByStatus: AnalyticsCount[]
  sftpByStatus: AnalyticsCount[]
  topCarriers: AnalyticsCount[]
  channelMix: AnalyticsCount[]
  warehouseOrderRank: Array<{
    rank: number
    warehouseId: string
    name: string
    code: string
    orderCount: number
    latitude: number | null
    longitude: number | null
  }>
  warehouseReturnRank: Array<{
    rank: number
    warehouseId: string
    name: string
    code: string
    returnCount: number
    latitude: number | null
    longitude: number | null
  }>
  fulfillmentFunnel: Array<{ stage: string; count: number }>
  destinations: {
    countries: AnalyticsCount[]
    regions: AnalyticsCount[]
  }
  map: {
    warehouses: Array<{
      id: string
      name: string
      code: string
      latitude: number
      longitude: number
      geoPlaceName: string
      orderCount: number
      returnCount: number
      isActive: boolean
    }>
  }
}

export function getCompanyAnalytics(query: { days?: number; from?: string; to?: string } = {}) {
  return request<CompanyAnalytics>(`/company/analytics${toQuery(query)}`, {
    token: companyToken(),
  })
}

export function getReturn(id: string) {
  return request<{ return: ReturnRecord; order: ShopOrder | null; allowedNext: string[] }>(
    `/company/returns/${id}`,
    { token: companyToken() },
  )
}

export function createReturn(payload: {
  orderId: string
  reason?: string
  warehouseId?: string | null
  shipmentId?: string | null
  authorize?: boolean
  trackingNumber?: string
  carrier?: string
  lines?: Array<{ orderLineId?: string; sku: string; title?: string; quantity: number }>
}) {
  return request<ReturnRecord>('/company/returns', {
    method: 'POST',
    token: companyToken(),
    json: payload,
  })
}

export function createOrderReturn(
  orderId: string,
  payload?: {
    reason?: string
    warehouseId?: string | null
    authorize?: boolean
    lines?: Array<{ orderLineId?: string; sku: string; title?: string; quantity: number }>
  },
) {
  return request<ReturnRecord>(`/company/orders/${orderId}/returns`, {
    method: 'POST',
    token: companyToken(),
    json: payload || {},
  })
}

export function updateReturnStatus(
  id: string,
  payload: {
    status: string
    note?: string
    warehouseId?: string | null
    trackingNumber?: string
    carrier?: string
    disposition?: string
    lines?: ReturnLine[]
  },
) {
  return request<{ return: ReturnRecord; order: ShopOrder | null; allowedNext: string[] }>(
    `/company/returns/${id}/status`,
    { method: 'PATCH', token: companyToken(), json: payload },
  )
}

export function receiveReturn(id: string, payload?: { note?: string; warehouseId?: string | null; lines?: ReturnLine[] }) {
  return request<{ return: ReturnRecord; order: ShopOrder | null; allowedNext: string[] }>(
    `/company/returns/${id}/receive`,
    { method: 'POST', token: companyToken(), json: payload || {} },
  )
}

export function restockReturn(id: string, payload?: { note?: string; warehouseId?: string | null; disposition?: string }) {
  return request<{ return: ReturnRecord; order: ShopOrder | null; allowedNext: string[] }>(
    `/company/returns/${id}/restock`,
    { method: 'POST', token: companyToken(), json: payload || {} },
  )
}

export function deleteReturn(id: string) {
  return request<{ message: string }>(`/company/returns/${id}`, {
    method: 'DELETE',
    token: companyToken(),
  })
}

export const RETURN_STATUS_ACTIONS: Array<{ value: string; label: string }> = [
  { value: 'authorized', label: 'Authorize' },
  { value: 'in_transit', label: 'In transit (customer shipping)' },
  { value: 'received', label: 'Received' },
  { value: 'inspected', label: 'Inspected' },
  { value: 'restocked', label: 'Restocked' },
  { value: 'refurbished', label: 'Refurbished' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'quarantined', label: 'Quarantined' },
  { value: 'disposed', label: 'Disposed' },
  { value: 'scrapped', label: 'Scrapped' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'exchanged', label: 'Exchanged' },
  { value: 'cancelled', label: 'Cancel' },
]

export function getOrderFulfillment(orderId: string) {
  return request<OrderFulfillmentPayload>(`/company/orders/${orderId}/fulfillment`, { token: companyToken() })
}

export function allocateOrder(orderId: string, warehouseId?: string | null) {
  return request<{ order: ShopOrder; groups: FulfillmentGroup[]; hold: boolean }>(`/company/orders/${orderId}/allocate`, {
    method: 'POST',
    token: companyToken(),
    json: warehouseId ? { warehouseId } : {},
  })
}

export function clearOrderAllocation(orderId: string) {
  return request<{ order: ShopOrder; groups: FulfillmentGroup[] }>(`/company/orders/${orderId}/unallocate`, {
    method: 'POST',
    token: companyToken(),
    json: {},
  })
}

export function shipFulfillmentGroup(groupId: string, payload: { trackingNumber: string; carrier?: string }) {
  return request<{
    order: ShopOrder
    group: FulfillmentGroup
    shipment: ShipmentRecord
    shopifySynced?: boolean
    shopifyError?: string | null
  }>(`/company/fulfillment-groups/${groupId}/ship`, {
    method: 'POST',
    token: companyToken(),
    json: payload,
  })
}

export function syncFulfillmentGroupToShopify(groupId: string) {
  return request<{
    order: ShopOrder
    group: FulfillmentGroup
    shipment: ShipmentRecord | null
    shopifyFulfillmentId: string | null
  }>(`/company/fulfillment-groups/${groupId}/sync-shopify`, {
    method: 'POST',
    token: companyToken(),
  })
}

export function syncOrderToShopify(orderId: string, force = false) {
  return request<{
    order: ShopOrder
    results: Array<{ groupId: string; skipped?: boolean; shopifyFulfillmentId?: string | null }>
    errors: Array<{ groupId: string; error: string }>
    syncedCount: number
  }>(`/company/orders/${orderId}/sync-shopify`, {
    method: 'POST',
    token: companyToken(),
    json: { force },
  })
}

export function updateShipmentStatus(
  shipmentId: string,
  payload: { status: string; note?: string; happenedAt?: string; trackingUrl?: string },
) {
  return request<{
    shipment: ShipmentRecord
    order: ShopOrder
    shopifyEvent?: unknown
    shopifyError?: string | null
    allowedNext: string[]
  }>(`/company/shipments/${shipmentId}/status`, {
    method: 'PATCH',
    token: companyToken(),
    json: payload,
  })
}

export const SHIPMENT_STATUS_OPTIONS = [
  { value: 'labeled', label: 'Labeled / ready' },
  { value: 'in_transit', label: 'In transit (on the way)' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Delivery failed' },
  { value: 'returned', label: 'Returned' },
] as const

export function deleteInventoryItem(warehouseId: string, sku: string) {
  return request<unknown>(`/company/warehouses/${warehouseId}/inventory/${encodeURIComponent(sku)}`, { method: 'DELETE', token: companyToken() })
}
