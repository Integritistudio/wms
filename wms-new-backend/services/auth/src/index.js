'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { bootService, newEventId } = require('@linker/common')

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'auth' }))

  app.post('/auth/platform/login', async (req, reply) => {
    const { username, password } = req.body || {}
    const user = await prisma.user.findFirst({
      where: { username, audience: 'platform_admin', isActive: true },
    })
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
    const token = jwt.sign(
      { sub: user.id, aud: 'platform_admin', role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' },
    )
    return { token, user: { id: user.id, username: user.username, role: user.role } }
  })

  app.post('/auth/company/login', async (req, reply) => {
    const { email, password, expectedRole } = req.body || {}
    const user = await prisma.user.findFirst({
      where: { email, audience: 'company', isActive: true },
    })
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
    if (expectedRole && user.role !== expectedRole && !(expectedRole === 'root' && user.role === 'root')) {
      // allow root/member/warehouse roles as stored
    }
    const token = jwt.sign(
      { sub: user.id, aud: 'company', role: user.role, companyId: user.companyId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' },
    )
    return {
      token,
      user: { id: user.id, email: user.email, role: user.role, companyId: user.companyId },
    }
  })

  app.post('/auth/uploader/login', async (req, reply) => {
    const { username, password } = req.body || {}
    const user = await prisma.user.findFirst({
      where: { username, audience: 'uploader', isActive: true },
    })
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
    const token = jwt.sign(
      { sub: user.id, aud: 'uploader', role: 'uploader', companyId: user.companyId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' },
    )
    return { token, user: { id: user.id, username: user.username, companyId: user.companyId } }
  })

  app.post('/auth/users', async (req, reply) => {
    const { email, username, password, audience, role, companyId } = req.body || {}
    if (!password || !audience || !role) {
      return reply.code(400).send({ error: 'password, audience, role required' })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        id: newEventId(),
        email: email || null,
        username: username || null,
        passwordHash,
        audience,
        role,
        companyId: companyId || null,
      },
    })
    return { id: user.id, email: user.email, username: user.username, audience, role }
  })

  app.get('/auth/me', async (req, reply) => {
    const hdr = req.headers.authorization || ''
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
    if (!token) return reply.code(401).send({ error: 'Unauthorized' })
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET)
      const user = await prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user) return reply.code(401).send({ error: 'Unauthorized' })
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        audience: user.audience,
        role: user.role,
        companyId: user.companyId,
      }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  return app
}

bootService({
  serviceName: 'auth',
  serviceRoot: path.join(__dirname, '..'),
  port: 4001,
  buildApp,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
