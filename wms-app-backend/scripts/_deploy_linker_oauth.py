#!/usr/bin/env python3
"""Deploy linker API on devenv + Cloudflare hostname for OAuth scope upgrade."""
import os
import sys
import time
import paramiko
from scp import SCPClient

HOST = "172.16.2.7"
USER = "dev-env"
PASSWORD = "12345678@@"
SUDO = "12345678@@"
LOCAL_BACKEND = r"c:\Users\Muhammad Ahmad\Documents\GitHub\wms-linker\wms-app-backend"
REMOTE = "/home/dev-env/wms/wms-app-backend"
HOSTNAME = "wms-linker-api.integritistudio.us"

FILES = [
    "src/modules/inventorySync/shopifyInventory.js",
    "src/modules/shops/model.js",
    "src/modules/inventorySync/service.js",
    "src/modules/shopify/service.js",
    "src/modules/shopify/client.js",
    ".env",
]


def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    return c


def run(c, cmd, timeout=120):
    print(f"$ {cmd[:240]}", flush=True)
    _i, out, err = c.exec_command(cmd, timeout=timeout, get_pty=True)
    data = out.read()
    edata = err.read()
    code = out.channel.recv_exit_status()
    sys.stdout.buffer.write(data)
    if edata:
        sys.stdout.buffer.write(edata)
    sys.stdout.buffer.flush()
    return code


def main():
    c = connect()
    # upload key files
    with SCPClient(c.get_transport()) as scp:
        for rel in FILES:
            local = os.path.join(LOCAL_BACKEND, rel.replace("/", os.sep))
            remote = f"{REMOTE}/{rel}"
            print(f"PUT {rel}", flush=True)
            scp.put(local, remote)

    # ensure .env points at new hostname + scopes
    run(
        c,
        f"""python3 - <<'PY'
from pathlib import Path
p = Path('{REMOTE}/.env')
text = p.read_text()
repl = {{
  'PUBLIC_API_URL=': 'PUBLIC_API_URL=https://{HOSTNAME}',
  'PUBLIC_APP_URL=': 'PUBLIC_APP_URL=https://wms-demo.integritistudio.us',
  'SHOPIFY_API_KEY=': 'SHOPIFY_API_KEY=563cf41146d7f10bae04f37953d3168e',
  'SHOPIFY_API_SECRET=': 'SHOPIFY_API_SECRET=',
  'SHOPIFY_HOST_NAME=': 'SHOPIFY_HOST_NAME={HOSTNAME}',
  'SHOPIFY_SCOPES=': 'SHOPIFY_SCOPES=read_orders,write_orders,write_returns,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_inventory,write_inventory,read_products,read_locations',
}}
lines = []
seen = set()
for line in text.splitlines():
    key = line.split('=',1)[0]+'=' if '=' in line else None
    if key in repl:
        lines.append(repl[key])
        seen.add(key)
    else:
        lines.append(line)
for k,v in repl.items():
    if k not in seen:
        lines.append(v)
p.write_text('\\n'.join(lines)+'\\n')
print('env updated')
PY""",
    )

    # cloudflared ingress + dns
    run(
        c,
        f"""SP='{SUDO}'
CFG=/etc/cloudflared/config.yml
echo \"$SP\" | sudo -S tee \"$CFG\" >/dev/null <<'EOF'
tunnel: 79620ab3-36fc-4b5f-9da9-c7c664e0458d
credentials-file: /home/dev-env/.cloudflared/79620ab3-36fc-4b5f-9da9-c7c664e0458d.json

ingress:
  - hostname: wms-sys.integritistudio.us
    service: http://127.0.0.1:80
  - hostname: modren-wms.integritistudio.us
    service: http://127.0.0.1:8088
  - hostname: {HOSTNAME}
    service: http://127.0.0.1:3000
  - service: http_status:404
EOF
echo \"$SP\" | sudo -S cat \"$CFG\"
cloudflared tunnel route dns -f 79620ab3-36fc-4b5f-9da9-c7c664e0458d {HOSTNAME} 2>&1 || true
echo \"$SP\" | sudo -S systemctl restart cloudflared 2>&1 || (echo \"$SP\" | sudo -S killall cloudflared; sleep 1; echo \"$SP\" | sudo -S nohup cloudflared --config /etc/cloudflared/config.yml tunnel run 79620ab3-36fc-4b5f-9da9-c7c664e0458d >/tmp/cloudflared.log 2>&1 &)
sleep 2
ps aux | grep cloudflared | grep -v grep | head
""",
    )

    # start node backend
    run(
        c,
        f"""
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
cd {REMOTE}
# kill old
pkill -f 'node .*wms-app-backend' 2>/dev/null || true
pkill -f 'node index.js' 2>/dev/null || true
sleep 1
nohup node index.js > /tmp/wms-linker-api.log 2>&1 &
sleep 3
ss -lptn | grep ':3000' || true
tail -n 40 /tmp/wms-linker-api.log
curl -s -o /dev/null -w 'local:%{{http_code}}\\n' http://127.0.0.1:3000/api/health || true
""",
    )
    c.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    try:
        import scp  # noqa: F401
    except ImportError:
        os.system(f"{sys.executable} -m pip install scp paramiko -q")
    main()
