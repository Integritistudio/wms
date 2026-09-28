#!/usr/bin/env python3
import sys
import time
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("172.16.2.7", username="dev-env", password="12345678@@", timeout=30)


def run(cmd, timeout=60):
    print(">>>", cmd[:160], flush=True)
    _i, out, err = c.exec_command(cmd, timeout=timeout)
    text = out.read().decode("utf-8", "replace")
    etext = err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    sys.stdout.write(text)
    if etext.strip():
        sys.stdout.write("ERR " + etext[:800] + "\n")
    print("code", code, flush=True)
    return code, text


run("fuser -k 3000/tcp; pkill -9 -f 'node index.js'; sleep 2; ss -lptn | grep 3000 || echo free")
run("grep -n ignoreCompareQuantity /home/dev-env/wms/wms-app-backend/src/modules/inventorySync/shopifyInventory.js || echo removed")
run(
    "bash -lc 'export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm use 20; "
    "cd /home/dev-env/wms/wms-app-backend; "
    "nohup node index.js > /tmp/wms-boot.log 2>&1 </dev/null & echo PID=$!'"
)
time.sleep(14)
run("curl -s http://127.0.0.1:3000/api/health; echo; ss -lptn | grep 3000; tail -25 /tmp/wms-boot.log")
c.close()
