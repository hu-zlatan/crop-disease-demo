"""Local dev server for the demo.

Run from this folder:   python serve.py
Then open http://localhost:8000  (the camera works on localhost, which browsers
treat as a secure context). Sets the MIME types ONNX Runtime Web needs for its
.mjs / .wasm files, which Python's default server gets wrong.
"""
import http.server
import socketserver

PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".onnx": "application/octet-stream",
    }

    def end_headers(self):
        # Disable caching during development so edits show up on reload.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Demo running at  http://localhost:{PORT}   (Ctrl+C to stop)")
        httpd.serve_forever()
