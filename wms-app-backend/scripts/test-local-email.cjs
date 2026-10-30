const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(relative, dependencies) {
  const file = path.join(__dirname, '../src', relative);
  const context = {
    module: { exports: {} },
    require(id) {
      if (id.includes('emailMs')) throw new Error('Email microservice must not be loaded');
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      throw new Error(`Unexpected dependency: ${id}`);
    },
    Date, setTimeout, clearTimeout,
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return context.module.exports;
}

const logger = { info() {}, warn() {}, debug() {} };

(async () => {
  const sent = [];
  let closed = 0;
  let fail = false;
  const env = { smtpConfigured: true, smtpHost: 'smtp.local', smtpPort: 465, smtpFrom: 'ops@example.com', smtpUser: 'ops', smtpPass: 'test-only', emailMsBaseUrl: 'https://unused.invalid', emailMsAdminSecret: 'ignored' };
  const mail = load('utils/mail.js', {
    '../config/env': env, '../config/logger': logger,
    nodemailer: { createTransport(options) {
      assert.equal(options.host, 'smtp.local');
      assert.equal(options.secure, true);
      return { async sendMail(message) { if (fail) throw new Error('SMTP failure'); sent.push(message); }, close() { closed++; } };
    } },
  });
  assert.equal((await mail.sendMail({ to: ['a@example.com', 'b@example.com'], subject: 'Invite', text: 'Activate', companyId: 'company' })).via, 'local-smtp');
  assert.equal(sent[0].to, 'a@example.com, b@example.com');
  assert.equal(sent[0].from, env.smtpFrom);
  assert.equal(closed, 1);
  fail = true;
  await assert.rejects(mail.sendMail({ to: 'a@example.com', subject: 'Reset' }), /SMTP failure/);
  assert.equal(closed, 2);
  env.smtpConfigured = false;
  assert.equal((await mail.sendMail({ to: 'a@example.com', subject: 'No config' })).reason, 'smtp_not_configured');

  let settings = { host: 'company.smtp', username: 'company', password: 'stored-secret', fromEmail: 'company@example.com', enabled: true, notifyOn: ['order_error'], recipients: ['team@example.com'] };
  const deliveries = [];
  const updates = [];
  const SmtpSettings = {
    findOne: () => ({ lean: async () => settings, then: (resolve) => Promise.resolve(settings).then(resolve) }),
    async findOneAndUpdate(_filter, update) { settings = { ...settings, ...update.$set }; return settings; },
  };
  const notifications = load('modules/notifications/service.js', {
    './model': { create: async (item) => item, updateOne: async (...args) => updates.push(args) },
    '../companies/model': { findById: async () => null }, '../companies/members': {},
    './smtpModel': SmtpSettings,
    './emailSender': { send: async (smtp, message) => deliveries.push({ smtp, message }) },
    '../../config/logger': logger, '../notifyMs/client': { enabled: () => false },
  });
  const publicSettings = await notifications.getSmtpSettings('company');
  assert.equal(publicSettings.password, '');
  assert.equal(publicSettings.passwordSet, true);
  await notifications.saveSmtpSettings('company', { host: 'updated.smtp', password: '' });
  assert.equal(settings.password, 'stored-secret');
  await notifications.testSmtp('company', { host: 'override.smtp' });
  assert.equal(deliveries[0].smtp.host, 'override.smtp');
  assert.equal(deliveries[0].smtp.password, 'stored-secret');
  await notifications.create({ companyId: 'company', userId: 'user', type: 'order_error', title: 'Order failed' });
  await new Promise(setImmediate);
  assert.equal(deliveries.length, 2);
  assert.equal(updates.length, 1);
  await notifications.create({ companyId: 'company', userId: 'user', type: 'order_received', title: 'New order' });
  await new Promise(setImmediate);
  assert.equal(deliveries.length, 2, 'Unselected notification types must not send');

  const members = load('modules/companies/members.js', {
    crypto: require('node:crypto'), bcrypt: {}, './memberModel': {}, './warehouseModel': {},
    '../../config/env': env, '../../utils/mail': mail, '../../utils/secret': {}, '../../utils/jwt': {},
    '../../utils/validators': {}, '../../utils/httpError': { httpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }) },
    '../../config/logger': logger, '../../utils/emailTemplates': {}, '../notifications': notifications,
  });
  assert.equal((await members.resolveInviteMailer('company')).mode, 'company');
  settings = null;
  env.smtpConfigured = true;
  assert.equal((await members.resolveInviteMailer('company')).mode, 'env');
  env.smtpConfigured = false;
  await assert.rejects(members.resolveInviteMailer('company'), /Set up SMTP/);
  console.log('Local email checks passed: platform SMTP, company SMTP, invite readiness, saved secrets, test overrides, alert filtering, and failure cleanup.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
