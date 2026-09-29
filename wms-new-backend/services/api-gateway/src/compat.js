'use strict'

/**
 * Monolith-compatible API facade for wms-admin-dash.
 * Wraps microservice calls in { success, message, data, errors }.
 */
const jwt = require('jsonwebtoken')

function ok(data, message = 'OK') {
  return { success: true, message, data, errors: null }
}

function fail(reply, status, message, errors = null) {
  return reply.code(status).send({ success: false, message, data: null, errors })
}

function urls() {
  return {
    auth: process.env.AUTH_URL || 'http://127.0.0.1:4001',
    platform: process.env.PLATFORM_URL || 'http://127.0.0.1:4002',
    companies: process.env.COMPANIES_URL || 'http://127.0.0.1:4003',
    shops: process.env.SHOPS_URL || 'http://127.0.0.1:4004',
    orders: process.env.ORDERS_URL || 'http://127.0.0.1:4005',
    fulfillment: process.env.FULFILLMENT_URL || 'http://127.0.0.1:4006',
    shopify: process.env.ECOMMERCE_SHOPIFY_URL || 'http://127.0.0.1:4013',
    modernwms: process.env.WMS_MODERNWMS_URL || 'http://127.0.0.1:4014',
  }
}

async function jfetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  return { res, body }
}

function mapWarehouse(w) {
  if (!w) return w
  return {
    id: w.id,
    companyId: w.companyId,
    name: w.name,
    code: w.code || '',
    address: typeof w.address === 'string' ? w.address : JSON.stringify(w.address || {}),
    sftpConnectionId: null,
    isActive: w.isActive !== false,
    fulfillmentMode: w.wmsProvider === 'modernwms' ? 'modernwms' : 'sftp_edi',
    modernwms:
      w.wmsProvider === 'modernwms'
        ? {
            baseUrl: w.wmsConfig?.baseUrl || '',
            username: w.wmsConfig?.username || '',
            passwordSet: Boolean(w.wmsConfig?.password),
            tenantId: w.wmsConfig?.tenantId ?? null,
            goodsOwnerId: w.wmsConfig?.goodsOwnerId ?? null,
            defaultCustomerId: w.wmsConfig?.defaultCustomerId ?? null,
            autoConfirmOrder: Boolean(w.wmsConfig?.autoConfirmOrder),
          }
        : undefined,
    createdAt: w.createdAt,
  }
}

function mapCompany(c) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone || '',
    notes: c.notes || '',
    status: c.status || 'active',
    contactName: c.contactName,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    warehouses: (c.warehouses || []).map(mapWarehouse),
  }
}

function mapShop(s) {
  return {
    id: s.id,
    shopDomain: s.domain,
    companyId: s.companyId,
    warehouseId: s.warehouseId,
    enabled: s.enabled,
    installed: Boolean(s.installedAt || s.accessTokenEnc),
    mappingKey: s.mappingKey || 'generic',
    installedAt: s.installedAt || null,
    createdAt: s.createdAt,
  }
}

function mapOrder(o) {
  return {
    id: o.id,
    shopDomain: o.shopDomain,
    shopifyOrderId: o.externalOrderId,
    orderNumber: o.orderNumber,
    status: o.status,
    currency: o.currency,
    customerEmail: o.customerEmail,
    shippingAddress: o.shippingAddress,
    lineItems: o.lineItems,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }
}

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

function decode(req) {
  const token = bearer(req)
  if (!token) return null
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'dev-linker-jwt-change-me')
  } catch {
    return null
  }
}

