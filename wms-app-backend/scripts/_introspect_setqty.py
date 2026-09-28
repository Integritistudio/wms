#!/usr/bin/env python3
import sys, paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
cmd = r"""
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null
cd /home/dev-env/wms/wms-app-backend
node <<'NODE'
require('dotenv').config();
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Shop = require('./src/modules/shops/model');
  const shops = require('./src/modules/shops');
  const shop = await Shop.findOne({ shopDomain: /wms-dev-bcd2dcrd/i });
  console.log('scopes_db', shop.scopes);
  const data = await shops.shopifyGraphql(shop, `{
    __type(name: "InventorySetQuantitiesInput") {
      inputFields { name type { name kind ofType { name kind } } }
    }
  }`);
  console.log(JSON.stringify(data, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
NODE
"""
_i, out, err = c.exec_command(cmd, timeout=60)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
c.close()
