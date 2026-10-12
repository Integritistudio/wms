export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? '8720', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'root',
    name: process.env.DB_NAME ?? 'notify_ms',
  },
  adminApiSecret: process.env.ADMIN_API_SECRET ?? '',
  push: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:ops@example.com',
    fcmServerKey: process.env.FCM_SERVER_KEY ?? '',
    webhookUrl: process.env.PUSH_WEBHOOK_URL ?? '',
    pollSeconds: parseInt(process.env.PUSH_POLL_SECONDS ?? '5', 10),
    batchSize: parseInt(process.env.PUSH_BATCH_SIZE ?? '50', 10),
  },
  retention: {
    readDays: parseInt(process.env.READ_RETENTION_DAYS ?? '7', 10),
    ttlDays: parseInt(process.env.NOTIFICATION_TTL_DAYS ?? '90', 10),
  },
  pgBoss: {
    schema: process.env.PGBOSS_SCHEMA ?? 'pgboss',
    retryLimit: parseInt(process.env.PGBOSS_RETRY_LIMIT ?? '5', 10),
    retryDelaySeconds: parseInt(process.env.PGBOSS_RETRY_DELAY_SECONDS ?? '30', 10),
    expireInSeconds: parseInt(process.env.PGBOSS_EXPIRE_IN_SECONDS ?? '1800', 10),
    teamConcurrency: parseInt(process.env.PGBOSS_TEAM_CONCURRENCY ?? '5', 10),
  },
  runMigrations: process.env.RUN_MIGRATIONS === 'true',
});
