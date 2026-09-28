#!/usr/bin/env python3
import sys
import time
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
time.sleep(3)
cmd = r"""
set +e
ps aux | grep '[n]ode index.js'
ss -lptn | grep 3000
echo '---log---'
tail -n 120 /tmp/wms-linker-api.log
echo '---curl---'
curl -s -m 5 http://127.0.0.1:3000/api/health; echo
curl -s -m 10 -o /dev/null -w 'public:%{http_code}\n' https://wms-linker-api.integritistudio.us/api/health
"""
_i, out, err = c.exec_command(cmd, timeout=40, get_pty=True)
sys.stdout.buffer.write(out.read())
c.close()
