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
    lastCleanupAt: this.lastCleanupAt,
    lastCleanupStats: this.lastCleanupStats || {},
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("PlatformSetting", settingSchema);
