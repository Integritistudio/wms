'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const bcrypt = require('bcrypt')
const { bootService, newEventId } = require('@linker/common')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'uploaders' }))

  app.get('/uploaders', async (req) => {
    const where = {}
    if (req.query.companyId) where.companyId = req.query.companyId
    return prisma.uploader.findMany({ where })
  })

  app.post('/uploaders', async (req) => {
    const body = req.body || {}
    return prisma.uploader.create({
      data: {
        id: newEventId(),
        username: body.username,
        passwordHash: await bcrypt.hash(body.password || 'change-me', 10),
        companyId: body.companyId,
        warehouseIds: body.warehouseIds || [],
      },
    })
  })

  return app
}

bootService({
  serviceName: 'uploaders',
  serviceRoot: path.join(__dirname, '..'),
  port: 4012,
  buildApp,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
