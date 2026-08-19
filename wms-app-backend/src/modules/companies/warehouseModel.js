const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../../utils/validators");

const warehouseSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: requiredString("Warehouse name"),
    code: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    sftpConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SftpConnection",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "warehouses",
    strict: true,
  }
);

rejectEmptyStrings(warehouseSchema, ["name"]);

warehouseSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    companyId: this.companyId.toString(),
    name: this.name,
    code: this.code,
    address: this.address,
    sftpConnectionId: this.sftpConnectionId ? this.sftpConnectionId.toString() : null,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Warehouse", warehouseSchema);
