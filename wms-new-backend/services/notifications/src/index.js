'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, onceEvent, newEventId } = require('@linker/common')
const { TOPICS, EXCHANGES } = require('@linker/contracts')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'notifications' }))

  app.get('/notifications', async (req) => {
    const where = {}
    if (req.query.companyId) where.companyId = req.query.companyId
    return prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  })

  app.post('/notifications/:id/read', async (req) =>
    prisma.notification.update({
      where: { id: req.params.id },
      data: { readAt: new Date() },
    }),
  )

  return app
}

async function onReady({ logger, prisma, bus }) {
  await bus.subscribe(
    'notifications.create',
    [{ exchange: EXCHANGES.EVENTS, pattern: TOPICS.NOTIFICATION_CREATE }],
    async ({ routingKey, payload }) => {
      if (!(await onceEvent(prisma, payload.eventId, routingKey))) return
      await prisma.notification.create({
        data: {
          id: newEventId(),
          companyId: payload.companyId || null,
          type: payload.type || 'info',
          title: payload.title || 'Notification',
          body: payload.body || null,
          meta: payload.meta || {},
        },
      })
    },
  )
}

bootService({
  serviceName: 'notifications',
  serviceRoot: path.join(__dirname, '..'),
  port: 4011,
  buildApp,
  onReady,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
