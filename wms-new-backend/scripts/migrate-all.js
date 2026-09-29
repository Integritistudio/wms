'use strict'

const { spawnSync } = require('child_process')
const path = require('path')
const services = require('./services.json')

for (const svc of services) {
  if (!svc.db) continue
  const cwd = path.join(__dirname, '..', 'services', svc.name)
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://postgres:root@localhost:5432/${svc.db}`,
  }
  console.log('db push + generate', svc.name)
  let r = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    cwd,
    env,
    shell: true,
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status || 1)
  r = spawnSync('npx', ['prisma', 'generate'], {
    cwd,
    env,
    shell: true,
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status || 1)
}
console.log('all databases synced')
