// Builds the public site from src/ into dist/.
//
// Every public page in src/ starts with a one-line JSON header:
//   <!--meta {"title": "...", "description": "...", "path": "/x.html", "nav": "x", "scripts": ["x.js"]} -->
// The build wraps the page in the shared <head>, navigation and footer from src/partials,
// and fills in {{placeholders}} from site.config.json. Pages with "layout": "none" (admin)
// only get the placeholders filled in.
//
// SITE_URL is the address the site is really published at. On Netlify it comes from the
// URL variable Netlify sets automatically, so canonical links and social previews are
// always right without editing any file.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.join(root, "src");
const out = path.join(root, process.env.BUILD_OUT || "dist");
const config = JSON.parse(fs.readFileSync(path.join(root, "site.config.json"), "utf8"));

export function siteUrl(env = process.env) {
  const raw = env.SITE_URL || env.URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + env.VERCEL_PROJECT_PRODUCTION_URL : "") ||
    "http://localhost:8888";
  return raw.replace(/\/+$/, "");
}

const escAttr = (s) => String(s).replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const partial = (name) => fs.readFileSync(path.join(src, "partials", name + ".html"), "utf8");

function analytics() {
  const domain = process.env.PLAUSIBLE_DOMAIN;
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) return "";
  return `  <script defer data-domain="${domain}" src="https://plausible.io/js/script.js"></script>`;
}

function fill(text, vars, nav) {
  return text
    .replace(/\{\{> ([a-z-]+)\}\}/g, (_, n) => partial(n))
    .replace(/\{\{current:([a-z-]+)\}\}/g, (_, n) => (n === nav ? ' aria-current="page"' : ""))
    .replace(/\{\{([a-zA-Z_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export function build() {
  const url = siteUrl();
  const buildId = Date.now().toString(36);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(path.join(src, "assets"), path.join(out, "assets"), { recursive: true });

  const base = { ...config, site_url: url, year: String(new Date().getFullYear()), build: buildId, analytics: analytics() };
  const pages = [];

  for (const file of fs.readdirSync(src).filter((f) => f.endsWith(".html"))) {
    let text = fs.readFileSync(path.join(src, file), "utf8");
    const m = text.match(/^<!--meta (\{.*\}) -->\r?\n/);
    if (!m) throw new Error(`${file} has no <!--meta {...} --> header`);
    const meta = JSON.parse(m[1]);
    text = text.slice(m[0].length);
    const vars = { ...base, title: escAttr(meta.title), description: escAttr(meta.description || ""), path: meta.path };

    let html;
    if (meta.layout === "none") {
      html = fill(text, vars, meta.nav);
    } else {
      const extraHead = (text.match(/<!--head-->([\s\S]*?)<!--\/head-->/) || [, ""])[1];
      const body = text.replace(/<!--head-->[\s\S]*?<!--\/head-->\r?\n?/, "");
      const scripts = ["site.js", ...(meta.scripts || [])]
        .map((s) => `<script src="/assets/${s}?v=${buildId}" defer></script>`).join("\n");
      html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
${partial("head")}${extraHead}
</head>
<body>
<a href="#main" class="skip-link">Skip to main content</a>
<div id="scroll-progress" aria-hidden="true"></div>
${partial("nav")}
${body}
${meta.newsletter === false ? "" : partial("newsletter")}
${partial("footer")}
${meta.nav === "donate" ? "" : partial("float-donate")}
${scripts}
</body>
</html>
`;
      html = fill(fill(html, vars, meta.nav), vars, meta.nav); // twice: partials can contain placeholders
    }
    const left = html.match(/\{\{[^}]+\}\}/);
    if (left) throw new Error(`${file}: unknown placeholder ${left[0]}`);
    fs.writeFileSync(path.join(out, file), html);
    if (meta.sitemap !== false && meta.layout !== "none") pages.push(meta.path);
  }

  fs.writeFileSync(path.join(out, "robots.txt"),
    `User-agent: *\nDisallow: /admin.html\nDisallow: /api/\nSitemap: ${url}/sitemap.xml\n`);
  fs.writeFileSync(path.join(out, "static-pages.json"), JSON.stringify(pages));
  return { out, url, pages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const r = build();
  console.log(`Built ${r.pages.length} pages into ${path.relative(root, r.out)} for ${r.url}`);
}
