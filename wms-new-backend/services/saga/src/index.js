'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, onceEvent, newEventId } = require('@linker/common')
const { TOPICS, EXCHANGES, SagaAdvance } = require('@linker/contracts')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'saga' }))

  app.get('/saga/:orderId', async (req, reply) => {
    const row = await prisma.saga.findUnique({ where: { orderId: req.params.orderId } })
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  return app
}

async function onReady({ logger, prisma, bus }) {
  await bus.subscribe(
    'saga.advance',
    [{ exchange: EXCHANGES.EVENTS, pattern: TOPICS.SAGA_ADVANCE }],
    async ({ routingKey, payload }) => {
      if (!(await onceEvent(prisma, payload.eventId, routingKey))) return
      const data = SagaAdvance.parse(payload)
      const existing = await prisma.saga.findUnique({ where: { orderId: data.orderId } })
      const entry = { status: data.status, at: new Date().toISOString(), meta: data.meta || {} }
      if (!existing) {
        await prisma.saga.create({
          data: {
            id: newEventId(),
            orderId: data.orderId,
            status: data.status,
            history: [entry],
            meta: data.meta || {},
          },
        })
      } else {
        const history = Array.isArray(existing.history) ? existing.history : []
        history.push(entry)
        await prisma.saga.update({
          where: { orderId: data.orderId },
          data: { status: data.status, history, meta: { ...(existing.meta || {}), ...(data.meta || {}) } },
        })
      }
    },
  )
}

bootService({
  serviceName: 'saga',
  serviceRoot: path.join(__dirname, '..'),
  port: 4008,
  buildApp,
  onReady,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
