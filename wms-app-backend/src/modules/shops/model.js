const mongoose = require("mongoose");
const env = require("../../config/env");
const { requiredString, rejectEmptyStrings } = require("../../utils/validators");

const shopSchema = new mongoose.Schema(
  {
    shopDomain: requiredString("Shop domain", {
      lowercase: true,
      unique: true,
    }),
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
    },
    // Undefined preserves legacy location mappings; [] explicitly disconnects all warehouses.
    warehouseIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" }], default: undefined },
    inventoryLocationGid: { type: String, default: "" },
    retiredInventoryLocations: { type: [String], default: [] },
    inventorySyncError: { type: String, default: "" },
    inventorySyncedAt: { type: Date, default: null },
    inventorySyncPending: { type: Boolean, default: false },
    inventorySyncInProgress: { type: Boolean, default: false },
    inventorySyncStartedAt: { type: Date, default: null },
    inventorySyncResult: { type: mongoose.Schema.Types.Mixed, default: null },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    installed: {
      type: Boolean,
      required: true,
      default: false,
    },
    accessTokenEncrypted: {
      type: String,
      default: null,
    },
    accessTokenExpiresAt: {
      type: Date,
      default: null,
    },
    refreshTokenEncrypted: {
      type: String,
      default: null,
    },
    refreshTokenExpiresAt: {
      type: Date,
      default: null,
    },
    scopes: {
      type: String,
      default: "",
    },
    mappingKey: {
      type: String,
      default: "generic",
    },
    installedAt: {
      type: Date,
      default: null,
    },
    uninstalledAt: {
      type: Date,
      default: null,
    },
    /**
     * Per-store WMS push hold override.
     * wmsPushHoldEnabled: null/undefined = inherit company, true/false = force on/off
     * wmsPushHoldMinutes: null = inherit company minutes when enabled
     */
    wmsPushHoldEnabled: { type: Boolean, required: false, default: undefined },
    wmsPushHoldMinutes: { type: Number, required: false, default: undefined, min: 1, max: 240 },
  },
  {
    timestamps: true,
    collection: "shops",
    strict: true,
  }
);

rejectEmptyStrings(shopSchema, ["shopDomain"]);

shopSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    shopDomain: this.shopDomain,
    companyId: this.companyId?._id?.toString() || this.companyId?.toString() || null,
    warehouseId: this.warehouseId?._id?.toString() || this.warehouseId?.toString() || null,
    warehouseIds: this.warehouseIds?.map(String),
    inventoryLocationGid: this.inventoryLocationGid,
    inventorySyncError: this.inventorySyncError,
    inventorySyncedAt: this.inventorySyncedAt,
    inventorySyncPending: this.inventorySyncPending,
    inventorySyncInProgress: this.inventorySyncInProgress,
    inventorySyncStartedAt: this.inventorySyncStartedAt,
    inventorySyncResult: this.inventorySyncResult,
    enabled: this.enabled,
    installed: this.installed,
    mappingKey: this.mappingKey,
    scopes: this.scopes,
    installedAt: this.installedAt,
    uninstalledAt: this.uninstalledAt,
    wmsPushHoldEnabled: this.wmsPushHoldEnabled == null ? null : Boolean(this.wmsPushHoldEnabled),
    wmsPushHoldMinutes:
      this.wmsPushHoldMinutes == null || this.wmsPushHoldMinutes === ""
        ? null
        : Number(this.wmsPushHoldMinutes),
    createdAt: this.createdAt,
    reconnectUrl: env.shopifyApiUrl(`/shopify/auth?shop=${encodeURIComponent(this.shopDomain)}`),
    installUrl: env.shopifyApiUrl(`/shopify/auth?shop=${encodeURIComponent(this.shopDomain)}`),
  };
};

module.exports = mongoose.model("Shop", shopSchema);
