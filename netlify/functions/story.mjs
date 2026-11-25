import { store } from "../lib/db.mjs";
import { PROGRAMMES } from "../lib/posts.mjs";
import { cdnCache, esc, html, isId, wrap } from "../lib/util.mjs";

// /stories/<id> is a real HTML page for each story, so search engines index it and
// WhatsApp, Facebook and X show its title, summary and photo when it is shared.
//
// The page layout (head, navigation, footer) comes from story-template.html, which the
// build makes from the same partials as every other page. This function fetches that
// file from the site itself and fills in the story.
const LABELS = {
  "icsp": "Women's Empowerment (ICSP)", "girls-circle": "Girls Circle Collective", "people-to-people": "People to People",
  "gesa": "Gender Equality & Accountability", "peacebuilding": "Peacebuilding",
};
let cached = { at: 0, text: "" };
async function template(origin) {
  if (cached.text && Date.now() - cached.at < 300000) return cached.text;
  const res = await fetch(`${origin}/story-template.html`);
  if (!res.ok) throw new Error(`story template: ${res.status}`);
  cached = { at: Date.now(), text: await res.text() };
  return cached.text;
}
export const resetTemplateCache = () => { cached = { at: 0, text: "" }; };

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const imgUrl = (origin, id, sm) => `${origin}/api/image?id=${id}${sm ? "&size=sm" : ""}`;

function article(post, origin, shareUrl) {
  const parts = [`<a class="back-link" href="/stories.html">&larr; All stories</a>`];
  const tag = post.programme && PROGRAMMES.includes(post.programme)
    ? ` <a class="story-tag" href="/stories.html?programme=${post.programme}">${esc(LABELS[post.programme])}</a>` : "";
  parts.push(`<span class="story-date"><time datetime="${esc(post.publishedAt || post.createdAt)}">${fmtDate(post.publishedAt || post.createdAt)}</time>${tag}</span>`);
  parts.push(`<h1>${esc(post.title)}</h1>`);
  if (post.cover) parts.push(`<img class="story-cover" src="${imgUrl("", post.cover)}" alt="" fetchpriority="high" />`);
  const paras = post.body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n");
  parts.push(`<div class="story-text">${paras}</div>`);
  const extra = (post.images || []).filter((i) => i !== post.cover);
  if (extra.length) {
    parts.push(`<div class="story-gallery">${extra.map((i) =>
      `<a href="${imgUrl("", i)}" target="_blank" rel="noopener"><img src="${imgUrl("", i, true)}" loading="lazy" alt="Photo from: ${esc(post.title)}" /></a>`).join("")}</div>`);
  }
  const s = encodeURIComponent(shareUrl);
  parts.push(`<div class="share-row"><strong>Share this story</strong>
<a class="share-btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(post.title + " " + shareUrl)}">WhatsApp</a>
<a class="share-btn" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${s}">Facebook</a>
<a class="share-btn" target="_blank" rel="noopener noreferrer" href="https://x.com/intent/post?text=${encodeURIComponent(post.title)}&amp;url=${s}">X</a>
<button type="button" class="share-btn" id="copy-link" data-url="${esc(shareUrl)}" hidden>Copy link</button></div>`);
  return parts.join("\n");
}

const notFound = (tpl) => html(
  tpl.replace(/__STORY_TITLE__/g, "Story not found").replace(/__STORY_DESC__/g, "").replace(/__STORY_ID__/g, "").replace(/__STORY_DATE__/g, "")
    .replace("<!--STORY_BODY-->", `<a class="back-link" href="/stories.html">&larr; All stories</a><h1>Story not found</h1><p class="story-state">This story may have been removed or is not published yet.</p>`)
    .replace(/<link rel="canonical"[^>]*>\n?/, "").replace("</head>", '<meta name="robots" content="noindex" />\n</head>'),
  404);

export default wrap(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").filter(Boolean).pop();
  const tpl = await template(url.origin);
  if (!isId(id)) return notFound(tpl);
  const post = await store("posts").get(id, { type: "json" });
  if (!post || post.status !== "published") return notFound(tpl);

  const pageUrl = `${url.origin}/stories/${id}`;
  const desc = (post.excerpt || post.body.replace(/\s+/g, " ").slice(0, 200)).trim();
  let page = tpl
    .replace(/__STORY_TITLE__/g, esc(post.title))
    .replace(/__STORY_DESC__/g, esc(desc))
    .replace(/__STORY_DATE__/g, esc(post.publishedAt || post.createdAt))
    .replace(/__STORY_ID__/g, id)
    .replace("<!--STORY_BODY-->", article(post, url.origin, pageUrl))
    .replace('<meta property="og:type" content="website" />', '<meta property="og:type" content="article" />');
  if (post.cover) page = page.replace(/content="[^"]*\/assets\/img\/og-image\.jpg"/g, `content="${imgUrl(url.origin, post.cover)}"`);
  return html(page, 200, cdnCache(["posts", `post-${id}`], 86400));
});

export const config = { path: "/stories/*" };
