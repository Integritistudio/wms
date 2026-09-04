const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "platform_settings",
      unique: true,
    },
    retentionDays: {
      type: Number,
      default: 180, // 6 months default
      min: 1,
    },
    autoCleanupEnabled: {
      type: Boolean,
      default: true,
    },
    lastCleanupAt: {
      type: Date,
      default: null,
    },
    lastCleanupStats: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    webhooksEnabled: {
      type: Boolean,
      default: true,
    },
    dlqAlertEmail: {
      type: String,
      default: "",
    },
    dlqAlertThreshold: {
      type: Number,
      default: 5,
      min: 1,
    },
  },
  {
    timestamps: true,
    collection: "platform_settings",
    strict: true,
  }
);

settingSchema.methods.toPublic = function toPublic() {
  return {
    retentionDays: this.retentionDays || 180,
    autoCleanupEnabled: Boolean(this.autoCleanupEnabled),
    webhooksEnabled: this.webhooksEnabled !== false,
    dlqAlertEmail: this.dlqAlertEmail || "",
    dlqAlertThreshold: this.dlqAlertThreshold || 5,
    lastCleanupAt: this.lastCleanupAt,
    lastCleanupStats: this.lastCleanupStats || {},
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("PlatformSetting", settingSchema);
