#!/usr/bin/env python3
import sys
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
cmd = r"""
set +e
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
cd /home/dev-env/wms/wms-app-backend
# verify secrets present
python3 - <<'PY'
from pathlib import Path
t=Path('.env').read_text().splitlines()
for line in t:
  if line.startswith(('SHOPIFY_','PUBLIC_','PORT=','MONGODB_URI=','JWT_')):
    k,v=line.split('=',1)
    if 'SECRET' in k or 'PASSWORD' in k or 'URI' in k or 'PASS' in k:
      print(f'{k}=***len{len(v)}')
    else:
      print(line)
PY
pkill -f 'node index.js' 2>/dev/null
fuser -k 3000/tcp 2>/dev/null
sleep 1
# run detached properly
nohup node index.js >> /tmp/wms-linker-api.log 2>&1 </dev/null &
echo started:$!
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  code=$(curl -s -m 2 -o /tmp/h.json -w '%{http_code}' http://127.0.0.1:3000/api/health || echo 000)
  echo try$i:$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
done
ss -lptn | grep 3000 || echo 'NOT LISTENING'
tail -n 60 /tmp/wms-linker-api.log
"""
_i, out, err = c.exec_command(cmd, timeout=90, get_pty=True)
sys.stdout.buffer.write(out.read())
c.close()
