'use strict'

/**
 * Lightweight cross-process event hub (no RabbitMQ required for local/dev).
 * Services register subscriber callbacks; publishes fan out over HTTP.
 */
const Fastify = require('fastify')
const { createLogger } = require('@linker/common')

const logger = createLogger('event-hub')
const port = Number(process.env.EVENT_HUB_PORT || 4099)

/** @type {Array<{ id: string, url: string, bindings: Array<{ exchange: string, pattern: string }> }>} */
const subscribers = []

function matchTopic(pattern, key) {
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

async function main() {
  const app = Fastify({ loggerInstance: logger })

  app.get('/health', async () => ({ ok: true, service: 'event-hub', subscribers: subscribers.length }))

  app.post('/register', async (req) => {
    const { id, url, bindings } = req.body || {}
    const existing = subscribers.findIndex((s) => s.id === id)
    const row = { id, url, bindings: bindings || [] }
    if (existing >= 0) subscribers[existing] = row
    else subscribers.push(row)
    return { ok: true, count: subscribers.length }
  })

  app.post('/publish', async (req) => {
    const { exchange, routingKey, payload, headers } = req.body || {}
    const tasks = []
    for (const sub of subscribers) {
      const hit = (sub.bindings || []).some(
        (b) => b.exchange === exchange && matchTopic(b.pattern, routingKey),
      )
      if (!hit) continue
      tasks.push(
        fetch(`${sub.url}/_bus/deliver`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exchange, routingKey, payload, headers }),
        }).catch((err) => {
          logger.warn({ err: err.message, sub: sub.id }, 'deliver failed')
        }),
      )
    }
    await Promise.all(tasks)
    return { ok: true, delivered: tasks.length }
  })

  await app.listen({ port, host: '0.0.0.0' })
  logger.info({ port }, 'event-hub listening')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
