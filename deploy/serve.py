#!/usr/bin/env python3
"""Serve the built web UI (dist/) and reverse-proxy /api/* to a local Logos node.

Same shape as the DAppNode package's nginx: /api/<path> -> <node>/<path>, everything
else is a static file with SPA fallback to index.html. Stdlib only, so it runs on any
CLI node box without Docker or nginx. Streams responses (SSE endpoints stay live).

  python3 serve.py --dist ./dist --node http://127.0.0.1:8080 --port 8090

Binds every interface by default (--host 0.0.0.0) so the UI is reachable on the LAN and the
Tailscale address at once, including when Tailscale comes up after this process. The UI has
mining and wallet controls and no login, so by default only clients on private networks are
served (--allow private): loopback, RFC1918 LAN, link-local, Tailscale (100.64.0.0/10 and its
IPv6 range). Anything else, e.g. a port-forwarded public address, is dropped.
"""
import argparse
import http.client
import ipaddress
import os
import socket
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PRIVATE = [ipaddress.ip_network(n) for n in (
    "127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16",
    "100.64.0.0/10",                 # Tailscale (CGNAT) IPv4
    "::1/128", "fc00::/7", "fe80::/10",  # loopback, ULA (incl. Tailscale fd7a:115c:a1e0::/48), link-local
)]

HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
       "te", "trailers", "transfer-encoding", "upgrade", "host"}


def parse_allow(spec):
    """'private' -> PRIVATE, 'any' -> None (no filtering), else comma-separated CIDRs/addresses."""
    spec = spec.strip().lower()
    if spec == "any":
        return None
    nets = []
    for part in spec.split(","):
        part = part.strip()
        if part == "private":
            nets += PRIVATE
        elif part:
            nets.append(ipaddress.ip_network(part, strict=False))
    return nets


def allowed(addr, nets):
    if nets is None:
        return True
    ip = ipaddress.ip_address(addr.split("%")[0])
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return any(ip in n for n in nets if n.version == ip.version)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow = None
    address_family = socket.AF_INET

    def verify_request(self, request, client_address):
        if allowed(client_address[0], self.allow):
            return True
        print(f"refused {client_address[0]} (not in --allow)", file=sys.stderr, flush=True)
        return False


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
    ap.add_argument("--host", default="0.0.0.0",
                    help="bind address; 0.0.0.0 = all interfaces (LAN + Tailscale), '::' for IPv6 too")
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--allow", default="private",
                    help="who may connect: 'private' (default), 'any', or comma-separated CIDRs")
    a = ap.parse_args()
    # A missing/unreadable dist otherwise shows up only as a bare 404 in the browser.
    index = os.path.join(os.path.abspath(a.dist), "index.html")
    try:
        open(index, "rb").close()
    except OSError as e:
        sys.exit(f"cannot read {index} as uid {os.getuid()}: {e.strerror}. "
                 "Check --dist (systemd does not expand ~) and that the user running this can read dist/.")
    if ":" in a.host:
        Server.address_family = socket.AF_INET6
    Server.allow = parse_allow(a.allow)
    srv = Server((a.host, a.port), make_handler(os.path.abspath(a.dist), a.node))
    print(f"web UI on http://{a.host}:{a.port} -> node {a.node} (allow: {a.allow})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
