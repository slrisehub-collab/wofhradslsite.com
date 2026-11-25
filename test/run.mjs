// Runs every API function against an in-memory database. Nothing is sent anywhere:
// calls to the email service and to the site itself are answered by a fake fetch.
process.env.WOFHRAD_MEMORY_DB = "1";
process.env.ADMIN_PASSWORD = "test-only-password-not-real";
process.env.ADMIN_USERS = "Simeon:editor:simeon-long-password-1\nShorty:editor:short";
process.env.RESEND_API_KEY = "test-key";
process.env.NEWSLETTER_FROM = "WOFHRAD-SL <news@example.org>";
import fs from "node:fs";
import { createHash, createHmac } from "node:crypto";

const fn = async (name) => (await import(`../netlify/functions/${name}.mjs`)).default;
const B = "https://site.test";
let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? pass++ : (fail++, console.log("FAIL:", label)); if (cond) console.log("ok  :", label); };
const req = (path, opts = {}) => new Request(B + path, opts);
const auth = (t) => ({ authorization: "Bearer " + t });
const post = (path, body, headers = {}) => req(path, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

// ---- fake outside world ----
const sentMail = [];          // every email the code tried to send
let mailFailNext = 0;         // make the next N email calls fail
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.startsWith("https://api.resend.com/")) {
    if (mailFailNext > 0) { mailFailNext--; return new Response("rate limited", { status: 429 }); }
    const body = JSON.parse(init.body);
    for (const m of [].concat(body)) sentMail.push({ ...m, idempotencyKey: init.headers["Idempotency-Key"] });
    return Response.json({ data: [] });
  }
  if (url === B + "/story-template.html") return new Response(fs.readFileSync("dist/story-template.html", "utf8"));
  if (url === B + "/static-pages.json") return new Response(fs.readFileSync("dist/static-pages.json", "utf8"));
  return realFetch(input, init);
};

const login = await fn("login"), posts = await fn("posts"), image = await fn("image");
const subscribe = await fn("subscribe"), confirm = await fn("confirm"), unsub = await fn("unsubscribe");
const subscribers = await fn("subscribers"), newsletter = await fn("newsletter"), share = await fn("share");
const contact = await fn("contact"), messages = await fn("messages"), story = await fn("story");
const settings = await fn("settings"), documents = await fn("documents"), activity = await fn("activity");
const sitemap = await fn("sitemap");
const { cleanup } = await import("../netlify/functions/cleanup.mjs");
const { store } = await import("../netlify/lib/db.mjs");

const doLogin = (body, ip) => login(post("/api/login", body), { ip });

// ---- login ----
let r = await doLogin({ password: "wrong" }, "1.1.1.1");
ok(r.status === 401, "wrong password rejected");
r = await login(req("/api/login", { method: "GET" }), {});
ok(r.status === 405, "login rejects GET");
r = await doLogin({ password: "test-only-password-not-real" }, "2.2.2.2");
const L = await r.json();
const token = L.token;
ok(r.status === 200 && token && L.role === "admin" && L.name === "Admin", "main password logs in as administrator");

for (let i = 0; i < 5; i++) await doLogin({ password: "x" + i }, "9.9.9.9");
r = await doLogin({ password: "test-only-password-not-real" }, "9.9.9.9");
ok(r.status === 429, "address locked after 5 wrong attempts (even with the right password)");

// 40 guesses fired at the same moment must not slip past the limit.
const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => doLogin({ password: "guess" + i }, "8.8.8.8")));
const tried = burst.filter((x) => x.status === 401).length;
ok(tried <= 5, `simultaneous guesses are still limited to 5 (got ${tried})`);
await store("auth-attempts").delete("global");

