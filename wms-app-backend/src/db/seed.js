const bcrypt = require("bcrypt");
const CompanyRoot = require("../models/companyRoot");
const logger = require("../config/logger");
const env = require("../config/env");

const DEFAULT_COMPANY = "Demo Company";
const DEFAULT_ROOT_USER = "admin";
const DEFAULT_PASSWORD = "admin123";

async function seedDefaultCompanyRoot() {
  const existingCount = await CompanyRoot.countDocuments();

  if (existingCount > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  await CompanyRoot.create({
    companyName: DEFAULT_COMPANY,
    companyKey: DEFAULT_COMPANY.toLowerCase(),
    rootUser: DEFAULT_ROOT_USER,
    password: passwordHash,
    lastPassword: null,
    isActive: true,
  });

  if (!env.isProduction) {
    logger.info(
      {
        companyName: DEFAULT_COMPANY,
        rootUser: DEFAULT_ROOT_USER,
      },
      "Seeded default company root"
    );
  }
}

module.exports = {
  seedDefaultCompanyRoot,
};
