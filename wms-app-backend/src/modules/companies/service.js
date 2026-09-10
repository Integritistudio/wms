const bcrypt = require("bcrypt");
const Company = require("./model");
const CompanyMember = require("./memberModel");
const Warehouse = require("./warehouseModel");
const SftpConnection = require("./sftpConnectionModel");
const shops = require("../shops");
const members = require("./members");
const sftp = require("./sftp");
const { encrypt } = require("../../utils/secret");
const { assertRequiredFields } = require("../../utils/validators");
const { httpError } = require("../../utils/httpError");
const platformRateLimit = require("../platform/rateLimit");
const env = require("../../config/env");
const logger = require("../../config/logger");

function tenantId(user) {
  return user?.companyId || user?.sub;
}

function isRoot(user) {
  return !user?.role || user.role === "root";
}

function hasPermission(user, moduleName) {
  if (!user) return false;
  if (isRoot(user)) return true;
  if (moduleName === "analytics" && user.permissions?.analytics === undefined) {
    return Boolean(user.permissions?.orders);
  }
  return Boolean(user.permissions?.[moduleName]);
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
  const inviteUrl =
    invite.email.sent && env.isProduction ? undefined : invite.url;
  return {
    company: company.toPublic(),
    inviteSent: invite.email.sent,
    inviteUrl,
  };
}

async function signup(payload = {}) {
  assertRequiredFields(payload, ["name", "email", "password"]);
  const email = String(payload.email).trim().toLowerCase();
  const name = String(payload.name).trim();
  const password = String(payload.password);
  if (password.length < 8) {
    throw httpError(400, "Password must be at least 8 characters");
  }

  const existing = await Company.findOne({ email });
  if (existing) {
    throw httpError(409, "A company with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const company = await Company.create({
    name,
    email,
    phone: String(payload.phone || "").trim(),
    notes: String(payload.notes || "").trim(),
    password: hashedPassword,
    status: "pending",
  });

  const rootMember = await CompanyMember.create({
    companyId: company._id,
    name: String(payload.contactName || payload.name).trim(),
    email,
    role: "root",
    password: hashedPassword,
    status: "pending",
    warehouseIds: [],
    permissions: members.normalizePermissions("root"),
  });

  return {
    company: company.toPublic(),
    message:
      "Company registration submitted. Your account is pending Admin approval.",
  };
}

async function update(id, payload = {}) {
  const company = await getById(id);
  if (payload.name) company.name = String(payload.name).trim();
  if (payload.email) {
    const email = String(payload.email).trim().toLowerCase();
    const existing = await Company.findOne({
      email,
      _id: { $ne: company._id },
    });
    if (existing)
      throw httpError(409, "Another company with this email already exists");
    company.email = email;
  }
  if (payload.phone !== undefined)
    company.phone = String(payload.phone || "").trim();
  if (payload.notes !== undefined)
    company.notes = String(payload.notes || "").trim();
  if (
    payload.status &&
    ["invited", "pending", "active", "rejected", "disabled"].includes(
      payload.status,
    )
  ) {
    company.status = payload.status;
  }
  await company.save();
  // If the company was set to active, ensure the root member is also activated.
  if (payload.status === "active") {
    const rootMember = await members.ensureRootMember(company);
    rootMember.status = "active";
    await rootMember.save();
  }
  return company.toPublic();
}

async function softDelete(id) {
  const company = await getById(id);
  company.isDeleted = true;
  company.deletedAt = new Date();
  company.status = "disabled";
  await company.save();
  await CompanyMember.updateMany(
    { companyId: company._id },
    { $set: { status: "disabled" } },
  );
  return company.toPublic();
}

async function restore(id) {
  const company = await Company.findById(id);
  if (!company) throw httpError(404, "Company not found");
  company.isDeleted = false;
  company.deletedAt = null;
  company.status = company.password ? "active" : "invited";
  await company.save();
  await CompanyMember.updateMany(
    { companyId: company._id, password: { $ne: null } },
    { $set: { status: "active" } },
  );
  return company.toPublic();
}

