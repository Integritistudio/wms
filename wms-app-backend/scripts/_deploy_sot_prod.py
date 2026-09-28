#!/usr/bin/env python3
"""Deploy inventory SoT backend to devenv and route wms-demo-backend to it."""
import os
import sys
import paramiko
from scp import SCPClient

HOST = "172.16.2.7"
USER = "dev-env"
PASSWORD = "12345678@@"
SUDO = "12345678@@"
LOCAL = r"c:\Users\Muhammad Ahmad\Documents\GitHub\wms-linker\wms-app-backend"
REMOTE = "/home/dev-env/wms/wms-app-backend"

FILES = [
    "src/modules/inventorySync/routes.js",
    "src/modules/inventorySync/shopifyInventory.js",
    "src/modules/inventorySync/service.js",
    "src/modules/inventorySync/storeService.js",
    "src/modules/shops/model.js",
    "src/modules/shopify/service.js",
    "src/modules/shopify/client.js",
    ".env.example",
]

CFG = """tunnel: 79620ab3-36fc-4b5f-9da9-c7c664e0458d
credentials-file: /home/dev-env/.cloudflared/79620ab3-36fc-4b5f-9da9-c7c664e0458d.json

ingress:
  - hostname: wms-sys.integritistudio.us
    service: http://127.0.0.1:80
  - hostname: modren-wms.integritistudio.us
    service: http://127.0.0.1:8088
  - hostname: wms-linker-api.integritistudio.us
    service: http://127.0.0.1:3000
  - hostname: wms-demo-backend.integritistudio.us
    service: http://127.0.0.1:3000
  - hostname: wms.integritistudio.us
    service: http://127.0.0.1:3000
  - service: http_status:404
"""


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    with SCPClient(c.get_transport()) as scp:
        for rel in FILES:
            local = os.path.join(LOCAL, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                print("SKIP missing", rel)
                continue
            print("PUT", rel)
            scp.put(local, f"{REMOTE}/{rel}")

    sftp = c.open_sftp()
    with sftp.file("/tmp/cloudflared-wms.yml", "w") as f:
        f.write(CFG)
    sftp.close()

    cmd = f"""
set +e
# patch .env for production host + scopes
python3 - <<'PY'
from pathlib import Path
p = Path("{REMOTE}/.env")
lines = p.read_text().splitlines()
want = {{
  "PUBLIC_API_URL": "https://wms-demo-backend.integritistudio.us",
  "PUBLIC_APP_URL": "https://wms-demo.integritistudio.us",
  "SHOPIFY_API_KEY": "563cf41146d7f10bae04f37953d3168e",
  "SHOPIFY_HOST_NAME": "wms-demo-backend.integritistudio.us",
  "SHOPIFY_SCOPES": "read_orders,write_orders,write_returns,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_inventory,write_inventory,read_products,read_locations",
  "NODE_ENV": "production",
}}
out = []
seen = set()
for line in lines:
  if "=" not in line or line.strip().startswith("#"):
    out.append(line)
    continue
  k = line.split("=", 1)[0]
  if k in want:
    out.append(f"{{k}}={{want[k]}}")
    seen.add(k)
  else:
    out.append(line)
for k, v in want.items():
  if k not in seen:
    out.append(f"{{k}}={{v}}")
p.write_text("\\n".join(out) + "\\n")
print("env patched")
for k in want:
  print(k, "=", want[k] if "SECRET" not in k else "***")
PY

echo '{SUDO}' | sudo -S cp /tmp/cloudflared-wms.yml /etc/cloudflared/config.yml
cloudflared tunnel route dns -f 79620ab3-36fc-4b5f-9da9-c7c664e0458d wms-demo-backend.integritistudio.us 2>&1 || true
cloudflared tunnel route dns -f 79620ab3-36fc-4b5f-9da9-c7c664e0458d wms.integritistudio.us 2>&1 || true
echo '{SUDO}' | sudo -S systemctl restart cloudflared 2>&1 || true
sleep 2

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
cd {REMOTE}
# restart node
pkill -f 'node index.js' 2>/dev/null || true
sleep 1
nohup node index.js > /tmp/wms-linker-api.log 2>&1 </dev/null &
echo PID=$!
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 2
  code=$(curl -s -m 2 -o /tmp/h.json -w '%{{http_code}}' http://127.0.0.1:3000/api/health || echo 000)
  echo try$i:$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
done
tail -n 25 /tmp/wms-linker-api.log
"""
    _i, out, err = c.exec_command(cmd, timeout=120, get_pty=True)
    sys.stdout.buffer.write(out.read())
    sys.stdout.buffer.write(err.read())
    c.close()
    print("DONE")


if __name__ == "__main__":
    main()
