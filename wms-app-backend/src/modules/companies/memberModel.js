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
      enum: ["invited", "pending", "active", "disabled"],
      default: "invited",
    },
    permissions: {
      orders: { type: Boolean, default: false },
      returns: { type: Boolean, default: false },
      failed: { type: Boolean, default: false },
      warehouses: { type: Boolean, default: false },
      sftp: { type: Boolean, default: false },
      routing: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
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
  const isRoot = this.role === "root";
  const perms = isRoot
    ? {
        orders: true,
        returns: true,
        failed: true,
        warehouses: true,
        sftp: true,
        routing: true,
        email: true,
      }
    : {
        orders: Boolean(this.permissions?.orders),
        returns: Boolean(this.permissions?.returns),
        failed: Boolean(this.permissions?.failed),
        warehouses: Boolean(this.permissions?.warehouses),
        sftp: Boolean(this.permissions?.sftp),
        routing: Boolean(this.permissions?.routing),
        email: Boolean(this.permissions?.email),
      };

  return {
    id: this._id.toString(),
    companyId: this.companyId.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    warehouseIds: (this.warehouseIds || []).map((id) => id.toString()),
    permissions: perms,
    status: this.status,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("CompanyMember", memberSchema);
