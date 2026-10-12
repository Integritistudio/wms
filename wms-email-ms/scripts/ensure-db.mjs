import pg from 'pg';

const { Client } = pg;

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'root',
  database: 'postgres',
});

const dbName = process.env.DB_NAME || 'email_ms';

await client.connect();
const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (existing.rowCount === 0) {
  await client.query(`CREATE DATABASE "${dbName}"`);
  console.log(`created database ${dbName}`);
} else {
  console.log(`database ${dbName} already exists`);
}
await client.end();
