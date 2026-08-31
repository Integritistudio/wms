const mongoose = require("mongoose");

const modernwmsLinkSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FulfillmentGroup",
      required: true,
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
      required: true,
      index: true,
    },
    dispatchNo: { type: String, default: "", index: true },
    dispatchStatus: { type: Number, default: 0 },
    tenantId: { type: Number, default: null },
    pushError: { type: String, default: "" },
    closed: { type: Boolean, default: false, index: true },
    lastPolledAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "modernwms_links", strict: true }
);

modernwmsLinkSchema.index({ groupId: 1 }, { unique: true });

modernwmsLinkSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    groupId: this.groupId.toString(),
    companyId: this.companyId.toString(),
    warehouseId: this.warehouseId.toString(),
    dispatchNo: this.dispatchNo || "",
    dispatchStatus: this.dispatchStatus ?? 0,
    tenantId: this.tenantId ?? null,
    pushError: this.pushError || "",
    closed: Boolean(this.closed),
    lastPolledAt: this.lastPolledAt || null,
    closedAt: this.closedAt || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("ModernWmsLink", modernwmsLinkSchema);
