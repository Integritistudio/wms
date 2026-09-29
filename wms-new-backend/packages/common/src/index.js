'use strict'

const dotenv = require('dotenv')
const path = require('path')
const pino = require('pino')
const amqp = require('amqplib')
const { v4: uuidv4 } = require('uuid')

function loadEnv(serviceRoot) {
  dotenv.config({ path: path.resolve(serviceRoot, '../../.env') })
  dotenv.config({ path: path.resolve(serviceRoot, '.env') })
}

function createLogger(name) {
  const pretty = process.env.NODE_ENV !== 'production'
  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    transport: pretty
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  })
}

function databaseUrl(dbName) {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const user = process.env.DB_USERNAME || 'postgres'
  const pass = process.env.DB_PASSWORD || 'root'
  const host = process.env.DB_HOST || 'localhost'
  const port = process.env.DB_PORT || '5432'
  return `postgresql://${user}:${encodeURIComponent(pass)}@${host}:${port}/${dbName}`
}

class EventBus {
  constructor({ url, logger, serviceName }) {
    this.url = url || process.env.RABBITMQ_URL || 'amqp://linker:linker@localhost:5672'
    this.hubUrl = process.env.EVENT_HUB_URL || 'http://127.0.0.1:4099'
    this.logger = logger
    this.serviceName = serviceName
    this.conn = null
    this.ch = null
    this.mode = 'amqp'
    this._handlers = []
    this._deliverServer = null
    this._deliverPort = null
  }

  async connect(retries = 3, delayMs = 800) {
    // Prefer HTTP event-hub when set or RabbitMQ unreachable
    if (process.env.EVENT_BUS === 'http' || String(this.url).startsWith('http')) {
      this.mode = 'http'
      this.logger.info({ hub: this.hubUrl }, 'event bus using HTTP hub')
      return this
    }

    let lastErr
    for (let i = 0; i < retries; i++) {
      try {
        this.conn = await amqp.connect(this.url)
        this.ch = await this.conn.createChannel()
        await this.ch.assertExchange('linker.events', 'topic', { durable: true })
        await this.ch.assertExchange('linker.ecommerce.commands', 'topic', { durable: true })
        await this.ch.assertExchange('linker.wms.commands', 'topic', { durable: true })
        this.mode = 'amqp'
        this.logger.info({ url: this.url }, 'event bus connected (amqp)')
        return this
      } catch (err) {
        lastErr = err
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }

    this.mode = 'http'
    this.logger.warn({ err: lastErr?.message, hub: this.hubUrl }, 'RabbitMQ down — using HTTP event-hub')
    return this
  }

  async _ensureDeliverEndpoint(fastify) {
    if (this.mode !== 'http' || this._deliverAttached) return
    this._deliverAttached = true
    fastify.post('/_bus/deliver', async (req) => {
      const { exchange, routingKey, payload, headers } = req.body || {}
      for (const h of this._handlers) {
        const hit = h.bindings.some(
          (b) => b.exchange === exchange && topicMatch(b.pattern, routingKey),
        )
        if (!hit) continue
        await h.handler({ routingKey, exchange, payload, headers: headers || {} })
      }
      return { ok: true }
    })
  }

  async publish(exchange, routingKey, payload, headers = {}) {
    if (this.mode === 'http') {
      await fetch(`${this.hubUrl}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange,
          routingKey,
          payload,
          headers: { 'x-service': this.serviceName, ...headers },
        }),
      })
      this.logger.debug({ exchange, routingKey, eventId: payload.eventId }, 'published (http)')
      return
    }
    const body = Buffer.from(JSON.stringify(payload))
    this.ch.publish(exchange, routingKey, body, {
      contentType: 'application/json',
      persistent: true,
      messageId: payload.eventId || uuidv4(),
      headers: { 'x-service': this.serviceName, ...headers },
    })
  }

  async publishEvent(routingKey, payload) {
    return this.publish('linker.events', routingKey, payload)
  }

  async publishEcommerceCommand(provider, routingKey, payload) {
    return this.publish('linker.ecommerce.commands', `${provider}.${routingKey}`, payload)
  }

  async publishWmsCommand(provider, routingKey, payload) {
    return this.publish('linker.wms.commands', `${provider}.${routingKey}`, payload)
  }

  async subscribe(queueName, bindings, handler, { publicBaseUrl } = {}) {
    if (this.mode === 'http') {
      this._handlers.push({ queueName, bindings, handler })
      const url = publicBaseUrl || process.env.PUBLIC_BASE_URL
      if (!url) {
        this.logger.warn('PUBLIC_BASE_URL missing — http bus subscribe incomplete until registerBus is called')
        this._pendingRegister = { queueName, bindings }
        return
      }
      await fetch(`${this.hubUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `${this.serviceName}:${queueName}`,
          url,
          bindings,
        }),
      })
      this.logger.info({ queueName, bindings, mode: 'http' }, 'subscribed')
      return
    }