r = await doLogin({ name: "simeon", password: "simeon-long-password-1" }, "3.3.3.1");
const editorToken = (await r.json()).token;
ok(r.status === 200 && editorToken, "named staff member can log in (name is not case-sensitive)");
r = await doLogin({ name: "Simeon", password: "test-only-password-not-real" }, "3.3.3.2");
ok(r.status === 401, "one person's password does not open another person's account");
r = await doLogin({ name: "Shorty", password: "short" }, "3.3.3.3");
ok(r.status === 403 && (await r.json()).error.includes("12 characters"), "passwords under 12 characters are refused with an explanation");

// ---- roles and sessions ----
r = await posts(post("/api/posts", { title: "x", body: "y" }));
ok(r.status === 401, "creating a post without login is refused");
r = await posts(post("/api/posts", { title: "x", body: "y" }, auth("fake.token")));
ok(r.status === 401, "forged token refused");
r = await subscribers(req("/api/subscribers", { headers: auth(editorToken) }));
ok(r.status === 403, "an editor cannot see subscribers");
r = await settings(req("/api/settings", { method: "PUT", headers: auth(editorToken), body: "{}" }));
ok(r.status === 403, "an editor cannot change donation settings");
r = await messages(req("/api/messages", { headers: auth(editorToken) }));
ok(r.status === 200, "an editor can read messages");
{
  const before = process.env.ADMIN_USERS;
  process.env.ADMIN_USERS = "Simeon:editor:a-brand-new-password-2";
  r = await messages(req("/api/messages", { headers: auth(editorToken) }));
  ok(r.status === 401, "changing someone's password ends their existing sessions");
  process.env.ADMIN_USERS = before;
}
r = await image(post("/api/image", new Uint8Array([0xff, 0xd8, 0xff, 1])));
ok(r.status === 401, "image upload needs login");

// ---- images ----
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
const jpegSmall = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 2]);
r = await image(req("/api/image", { method: "POST", headers: auth(token), body: jpeg }));
const img = await r.json();
ok(r.status === 201 && img.id, "admin can upload a jpeg");
r = await image(req("/api/image?thumbFor=" + img.id, { method: "POST", headers: auth(token), body: jpegSmall }));
ok(r.status === 201, "a small copy can be attached to a photo");
r = await image(req("/api/image?id=" + img.id + "&size=sm"));
ok(new Uint8Array(await r.arrayBuffer())[11] === 2, "size=sm serves the small copy");
r = await image(req("/api/image", { method: "POST", headers: auth(token), body: new TextEncoder().encode("<script>alert(1)</script>") }));
ok(r.status === 415, "non-image file refused");
r = await image(req("/api/image?id=" + img.id));
ok(r.status === 200 && r.headers.get("content-type") === "image/jpeg" && /immutable/.test(r.headers.get("cache-control")), "image served publicly, cached for a year");

// ---- posts ----
r = await posts(post("/api/posts", { title: "", body: "y" }, auth(token)));
ok(r.status === 400, "empty title refused");
r = await posts(post("/api/posts", { title: "x", body: "y", programme: "made-up" }, auth(token)));
ok(r.status === 400, "unknown programme refused");
r = await posts(post("/api/posts", { title: "Girls' Safe Spaces <b>grow</b>", body: "Para one.\n\nPara two.", cover: img.id, images: [img.id], status: "published", programme: "girls-circle" }, auth(editorToken)));
const p1 = await r.json();
ok(r.status === 201 && p1.publishedAt && p1.author === "Simeon", "an editor can publish a story, and is recorded as its author");
r = await posts(post("/api/posts", { title: "Secret draft", body: "hidden", status: "draft" }, auth(token)));
const draft = await r.json();
ok(r.status === 201 && !draft.publishedAt, "admin can save a draft");

