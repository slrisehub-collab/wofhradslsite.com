import { listAll } from "../lib/posts.mjs";
import { allStaff } from "../lib/staff.mjs";
import { cdnCache, esc, wrap } from "../lib/util.mjs";

// /sitemap.xml: every public page plus every published story (old and new).
export default wrap(async (req) => {
  const origin = new URL(req.url).origin;
  let pages = ["/"];
  try {
    const r = await fetch(`${origin}/static-pages.json`);
    if (r.ok) pages = await r.json();
  } catch { /* fall back to the homepage alone */ }
  const stories = await listAll();
  const team = (await allStaff()).filter((s) => s.visible !== false);
  const urls = [
    ...pages.map((p) => `<url><loc>${esc(origin + p)}</loc></url>`),
    ...team.map((s) => `<url><loc>${esc(`${origin}/team/${s.slug}`)}</loc></url>`),
    ...stories.map((p) => `<url><loc>${esc(origin + p.url)}</loc><lastmod>${esc((p.updatedAt || p.date).slice(0, 10))}</lastmod></url>`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", ...cdnCache(["posts"], 3600) } });
});

export const config = { path: "/sitemap.xml" };
