const mongoose = require("mongoose");
const { requiredString } = require("../../utils/validators");

const orderSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
      index: true,
    },
    /** Suggested by routing when auto-assign is off; not yet committed */
    suggestedWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
      index: true,
    },
    shopifyOrderId: requiredString("Shopify order id"),
    orderNumber: {
      type: String,
      default: "",
    },
    customerName: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },
    shippingAddress: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lineItems: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    canonical: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    source: {
      type: String,
      enum: ["shopify", "demo"],
      default: "shopify",
    },
    status: {
      type: String,
      enum: ["received", "940_ready", "945_received", "partially_fulfilled", "fulfilled", "cancelled", "ignored", "error", "on_hold"],
      default: "received",
      index: true,
    },
    trackingNumber: {
      type: String,
      default: "",
    },
    carrier: {
      type: String,
      default: "",
    },
    fileLink: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
    },
    sftpStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "skipped",
    },
    sftpError: {
      type: String,
      default: "",
    },
    fulfillmentIdempotencyKey: {
      type: String,
      default: "",
    },
    messageId: {
      type: String,
      default: "",
    },
    canonicalIdempotencyKey: {
      type: String,
      default: "",
    },
    isB2B: {
      type: Boolean,
      default: false,
    },
    poNumber: {
      type: String,
      default: "",
    },
    riskLevel: {
      type: String,
      enum: ["NONE", "LOW", "MEDIUM", "HIGH"],
      default: "NONE",
    },
    giftMessage: {
      type: String,
      default: "",
    },
    shippingMethod: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    routingRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoutingRule",
      default: null,
    },
    routingReason: {
      type: String,
      default: "",
    },
    channel: {
      type: String,
      default: "shopify",
    },
    complianceProfileId: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "orders",
    strict: true,
  }
);

orderSchema.index({ shopId: 1, shopifyOrderId: 1 }, { unique: true });

orderSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    shopId: this.shopId.toString(),
    warehouseId: this.warehouseId ? this.warehouseId.toString() : null,
    suggestedWarehouseId: this.suggestedWarehouseId ? this.suggestedWarehouseId.toString() : null,
    shopifyOrderId: this.shopifyOrderId,
    orderNumber: this.orderNumber,
    customerName: this.customerName,
    email: this.email,
    status: this.status,
    source: this.source,
    trackingNumber: this.trackingNumber,
    carrier: this.carrier,
    fileLink: this.fileLink,
    lineItems: this.lineItems,
    shippingAddress: this.shippingAddress,
    lastError: this.lastError,
    sftpStatus: this.sftpStatus,
    sftpError: this.sftpError,
    isB2B: this.isB2B,
    poNumber: this.poNumber,
    riskLevel: this.riskLevel,
    giftMessage: this.giftMessage,
    shippingMethod: this.shippingMethod,
    routingRuleId: this.routingRuleId ? this.routingRuleId.toString() : null,
    routingReason: this.routingReason || "",
    channel: this.channel || "shopify",
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

orderSchema.methods.toEdiPayload = function toEdiPayload() {
  return {
    shopifyOrderId: this.shopifyOrderId,
    orderNumber: this.orderNumber,
    customerName: this.customerName,
    shippingAddress: this.shippingAddress,
    lineItems: this.lineItems,
  };
};

module.exports = mongoose.model("Order", orderSchema);
