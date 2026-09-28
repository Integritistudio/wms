#!/usr/bin/env python3
import sys
import paramiko

HOST = "172.16.2.7"
USER = "dev-env"
PASSWORD = "12345678@@"
REMOTE = "/home/dev-env/wms/wms-app-backend"

cmd = r"""
set +e
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
cd /home/dev-env/wms/wms-app-backend
# show critical env
grep -E '^(PUBLIC_|SHOPIFY_API_KEY|SHOPIFY_SCOPES|MONGODB_URI|PORT)=' .env | sed -E 's/(SECRET|PASSWORD|URI)=.*/\1=***/'
# kill listeners on 3000
fuser -k 3000/tcp 2>/dev/null
sleep 1
nohup node index.js > /tmp/wms-linker-api.log 2>&1 &
echo PID=$!
sleep 5
ss -lptn | grep 3000
echo '--- log ---'
tail -n 80 /tmp/wms-linker-api.log
echo '--- health ---'
curl -s http://127.0.0.1:3000/api/health
echo
curl -s -o /dev/null -w 'public:%{http_code}\n' https://wms-linker-api.integritistudio.us/api/health
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_i, out, err = c.exec_command(cmd, timeout=90, get_pty=True)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
c.close()
