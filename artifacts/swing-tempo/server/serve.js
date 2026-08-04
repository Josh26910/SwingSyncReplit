/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

/**
 * Headers applied to every response. The CSP is the meaningful one: the
 * landing page is fully self-contained, so locking it to 'self' plus inline
 * styles both hardens it and provides defence-in-depth behind the host
 * validation below.
 */
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; " +
    "base-uri 'self'; form-action 'self'",
};

function writeHead(res, status, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
}

/**
 * Hosts are reflected into the landing page's HTML and into a JavaScript
 * string literal. `x-forwarded-host` is attacker-controlled — Node validates
 * the real Host header but forwards this one verbatim — so an unescaped
 * value was a straight XSS/cache-poisoning vector. Only accept something
 * that actually looks like a hostname (optionally with a port); anything
 * else falls back to the request's own Host.
 */
const HOST_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?(:\d{1,5})?$/;

function safeHost(req) {
  const candidates = [req.headers["x-forwarded-host"], req.headers["host"]];
  for (const candidate of candidates) {
    // A duplicated header arrives comma-joined; take the first hop only.
    const value = String(candidate ?? "").split(",")[0].trim();
    if (HOST_PATTERN.test(value)) return value;
  }
  return "localhost";
}

/** Belt-and-braces: even a validated host gets escaped before substitution. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    writeHead(res, 404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  writeHead(res, 200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
  const host = safeHost(req);
  const baseUrl = escapeHtml(`${protocol}://${host}`);
  const expsUrl = escapeHtml(host);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  writeHead(res, 200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  // Decode first: without this a %2e%2e%2f would be served literally, and
  // any future decoding step upstream would reopen traversal.
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    writeHead(res, 400);
    res.end("Bad Request");
    return;
  }

  const safePath = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safePath);

  // path.relative is the correct containment check — startsWith() alone
  // would also accept a sibling directory sharing the root's name prefix.
  const relative = path.relative(STATIC_ROOT, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    writeHead(res, 403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  // Sourcemaps expose the original client source. They're useful locally and
  // pure information disclosure in production.
  if (ext === ".map" && process.env.NODE_ENV === "production") {
    writeHead(res, 404);
    res.end("Not Found");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    writeHead(res, 404);
    res.end("Not Found");
    return;
  }

  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  writeHead(res, 200, {
    "content-type": contentType,
    // Hashed bundle assets are immutable; HTML must always be revalidated
    // or a deploy never reaches an existing tab.
    "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  res.end(content);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const appName = getAppName();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }

    if (pathname === "/") {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
