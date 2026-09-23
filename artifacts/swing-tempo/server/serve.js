/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) plus the public website:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → marketing site (server/site/index.html)
 * - GET /privacy, /support, /delete-account → site pages (the App Store /
 *   Google Play privacy-policy, support, and account-deletion URLs)
 * - GET /site/* → site assets (CSS, logo, favicon)
 * - GET /expo-go → the Expo Go "scan to open" landing page for testers
 * Everything else falls through to static file serving from ./static-build/.
 *
 * SUPPORT_EMAIL (env) is substituted into the site pages; set it to an inbox
 * someone actually reads.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const SITE_ROOT = path.resolve(__dirname, "site");
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@3to1golf.com";
const SITE_PAGES = {
  "/": "index.html",
  "/privacy": "privacy.html",
  "/support": "support.html",
  "/delete-account": "delete-account.html",
};
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
  ".webp": "image/webp",
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

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

// Pages are read once at startup; they're small and only change on deploy.
const sitePages = Object.fromEntries(
  Object.entries(SITE_PAGES).map(([route, file]) => [
    route,
    fs
      .readFileSync(path.join(SITE_ROOT, file), "utf-8")
      .replace(/SUPPORT_EMAIL_PLACEHOLDER/g, SUPPORT_EMAIL),
  ]),
);

function serveSitePage(route, res) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=300",
  });
  res.end(sitePages[route]);
}

function serveSiteAsset(assetPath, res) {
  const filePath = path.join(SITE_ROOT, path.normalize(assetPath));
  if (!filePath.startsWith(SITE_ROOT + path.sep) || filePath.endsWith(".html") || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": MIME_TYPES[ext] || "application/octet-stream",
    "cache-control": "public, max-age=3600",
  });
  res.end(fs.readFileSync(filePath));
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
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
      return serveSitePage("/", res);
    }
  }

  const route = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (route !== "/" && SITE_PAGES[route]) {
    return serveSitePage(route, res);
  }
  if (route === "/expo-go") {
    return serveLandingPage(req, res, landingPageTemplate, appName);
  }
  if (pathname.startsWith("/site/")) {
    return serveSiteAsset(pathname.slice("/site/".length), res);
  }

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
