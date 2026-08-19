const mongoose = require("mongoose");
const { requiredString } = require("../../utils/validators");

const fileLinkSchema = new mongoose.Schema(
  {
    token: requiredString("Token", { unique: true }),
    storageKey: requiredString("Storage key"),
    fileName: requiredString("File name"),
    contentType: {
      type: String,
      default: "text/plain",
    },
    passwordHash: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EdiDocument",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "file_links",
    strict: true,
  }
);

fileLinkSchema.methods.toPublic = function toPublic(publicApiUrl) {
  return {
    id: this._id.toString(),
    token: this.token,
    fileName: this.fileName,
    passwordRequired: Boolean(this.passwordHash),
    expiresAt: this.expiresAt,
    downloadCount: this.downloadCount,
    url: `${publicApiUrl}/files/${this.token}`,
  };
};

module.exports = mongoose.model("FileLink", fileLinkSchema);
