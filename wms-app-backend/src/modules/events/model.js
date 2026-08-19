const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    webhookId: {
      type: String,
      required: true,
      unique: true,
    },
    topic: {
      type: String,
      required: true,
      index: true,
    },
    shopDomain: {
      type: String,
      default: "",
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
    collection: "webhook_events",
    strict: true,
  }
);

webhookEventSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    webhookId: this.webhookId,
    topic: this.topic,
    shopDomain: this.shopDomain,
    status: this.status,
    error: this.error,
    processedAt: this.processedAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
