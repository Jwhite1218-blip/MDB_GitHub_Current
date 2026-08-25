import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import process from "node:process";

const siteRoot = resolve(process.cwd(), "site");
const requestedPort = process.argv.find((value) => /^--port=\d+$/.test(value))?.split("=")[1];
const port = Number(requestedPort || process.env.PORT || 4173);
const host = "127.0.0.1";
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function safeFilePath(rawUrl) {
  const pathname = decodeURIComponent(new URL(rawUrl, `http://${host}`).pathname);
  const relative = normalize(pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
  const candidate = resolve(siteRoot, relative);
  if (candidate !== siteRoot && !candidate.startsWith(`${siteRoot}${sep}`)) return null;
  return candidate;
}

const server = createServer(async (request, response) => {
  if (!request.url || !["GET", "HEAD"].includes(request.method || "")) {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  try {
    let filePath = safeFilePath(request.url);
    if (!filePath) throw new Error("Invalid path");
    const information = await stat(filePath);
    if (information.isDirectory()) filePath = join(filePath, "index.html");
    const extension = extname(filePath).toLowerCase();
    const noCache = [".html", ".webmanifest"].includes(extension) || filePath.endsWith("service-worker.js");
    response.writeHead(200, {
      "Cache-Control": noCache ? "no-cache, no-store, must-revalidate" : "no-cache",
      "Content-Type": contentTypes[extension] || "application/octet-stream",
    });
    if (request.method === "HEAD") response.end();
    else response.end(await readFile(filePath));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : port;
  console.log(`MDB demo ready at http://${host}:${activePort}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
