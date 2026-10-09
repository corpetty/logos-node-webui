#!/usr/bin/env python3
"""Serve the built web UI (dist/) and reverse-proxy /api/* to a local Logos node.

Same shape as the DAppNode package's nginx: /api/<path> -> <node>/<path>, everything
else is a static file with SPA fallback to index.html. Stdlib only, so it runs on any
CLI node box without Docker or nginx. Streams responses (SSE endpoints stay live).

  python3 serve.py --dist ./dist --node http://127.0.0.1:8080 --host 100.x.y.z --port 8095
"""
import argparse
import http.client
import os
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
       "te", "trailers", "transfer-encoding", "upgrade", "host"}


def make_handler(dist, node):
    up = urllib.parse.urlsplit(node)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=dist, **kw)

        def log_message(self, *_):
            pass

        def end_headers(self):
            # index.html must not be cached, or a browser keeps an old bundle after an update.
            if not self.path.startswith("/assets/") and not self.path.startswith("/api/"):
                self.send_header("Cache-Control", "no-cache")
            super().end_headers()

        def _proxy(self):
            path = self.path[len("/api"):] or "/"
            body = None
            n = int(self.headers.get("Content-Length") or 0)
            if n:
                body = self.rfile.read(n)
            headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
            conn = http.client.HTTPConnection(up.hostname, up.port or 80, timeout=300)
            try:
                conn.request(self.command, path, body=body, headers=headers)
                r = conn.getresponse()
            except OSError as e:
                self.send_error(502, f"node unreachable: {e}")
                return
            self.send_response(r.status)
            for k, v in r.getheaders():
                if k.lower() not in HOP and k.lower() != "content-length":
                    self.send_header(k, v)
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                while True:
                    chunk = r.read1(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                conn.close()
                self.close_connection = True

        def _static(self):
            p = urllib.parse.urlsplit(self.path).path
            if not os.path.isfile(os.path.join(dist, p.lstrip("/"))):
                self.path = "/index.html"
            super().do_GET()

        def do_GET(self):
            self._proxy() if self.path.startswith("/api/") else self._static()

        def do_HEAD(self):
            self._proxy() if self.path.startswith("/api/") else super().do_HEAD()

        def do_POST(self):
            self._proxy() if self.path.startswith("/api/") else self.send_error(405)

        do_PUT = do_POST
        do_DELETE = do_POST

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist"))
    ap.add_argument("--node", default="http://127.0.0.1:8080")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8095)
    a = ap.parse_args()
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(os.path.abspath(a.dist), a.node))
    srv.daemon_threads = True
    print(f"web UI on http://{a.host}:{a.port} -> node {a.node}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
