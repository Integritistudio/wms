const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../../utils/validators");

const platformAdminSchema = new mongoose.Schema(
  {
    username: requiredString("Username", {
      lowercase: true,
      unique: true,
    }),
    password: requiredString("Password"),
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "platform_admins",
    strict: true,
  }
);

rejectEmptyStrings(platformAdminSchema, ["username", "password"]);

platformAdminSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    username: this.username,
    isActive: this.isActive,
  };
};

module.exports = mongoose.model("PlatformAdmin", platformAdminSchema);
