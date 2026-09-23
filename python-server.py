# Based on:
# https://stackoverflow.com/a/21957017
# https://gist.github.com/HaiyangXu/ec88cbdce3cdbac7b8d5
# A simple python server to serve wasm files with the correct mime type

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys

class Handler(SimpleHTTPRequestHandler):
    # Keep connections alive. With the default HTTP/1.0 the socket is closed
    # after every response, and on Windows that close can reset the connection
    # before a large file (the wasm glue, three.js) has been fully delivered:
    # net::ERR_CONNECTION_RESET with a 200 status. The handler always sends
    # Content-Length, so HTTP/1.1 keep-alive is safe.
    protocol_version = "HTTP/1.1"
    extensions_map = {
        '': 'application/octet-stream',
        '.css':	'text/css',
        '.html': 'text/html',
        '.jpg': 'image/jpg',
        '.js':	'application/x-javascript',
        '.json': 'application/json',
        '.manifest': 'text/cache-manifest',
        '.png': 'image/png',
        '.wasm':	'application/wasm',
        '.xml': 'application/xml',
    }

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        SimpleHTTPRequestHandler.end_headers(self)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    # One thread per connection. A single-threaded server blocks on any idle
    # connection (browsers open spare "preconnect" sockets, and keep-alive
    # connections stay open), so it stops answering every other request. The
    # Pthread builds make this likely: each worker thread fetches the same
    # script at once.
    with ThreadingHTTPServer(("localhost", port), Handler) as httpd:
        print("Serving on port", port)
        httpd.serve_forever()