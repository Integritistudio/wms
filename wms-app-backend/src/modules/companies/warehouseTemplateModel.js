const mongoose = require("mongoose");

const conditionSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    operator: {
      type: String,
      enum: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "greater_than", "less_than", "is_empty", "is_not_empty"],
      required: true,
    },
    value: { type: String, default: "" },
  },
  { _id: false }
);

const conditionGroupSchema = new mongoose.Schema(
  {
    logic: { type: String, enum: ["and", "or"], default: "and" },
    conditions: { type: [conditionSchema], default: [] },
  },
  { _id: false }
);

const conditionalValueSchema = new mongoose.Schema(
  {
    when: { type: conditionGroupSchema, default: null },
    then: { type: String, default: "" },
  },
  { _id: false }
);

const templateFieldSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true },
    outputLabel: { type: String, required: true },
    source: { type: String, enum: ["shopify", "static", "conditional"], required: true },
    shopifyPath: { type: String, default: "" },
    staticValue: { type: String, default: "" },
    includeCondition: { type: conditionGroupSchema, default: null },
    conditionalValues: { type: [conditionalValueSchema], default: [] },
    fallbackValue: { type: String, default: "" },
  },
  { _id: false }
);

const warehouseTemplateSchema = new mongoose.Schema(
  {
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
      unique: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    format: {
      type: String,
      enum: ["x12", "csv"],
      default: "csv",
    },
    csvDelimiter: { type: String, default: "," },
    csvHeaders: { type: Boolean, default: true },
    fields: { type: [templateFieldSchema], default: [] },
    x12Config: {
      senderId: { type: String, default: "WMSLINKER" },
      receiverId: { type: String, default: "WAREHOUSE" },
      version: { type: String, default: "004010" },
    },
  },
  {
    timestamps: true,
    collection: "warehouse_templates",
    strict: true,
  }
);

warehouseTemplateSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    warehouseId: this.warehouseId.toString(),
    companyId: this.companyId.toString(),
    format: this.format,
    csvDelimiter: this.csvDelimiter,
    csvHeaders: this.csvHeaders,
    fields: this.fields,
    x12Config: this.x12Config,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("WarehouseTemplate", warehouseTemplateSchema);
