'use strict'

const { Client } = require('pg')

const DBS = [
  'linker_auth',
  'linker_platform',
  'linker_companies',
  'linker_shops',
  'linker_orders',
  'linker_fulfillment',
  'linker_routing',
  'linker_saga',
  'linker_inventory',
  'linker_files',
  'linker_notifications',
  'linker_uploaders',
  'linker_ecommerce_shopify',
  'linker_wms_modernwms',
  'linker_wms_sftp_edi',
]

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'root',
    database: 'postgres',
  })
  await client.connect()
  for (const db of DBS) {
    const r = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db])
    if (r.rowCount === 0) {
      await client.query(`CREATE DATABASE "${db}"`)
      console.log('created', db)
    } else {
      console.log('exists', db)
    }
  }
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
