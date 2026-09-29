'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const proxy = require('@fastify/http-proxy')
const { loadEnv, createLogger } = require('@linker/common')
const { registerCompatRoutes } = require('./compat')

const ROOT = path.join(__dirname, '..')
loadEnv(ROOT)
process.env.EVENT_BUS = process.env.EVENT_BUS || 'http'
const logger = createLogger('api-gateway')
const port = Number(process.env.PORT || process.env.GATEWAY_PORT || 4000)

const ROUTES = [
  { prefix: '/auth', upstream: process.env.AUTH_URL || 'http://127.0.0.1:4001' },
  { prefix: '/platform-svc', upstream: process.env.PLATFORM_URL || 'http://127.0.0.1:4002' },
  { prefix: '/companies', upstream: process.env.COMPANIES_URL || 'http://127.0.0.1:4003' },
  { prefix: '/warehouses', upstream: process.env.COMPANIES_URL || 'http://127.0.0.1:4003' },
  { prefix: '/shops', upstream: process.env.SHOPS_URL || 'http://127.0.0.1:4004' },
  { prefix: '/orders', upstream: process.env.ORDERS_URL || 'http://127.0.0.1:4005' },
  { prefix: '/fulfillment', upstream: process.env.FULFILLMENT_URL || 'http://127.0.0.1:4006' },
  { prefix: '/routing', upstream: process.env.ROUTING_URL || 'http://127.0.0.1:4007' },
  { prefix: '/saga', upstream: process.env.SAGA_URL || 'http://127.0.0.1:4008' },
  { prefix: '/inventory', upstream: process.env.INVENTORY_URL || 'http://127.0.0.1:4009' },
  { prefix: '/files', upstream: process.env.FILES_URL || 'http://127.0.0.1:4010' },
  { prefix: '/notifications', upstream: process.env.NOTIFICATIONS_URL || 'http://127.0.0.1:4011' },
  { prefix: '/uploaders', upstream: process.env.UPLOADERS_URL || 'http://127.0.0.1:4012' },
  { prefix: '/modernwms', upstream: process.env.WMS_MODERNWMS_URL || 'http://127.0.0.1:4014' },
  { prefix: '/edi', upstream: process.env.WMS_SFTP_EDI_URL || 'http://127.0.0.1:4015' },
]

async function main() {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({
    ok: true,
    service: 'api-gateway',
    compat: true,
    routes: ROUTES.map((r) => r.prefix),
  }))

  await registerCompatRoutes(app)

  for (const r of ROUTES) {
    await app.register(proxy, {
      upstream: r.upstream,
      prefix: r.prefix,
      rewritePrefix: r.prefix === '/platform-svc' ? '' : r.prefix,
    })
  }

  await app.listen({ port, host: '0.0.0.0' })
  logger.info({ port }, 'api-gateway listening (compat + proxy)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
