#!/usr/bin/env python3
import sys
import paramiko

HOST = "172.16.2.7"
USER = "dev-env"
PASSWORD = "12345678@@"
SUDO = "12345678@@"
HOSTNAME = "wms-linker-api.integritistudio.us"
REMOTE = "/home/dev-env/wms/wms-app-backend"

CFG = f"""tunnel: 79620ab3-36fc-4b5f-9da9-c7c664e0458d
credentials-file: /home/dev-env/.cloudflared/79620ab3-36fc-4b5f-9da9-c7c664e0458d.json

ingress:
  - hostname: wms-sys.integritistudio.us
    service: http://127.0.0.1:80
  - hostname: modren-wms.integritistudio.us
    service: http://127.0.0.1:8088
  - hostname: {HOSTNAME}
    service: http://127.0.0.1:3000
  - service: http_status:404
"""


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = c.open_sftp()
    with sftp.file("/tmp/cloudflared-wms.yml", "w") as f:
        f.write(CFG)
    sftp.close()

    cmd = f"""
set -e
echo '{SUDO}' | sudo -S cp /tmp/cloudflared-wms.yml /etc/cloudflared/config.yml
echo '{SUDO}' | sudo -S cat /etc/cloudflared/config.yml
echo '{SUDO}' | sudo -S systemctl restart cloudflared || true
sleep 2
ps aux | grep '[c]loudflared' | head
# start backend
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
cd {REMOTE}
# fix env hostname if needed
grep PUBLIC_API_URL .env | head -1
pkill -f '{REMOTE}/index.js' 2>/dev/null || true
pkill -f 'node index.js' 2>/dev/null || true
sleep 1
nohup node index.js > /tmp/wms-linker-api.log 2>&1 &
sleep 4
ss -lptn | grep 3000 || true
tail -n 50 /tmp/wms-linker-api.log
curl -s -w '\\nlocal:%{{http_code}}\\n' http://127.0.0.1:3000/api/health || true
"""
    print(cmd[:200], flush=True)
    _i, out, err = c.exec_command(cmd, timeout=90, get_pty=True)
    sys.stdout.buffer.write(out.read())
    sys.stdout.buffer.write(err.read())
    c.close()


if __name__ == "__main__":
    main()
