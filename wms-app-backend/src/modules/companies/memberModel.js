const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../../utils/validators");

const memberSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: requiredString("Name"),
    email: requiredString("Email", {
      lowercase: true,
      unique: true,
    }),
    role: {
      type: String,
      enum: ["root", "member", "warehouse"],
      default: "member",
      index: true,
    },
    warehouseIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Warehouse",
      default: [],
    },
    password: {
      type: String,
      default: null,
    },
    inviteTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    inviteExpiresAt: {
      type: Date,
      default: null,
    },
    resetTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    resetExpiresAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["invited", "active", "disabled"],
      default: "invited",
    },
  },
  {
    timestamps: true,
    collection: "company_members",
    strict: true,
  }
);

rejectEmptyStrings(memberSchema, ["name", "email"]);

memberSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    companyId: this.companyId.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    warehouseIds: (this.warehouseIds || []).map((id) => id.toString()),
    status: this.status,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("CompanyMember", memberSchema);
