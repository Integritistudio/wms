const crypto = require("crypto");
const bcrypt = require("bcrypt");
const CompanyMember = require("./memberModel");
const Warehouse = require("./warehouseModel");
const env = require("../../config/env");
const { sendMail } = require("../../utils/mail");
const { randomToken } = require("../../utils/secret");
const { signToken, AUDIENCE } = require("../../utils/jwt");
const { assertRequiredFields } = require("../../utils/validators");
const { httpError } = require("../../utils/httpError");
const logger = require("../../config/logger");

const ROLES = ["root", "member", "warehouse"];

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function inviteUrl(token) {
  return `${env.publicAppUrl}/invite/${token}`;
}

function resetUrl(token) {
  return `${env.publicAppUrl}/reset/${token}`;
}

function signMember(member) {
  return signToken(
    {
      sub: member._id.toString(),
      companyId: member.companyId.toString(),
      role: member.role,
      email: member.email,
      name: member.name,
      warehouseIds: (member.warehouseIds || []).map((id) => id.toString()),
    },
    { audience: AUDIENCE.company }
  );
}

function authPayload(member, company) {
  return {
    token: signMember(member),
    user: {
      ...member.toPublic(),
      companyName: company?.name || "",
    },
  };
}

async function sendLinkEmail({ to, subject, heading, url, expires }) {
  try {
    const email = await sendMail({
      to,
      subject,
      text: `${heading}\n\n${url}\n\nThis link expires in ${expires}.`,
      html: `<p>${heading}</p><p><a href="${url}">Continue</a></p><p>This link expires in ${expires}.</p>`,
    });
    return email;
  } catch (error) {
    logger.warn({ err: error, to, subject }, "Company email failed");
    return { sent: false, reason: "smtp_failed" };
  }
}

async function issueInvite(member, company) {
  const token = randomToken(32);
  member.inviteTokenHash = hashToken(token);
  member.inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (!member.password) {
    member.status = "invited";
  }
  await member.save();

  const url = inviteUrl(token);
  const email = await sendLinkEmail({
    to: member.email,
    subject: `Set your password for ${company.name} on WMS Linker`,
    heading: `You've been added to ${company.name} as a ${member.role} user.`,
    url,
    expires: "7 days",
  });

  return { token, url, email };
}

async function issueReset(member, company) {
  const token = randomToken(32);
  member.resetTokenHash = hashToken(token);
  member.resetExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await member.save();

  const url = resetUrl(token);
  const email = await sendLinkEmail({
    to: member.email,
    subject: `Reset your WMS Linker password`,
    heading: `Reset the password for ${member.email} at ${company.name}.`,
    url,
    expires: "24 hours",
  });

  return { token, url, email };
}

async function ensureRootMember(company) {
  let member = await CompanyMember.findOne({ companyId: company._id, role: "root" });
  if (member) {
    return member;
  }

  member = await CompanyMember.create({
    companyId: company._id,
    name: company.name,
    email: company.email,
    role: "root",
    password: company.password || null,
    status: company.password ? "active" : "invited",
    warehouseIds: [],
  });
  return member;
}

async function findByEmail(email) {
  return CompanyMember.findOne({ email: String(email || "").trim().toLowerCase() });
}

async function findByInviteToken(token) {
  return CompanyMember.findOne({ inviteTokenHash: hashToken(token) });
}

async function findByResetToken(token) {
  return CompanyMember.findOne({ resetTokenHash: hashToken(token) });
}

async function listByCompany(companyId) {
  const rows = await CompanyMember.find({ companyId }).sort({ createdAt: -1 });
  return rows.map((item) => item.toPublic());
}

async function getById(companyId, id) {
  const member = await CompanyMember.findOne({ _id: id, companyId });
  if (!member) {
    throw httpError(404, "User not found");
  }
  return member;
}

async function createMember(company, payload) {
  assertRequiredFields(payload || {}, ["email", "name", "role"]);
  const role = String(payload.role);
  if (!ROLES.includes(role) || role === "root") {
    throw httpError(400, "Role must be member or warehouse");
  }

  const email = String(payload.email).trim().toLowerCase();
  const existing = await findByEmail(email);
  if (existing) {
    throw httpError(409, "A user with this email already exists");
  }

  let warehouseIds = Array.isArray(payload.warehouseIds) ? payload.warehouseIds.filter(Boolean) : [];
  if (role === "warehouse") {
    if (!warehouseIds.length) {
      throw httpError(400, "Warehouse users need at least one warehouse");
    }
    const allowed = await Warehouse.find({ _id: { $in: warehouseIds }, companyId: company._id });
    if (allowed.length !== warehouseIds.length) {
      throw httpError(400, "Warehouse does not belong to this company");
    }
  } else {
    warehouseIds = [];
  }

  const member = await CompanyMember.create({
    companyId: company._id,
    name: String(payload.name).trim(),
    email,
    role,
    warehouseIds,
    status: "invited",
  });

  const invite = await issueInvite(member, company);
  return {
    user: member.toPublic(),
    inviteSent: invite.email.sent,
    inviteUrl: invite.email.sent ? undefined : invite.url,
  };
}

async function updateMember(company, id, payload) {
  const member = await getById(company._id, id);
  if (member.role === "root") {
    throw httpError(400, "Root user cannot be changed here");
  }

  if (payload.name) {
    member.name = String(payload.name).trim();
  }
  if (payload.role && payload.role !== "root" && ROLES.includes(payload.role)) {
    member.role = payload.role;
  }
  if (payload.status === "disabled" || payload.status === "active") {
    member.status = payload.status;
  }
  if (Array.isArray(payload.warehouseIds)) {
    const warehouseIds = payload.warehouseIds.filter(Boolean);
    const allowed = await Warehouse.find({ _id: { $in: warehouseIds }, companyId: company._id });
    if (allowed.length !== warehouseIds.length) {
      throw httpError(400, "Warehouse does not belong to this company");
    }
    member.warehouseIds = warehouseIds;
  }
  if (member.role === "warehouse" && !(member.warehouseIds || []).length) {
    throw httpError(400, "Warehouse users need at least one warehouse");
  }
  if (member.role !== "warehouse") {
    member.warehouseIds = [];
  }

  await member.save();
  return member.toPublic();
}

module.exports = {
  hashToken,
  inviteUrl,
  resetUrl,
  signMember,
  authPayload,
  issueInvite,
  issueReset,
  ensureRootMember,
  findByEmail,
  findByInviteToken,
  findByResetToken,
  listByCompany,
  getById,
  createMember,
  updateMember,
  ROLES,
};
