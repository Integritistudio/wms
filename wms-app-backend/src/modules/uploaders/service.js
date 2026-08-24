const bcrypt = require("bcrypt");
const Uploader = require("./model");
const shops = require("../shops");
const orders = require("../orders");
const shopify = require("../shopify");
const platformRateLimit = require("../platform/rateLimit");
const { signToken, AUDIENCE } = require("../../utils/jwt");
const { assertRequiredFields } = require("../../utils/validators");
const { httpError } = require("../../utils/httpError");

async function create({ username, password, shopId }) {
  assertRequiredFields({ username, password, shopId }, ["username", "password", "shopId"]);
  await shops.getById(shopId);

  const existing = await Uploader.findOne({ username: String(username).trim().toLowerCase() });
  if (existing) {
    throw httpError(409, "Uploader already exists");
  }

  const hashed = await bcrypt.hash(password, 10);
  const uploader = await Uploader.create({
    username: String(username).trim().toLowerCase(),
    password: hashed,
    shopIds: [shopId],
    isActive: true,
  });

  return uploader.toPublic();
}

async function listByShop(shopId) {
  const records = await Uploader.find({ shopIds: shopId }).sort({ createdAt: -1 });
  return records.map((item) => item.toPublic());
}

async function login(request, { username, password }) {
  const limited = platformRateLimit.hit(request);
  if (!limited.ok) {
    throw httpError(429, "Too many login attempts. Try again later.");
  }

  assertRequiredFields({ username, password }, ["username", "password"]);
  const uploader = await Uploader.findOne({
    username: String(username).trim().toLowerCase(),
  });

  if (!uploader || !uploader.isActive) {
    throw httpError(401, "Invalid credentials");
  }

  const matches = await bcrypt.compare(password, uploader.password);
  if (!matches) {
    throw httpError(401, "Invalid credentials");
  }

  platformRateLimit.clear(request);

  return {
    token: signToken(
      {
        sub: uploader._id.toString(),
        username: uploader.username,
        shopIds: uploader.shopIds.map((id) => id.toString()),
      },
      { audience: AUDIENCE.uploader }
    ),
    user: uploader.toPublic(),
  };
}

async function assignedOrders(uploaderId, query = {}) {
  const uploader = await Uploader.findById(uploaderId);
  if (!uploader) {
    throw httpError(404, "Uploader not found");
  }
  return orders.listForShops(uploader.shopIds, query);
}

function assertShopAccess(user, shopId) {
  const allowed = (user.shopIds || []).map(String);
  if (!allowed.includes(String(shopId))) {
    throw httpError(403, "Forbidden");
  }
}

async function upload945({ user, orderId, body, fileName }) {
  const order = await orders.getById(orderId);
  assertShopAccess(user, order.shopId);
  const shop = await shops.getById(order.shopId);
  return orders.apply945({
    order,
    shop,
    body,
    fileName,
    fulfill: shopify.fulfillOrder,
  });
}

module.exports = {
  create,
  listByShop,
  login,
  assignedOrders,
  upload945,
  assertShopAccess,
};
