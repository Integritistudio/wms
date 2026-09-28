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
echo ===procs===
pgrep -af 'node index' || echo no-node
echo ===port===
ss -lptn | grep 3000 || echo none
echo ===log===
tail -30 /tmp/wms-linker-api.log || true
echo ===health===
curl -s -m 3 http://127.0.0.1:3000/api/health || echo fail
echo
"""
_i, out, err = c.exec_command(cmd, timeout=45)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
print("exit", out.channel.recv_exit_status())
c.close()
