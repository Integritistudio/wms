'use strict'

/**
 * Idempotent service scaffolder for wms-new-backend.
 * Run: node scripts/scaffold-services.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

const SERVICES = [
  { name: 'api-gateway', db: null, portEnv: 'GATEWAY_PORT', port: 4000 },
  { name: 'auth', db: 'linker_auth', portEnv: 'AUTH_PORT', port: 4001 },
  { name: 'platform', db: 'linker_platform', portEnv: 'PLATFORM_PORT', port: 4002 },
  { name: 'companies', db: 'linker_companies', portEnv: 'COMPANIES_PORT', port: 4003 },
  { name: 'shops', db: 'linker_shops', portEnv: 'SHOPS_PORT', port: 4004 },
  { name: 'orders', db: 'linker_orders', portEnv: 'ORDERS_PORT', port: 4005 },
  { name: 'fulfillment', db: 'linker_fulfillment', portEnv: 'FULFILLMENT_PORT', port: 4006 },
  { name: 'routing', db: 'linker_routing', portEnv: 'ROUTING_PORT', port: 4007 },
  { name: 'saga', db: 'linker_saga', portEnv: 'SAGA_PORT', port: 4008 },
  { name: 'inventory', db: 'linker_inventory', portEnv: 'INVENTORY_PORT', port: 4009 },
  { name: 'files', db: 'linker_files', portEnv: 'FILES_PORT', port: 4010 },
  { name: 'notifications', db: 'linker_notifications', portEnv: 'NOTIFICATIONS_PORT', port: 4011 },
  { name: 'uploaders', db: 'linker_uploaders', portEnv: 'UPLOADERS_PORT', port: 4012 },
  { name: 'ecommerce-shopify', db: 'linker_ecommerce_shopify', portEnv: 'ECOMMERCE_SHOPIFY_PORT', port: 4013 },
  { name: 'wms-modernwms', db: 'linker_wms_modernwms', portEnv: 'WMS_MODERNWMS_PORT', port: 4014 },
  { name: 'wms-sftp-edi', db: 'linker_wms_sftp_edi', portEnv: 'WMS_SFTP_EDI_PORT', port: 4015 },
]

const OUTBOX_MODEL = `
model OutboxEvent {
  id          String    @id @default(uuid()) @db.Uuid
  exchange    String
  routingKey  String    @map("routing_key")
  payload     Json
  status      String    @default("pending")
  attempts    Int       @default(0)
  lastError   String?   @map("last_error")
  createdAt   DateTime  @default(now()) @map("created_at")
  publishedAt DateTime? @map("published_at")

  @@index([status, createdAt])
  @@map("outbox_events")
}
`

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (fs.existsSync(file)) return false
  fs.writeFileSync(file, content)
  return true
}

function pkgJson(svc) {
  const deps = {
    '@linker/common': '*',
    '@linker/contracts': '*',
    dotenv: '^16.4.7',
    fastify: '^5.2.1',
    '@fastify/cors': '^10.0.2',
  }
  if (svc.db) {
    deps['@prisma/client'] = '^6.5.0'
  }
  if (svc.name === 'auth' || svc.name === 'api-gateway') {
    deps.jsonwebtoken = '^9.0.2'
    deps.bcrypt = '^5.1.1'
  }
  if (svc.name === 'ecommerce-shopify') {
    deps['node-fetch'] = '^2.7.0'
  }
  if (svc.name === 'wms-sftp-edi') {
    deps['ssh2-sftp-client'] = '^11.0.0'
  }
  if (svc.name === 'api-gateway') {
    deps['@fastify/http-proxy'] = '^11.1.0'
  }
  return JSON.stringify(
    {
      name: `@linker/${svc.name}`,
      version: '1.0.0',
      private: true,
      type: 'commonjs',
      main: 'src/index.js',
      scripts: {
        start: 'node src/index.js',
        dev: 'node --watch src/index.js',
        'prisma:generate': svc.db ? 'prisma generate' : 'echo skip',
        'prisma:migrate': svc.db ? `prisma migrate deploy` : 'echo skip',
        'prisma:dev': svc.db ? 'prisma migrate dev --name init' : 'echo skip',
      },
      dependencies: deps,
      devDependencies: svc.db ? { prisma: '^6.5.0' } : {},
    },
    null,
    2,
  )
}

function baseSchema(svc) {
  return `generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/.prisma/client-${svc.name}"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
${OUTBOX_MODEL}
`
}

for (const svc of SERVICES) {
  const dir = path.join(ROOT, 'services', svc.name)
  write(path.join(dir, 'package.json'), pkgJson(svc) + '\n')
  write(
    path.join(dir, '.env'),
    [
      `PORT=${svc.port}`,
      svc.db
        ? `DATABASE_URL=postgresql://postgres:root@localhost:5432/${svc.db}`
        : '# no database',
      `DB_NAME=${svc.db || ''}`,
      'RABBITMQ_URL=amqp://linker:linker@localhost:5672',
      'JWT_SECRET=dev-linker-jwt-change-me',
      '',
    ].join('\n'),
  )

  if (svc.db) {
    write(path.join(dir, 'prisma', 'schema.prisma'), baseSchema(svc))
  }

  // Placeholder index — real implementations overwrite these later
  write(
    path.join(dir, 'src', 'index.js'),
    `'use strict'\n\nconsole.log('${svc.name} placeholder — replace with service entry')\nprocess.exit(0)\n`,
  )
}

fs.writeFileSync(
  path.join(ROOT, 'scripts', 'services.json'),
  JSON.stringify(SERVICES, null, 2),
)
console.log(`Scaffolded ${SERVICES.length} services`)
