/**
 * Seed demo notifications into notify-ms for a company.
 *
 *   ADMIN_API_SECRET=... COMPANY_ID=... node scripts/seed-demo.mjs
 *   node scripts/seed-demo.mjs --base http://127.0.0.1:8720 --company <id> --secret <secret>
 */
import 'dotenv/config';

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

const base = String(arg('base', process.env.NOTIFY_MS_BASE_URL || 'http://127.0.0.1:8720')).replace(
  /\/+$/,
  '',
);
const secret = arg(
  'secret',
  process.env.ADMIN_API_SECRET || process.env.NOTIFY_MS_ADMIN_SECRET || '',
);
const companyId = arg('company', process.env.COMPANY_ID || process.env.SEED_COMPANY_ID || '');

if (!secret) {
  console.error('Missing ADMIN_API_SECRET / --secret');
  process.exit(1);
}
if (!companyId) {
  console.error('Missing COMPANY_ID / --company');
  process.exit(1);
}

async function request(method, path, json) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: 'application/json',
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : `HTTP ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  return data;
}

const samples = [
  {
    type: 'order_received',
    title: 'New order received',
    message: 'Order #1001 was ingested from Shopify.',
    channels: ['in_app'],
    idempotencyKey: `seed-order-received-${companyId}`,
  },
  {
    type: 'order_error',
    title: 'Order mapping failed',
    message: 'SKU MISSING-SKU could not be mapped for order #1002.',
    channels: ['in_app', 'push'],
    idempotencyKey: `seed-order-error-${companyId}`,
  },
  {
    type: 'sftp_failed',
    title: 'SFTP upload failed',
    message: '940 file upload to warehouse SFTP timed out.',
    channels: ['in_app'],
    idempotencyKey: `seed-sftp-failed-${companyId}`,
  },
  {
    type: 'dlq_entry',
    title: 'Failed order queued',
    message: 'Order #1003 landed in the dead-letter queue.',
    channels: ['in_app', 'push'],
    idempotencyKey: `seed-dlq-${companyId}`,
  },
  {
    type: 'order_fulfilled',
    title: 'Order fulfilled',
    message: 'Order #1001 was marked fulfilled after 945.',
    channels: ['in_app'],
    idempotencyKey: `seed-fulfilled-${companyId}`,
  },
];

console.log(`Seeding notify-ms @ ${base} for company ${companyId}`);
await request('POST', '/v1/admin/tenants/ensure', {
  externalCompanyId: String(companyId),
  name: `Company ${companyId}`,
  slug: `co-${String(companyId).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
});
console.log('tenant ensured');

for (const sample of samples) {
  const created = await request(
    'POST',
    `/v1/admin/notifications?companyId=${encodeURIComponent(companyId)}`,
    sample,
  );
  console.log(`+ ${sample.type}: ${created.id || created.title || 'ok'}`);
}

const list = await request(
  'GET',
  `/v1/admin/notifications?companyId=${encodeURIComponent(companyId)}&limit=10`,
);
const unread = await request(
  'GET',
  `/v1/admin/notifications/unread-count?companyId=${encodeURIComponent(companyId)}`,
);
console.log(`done. items=${list.total ?? (list.items || []).length} unread=${unread.count}`);
