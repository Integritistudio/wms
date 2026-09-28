#!/usr/bin/env python3
import sys
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
cmd = r"""
set +e
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
cd /home/dev-env/wms/wms-app-backend
# kill anything
pkill -f 'node index.js' 2>/dev/null
fuser -k 3000/tcp 2>/dev/null
sleep 1
# run in foreground briefly to capture boot errors
timeout 25 node index.js > /tmp/wms-linker-api.log 2>&1
echo EXIT:$?
wc -l /tmp/wms-linker-api.log
tail -n 200 /tmp/wms-linker-api.log
"""
_i, out, err = c.exec_command(cmd, timeout=60, get_pty=True)
sys.stdout.buffer.write(out.read())
c.close()
