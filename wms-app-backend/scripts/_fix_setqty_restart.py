#!/usr/bin/env python3
import sys
import paramiko
from scp import SCPClient

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
with SCPClient(c.get_transport()) as scp:
    scp.put(
        r"c:\Users\Muhammad Ahmad\Documents\GitHub\wms-linker\wms-app-backend\src\modules\inventorySync\shopifyInventory.js",
        "/home/dev-env/wms/wms-app-backend/src/modules/inventorySync/shopifyInventory.js",
    )
print("uploaded")
cmd = r"""
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
cd /home/dev-env/wms/wms-app-backend
kill $(pgrep -f 'node index.js') 2>/dev/null
fuser -k 3000/tcp 2>/dev/null
sleep 2
nohup node index.js > /tmp/wms-boot.log 2>&1 </dev/null &
echo PID=$!
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 2
  code=$(curl -s -m 2 -o /tmp/h.json -w '%{http_code}' http://127.0.0.1:3000/api/health || echo 000)
  echo try$i:$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
done
grep -n ignoreCompareQuantity src/modules/inventorySync/shopifyInventory.js || echo 'ignoreCompareQuantity removed'
tail -n 15 /tmp/wms-boot.log
"""
_i, out, err = c.exec_command(cmd, timeout=90)
sys.stdout.buffer.write(out.read())
c.close()
