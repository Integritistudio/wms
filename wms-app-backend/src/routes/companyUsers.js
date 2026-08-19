const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const CompanyRoot = require("../models/companyRoot");
const CompanyUser = require("../models/companyUser");
const { authenticate } = require("../middleware/auth");
const { apiResponseSchema } = require("../utils/openapi");
const { assertRequiredFields } = require("../utils/validators");
const logger = require("../config/logger");

const companyUserPublicSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    username: { type: "string" },
    email: { type: "string" },
    companyId: { type: "string" },
    isActive: { type: "boolean" },
  },
};

async function companyUserRoutes(fastify) {
  fastify.post("/company-users", {
    preHandler: authenticate,
    schema: {
      tags: ["Company Users"],
      summary: "Create a company user",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["username", "password", "email"],
        properties: {
          username: { type: "string", minLength: 1 },
          password: { type: "string", minLength: 6 },
          email: { type: "string", minLength: 1, format: "email" },
        },
        additionalProperties: false,
      },
      response: {
        201: apiResponseSchema(companyUserPublicSchema),
      },
    },
  }, async (request, reply) => {
    const username = String(request.body.username || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const email = String(request.body.email || "").trim().toLowerCase();
    const companyId = request.user.sub;

    assertRequiredFields({ username, password, email, companyId }, ["username", "password", "email", "companyId"]);

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return reply.error({
        message: "Company id is invalid",
        statusCode: 400,
      });
    }

    if (password.length < 6) {
      return reply.error({
        message: "Password must be at least 6 characters",
        statusCode: 400,
      });
    }

    const company = await CompanyRoot.findById(companyId);

    if (!company || !company.isActive) {
      return reply.error({
        message: "Company root account was not found",
        statusCode: 404,
      });
    }

    const existingUser = await CompanyUser.findOne({
      companyId,
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      return reply.error({
        message: "A user with this username or email already exists for the company",
        statusCode: 409,
      });
    }

    const companyUser = await CompanyUser.create({
      username,
      password: await bcrypt.hash(password, 10),
      email,
      lastPassword: null,
      companyId,
      isActive: true,
    });

    logger.info({ companyId, username, email }, "Company user created");

    return reply.success({
      statusCode: 201,
      message: "Company user created",
      data: companyUser.toPublic(),
    });
  });

  fastify.get("/company-users", {
    preHandler: authenticate,
    schema: {
      tags: ["Company Users"],
      summary: "List users for the current company",
      security: [{ bearerAuth: [] }],
      response: {
        200: apiResponseSchema({
          type: "array",
          items: companyUserPublicSchema,
        }),
      },
    },
  }, async (request, reply) => {
    const companyId = request.user.sub;
    const users = await CompanyUser.find({ companyId }).sort({ createdAt: -1 });

    return reply.success({
      message: "Company users",
      data: users.map((user) => user.toPublic()),
    });
  });
}

module.exports = companyUserRoutes;
