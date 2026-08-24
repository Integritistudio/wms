const mongoose = require("mongoose");

const routingConfigSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
    },
    enabled: { type: Boolean, default: false },
    autoAssignOnReceive: { type: Boolean, default: true },
    autoDeliverSftp: { type: Boolean, default: true },
    defaultWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
    },
    /** Used when preferred/default cannot cover stock (extra fallback) */
    fallbackWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
    },
    partialPolicy: {
      type: String,
      enum: ["hold_all", "ship_available", "allow_customer_partial"],
      default: "ship_available",
    },
    /**
     * How to rank warehouses for address-based preference / spill order:
     * - off: use warehouse.routingPriority only
     * - zip_prefix: prefer WH whose zipPrefixes match ship ZIP, then priority
     * - mapbox_distance: nearest WH to ship address (Mapbox), then priority
     */
    addressMode: {
      type: String,
      enum: ["off", "zip_prefix", "mapbox_distance"],
      default: "off",
    },
  },
  { timestamps: true, collection: "routing_configs", strict: true }
);

module.exports = mongoose.model("RoutingConfig", routingConfigSchema);
