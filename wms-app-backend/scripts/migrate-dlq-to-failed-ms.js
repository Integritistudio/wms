/**
 * One-shot: copy open Mongo failed_orders into wms-failed-ms.
 *
 * Usage:
 *   node scripts/migrate-dlq-to-failed-ms.js
 *
 * Requires env: MONGODB_*, FAILED_MS_BASE_URL, FAILED_MS_ADMIN_SECRET
 */
require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../src/config/env");
const FailedOrder = require("../src/modules/orders/failedOrderModel");
const failedMs = require("../src/modules/failedMs/client");

async function main() {
  if (!failedMs.enabled()) {
    throw new Error("FAILED_MS_BASE_URL and FAILED_MS_ADMIN_SECRET must be set");
  }

  await mongoose.connect(env.mongodbUri || process.env.MONGODB_URI);
  const open = await FailedOrder.find({ resolution: null }).lean();
  console.log(`Found ${open.length} open Mongo DLQ rows`);

  let ok = 0;
  let fail = 0;
  for (const row of open) {
    try {
      await failedMs.ingest({
        orderId: String(row.orderId),
        shopId: String(row.shopId),
        companyId: String(row.companyId),
        warehouseId: row.warehouseId ? String(row.warehouseId) : null,
        reason: row.reason || "UNKNOWN",
        errorMessage: row.errorMessage || "",
        payload: {
          migratedFromMongoId: String(row._id),
          attempts: row.attempts,
          createdAt: row.createdAt,
        },
      });
      ok += 1;
    } catch (err) {
      fail += 1;
      console.error(`Failed ${row._id}:`, err.message);
    }
  }

  console.log(`Migrated ok=${ok} fail=${fail}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
