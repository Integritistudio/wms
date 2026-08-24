const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
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
    sku: { type: String, required: true },
    quantityOnHand: { type: Number, default: 0 },
    quantityAvailable: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "warehouse_inventory", strict: true }
);

inventorySchema.index({ warehouseId: 1, sku: 1 }, { unique: true });

module.exports = mongoose.model("WarehouseInventory", inventorySchema);
