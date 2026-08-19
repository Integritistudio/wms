const bcrypt = require("bcrypt");
const CompanyRoot = require("../models/companyRoot");
const { signToken } = require("../utils/jwt");
const { authenticate } = require("../middleware/auth");
const { apiResponseSchema } = require("../utils/openapi");
const { assertRequiredFields } = require("../utils/validators");
const logger = require("../config/logger");

const credentialsSchema = {
  type: "object",
  required: ["companyName", "rootUser", "password"],
  properties: {
    companyName: { type: "string", minLength: 1 },
    rootUser: { type: "string", minLength: 1 },
    password: { type: "string", minLength: 1 },
  },
};

const companyRootPublicSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    companyName: { type: "string" },
    rootUser: { type: "string" },
    isActive: { type: "boolean" },
  },
};

const authDataSchema = {
  type: "object",
  properties: {
    token: { type: "string" },
    user: companyRootPublicSchema,
  },
};

function normalizeCredentials(body) {
  const companyName = String(body.companyName || "").trim();
  const rootUser = String(body.rootUser || "").trim().toLowerCase();
  const password = String(body.password || "");

  return {
    companyName,
    companyKey: companyName.toLowerCase(),
    rootUser,
    password,
  };
}

function buildAuthPayload(companyRoot) {
  const publicUser = companyRoot.toPublic();

  return {
    token: signToken({
      sub: publicUser.id,
      rootUser: publicUser.rootUser,
      companyName: publicUser.companyName,
    }),
    user: publicUser,
  };
}

async function authRoutes(fastify) {
  fastify.post("/auth/register", {
    schema: {
      tags: ["Auth"],
      summary: "Create a company root account",
      body: {
        ...credentialsSchema,
        properties: {
          ...credentialsSchema.properties,
          password: { type: "string", minLength: 6 },
        },
      },
      response: {
        201: apiResponseSchema(authDataSchema),
      },
    },
  }, async (request, reply) => {
    const { companyName, companyKey, rootUser, password } = normalizeCredentials(request.body);

    assertRequiredFields(
      { companyName, companyKey, rootUser, password },
      ["companyName", "companyKey", "rootUser", "password"]
    );

    if (password.length < 6) {
      return reply.error({
        message: "Password must be at least 6 characters",
        statusCode: 400,
      });
    }

    const existingCompany = await CompanyRoot.findOne({ companyKey });

    if (existingCompany) {
      return reply.error({
        message: "A company root account already exists for this company",
        statusCode: 409,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const companyRoot = await CompanyRoot.create({
      companyName,
      companyKey,
      rootUser,
      password: passwordHash,
      lastPassword: null,
      isActive: true,
    });

    logger.info({ companyName, rootUser }, "Company root registered");

    return reply.success({
      statusCode: 201,
      message: "Account created",
      data: buildAuthPayload(companyRoot),
    });
  });

  fastify.post("/auth/login", {
    schema: {
      tags: ["Auth"],
      summary: "Sign in with company name, root user, and password",
      body: credentialsSchema,
      response: {
        200: apiResponseSchema(authDataSchema),
      },
    },
  }, async (request, reply) => {
    const { companyKey, rootUser, password } = normalizeCredentials(request.body);

    assertRequiredFields(
      { companyKey, rootUser, password },
      ["companyKey", "rootUser", "password"]
    );

    const companyRoot = await CompanyRoot.findOne({ companyKey, rootUser });

    if (!companyRoot) {
      return reply.error({
        message: "Invalid company, root user, or password",
        statusCode: 401,
      });
    }

    if (!companyRoot.isActive) {
      return reply.error({
        message: "This company root account is inactive",
        statusCode: 403,
      });
    }

    const passwordMatches = await bcrypt.compare(password, companyRoot.password);

    if (!passwordMatches) {
      return reply.error({
        message: "Invalid company, root user, or password",
        statusCode: 401,
      });
    }

    logger.info(
      { companyName: companyRoot.companyName, rootUser: companyRoot.rootUser },
      "Company root logged in"
    );

    return reply.success({
      message: "Logged in",
      data: buildAuthPayload(companyRoot),
    });
  });

  fastify.get("/auth/me", {
    preHandler: authenticate,
    schema: {
      tags: ["Auth"],
      summary: "Get the current company root",
      security: [{ bearerAuth: [] }],
      response: {
        200: apiResponseSchema(companyRootPublicSchema),
      },
    },
  }, async (request, reply) => {
    const companyRoot = await CompanyRoot.findById(request.user.sub);

    if (!companyRoot || !companyRoot.isActive) {
      return reply.error({
        message: "Unauthorized",
        statusCode: 401,
      });
    }

    return reply.success({
      message: "Current company root",
      data: companyRoot.toPublic(),
    });
  });
}

module.exports = authRoutes;
