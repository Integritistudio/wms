const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: String,
  owner: { type: String, required: true },
  lockedUntil: { type: Date, required: true },
}, { collection: "queue_group_leases" });
module.exports = mongoose.model("QueueGroupLease", schema);
