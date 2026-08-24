const mongoose = require("mongoose");

const returnLineSchema = new mongoose.Schema(
  {
    orderLineId: { type: String, default: "" },
    sku: { type: String, default: "" },
    title: { type: String, default: "" },
    quantity: { type: Number, default: 0 },
    receivedQty: { type: Number, default: 0 },
    restockedQty: { type: Number, default: 0 },
    disposition: {
      type: String,
      enum: ["", "restock", "refurbish", "damaged", "quarantine", "dispose"],
      default: "",
    },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/** Customer / RTS returns (RMA) */
const returnSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      default: null,
    },
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipment",
      default: null,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "requested",
        "authorized",
        "in_transit",
        "received",
        "inspected",
        "restocked",
        "scrapped",
        "refunded",
        "exchanged",
        "cancelled",
      ],
      default: "requested",
      index: true,
    },
    lines: { type: [returnLineSchema], default: [] },
    disposition: {
      type: String,
      enum: ["", "restock", "refurbish", "damaged", "quarantine", "dispose"],
      default: "",
    },
    reason: { type: String, default: "" },
    rmaNumber: { type: String, default: "", index: true },
    trackingNumber: { type: String, default: "" },
    carrier: { type: String, default: "" },
    source: {
      type: String,
      enum: ["manual", "shipment_rts", "customer"],
      default: "manual",
    },
    statusHistory: { type: [statusHistorySchema], default: [] },
    receivedAt: { type: Date, default: null },
    restockedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "returns", strict: true }
);

returnSchema.index({ companyId: 1, status: 1, createdAt: -1 });

returnSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    companyId: this.companyId.toString(),
    shopId: this.shopId ? this.shopId.toString() : null,
    shipmentId: this.shipmentId ? this.shipmentId.toString() : null,
    warehouseId: this.warehouseId ? this.warehouseId.toString() : null,
    status: this.status,
    lines: this.lines || [],
    disposition: this.disposition || "",
    reason: this.reason || "",
    rmaNumber: this.rmaNumber || "",
    trackingNumber: this.trackingNumber || "",
    carrier: this.carrier || "",
    source: this.source || "manual",
    statusHistory: this.statusHistory || [],
    receivedAt: this.receivedAt,
    restockedAt: this.restockedAt,
    metadata: this.metadata || {},
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("Return", returnSchema);
