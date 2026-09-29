'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, enqueueOutbox, onceEvent, newEventId } = require('@linker/common')
const { TOPICS, EXCHANGES } = require('@linker/contracts')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'inventory' }))

  app.get('/inventory/jobs', async () =>
    prisma.syncJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  )

  app.post('/inventory/push', async (req) => {
    const body = req.body || {}
    const job = await prisma.syncJob.create({
      data: {
        id: newEventId(),
        shopDomain: body.shopDomain,
        warehouseId: body.warehouseId || null,
        sku: body.sku || null,
        status: 'queued',
        payload: body,
      },
    })
    await prisma.$transaction(async (tx) => {
      await enqueueOutbox(tx, {
        exchange: EXCHANGES.ECOMMERCE_COMMANDS,
        routingKey: `${body.ecommerceProvider || 'shopify'}.${TOPICS.ECOMMERCE_INVENTORY_SET}`,
        payload: {
          eventId: newEventId(),
          provider: body.ecommerceProvider || 'shopify',
          shopDomain: body.shopDomain,
          sku: body.sku,
          quantity: body.quantity,
          locationExternalId: body.locationExternalId || null,
          idempotencyKey: body.idempotencyKey || newEventId(),
        },
      })
    })
    return job
  })

  return app
}

async function onReady({ logger, prisma, bus }) {
  await bus.subscribe(
    'inventory.events',
    [
      { exchange: EXCHANGES.EVENTS, pattern: TOPICS.WMS_INVENTORY_UPDATED },
      { exchange: EXCHANGES.EVENTS, pattern: TOPICS.ECOMMERCE_INVENTORY_CHANGED },
    ],
    async ({ routingKey, payload }) => {
      if (!(await onceEvent(prisma, payload.eventId, routingKey))) return
      await prisma.syncJob.create({
        data: {
          id: newEventId(),
          shopDomain: payload.shopDomain || 'n/a',
          warehouseId: payload.warehouseId || null,
          sku: payload.sku || null,
          status: 'observed',
          payload,
        },
      })
      if (routingKey === TOPICS.WMS_INVENTORY_UPDATED && payload.shopDomain) {
        await prisma.$transaction(async (tx) => {
          await enqueueOutbox(tx, {
            exchange: EXCHANGES.ECOMMERCE_COMMANDS,
            routingKey: `shopify.${TOPICS.ECOMMERCE_INVENTORY_SET}`,
            payload: {
              eventId: newEventId(),
              provider: 'shopify',
              shopDomain: payload.shopDomain,
              sku: payload.sku,
              quantity: payload.quantity,
              locationExternalId: null,
              idempotencyKey: newEventId(),
            },
          })
        })
      }
    },
  )
}

bootService({
  serviceName: 'inventory',
  serviceRoot: path.join(__dirname, '..'),
  port: 4009,
  buildApp,
  onReady,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
