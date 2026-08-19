const bcrypt = require("bcrypt");
const Company = require("./model");
const Warehouse = require("./warehouseModel");
const SftpConnection = require("./sftpConnectionModel");
const shops = require("../shops");
const members = require("./members");
const sftp = require("./sftp");
const { encrypt } = require("../../utils/secret");
const { assertRequiredFields } = require("../../utils/validators");
const { httpError } = require("../../utils/httpError");
const platformRateLimit = require("../platform/rateLimit");

function tenantId(user) {
  return user?.companyId || user?.sub;
}

function isRoot(user) {
  return !user?.role || user.role === "root";
}

async function issueInvite(company) {
  const member = await members.ensureRootMember(company);
  const invite = await members.issueInvite(member, company);
  company.inviteTokenHash = member.inviteTokenHash;
  company.inviteExpiresAt = member.inviteExpiresAt;
  company.status = company.password ? company.status : "invited";
  await company.save();
  return invite;
}

async function create(payload) {
  assertRequiredFields(payload || {}, ["name", "email"]);
  const email = String(payload.email).trim().toLowerCase();

  const existing = await Company.findOne({ email });
  if (existing) {
    throw httpError(409, "A company with this email already exists");
  }

  const company = await Company.create({
    name: String(payload.name).trim(),
    email,
    phone: String(payload.phone || "").trim(),
    notes: String(payload.notes || "").trim(),
    status: "invited",
  });

  const invite = await issueInvite(company);
  return { company: company.toPublic(), inviteSent: invite.email.sent, inviteUrl: invite.email.sent ? undefined : invite.url };
}

async function list() {
  const companies = await Company.find().sort({ createdAt: -1 });
  const ids = companies.map((item) => item._id);
  const [shopCounts, warehouseCounts] = await Promise.all([
    shops.countByCompanyIds(ids),
    Warehouse.aggregate([
      { $match: { companyId: { $in: ids } } },
      { $group: { _id: "$companyId", count: { $sum: 1 } } },
    ]),
  ]);

  const warehousesByCompany = new Map(warehouseCounts.map((row) => [String(row._id), row.count]));

  return companies.map((company) => ({
    ...company.toPublic(),
    shopCount: shopCounts.get(company._id.toString()) || 0,
    warehouseCount: warehousesByCompany.get(company._id.toString()) || 0,
  }));
}

async function getById(id) {
  const company = await Company.findById(id);
  if (!company) {
    throw httpError(404, "Company not found");
  }
  return company;
}

async function getDetail(id) {
  const company = await getById(id);
  await migrateCompanySftp(company);
  const [shopList, warehouseList, connections] = await Promise.all([
    shops.listByCompany(id),
    Warehouse.find({ companyId: id }).sort({ createdAt: -1 }),
    SftpConnection.find({ companyId: id }).sort({ createdAt: -1 }),
  ]);

  return {
    ...company.toPublic(),
    shops: shopList,
    warehouses: warehouseList.map((item) => item.toPublic()),
    sftpConnections: connections.map((item) => item.toPublic()),
  };
}

async function resendInvite(id) {
  const company = await getById(id);
  if (company.status === "disabled") {
    throw httpError(400, "Company is disabled");
  }
  const invite = await issueInvite(company);
  return { inviteSent: invite.email.sent, inviteUrl: invite.email.sent ? undefined : invite.url };
}

async function peekInvite(token) {
  assertRequiredFields({ token }, ["token"]);
  const member = await members.findByInviteToken(token);
  if (member && member.inviteExpiresAt && member.inviteExpiresAt.getTime() >= Date.now()) {
    const company = await getById(member.companyId);
    return { name: company.name, email: member.email, role: member.role };
  }

  const company = await Company.findOne({ inviteTokenHash: members.hashToken(token) });
  if (!company || !company.inviteExpiresAt || company.inviteExpiresAt.getTime() < Date.now()) {
    throw httpError(400, "Invite link is invalid or expired");
  }

  return { name: company.name, email: company.email, role: "root" };
}

async function setPassword({ token, password }) {
  assertRequiredFields({ token, password }, ["token", "password"]);
  if (String(password).length < 8) {
    throw httpError(400, "Password must be at least 8 characters");
  }

  let member = await members.findByInviteToken(token);
  let company;

  if (member && member.inviteExpiresAt && member.inviteExpiresAt.getTime() >= Date.now()) {
    company = await getById(member.companyId);
  } else {
    company = await Company.findOne({ inviteTokenHash: members.hashToken(token) });
    if (!company || !company.inviteExpiresAt || company.inviteExpiresAt.getTime() < Date.now()) {
      throw httpError(400, "Invite link is invalid or expired");
    }
    member = await members.ensureRootMember(company);
  }

  const hashed = await bcrypt.hash(password, 10);
  member.password = hashed;
  member.inviteTokenHash = null;
  member.inviteExpiresAt = null;
  member.status = "active";
  await member.save();

  if (member.role === "root") {
    company.password = hashed;
    company.inviteTokenHash = null;
    company.inviteExpiresAt = null;
    company.status = "active";
    await company.save();
  }

  return members.authPayload(member, company);
}

