import { allStaff, photoUrl } from "../lib/staff.mjs";
import { renderBody } from "../lib/render.mjs";
import { cdnCache, esc, html, wrap } from "../lib/util.mjs";

// /team/<slug>: a staff member's public profile, built from team-template.html (which the
// build makes from the shared partials) so it matches the rest of the site.
let cached = { at: 0, text: "" };
async function template(origin) {
  if (cached.text && Date.now() - cached.at < 300000) return cached.text;
  const res = await fetch(`${origin}/team-template.html`);
  if (!res.ok) throw new Error(`team template: ${res.status}`);
  cached = { at: Date.now(), text: await res.text() };
  return cached.text;
}

function fill(tpl, p) {
  return tpl
    .replace(/__PERSON_NAME__/g, esc(p.name)).replace(/__PERSON_TITLE__/g, esc(p.title)).replace(/__PERSON_DESC__/g, esc(p.desc))
    .replace(/__PERSON_SLUG__/g, p.slug).replace(/__PERSON_FIRST__/g, esc(p.first)).replace("<!--PERSON_BODY-->", p.body)
    .replace('<meta property="og:type" content="website" />', '<meta property="og:type" content="profile" />');
}

export default wrap(async (req) => {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") || url.pathname.split("/").filter(Boolean).pop() || "";
  const tpl = await template(url.origin);
  const s = (await allStaff()).find((x) => x.slug === slug && x.visible !== false);
  if (!s) {
    const page = fill(tpl, { name: "Profile not found", title: "", desc: "", slug: "", first: "", body:
      `<div class="profile-text"><a class="back-link" href="/about.html#team">&larr; Our team</a><h1 id="person-heading">Profile not found</h1><p class="lead">This person may no longer work with WOFHRAD-SL.</p></div>` })
      .replace(/<link rel="canonical"[^>]*>\n?/, "").replace("</head>", '<meta name="robots" content="noindex" />\n</head>');
    return html(page, 404);
  }
  const photo = photoUrl(s);
  const bio = (s.bio || "").trim();
  const body = `<a class="back-link" href="/about.html#team">&larr; Our team</a>
<div class="profile-grid">
  <div class="profile-photo">${photo ? `<img src="${esc(photo)}" alt="${esc(s.name)}" />` : `<div class="profile-initials" aria-hidden="true">${esc(s.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join(""))}</div>`}</div>
  <div class="profile-text">
    <p class="section-label">${s.leader ? "Leadership" : "Our team"}</p>
    <h1 id="person-heading">${esc(s.name)}</h1>
    <p class="profile-title">${esc(s.title)}</p>
    <div class="story-text">${bio ? renderBody(bio) : `<p>${esc(s.name.split(/\s+/)[0])} is part of the WOFHRAD-SL team. A fuller profile is coming soon.</p>`}</div>
    <div class="btn-row"><a class="btn btn-primary" href="/?reason=general#contact">Contact our team</a><a class="btn btn-outline-blue" href="/about.html#team">Meet the rest of the team</a></div>
  </div>
</div>`;
  const desc = (bio.replace(/\s+/g, " ").slice(0, 180) || `${s.name}, ${s.title} at WOFHRAD-SL.`);
  let page = fill(tpl, { name: s.name, title: s.title, desc, slug: s.slug, first: s.name.split(/\s+/)[0], body });
  if (photo) page = page.replace(/content="[^"]*\/assets\/img\/og-image\.jpg"/g, `content="${esc(url.origin + photo)}"`);
  return html(page, 200, cdnCache(["staff"], 3600));
});

export const config = { path: "/team/*" };
