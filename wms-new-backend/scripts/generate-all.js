'use strict'

const { spawnSync } = require('child_process')
const path = require('path')
const services = require('./services.json')

for (const svc of services) {
  if (!svc.db) continue
  const cwd = path.join(__dirname, '..', 'services', svc.name)
  console.log('generate', svc.name)
  const r = spawnSync('npx', ['prisma', 'generate'], { cwd, shell: true, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status || 1)
}