r = await posts(req("/api/posts"));
let data = await r.json();
ok(data.total === 1 && data.posts[0].id === p1.id, "public list shows only published stories");
ok(!("body" in data.posts[0]), "list does not include full body");
ok(/s-maxage/.test(r.headers.get("netlify-cdn-cache-control") || ""), "public list can be cached by the CDN");
r = await posts(req("/api/posts?programme=peacebuilding"));
ok((await r.json()).total === 0, "programme filter works");
r = await posts(req("/api/posts?id=" + draft.id));
ok(r.status === 404, "public cannot open a draft");
r = await posts(req("/api/posts?all=1"));
ok((await r.json()).posts.length === 1, "public cannot use all=1 to see drafts");
r = await posts(req("/api/posts?all=1", { headers: auth(token) }));
ok((await r.json()).posts.length === 2 && r.headers.get("cache-control") === "no-store", "admin sees drafts too, never cached");

r = await posts(req("/api/posts?id=" + draft.id, { method: "PUT", headers: auth(token), body: JSON.stringify({ title: "Now live", body: "hidden no more", status: "published", expectedUpdatedAt: draft.updatedAt }) }));
const upd = await r.json();
ok(r.status === 200 && upd.publishedAt, "draft can be edited and published");
r = await posts(req("/api/posts?id=" + draft.id, { method: "PUT", headers: auth(editorToken), body: JSON.stringify({ title: "Stale edit", body: "x", expectedUpdatedAt: draft.updatedAt }) }));
ok(r.status === 409, "saving over someone else's newer changes is refused");
r = await posts(req("/api/posts?limit=1&offset=1"));
data = await r.json();
ok(data.total === 2 && data.posts.length === 1, "paging with limit and offset works");

// the index rebuilds itself if it goes missing
await store("post-index").delete("all");
r = await posts(req("/api/posts"));
ok((await r.json()).total === 2, "story index rebuilds itself from the stories");

// removing an image from a story deletes it and its small copy
await posts(req("/api/posts?id=" + p1.id, { method: "PUT", headers: auth(token), body: JSON.stringify({ title: "T", body: "b", cover: null, images: [] }) }));
r = await image(req("/api/image?id=" + img.id));
const rs = await image(req("/api/image?id=" + img.id + "&size=sm"));
ok(r.status === 404 && rs.status === 404, "unused image and its small copy are cleaned up");

// ---- story pages ----
r = await story(req("/stories/" + draft.id));
let page = await r.text();
ok(r.status === 200 && page.includes("<h1>Now live</h1>") && page.includes('<meta property="og:title" content="Now live | WOFHRAD-SL"'), "story page is real HTML with its own title and preview tags");
ok(page.includes(`<link rel="canonical" href="http://localhost:8888/stories/${draft.id}"`) && !page.includes("__STORY"), "story page has the right canonical link and no leftover placeholders");
ok(r.headers.get("x-frame-options") === "DENY" && /frame-ancestors 'none'/.test(r.headers.get("content-security-policy")), "story page sends security headers");
r = await posts(post("/api/posts", { title: 'X" onload="alert(1) <script>', body: "b <img src=x onerror=alert(1)>" }, auth(token)));
const evil = await r.json();
page = await (await story(req("/stories/" + evil.id))).text();
ok(!page.includes('onload="alert(1)') && !page.includes("<script>alert") && !page.includes("<img src=x"), "story page escapes titles and text (no injection)");
r = await story(req("/stories/not-an-id"));
ok(r.status === 404 && (await r.text()).includes("noindex"), "unknown story gives a 404 page that search engines skip");
r = await share(req("/share/" + draft.id));
ok(r.status === 301 && r.headers.get("location") === "/stories/" + draft.id, "old /share/ links redirect to the story page");
r = await sitemap(req("/sitemap.xml"));
const xml = await r.text();
ok(xml.includes("/stories/" + draft.id) && xml.includes(B + "/donate.html") && !xml.includes("admin"), "sitemap lists pages and published stories");

r = await posts(req("/api/posts?id=" + p1.id, { method: "DELETE", headers: auth(token) }));
ok(r.status === 200, "admin can delete a story");
r = await posts(req("/api/posts?id=" + p1.id));
ok(r.status === 404, "deleted story is gone");

