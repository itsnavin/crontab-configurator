import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve(process.env.SERVE_DIST === "1" ? "dist" : ".");
const port = Number(process.env.PORT || 43827);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end("Invalid URL"); return; }
  const path = resolve(root, `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`);
  if (!path.startsWith(root + sep) || pathname.split("/").some((part) => part.startsWith("."))) {
    response.writeHead(403).end("Forbidden"); return;
  }
  try {
    if (!(await stat(path)).isFile()) { response.writeHead(404).end("Not found"); return; }
    response.writeHead(200, { "Content-Type": mime[extname(path)] || "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
    response.end(await readFile(path));
  } catch (error) {
    if (error.code !== "ENOENT") console.error(error);
    response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Unable to serve file");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Preview: http://127.0.0.1:${port}`));
