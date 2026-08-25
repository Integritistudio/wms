const Country = require("../models/country");
const State = require("../models/state");
const { apiResponseSchema } = require("../utils/openapi");

const countrySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    isoCode: { type: "string" },
    currency: { type: "string" },
    phoneCode: { type: "string" },
  },
};

const stateSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    isoCode: { type: "string" },
    countryId: { type: "string" },
    countryIsoCode: { type: "string" },
  },
};

async function locationRoutes(fastify) {
  fastify.get("/locations/countries", {
    schema: {
      tags: ["Locations"],
      summary: "List all countries",
      response: {
        200: apiResponseSchema({
          type: "array",
          items: countrySchema,
        }),
      },
    },
  }, async (request, reply) => {
    const countries = await Country.find().sort({ name: 1 });

    return reply.success({
      message: "Countries",
      data: countries.map((country) => country.toPublic()),
    });
  });

  fastify.get("/locations/countries/:isoCode/states", {
    schema: {
      tags: ["Locations"],
      summary: "List states for a country",
      params: {
        type: "object",
        required: ["isoCode"],
        properties: {
          isoCode: { type: "string", minLength: 2, maxLength: 2 },
        },
      },
      response: {
        200: apiResponseSchema({
          type: "array",
          items: stateSchema,
        }),
      },
    },
  }, async (request, reply) => {
    const isoCode = String(request.params.isoCode || "").trim().toUpperCase();
    const country = await Country.findOne({ isoCode });

    if (!country) {
      return reply.error({
        message: "Country not found",
        statusCode: 404,
      });
    }

    const states = await State.find({ countryIsoCode: isoCode }).sort({ name: 1 });

    return reply.success({
      message: "States",
      data: states.map((state) => state.toPublic()),
    });
  });

  fastify.get("/locations/postal-rules", {
    schema: {
      tags: ["Locations"],
      summary: "Postal code format for a country and optional state",
      querystring: {
        type: "object",
        required: ["country"],
        properties: {
          country: { type: "string", minLength: 2, maxLength: 2 },
          state: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { postalRules } = require("../utils/postalCode");
    const country = String(request.query.country || "").trim().toUpperCase();
    const state = String(request.query.state || "").trim().toUpperCase();
    const countryDoc = await Country.findOne({ isoCode: country });
    if (!countryDoc) {
      return reply.error({ message: "Country not found", statusCode: 404 });
    }
    return reply.success({
      message: "Postal rules",
      data: postalRules(country, state),
    });
  });
}

module.exports = locationRoutes;
