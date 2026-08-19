const bcrypt = require("bcrypt");
const env = require("../../config/env");
const logger = require("../../config/logger");
const { signToken, AUDIENCE } = require("../../utils/jwt");
const { assertRequiredFields } = require("../../utils/validators");
const { httpError } = require("../../utils/httpError");
const PlatformAdmin = require("./model");
const rateLimit = require("./rateLimit");

async function seedPlatformAdmin() {
  const username = env.platformAdminUsername;
  const existing = await PlatformAdmin.findOne({ username });

  if (existing) {
    return existing;
  }

  const password = await bcrypt.hash(env.platformAdminPassword, 10);
  const admin = await PlatformAdmin.create({
    username,
    password,
    isActive: true,
  });

  logger.info({ username }, "Seeded platform admin");
  return admin;
}

async function login(request, { username, password }) {
  const limited = rateLimit.hit(request);
  if (!limited.ok) {
    throw httpError(429, "Too many login attempts. Try again later.");
  }

  assertRequiredFields({ username, password }, ["username", "password"]);

  const admin = await PlatformAdmin.findOne({
    username: String(username).trim().toLowerCase(),
  });

  if (!admin || !admin.isActive) {
    throw httpError(401, "Invalid credentials");
  }

  const matches = await bcrypt.compare(password, admin.password);
  if (!matches) {
    throw httpError(401, "Invalid credentials");
  }

  rateLimit.clear(request);

  return {
    token: signToken({ sub: admin._id.toString(), username: admin.username }, { audience: AUDIENCE.platformAdmin }),
    user: admin.toPublic(),
  };
}

module.exports = {
  seedPlatformAdmin,
  login,
};
