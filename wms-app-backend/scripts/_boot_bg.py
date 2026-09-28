#!/usr/bin/env python3
import sys
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
cmd = """bash -lc 'export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm use 20; cd /home/dev-env/wms/wms-app-backend; rm -f /tmp/wms-boot.log; node index.js > /tmp/wms-boot.log 2>&1 & echo PID=$!; sleep 12; echo ---log---; cat /tmp/wms-boot.log; echo ---ss---; ss -lptn | grep 3000 || echo none; curl -s -m 2 http://127.0.0.1:3000/api/health || echo fail; echo; pgrep -af "node index" || true'"""
_i, out, err = c.exec_command(cmd, timeout=60)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
c.close()
