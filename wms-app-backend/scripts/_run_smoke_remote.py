#!/usr/bin/env python3
import sys
import paramiko
from scp import SCPClient

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
with SCPClient(c.get_transport()) as scp:
    scp.put(
        r"c:\Users\Muhammad Ahmad\Documents\GitHub\wms-linker\wms-app-backend\scripts\_sot_smoke.js",
        "/home/dev-env/wms/wms-app-backend/scripts/_sot_smoke.js",
    )
cmd = r"""
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
cd /home/dev-env/wms/wms-app-backend
node scripts/_sot_smoke.js
"""
_i, out, err = c.exec_command(cmd, timeout=120)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
print("exit", out.channel.recv_exit_status())
c.close()
