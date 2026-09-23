// Builds the public website (server/site) into a static folder for GitHub Pages.
// Usage: node build-pages.mjs <outDir> [basePath] [supportEmail]
//  - basePath: "/SwingSyncReplit" for a project page, "" for a custom domain
//  - root-absolute links ("/privacy", "/site/x.css") are prefixed with basePath
//  - /privacy, /support, /delete-account become <page>/index.html
import fs from "node:fs";
import path from "node:path";

const [outDir, basePath = "", email = "support@3to1golf.com"] = process.argv.slice(2);
if (!outDir) throw new Error("usage: node build-pages.mjs <outDir> [basePath] [supportEmail]");
const siteDir = path.join(path.dirname(new URL(import.meta.url).pathname), "site");
const base = basePath.replace(/\/+$/, "");
const pages = { "index.html": "index.html", "privacy.html": "privacy/index.html", "support.html": "support/index.html", "delete-account.html": "delete-account/index.html" };

fs.rmSync(outDir, { recursive: true, force: true });
for (const [src, dest] of Object.entries(pages)) {
  const html = fs.readFileSync(path.join(siteDir, src), "utf8")
    .replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`)
    .replace(/SUPPORT_EMAIL_PLACEHOLDER/g, email);
  fs.mkdirSync(path.join(outDir, path.dirname(dest)), { recursive: true });
  fs.writeFileSync(path.join(outDir, dest), html);
}
// Assets are served under /site/ exactly as on the Replit server.
fs.cpSync(siteDir, path.join(outDir, "site"), { recursive: true, filter: (f) => !f.endsWith(".html") });
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
console.log(`Built ${Object.keys(pages).length} pages into ${outDir} (base "${base}")`);
