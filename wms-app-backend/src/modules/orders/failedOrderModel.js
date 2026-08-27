const mongoose = require("mongoose");

const failedOrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
      index: true,
    },
    reason: {
      type: String,
      enum: [
        "HMAC_FAIL",
        "MAPPING_EXCEPTION",
        "SFTP_ERROR",
        "SHOPIFY_ERROR",
        "PRODUCT_NOT_FOUND",
        "ROUTING_NO_MATCH",
      ],
      required: true,
    },
    errorMessage: {
      type: String,
      default: "",
    },
    attempts: {
      type: Number,
      default: 1,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: String,
      default: "",
    },
    resolution: {
      type: String,
      enum: ["retried", "reassigned", "skipped", null],
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "failed_orders",
    strict: true,
  }
);

failedOrderSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    shopId: this.shopId.toString(),
    companyId: this.companyId.toString(),
    warehouseId: this.warehouseId ? this.warehouseId.toString() : null,
    reason: this.reason,
    errorMessage: this.errorMessage,
    attempts: this.attempts,
    resolvedAt: this.resolvedAt,
    resolvedBy: this.resolvedBy,
    resolution: this.resolution,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("FailedOrder", failedOrderSchema);