async function approve(id) {
  const company = await getById(id);
  company.status = "active";
  company.rejectionReason = "";
  await company.save();

  const rootMember = await members.ensureRootMember(company);
  rootMember.status = "active";
  await rootMember.save();

  const { sendMail } = require("../../utils/mail");
  try {
    await sendMail({
      to: company.email,
      subject: `Your company account for ${company.name} is approved!`,
      text: `Congratulations! Your company account for ${company.name} has been approved by the Administrator. You can now sign in at ${env.publicAppUrl}/account/login`,
      html: `<p>Congratulations!</p><p>Your company account for <strong>${company.name}</strong> has been approved by the Administrator.</p><p><a href="${env.publicAppUrl}/account/login">Sign in to your account</a></p>`,
    });
  } catch (err) {
    logger.warn({ err, email: company.email }, "Failed to send approval email");
  }

  return company.toPublic();
}

async function reject(id, reason = "") {
  const company = await getById(id);
  company.status = "rejected";
  company.rejectionReason = String(reason || "").trim();
  await company.save();

  const rootMember = await members.ensureRootMember(company);
  rootMember.status = "disabled";
  await rootMember.save();

  const { sendMail } = require("../../utils/mail");
  const reasonText = company.rejectionReason
    ? `\nReason: ${company.rejectionReason}`
    : "";
  const reasonHtml = company.rejectionReason
    ? `<p><strong>Reason:</strong> ${company.rejectionReason}</p>`
    : "";
  try {
    await sendMail({
      to: company.email,
      subject: `Update regarding your company application for ${company.name}`,
      text: `Your company registration for ${company.name} was not approved.${reasonText}\nPlease contact support for details.`,
      html: `<p>Your company registration for <strong>${company.name}</strong> was not approved.</p>${reasonHtml}<p>Please contact support for details.</p>`,
    });
  } catch (err) {
    logger.warn(
      { err, email: company.email },
      "Failed to send rejection email",
    );
  }

  return company.toPublic();
}

async function list(filterParams = {}) {
  const filter = {};
  if (
    filterParams.includeDeleted === "true" ||
    filterParams.includeDeleted === true
  ) {
    if (
      filterParams.onlyDeleted === "true" ||
      filterParams.onlyDeleted === true
    ) {
      filter.isDeleted = true;
    }
  } else {
    filter.isDeleted = { $ne: true };
  }

  if (filterParams.status && filterParams.status !== "all") {
    filter.status = filterParams.status;
  }

  const companies = await Company.find(filter).sort({ createdAt: -1 });
  const ids = companies.map((item) => item._id);
  const [shopCounts, warehouseCounts] = await Promise.all([
    shops.countByCompanyIds(ids),
    Warehouse.aggregate([
      { $match: { companyId: { $in: ids } } },
      { $group: { _id: "$companyId", count: { $sum: 1 } } },
    ]),
  ]);

  const warehousesByCompany = new Map(
    warehouseCounts.map((row) => [String(row._id), row.count]),
  );

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
  if (company.status === "disabled" || company.isDeleted) {
    throw httpError(400, "Company is disabled or deleted");
  }
  const invite = await issueInvite(company);
  const inviteUrl =
    invite.email.sent && env.isProduction ? undefined : invite.url;
  return { inviteSent: invite.email.sent, inviteUrl };
}

