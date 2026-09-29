'use strict'

const net = require('net')

function waitPort(port, host = '127.0.0.1', timeoutMs = 60000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end()
        resolve()
      })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() - start > timeoutMs) reject(new Error(`timeout waiting ${host}:${port}`))
        else setTimeout(tryOnce, 500)
      })
    }
    tryOnce()
  })
}

;(async () => {
  console.log('waiting for postgres :5432 and rabbitmq :5672')
  await waitPort(5432)
  await waitPort(5672)
  console.log('infra ready')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
