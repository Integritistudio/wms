#!/usr/bin/env python3
import sys
import paramiko

HOST = "172.16.2.7"
USER = "dev-env"
PASSWORD = "12345678@@"

cmd = r"""
set +e
export PATH="$PATH:/usr/local/bin:$HOME/.local/bin"
which cloudflared
cloudflared tunnel route dns --help 2>&1 | head -25
echo '=== try info ==='
cloudflared tunnel info 79620ab3-36fc-4b5f-9da9-c7c664e0458d 2>&1 | head -40
echo '=== list tunnels ==='
cloudflared tunnel list 2>&1
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_stdin, stdout, stderr = client.exec_command(cmd, timeout=60)
sys.stdout.buffer.write(stdout.read())
sys.stdout.buffer.write(stderr.read())
client.close()
