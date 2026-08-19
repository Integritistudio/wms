const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../utils/validators");

const stateSchema = new mongoose.Schema(
  {
    name: requiredString("State name"),
    isoCode: requiredString("State ISO code", {
      uppercase: true,
    }),
    countryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Country",
      required: [true, "Country id is required"],
      index: true,
    },
    countryIsoCode: requiredString("Country ISO code", {
      uppercase: true,
    }),
  },
  {
    timestamps: true,
    collection: "states",
    strict: true,
  }
);

rejectEmptyStrings(stateSchema, ["name", "isoCode", "countryIsoCode"]);

stateSchema.index({ countryIsoCode: 1, isoCode: 1 }, { unique: true });

stateSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    isoCode: this.isoCode,
    countryId: this.countryId.toString(),
    countryIsoCode: this.countryIsoCode,
  };
};

module.exports = mongoose.model("State", stateSchema);
