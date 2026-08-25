const buildApp = require("../src/app");
const { connectDb } = require("../src/db/connect");
const env = require("../src/config/env");
const Company = require("../src/modules/companies/model");
const CompanyMember = require("../src/modules/companies/memberModel");
const Warehouse = require("../src/modules/companies/warehouseModel");
const PlatformAdmin = require("../src/modules/platform/model");
const PlatformSetting = require("../src/modules/platform/settingModel");
const Return = require("../src/modules/fulfillment/returnModel");

let app;

async function setup() {
  await connectDb();
  app = await buildApp();
  await app.ready();
}

async function runTests() {
  console.log("=== Starting RBAC and Multi-Role Verification Suite ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, message, detail = "") {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}${detail ? ` (${detail})` : ""}`);
      failed++;
    }
  }

  // 1. Seed Platform Admin
  let admin = await PlatformAdmin.findOne({ username: "platform_admin" });
  if (!admin) {
    const { seedPlatformAdmin } = require("../src/modules/platform");
    await seedPlatformAdmin();
    admin = await PlatformAdmin.findOne({ username: "platform_admin" });
  }

  // Platform Admin Login
  const adminLoginRes = await app.inject({
    method: "POST",
    url: "/platform/auth/login",
    payload: { username: "platform_admin", password: env.platformAdminPassword || "Admin@12345!" },
  });
  const adminToken = adminLoginRes.json()?.data?.token;
  assert(adminLoginRes.statusCode === 200 && adminToken, "Platform Admin can sign in");

  // 2. Public Company Signup
  const testCompanyEmail = `acme_${Date.now()}@test.com`;
  const signupRes = await app.inject({
    method: "POST",
    url: "/company/auth/signup",
    payload: {
      name: "Acme Logistics Test",
      contactName: "John Doe",
      email: testCompanyEmail,
      password: "Password123!",
      phone: "1234567890",
    },
  });
  assert(signupRes.statusCode === 201, "Public company signup returns 201 Created");
  const createdCompany = signupRes.json()?.data?.company;
  assert(createdCompany?.status === "pending", "New company account has 'pending' status");

  // 3. Login attempt before approval
  const unapprovedLoginRes = await app.inject({
    method: "POST",
    url: "/company/auth/login",
    payload: {
      email: testCompanyEmail,
      password: "Password123!",
      expectedRole: "root",
    },
  });
  assert(unapprovedLoginRes.statusCode === 403, "Unapproved company cannot log in (403 Forbidden)");

  // 4. Platform Admin Approves Company
  const approveRes = await app.inject({
    method: "POST",
    url: `/platform/companies/${createdCompany.id}/approve`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert(approveRes.statusCode === 200, "Platform Admin can approve pending company");
  assert(approveRes.json()?.data?.status === "active", "Approved company is now active");

  // 5. Approved Company Root Login
  const rootLoginRes = await app.inject({
    method: "POST",
    url: "/company/auth/login",
    payload: {
      email: testCompanyEmail,
      password: "Password123!",
      expectedRole: "root",
    },
  });
  assert(rootLoginRes.statusCode === 200, "Approved company root can sign in");
  const rootToken = rootLoginRes.json()?.data?.token;
  const rootUser = rootLoginRes.json()?.data?.user;
  assert(rootUser?.role === "root" && rootUser?.permissions?.orders === true, "Root user receives all module permissions");

  // 6. Role mismatch rejection test
  const mismatchLoginRes = await app.inject({
    method: "POST",
    url: "/company/auth/login",
    payload: {
      email: testCompanyEmail,
      password: "Password123!",
      expectedRole: "warehouse", // Expecting warehouse but account is root
    },
  });
  assert(mismatchLoginRes.statusCode === 400, "Role mismatch dropdown selector validation rejects wrong role");

  // 7. Add Warehouse to Company
  const whRes = await app.inject({
    method: "POST",
    url: `/platform/companies/${createdCompany.id}/warehouses`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      name: "Dallas Hub",
      code: "DAL-1",
      address: "100 Logistics Way, Dallas, TX 75201, USA",
      country: "US",
      state: "TX",
      zip: "75201",
    },
  });
  const warehouse = whRes.json()?.data;
  assert(whRes.statusCode === 201 && warehouse?.id, "Warehouse added to company");

  // 8. Create Restricted Company User (Orders permission only, NO returns permission)
  const memberEmail = `member_${Date.now()}@test.com`;
  const createMemberRes = await app.inject({
    method: "POST",
    url: "/company/users",
    headers: { authorization: `Bearer ${rootToken}` },
    payload: {
      name: "Orders Specialist",
      email: memberEmail,
      role: "member",
      permissions: {
        orders: true,
        returns: false,
        failed: false,
        warehouses: false,
        sftp: false,
        routing: false,
        email: false,
      },
    },
  });
  assert(createMemberRes.statusCode === 201, "Root can invite team member with custom permissions");

  // Activate member directly for testing
  const memberDoc = await CompanyMember.findOne({ email: memberEmail });
  const bcrypt = require("bcrypt");
  memberDoc.password = await bcrypt.hash("Password123!", 10);
  memberDoc.status = "active";
  await memberDoc.save();

  // Login as Company User
  const memberLoginRes = await app.inject({
    method: "POST",
    url: "/company/auth/login",
    payload: {
      email: memberEmail,
      password: "Password123!",
      expectedRole: "member",
    },
  });
  assert(memberLoginRes.statusCode === 200, "Company member can sign in");
  const memberToken = memberLoginRes.json()?.data?.token;

  // Test Module Permissions for Company User
  const ordersAccessRes = await app.inject({
    method: "GET",
    url: "/company/orders",
    headers: { authorization: `Bearer ${memberToken}` },
  });
  assert(ordersAccessRes.statusCode === 200, "Company member CAN access Orders module (permission granted)");

  const returnsAccessRes = await app.inject({
    method: "GET",
    url: "/company/returns",
    headers: { authorization: `Bearer ${memberToken}` },
  });
  assert(returnsAccessRes.statusCode === 403, "Company member CANNOT access Returns module (permission denied -> 403)");

  const warehousesAccessRes = await app.inject({
    method: "POST",
    url: "/company/warehouses",
    headers: { authorization: `Bearer ${memberToken}` },
    payload: { name: "Unauthorized Hub", country: "US" },
  });
  assert(warehousesAccessRes.statusCode === 403, "Company member CANNOT create Warehouses (permission denied -> 403)");

  // 9. Soft Delete & Restore Company
  const deleteRes = await app.inject({
    method: "DELETE",
    url: `/platform/companies/${createdCompany.id}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert(deleteRes.statusCode === 200, "Platform Admin can soft-delete company");

  const deletedLoginRes = await app.inject({
    method: "POST",
    url: "/company/auth/login",
    payload: {
      email: testCompanyEmail,
      password: "Password123!",
    },
  });
  assert(deletedLoginRes.statusCode === 401 || deletedLoginRes.statusCode === 403, "Soft-deleted company cannot sign in");

  const restoreRes = await app.inject({
    method: "POST",
    url: `/platform/companies/${createdCompany.id}/restore`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert(restoreRes.statusCode === 200, "Platform Admin can restore soft-deleted company");

  // 10. Platform Retention Settings & Cleanup
  const settingsRes = await app.inject({
    method: "GET",
    url: "/platform/settings",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert(settingsRes.statusCode === 200 && settingsRes.json()?.data?.retentionDays === 180, "Platform retention settings default to 180 days");

  const cleanupRes = await app.inject({
    method: "POST",
    url: "/platform/settings/cleanup",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { retentionDays: 180 },
  });
  assert(cleanupRes.statusCode === 200 && typeof cleanupRes.json()?.data?.deletedCompanies === "number", "Retention cleanup execution succeeds");

  console.log(`\n==============================================`);
  console.log(`Verification Complete: ${passed} Passed, ${failed} Failed.`);
  console.log(`==============================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

setup()
  .then(runTests)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test error:", err);
    process.exit(1);
  });
