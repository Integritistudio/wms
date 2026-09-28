const Shop = require("./model");
const Warehouse = require("../companies/warehouseModel");
const { httpError } = require("../../utils/httpError");

async function allowedWarehouses(companyId, shopId) {
  const filter = { companyId, isActive: { $ne: false } };
  if (shopId) {
    const shop = await Shop.findOne({ _id: shopId, companyId }).lean();
    if (!shop) throw httpError(404, "Store not found for this company");
    if (Array.isArray(shop.warehouseIds)) filter._id = { $in: shop.warehouseIds };
  }
  return Warehouse.find(filter).lean();
}

async function assertConnected(companyId, shopId, warehouseId) {
  const warehouses = await allowedWarehouses(companyId, shopId);
  if (!warehouses.some((w) => String(w._id) === String(warehouseId))) {
    throw httpError(400, "Warehouse is not connected to this store");
  }
}
module.exports = { allowedWarehouses, assertConnected };
