#!/usr/bin/env python3
"""One-shot SSH helper for devenv deploy tasks."""
import sys
import paramiko

HOST = "172.16.2.7"
USER = "dev-env"
PASSWORD = "12345678@@"


def connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    return client


def _out(text: str) -> None:
    buf = getattr(sys.stdout, "buffer", None)
    data = text.encode("utf-8", "replace") if isinstance(text, str) else text
    if buf is not None:
        buf.write(data)
        buf.flush()
    else:
        sys.stdout.write(data.decode("utf-8", "replace"))
        sys.stdout.flush()


def run(cmd: str, timeout: int = 600) -> int:
    client = connect()
    _out(f"$ {cmd[:300]}{'...' if len(cmd) > 300 else ''}\n")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    while True:
        line = stdout.readline()
        if not line:
            break
        if isinstance(line, bytes):
            _out(line.decode("utf-8", "replace"))
        else:
            _out(line)
    err = stderr.read()
    if err:
        _out(err.decode("utf-8", "replace") if isinstance(err, bytes) else err)
    code = stdout.channel.recv_exit_status()
    client.close()
    return code


def put(local: str, remote: str) -> int:
    client = connect()
    sftp = client.open_sftp()
    print(f"PUT {local} -> {remote}", flush=True)
    sftp.put(local, remote)
    sftp.close()
    client.close()
    print("OK", flush=True)
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: _ssh_run.py run <cmd> | put <local> <remote>")
        sys.exit(2)
    op = sys.argv[1]
    if op == "run":
        sys.exit(run(" ".join(sys.argv[2:])))
    if op == "put":
        sys.exit(put(sys.argv[2], sys.argv[3]))
    print("unknown op", op)
    sys.exit(2)