// ---- newsletter sign-up (double opt-in) ----
const subStore = store("subscribers");
const subKey = (e) => createHash("sha256").update(e).digest("hex");
r = await subscribe(post("/api/subscribe", { email: "not-an-email" }));
ok(r.status === 400, "invalid email refused");
sentMail.length = 0;
r = await subscribe(post("/api/subscribe", { email: "Ada@Example.org" }), { ip: "5.5.5.5" });
ok(r.status === 200 && (await r.json()).confirm === true, "valid email is accepted and told to confirm");
let ada = await subStore.get(subKey("ada@example.org"), { type: "json" });
ok(ada.status === "pending" && ada.token, "new subscriber is pending until confirmed");
ok(sentMail.length === 1 && sentMail[0].to[0] === "ada@example.org" && sentMail[0].html.includes("/api/confirm?e=ada%40example.org&amp;t=" + ada.token), "confirmation email sent with a personal link");
await subscribe(post("/api/subscribe", { email: "ada@example.org" }), { ip: "5.5.5.5" });
ok(sentMail.length === 1, "signing up twice quickly does not send a second email");
await subscribe(post("/api/subscribe", { email: "bot@example.org", website: "http://spam" }));
ok(!(await subStore.get(subKey("bot@example.org"))), "honeypot field blocks bots");
r = await confirm(req(`/api/confirm?e=ada%40example.org&t=wrong`));
ok(r.status === 400, "confirm link with a wrong token is refused");
r = await confirm(req(`/api/confirm?e=ada%40example.org&t=${ada.token}`));
ada = await subStore.get(subKey("ada@example.org"), { type: "json" });
ok(r.status === 200 && ada.status === "confirmed", "confirm link confirms the subscriber");

// older subscribers (no status) count as confirmed; "pending" ones can be re-sent the link
await subStore.setJSON(subKey("old@example.org"), { email: "old@example.org", subscribedAt: "2025-01-01T00:00:00.000Z" });
await subStore.setJSON(subKey("pend@example.org"), { email: "pend@example.org", status: "pending", subscribedAt: "2026-01-01T00:00:00.000Z" });
r = await subscribers(req("/api/subscribers", { headers: auth(token) }));
data = await r.json();
ok(data.count === 3 && data.confirmed === 2 && data.pending === 1, "subscriber counts split confirmed and pending");
sentMail.length = 0;
r = await subscribers(post("/api/subscribers", { action: "send-confirmations" }, auth(token)));
ok((await r.json()).sent === 1 && sentMail[0].to[0] === "pend@example.org", "admin can re-send confirmation emails to pending subscribers");
r = await subscribers(req("/api/subscribers?format=csv", { headers: auth(token) }));
const csv = await r.text();
ok(csv.startsWith("email,status") && csv.includes('"ada@example.org","confirmed"'), "CSV export includes status");

// ---- sending a newsletter ----
r = await newsletter(post("/api/newsletter", { subject: "", message: "x" }, auth(token)));
ok(r.status === 400, "newsletter needs a subject");
sentMail.length = 0;
r = await newsletter(post("/api/newsletter", { subject: "Hello", message: "News <b>here</b>" }, auth(token)));
let camp = await r.json();
ok(r.status === 201 && camp.status === "sent" && camp.sent === 2 && camp.total === 2, "newsletter goes to confirmed subscribers only");
ok(sentMail.every((m) => m.to[0] !== "pend@example.org"), "pending subscribers are not emailed");
const adaMail = sentMail.find((m) => m.to[0] === "ada@example.org");
ok(adaMail.html.includes("&lt;b&gt;") && adaMail.headers["List-Unsubscribe"].includes("t=" + ada.token), "newsletter escapes HTML and carries a one-click unsubscribe link");
ok(sentMail.every((m) => m.idempotencyKey), "every batch carries an idempotency key");
r = await newsletter(req("/api/newsletter", { headers: auth(editorToken) }));
ok(r.status === 403, "an editor cannot send newsletters");

