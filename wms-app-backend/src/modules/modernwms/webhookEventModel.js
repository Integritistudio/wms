const mongoose = require("mongoose");

const modernwmsWebhookEventSchema = new mongoose.Schema(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
    topic: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["received", "processed", "ignored", "failed", "duplicate"],
      default: "received",
      index: true,
    },
    error: {
      type: String,
      default: "",
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "modernwms_webhook_events",
    strict: true,
  }
);

module.exports = mongoose.model("ModernwmsWebhookEvent", modernwmsWebhookEventSchema);
