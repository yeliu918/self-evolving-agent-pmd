#!/usr/bin/env python3
"""IPv4 static file server for the playground UI.

Bind 0.0.0.0 (not IPv6 ::) so the listen socket appears in /proc/net/tcp.
Cursor auto-forwards from that table; a dual-stack :: bind is invisible there
and the laptop then shows Error -102 on http://127.0.0.1:8080/.
"""
from __future__ import annotations

import http.server
import os
import sys
from functools import partial

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.abspath(__file__))


class IPv4Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> int:
    os.chdir(ROOT)
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    IPv4Server.allow_reuse_address = True
    with IPv4Server(("0.0.0.0", PORT), handler) as httpd:
        print(
            f"Serving HTTP on 0.0.0.0 port {PORT} (http://127.0.0.1:{PORT}/) ...",
            flush=True,
        )
        httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
