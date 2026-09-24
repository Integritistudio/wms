const mongoose = require("mongoose");

const productLinkSchema = new mongoose.Schema(
  {
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
      index: true,
    },
    sku: { type: String, required: true },
    variantId: { type: String, default: "" },
    inventoryItemId: { type: String, default: "" },
    productTitle: { type: String, default: "" },
    productId: { type: String, default: "" },
    /** When true, linker pushes stock to Shopify for this SKU */
    syncEnabled: { type: Boolean, default: false },
    /** Maps to Shopify inventoryPolicy CONTINUE vs DENY */
    continueSelling: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "product_links", strict: true }
);

productLinkSchema.index({ shopId: 1, sku: 1 }, { unique: true });
productLinkSchema.index({ companyId: 1, sku: 1 });

productLinkSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    companyId: this.companyId.toString(),
    shopId: this.shopId.toString(),
    sku: this.sku,
    variantId: this.variantId,
    inventoryItemId: this.inventoryItemId,
    productTitle: this.productTitle,
    productId: this.productId || "",
    syncEnabled: Boolean(this.syncEnabled),
    continueSelling: Boolean(this.continueSelling),
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("ProductLink", productLinkSchema);
