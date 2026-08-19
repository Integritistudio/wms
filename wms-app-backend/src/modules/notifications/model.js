const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "order_received",
        "order_fulfilled",
        "order_error",
        "sftp_failed",
        "945_received",
        "dlq_entry",
        "system",
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "notifications", strict: true }
);

notificationSchema.index({ companyId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

module.exports = mongoose.model("Notification", notificationSchema);
