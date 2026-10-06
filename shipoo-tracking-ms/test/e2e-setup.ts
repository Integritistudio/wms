import { config as loadEnv } from 'dotenv';

loadEnv();

process.env.OBSERVE_ENABLED = 'false';
process.env.RUN_MIGRATIONS = process.env.RUN_MIGRATIONS ?? 'true';
process.env.OUTBOUND_WEBHOOK_REQUIRE_HTTPS = 'false';
process.env.OUTBOUND_WEBHOOK_ALLOW_PRIVATE = 'true';
process.env.ADMIN_API_SECRET =
  process.env.ADMIN_API_SECRET ?? 'change-me-admin-secret';
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ?? 'change-me-to-a-long-random-secret';
process.env.SHIPPO_PLATFORM_API_TOKEN =
  process.env.SHIPPO_PLATFORM_API_TOKEN ??
  process.env.SHIPOO_API_KEY ??
  'shippo_test_e2e';
