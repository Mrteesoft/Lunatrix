import { createServer } from "node:http";
import { access, stat } from "node:fs/promises";
import { createReadStream, watch, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sass = require("../node_modules/sass");

const currentFilePath = fileURLToPath(import.meta.url);
const frontendDir = dirname(currentFilePath);
const host = process.env.FRONTEND_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.FRONTEND_PORT || "4173", 10);
const backendBaseUrl = new URL(process.env.FRONTEND_API_PROXY_BASE_URL || "http://127.0.0.1:8000");
const shouldWatch = process.argv.includes("--watch");
const buildOnly = process.argv.includes("--build-only");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"],
  [".m4v", "video/mp4"],
  [".ico", "image/x-icon"],
]);

let activeWatchTimer = null;

function compileStyles() {
  const inputPath = join(frontendDir, "styles.scss");
  const outputPath = join(frontendDir, "styles.css");

  const compiled = sass.compile(inputPath, {
    style: "expanded",
    sourceMap: false,
  });

  writeFileSync(outputPath, compiled.css);
  process.stdout.write(`[frontend] built styles.css from styles.scss\n`);
}

function watchStyles() {
  const stylesPath = join(frontendDir, "styles.scss");

  watch(stylesPath, () => {
    if (activeWatchTimer !== null) {
      clearTimeout(activeWatchTimer);
    }

    activeWatchTimer = setTimeout(() => {
      activeWatchTimer = null;

      try {
        compileStyles();
      } catch (error) {
        process.stderr.write(
          `[frontend] failed to rebuild styles: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    }, 120);
  });

  process.stdout.write(`[frontend] watching ${stylesPath}\n`);
}

async function resolveStaticPath(requestPathname) {
  if (requestPathname === "/") {
    return join(frontendDir, "index.html");
  }

  if (requestPathname.startsWith("/static/")) {
    const relativeAssetPath = requestPathname.slice("/static/".length);
    return resolve(frontendDir, normalize(relativeAssetPath));
  }

  const relativeRequestPath = normalize(requestPathname.slice(1));
  const directPath = resolve(frontendDir, relativeRequestPath);
  const directoryIndexPath = resolve(frontendDir, relativeRequestPath, "index.html");
  const htmlPath = resolve(frontendDir, `${relativeRequestPath}.html`);

  for (const candidatePath of [directPath, directoryIndexPath, htmlPath]) {
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      // Try the next candidate path.
    }
  }

  return directPath;
}

function isFrontendFilePath(targetPath) {
  return targetPath.startsWith(frontendDir);
}

async function sendStaticFile(response, filePath) {
  if (!isFrontendFilePath(filePath)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      throw new Error("Not a file");
    }

    const contentType = contentTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function proxyRequest(request, response, pathname, search) {
  const targetUrl = new URL(`${pathname}${search}`, backendBaseUrl);
  const requestHeaders = new Headers();

  for (const [headerName, headerValue] of Object.entries(request.headers)) {
    if (headerValue === undefined || headerName.toLowerCase() === "host") {
      continue;
    }

    if (Array.isArray(headerValue)) {
      for (const value of headerValue) {
        requestHeaders.append(headerName, value);
      }
      continue;
    }

    requestHeaders.set(headerName, headerValue);
  }

  const requestInit = {
    method: request.method,
    headers: requestHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request),
  };

  const upstreamResponse = await fetch(targetUrl, requestInit);
  const responseHeaders = {};

  upstreamResponse.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  response.writeHead(upstreamResponse.status, responseHeaders);

  if (!upstreamResponse.body) {
    response.end();
    return;
  }

  Readable.fromWeb(upstreamResponse.body).pipe(response);
}

function shouldProxyPath(pathname) {
  return (
    pathname === "/docs" ||
    pathname === "/redoc" ||
    pathname === "/openapi.json" ||
    pathname.startsWith("/api/")
  );
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
  const pathname = requestUrl.pathname;

  try {
    if (shouldProxyPath(pathname)) {
      await proxyRequest(request, response, pathname, requestUrl.search);
      return;
    }

    const filePath = await resolveStaticPath(pathname);
    await sendStaticFile(response, filePath);
  } catch (error) {
    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(
      `Frontend proxy error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  try {
    compileStyles();
  } catch (error) {
    process.stderr.write(
      `[frontend] failed to build styles: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (buildOnly) {
    return;
  }

  if (shouldWatch) {
    watchStyles();
  }

  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  server.listen(port, host, () => {
    process.stdout.write(
      `[frontend] standalone server listening on http://${host}:${port} and proxying API traffic to ${backendBaseUrl.toString()}\n`,
    );
  });
}

void main();
