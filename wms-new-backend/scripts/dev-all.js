'use strict'

const { spawn } = require('child_process')
const path = require('path')
const services = require('./services.json')

// Prefer HTTP event hub when RabbitMQ is not available
process.env.EVENT_BUS = process.env.EVENT_BUS || 'http'
process.env.EVENT_HUB_URL = process.env.EVENT_HUB_URL || 'http://127.0.0.1:4099'
process.env.MOCK_MODERNWMS = process.env.MOCK_MODERNWMS || '1'
process.env.MOCK_SFTP = process.env.MOCK_SFTP || '1'

const children = []

function start(svc) {
  const cwd = path.join(__dirname, '..', 'services', svc.name)
  const env = {
    ...process.env,
    PORT: String(svc.port),
    PUBLIC_BASE_URL: `http://127.0.0.1:${svc.port}`,
    EVENT_BUS: 'http',
    EVENT_HUB_URL: 'http://127.0.0.1:4099',
  }
  if (svc.db) {
    env.DATABASE_URL = `postgresql://postgres:root@localhost:5432/${svc.db}`
  }
  const child = spawn('node', ['src/index.js'], {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })
  const prefix = `[${svc.name}]`
  child.stdout.on('data', (d) => process.stdout.write(`${prefix} ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`${prefix} ${d}`))
  child.on('exit', (code) => {
    console.error(prefix, 'exited', code)
  })
  children.push(child)
}

// Start event-hub first, then others after a short delay
const hub = services.find((s) => s.name === 'event-hub')
const rest = services.filter((s) => s.name !== 'event-hub')
if (hub) start(hub)

setTimeout(() => {
  for (const svc of rest) start(svc)
  console.log(`Started ${services.length} services (EVENT_BUS=http)`)
}, 1200)

process.on('SIGINT', () => {
  for (const c of children) c.kill()
  process.exit(0)
})
