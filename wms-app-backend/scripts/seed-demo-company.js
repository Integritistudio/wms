// Run with SEED_MONGODB_URI and SEED_LOGIN_PASSWORD supplied through the environment.
require("dotenv").config({ quiet: true });
if (process.env.SEED_DNS_SERVERS) {
  require("dns").setServers(process.env.SEED_DNS_SERVERS.split(","));
}
// Shop's public serializer loads app configuration. This standalone seed only
// needs model validation, not runtime auth or application connection settings.
process.env.MONGODB_URI ||= process.env.SEED_MONGODB_URI;
process.env.MONGODB_USERNAME ||= "seed-unused";
process.env.MONGODB_PASSWORD ||= "seed-unused";
const deploymentJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET ||= "seed-only-unused-auth-secret";
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Company = require("../src/modules/companies/model");
const Member = require("../src/modules/companies/memberModel");
const Warehouse = require("../src/modules/companies/warehouseModel");
const Shop = require("../src/modules/shops/model");
const Rule = require("../src/modules/routing/ruleModel");
const Config = require("../src/modules/routing/configModel");

async function insert(Model, filter, values) {
  return Model.findOneAndUpdate(filter, { $setOnInsert: values }, {
    upsert: true, returnDocument: "after", runValidators: true,
  });
}

async function main() {
  if (!process.env.SEED_MONGODB_URI || !process.env.SEED_LOGIN_PASSWORD) {
    throw new Error("Set SEED_MONGODB_URI and SEED_LOGIN_PASSWORD");
  }
  await mongoose.connect(process.env.SEED_MONGODB_URI, { dbName: "test", serverSelectionTimeoutMS: 15000 });
  const email = "admin@tricode-demo.example";
  const shopDomain = "wms-dev-bcd2dcrd.myshopify.com";
  const existingCompany = await Company.findOne({ email });
  const existingShop = await Shop.findOne({ shopDomain });
  if (existingShop && (!existingCompany || String(existingShop.companyId) !== String(existingCompany._id))) {
    throw new Error("Shop already exists under another company; refusing to reassign it");
  }
  const password = await bcrypt.hash(process.env.SEED_LOGIN_PASSWORD, 10);
  const company = await insert(Company, { email }, {
    name: "Tricode Demo Company", email, password, status: "active",
    notes: "Demo company seeded for the WMS development store.",
  });
  const warehouses = [];
  for (const [code, name, city, priority, prefixes] of [
    ["DEMO-KHI", "Demo Karachi Warehouse", "Karachi, Pakistan", 10, ["74", "75"]],
    ["DEMO-LHE", "Demo Lahore Warehouse", "Lahore, Pakistan", 20, ["54", "55"]],
  ]) {
    warehouses.push(await insert(Warehouse, { companyId: company._id, code }, {
      companyId: company._id, code, name, address: city, routingPriority: priority,
      zipPrefixes: prefixes, fulfillmentMode: "modernwms",
      modernwms: {
        baseUrl: process.env.MODERNWMS_DEFAULT_BASE_URL || "https://wms-sys.integritistudio.us",
        username: "admin", autoConfirmOrder: false,
      },
    }));
  }
  if (deploymentJwtSecret && process.env.SEED_MODERNWMS_PASSWORD) {
    const { encrypt } = require("../src/utils/secret");
    for (const warehouse of warehouses) {
      if (!warehouse.modernwms.passwordEncrypted) {
        warehouse.modernwms.passwordEncrypted = encrypt(process.env.SEED_MODERNWMS_PASSWORD);
        await warehouse.save();
      }
    }
  }
  const accounts = [
    [email, "Demo Administrator", "root", { orders: true, returns: true, failed: true, warehouses: true, sftp: true, routing: true, email: true, analytics: true }, []],
    ["operations@tricode-demo.example", "Demo Operations", "member", { orders: true, returns: true, failed: true, routing: true, analytics: true }, []],
    ["warehouse@tricode-demo.example", "Demo Warehouse Operator", "warehouse", { orders: true, returns: true, warehouses: true }, warehouses.map(w => w._id)],
  ];
  for (const [memberEmail, name, role, permissions, warehouseIds] of accounts) {
    const existing = await Member.findOne({ email: memberEmail });
    if (existing && String(existing.companyId) !== String(company._id)) throw new Error("Demo member email belongs to another company");
    await insert(Member, { email: memberEmail }, {
      companyId: company._id, email: memberEmail, name, role, permissions, warehouseIds, password, status: "active",
    });
  }
  const shop = await insert(Shop, { shopDomain }, {
    companyId: company._id, shopDomain, warehouseId: warehouses[0]._id,
    warehouseIds: warehouses.map(w => w._id), enabled: true, installed: false,
  });
  for (const [name, priority, warehouseId, conditions] of [
    ["Demo Lahore postal orders", 10, warehouses[1]._id, [{ field: "ship_zip", operator: "starts_with", value: "54" }]],
    ["Demo bulk orders to Karachi", 20, warehouses[0]._id, [{ field: "total_quantity", operator: "greater_or_equal", value: "10" }]],
  ]) {
    await insert(Rule, { companyId: company._id, name }, { companyId: company._id, name, priority, warehouseId, conditions, enabled: true });
  }
  await insert(Config, { companyId: company._id }, {
    companyId: company._id, enabled: true, defaultWarehouseId: warehouses[0]._id,
    fallbackWarehouseId: warehouses[1]._id, addressMode: "zip_prefix", autoDeliverSftp: false,
  });
  console.log(JSON.stringify({ database: mongoose.connection.name, company: company.name,
    companyId: String(company._id), shop: shop.shopDomain, shopInstalled: shop.installed,
    warehouses: warehouses.map(w => w.name), accounts: accounts.map(([email, , role]) => ({ email, role })),
    rules: await Rule.countDocuments({ companyId: company._id }),
    pending: ["Install Shopify app through OAuth", ...(!deploymentJwtSecret || !process.env.SEED_MODERNWMS_PASSWORD
      ? ["Save ModernWMS password 1 in each warehouse using the deployed app so its encryption key is used"] : [])],
  }, null, 2));
}

main().catch(error => {
  // Do not print connection strings or credentials on connection failure.
  console.error("Demo seed failed:", error.name, String(error.message).replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[redacted URI]"));
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
