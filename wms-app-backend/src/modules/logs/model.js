const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["order_flow", "sftp_delivery", "shopify_api"],
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },
    fromState: { type: String, default: "" },
    toState: { type: String, default: "" },
    message: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: "activity_logs",
    strict: true,
  }
);

activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });

activityLogSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    type: this.type,
    orderId: this.orderId ? this.orderId.toString() : null,
    warehouseId: this.warehouseId ? this.warehouseId.toString() : null,
    companyId: this.companyId ? this.companyId.toString() : null,
    fromState: this.fromState,
    toState: this.toState,
    message: this.message,
    meta: this.meta,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("ActivityLog", activityLogSchema);
