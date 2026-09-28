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
nvm use 20
cd /home/dev-env/wms/wms-app-backend
# hard kill anything on 3000
fuser -k 3000/tcp
pkill -9 -f 'node index.js'
sleep 3
ss -lptn | grep 3000 || echo port-free
grep -n ignoreCompareQuantity src/modules/inventorySync/shopifyInventory.js || echo field-removed-ok
nohup node index.js > /tmp/wms-boot.log 2>&1 </dev/null &
NPID=$!
echo started=$NPID
for i in $(seq 1 20); do
  sleep 2
  if curl -s -m 2 http://127.0.0.1:3000/api/health | grep -q '"ok"'; then
    echo UP
    curl -s http://127.0.0.1:3000/api/health
    echo
    exit 0
  fi
  echo wait-$i
done
echo FAILED
tail -40 /tmp/wms-boot.log
exit 1
"""
_i, out, err = c.exec_command(cmd, timeout=100)
sys.stdout.buffer.write(out.read())
sys.stdout.buffer.write(err.read())
print("exit", out.channel.recv_exit_status())
c.close()
