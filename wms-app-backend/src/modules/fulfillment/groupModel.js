const mongoose = require("mongoose");

const groupLineSchema = new mongoose.Schema(
  {
    orderLineId: { type: String, default: "" },
    sku: { type: String, default: "" },
    title: { type: String, default: "" },
    quantity: { type: Number, default: 0 },
    allocatedQty: { type: Number, default: 0 },
    serials: { type: [String], default: [] },
    lot: { type: String, default: "" },
    expiry: { type: Date, default: null },
    kitComponents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const pickTaskSchema = new mongoose.Schema(
  {
    zone: { type: String, default: "" },
    sku: { type: String, default: "" },
    quantity: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "assigned", "picked", "cancelled"],
      default: "pending",
    },
    bin: { type: String, default: "" },
  },
  { _id: false }
);

const fulfillmentGroupSchema = new mongoose.Schema(
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
      required: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "allocated", "picking", "picked", "packing", "packed", "shipped", "cancelled", "on_hold"],
      default: "pending",
      index: true,
    },
    method: {
      type: String,
      enum: ["warehouse", "dropship", "store", "pickup", "cross_dock"],
      default: "warehouse",
    },
    lines: { type: [groupLineSchema], default: [] },
    pickTasks: { type: [pickTaskSchema], default: [] },
    waveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wave",
      default: null,
    },
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipment",
      default: null,
    },
    workOrderId: { type: String, default: "" },
    purchaseOrderId: { type: String, default: "" },
    crossDock: { type: Boolean, default: false },
    edi940DocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EdiDocument",
      default: null,
    },
    fileLink: { type: mongoose.Schema.Types.Mixed, default: null },
    sftpStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "skipped",
    },
    sftpError: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "fulfillment_groups", strict: true }
);

fulfillmentGroupSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    companyId: this.companyId.toString(),
    shopId: this.shopId.toString(),
    warehouseId: this.warehouseId ? this.warehouseId.toString() : null,
    status: this.status,
    method: this.method,
    lines: this.lines,
    pickTasks: this.pickTasks,
    waveId: this.waveId ? this.waveId.toString() : null,
    shipmentId: this.shipmentId ? this.shipmentId.toString() : null,
    edi940DocumentId: this.edi940DocumentId ? this.edi940DocumentId.toString() : null,
    fileLink: this.fileLink,
    sftpStatus: this.sftpStatus,
    sftpError: this.sftpError,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("FulfillmentGroup", fulfillmentGroupSchema);
