'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, newEventId } = require('@linker/common')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'shops' }))

  app.get('/shops', async (req) => {
    const where = {}
    if (req.query.companyId) where.companyId = req.query.companyId
    return prisma.shop.findMany({ where })
  })

  app.post('/shops', async (req) => {
    const body = req.body || {}
    return prisma.shop.create({
      data: {
        id: newEventId(),
        domain: String(body.domain).toLowerCase(),
        companyId: body.companyId,
        warehouseId: body.warehouseId || null,
        ecommerceProvider: body.ecommerceProvider || 'shopify',
        enabled: body.enabled !== false,
        mappingKey: body.mappingKey || 'generic',
      },
    })
  })

  app.get('/shops/by-domain/:domain', async (req, reply) => {
    const row = await prisma.shop.findUnique({
      where: { domain: String(req.params.domain).toLowerCase() },
    })
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  app.patch('/shops/:id', async (req, reply) => {
    try {
      return await prisma.shop.update({ where: { id: req.params.id }, data: req.body || {} })
    } catch {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  return app
}

bootService({
  serviceName: 'shops',
  serviceRoot: path.join(__dirname, '..'),
  port: 4004,
  buildApp,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
