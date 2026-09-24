#!/usr/bin/env python3
"""Detach a restarting static file server from the parent (Cursor) shell.

Port 8080 used to die whenever an agent background task was aborted, which
is why the browser showed Error Code -102. This process double-forks into
its own session, listens on IPv4 0.0.0.0, and restarts if the child exits.

Always print http://127.0.0.1:PORT/ so Cursor hybrid auto-forward can see it.
"""
from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

from prepare_expt_data import ensure_experiment_data

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("UI_PORT", "8080"))
LOG = Path(os.environ.get("UI_SERVER_LOG", "/tmp/harness-evo-ui-8080.log"))
PIDFILE = Path(os.environ.get("UI_SERVER_PID", "/tmp/harness-evo-ui-8080.pid"))


def port_open(host: str, port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.4)
    try:
        sock.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def already_serving() -> bool:
    return port_open("127.0.0.1", PORT)


def read_pid() -> int | None:
    try:
        return int(PIDFILE.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stop_existing() -> None:
    pid = read_pid()
    if pid and pid_alive(pid):
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
        for _ in range(20):
            if not pid_alive(pid):
                break
            time.sleep(0.05)
        if pid_alive(pid):
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass
    # Child http server may outlive the supervisor briefly.
    subprocess.run(
        ["pkill", "-f", f"{ROOT / '_http_server.py'} {PORT}"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.time() + 2
    while time.time() < deadline and already_serving():
        time.sleep(0.05)


def daemonize() -> None:
    if os.fork() > 0:
        os._exit(0)
    os.setsid()
    if os.fork() > 0:
        os._exit(0)
    os.chdir(ROOT)
    os.umask(0)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    log = open(LOG, "a", buffering=1)
    devnull = open(os.devnull, "r")
    os.dup2(devnull.fileno(), 0)
    os.dup2(log.fileno(), 1)
    os.dup2(log.fileno(), 2)
    PIDFILE.write_text(str(os.getpid()), encoding="utf-8")


def serve_loop() -> None:
    child = ROOT / "_http_server.py"
    while True:
        print(
            f"{time.strftime('%Y-%m-%dT%H:%M:%S')} starting IPv4 http.server {PORT} in {ROOT}",
            flush=True,
        )
        proc = subprocess.run([sys.executable, str(child), str(PORT)], cwd=ROOT)
        print(
            f"{time.strftime('%Y-%m-%dT%H:%M:%S')} exited {proc.returncode}; restart in 1s",
            flush=True,
        )
        time.sleep(1)


def main() -> int:
    ensure_experiment_data()

    # Printed to the launching terminal so Cursor hybrid port detection
    # can auto-forward even when the daemon is already up.
    print(f"http://127.0.0.1:{PORT}/", flush=True)
    print(f"http://127.0.0.1:{PORT}/index.html#playground", flush=True)

    force = bool(os.environ.get("UI_SERVER_FORCE"))
    if already_serving() and not force:
        print(f"already listening on http://127.0.0.1:{PORT}/", file=sys.stderr)
        return 0
    if force:
        stop_existing()
    daemonize()
    serve_loop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
