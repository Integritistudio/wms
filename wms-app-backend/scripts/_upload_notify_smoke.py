#!/usr/bin/env python3
import os
import sys
import paramiko
from scp import SCPClient

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
local_base = r"c:\Users\Muhammad Ahmad\Documents\GitHub\wms-linker\wms-app-backend"
with SCPClient(c.get_transport()) as scp:
    for rel in [
        "src/modules/notifications/model.js",
        "src/modules/notifications/service.js",
        "src/modules/notifications/index.js",
        "src/modules/inventorySync/service.js",
        "scripts/_sot_smoke.js",
    ]:
        print("PUT", rel)
        scp.put(os.path.join(local_base, rel.replace("/", os.sep)), f"/home/dev-env/wms/wms-app-backend/{rel}")

cmd = r"""
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
cd /home/dev-env/wms/wms-app-backend
# restart so queue uses latest
kill $(pgrep -f 'node index.js') 2>/dev/null
fuser -k 3000/tcp 2>/dev/null
sleep 2
nohup node index.js > /tmp/wms-boot.log 2>&1 </dev/null &
sleep 12
curl -s http://127.0.0.1:3000/api/health; echo
node scripts/_sot_smoke.js
"""
_i, out, err = c.exec_command(cmd, timeout=180)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
print("exit", out.channel.recv_exit_status())
c.close()
