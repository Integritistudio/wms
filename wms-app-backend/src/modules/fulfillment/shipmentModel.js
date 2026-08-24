const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
  {
    weight: { type: Number, default: 0 },
    dims: { type: mongoose.Schema.Types.Mixed, default: {} },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: "" },
    source: { type: String, default: "manual" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SHIPMENT_STATUSES = [
  "pending",
  "labeled",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
];

const shipmentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    fulfillmentGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FulfillmentGroup",
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
    },
    status: {
      type: String,
      enum: SHIPMENT_STATUSES,
      default: "pending",
      index: true,
    },
    carrier: { type: String, default: "" },
    trackingNumber: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    packages: { type: [packageSchema], default: [] },
    shopifyFulfillmentId: { type: String, default: "" },
    statusHistory: { type: [statusEventSchema], default: [] },
    edi945DocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EdiDocument",
      default: null,
    },
    dockAppointmentId: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "shipments", strict: true }
);

shipmentSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    fulfillmentGroupId: this.fulfillmentGroupId.toString(),
    companyId: this.companyId.toString(),
    warehouseId: this.warehouseId ? this.warehouseId.toString() : null,
    status: this.status,
    carrier: this.carrier,
    trackingNumber: this.trackingNumber,
    trackingUrl: this.trackingUrl,
    packages: this.packages,
    shopifyFulfillmentId: this.shopifyFulfillmentId,
    statusHistory: (this.statusHistory || []).map((e) => ({
      status: e.status,
      note: e.note || "",
      source: e.source || "manual",
      at: e.at,
    })),
    edi945DocumentId: this.edi945DocumentId ? this.edi945DocumentId.toString() : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("Shipment", shipmentSchema);
module.exports.SHIPMENT_STATUSES = SHIPMENT_STATUSES;
