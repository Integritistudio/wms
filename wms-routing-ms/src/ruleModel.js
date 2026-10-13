const mongoose = require("mongoose");

const conditionSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    operator: {
      type: String,
      enum: [
        "equals",
        "not_equals",
        "contains",
        "not_contains",
        "starts_with",
        "ends_with",
        "greater_than",
        "less_than",
        "greater_or_equal",
        "less_or_equal",
        "in_list",
        "not_in_list",
        "is_true",
        "is_false",
        "is_empty",
        "is_not_empty",
      ],
      required: true,
    },
    value: { type: String, default: "" },
  },
  { _id: false }
);

const routingRuleSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    priority: { type: Number, default: 100 },
    enabled: { type: Boolean, default: true },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    conditionLogic: { type: String, enum: ["and", "or"], default: "and" },
    conditions: { type: [conditionSchema], default: [] },
    requireAllItemsInStock: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "routing_rules", strict: true }
);

routingRuleSchema.index({ companyId: 1, priority: 1 });

module.exports = mongoose.model("RoutingRule", routingRuleSchema);
