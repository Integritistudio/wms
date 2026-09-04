const env = require("../../config/env");
const logger = require("../../config/logger");
const { sendMail } = require("../../utils/mail");

let intervalHandle = null;
let lastAlertAt = 0;
let lastAlertedCount = 0;

async function checkAndAlert() {
  try {
    const platform = require("../platform");
    const settings = await platform.getOrCreateSettings();
    const threshold = Math.max(
      1,
      Number(settings.dlqAlertThreshold) || env.dlqAlertThreshold || 5
    );
    const to =
      String(settings.dlqAlertEmail || "").trim() || env.dlqAlertEmail || "";

    if (!to || !env.smtpConfigured) {
      return;
    }

    const FailedOrder = require("../orders/failedOrderModel");
    const count = await FailedOrder.countDocuments({ resolution: null });
    if (count < threshold) {
      lastAlertedCount = 0;
      return;
    }

    const now = Date.now();
    // Re-alert only if depth rose again or interval elapsed since last mail
    const depthRose = count > lastAlertedCount;
    const intervalElapsed = now - lastAlertAt >= env.dlqAlertIntervalMs;
    if (!depthRose && !intervalElapsed && lastAlertAt > 0) {
      return;
    }

    await sendMail({
      to,
      subject: `[WMS Linker] DLQ depth ${count} (threshold ${threshold})`,
      text: [
        `Open failed orders in the dead-letter queue: ${count}`,
        `Alert threshold: ${threshold}`,
        "",
        "Open the company Failed Orders tab to retry, reassign, or skip.",
        `App: ${env.publicAppUrl}`,
      ].join("\n"),
    });

    lastAlertAt = now;
    lastAlertedCount = count;
    logger.warn({ count, threshold, to }, "DLQ depth alert emailed");
  } catch (err) {
    logger.error({ err }, "DLQ alert check failed");
  }
}

function start() {
  if (intervalHandle) return;
  const intervalMs = env.dlqAlertIntervalMs || 300000;
  intervalHandle = setInterval(() => {
    checkAndAlert().catch(() => {});
  }, intervalMs);
  if (intervalHandle.unref) intervalHandle.unref();
  // First check shortly after boot
  setTimeout(() => {
    checkAndAlert().catch(() => {});
  }, 15000).unref?.();
  logger.info({ intervalMs }, "DLQ alert scheduler started");
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  start,
  stop,
  checkAndAlert,
};
