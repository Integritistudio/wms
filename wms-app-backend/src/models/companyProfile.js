const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../utils/validators");

const companyProfileSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyRoot",
      required: [true, "Company id is required"],
      unique: true,
    },
    name: requiredString("Company profile name"),
    email: requiredString("Email", {
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email is invalid"],
    }),
    countryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Country",
      required: [true, "Country is required"],
    },
    stateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "State",
      default: null,
    },
    address: requiredString("Address"),
    phone: requiredString("Phone"),
  },
  {
    timestamps: true,
    collection: "company_profile",
    strict: true,
  }
);

rejectEmptyStrings(companyProfileSchema, ["name", "email", "address", "phone"]);

companyProfileSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    companyId: this.companyId.toString(),
    name: this.name,
    email: this.email,
    country: this.countryId?.toPublic ? this.countryId.toPublic() : this.countryId?.toString?.() || this.countryId,
    state: this.stateId?.toPublic ? this.stateId.toPublic() : this.stateId?.toString?.() || this.stateId,
    address: this.address,
    phone: this.phone,
  };
};

module.exports = mongoose.model("CompanyProfile", companyProfileSchema);
