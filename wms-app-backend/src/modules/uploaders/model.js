const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../../utils/validators");

const uploaderSchema = new mongoose.Schema(
  {
    username: requiredString("Username", {
      lowercase: true,
      unique: true,
    }),
    password: requiredString("Password"),
    shopIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Shop" }],
      default: [],
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "uploaders",
    strict: true,
  }
);

rejectEmptyStrings(uploaderSchema, ["username", "password"]);

uploaderSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    username: this.username,
    shopIds: this.shopIds.map((id) => id.toString()),
    isActive: this.isActive,
  };
};

module.exports = mongoose.model("Uploader", uploaderSchema);
