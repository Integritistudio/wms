const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../utils/validators");

const requiredFields = ["companyName", "companyKey", "rootUser", "password"];

const companyRootSchema = new mongoose.Schema(
  {
    companyName: requiredString("Company name"),
    companyKey: requiredString("Company key", {
      lowercase: true,
      unique: true,
    }),
    rootUser: requiredString("Root user", {
      lowercase: true,
    }),
    password: requiredString("Password"),
    lastPassword: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      required: [true, "isActive is required"],
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "company_root",
    strict: true,
  }
);

rejectEmptyStrings(companyRootSchema, requiredFields);

companyRootSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    companyName: this.companyName,
    rootUser: this.rootUser,
    isActive: this.isActive,
  };
};

module.exports = mongoose.model("CompanyRoot", companyRootSchema);
