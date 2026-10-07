const mongoose = require("mongoose");

const shipooTrackingSettingsSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
    },
    enabled: { type: Boolean, default: false },
    /** Encrypted Shipoo tenant API secret (wms_trk_…). */
    apiKeyEncrypted: { type: String, default: "" },
    /** Encrypted outbound webhook HMAC secret from Shipoo destination. */
    webhookSecretEncrypted: { type: String, default: "" },
    destinationId: { type: String, default: "" },
    lastRegisteredAt: { type: Date, default: null },
    lastWebhookAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "shipoo_tracking_settings", strict: true },
);

module.exports = mongoose.model("ShipooTrackingSettings", shipooTrackingSettingsSchema);
