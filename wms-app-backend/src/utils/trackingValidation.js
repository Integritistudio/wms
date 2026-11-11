const { httpError } = require('./httpError');

function validateTracking(trackingNumber, carrier) {
  const tracking = String(trackingNumber || '').trim().toUpperCase();
  const name = String(carrier || '').trim();
  if (!name) throw httpError(400, 'Carrier is required');
  const key = name.toUpperCase().replace(/\s+/g, '');
  const patterns = {
    UPS: /^(?:1Z[A-Z0-9]{16}|\d{9}|\d{12}|T\d{10})$/,
    FEDEX: /^(?:\d{12}|\d{15}|\d{20}|\d{22})$/,
    USPS: /^(?:\d{20}|\d{22}|[A-Z]{2}\d{9}[A-Z]{2})$/,
    DHL: /^\d{10}$/,
  };
  if (!(patterns[key] || /^[A-Z0-9][A-Z0-9-]{5,39}$/).test(tracking)) {
    throw httpError(400, `Invalid tracking number for ${name}`);
  }
  return { trackingNumber: tracking, carrier: name };
}

module.exports = { validateTracking };
