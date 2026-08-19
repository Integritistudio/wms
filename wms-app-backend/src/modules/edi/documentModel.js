const mongoose = require("mongoose");
const { requiredString } = require("../../utils/validators");

const ediDocumentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    type: {
      type: String,
      enum: ["940", "945"],
      required: true,
    },
    mappingKey: {
      type: String,
      default: "generic",
    },
    storageKey: {
      type: String,
      default: "",
    },
    body: {
      type: String,
      default: "",
    },
    parsed: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    fileLinkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FileLink",
      default: null,
    },
    status: requiredString("Status"),
  },
  {
    timestamps: true,
    collection: "edi_documents",
    strict: true,
  }
);

ediDocumentSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    orderId: this.orderId.toString(),
    type: this.type,
    mappingKey: this.mappingKey,
    status: this.status,
    parsed: this.parsed,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("EdiDocument", ediDocumentSchema);
