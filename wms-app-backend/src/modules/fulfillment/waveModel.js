const mongoose = require("mongoose");

/** Scaffold for Levels 7–9 wave/batch picking — empty until wave UI ships */
const waveSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "released", "picking", "completed", "cancelled"],
      default: "draft",
    },
    fulfillmentGroupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "FulfillmentGroup" }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "waves", strict: true }
);

module.exports = mongoose.model("Wave", waveSchema);
