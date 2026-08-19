const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../utils/validators");

const companyUserSchema = new mongoose.Schema(
  {
    username: requiredString("Username", {
      lowercase: true,
    }),
    password: requiredString("Password"),
    email: requiredString("Email", {
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email is invalid"],
    }),
    lastPassword: {
      type: String,
      default: null,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyRoot",
      required: [true, "Company id is required"],
      index: true,
    },
    isActive: {
      type: Boolean,
      required: [true, "isActive is required"],
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "company_users",
    strict: true,
  }
);

rejectEmptyStrings(companyUserSchema, ["username", "password", "email"]);

companyUserSchema.index({ companyId: 1, username: 1 }, { unique: true });
companyUserSchema.index({ companyId: 1, email: 1 }, { unique: true });

companyUserSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    username: this.username,
    email: this.email,
    companyId: this.companyId.toString(),
    isActive: this.isActive,
  };
};

module.exports = mongoose.model("CompanyUser", companyUserSchema);
