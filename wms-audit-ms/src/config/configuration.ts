export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? '8722', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'root',
    name: process.env.DB_NAME ?? 'audit_ms',
  },
  adminApiSecret: process.env.ADMIN_API_SECRET ?? '',
  retentionDays: parseInt(process.env.RETENTION_DAYS ?? '30', 10),
  purgeIntervalHours: parseInt(process.env.PURGE_INTERVAL_HOURS ?? '6', 10),
  maxBulkEntries: parseInt(process.env.MAX_BULK_ENTRIES ?? '100', 10),
  runMigrations: process.env.RUN_MIGRATIONS === 'true',
});
