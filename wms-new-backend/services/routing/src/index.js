'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, onceEvent, newEventId, enqueueOutbox } = require('@linker/common')
const { TOPICS, EXCHANGES } = require('@linker/contracts')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'routing' }))

  app.get('/routing/config/:companyId', async (req, reply) => {
    const row = await prisma.routingConfig.findUnique({ where: { companyId: req.params.companyId } })
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  app.put('/routing/config/:companyId', async (req) => {
    const body = req.body || {}
    return prisma.routingConfig.upsert({
      where: { companyId: req.params.companyId },
      create: {
        id: newEventId(),
        companyId: req.params.companyId,
        mode: body.mode || 'default_warehouse',
        config: body.config || {},
      },
      update: { mode: body.mode, config: body.config },
    })
  })

  app.get('/routing/inventory/:warehouseId', async (req) =>
    prisma.warehouseInventory.findMany({ where: { warehouseId: req.params.warehouseId } }),
  )

  app.put('/routing/inventory/:warehouseId/:sku', async (req) => {
    const qty = Number(req.body?.quantity ?? 0)
    return prisma.warehouseInventory.upsert({
      where: {
        warehouseId_sku: { warehouseId: req.params.warehouseId, sku: req.params.sku },
      },
      create: {
        id: newEventId(),
        warehouseId: req.params.warehouseId,
        sku: req.params.sku,
        quantity: qty,
      },
      update: { quantity: qty },
    })
  })

  return app
}

async function onReady({ logger, prisma, bus }) {
  await bus.subscribe(
    'routing.wms-inventory',
    [{ exchange: EXCHANGES.EVENTS, pattern: TOPICS.WMS_INVENTORY_UPDATED }],
    async ({ routingKey, payload }) => {
      if (!(await onceEvent(prisma, payload.eventId, routingKey))) return
      await prisma.warehouseInventory.upsert({
        where: {
          warehouseId_sku: { warehouseId: payload.warehouseId, sku: payload.sku },
        },
        create: {
          id: newEventId(),
          warehouseId: payload.warehouseId,
          sku: payload.sku,
          quantity: payload.quantity,
        },
        update: { quantity: payload.quantity },
      })
      await prisma.$transaction(async (tx) => {
        await enqueueOutbox(tx, {
          exchange: EXCHANGES.EVENTS,
          routingKey: TOPICS.NOTIFICATION_CREATE,
          payload: {
            eventId: newEventId(),
            type: 'inventory_updated',
            title: `Inventory ${payload.sku} = ${payload.quantity}`,
            meta: payload,
          },
        })
      })
    },
  )
}

bootService({
  serviceName: 'routing',
  serviceRoot: path.join(__dirname, '..'),
  port: 4007,
  buildApp,
  onReady,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
