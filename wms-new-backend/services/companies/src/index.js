'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, newEventId } = require('@linker/common')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'companies' }))

  app.get('/companies', async () => prisma.company.findMany({ include: { warehouses: true } }))

  app.post('/companies', async (req) => {
    const body = req.body || {}
    return prisma.company.create({
      data: {
        id: newEventId(),
        name: body.name,
        contactName: body.contactName || body.name,
        email: body.email,
        phone: body.phone || null,
        notes: body.notes || null,
        status: body.status || 'pending',
      },
    })
  })

  app.get('/companies/:id', async (req, reply) => {
    const row = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: { warehouses: true },
    })
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  app.patch('/companies/:id', async (req, reply) => {
    try {
      return await prisma.company.update({ where: { id: req.params.id }, data: req.body || {} })
    } catch {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  app.post('/companies/:id/warehouses', async (req) => {
    const body = req.body || {}
    return prisma.warehouse.create({
      data: {
        id: newEventId(),
        companyId: req.params.id,
        name: body.name,
        code: body.code || null,
        wmsProvider: body.wmsProvider || 'sftp_edi',
        wmsConfig: body.wmsConfig || {},
        address: body.address || null,
      },
    })
  })

  app.patch('/warehouses/:id', async (req, reply) => {
    try {
      return await prisma.warehouse.update({ where: { id: req.params.id }, data: req.body || {} })
    } catch {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  app.get('/warehouses/:id', async (req, reply) => {
    const row = await prisma.warehouse.findUnique({ where: { id: req.params.id } })
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  return app
}

bootService({
  serviceName: 'companies',
  serviceRoot: path.join(__dirname, '..'),
  port: 4003,
  buildApp,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