async function registerCompatRoutes(app) {
  const U = urls()

  app.post('/platform/auth/login', async (req, reply) => {
    const { res, body } = await jfetch(`${U.auth}/auth/platform/login`, {
      method: 'POST',
      json: req.body,
    })
    if (!res.ok) return fail(reply, res.status, body?.error || 'Login failed')
    return ok({
      token: body.token,
      user: { id: body.user.id, username: body.user.username, isActive: true },
    })
  })

  app.post('/company/auth/login', async (req, reply) => {
    const { res, body } = await jfetch(`${U.auth}/auth/company/login`, {
      method: 'POST',
      json: req.body,
    })
    if (!res.ok) return fail(reply, res.status, body?.error || 'Login failed')
    return ok({
      token: body.token,
      user: {
        id: body.user.id,
        companyId: body.user.companyId,
        name: body.user.email,
        email: body.user.email,
        role: body.user.role || 'root',
        warehouseIds: [],
        status: 'active',
      },
    })
  })

  app.post('/uploader/auth/login', async (req, reply) => {
    const { res, body } = await jfetch(`${U.auth}/auth/uploader/login`, {
      method: 'POST',
      json: req.body,
    })
    if (!res.ok) return fail(reply, res.status, body?.error || 'Login failed')
    return ok({
      token: body.token,
      user: { id: body.user.id, username: body.user.username, shopIds: [] },
    })
  })

  app.post('/company/auth/signup', async (req, reply) => {
    const b = req.body || {}
    const { res: cRes, body: company } = await jfetch(`${U.companies}/companies`, {
      method: 'POST',
      json: {
        name: b.name,
        contactName: b.contactName || b.name,
        email: b.email,
        phone: b.phone,
        notes: b.notes,
        status: 'pending',
      },
    })
    if (!cRes.ok) return fail(reply, cRes.status, company?.error || 'Signup failed')

    await jfetch(`${U.auth}/auth/users`, {
      method: 'POST',
      json: {
        email: b.email,
        password: b.password,
        audience: 'company',
        role: 'root',
        companyId: company.id,
      },
    })

    return ok(
      { company: mapCompany(company), message: 'Registration submitted! Pending admin approval.' },
      'Registration submitted',
    )
  })

  app.get('/company/me', async (req, reply) => {
    const payload = decode(req)
    if (!payload || payload.aud !== 'company') return fail(reply, 401, 'Unauthorized')
    const { res: uRes, body: me } = await jfetch(`${U.auth}/auth/me`, {
      headers: { Authorization: `Bearer ${bearer(req)}` },
    })
    if (!uRes.ok) return fail(reply, 401, 'Unauthorized')
    const { res: cRes, body: company } = await jfetch(`${U.companies}/companies/${me.companyId}`)
    if (!cRes.ok) return fail(reply, 404, 'Company not found')
    return ok({
      company: mapCompany(company),
      user: {
        id: me.id,
        companyId: me.companyId,
        name: me.email || me.username,
        email: me.email,
        role: me.role,
        warehouseIds: [],
        status: 'active',
        companyName: company.name,
      },
    })
  })

  app.get('/platform/companies', async (req, reply) => {
    if (!decode(req)) return fail(reply, 401, 'Unauthorized')
    const { res, body } = await jfetch(`${U.companies}/companies`)
    if (!res.ok) return fail(reply, res.status, 'Failed to list companies')
    return ok((body || []).map(mapCompany))
  })

  app.post('/platform/companies', async (req, reply) => {
    if (!decode(req)) return fail(reply, 401, 'Unauthorized')
    const b = req.body || {}
    const { res, body } = await jfetch(`${U.companies}/companies`, {
      method: 'POST',
      json: { ...b, status: 'active' },
    })
    if (!res.ok) return fail(reply, res.status, body?.error || 'Create failed')
    if (b.email) {
      await jfetch(`${U.auth}/auth/users`, {
        method: 'POST',
        json: {
          email: b.email,
          password: b.tempPassword || 'ChangeMe123!',
          audience: 'company',
          role: 'root',
          companyId: body.id,
        },
      })
    }
    return ok({ company: mapCompany(body), inviteSent: false })
  })

  app.get('/platform/companies/:id', async (req, reply) => {
    if (!decode(req)) return fail(reply, 401, 'Unauthorized')
    const { res, body } = await jfetch(`${U.companies}/companies/${req.params.id}`)
    if (!res.ok) return fail(reply, res.status, 'Not found')
    return ok(mapCompany(body))
  })

  app.post('/platform/companies/:id/warehouses', async (req, reply) => {
    if (!decode(req)) return fail(reply, 401, 'Unauthorized')
    const b = req.body || {}
    const wmsProvider = b.fulfillmentMode === 'modernwms' ? 'modernwms' : b.wmsProvider || 'sftp_edi'
    const { res, body } = await jfetch(`${U.companies}/companies/${req.params.id}/warehouses`, {
      method: 'POST',
      json: {
        name: b.name,
        code: b.code,
        address: b.address,
        wmsProvider,
        wmsConfig: b.modernwms || b.wmsConfig || {},
      },
    })
    if (!res.ok) return fail(reply, res.status, body?.error || 'Create warehouse failed')
    return ok(mapWarehouse(body))
  })

  app.post('/platform/companies/:id/approve', async (req, reply) => {
    if (!decode(req)) return fail(reply, 401, 'Unauthorized')
    const { res, body } = await jfetch(`${U.companies}/companies/${req.params.id}`, {
      method: 'PATCH',
      json: { status: 'active' },
    })
    if (!res.ok) return fail(reply, res.status, 'Approve failed')
    return ok(mapCompany(body))
  })

  app.get('/platform/shops', async (req, reply) => {
    if (!decode(req)) return fail(reply, 401, 'Unauthorized')
    const { res, body } = await jfetch(`${U.shops}/shops`)
    if (!res.ok) return fail(reply, res.status, 'Failed')
    return ok((body || []).map(mapShop))
  })

  app.post('/platform/companies/:id/shops', async (req, reply) => {
    if (!decode(req)) return fail(reply, 401, 'Unauthorized')
    const b = req.body || {}
    const { res, body } = await jfetch(`${U.shops}/shops`, {
      method: 'POST',
      json: {
        domain: b.shopDomain || b.domain,
        companyId: req.params.id,
        warehouseId: b.warehouseId,
        ecommerceProvider: 'shopify',
        enabled: true,
      },
    })
    if (!res.ok) return fail(reply, res.status, body?.error || 'Attach shop failed')
    return ok(mapShop(body))
  })

  app.get('/platform/settings', async (req, reply) => {
    if (!decode(req)) return fail(reply, 401, 'Unauthorized')
    return ok({
      retentionDays: 90,
      autoCleanupEnabled: false,
      webhooksEnabled: true,
      lastCleanupAt: null,
      lastCleanupStats: {},
    })
  })

  app.get('/company/orders', async (req, reply) => {
    const payload = decode(req)
    if (!payload || payload.aud !== 'company') return fail(reply, 401, 'Unauthorized')
    const { res, body } = await jfetch(
      `${U.orders}/orders?companyId=${encodeURIComponent(payload.companyId || '')}`,
    )
    if (!res.ok) return fail(reply, res.status, 'Failed to list orders')
    const items = (body || []).map(mapOrder)
    return ok({ items, total: items.length, page: 1, pageSize: items.length })
  })

  app.get('/company/warehouses', async (req, reply) => {
    const payload = decode(req)
    if (!payload || payload.aud !== 'company') return fail(reply, 401, 'Unauthorized')
    const { res, body } = await jfetch(`${U.companies}/companies/${payload.companyId}`)
    if (!res.ok) return fail(reply, res.status, 'Failed')
    return ok((body.warehouses || []).map(mapWarehouse))
  })

  app.get('/company/shops', async (req, reply) => {
    const payload = decode(req)
    if (!payload || payload.aud !== 'company') return fail(reply, 401, 'Unauthorized')
    const { res, body } = await jfetch(
      `${U.shops}/shops?companyId=${encodeURIComponent(payload.companyId || '')}`,
    )
    if (!res.ok) return fail(reply, res.status, 'Failed')
    return ok((body || []).map(mapShop))
  })

  // Pass-through shopify webhooks (raw, not enveloped)
  app.post('/shopify/webhooks', async (req, reply) => {
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.startsWith('x-shopify') || k === 'content-type') headers[k] = v
    }
    const res = await fetch(`${U.shopify}/shopify/webhooks`, {
      method: 'POST',
      headers,
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
    })
    const text = await res.text()
    reply.code(res.status)
    try {
      return JSON.parse(text)
    } catch {
      return { ok: res.ok }
    }
  })
}

module.exports = { registerCompatRoutes }
