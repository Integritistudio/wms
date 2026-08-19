const jwt = require("jsonwebtoken");
const env = require("../config/env");

const AUDIENCE = {
  company: "company",
  platformAdmin: "platform_admin",
  uploader: "uploader",
};

function signToken(payload, options = {}) {
  const signOptions = {
    expiresIn: env.jwtExpiresIn,
  };

  if (options.audience) {
    signOptions.audience = options.audience;
  }

  return jwt.sign(payload, env.jwtSecret, signOptions);
}

function verifyToken(token, options = {}) {
  const verifyOptions = {};

  if (options.audience) {
    verifyOptions.audience = options.audience;
  }

  return jwt.verify(token, env.jwtSecret, verifyOptions);
}

module.exports = {
  AUDIENCE,
  signToken,
  verifyToken,
};
