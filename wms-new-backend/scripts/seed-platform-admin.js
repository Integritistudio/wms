'use strict'

/**
 * Seed platform admin into linker_auth.
 * Usage: node scripts/seed-platform-admin.js
 */
const path = require('path')
const bcrypt = require('bcrypt')
const { loadEnv, newEventId } = require('@linker/common')

async function main() {
  const serviceRoot = path.join(__dirname, '..', 'services', 'auth')
  loadEnv(serviceRoot)
  const { PrismaClient } = require(path.join(serviceRoot, 'src', 'generated', 'prisma'))
  const prisma = new PrismaClient()
  const username = process.env.PLATFORM_ADMIN_USER || 'admin'
  const password = process.env.PLATFORM_ADMIN_PASS || 'admin'
  const existing = await prisma.user.findFirst({ where: { username, audience: 'platform_admin' } })
  if (existing) {
    console.log('platform admin already exists', existing.id)
  } else {
    const user = await prisma.user.create({
      data: {
        id: newEventId(),
        username,
        passwordHash: await bcrypt.hash(password, 10),
        audience: 'platform_admin',
        role: 'admin',
      },
    })
    console.log('created platform admin', user.id, username)
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