// A failure part-way pauses the newsletter; resuming finishes it without repeats.
for (let i = 0; i < 120; i++) await subStore.setJSON(subKey(`p${i}@example.org`), { email: `p${i}@example.org`, status: "confirmed", subscribedAt: "2026-02-01T00:00:00.000Z" });
sentMail.length = 0;
mailFailNext = 0;
const origSet = globalThis.fetch;
let calls = 0;
globalThis.fetch = (u, i) => { if (String(u).includes("resend") && ++calls === 2) mailFailNext = 1; return origSet(u, i); };
r = await newsletter(post("/api/newsletter", { subject: "Big", message: "m" }, auth(token)));
camp = await r.json();
globalThis.fetch = origSet;
ok(camp.status === "paused" && camp.sent === 50 && camp.error, "an email-service failure pauses the newsletter and records how far it got");
r = await newsletter(post("/api/newsletter", { action: "continue", id: camp.id }, auth(token)));
camp = await r.json();
const addrs = sentMail.map((m) => m.to[0]);
ok(camp.status === "sent" && camp.sent === 122 && new Set(addrs).size === addrs.length && addrs.length === 122, "resuming finishes the newsletter and nobody gets it twice");
r = await newsletter(req("/api/newsletter", { headers: auth(token) }));
ok((await r.json()).campaigns.length === 2, "sent newsletters are listed");

