'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, enqueueOutbox, onceEvent, newEventId } = require('@linker/common')
const { TOPICS, EXCHANGES, WmsDispatchCommand } = require('@linker/contracts')
const { login, createDispatch } = require('./client')
const { buildDispatchLines } = require('./mapper')

async function pushDispatch(wmsConfig, payload) {
  const auth = await login(wmsConfig)
  const body = buildDispatchLines(payload)
  return createDispatch(wmsConfig, auth.token, body)
}

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'wms-modernwms' }))

  app.get('/modernwms/links', async () =>
    prisma.dispatchLink.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  )

  /** Simulate warehouse ship confirm (poller / webhook substitute for local). */
  app.post('/modernwms/links/:groupId/confirm', async (req) => {
    const link = await prisma.dispatchLink.findUnique({ where: { groupId: req.params.groupId } })
    if (!link) return { error: 'not found' }
    const body = req.body || {}
    await prisma.dispatchLink.update({
      where: { groupId: link.groupId },
      data: { status: 'delivered' },
    })
    await prisma.$transaction(async (tx) => {
      await enqueueOutbox(tx, {
        exchange: EXCHANGES.EVENTS,
        routingKey: TOPICS.WMS_SHIPMENT_CONFIRMED,
        payload: {
          eventId: newEventId(),
          wmsProvider: 'modernwms',
          companyId: body.companyId || '00000000-0000-0000-0000-000000000001',
          warehouseId: link.warehouseId,
          orderId: link.orderId,
          groupId: link.groupId,
          trackingNumber: body.trackingNumber || `MWMS-${Date.now()}`,
          trackingCompany: body.trackingCompany || 'ModernWMS',
        },
      })
    })
    return { ok: true }
  })

  return app
}

async function onReady({ logger, prisma, bus }) {
  await bus.subscribe(
    'wms-modernwms.commands',
    [
      {
        exchange: EXCHANGES.WMS_COMMANDS,
        pattern: `modernwms.${TOPICS.WMS_SHIPMENT_DISPATCH}`,
      },
    ],
    async ({ routingKey, payload }) => {
      if (!(await onceEvent(prisma, payload.eventId, routingKey))) return
      const cmd = WmsDispatchCommand.parse(payload)
      const result = await pushDispatch(cmd.wmsConfig || {}, cmd)
      await prisma.dispatchLink.upsert({
        where: { groupId: cmd.groupId },
        create: {
          id: newEventId(),
          groupId: cmd.groupId,
          orderId: cmd.orderId,
          warehouseId: cmd.warehouseId,
          dispatchNo: result.dispatchNo || null,
          status: 'open',
          lastPayload: result,
        },
        update: {
          dispatchNo: result.dispatchNo || null,
          lastPayload: result,
          status: 'open',
        },
      })
      logger.info({ groupId: cmd.groupId, dispatchNo: result.dispatchNo }, 'modernwms dispatch created')
    },
  )
}

bootService({
  serviceName: 'wms-modernwms',
  serviceRoot: path.join(__dirname, '..'),
  port: 4014,
  buildApp,
  onReady,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
