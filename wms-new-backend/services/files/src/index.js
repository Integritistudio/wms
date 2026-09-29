'use strict'

const path = require('path')
const fs = require('fs')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, newEventId } = require('@linker/common')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })
  const root = process.env.FILES_DIR || path.join(__dirname, '..', 'storage')
  fs.mkdirSync(root, { recursive: true })

  app.get('/health', async () => ({ ok: true, service: 'files' }))

  app.post('/files', async (req) => {
    const body = req.body || {}
    const id = newEventId()
    const key = body.key || `${id}-${body.filename || 'file.txt'}`
    const full = path.join(root, key)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    const content = body.content || ''
    fs.writeFileSync(full, content, typeof content === 'string' ? 'utf8' : undefined)
    return prisma.storedFile.create({
      data: {
        id,
        companyId: body.companyId || null,
        key,
        filename: body.filename || key,
        contentType: body.contentType || 'text/plain',
        size: Buffer.byteLength(content),
        storage: 'local',
        meta: body.meta || {},
      },
    })
  })

  app.get('/files/:id', async (req, reply) => {
    const row = await prisma.storedFile.findUnique({ where: { id: req.params.id } })
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return row
  })

  app.get('/files/:id/content', async (req, reply) => {
    const row = await prisma.storedFile.findUnique({ where: { id: req.params.id } })
    if (!row) return reply.code(404).send({ error: 'Not found' })
    const full = path.join(root, row.key)
    if (!fs.existsSync(full)) return reply.code(404).send({ error: 'Missing blob' })
    reply.type(row.contentType || 'application/octet-stream')
    return fs.readFileSync(full)
  })

  return app
}

bootService({
  serviceName: 'files',
  serviceRoot: path.join(__dirname, '..'),
  port: 4010,
  buildApp,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
