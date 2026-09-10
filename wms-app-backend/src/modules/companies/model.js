const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../../utils/validators");

const companySchema = new mongoose.Schema(
  {
    name: requiredString("Company name"),
    email: requiredString("Root email", {
      lowercase: true,
      unique: true,
    }),
    phone: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "",
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
    status: {
      type: String,
      enum: ["invited", "pending", "active", "rejected", "disabled"],
      default: "invited",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    sftp: {
      enabled: { type: Boolean, default: false },
      host: { type: String, default: "" },
      port: { type: Number, default: 22 },
      username: { type: String, default: "" },
      passwordEncrypted: { type: String, default: "" },
      remotePath: { type: String, default: "/inbound/940" },
    },
    appearance: {
      accentId: {
        type: String,
        enum: ["blue", "teal", "indigo", "emerald", "violet", "rose", "amber", "slate", "custom"],
        default: "blue",
      },
      customAccent: {
        type: String,
        default: "#2563eb",
      },
    },
  },
  {
    timestamps: true,
    collection: "companies",
    strict: true,
  }
);

rejectEmptyStrings(companySchema, ["name", "email"]);

companySchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone,
    notes: this.notes,
    status: this.status,
    rejectionReason: this.rejectionReason || "",
    isDeleted: Boolean(this.isDeleted),
    deletedAt: this.deletedAt,
    sftp: {
      enabled: Boolean(this.sftp?.enabled),
      host: this.sftp?.host || "",
      port: this.sftp?.port || 22,
      username: this.sftp?.username || "",
      remotePath: this.sftp?.remotePath || "/inbound/940",
      passwordSet: Boolean(this.sftp?.passwordEncrypted),
    },
    appearance: {
      accentId: this.appearance?.accentId || "blue",
      customAccent: this.appearance?.customAccent || "#2563eb",
    },
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Company", companySchema);
