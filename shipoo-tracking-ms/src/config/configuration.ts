export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? '8181', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'shipoo_ms',
  },
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  adminApiSecret: process.env.ADMIN_API_SECRET ?? '',
  shippo: {
    platformApiToken:
      process.env.SHIPPO_PLATFORM_API_TOKEN ?? process.env.SHIPOO_API_KEY ?? '',
    apiBaseUrl: process.env.SHIPPO_API_BASE_URL ?? 'https://api.goshippo.com',
    inboundWebhookSecret: process.env.SHIPPO_INBOUND_WEBHOOK_SECRET ?? '',
    webhookPublicUrl: process.env.SHIPPO_WEBHOOK_PUBLIC_URL ?? '',
  },
  trackingProvider: process.env.TRACKING_PROVIDER ?? 'shippo',
  observe: {
    enabled: process.env.OBSERVE_ENABLED === 'true',
    appKey: process.env.OBSERVE_APP_KEY ?? '',
    appSecret: process.env.OBSERVE_APP_SECRET ?? '',
    serviceId: process.env.OBSERVE_SERVICE_ID ?? 'wms-tracking-ms',
  },
  pgBoss: {
    schema: process.env.PGBOSS_SCHEMA ?? 'pgboss',
    retryLimit: parseInt(process.env.PGBOSS_RETRY_LIMIT ?? '5', 10),
    retryDelaySeconds: parseInt(process.env.PGBOSS_RETRY_DELAY_SECONDS ?? '30', 10),
    expireInSeconds: parseInt(process.env.PGBOSS_EXPIRE_IN_SECONDS ?? '900', 10),
    teamConcurrency: parseInt(process.env.PGBOSS_TEAM_CONCURRENCY ?? '5', 10),
  },
  reconciliation: {
    cronMinutes: parseInt(process.env.RECONCILE_CRON_MINUTES ?? '15', 10),
    staleMinutes: parseInt(process.env.RECONCILE_STALE_MINUTES ?? '60', 10),
    batchSize: parseInt(process.env.RECONCILE_BATCH_SIZE ?? '50', 10),
  },
  outboundWebhook: {
    timeoutMs: parseInt(process.env.OUTBOUND_WEBHOOK_TIMEOUT_MS ?? '10000', 10),
    requireHttps: process.env.OUTBOUND_WEBHOOK_REQUIRE_HTTPS !== 'false',
    allowPrivate: process.env.OUTBOUND_WEBHOOK_ALLOW_PRIVATE === 'true',
  },
  runMigrations: process.env.RUN_MIGRATIONS === 'true',
});
