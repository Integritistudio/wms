function apiResponseSchema(dataSchema) {
  return {
    type: "object",
    properties: {
      success: { type: "boolean" },
      message: { type: "string" },
      data: dataSchema,
      errors: {
        anyOf: [
          { type: "null" },
          {
            type: "array",
            items: {},
          },
        ],
      },
      meta: {
        type: "object",
        properties: {
          timestamp: { type: "string", format: "date-time" },
        },
      },
    },
  };
}

module.exports = {
  apiResponseSchema,
};
