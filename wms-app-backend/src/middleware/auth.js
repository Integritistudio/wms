const { verifyToken } = require("../utils/jwt");

async function authenticate(request, reply) {
  const header = request.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return reply.error({
      message: "Unauthorized",
      statusCode: 401,
    });
  }

  try {
    request.user = verifyToken(header.slice(7));
  } catch (error) {
    request.log.warn({ err: error }, "Invalid auth token");
    return reply.error({
      message: "Unauthorized",
      statusCode: 401,
    });
  }
}

function requireAudience(audience) {
  return async function requireAudienceHandler(request, reply) {
    await authenticate(request, reply);
    if (reply.sent) {
      return;
    }

    if (request.user?.aud !== audience) {
      return reply.error({
        message: "Forbidden",
        statusCode: 403,
      });
    }
  };
}

module.exports = {
  authenticate,
  requireAudience,
};
