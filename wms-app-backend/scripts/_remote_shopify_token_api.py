#!/usr/bin/env python3
"""On devenv: decrypt shop token from Mongo and call Shopify GraphQL (API only)."""
import json
import sys
import paramiko

cmd = r'''
set +e
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
cd /home/dev-env/wms/wms-app-backend
node <<'NODE'
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');

function decrypt(blob) {
  if (!blob) return null;
  // try common patterns used in this codebase
  try {
    const cryptoUtil = require('./src/utils/crypto');
    if (cryptoUtil.decrypt) return cryptoUtil.decrypt(blob);
  } catch {}
  return null;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const shop = await mongoose.connection.db.collection('shops').findOne({ shopDomain: /wms-dev-bcd2dcrd/i });
  console.log('SHOP_SCOPES_DB:', shop.scopes);
  console.log('INSTALLED:', shop.installed);

  let token = null;
  try {
    const shops = require('./src/modules/shops');
    const full = await shops.findById?.(String(shop._id)) || await require('./src/modules/shops/model').findById(shop._id);
    if (full && typeof shops.getAccessToken === 'function') token = await shops.getAccessToken(full);
    if (!token && full?.accessToken) token = full.accessToken;
  } catch (e) {
    console.log('token_via_shops_err', e.message);
  }

  // fallback: look at service helpers
  if (!token) {
    try {
      const svc = require('./src/modules/shops/service');
      const row = await require('./src/modules/shops/model').findById(shop._id);
      if (svc.accessToken) token = svc.accessToken(row);
      else if (svc.getAccessToken) token = await svc.getAccessToken(row);
      else if (row.getAccessToken) token = row.getAccessToken();
    } catch (e) {
      console.log('token_via_service_err', e.message);
    }
  }

  if (!token) {
    // dump keys only
    console.log('SHOP_KEYS', Object.keys(shop));
    process.exit(2);
  }

  console.log('TOKEN_PREFIX', String(token).slice(0, 12));
  const res = await fetch(`https://${shop.shopDomain}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: `{ currentAppInstallation { accessScopes { handle } } locations(first: 5) { nodes { id name } } }`
    })
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE
'''

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
_i, out, err = c.exec_command(cmd, timeout=90, get_pty=True)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
c.close()
