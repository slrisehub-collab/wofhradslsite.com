import { listAll } from "../lib/posts.mjs";
import { cdnCache, esc, wrap } from "../lib/util.mjs";

// /feed.xml: an RSS feed of the latest stories, so partners, journalists and news
// readers can follow WOFHRAD-SL without visiting the site.
export default wrap(async (req) => {
  const origin = new URL(req.url).origin;
  const stories = (await listAll()).slice(0, 30);
  const items = stories.map((p) => `<item>
<title>${esc(p.title)}</title>
<link>${esc(origin + p.url)}</link>
<guid isPermaLink="true">${esc(origin + p.url)}</guid>
<pubDate>${new Date(p.date).toUTCString()}</pubDate>
<description>${esc(p.excerpt)}</description>
</item>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>WOFHRAD-SL stories</title>
<link>${esc(origin)}/stories.html</link>
<atom:link href="${esc(origin)}/feed.xml" rel="self" type="application/rss+xml" />
<description>News and stories from the Women's Forum for Human Rights &amp; Democracy, Sierra Leone.</description>
<language>en-gb</language>
${items}
</channel>
</rss>
`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", ...cdnCache(["posts"], 3600) } });
});

export const config = { path: "/feed.xml" };
