const mongoose = require("mongoose");
const { requiredString } = require("../../utils/validators");

const ediMappingSchema = new mongoose.Schema(
  {
    key: requiredString("Mapping key", { unique: true, lowercase: true }),
    name: requiredString("Mapping name"),
    version: {
      type: String,
      default: "004010",
    },
    senderId: {
      type: String,
      default: "WMSLINKER",
    },
    receiverId: {
      type: String,
      default: "WAREHOUSE",
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "edi_mappings",
    strict: true,
  }
);

module.exports = mongoose.model("EdiMapping", ediMappingSchema);
