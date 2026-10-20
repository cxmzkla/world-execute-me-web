#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地预览服务：静态文件 + 强制不缓存。

python -m http.server 只发 Last-Modified，Chrome 会按"文件多久没改"做启发式缓存。
改动 ES module 之后刷新页面，可能还是旧代码 —— 左栏台词显示成英文就是这么来的。
这个 handler 给每个响应加 no-store，改完文件刷一下就是新的。
"""
import functools
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8098
ROOT = sys.argv[2] if len(sys.argv) > 2 else '.'


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    handler = functools.partial(Handler, directory=ROOT)
    with Server(('127.0.0.1', PORT), handler) as httpd:
        print('serving %s on http://127.0.0.1:%d (no-store)' % (ROOT, PORT), flush=True)
        httpd.serve_forever()
