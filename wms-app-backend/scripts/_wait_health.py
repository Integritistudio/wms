#!/usr/bin/env python3
import sys, time, paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
time.sleep(8)
cmd = r"""
ss -lptn | grep 3000 || echo none
pgrep -af 'node index' || echo no-node
tail -n 40 /tmp/wms-boot.log
curl -s -m 3 http://127.0.0.1:3000/api/health || echo fail
echo
"""
_i, out, err = c.exec_command(cmd, timeout=30)
sys.stdout.buffer.write(out.read())
c.close()
