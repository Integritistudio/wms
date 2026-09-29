'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, enqueueOutbox, onceEvent, newEventId } = require('@linker/common')
const { TOPICS, EXCHANGES, WmsDispatchCommand, WmsShipmentConfirmed } = require('@linker/contracts')

async function fetchWarehouse(warehouseId) {
  if (!warehouseId) return null
  const base = process.env.COMPANIES_URL || 'http://127.0.0.1:4003'
  const res = await fetch(`${base}/warehouses/${warehouseId}`)
  if (!res.ok) return null
  return res.json()
}

async function allocate(prisma, orderEvent) {
  let warehouseId = orderEvent.warehouseId
  let warehouse = await fetchWarehouse(warehouseId)

  if (!warehouse && orderEvent.companyId) {
    const base = process.env.COMPANIES_URL || 'http://127.0.0.1:4003'
    const res = await fetch(`${base}/companies/${orderEvent.companyId}`)
    if (res.ok) {
      const company = await res.json()
      warehouse = (company.warehouses || []).find((w) => w.isActive) || company.warehouses?.[0]
      warehouseId = warehouse?.id || null
    }
  }

  if (!warehouse) {
    throw new Error(`No warehouse for order ${orderEvent.orderId}`)
  }

  const lines = (orderEvent.lineItems || []).map((li) => ({
    sku: li.sku || 'UNKNOWN',
    title: li.title,
    quantity: li.quantity,
    lineId: li.id,
  }))

  const group = await prisma.fulfillmentGroup.create({
    data: {
      id: newEventId(),
      orderId: orderEvent.orderId,
      companyId: orderEvent.companyId || warehouse.companyId,
      warehouseId: warehouse.id,
      wmsProvider: warehouse.wmsProvider,
      status: 'allocated',
      lines,
      shipTo: orderEvent.shippingAddress || null,
      externalOrderId: orderEvent.externalOrderId,
      orderNumber: orderEvent.orderNumber || null,
      shopDomain: orderEvent.shopDomain,
      ecommerceProvider: orderEvent.ecommerceProvider || 'shopify',
    },
  })

  const dispatch = WmsDispatchCommand.parse({
    eventId: newEventId(),
    wmsProvider: warehouse.wmsProvider,
    companyId: group.companyId,
    warehouseId: group.warehouseId,
    orderId: group.orderId,
    groupId: group.id,
    externalOrderId: group.externalOrderId,
    orderNumber: group.orderNumber,
    shipTo: group.shipTo,
    lines,
    wmsConfig: warehouse.wmsConfig || {},
  })

  await prisma.$transaction(async (tx) => {
    await enqueueOutbox(tx, {
      exchange: EXCHANGES.WMS_COMMANDS,
      routingKey: `${warehouse.wmsProvider}.${TOPICS.WMS_SHIPMENT_DISPATCH}`,
      payload: dispatch,
    })
    await enqueueOutbox(tx, {
      exchange: EXCHANGES.EVENTS,
      routingKey: TOPICS.FULFILLMENT_ALLOCATED,
      payload: { eventId: newEventId(), orderId: group.orderId, groupId: group.id },
    })
    await enqueueOutbox(tx, {
      exchange: EXCHANGES.EVENTS,
      routingKey: TOPICS.SAGA_ADVANCE,
      payload: {
        eventId: newEventId(),
        orderId: group.orderId,
        status: 'SENT_TO_3PL',
        meta: { groupId: group.id, wmsProvider: warehouse.wmsProvider },
      },
    })
  })

  return group
}

async function shipFromConfirm(prisma, payload) {
  const data = WmsShipmentConfirmed.parse(payload)
  const group = await prisma.fulfillmentGroup.update({
    where: { id: data.groupId },
    data: {
      status: 'shipped',
      trackingNumber: data.trackingNumber || null,
      trackingCompany: data.trackingCompany || null,
      trackingUrl: data.trackingUrl || null,
    },
  })

  await prisma.$transaction(async (tx) => {
    await enqueueOutbox(tx, {
      exchange: EXCHANGES.ECOMMERCE_COMMANDS,
      routingKey: `${group.ecommerceProvider}.${TOPICS.ECOMMERCE_FULFILLMENT_CREATE}`,
      payload: {
        eventId: newEventId(),
        provider: group.ecommerceProvider,
        shopDomain: group.shopDomain,
        externalOrderId: group.externalOrderId,
        trackingNumber: group.trackingNumber,
        trackingCompany: group.trackingCompany,
        trackingUrl: group.trackingUrl,
        lineItems: (group.lines || []).map((l) => ({
          sku: l.sku,
          quantity: l.quantity,
          externalLineId: l.lineId,
        })),
        notifyCustomer: true,
      },
    })
    await enqueueOutbox(tx, {
      exchange: EXCHANGES.EVENTS,
      routingKey: TOPICS.FULFILLMENT_SHIPPED,
      payload: { eventId: newEventId(), orderId: group.orderId, groupId: group.id },
    })
    await enqueueOutbox(tx, {
      exchange: EXCHANGES.EVENTS,
      routingKey: TOPICS.SAGA_ADVANCE,
      payload: { eventId: newEventId(), orderId: group.orderId, status: 'FULFILLED' },
    })
  })

  return group
}

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'fulfillment' }))

  app.get('/fulfillment/groups', async (req) => {
    const where = {}
    if (req.query.orderId) where.orderId = req.query.orderId
    if (req.query.status) where.status = req.query.status
    return prisma.fulfillmentGroup.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
  })

  app.post('/fulfillment/allocate', async (req) => allocate(prisma, req.body))

  return app
}

async function onReady({ logger, prisma, bus }) {
  await bus.subscribe(
    'fulfillment.core',
    [
      { exchange: EXCHANGES.EVENTS, pattern: TOPICS.ORDER_INGESTED },
      { exchange: EXCHANGES.EVENTS, pattern: TOPICS.WMS_SHIPMENT_CONFIRMED },
    ],
    async ({ routingKey, payload }) => {
      if (!(await onceEvent(prisma, payload.eventId, routingKey))) return
      if (routingKey === TOPICS.ORDER_INGESTED) {
        await allocate(prisma, payload)
        return
      }
      if (routingKey === TOPICS.WMS_SHIPMENT_CONFIRMED) {
        await shipFromConfirm(prisma, payload)
      }
    },
  )
}

bootService({
  serviceName: 'fulfillment',
  serviceRoot: path.join(__dirname, '..'),
  port: 4006,
  buildApp,
  onReady,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
