// Builds the public site from src/ into dist/, and the story archive from content/.
//
// Every page in src/ (including subfolders such as src/programmes/) starts with a
// one-line JSON header:
//   <!--meta {"title": "...", "description": "...", "path": "/x.html", "nav": "x", "scripts": ["x.js"]} -->
// The build wraps the page in the shared <head>, navigation and footer from src/partials,
// fills in {{placeholders}} from site.config.json and expands photo galleries:
//   <!--gallery
//   image-key | Alt text describing the photo
//   -->
// Pages with "layout": "none" (admin) only get the placeholders filled in.
//
// Stories carried over from the old website live in content/stories/*.md. The build
// turns them into two modules the server functions import:
//   netlify/lib/archive-index.mjs    summaries for lists, search, the sitemap and RSS
//   netlify/lib/archive-content.mjs  full text for the story pages
//
// SITE_URL is the address the site is really published at. On Netlify it comes from the
// URL variable Netlify sets automatically, so canonical links and social previews are
// always right without editing any file.
import fs from "node:fs";
import path from "node:path";
import { readingMinutes, plainText } from "../netlify/lib/render.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.join(root, "src");
const out = path.join(root, process.env.BUILD_OUT || "dist");
const config = JSON.parse(fs.readFileSync(path.join(root, "site.config.json"), "utf8"));
const PROGRAMMES = ["icsp", "girls-circle", "people-to-people", "gesa", "peacebuilding"];

export function siteUrl(env = process.env) {
  const raw = env.SITE_URL || env.URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + env.VERCEL_PROJECT_PRODUCTION_URL : "") ||
    "http://localhost:8888";
  return raw.replace(/\/+$/, "");
}

const escAttr = (s) => String(s).replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const partial = (name) => fs.readFileSync(path.join(src, "partials", name + ".html"), "utf8");
const contentImg = (key, small) => {
  const rel = `/assets/content/${key}${small ? "-sm" : ""}.webp`;
  if (!fs.existsSync(path.join(src, rel))) throw new Error(`Missing image ${rel}`);
  return rel;
};

function analytics() {
  const domain = process.env.PLAUSIBLE_DOMAIN;
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) return "";
  return `  <script defer data-domain="${domain}" src="https://plausible.io/js/script.js"></script>`;
}

function gallery(lines) {
  const items = lines.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [key, alt] = l.split("|").map((s) => s.trim());
    if (!alt) throw new Error(`Gallery image ${key} needs alt text`);
    return `<a href="${contentImg(key)}" class="gallery-item"><img src="${contentImg(key, true)}" alt="${escAttr(alt)}" loading="lazy" /></a>`;
  });
  return `<div class="gallery" data-lightbox>\n${items.join("\n")}\n</div>`;
}

