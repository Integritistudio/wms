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
    enabled: this.enabled,
    installed: this.installed,
    mappingKey: this.mappingKey,
    scopes: this.scopes,
    installedAt: this.installedAt,
    uninstalledAt: this.uninstalledAt,
    createdAt: this.createdAt,
    reconnectUrl: env.shopifyApiUrl(`/shopify/auth?shop=${encodeURIComponent(this.shopDomain)}`),
  };
};

module.exports = mongoose.model("Shop", shopSchema);
