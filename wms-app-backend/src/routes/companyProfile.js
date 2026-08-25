const CompanyProfile = require("../models/companyProfile");
const Country = require("../models/country");
const State = require("../models/state");
const { authenticate } = require("../middleware/auth");
const { apiResponseSchema } = require("../utils/openapi");
const { assertRequiredFields } = require("../utils/validators");
const logger = require("../config/logger");

const locationSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    isoCode: { type: "string" },
    currency: { type: "string" },
    phoneCode: { type: "string" },
    countryId: { type: "string" },
    countryIsoCode: { type: "string" },
  },
};

const companyProfileSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    companyId: { type: "string" },
    name: { type: "string" },
    email: { type: "string" },
    country: locationSchema,
    state: {
      anyOf: [locationSchema, { type: "null" }],
    },
    address: { type: "string" },
    phone: { type: "string" },
  },
};

function formatProfile(profile) {
  return {
    id: profile._id.toString(),
    companyId: profile.companyId.toString(),
    name: profile.name,
    email: profile.email,
    country: profile.countryId?.toPublic ? profile.countryId.toPublic() : null,
    state: profile.stateId?.toPublic ? profile.stateId.toPublic() : null,
    address: profile.address,
    phone: profile.phone,
  };
}

async function loadProfile(companyId) {
  return CompanyProfile.findOne({ companyId })
    .populate("countryId")
    .populate("stateId");
}

async function companyProfileRoutes(fastify) {
  fastify.get("/company-profile", {
    preHandler: authenticate,
    schema: {
      tags: ["Company Profile"],
      summary: "Get the current company profile",
      security: [{ bearerAuth: [] }],
      response: {
        200: apiResponseSchema(companyProfileSchema),
      },
    },
  }, async (request, reply) => {
    const profile = await loadProfile(request.user.sub);

    if (!profile) {
      return reply.error({
        message: "Company profile not found",
        statusCode: 404,
      });
    }

    return reply.success({
      message: "Company profile",
      data: formatProfile(profile),
    });
  });

  fastify.put("/company-profile", {
    preHandler: authenticate,
    schema: {
      tags: ["Company Profile"],
      summary: "Create or update the company profile",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["name", "email", "countryIsoCode", "address", "phone"],
        properties: {
          name: { type: "string", minLength: 1 },
          email: { type: "string", minLength: 1, format: "email" },
          countryIsoCode: { type: "string", minLength: 2, maxLength: 2 },
          stateIsoCode: { type: "string", minLength: 1 },
          address: { type: "string", minLength: 1 },
          phone: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
      response: {
        200: apiResponseSchema(companyProfileSchema),
      },
    },
  }, async (request, reply) => {
    const name = String(request.body.name || "").trim();
    const email = String(request.body.email || "").trim().toLowerCase();
    const countryIsoCode = String(request.body.countryIsoCode || "").trim().toUpperCase();
    const stateIsoCode = String(request.body.stateIsoCode || "").trim().toUpperCase();
    const address = String(request.body.address || "").trim();
    const phone = String(request.body.phone || "").trim();
    const companyId = request.user.sub;

    assertRequiredFields(
      { name, email, countryIsoCode, address, phone, companyId },
      ["name", "email", "countryIsoCode", "address", "phone", "companyId"]
    );

    const country = await Country.findOne({ isoCode: countryIsoCode });

    if (!country) {
      return reply.error({
        message: "Country not found",
        statusCode: 400,
      });
    }

    const stateCount = await State.countDocuments({ countryIsoCode });
    let state = null;

    if (stateCount > 0) {
      if (!stateIsoCode) {
        return reply.error({
          message: "State is required for this country",
          statusCode: 400,
        });
      }

      state = await State.findOne({
        countryIsoCode,
        isoCode: stateIsoCode,
      });

      if (!state) {
        return reply.error({
          message: "State not found for the selected country",
          statusCode: 400,
        });
      }
    }

    const profile = await CompanyProfile.findOneAndUpdate(
      { companyId },
      {
        companyId,
        name,
        email,
        countryId: country._id,
        stateId: state?._id || null,
        address,
        phone,
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    logger.info({ companyId, countryIsoCode, stateIsoCode: stateIsoCode || null }, "Company profile saved");

    const saved = await loadProfile(companyId);

    return reply.success({
      message: "Company profile saved",
      data: formatProfile(saved || profile),
    });
  });
}

module.exports = companyProfileRoutes;
