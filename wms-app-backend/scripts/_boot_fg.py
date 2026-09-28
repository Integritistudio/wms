#!/usr/bin/env python3
import sys
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
cmd = r"""
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
cd /home/dev-env/wms/wms-app-backend
pkill -f 'node index.js' 2>/dev/null || true
sleep 1
# capture full boot for 20s
timeout 20 node index.js > /tmp/wms-boot.log 2>&1
echo EXIT:$?
wc -l /tmp/wms-boot.log
cat /tmp/wms-boot.log
"""
_i, out, err = c.exec_command(cmd, timeout=60)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
c.close()
