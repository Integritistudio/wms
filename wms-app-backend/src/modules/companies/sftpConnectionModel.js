const mongoose = require("mongoose");
const { requiredString, rejectEmptyStrings } = require("../../utils/validators");

const sftpConnectionSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: requiredString("SFTP name"),
    enabled: {
      type: Boolean,
      default: false,
    },
    host: {
      type: String,
      default: "",
    },
    port: {
      type: Number,
      default: 22,
    },
    username: {
      type: String,
      default: "",
    },
    passwordEncrypted: {
      type: String,
      default: "",
    },
    remotePath: {
      type: String,
      default: "/inbound/940",
    },
  },
  {
    timestamps: true,
    collection: "sftp_connections",
    strict: true,
  }
);

rejectEmptyStrings(sftpConnectionSchema, ["name"]);

sftpConnectionSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    companyId: this.companyId.toString(),
    name: this.name,
    enabled: Boolean(this.enabled),
    host: this.host || "",
    port: this.port || 22,
    username: this.username || "",
    remotePath: this.remotePath || "/inbound/940",
    passwordSet: Boolean(this.passwordEncrypted),
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("SftpConnection", sftpConnectionSchema);
