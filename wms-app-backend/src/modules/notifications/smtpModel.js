const mongoose = require("mongoose");

const smtpSettingsSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
    },
    host: { type: String, required: true },
    port: { type: Number, default: 587 },
    secure: { type: Boolean, default: false },
    username: { type: String, required: true },
    password: { type: String, required: true },
    fromName: { type: String, default: "WMS Linker" },
    fromEmail: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    notifyOn: {
      type: [String],
      default: ["order_error", "sftp_failed", "dlq_entry"],
    },
    recipients: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true, collection: "smtp_settings", strict: true }
);

module.exports = mongoose.model("SmtpSettings", smtpSettingsSchema);
