export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? '8714', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'failed_ms',
  },
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  adminApiSecret: process.env.ADMIN_API_SECRET ?? '',
  linker: {
    baseUrl: String(process.env.WMS_LINKER_BASE_URL ?? 'http://127.0.0.1:3000').replace(
      /\/+$/,
      '',
    ),
    callbackSecret: process.env.FAILED_MS_CALLBACK_SECRET ?? '',
  },
  pgBoss: {
    schema: process.env.PGBOSS_SCHEMA ?? 'pgboss',
    retryLimit: parseInt(process.env.PGBOSS_RETRY_LIMIT ?? '5', 10),
    retryDelaySeconds: parseInt(process.env.PGBOSS_RETRY_DELAY_SECONDS ?? '30', 10),
    expireInSeconds: parseInt(process.env.PGBOSS_EXPIRE_IN_SECONDS ?? '900', 10),
    teamConcurrency: parseInt(process.env.PGBOSS_TEAM_CONCURRENCY ?? '5', 10),
  },
  autoRetry: {
    pollSeconds: parseInt(process.env.AUTO_RETRY_POLL_SECONDS ?? '15', 10),
    batchSize: parseInt(process.env.AUTO_RETRY_BATCH_SIZE ?? '25', 10),
  },
  alerts: {
    pollSeconds: parseInt(process.env.ALERT_POLL_SECONDS ?? '60', 10),
  },
  stale: {
    sweepHours: parseInt(process.env.STALE_SWEEP_HOURS ?? '168', 10),
    pollMinutes: parseInt(process.env.STALE_SWEEP_POLL_MINUTES ?? '60', 10),
  },
  defaults: {
    maxAttempts: parseInt(process.env.DEFAULT_MAX_ATTEMPTS ?? '5', 10),
    baseDelaySeconds: parseInt(process.env.DEFAULT_BASE_DELAY_SECONDS ?? '30', 10),
    maxDelaySeconds: parseInt(process.env.DEFAULT_MAX_DELAY_SECONDS ?? '900', 10),
    multiplier: parseFloat(process.env.DEFAULT_BACKOFF_MULTIPLIER ?? '2'),
  },
  runMigrations: process.env.RUN_MIGRATIONS === 'true',
});