    await this.ch.assertQueue(queueName, { durable: true })
    for (const b of bindings) {
      await this.ch.bindQueue(queueName, b.exchange, b.pattern)
    }
    await this.ch.consume(queueName, async (msg) => {
      if (!msg) return
      try {
        const payload = JSON.parse(msg.content.toString())
        await handler({
          routingKey: msg.fields.routingKey,
          exchange: msg.fields.exchange,
          payload,
          headers: msg.properties.headers || {},
        })
        this.ch.ack(msg)
      } catch (err) {
        this.logger.error({ err, queue: queueName }, 'consumer failed')
        this.ch.nack(msg, false, false)
      }
    })
    this.logger.info({ queueName, bindings }, 'subscribed')
  }

  async registerHttp(publicBaseUrl) {
    if (this.mode !== 'http') return
    for (const h of this._handlers) {
      await fetch(`${this.hubUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `${this.serviceName}:${h.queueName}`,
          url: publicBaseUrl,
          bindings: h.bindings,
        }),
      })
    }
  }

  async close() {
    if (this.mode === 'http') return
    try {
      await this.ch?.close()
      await this.conn?.close()
    } catch {
      /* ignore */
    }
  }
}

function topicMatch(pattern, key) {
  const pp = pattern.split('.')
  const kk = key.split('.')
  let i = 0
  let j = 0
  while (i < pp.length && j < kk.length) {
    if (pp[i] === '#') return true
    if (pp[i] === '*' || pp[i] === kk[j]) {
      i++
      j++
      continue
    }
    return false
  }
  if (i < pp.length && pp[i] === '#') return true
  return i === pp.length && j === kk.length
}

async function enqueueOutbox(tx, { exchange, routingKey, payload }) {
  const eventId = payload.eventId || uuidv4()
  await tx.outboxEvent.create({
    data: {
      id: eventId,
      exchange,
      routingKey,
      payload,
      status: 'pending',
    },
  })
  return eventId
}

async function flushOutbox(prisma, bus, logger, limit = 50) {
  const rows = await prisma.outboxEvent.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  for (const row of rows) {
    try {
      await bus.publish(row.exchange, row.routingKey, row.payload)
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: 'published', publishedAt: new Date() },
      })
    } catch (err) {
      logger.error({ err, id: row.id }, 'outbox publish failed')
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 }, lastError: String(err.message || err) },
      })
    }
  }
  return rows.length
}

function startOutboxRelay(prisma, bus, logger, intervalMs = 800) {
  const t = setInterval(() => {
    flushOutbox(prisma, bus, logger).catch((err) => logger.error({ err }, 'outbox relay'))
  }, intervalMs)
  if (t.unref) t.unref()
  return () => clearInterval(t)
}

function newEventId() {
  return uuidv4()
}

async function onceEvent(prisma, eventId, topic) {
  if (!prisma.processedEvent) return true
  try {
    await prisma.processedEvent.create({ data: { eventId, topic } })
    return true
  } catch (err) {
    if (err && err.code === 'P2002') return false
    throw err
  }
}

async function bootService({ serviceName, serviceRoot, port, buildApp, onReady }) {
  loadEnv(serviceRoot)
  process.env.EVENT_BUS = process.env.EVENT_BUS || 'http'
  const logger = createLogger(serviceName)
  const listenPort = Number(process.env.PORT || port)
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${listenPort}`

  let prisma = null
  try {
    const { PrismaClient } = require(path.join(serviceRoot, 'src', 'generated', 'prisma'))
    prisma = new PrismaClient()
    await prisma.$connect()
  } catch (err) {
    if (serviceName !== 'api-gateway') {
      logger.warn({ err: err.message }, 'prisma not ready yet — generate/migrate first')
    }
  }

  const bus = new EventBus({ logger, serviceName })
  await bus.connect()

  let stopOutbox = () => {}
  if (prisma?.outboxEvent) {
    stopOutbox = startOutboxRelay(prisma, bus, logger)
  }

  const Fastify = require('fastify')
  // buildApp creates its own fastify — attach deliver after
  const fastify = await buildApp({ logger, prisma, bus })
  await bus._ensureDeliverEndpoint(fastify)

  if (onReady) {
    await onReady({ logger, prisma, bus, fastify })
  }

  await bus.registerHttp(publicBaseUrl)

  await fastify.listen({ port: listenPort, host: '0.0.0.0' })
  logger.info({ port: listenPort, publicBaseUrl }, `${serviceName} listening`)

  const shutdown = async () => {
    stopOutbox()
    await fastify.close()
    await bus.close()
    await prisma?.$disconnect()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  return { fastify, prisma, bus, logger }
}

module.exports = {
  loadEnv,
  createLogger,
  databaseUrl,
  EventBus,
  enqueueOutbox,
  flushOutbox,
  startOutboxRelay,
  newEventId,
  onceEvent,
  uuidv4,
  bootService,
}
