const Shop = require("./model");
const Company = require("../companies/model");
const Warehouse = require("../companies/warehouseModel");
const { encrypt, decrypt } = require("../../utils/secret");
const { assertRequiredFields } = require("../../utils/validators");
const { httpError } = require("../../utils/httpError");

function normalizeShopDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

async function findByDomain(domain) {
  const shopDomain = normalizeShopDomain(domain);
  if (!shopDomain) {
    return null;
  }
  return Shop.findOne({ shopDomain });
}

function isProcessable(shop) {
  return Boolean(shop && shop.enabled && shop.installed && shop.accessTokenEncrypted);
}

function getAccessToken(shop) {
  try {
    const token = decrypt(shop.accessTokenEncrypted);
    if (!token) {
      throw new Error(clientUnauthorized(shop?.shopDomain, "Shopify access token is missing."));
    }
    return token;
  } catch (error) {
    if (error?.message && /reconnect|access token/i.test(error.message)) throw error;
    throw new Error(
      clientUnauthorized(shop?.shopDomain, "Shopify access token could not be decrypted.")
    );
  }
}

function clientUnauthorized(shopDomain, detail) {
  try {
    return require("../shopify/client").unauthorizedMessage(shopDomain, detail);
  } catch {
    return `${detail || "Shopify access token is invalid."} Reconnect the shop in Shopify Admin, then retry.`;
  }
}

async function testConnection(shopOrId) {
  const shop = shopOrId && shopOrId.shopDomain ? shopOrId : await getById(shopOrId);
  if (!isProcessable(shop)) {
    throw httpError(
      400,
      "Shop is not installed or is disabled. Open WMS Linker in Shopify Admin to connect."
    );
  }
  const { graphql } = require("../shopify/client");
  try {
    const data = await graphql(
      shop.shopDomain,
      getAccessToken(shop),
      `query { shop { name myshopifyDomain } }`
    );
    return {
      ok: true,
      shopName: data.shop?.name || shop.shopDomain,
      myshopifyDomain: data.shop?.myshopifyDomain || shop.shopDomain,
    };
  } catch (error) {
    throw httpError(400, error.message || "Shopify connection failed");
  }
}

async function create({ shopDomain, companyId, warehouseId = null, enabled = true, mappingKey = "generic" }) {
  assertRequiredFields({ shopDomain, companyId }, ["shopDomain", "companyId"]);
  const domain = normalizeShopDomain(shopDomain);
  const company = await Company.findById(companyId);
  if (!company) {
    throw httpError(404, "Company not found");
  }

  const existing = await Shop.findOne({ shopDomain: domain });
  if (existing) {
    throw httpError(409, "Shop already exists");
  }

  let resolvedWarehouseId = warehouseId || null;
  if (resolvedWarehouseId) {
    const warehouse = await Warehouse.findById(resolvedWarehouseId);
    if (!warehouse || warehouse.companyId.toString() !== company._id.toString()) {
      throw httpError(400, "Warehouse does not belong to this company");
    }
  }

  const shop = await Shop.create({
    shopDomain: domain,
    companyId: company._id,
    warehouseId: resolvedWarehouseId,
    enabled: Boolean(enabled),
    mappingKey: mappingKey || "generic",
  });

  return shop.toPublic();
}

async function list() {
  const shops = await Shop.find().sort({ createdAt: -1 }).populate("companyId", "name email");
  return shops.map((shop) => ({
    ...shop.toPublic(),
    companyName: shop.companyId?.name || null,
  }));
}

async function listByCompany(companyId) {
  const shops = await Shop.find({ companyId }).sort({ createdAt: -1 });
  return shops.map((shop) => shop.toPublic());
}

async function listByWarehouseIds(companyId, warehouseIds) {
  if (!warehouseIds?.length) {
    return [];
  }
  const shops = await Shop.find({ companyId, warehouseId: { $in: warehouseIds } }).sort({ createdAt: -1 });
  return shops.map((shop) => shop.toPublic());
}

async function countByCompanyIds(ids) {
  const rows = await Shop.aggregate([
    { $match: { companyId: { $in: ids } } },
    { $group: { _id: "$companyId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

async function getById(id) {
  const shop = await Shop.findById(id);
  if (!shop) {
    throw httpError(404, "Shop not found");
  }
  return shop;
}

async function setEnabled(id, enabled) {
  const shop = await getById(id);
  shop.enabled = Boolean(enabled);
  await shop.save();
  return shop.toPublic();
}

async function assignToCompany(id, companyId, warehouseId = null) {
  const shop = await getById(id);
  const company = await Company.findById(companyId);
  if (!company) {
    throw httpError(404, "Company not found");
  }

  let resolvedWarehouseId = warehouseId || null;
  if (resolvedWarehouseId) {
    const warehouse = await Warehouse.findById(resolvedWarehouseId);
    if (!warehouse || warehouse.companyId.toString() !== company._id.toString()) {
      throw httpError(400, "Warehouse does not belong to this company");
    }
  }

  shop.companyId = company._id;
  shop.warehouseId = resolvedWarehouseId;
  await shop.save();
  return shop.toPublic();
}

async function attachInstall({ shopDomain, accessToken, scopes }) {
  const domain = normalizeShopDomain(shopDomain);
  const shop = await Shop.findOne({ shopDomain: domain });

  if (!shop) {
    return { attached: false, reason: "not_allowlisted" };
  }

  shop.installed = true;
  shop.accessTokenEncrypted = encrypt(accessToken);
  shop.scopes = scopes || shop.scopes;
  shop.installedAt = new Date();
  shop.uninstalledAt = null;
  await shop.save();

  return { attached: true, shop: shop.toPublic() };
}

async function markUninstalled(shopDomain) {
  const shop = await findByDomain(shopDomain);
  if (!shop) {
    return { updated: false };
  }

  shop.installed = false;
  shop.accessTokenEncrypted = null;
  shop.uninstalledAt = new Date();
  await shop.save();
  return { updated: true };
}

module.exports = {
  normalizeShopDomain,
  findByDomain,
  isProcessable,
  getAccessToken,
  create,
  list,
  listByCompany,
  listByWarehouseIds,
  countByCompanyIds,
  getById,
  setEnabled,
  assignToCompany,
  attachInstall,
  markUninstalled,
  testConnection,
};
