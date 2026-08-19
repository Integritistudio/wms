function requiredString(label, extra = {}) {
  return {
    type: String,
    required: [true, `${label} is required`],
    trim: true,
    minlength: [1, `${label} cannot be empty`],
    validate: {
      validator(value) {
        return typeof value === "string" && value.trim().length > 0;
      },
      message: `${label} cannot be empty`,
    },
    ...extra,
  };
}

function rejectEmptyStrings(schema, fields) {
  function clearEmpty(doc) {
    for (const field of fields) {
      if (typeof doc[field] === "string") {
        doc[field] = doc[field].trim();
        if (doc[field] === "") {
          doc[field] = undefined;
        }
      }
    }
  }

  schema.pre("validate", function () {
    clearEmpty(this);
  });

  schema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function () {
    const update = this.getUpdate() || {};
    const assigned = update.$set || update;

    for (const field of fields) {
      if (typeof assigned[field] === "string") {
        assigned[field] = assigned[field].trim();
        if (assigned[field] === "") {
          assigned[field] = undefined;
        }
      }
    }

    this.setOptions({ runValidators: true });
  });
}

function assertRequiredFields(payload, fields) {
  const missing = fields.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  });

  if (missing.length > 0) {
    const error = new Error(`${missing.join(", ")} cannot be empty`);
    error.statusCode = 400;
    error.errors = missing.map((field) => `${field} is required`);
    throw error;
  }
}

module.exports = {
  requiredString,
  rejectEmptyStrings,
  assertRequiredFields,
};
