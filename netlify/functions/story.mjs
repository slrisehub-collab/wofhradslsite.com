import { store } from "../lib/db.mjs";
import { fillTemplate, plainText, renderArticle } from "../lib/render.mjs";
import { cdnCache, html, isId, wrap } from "../lib/util.mjs";
import ARCHIVE from "../lib/archive-content.mjs";

// /stories/<id> for stories written in the admin panel: a real HTML page, so search
// engines index it and WhatsApp, Facebook and X show its title, summary and photo.
// Stories carried over from the old website (content/stories/) are bundled with this
// function at build time and rendered the same way.
//
// The layout (head, navigation, footer) comes from story-template.html, built from the
// same partials as every other page. This function fetches it from the site itself.
let cached = { at: 0, text: "" };
async function template(origin) {
  if (cached.text && Date.now() - cached.at < 300000) return cached.text;
  const res = await fetch(`${origin}/story-template.html`);
  if (!res.ok) throw new Error(`story template: ${res.status}`);
  cached = { at: Date.now(), text: await res.text() };
  return cached.text;
}
export const resetTemplateCache = () => { cached = { at: 0, text: "" }; };

const imgUrl = (id, sm) => `/api/image?id=${id}${sm ? "&size=sm" : ""}`;

const notFound = (tpl) => html(
  fillTemplate(tpl, {
    title: "Story not found", desc: "", date: "", id: "", programme: "",
    article: `<a class="back-link" href="/stories.html">&larr; All stories</a><h1>Story not found</h1><p class="story-state">This story may have been removed or is not published yet.</p>`,
  }).replace(/<link rel="canonical"[^>]*>\n?/, "").replace("</head>", '<meta name="robots" content="noindex" />\n</head>'),
  404);

export default wrap(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").filter(Boolean).pop().replace(/\.html$/, "");
  const tpl = await template(url.origin);
  const old = Object.hasOwn(ARCHIVE, id) ? ARCHIVE[id] : null;
  if (old) {
    const pageUrl = `${url.origin}/stories/${id}`;
    const page = fillTemplate(tpl, {
      title: old.title, desc: old.excerpt, date: old.date, id, programme: old.programme,
      article: renderArticle(old, pageUrl), image: old.cover ? url.origin + old.cover.full : null,
    });
    return html(page, 200, cdnCache(["posts", "archive"], 86400));
  }
  if (!isId(id)) return notFound(tpl);
  const post = await store("posts").get(id, { type: "json" });
  if (!post || post.status !== "published") return notFound(tpl);

  const date = post.publishedAt || post.createdAt;
  const images = (post.images || []).map((i) => ({ full: imgUrl(i), small: imgUrl(i, true), alt: "" }));
  const article = renderArticle({
    title: post.title, date, programme: post.programme, body: post.body, images,
    cover: post.cover ? { full: imgUrl(post.cover), alt: "" } : null,
  }, `${url.origin}/stories/${id}`);
  const page = fillTemplate(tpl, {
    title: post.title, desc: (post.excerpt || plainText(post.body).slice(0, 200)).trim(), date, id, article, programme: post.programme,
    image: post.cover ? url.origin + imgUrl(post.cover) : null,
  });
  return html(page, 200, cdnCache(["posts", `post-${id}`], 86400));
});

export const config = { path: "/stories/*" };