async function login(request, { email, password }) {
  const limited = platformRateLimit.hit(request);
  if (!limited.ok) {
    throw httpError(429, "Too many login attempts. Try again later.");
  }

  assertRequiredFields({ email, password }, ["email", "password"]);
  const normalized = String(email).trim().toLowerCase();
  let member = await members.findByEmail(normalized);
  let company;

  if (member) {
    company = await getById(member.companyId);
  } else {
    company = await Company.findOne({ email: normalized });
    if (company) {
      member = await members.ensureRootMember(company);
    }
  }

  if (!company || company.status === "disabled" || !member || member.status === "disabled" || !member.password) {
    throw httpError(401, "Invalid credentials");
  }

  const matches = await bcrypt.compare(password, member.password);
  if (!matches) {
    throw httpError(401, "Invalid credentials");
  }

  platformRateLimit.clear(request);
  return members.authPayload(member, company);
}

async function sessionFor(user) {
  const companyId = tenantId(user);
  const company = await getDetail(companyId);
  let current = null;
  if (user.companyId) {
    const member = await members.getById(companyId, user.sub);
    current = member.toPublic();
  } else {
    const root = await members.ensureRootMember(await getById(companyId));
    current = root.toPublic();
  }
  return { company, user: current };
}

async function forgotPassword(request, { email }) {
  const limited = platformRateLimit.hit(request);
  if (!limited.ok) {
    throw httpError(429, "Too many attempts. Try again later.");
  }

  assertRequiredFields({ email }, ["email"]);
  const normalized = String(email).trim().toLowerCase();
  let member = await members.findByEmail(normalized);
  let company;
  if (member) {
    company = await Company.findById(member.companyId);
  } else {
    company = await Company.findOne({ email: normalized });
    if (company) {
      member = await members.ensureRootMember(company);
    }
  }

  if (member && company && company.status !== "disabled" && member.status !== "disabled") {
    const reset = await members.issueReset(member, company);
    return { sent: reset.email.sent, resetUrl: reset.email.sent ? undefined : reset.url };
  }

  return { sent: true };
}

async function resetPassword({ token, password }) {
  assertRequiredFields({ token, password }, ["token", "password"]);
  if (String(password).length < 8) {
    throw httpError(400, "Password must be at least 8 characters");
  }

  const member = await members.findByResetToken(token);
  if (!member || !member.resetExpiresAt || member.resetExpiresAt.getTime() < Date.now()) {
    throw httpError(400, "Reset link is invalid or expired");
  }

  const company = await getById(member.companyId);
  const hashed = await bcrypt.hash(password, 10);
  member.password = hashed;
  member.resetTokenHash = null;
  member.resetExpiresAt = null;
  member.status = "active";
  await member.save();

  if (member.role === "root") {
    company.password = hashed;
    company.status = "active";
    await company.save();
  }

  return members.authPayload(member, company);
}

async function addWarehouse(companyId, payload) {
  await getById(companyId);
  assertRequiredFields(payload || {}, ["name"]);
  const sftpConnectionId = await resolveConnectionId(companyId, payload.sftpConnectionId);
  const warehouse = await Warehouse.create({
    companyId,
    name: String(payload.name).trim(),
    code: String(payload.code || "").trim(),
    address: String(payload.address || "").trim(),
    sftpConnectionId,
    isActive: payload.isActive !== false,
  });
  return warehouse.toPublic();
}

async function updateWarehouse(companyId, warehouseId, payload = {}) {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, companyId });
  if (!warehouse) {
    throw httpError(404, "Warehouse not found");
  }
  if (payload.name !== undefined) {
    warehouse.name = String(payload.name).trim();
  }
  if (payload.code !== undefined) {
    warehouse.code = String(payload.code).trim();
  }
  if (payload.address !== undefined) {
    warehouse.address = String(payload.address).trim();
  }
  if (payload.isActive !== undefined) {
    warehouse.isActive = Boolean(payload.isActive);
  }
  if (payload.sftpConnectionId !== undefined) {
    warehouse.sftpConnectionId = await resolveConnectionId(companyId, payload.sftpConnectionId);
  }
  await warehouse.save();
  return warehouse.toPublic();
}

async function listWarehouses(companyId) {
  const rows = await Warehouse.find({ companyId }).sort({ createdAt: -1 });
  return rows.map((item) => item.toPublic());
}

async function shopsForUser(user) {
  const companyId = tenantId(user);
  if (user.role === "warehouse") {
    return shops.listByWarehouseIds(companyId, user.warehouseIds || []);
  }
  return shops.listByCompany(companyId);
}

async function listOrdersForUser(user) {
  const companyId = tenantId(user);
  const shopList = await shops.listByCompany(companyId);
  const shopIds = shopList.map((shop) => shop.id);
  const orders = require("../orders");
  if (user.role === "warehouse") {
    return orders.listAssignedToWarehouses(shopIds, user.warehouseIds || []);
  }
  return orders.listForShops(shopIds);
}

