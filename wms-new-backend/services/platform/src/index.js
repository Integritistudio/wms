'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService } = require('@linker/common')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'platform' }))

  app.get('/platform/settings/:key', async (req, reply) => {
    const row = await prisma.setting.findUnique({ where: { key: req.params.key } })
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  app.put('/platform/settings/:key', async (req) => {
    const value = req.body?.value ?? req.body
    return prisma.setting.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value },
      update: { value },
    })
  })

  app.get('/platform/webhooks-enabled', async () => {
    const row = await prisma.setting.findUnique({ where: { key: 'webhooksEnabled' } })
    return { enabled: row ? Boolean(row.value?.enabled ?? row.value) : true }
  })

  return app
}

bootService({
  serviceName: 'platform',
  serviceRoot: path.join(__dirname, '..'),
  port: 4002,
  buildApp,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
