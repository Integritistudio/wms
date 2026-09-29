'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const {
  bootService,
  enqueueOutbox,
  onceEvent,
  newEventId,
} = require('@linker/common')
const { CanonicalOrder, CanonicalOrderCancelled, TOPICS, EXCHANGES } = require('@linker/contracts')

async function resolveShop(shopDomain) {
  const base = process.env.SHOPS_URL || 'http://127.0.0.1:4004'
  const res = await fetch(`${base}/shops/by-domain/${encodeURIComponent(shopDomain)}`)
  if (!res.ok) return null
  return res.json()
}

async function ingestOrder(prisma, payload) {
  const data = CanonicalOrder.parse(payload)
  const shop = await resolveShop(data.shopDomain)
  const order = await prisma.order.upsert({
    where: {
      shopDomain_externalOrderId: {
        shopDomain: data.shopDomain,
        externalOrderId: data.externalOrderId,
      },
    },
    create: {
      id: newEventId(),
      companyId: shop?.companyId || null,
      shopDomain: data.shopDomain,
      ecommerceProvider: data.provider,
      externalOrderId: data.externalOrderId,
      orderNumber: data.orderNumber || null,
      status: 'open',
      currency: data.currency || 'USD',
      customerEmail: data.customerEmail || null,
      shippingAddress: data.shippingAddress || null,
      lineItems: data.lineItems,
      canonical: data,
    },
    update: {
      lineItems: data.lineItems,
      shippingAddress: data.shippingAddress || null,
      canonical: data,
      status: 'open',
    },
  })

  await prisma.$transaction(async (tx) => {
    await enqueueOutbox(tx, {
      exchange: EXCHANGES.EVENTS,
      routingKey: TOPICS.ORDER_INGESTED,
      payload: {
        eventId: newEventId(),
        orderId: order.id,
        companyId: order.companyId,
        shopDomain: order.shopDomain,
        ecommerceProvider: order.ecommerceProvider,
        externalOrderId: order.externalOrderId,
        orderNumber: order.orderNumber,
        warehouseId: shop?.warehouseId || null,
        shippingAddress: order.shippingAddress,
        lineItems: order.lineItems,
      },
    })
    await enqueueOutbox(tx, {
      exchange: EXCHANGES.EVENTS,
      routingKey: TOPICS.SAGA_ADVANCE,
      payload: {
        eventId: newEventId(),
        orderId: order.id,
        status: 'CREATED',
        meta: { source: 'orders.ingest' },
      },
    })
  })

  return order
}

async function buildApp({ logger, prisma, bus }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'orders' }))

  app.get('/orders', async (req) => {
    const where = {}
    if (req.query.companyId) where.companyId = req.query.companyId
    if (req.query.status) where.status = req.query.status
    return prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
  })

  app.get('/orders/:id', async (req, reply) => {
    const row = await prisma.order.findUnique({ where: { id: req.params.id } })
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  app.post('/orders/ingest', async (req) => ingestOrder(prisma, req.body))

  return app
}

async function onReady({ logger, prisma, bus }) {
  await bus.subscribe(
    'orders.ecommerce',
    [
      { exchange: EXCHANGES.EVENTS, pattern: TOPICS.ECOMMERCE_ORDER_CREATED },
      { exchange: EXCHANGES.EVENTS, pattern: TOPICS.ECOMMERCE_ORDER_CANCELLED },
    ],
    async ({ routingKey, payload }) => {
      if (!(await onceEvent(prisma, payload.eventId, routingKey))) {
        logger.info({ eventId: payload.eventId }, 'duplicate skipped')
        return
      }
      if (routingKey === TOPICS.ECOMMERCE_ORDER_CREATED) {
        await ingestOrder(prisma, payload)
        return
      }
      if (routingKey === TOPICS.ECOMMERCE_ORDER_CANCELLED) {
        const data = CanonicalOrderCancelled.parse(payload)
        const order = await prisma.order.findUnique({
          where: {
            shopDomain_externalOrderId: {
              shopDomain: data.shopDomain,
              externalOrderId: data.externalOrderId,
            },
          },
        })
        if (!order) return
        await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } })
        await prisma.$transaction(async (tx) => {
          await enqueueOutbox(tx, {
            exchange: EXCHANGES.EVENTS,
            routingKey: TOPICS.ORDER_CANCELLED,
            payload: { eventId: newEventId(), orderId: order.id },
          })
          await enqueueOutbox(tx, {
            exchange: EXCHANGES.EVENTS,
            routingKey: TOPICS.SAGA_ADVANCE,
            payload: { eventId: newEventId(), orderId: order.id, status: 'CANCELLED' },
          })
        })
      }
    },
  )
}

bootService({
  serviceName: 'orders',
  serviceRoot: path.join(__dirname, '..'),
  port: 4005,
  buildApp,
  onReady,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