async function peekInvite(token) {
  assertRequiredFields({ token }, ["token"]);
  const member = await members.findByInviteToken(token);
  if (
    member &&
    member.inviteExpiresAt &&
    member.inviteExpiresAt.getTime() >= Date.now()
  ) {
    const company = await getById(member.companyId);
    return { name: company.name, email: member.email, role: member.role };
  }

  const company = await Company.findOne({
    inviteTokenHash: members.hashToken(token),
  });
  if (
    !company ||
    !company.inviteExpiresAt ||
    company.inviteExpiresAt.getTime() < Date.now()
  ) {
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

  if (
    member &&
    member.inviteExpiresAt &&
    member.inviteExpiresAt.getTime() >= Date.now()
  ) {
    company = await getById(member.companyId);
  } else {
    company = await Company.findOne({
      inviteTokenHash: members.hashToken(token),
    });
    if (
      !company ||
      !company.inviteExpiresAt ||
      company.inviteExpiresAt.getTime() < Date.now()
    ) {
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

async function login(request, { email, password, expectedRole }) {
  const limited = platformRateLimit.hit(request);
  if (!limited.ok) {
    throw httpError(429, "Too many login attempts. Try again later.");
  }

  assertRequiredFields({ email, password }, ["email", "password"]);
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

  if (!company || !member || !member.password) {
    throw httpError(401, "Invalid credentials");
  }

  if (company.isDeleted) {
    throw httpError(401, "Company account not found or deleted");
  }

  // Deny login if the company itself is disabled regardless of member state
  if (company.status === "disabled") {
    throw httpError(403, "Company account is disabled");
  }

  if (company.status === "pending" || member.status === "pending") {
    throw httpError(403, "Your company account is pending Admin approval");
  }

  if (company.status === "rejected") {
    throw httpError(
      403,
      company.rejectionReason
        ? `Your company registration was rejected: ${company.rejectionReason}`
        : "Your company registration was rejected",
    );
  }

  if (company.status === "disabled" || member.status === "disabled") {
    throw httpError(403, "This account is disabled");
  }

  const matches = await bcrypt.compare(password, member.password);
  if (!matches) {
    throw httpError(401, "Invalid credentials");
  }

  if (expectedRole) {
    const roleMatch =
      (expectedRole === "root" && member.role === "root") ||
      (expectedRole === "member" && member.role === "member") ||
      (expectedRole === "warehouse" && member.role === "warehouse");
    if (!roleMatch) {
      const expectedLabel =
        expectedRole === "root"
          ? "Company root"
          : expectedRole === "warehouse"
            ? "Warehouse user"
            : "Company user";
      const actualLabel =
        member.role === "root"
          ? "Company root"
          : member.role === "warehouse"
            ? "Warehouse user"
            : "Company user";
      throw httpError(400, `Invalid Credentials.`);
    }
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

  if (
    member &&
    company &&
    !company.isDeleted &&
    company.status !== "disabled" &&
    member.status !== "disabled"
  ) {
    const reset = await members.issueReset(member, company);
    return {
      sent: reset.email.sent,
      resetUrl: reset.email.sent ? undefined : reset.url,
    };
  }

  return { sent: true };
}

async function resetPassword({ token, password }) {
  assertRequiredFields({ token, password }, ["token", "password"]);
  if (String(password).length < 8) {
    throw httpError(400, "Password must be at least 8 characters");
  }

  const member = await members.findByResetToken(token);
  if (
    !member ||
    !member.resetExpiresAt ||
    member.resetExpiresAt.getTime() < Date.now()
  ) {
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

async function addWarehouse(companyId, payload = {}) {
  const company = await getById(companyId);
  assertRequiredFields(payload, ["name"]);

  await assertWarehouseLocation(payload);

  const address = composeWarehouseAddress(payload);
  const connectionId = await resolveConnectionId(
    companyId,
    payload.sftpConnectionId,
  );

  const warehouse = new Warehouse({
    companyId: company._id,
    name: String(payload.name).trim(),
    code: String(payload.code || "").trim(),
    address,
    sftpConnectionId: connectionId,
    routingPriority: Number(payload.routingPriority) || 10,
    minStockThreshold: Math.max(0, Number(payload.minStockThreshold) || 0),
    zipPrefixes: normalizeZipPrefixes(payload.zipPrefixes || payload.zip),
    latitude: payload.latitude ? Number(payload.latitude) : null,
    longitude: payload.longitude ? Number(payload.longitude) : null,
  });

  await warehouse.save();
  await maybeGeocodeWarehouse(warehouse);
  return warehouse.toPublic();
}

async function updateWarehouse(companyId, id, payload = {}) {
  const warehouse = await Warehouse.findOne({ _id: id, companyId });
  if (!warehouse) {
    throw httpError(404, "Warehouse not found");
  }

  if (payload.name !== undefined) {
    warehouse.name = String(payload.name).trim();
  }
  if (payload.code !== undefined) {
    warehouse.code = String(payload.code).trim();
  }
  if (
    payload.address !== undefined ||
    payload.street !== undefined ||
    payload.city !== undefined ||
    payload.state !== undefined ||
    payload.country !== undefined
  ) {
    await assertWarehouseLocation({ ...payload, requireCountry: false });
    warehouse.address = composeWarehouseAddress(payload);
  }
  if (payload.sftpConnectionId !== undefined) {
    warehouse.sftpConnectionId = await resolveConnectionId(
      companyId,
      payload.sftpConnectionId,
    );
  }
  if (payload.enforceFefo !== undefined) {
    warehouse.enforceFefo = Boolean(payload.enforceFefo);
  }
  if (payload.routingPriority !== undefined) {
    warehouse.routingPriority = Number(payload.routingPriority) || 10;
  }
  if (payload.minStockThreshold !== undefined) {
    warehouse.minStockThreshold = Math.max(
      0,
      Number(payload.minStockThreshold) || 0,
    );
  }
  if (payload.zipPrefixes !== undefined) {
    warehouse.zipPrefixes = normalizeZipPrefixes(payload.zipPrefixes);
  } else if (payload.zip !== undefined) {
    warehouse.zipPrefixes = normalizeZipPrefixes(payload.zip);
  }
  if (payload.latitude !== undefined) {
    warehouse.latitude =
      payload.latitude === null || payload.latitude === ""
        ? null
        : Number(payload.latitude);
  }
  if (payload.longitude !== undefined) {
    warehouse.longitude =
      payload.longitude === null || payload.longitude === ""
        ? null
        : Number(payload.longitude);
  }
  if (payload.fulfillmentMode !== undefined) {
    warehouse.fulfillmentMode = payload.fulfillmentMode === "modernwms" ? "modernwms" : "sftp_edi";
  }
  await warehouse.save();
  if (
    payload.address !== undefined ||
    payload.street !== undefined ||
    payload.zip !== undefined ||
    payload.geocode === true
  ) {
    await maybeGeocodeWarehouse(warehouse);
  }
  return warehouse.toPublic();
}

async function assertWarehouseLocation(payload = {}) {
  const Country = require("../../models/country");
  const State = require("../../models/state");
  const { assertPostalCode } = require("../../utils/postalCode");

  const countryIso = String(payload.country || "")
    .trim()
    .toUpperCase();
  const stateIso = String(payload.state || "")
    .trim()
    .toUpperCase();
  const zip = String(payload.zip || payload.zipPrefixes || "").trim();
  if (payload.requireCountry === false && !countryIso && !zip) {
    return;
  }
  if (!countryIso) {
    throw httpError(400, "Country is required");
  }

  const country = await Country.findOne({ isoCode: countryIso });
  if (!country) {
    throw httpError(400, `Country ${countryIso} is not in the location list`);
  }

  const states = await State.find({ countryIsoCode: countryIso })
    .select("isoCode")
    .lean();
  if (states.length) {
    if (!stateIso) {
      throw httpError(400, `State / province is required for ${countryIso}`);
    }
    if (!states.some((row) => String(row.isoCode).toUpperCase() === stateIso)) {
      throw httpError(400, `State ${stateIso} is not valid for ${countryIso}`);
    }
  }

  const zipValue = Array.isArray(payload.zipPrefixes)
    ? payload.zipPrefixes[0]
    : zip.split(",")[0];
  assertPostalCode(countryIso, stateIso, zipValue);
}

function normalizeZipPrefixes(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function composeWarehouseAddress(payload) {
  if (
    payload.street ||
    payload.city ||
    payload.state ||
    payload.zip ||
    payload.country
  ) {
    return [
      payload.street,
      payload.city,
      payload.state,
      payload.zip,
      payload.country,
    ]
      .map((p) => String(p || "").trim())
      .filter(Boolean)
      .join(", ");
  }
  return String(payload.address || "").trim();
}

async function maybeGeocodeWarehouse(warehouse) {
  if (!warehouse.address) return warehouse;
  try {
    const mapbox = require("../routing/mapbox");
    const geo = await mapbox.geocode(warehouse.address);
    if (geo) {
      warehouse.latitude = geo.lat;
      warehouse.longitude = geo.lng;
      warehouse.geoPlaceName = geo.placeName || "";
      if (geo.zip) {
        const prefixes = warehouse.zipPrefixes || [];
        if (
          !prefixes.some(
            (p) => String(p).toUpperCase() === String(geo.zip).toUpperCase(),
          )
        ) {
          warehouse.zipPrefixes = [...prefixes, geo.zip];
        }
      }
      await warehouse.save();
    }
  } catch {
    /* best effort */
  }
  return warehouse;
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

async function listOrdersForUser(user, query = {}) {
  const companyId = tenantId(user);
  const shopList = await shops.listByCompany(companyId);
  const shopIds = shopList.map((shop) => shop.id);
  const orders = require("../orders");
  if (user.role === "warehouse") {
    return orders.listAssignedToWarehouses(
      shopIds,
      user.warehouseIds || [],
      query,
    );
  }
  return orders.listForShops(shopIds, query);
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
  const existing = await SftpConnection.countDocuments({
    companyId: company._id,
  });
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
    {
      companyId: company._id,
      $or: [
        { sftpConnectionId: null },
        { sftpConnectionId: { $exists: false } },
      ],
    },
    { $set: { sftpConnectionId: connection._id } },
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
  const connection = await SftpConnection.findOne({
    _id: connectionId,
    companyId,
  });
  if (!connection) {
    throw httpError(404, "SFTP connection not found");
  }
  applySftpFields(connection, payload);
  await connection.save();
  return connection.toPublic();
}

async function testSftpConnection(companyId, connectionId) {
  const connection = await SftpConnection.findOne({
    _id: connectionId,
    companyId,
  });
  if (!connection) {
    throw httpError(404, "SFTP connection not found");
  }
  await sftp.testConnection(connection);
  return { ok: true };
}

async function updateSftp(companyId, payload = {}) {
  const company = await getById(companyId);
  await migrateCompanySftp(company);
  let connection = await SftpConnection.findOne({ companyId }).sort({
    createdAt: 1,
  });
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
  const connection = await SftpConnection.findOne({ companyId }).sort({
    createdAt: 1,
  });
  if (!connection) {
    throw httpError(400, "No SFTP connection saved yet");
  }
  await sftp.testConnection(connection);
  return { ok: true };
}

const ACCENT_IDS = new Set([
  "blue",
  "teal",
  "indigo",
  "emerald",
  "violet",
  "rose",
  "amber",
  "slate",
  "custom",
]);

function normalizeAppearance(payload = {}) {
  const accentId = String(payload.accentId || "blue");
  if (!ACCENT_IDS.has(accentId)) {
    throw httpError(400, "Invalid accent color");
  }
  let customAccent = String(payload.customAccent || "#2563eb").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(customAccent)) {
    throw httpError(400, "Custom accent must be a hex color like #2563eb");
  }
  return { accentId, customAccent };
}

async function getAppearance(companyId) {
  const company = await getById(companyId);
  return {
    accentId: company.appearance?.accentId || "blue",
    customAccent: company.appearance?.customAccent || "#2563eb",
  };
}

async function updateAppearance(companyId, payload = {}) {
  const company = await getById(companyId);
  const next = normalizeAppearance(payload);
  company.appearance = next;
  await company.save();
  return {
    accentId: company.appearance.accentId,
    customAccent: company.appearance.customAccent,
  };
}

module.exports = {
  tenantId,
  isRoot,
  hasPermission,
  create,
  signup,
  update,
  softDelete,
  restore,
  approve,
  reject,
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
  getAppearance,
  updateAppearance,
  members,
};
