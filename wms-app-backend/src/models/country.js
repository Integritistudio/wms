const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../utils/validators");

const countrySchema = new mongoose.Schema(
  {
    name: requiredString("Country name"),
    isoCode: requiredString("ISO code", {
      uppercase: true,
      unique: true,
    }),
    currency: requiredString("Currency", {
      uppercase: true,
    }),
    phoneCode: requiredString("Phone code"),
  },
  {
    timestamps: true,
    collection: "countries",
    strict: true,
  }
);

rejectEmptyStrings(countrySchema, ["name", "isoCode", "currency", "phoneCode"]);

countrySchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    isoCode: this.isoCode,
    currency: this.currency,
    phoneCode: this.phoneCode,
  };
};

module.exports = mongoose.model("Country", countrySchema);
