import { API_URL } from './config'
import { getCompanySession, getPlatformSession, getUploaderSession } from './auth'

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
}

export type Warehouse = {
  id: string
  companyId: string
  name: string
  code: string
  address: string
  sftpConnectionId: string | null
  isActive: boolean
  createdAt: string
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
  status: 'invited' | 'active' | 'disabled'
  createdAt: string
  shopCount?: number
  warehouseCount?: number
  shops?: Shop[]
  warehouses?: Warehouse[]
  sftpConnections?: SftpConnection[]
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
  status: string
  companyName?: string
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

export type ShopOrder = {
  id: string
  shopId: string
  shopifyOrderId: string
  orderNumber: string
  customerName: string
  email: string
  status: string
  source?: string
  trackingNumber: string
  carrier: string
  warehouseId?: string | null
  sftpStatus?: string
  sftpError?: string
  fileLink: {
    token: string
    url: string
    passwordRequired: boolean
    fileName: string
  } | null
  lastError: string
  createdAt: string
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
  if (!json.success || json.data == null) {
    throw new Error(json.message || 'Request failed')
  }
  return json.data
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string; json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`)
  }
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
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

export function listCompanies() {
  return request<Company[]>('/platform/companies', { token: platformToken() })
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

export function addWarehouse(
  companyId: string,
  input: { name: string; code?: string; address?: string },
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

export function companyLogin(input: { email: string; password: string }) {
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

export function listCompanyOrders() {
  return request<ShopOrder[]>('/company/orders', { token: companyToken() })
}

export function listCompanyUsers() {
  return request<CompanyMember[]>('/company/users', { token: companyToken() })
}

export function createCompanyUser(input: {
  name: string
  email: string
  role: 'member' | 'warehouse'
  warehouseIds?: string[]
}) {
  return request<{ user: CompanyMember; inviteSent: boolean; inviteUrl?: string }>('/company/users', {
    method: 'POST',
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
  input: { name?: string; code?: string; address?: string; sftpConnectionId?: string | null },
) {
  return request<Warehouse>(`/company/warehouses/${id}`, {
    method: 'PATCH',
    token: companyToken(),
    json: input,
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

export function listShopOrders(shopId: string) {
  return request<ShopOrder[]>(`/platform/shops/${shopId}/orders`, { token: platformToken() })
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

export async function upload945(orderId: string, file: File, actor: Actor = 'platform') {
  const form = new FormData()
  form.append('file', file)
  const path =
    actor === 'company'
      ? `/company/orders/${orderId}/945`
      : actor === 'uploader'
        ? `/uploader/orders/${orderId}/945`
        : `/platform/orders/${orderId}/945`
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${actorToken(actor)}` },
    body: form,
  })
  return parseJson<ShopOrder>(response)
}

export function shipOrder(
  orderId: string,
  input: { trackingNumber: string; carrier?: string },
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

export async function downloadSample945(orderId: string, actor: Actor = 'platform') {
  const path =
    actor === 'company' ? `/company/orders/${orderId}/sample-945` : `/platform/orders/${orderId}/sample-945`
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

export function listUploaderOrders() {
  return request<ShopOrder[]>('/uploader/orders', { token: uploaderToken() })
}
