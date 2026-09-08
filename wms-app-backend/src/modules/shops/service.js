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

function applyTokenFields(shop, { accessToken, scopes, expiresIn, refreshToken, refreshTokenExpiresIn }) {
  shop.installed = true;
  shop.accessTokenEncrypted = encrypt(accessToken);
  shop.scopes = scopes || shop.scopes;
  shop.installedAt = new Date();
  shop.uninstalledAt = null;
  shop.accessTokenExpiresAt = expiresIn
    ? new Date(Date.now() + Number(expiresIn) * 1000)
    : null;
  if (refreshToken) {
    shop.refreshTokenEncrypted = encrypt(refreshToken);
    shop.refreshTokenExpiresAt = refreshTokenExpiresIn
      ? new Date(Date.now() + Number(refreshTokenExpiresIn) * 1000)
      : null;
  }
}

async function mintAccessToken(shop) {
  const { clientCredentialsToken } = require("../shopify/client");
  const next = await clientCredentialsToken(shop.shopDomain);
  if (!next?.access_token) {
    throw new Error("Shopify client credentials did not return an access token");
  }
  applyTokenFields(shop, {
    accessToken: next.access_token,
    scopes: next.scope,
    expiresIn: next.expires_in || 86399,
    refreshToken: next.refresh_token,
    refreshTokenExpiresIn: next.refresh_token_expires_in,
  });
  await shop.save();
  return next.access_token;
}

async function ensureFreshAccessToken(shop) {
  const expiresAt = shop.accessTokenExpiresAt ? new Date(shop.accessTokenExpiresAt).getTime() : 0;
  const needsRefresh = Boolean(expiresAt && expiresAt - Date.now() < 120000 && shop.refreshTokenEncrypted);
  if (needsRefresh) {
    try {
      const { refreshOfflineToken } = require("../shopify/client");
      const next = await refreshOfflineToken({
        shop: shop.shopDomain,
        refreshToken: decrypt(shop.refreshTokenEncrypted),
      });
      applyTokenFields(shop, {
        accessToken: next.access_token,
        scopes: next.scope || shop.scopes,
        expiresIn: next.expires_in,
        refreshToken: next.refresh_token,
        refreshTokenExpiresIn: next.refresh_token_expires_in,
      });
      await shop.save();
      return next.access_token;
    } catch {
      return mintAccessToken(shop);
    }
  }

  if (!shop.accessTokenEncrypted) {
    return mintAccessToken(shop);
  }

  return getAccessToken(shop);
}

async function shopifyGraphql(shop, query, variables = {}) {
  const { graphql } = require("../shopify/client");
  let token = await ensureFreshAccessToken(shop);
  try {
    return await graphql(shop.shopDomain, token, query, variables);
  } catch (error) {
    const unauthorized = error.statusCode === 401 || error.code === "SHOPIFY_UNAUTHORIZED";
    if (!unauthorized) throw error;
    try {
      token = await mintAccessToken(shop);
    } catch (mintError) {
      const extra = mintError.message || String(mintError);
      error.message = `${error.message} Auto-renew failed: ${extra}`;
      throw error;
    }
    return graphql(shop.shopDomain, token, query, variables);
  }
}

async function testConnection(shopOrId) {
  const shop = shopOrId && shopOrId.shopDomain ? shopOrId : await getById(shopOrId);
  if (!isProcessable(shop)) {
    throw httpError(
      400,
      "Shop is not installed or is disabled. Open WMS Linker inside Shopify Admin to connect."
    );
  }
  try {
    const data = await shopifyGraphql(
      shop,
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

async function attachInstall({
  shopDomain,
  accessToken,
  scopes,
  expiresIn = null,
  refreshToken = null,
  refreshTokenExpiresIn = null,
}) {
  const domain = normalizeShopDomain(shopDomain);
  const shop = await Shop.findOne({ shopDomain: domain });

  if (!shop) {
    return { attached: false, reason: "not_allowlisted" };
  }

  applyTokenFields(shop, {
    accessToken,
    scopes,
    expiresIn,
    refreshToken,
    refreshTokenExpiresIn,
  });
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
  shop.accessTokenExpiresAt = null;
  shop.refreshTokenEncrypted = null;
  shop.refreshTokenExpiresAt = null;
  shop.uninstalledAt = new Date();
  await shop.save();
  return { updated: true };
}

module.exports = {
  normalizeShopDomain,
  findByDomain,
  isProcessable,
  getAccessToken,
  ensureFreshAccessToken,
  shopifyGraphql,
  mintAccessToken,
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
