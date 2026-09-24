require("dotenv").config();

const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default("*"),
  MONGODB_USERNAME: z.string().min(1),
  MONGODB_PASSWORD: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  LOG_FILE: z.string().optional().default(""),
  ADMIN_CONSOLE_PATH: z.string().min(8).default("c-7f3k91qx"),
  PLATFORM_ADMIN_USERNAME: z.string().min(1).default("platform"),
  PLATFORM_ADMIN_PASSWORD: z.string().min(8).default("change-me-now"),
  SHOPIFY_API_KEY: z.string().optional().default(""),
  SHOPIFY_API_SECRET: z.string().optional().default(""),
  SHOPIFY_HOST_NAME: z.string().optional().default(""),
  SHOPIFY_API_VERSION: z.string().optional().default("2026-04"),
  SHOPIFY_SCOPES: z
    .string()
    .optional()
    .default(
      "read_orders,write_orders,write_returns,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_inventory,write_inventory,read_products,read_locations"
    ),
  FULFILLMENT_SERVICE_ENABLED: z.string().optional().default("false"),
  WEBHOOKS_ENABLED: z.string().optional().default("true"),
  DLQ_ALERT_THRESHOLD: z.coerce.number().int().positive().optional().default(5),
  DLQ_ALERT_EMAIL: z.string().optional().default(""),
  DLQ_ALERT_INTERVAL_MS: z.coerce.number().int().positive().optional().default(300000),
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET: z.string().optional().default(""),
  R2_PUBLIC_BASE_URL: z.string().optional().default(""),
  FILE_STORAGE_DIR: z.string().optional().default("./storage"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),
  PUBLIC_API_URL: z.string().optional().default("http://127.0.0.1:3000"),
  PUBLIC_APP_URL: z.string().optional().default("http://localhost:5173"),
  MAPBOX_TOKEN: z.string().optional().default(""),
  MODERNWMS_DEFAULT_BASE_URL: z.string().optional().default("https://wms-sys.integritistudio.us"),
  MODERNWMS_POLL_INTERVAL_MS: z.coerce.number().int().positive().optional().default(30000),
});

const parsed = envSchema.parse(process.env);

const r2Configured = Boolean(
  parsed.R2_ACCOUNT_ID && parsed.R2_ACCESS_KEY_ID && parsed.R2_SECRET_ACCESS_KEY && parsed.R2_BUCKET
);

function shopifyApiUrl(relativePath) {
  const base = parsed.PUBLIC_API_URL.replace(/\/+$/, "").replace(/\/api$/i, "");
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${base}/api${path}`;
}

const env = Object.freeze({
  nodeEnv: parsed.NODE_ENV,
  isProduction: parsed.NODE_ENV === "production",
  host: parsed.HOST,
  port: parsed.PORT,
  corsOrigin: parsed.CORS_ORIGIN,
  mongodbUsername: parsed.MONGODB_USERNAME,
  mongodbPassword: parsed.MONGODB_PASSWORD,
  mongodbUri: parsed.MONGODB_URI,
  jwtSecret: parsed.JWT_SECRET,
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  logLevel: parsed.LOG_LEVEL || (parsed.NODE_ENV === "production" ? "info" : "debug"),
  logFile: parsed.LOG_FILE,
  adminConsolePath: parsed.ADMIN_CONSOLE_PATH.replace(/^\/+|\/+$/g, ""),
  platformAdminUsername: parsed.PLATFORM_ADMIN_USERNAME.toLowerCase(),
  platformAdminPassword: parsed.PLATFORM_ADMIN_PASSWORD,
  shopifyApiKey: parsed.SHOPIFY_API_KEY,
  shopifyApiSecret: parsed.SHOPIFY_API_SECRET,
  shopifyHostName: parsed.SHOPIFY_HOST_NAME.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
  shopifyApiVersion: parsed.SHOPIFY_API_VERSION,
  shopifyScopes: parsed.SHOPIFY_SCOPES.split(",").map((scope) => scope.trim()).filter(Boolean),
  r2AccountId: parsed.R2_ACCOUNT_ID,
  r2AccessKeyId: parsed.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: parsed.R2_SECRET_ACCESS_KEY,
  r2Bucket: parsed.R2_BUCKET,
  r2PublicBaseUrl: parsed.R2_PUBLIC_BASE_URL,
  r2Configured,
  fileStorageDir: parsed.FILE_STORAGE_DIR,
  smtpHost: parsed.SMTP_HOST,
  smtpPort: parsed.SMTP_PORT,
  smtpUser: parsed.SMTP_USER,
  smtpPass: parsed.SMTP_PASS,
  smtpFrom: parsed.SMTP_FROM,
  smtpConfigured: Boolean(parsed.SMTP_HOST && parsed.SMTP_FROM),
  publicApiUrl: parsed.PUBLIC_API_URL.replace(/\/+$/, ""),
  publicAppUrl: parsed.PUBLIC_APP_URL.replace(/\/+$/, ""),
  fulfillmentServiceEnabled: parsed.FULFILLMENT_SERVICE_ENABLED === "true",
  webhooksEnabled: parsed.WEBHOOKS_ENABLED !== "false",
  dlqAlertThreshold: parsed.DLQ_ALERT_THRESHOLD,
  dlqAlertEmail: String(parsed.DLQ_ALERT_EMAIL || "").trim(),
  dlqAlertIntervalMs: parsed.DLQ_ALERT_INTERVAL_MS,
  mapboxToken: parsed.MAPBOX_TOKEN || "",
  modernwmsDefaultBaseUrl: parsed.MODERNWMS_DEFAULT_BASE_URL.replace(/\/+$/, ""),
  modernwmsPollIntervalMs: parsed.MODERNWMS_POLL_INTERVAL_MS,
  shopifyApiUrl,
});

module.exports = env;