function assertShopAccess(user, shop) {
  if (String(shop.companyId) !== String(tenantId(user))) {
    throw httpError(403, "Forbidden");
  }
}

function assertOrderAccess(user, shop, order) {
  assertShopAccess(user, shop);
  if (user.role === "warehouse") {
    const allowed = (user.warehouseIds || []).map(String);
    if (!order.warehouseId || !allowed.includes(String(order.warehouseId))) {
      throw httpError(403, "This order is not assigned to your warehouse");
    }
  }
}

async function resolveConnectionId(companyId, value) {
  if (!value) {
    return null;
  }
  const connection = await SftpConnection.findOne({ _id: value, companyId });
  if (!connection) {
    throw httpError(400, "SFTP connection not found");
  }
  return connection._id;
}

async function migrateCompanySftp(company) {
  const existing = await SftpConnection.countDocuments({ companyId: company._id });
  if (existing > 0 || !company.sftp?.host) {
    return;
  }

  const connection = await SftpConnection.create({
    companyId: company._id,
    name: "Default",
    enabled: Boolean(company.sftp.enabled),
    host: company.sftp.host || "",
    port: company.sftp.port || 22,
    username: company.sftp.username || "",
    passwordEncrypted: company.sftp.passwordEncrypted || "",
    remotePath: company.sftp.remotePath || "/inbound/940",
  });

  await Warehouse.updateMany(
    { companyId: company._id, $or: [{ sftpConnectionId: null }, { sftpConnectionId: { $exists: false } }] },
    { $set: { sftpConnectionId: connection._id } }
  );
}

function applySftpFields(connection, payload = {}) {
  if (payload.name !== undefined) {
    connection.name = String(payload.name).trim();
  }
  if (payload.enabled !== undefined) {
    connection.enabled = Boolean(payload.enabled);
  }
  if (payload.host !== undefined) {
    connection.host = String(payload.host).trim();
  }
  if (payload.port !== undefined) {
    connection.port = Number(payload.port || 22);
  }
  if (payload.username !== undefined) {
    connection.username = String(payload.username).trim();
  }
  if (payload.remotePath !== undefined) {
    connection.remotePath = String(payload.remotePath || "/inbound/940").trim();
  }
  if (payload.password) {
    connection.passwordEncrypted = encrypt(String(payload.password));
  }
}

async function listSftpConnections(companyId) {
  const company = await getById(companyId);
  await migrateCompanySftp(company);
  const rows = await SftpConnection.find({ companyId }).sort({ createdAt: -1 });
  return rows.map((item) => item.toPublic());
}

async function createSftpConnection(companyId, payload = {}) {
  await getById(companyId);
  assertRequiredFields(payload, ["name", "host", "username"]);
  const connection = new SftpConnection({
    companyId,
    name: String(payload.name).trim(),
    remotePath: "/inbound/940",
  });
  applySftpFields(connection, payload);
  await connection.save();
  return connection.toPublic();
}

async function updateSftpConnection(companyId, connectionId, payload = {}) {
  const connection = await SftpConnection.findOne({ _id: connectionId, companyId });
  if (!connection) {
    throw httpError(404, "SFTP connection not found");
  }
  applySftpFields(connection, payload);
  await connection.save();
  return connection.toPublic();
}

async function testSftpConnection(companyId, connectionId) {
  const connection = await SftpConnection.findOne({ _id: connectionId, companyId });
  if (!connection) {
    throw httpError(404, "SFTP connection not found");
  }
  await sftp.testConnection(connection);
  return { ok: true };
}

async function updateSftp(companyId, payload = {}) {
  const company = await getById(companyId);
  await migrateCompanySftp(company);
  let connection = await SftpConnection.findOne({ companyId }).sort({ createdAt: 1 });
  if (!connection) {
    connection = new SftpConnection({
      companyId,
      name: payload.name || "Default",
      remotePath: "/inbound/940",
    });
  }
  applySftpFields(connection, { name: connection.name, ...payload });
  await connection.save();
  return connection.toPublic();
}

async function testSftp(companyId) {
  const company = await getById(companyId);
  await migrateCompanySftp(company);
  const connection = await SftpConnection.findOne({ companyId }).sort({ createdAt: 1 });
  if (!connection) {
    throw httpError(400, "No SFTP connection saved yet");
  }
  await sftp.testConnection(connection);
  return { ok: true };
}

module.exports = {
  tenantId,
  isRoot,
  create,
  list,
  getById,
  getDetail,
  resendInvite,
  peekInvite,
  setPassword,
  login,
  sessionFor,
  forgotPassword,
  resetPassword,
  addWarehouse,
  updateWarehouse,
  listWarehouses,
  shopsForUser,
  listOrdersForUser,
  assertShopAccess,
  assertOrderAccess,
  listSftpConnections,
  createSftpConnection,
  updateSftpConnection,
  testSftpConnection,
  updateSftp,
  testSftp,
  members,
};
