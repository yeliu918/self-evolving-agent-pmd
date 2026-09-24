#!/usr/bin/env bash
# Keep the playground UI on :8080 without tying it to a Cursor agent shell.
# Mirrors the long-lived site-8765 tmux server on this pod.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SESSION="site-8080"
PORT=8080
URL="http://127.0.0.1:${PORT}/"
PLAYGROUND="${URL}index.html#playground"

python3 "$ROOT/prepare_expt_data.py" >/dev/null

port_up() {
    curl -sf -o /dev/null --connect-timeout 1 "$URL"
}

ensure_supervisor() {
    command -v tmux >/dev/null 2>&1 || return 0
    tmux has-session -t "$SESSION" 2>/dev/null && return 0
    tmux new-session -d -s "$SESSION" -c "$ROOT" \
        "while true; do
            if curl -sf -o /dev/null --connect-timeout 1 '${URL}'; then
                sleep 2
            else
                python3 -m http.server ${PORT} --bind 0.0.0.0
            fi
        done"
}

if ! port_up; then
    if command -v tmux >/dev/null 2>&1; then
        tmux has-session -t "$SESSION" 2>/dev/null && tmux kill-session -t "$SESSION" || true
        tmux new-session -d -s "$SESSION" -c "$ROOT" "python3 -m http.server ${PORT} --bind 0.0.0.0"
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            port_up && break
            sleep 0.15
        done
    fi
fi
ensure_supervisor

# Cursor hybrid auto-forward matches this exact form.
echo "Serving HTTP on 0.0.0.0 port ${PORT} (${URL}) ..."
echo "$PLAYGROUND"

# asExternalUri + allowTunneling: creates the laptop:8080 tunnel Simple Browser needs.
if [[ -n "${VSCODE_IPC_HOOK_CLI:-}" && -x "${BROWSER:-}" ]]; then
    "$BROWSER" "$PLAYGROUND" >/dev/null 2>&1 || true
fi

port_up || true
