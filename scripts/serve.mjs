import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(process.env.SERVE_DIR || resolve(ROOT, "dist"));
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
};

createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const path = resolve(DIST, relative);
  if (!path.startsWith(DIST) || !existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": TYPES[extname(path)] || "application/octet-stream",
    "cache-control": "no-cache",
  });
  createReadStream(path).pipe(response);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`本地预览：http://127.0.0.1:${PORT}/`);
});
