#!/usr/bin/env python3
"""One-shot probe of remote host for email-ms deploy. Do not commit secrets elsewhere."""
import sys
import paramiko

HOST = "172.16.2.7"
USER = "dev-env"
PASSWORD = "12345678@@"
SUDO = "12345678@@"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

cmd = f"""
set -e
echo '=== cloudflared config ==='
echo '{SUDO}' | sudo -S cat /etc/cloudflared/config.yml 2>/dev/null || echo 'NO_CONFIG'
echo '=== listening ports of interest ==='
ss -lptn 2>/dev/null | grep -E ':(8712|8714|8716|8718|8720|8722|3000)\\b' || true
echo '=== docker / node ==='
which docker; docker --version 2>/dev/null || true
which node; node -v 2>/dev/null || true
echo '=== wms tree ==='
ls -la /home/dev-env/wms 2>/dev/null | head -40 || ls -la /home/dev-env | head -40
echo '=== postgres ==='
which psql; sudo -n -u postgres psql -lqt 2>/dev/null | head || true
"""
_i, out, err = c.exec_command(cmd, timeout=60, get_pty=True)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
c.close()
