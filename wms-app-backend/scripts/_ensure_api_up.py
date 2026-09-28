#!/usr/bin/env python3
import sys, paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)
cmd = r'''
set +e
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null
cd /home/dev-env/wms/wms-app-backend
fuser -k 3000/tcp 2>/dev/null
pkill -f "node index.js" 2>/dev/null
sleep 1
nohup node index.js >> /tmp/wms-linker-api.log 2>&1 </dev/null &
for i in $(seq 1 15); do
  sleep 2
  code=$(curl -s -m 2 -o /tmp/h.json -w "%{http_code}" http://127.0.0.1:3000/api/health || echo 000)
  echo try$i:$code
  if [ "$code" = "200" ]; then cat /tmp/h.json; echo; break; fi
done
ss -lptn | grep 3000 || echo NOT_LISTENING
tail -n 30 /tmp/wms-linker-api.log
curl -s -m 10 -o /tmp/p.json -w "public:%{http_code}\n" https://wms-linker-api.integritistudio.us/api/health
cat /tmp/p.json 2>/dev/null; echo
'''
_i,o,e=c.exec_command(cmd, timeout=80, get_pty=True)
sys.stdout.buffer.write(o.read()); c.close()
