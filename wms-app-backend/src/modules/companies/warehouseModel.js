const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../../utils/validators");

const warehouseSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: requiredString("Warehouse name"),
    code: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    sftpConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SftpConnection",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    enforceFefo: {
      type: Boolean,
      default: false,
    },
    /** Lower number = higher priority when spilling / ranking warehouses */
    routingPriority: {
      type: Number,
      default: 100,
    },
    /**
     * If available qty for a SKU is at or below this, treat as unavailable here
     * and look at other warehouses.
     */
    minStockThreshold: {
      type: Number,
      default: 0,
    },
    /** Comma-friendly list stored as array of ZIP/postal prefixes this WH serves */
    zipPrefixes: {
      type: [String],
      default: [],
    },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    geoPlaceName: { type: String, default: "" },
  },
  {
    timestamps: true,
    collection: "warehouses",
    strict: true,
  }
);

rejectEmptyStrings(warehouseSchema, ["name"]);

warehouseSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    companyId: this.companyId.toString(),
    name: this.name,
    code: this.code,
    address: this.address,
    sftpConnectionId: this.sftpConnectionId ? this.sftpConnectionId.toString() : null,
    isActive: this.isActive,
    enforceFefo: this.enforceFefo || false,
    routingPriority: this.routingPriority ?? 100,
    minStockThreshold: this.minStockThreshold ?? 0,
    zipPrefixes: this.zipPrefixes || [],
    latitude: this.latitude ?? null,
    longitude: this.longitude ?? null,
    geoPlaceName: this.geoPlaceName || "",
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Warehouse", warehouseSchema);