function fill(text, vars, nav) {
  return text
    .replace(/\{\{> ([a-z-]+)\}\}/g, (_, n) => partial(n))
    .replace(/<!--gallery\n([\s\S]*?)-->/g, (_, lines) => gallery(lines))
    .replace(/\{\{current:([a-z-]+)\}\}/g, (_, n) => (n === nav ? ' aria-current="page"' : ""))
    .replace(/\{\{([a-zA-Z_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// ---------- story archive ----------
export function parseStory(file) {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing --- front matter ---`);
  const meta = { images: [] };
  let inImages = false;
  for (const line of m[1].split("\n")) {
    if (/^images:\s*$/.test(line)) { inImages = true; continue; }
    const item = line.match(/^\s+-\s+(.+)$/);
    if (inImages && item) {
      const [key, alt] = item[1].split("|").map((s) => s.trim());
      if (!alt) throw new Error(`${file}: image ${key} needs alt text`);
      meta.images.push({ key, alt });
      continue;
    }
    inImages = false;
    const kv = line.match(/^([a-z]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  for (const k of ["title", "date", "excerpt"]) if (!meta[k]) throw new Error(`${file}: missing ${k}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${file}: date must look like 2023-06-01`);
  if (meta.programme && !PROGRAMMES.includes(meta.programme)) throw new Error(`${file}: unknown programme ${meta.programme}`);
  const slug = path.basename(file, ".md");
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${file}: file name must be lowercase letters, numbers and dashes`);
  const images = meta.images.map((i) => ({ full: contentImg(i.key), small: contentImg(i.key, true), alt: i.alt }));
  const coverImg = meta.cover ? images.find((i) => i.full === contentImg(meta.cover)) : null;
  if (meta.cover && !coverImg) throw new Error(`${file}: cover ${meta.cover} must also be listed under images`);
  let news = null;
  if (meta.news) {
    const [label, url] = meta.news.split("|").map((s) => s.trim());
    if (!/^https:\/\//.test(url || "")) throw new Error(`${file}: news needs "Label | https://..."`);
    news = { label, url };
  }
  const date = `${meta.date}T09:00:00.000Z`;
  return {
    slug,
    full: { title: meta.title, date, programme: meta.programme || null, body: m[2].trim(), excerpt: meta.excerpt, images, cover: coverImg ? { full: coverImg.full, alt: coverImg.alt } : null, byline: meta.byline || null, news },
    summary: {
      id: slug, title: meta.title, excerpt: meta.excerpt, cover: null, coverUrl: coverImg ? coverImg.small : null, url: `/stories/${slug}`,
      readingMinutes: readingMinutes(m[2]), programme: meta.programme || null, status: "published", date, updatedAt: date, archive: true,
    },
  };
}

export function buildArchive() {
  const dir = path.join(root, "content", "stories");
  const stories = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => parseStory(path.join(dir, f)));
  stories.sort((a, b) => b.full.date.localeCompare(a.full.date));
  const head = "// Generated by scripts/build.mjs from content/stories/. Do not edit by hand.\n";
  fs.writeFileSync(path.join(root, "netlify/lib/archive-index.mjs"), head + "export default " + JSON.stringify(stories.map((s) => s.summary), null, 1) + ";\n");
  fs.writeFileSync(path.join(root, "netlify/lib/archive-content.mjs"), head + "export default " + JSON.stringify(Object.fromEntries(stories.map((s) => [s.slug, s.full])), null, 1) + ";\n");
  return stories;
}

// ---------- pages ----------
function pageFiles(dir, rel = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.isDirectory()) return ["partials", "assets"].includes(d.name) && !rel ? [] : pageFiles(path.join(dir, d.name), rel + d.name + "/");
    return d.name.endsWith(".html") ? [rel + d.name] : [];
  });
}

export function build() {
  const url = siteUrl();
  const buildId = Date.now().toString(36);
  const stories = buildArchive();
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(path.join(src, "assets"), path.join(out, "assets"), { recursive: true });
  fs.copyFileSync(path.join(src, "manifest.webmanifest"), path.join(out, "manifest.webmanifest"));

  const base = { ...config, site_url: url, year: String(new Date().getFullYear()), build: buildId, analytics: analytics(), story_count: String(stories.length) };
  const pages = [];

  for (const file of pageFiles(src)) {
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
    fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
    fs.writeFileSync(path.join(out, file), html);
    if (meta.sitemap !== false && meta.layout !== "none") pages.push(meta.path);
  }

  // Offline support: the service worker is versioned with this build, so each deploy
  // replaces the old cached copy of the site.
  fs.writeFileSync(path.join(out, "sw.js"), fs.readFileSync(path.join(src, "sw.js"), "utf8").replace(/__BUILD__/g, buildId));
  fs.writeFileSync(path.join(out, "robots.txt"),
    `User-agent: *\nDisallow: /admin.html\nDisallow: /api/\nDisallow: /story-template.html\nSitemap: ${url}/sitemap.xml\n`);
  fs.writeFileSync(path.join(out, "static-pages.json"), JSON.stringify(pages));
  return { out, url, pages, stories: stories.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const r = build();
  console.log(`Built ${r.pages.length} pages and ${r.stories} archived stories into ${path.relative(root, r.out)} for ${r.url}`);
}
