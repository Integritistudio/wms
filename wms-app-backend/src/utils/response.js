function buildResponse({ success, message, data = null, errors = null, meta = {} }) {
  return {
    success,
    message,
    data,
    errors,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

function sendSuccess(reply, { message = "Success", data = null, statusCode = 200, meta } = {}) {
  return reply.status(statusCode).send(
    buildResponse({
      success: true,
      message,
      data,
      errors: null,
      meta,
    })
  );
}

function sendError(reply, { message = "Something went wrong", errors = null, statusCode = 500, data = null, meta } = {}) {
  return reply.status(statusCode).send(
    buildResponse({
      success: false,
      message,
      data,
      errors,
      meta,
    })
  );
}

module.exports = {
  buildResponse,
  sendSuccess,
  sendError,
};
