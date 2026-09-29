import { store } from "../lib/db.mjs";
import { esc, isId, wrap } from "../lib/util.mjs";

// /share/<story-id> gives WhatsApp, Facebook and X a page with the story's
// title, summary and photo, then sends real visitors on to the story.
//
// Netlify invokes this function directly for the path "/share/<id>", so the id
// is the last path segment. Vercel has no equivalent path-based routing for
// functions outside /api, so vercel.json rewrites "/share/:id" to "/api/share"
// and Vercel appends the captured id as a query string instead. Checking the
// query string first makes the same file correct on both.
export default wrap(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").filter(Boolean).pop();
  const home = new Response(null, { status: 302, headers: { location: "/stories.html" } });
  if (!isId(id)) return home;

  const post = await store("posts").get(id, { type: "json" });
  if (!post || post.status !== "published") return home;

  const origin = url.origin;
  const target = `${origin}/stories.html?id=${id}`;
  const desc = post.excerpt || post.body.replace(/\s+/g, " ").slice(0, 200);
  const image = post.cover ? `${origin}/api/image?id=${post.cover}` : "";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>${esc(post.title)} | WOFHRAD-SL</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="WOFHRAD-SL">
<meta property="og:title" content="${esc(post.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${origin}/share/${id}`)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${esc(image)}">` : `<meta name="twitter:card" content="summary">`}
<meta name="twitter:title" content="${esc(post.title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<link rel="canonical" href="${esc(target)}">
</head><body><p>Redirecting to <a href="${esc(target)}">${esc(post.title)}</a>…</p></body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
});

export const config = { path: "/share/*" };
