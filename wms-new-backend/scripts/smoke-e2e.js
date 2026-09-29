'use strict'

/**
 * End-to-end smoke against gateway compat API + microservices.
 * Usage: node scripts/smoke-e2e.js
 */
const BASE = process.env.GATEWAY_URL || 'http://127.0.0.1:4000'

async function req(path, { method = 'GET', token, json } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.success === false) {
    throw new Error(`${method} ${path} -> ${res.status} ${body.message || JSON.stringify(body)}`)
  }
  return body.data !== undefined ? body.data : body
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log('smoke: health')
  const health = await fetch(`${BASE}/health`).then((r) => r.json())
  console.log('  gateway', health)

  console.log('smoke: platform login')
  const platform = await req('/platform/auth/login', {
    method: 'POST',
    json: { username: 'admin', password: 'admin' },
  })
  console.log('  token ok', platform.user.username)

  const stamp = Date.now()
  console.log('smoke: create company')
  const created = await req('/platform/companies', {
    method: 'POST',
    token: platform.token,
    json: {
      name: `Smoke Co ${stamp}`,
      email: `smoke${stamp}@example.com`,
      phone: '+10000000000',
      tempPassword: 'SmokeTest123!',
    },
  })
  const companyId = created.company.id
  console.log('  company', companyId)

  console.log('smoke: add warehouse modernwms')
  const wh = await req(`/platform/companies/${companyId}/warehouses`, {
    method: 'POST',
    token: platform.token,
    json: {
      name: 'Main WH',
      code: 'WH1',
      fulfillmentMode: 'modernwms',
      modernwms: { baseUrl: 'http://mock', username: 'u', password: 'p' },
    },
  })
  console.log('  warehouse', wh.id, wh.fulfillmentMode)

  console.log('smoke: attach shop')
  const shop = await req(`/platform/companies/${companyId}/shops`, {
    method: 'POST',
    token: platform.token,
    json: { shopDomain: `smoke-${stamp}.myshopify.com`, warehouseId: wh.id },
  })
  console.log('  shop', shop.shopDomain)

  console.log('smoke: company login')
  const company = await req('/company/auth/login', {
    method: 'POST',
    json: { email: `smoke${stamp}@example.com`, password: 'SmokeTest123!', expectedRole: 'root' },
  })
  console.log('  company user', company.user.email)

  console.log('smoke: company me')
  const me = await req('/company/me', { token: company.token })
  console.log('  me company', me.company.name)

  console.log('smoke: webhook order create')
  const orderId = String(900000 + (stamp % 100000))
  const whRes = await fetch(`${BASE}/shopify/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': 'orders/create',
      'X-Shopify-Shop-Domain': shop.shopDomain,
      'X-Shopify-Webhook-Id': `wh-${stamp}`,
    },
    body: JSON.stringify({
      id: orderId,
      name: `#${orderId}`,
      email: 'buyer@example.com',
      currency: 'USD',
      line_items: [{ id: 1, sku: 'SKU-1', title: 'Test Tee', quantity: 2 }],
      shipping_address: { address1: '1 Main', city: 'Austin', country: 'US', zip: '78701' },
    }),
  })
  console.log('  webhook', whRes.status, await whRes.text())

  await sleep(2500)

  console.log('smoke: list orders')
  const orders = await req('/company/orders', { token: company.token })
  console.log('  orders', orders.total, orders.items?.[0]?.orderNumber || orders.items?.[0]?.id)

  console.log('smoke: fulfillment groups')
  const groups = await fetch('http://127.0.0.1:4006/fulfillment/groups').then((r) => r.json())
  console.log('  groups', Array.isArray(groups) ? groups.length : groups)
  const group = (groups || [])[0]
  if (group) {
    console.log('smoke: confirm modernwms ship', group.id)
    const conf = await fetch(`http://127.0.0.1:4014/modernwms/links/${group.id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        trackingNumber: `TRK-${stamp}`,
        trackingCompany: 'SmokeCarrier',
      }),
    }).then((r) => r.json())
    console.log('  confirm', conf)
    await sleep(2000)
    const saga = await fetch(`http://127.0.0.1:4008/saga/${group.orderId}`).then((r) => r.json())
    console.log('  saga', saga.status || saga)
  }

  console.log('\nSMOKE PASS')
}

main().catch((err) => {
  console.error('\nSMOKE FAIL', err.message)
  process.exit(1)
})
