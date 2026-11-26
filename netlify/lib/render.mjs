// Turns story text into HTML. Used by the build (for archived stories) and by the
// story function (for stories written in the admin panel), so both look the same.
//
// Supported, kept deliberately simple for staff:
//   a blank line            starts a new paragraph
//   ## Heading              a section heading
//   - item                  a bulleted list (one item per line)
//   **bold**                bold text
// Everything else is escaped, so story text can never inject HTML.
import { esc } from "./util.mjs";

const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");

function renderBlock(b) {
  const lines = b.split("\n");
  // A heading line can be followed directly by more text or a list, without a blank line.
  if (/^##\s+/.test(lines[0])) {
    const head = `<h2>${inline(lines[0].replace(/^##\s+/, ""))}</h2>`;
    const rest = lines.slice(1).join("\n").trim();
    return rest ? head + "\n" + renderBlock(rest) : head;
  }
  if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
    return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
  }
  return `<p>${inline(b)}</p>`;
}

export function renderBody(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => renderBlock(block.trim()))
    .join("\n");
}

export const plainText = (text) => String(text || "").replace(/^##\s+/gm, "").replace(/^\s*[-*]\s+/gm, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
export const readingMinutes = (text) => Math.max(1, Math.round(plainText(text).split(" ").length / 200));

export const PROGRAMME_LABELS = {
  "icsp": "Women's Empowerment (ICSP)",
  "girls-circle": "Girls Circle Collective",
  "people-to-people": "People to People",
  "gesa": "Gender Equality & Accountability",
  "peacebuilding": "Peacebuilding",
};

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// The <article> contents for one story.
// story: { title, date, programme, body, images: [{ full, small, alt }], cover: { full, alt }, byline, news: { label, url } }
export function renderArticle(story, shareUrl) {
  const parts = [`<a class="back-link" href="/stories.html">&larr; All stories</a>`];
  const tag = story.programme && PROGRAMME_LABELS[story.programme]
    ? `<a class="story-tag" href="/programmes/${story.programme}.html">${esc(PROGRAMME_LABELS[story.programme])}</a>` : "";
  parts.push(`<p class="story-meta"><time datetime="${esc(story.date)}">${fmtDate(story.date)}</time><span aria-hidden="true">&middot;</span><span>${readingMinutes(story.body)} min read</span>${tag}</p>`);
  parts.push(`<h1>${esc(story.title)}</h1>`);
  if (story.cover) parts.push(`<figure class="story-figure"><img class="story-cover" src="${esc(story.cover.full)}" alt="${esc(story.cover.alt || "")}" fetchpriority="high" />${story.cover.caption ? `<figcaption>${esc(story.cover.caption)}</figcaption>` : ""}</figure>`);
  parts.push(`<div class="story-text">${renderBody(story.body)}</div>`);
  if (story.byline) parts.push(`<p class="story-byline">${esc(story.byline)}</p>`);
  const extra = (story.images || []).filter((i) => !story.cover || i.full !== story.cover.full);
  if (extra.length) {
    parts.push(`<h2 class="gallery-title">Photos</h2><div class="gallery" data-lightbox>${extra.map((i) =>
      `<a href="${esc(i.full)}" class="gallery-item"><img src="${esc(i.small)}" loading="lazy" alt="${esc(i.alt || "Photo from: " + story.title)}" /></a>`).join("")}</div>`);
  }
  if (story.news) {
    parts.push(`<aside class="story-news"><h2>In the news</h2><p><a href="${esc(story.news.url)}" rel="noopener" target="_blank">${esc(story.news.label)}</a></p></aside>`);
  }
  const s = encodeURIComponent(shareUrl);
  parts.push(`<div class="share-row"><strong>Share this story</strong>
<a class="share-btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(story.title + " " + shareUrl)}">WhatsApp</a>
<a class="share-btn" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${s}">Facebook</a>
<a class="share-btn" target="_blank" rel="noopener noreferrer" href="https://x.com/intent/post?text=${encodeURIComponent(story.title)}&amp;url=${s}">X</a>
<button type="button" class="share-btn" id="copy-link" data-url="${esc(shareUrl)}" hidden>Copy link</button>
<button type="button" class="share-btn" id="print-story" hidden>Print</button></div>`);
  return parts.join("\n");
}

// Fills the story-template.html page (built from the shared partials) with one story.
export function fillTemplate(tpl, { title, desc, date, id, article, image, programme }) {
  let page = tpl
    .replace(/__STORY_TITLE__/g, esc(title))
    .replace(/__STORY_DESC__/g, esc(desc))
    .replace(/__STORY_DATE__/g, esc(date))
    .replace(/__STORY_ID__/g, id)
    .replace(/__STORY_PROGRAMME__/g, esc(programme || ""))
    .replace("<!--STORY_BODY-->", article)
    .replace('<meta property="og:type" content="website" />', '<meta property="og:type" content="article" />');
  if (image) page = page.replace(/content="[^"]*\/assets\/img\/og-image\.jpg"/g, `content="${esc(image)}"`);
  return page;
}
