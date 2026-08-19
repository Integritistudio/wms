const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    groupId: {
      type: String,
      required: true,
      index: true,
    },
    topic: {
      type: String,
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WebhookEvent",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: "",
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "job_queue",
    strict: true,
  }
);

jobSchema.index({ status: 1, groupId: 1, createdAt: 1 });

module.exports = mongoose.model("Job", jobSchema);
