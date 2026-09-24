const mongoose = require("mongoose");

const warehouseShopifyLocationSchema = new mongoose.Schema(
  {
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
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    locationGid: { type: String, required: true },
    locationName: { type: String, default: "" },
  },
  { timestamps: true, collection: "warehouse_shopify_locations", strict: true }
);

warehouseShopifyLocationSchema.index({ warehouseId: 1, shopId: 1 }, { unique: true });

warehouseShopifyLocationSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    companyId: this.companyId.toString(),
    warehouseId: this.warehouseId.toString(),
    shopId: this.shopId.toString(),
    locationGid: this.locationGid,
    locationName: this.locationName || "",
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("WarehouseShopifyLocation", warehouseShopifyLocationSchema);