// ---- unsubscribe ----
r = await unsub(req(`/api/unsubscribe?e=ada%40example.org&t=${ada.token}`));
ok(r.status === 200 && (await r.text()).includes("Yes, unsubscribe me"), "unsubscribe link shows a confirm button");
r = await unsub(req(`/api/unsubscribe?e=ada%40example.org&t=bad`, { method: "POST" }));
ok(r.status === 400, "bad unsubscribe token refused");
r = await unsub(req(`/api/unsubscribe?e=ada%40example.org&t=${ada.token}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }));
ok(r.status === 200 && !(await subStore.get(subKey("ada@example.org"))), "one-click unsubscribe removes the subscriber");
{
  // Links in newsletters sent before this change were signed with a key derived from the password.
  const legacyKey = createHash("sha256").update("wofhrad-session:" + process.env.ADMIN_PASSWORD).digest("hex");
  const t = createHmac("sha256", legacyKey).update("unsub:old@example.org").digest("hex").slice(0, 32);
  r = await unsub(req(`/api/unsubscribe?e=old%40example.org&t=${t}`, { method: "POST" }));
  ok(r.status === 200 && !(await subStore.get(subKey("old@example.org"))), "unsubscribe links from older newsletters still work");
}

// ---- contact form, donation pledges ----
const cpost = (body, ip = "6.6.6.6") => contact(post("/api/contact", body), { ip });
r = await cpost({ name: "", email: "a@b.org", message: "hi" });
ok(r.status === 400, "contact needs a name");
r = await cpost({ name: "Ann", email: "a@b.org", phone: "<script>", message: "hi" });
ok(r.status === 400, "contact rejects a nonsense phone number");
sentMail.length = 0;
r = await cpost({ reason: "internship", name: "Ann <b>", email: "ann@example.org", phone: "+232 76 000 000", subject: "Internship", message: "I study law." });
ok(r.status === 200, "contact message accepted");
ok(sentMail.length === 1 && sentMail[0].reply_to === "ann@example.org" && sentMail[0].html.includes("Ann &lt;b&gt;"), "team gets an escaped email alert");
r = await cpost({ reason: "donation", name: "Donor", email: "d@example.org", pledge: { amount: 250, currency: "SLE", frequency: "monthly" } });
ok(r.status === 200 && sentMail[1].subject.includes("Le 250 SLE (monthly)"), "donation pledge accepted without a message, and the alert shows the amount");
r = await cpost({ reason: "donation", name: "Donor", email: "d@example.org", pledge: { amount: -5, currency: "SLE" } });
ok(r.status === 400, "invalid pledge amount refused");
r = await cpost({ name: "Bot", email: "bot@example.org", message: "spam", website: "x" });
r = await messages(req("/api/messages", { headers: auth(token) }));
data = await r.json();
ok(data.count === 2 && data.messages.some((m) => m.reason === "internship" && m.phone) && data.messages.some((m) => m.pledge?.amount === 250), "messages keep their topic, phone and pledge");
const limited = await Promise.all(Array.from({ length: 12 }, () => cpost({ name: "F", email: "f@example.org", message: "x" }, "7.7.7.7")));
ok(limited.filter((x) => x.status === 200).length === 5, "contact form limited to 5 messages per hour, even all at once");

// ---- settings and documents ----
r = await settings(req("/api/settings", { method: "PUT", headers: auth(token), body: JSON.stringify({ donateLink: "http://insecure.example" }) }));
ok(r.status === 400, "donation link must use https");
r = await settings(req("/api/settings", { method: "PUT", headers: auth(token), body: JSON.stringify({ donateLink: "https://pay.example/wofhrad", orangeMoney: "076 000000 (WOFHRAD-SL)", registrationNumber: "REG-123" }) }));
ok(r.status === 200, "admin can save donation settings");
r = await settings(req("/api/settings"));
data = await r.json();
ok(data.donateLink === "https://pay.example/wofhrad" && data.orangeMoney && data.registrationNumber === "REG-123" && !("updatedBy" in data), "settings are public, without internal fields");

const pdf = new TextEncoder().encode("%PDF-1.4\n%test\n");
const dpost = (body, headers) => documents(req("/api/documents", { method: "POST", headers, body }));
r = await dpost(pdf, { "x-title": "Annual Report 2025" });
ok(r.status === 401, "document upload needs login");
r = await dpost(new TextEncoder().encode("not a pdf"), { ...auth(editorToken), "x-title": "Fake" });
ok(r.status === 415, "only PDFs are accepted");
r = await dpost(pdf, { ...auth(editorToken), "x-title": encodeURIComponent("Annual Report 2025"), "x-year": "2025" });
const doc = await r.json();
ok(r.status === 201 && doc.id, "an editor can publish a report");
r = await documents(req("/api/documents"));
ok((await r.json()).documents[0].title === "Annual Report 2025", "reports are listed publicly");
r = await documents(req("/api/documents?id=" + doc.id));
ok(r.status === 200 && r.headers.get("content-type") === "application/pdf" && /annual-report-2025\.pdf/.test(r.headers.get("content-disposition")), "report downloads as a named PDF");

// ---- activity log ----
r = await activity(req("/api/activity", { headers: auth(token) }));
data = await r.json();
ok(data.items.some((a) => a.user === "Simeon" && a.action === "Published a story") && data.items.some((a) => a.action === "Published a document"), "activity log records who did what");
r = await activity(req("/api/activity", { headers: auth(editorToken) }));
ok(r.status === 403, "only administrators see the activity log");

// ---- daily clean-up ----
{
  const images = store("images");
  await images.set("11111111-1111-1111-1111-111111111111", jpeg, { metadata: { contentType: "image/jpeg", uploadedAt: "2020-01-01T00:00:00.000Z" } });
  await images.set("22222222-2222-2222-2222-222222222222", jpeg, { metadata: { contentType: "image/jpeg", uploadedAt: new Date().toISOString() } });
  await store("rate").setJSON("old", { count: 3, since: Date.now() - 3 * 86400e3 });
  const rep = await cleanup();
  ok(!(await images.get("11111111-1111-1111-1111-111111111111")) && (await images.get("22222222-2222-2222-2222-222222222222")), "clean-up removes abandoned photos but keeps fresh uploads");
  ok(!(await store("rate").get("old")) && rep.rate >= 1, "clean-up removes old rate-limit records");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
