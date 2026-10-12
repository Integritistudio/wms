export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? '8718', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'root',
    name: process.env.DB_NAME ?? 'sftp_ms',
  },
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  adminApiSecret: process.env.ADMIN_API_SECRET ?? '',
  linker: {
    baseUrl: String(process.env.WMS_LINKER_BASE_URL ?? 'http://127.0.0.1:3000').replace(
      /\/+$/,
      '',
    ),
    callbackSecret: process.env.SFTP_MS_CALLBACK_SECRET ?? '',
  },
  pgBoss: {
    schema: process.env.PGBOSS_SCHEMA ?? 'pgboss',
    retryLimit: parseInt(process.env.PGBOSS_RETRY_LIMIT ?? '5', 10),
    retryDelaySeconds: parseInt(process.env.PGBOSS_RETRY_DELAY_SECONDS ?? '30', 10),
    expireInSeconds: parseInt(process.env.PGBOSS_EXPIRE_IN_SECONDS ?? '1800', 10),
    teamConcurrency: parseInt(process.env.PGBOSS_TEAM_CONCURRENCY ?? '3', 10),
  },
  transfer: {
    pollSeconds: parseInt(process.env.TRANSFER_POLL_SECONDS ?? '5', 10),
    batchSize: parseInt(process.env.TRANSFER_BATCH_SIZE ?? '20', 10),
  },
  inbound: {
    pollSeconds: parseInt(process.env.INBOUND_POLL_SECONDS ?? '60', 10),
  },
  security: {
    allowPrivateHosts: process.env.ALLOW_PRIVATE_HOSTS !== 'false',
    maxFileBytes: parseInt(process.env.MAX_FILE_BYTES ?? '5242880', 10),
  },
  runMigrations: process.env.RUN_MIGRATIONS === 'true',
});
