const mongoose = require("mongoose");

const STATES = [
  "RECEIVED",
  "ALLOCATED",
  "940_GENERATED",
  "SENT_TO_3PL",
  "ACCEPTED",
  "945_RECEIVED",
  "FULFILLED",
  "ON_HOLD",
  "EXCEPTION",
  "CANCELLED",
];

const stepSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "compensated"],
      default: "pending",
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error: { type: String, default: "" },
  },
  { _id: false }
);

const sagaSchema = new mongoose.Schema(
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
    state: {
      type: String,
      enum: STATES,
      default: "RECEIVED",
      index: true,
    },
    steps: { type: [stepSchema], default: [] },
    compensations: { type: [String], default: [] },
    currentStep: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "sagas", strict: true }
);

module.exports = mongoose.model("Saga", sagaSchema);
module.exports.STATES = STATES;
