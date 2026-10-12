#!/usr/bin/env python3
import paramiko
from pathlib import Path

HOST = "172.16.2.7"
USER = "dev-env"
PASSWORD = "12345678@@"
OUT = Path(__file__).with_name("_probe_out.txt")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

chunks = []

def run(label, cmd):
    chunks.append(f"\n=== {label} ===\n")
    _i, out, err = c.exec_command(cmd, timeout=60)
    chunks.append(out.read().decode("utf-8", errors="replace"))
    e = err.read().decode("utf-8", errors="replace")
    if e.strip():
        chunks.append(e)

run("home", "ls -la /home/dev-env | head -50")
run("wms", "ls -la /home/dev-env/wms 2>/dev/null | head -80; ls -la /var/www 2>/dev/null | head -40")
run("node", "export NVM_DIR=$HOME/.nvm; [ -s $NVM_DIR/nvm.sh ] && . $NVM_DIR/nvm.sh; which node; node -v; which npm; npm -v")
run("ports", "ss -lptn | head -100")
run("pg", "which psql; psql --version 2>/dev/null; which docker; docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | head")
run("find email", "find /home/dev-env -maxdepth 3 -type d -name 'wms-*' 2>/dev/null | head -40")

c.close()
OUT.write_text("".join(chunks), encoding="utf-8")
print(f"wrote {OUT}")
