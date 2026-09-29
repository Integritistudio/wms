'use strict'

const path = require('path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const { bootService, enqueueOutbox, onceEvent, newEventId } = require('@linker/common')
const { TOPICS, EXCHANGES, WmsDispatchCommand } = require('@linker/contracts')
const { build940 } = require('./mapper')

async function deliverSftp(wmsConfig, filename, content) {
  if (process.env.MOCK_SFTP === '1' || !wmsConfig?.host) {
    return { mock: true, filename, bytes: Buffer.byteLength(content) }
  }
  const SftpClient = require('ssh2-sftp-client')
  const sftp = new SftpClient()
  await sftp.connect({
    host: wmsConfig.host,
    port: wmsConfig.port || 22,
    username: wmsConfig.username,
    password: wmsConfig.password,
  })
  const remote = `${wmsConfig.remoteDir || '/outbound'}/${filename}`
  await sftp.put(Buffer.from(content, 'utf8'), remote)
  await sftp.end()
  return { remote }
}

async function buildApp({ logger, prisma }) {
  const app = Fastify({ loggerInstance: logger })
  await app.register(cors, { origin: true })

  app.get('/health', async () => ({ ok: true, service: 'wms-sftp-edi' }))

  app.get('/edi/documents', async () =>
    prisma.ediDocument.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  )

  /** Warehouse / uploader posts a 945 (or JSON ship confirm). */
  app.post('/edi/945', async (req) => {
    const body = req.body || {}
    await prisma.ediDocument.create({
      data: {
        id: newEventId(),
        groupId: body.groupId,
        orderId: body.orderId,
        docType: '945',
        mappingKey: body.mappingKey || 'generic',
        content: typeof body.content === 'string' ? body.content : JSON.stringify(body),
        status: 'received',
      },
    })
    await prisma.$transaction(async (tx) => {
      await enqueueOutbox(tx, {
        exchange: EXCHANGES.EVENTS,
        routingKey: TOPICS.WMS_SHIPMENT_CONFIRMED,
        payload: {
          eventId: newEventId(),
          wmsProvider: 'sftp_edi',
          companyId: body.companyId,
          warehouseId: body.warehouseId,
          orderId: body.orderId,
          groupId: body.groupId,
          trackingNumber: body.trackingNumber || null,
          trackingCompany: body.trackingCompany || null,
          trackingUrl: body.trackingUrl || null,
          shippedLines: body.shippedLines || [],
        },
      })
    })
    return { ok: true }
  })

  app.post('/edi/mappings', async (req) => {
    const body = req.body || {}
    return prisma.ediMapping.upsert({
      where: { key: body.key },
      create: {
        id: newEventId(),
        key: body.key,
        name: body.name || body.key,
        config: body.config || {},
      },
      update: { name: body.name, config: body.config },
    })
  })

  return app
}

async function onReady({ logger, prisma, bus }) {
  await bus.subscribe(
    'wms-sftp-edi.commands',
    [
      {
        exchange: EXCHANGES.WMS_COMMANDS,
        pattern: `sftp_edi.${TOPICS.WMS_SHIPMENT_DISPATCH}`,
      },
    ],
    async ({ routingKey, payload }) => {
      if (!(await onceEvent(prisma, payload.eventId, routingKey))) return
      const cmd = WmsDispatchCommand.parse(payload)
      const mappingKey = cmd.wmsConfig?.mappingKey || 'generic'
      const content = build940(cmd, mappingKey)
      const filename = `940_${cmd.orderNumber || cmd.externalOrderId}_${Date.now()}.edi`
      const delivery = await deliverSftp(cmd.wmsConfig || {}, filename, content)

      // Optionally store via files service
      try {
        const filesUrl = process.env.FILES_URL || 'http://127.0.0.1:4010'
        await fetch(`${filesUrl}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: cmd.companyId,
            filename,
            content,
            contentType: 'application/edi-x12',
            meta: { groupId: cmd.groupId, docType: '940' },
          }),
        })
      } catch (err) {
        logger.warn({ err: err.message }, 'files store skipped')
      }

      await prisma.ediDocument.create({
        data: {
          id: newEventId(),
          groupId: cmd.groupId,
          orderId: cmd.orderId,
          docType: '940',
          mappingKey,
          content,
          fileKey: filename,
          status: delivery.mock ? 'mock_delivered' : 'delivered',
        },
      })
      logger.info({ groupId: cmd.groupId, filename, delivery }, '940 delivered')
    },
  )
}

bootService({
  serviceName: 'wms-sftp-edi',
  serviceRoot: path.join(__dirname, '..'),
  port: 4015,
  buildApp,
  onReady,
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
