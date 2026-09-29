'use strict'

const path = require('path')
const crypto = require('crypto')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, enqueueOutbox, onceEvent, newEventId } = require('@linker/common')
const { TOPICS, EXCHANGES } = require('@linker/contracts')
const { mapShopifyOrder } = require('./mapper')
const { shopifyGraphQL } = require('./client')

function verifyHmac(rawBody, hmacHeader, secret) {
  if (!secret || !hmacHeader) return !secret
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))
  } catch {
    return false
  }
}

async function buildApp({ logger, prisma, bus }) {
  const app = Fastify({
    loggerInstance: logger,
    forceCloseConnections: true,
  })
  await app.register(cors, { origin: true })

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body
    try {
      done(null, body.length ? JSON.parse(body.toString('utf8')) : {})
    } catch (err) {
      done(err)
    }
  })

  app.get('/health', async () => ({ ok: true, service: 'ecommerce-shopify' }))

  app.post('/shopify/webhooks', async (req, reply) => {
    const hmac = req.headers['x-shopify-hmac-sha256']
    const topic = req.headers['x-shopify-topic']
    const shopDomain = String(req.headers['x-shopify-shop-domain'] || '').toLowerCase()
    const webhookId = req.headers['x-shopify-webhook-id']
    const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_WEBHOOK_SECRET

    if (req.rawBody && secret && !verifyHmac(req.rawBody, hmac, secret)) {
      return reply.code(401).send({ error: 'Invalid HMAC' })
    }

    const event = await prisma.webhookEvent.create({
      data: {
        id: newEventId(),
        shopDomain,
        topic: String(topic || 'unknown'),
        webhookId: webhookId ? String(webhookId) : null,
        payload: req.body || {},
        status: 'received',
      },
    })

    if (String(topic).startsWith('orders/create') || topic === 'orders/create') {
      const canonical = mapShopifyOrder(shopDomain, req.body || {})
      await prisma.$transaction(async (tx) => {
        await enqueueOutbox(tx, {
          exchange: EXCHANGES.EVENTS,
          routingKey: TOPICS.ECOMMERCE_ORDER_CREATED,
          payload: canonical,
        })
        await tx.webhookEvent.update({ where: { id: event.id }, data: { status: 'queued' } })
      })
    } else if (String(topic).startsWith('orders/cancelled') || topic === 'orders/cancelled') {
      await prisma.$transaction(async (tx) => {
        await enqueueOutbox(tx, {
          exchange: EXCHANGES.EVENTS,
          routingKey: TOPICS.ECOMMERCE_ORDER_CANCELLED,
          payload: {
            eventId: newEventId(),
            provider: 'shopify',
            shopDomain,
            externalOrderId: String((req.body || {}).id || ''),
          },
        })
        await tx.webhookEvent.update({ where: { id: event.id }, data: { status: 'queued' } })
      })
    }

    return reply.code(200).send({ ok: true })
  })

  app.post('/shopify/install', async (req) => {
    const { shopDomain, accessToken, scopes } = req.body || {}
    return prisma.shopInstall.upsert({
      where: { shopDomain: String(shopDomain).toLowerCase() },
      create: {
        id: newEventId(),
        shopDomain: String(shopDomain).toLowerCase(),
        accessToken,
        scopes: scopes || null,
      },
      update: { accessToken, scopes: scopes || null },
    })
  })

  return app
}

async function onReady({ logger, prisma, bus }) {
  await bus.subscribe(
    'ecommerce-shopify.commands',
    [
      {
        exchange: EXCHANGES.ECOMMERCE_COMMANDS,
        pattern: `shopify.${TOPICS.ECOMMERCE_FULFILLMENT_CREATE}`,
      },
      {
        exchange: EXCHANGES.ECOMMERCE_COMMANDS,
        pattern: `shopify.${TOPICS.ECOMMERCE_INVENTORY_SET}`,
      },
    ],
    async ({ routingKey, payload }) => {
      if (!(await onceEvent(prisma, payload.eventId, routingKey))) return

      const install = await prisma.shopInstall.findUnique({
        where: { shopDomain: payload.shopDomain },
      })
      if (!install) {
        logger.warn({ shop: payload.shopDomain }, 'no shopify install — mock fulfill')
        return
      }

      if (routingKey.endsWith(TOPICS.ECOMMERCE_FULFILLMENT_CREATE)) {
        const mutation = `
          mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
            fulfillmentCreate(fulfillment: $fulfillment) {
              fulfillment { id status }
              userErrors { field message }
            }
          }`
        // Minimal stub — production mapper should resolve fulfillmentOrderLineItem ids
        logger.info(
          {
            shop: payload.shopDomain,
            order: payload.externalOrderId,
            tracking: payload.trackingNumber,
          },
          'shopify fulfillment command received',
        )
        if (process.env.SHOPIFY_MOCK === '1') return
        try {
          await shopifyGraphQL(payload.shopDomain, install.accessToken, mutation, {
            fulfillment: {
              trackingInfo: {
                number: payload.trackingNumber,
                company: payload.trackingCompany,
                url: payload.trackingUrl,
              },
              notifyCustomer: payload.notifyCustomer !== false,
            },
          })
        } catch (err) {
          logger.error({ err }, 'shopify fulfill failed')
          throw err
        }
      }

      if (routingKey.endsWith(TOPICS.ECOMMERCE_INVENTORY_SET)) {
        logger.info({ sku: payload.sku, qty: payload.quantity }, 'shopify inventory set command')
      }
    },
  )
}

bootService({
  serviceName: 'ecommerce-shopify',
  serviceRoot: path.join(__dirname, '..'),
  port: 4013,
  buildApp,
  onReady,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
