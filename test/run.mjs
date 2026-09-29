// Runs every API function against an in-memory database. Nothing is sent anywhere.
process.env.WOFHRAD_MEMORY_DB = "1";
process.env.ADMIN_PASSWORD = "test-only-password-not-real";
process.env.RESEND_API_KEY = "test-key";
process.env.NEWSLETTER_FROM = "WOFHRAD-SL <news@example.org>";

const fn = async (name) => (await import(`../netlify/functions/${name}.mjs`)).default;
const B = "https://site.test";
let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? pass++ : (fail++, console.log("FAIL:", label)); if (cond) console.log("ok  :", label); };
const req = (path, opts = {}) => new Request(B + path, opts);
const auth = (t) => ({ authorization: "Bearer " + t });

const login = await fn("login"), posts = await fn("posts"), image = await fn("image");
const subscribe = await fn("subscribe"), unsub = await fn("unsubscribe");
const subscribers = await fn("subscribers"), newsletter = await fn("newsletter"), share = await fn("share");
const contact = await fn("contact"), messages = await fn("messages");

// ---- login ----
let r = await login(req("/api/login", { method: "POST", body: JSON.stringify({ password: "wrong" }) }), { ip: "1.1.1.1" });
ok(r.status === 401, "wrong password rejected");
r = await login(req("/api/login", { method: "GET" }), {});
ok(r.status === 405, "login rejects GET");
r = await login(req("/api/login", { method: "POST", body: JSON.stringify({ password: "test-only-password-not-real" }) }), { ip: "2.2.2.2" });
const { token } = await r.json();
ok(r.status === 200 && token, "correct password returns a token");

// lockout after 5 wrong attempts from one IP
for (let i = 0; i < 5; i++) await login(req("/api/login", { method: "POST", body: JSON.stringify({ password: "x" + i }) }), { ip: "9.9.9.9" });
r = await login(req("/api/login", { method: "POST", body: JSON.stringify({ password: "test-only-password-not-real" }) }), { ip: "9.9.9.9" });
ok(r.status === 429, "IP locked after 5 wrong attempts (even with right password)");

// ---- auth on protected endpoints ----
r = await posts(req("/api/posts", { method: "POST", body: JSON.stringify({ title: "x", body: "y" }) }));
ok(r.status === 401, "creating a post without login is refused");
r = await posts(req("/api/posts", { method: "POST", headers: auth("fake.token"), body: JSON.stringify({ title: "x", body: "y" }) }));
ok(r.status === 401, "forged token refused");
r = await subscribers(req("/api/subscribers"));
ok(r.status === 401, "subscriber list needs login");
r = await newsletter(req("/api/newsletter", { method: "POST", body: "{}" }));
ok(r.status === 401, "newsletter send needs login");
r = await image(req("/api/image", { method: "POST", body: new Uint8Array([0xff, 0xd8, 0xff, 1]) }));
ok(r.status === 401, "image upload needs login");

// ---- images ----
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
r = await image(req("/api/image", { method: "POST", headers: auth(token), body: jpeg }));
const img = await r.json();
ok(r.status === 201 && img.id, "admin can upload a jpeg");
r = await image(req("/api/image", { method: "POST", headers: auth(token), body: new TextEncoder().encode("<script>alert(1)</script>") }));
ok(r.status === 415, "non-image file refused");
r = await image(req("/api/image?id=" + img.id));
ok(r.status === 200 && r.headers.get("content-type") === "image/jpeg", "image is served publicly with correct type");

r = await image(req("/api/image?id=" + img.id, { method: "DELETE" }));
ok(r.status === 401, "image delete needs login");
{
  const up = await (await image(req("/api/image", { method: "POST", headers: auth(token), body: jpeg }))).json();
  r = await image(req("/api/image?id=" + up.id, { method: "DELETE", headers: auth(token) }));
  const gone = await image(req("/api/image?id=" + up.id));
  ok(r.status === 200 && gone.status === 404, "admin can delete an unused image");
}

// ---- posts ----
r = await posts(req("/api/posts", { method: "POST", headers: auth(token), body: JSON.stringify({ title: "", body: "y" }) }));
ok(r.status === 400, "empty title refused");
r = await posts(req("/api/posts", { method: "POST", headers: auth(token), body: JSON.stringify({ title: "Girls' Safe Spaces <b>grow</b>", body: "Para one.\n\nPara two.", cover: img.id, images: [img.id], status: "published" }) }));
const post = await r.json();
ok(r.status === 201 && post.id && post.publishedAt, "admin can publish a story");
r = await posts(req("/api/posts", { method: "POST", headers: auth(token), body: JSON.stringify({ title: "Secret draft", body: "hidden", status: "draft" }) }));
const draft = await r.json();
ok(r.status === 201 && !draft.publishedAt, "admin can save a draft");

r = await posts(req("/api/posts"));
let list = (await r.json()).posts;
ok(list.length === 1 && list[0].id === post.id, "public list shows only published stories");
ok(!("body" in list[0]), "list does not include full body");
r = await posts(req("/api/posts?id=" + draft.id));
ok(r.status === 404, "public cannot open a draft");
r = await posts(req("/api/posts?all=1"));
ok((await r.json()).posts.length === 1, "public cannot use all=1 to see drafts");
r = await posts(req("/api/posts?all=1", { headers: auth(token) }));
ok((await r.json()).posts.length === 2, "admin sees drafts too");
r = await posts(req("/api/posts?id=" + post.id));
ok(r.status === 200 && (await r.json()).body.includes("Para two."), "public can read a published story");

r = await posts(req("/api/posts?id=" + draft.id, { method: "PUT", headers: auth(token), body: JSON.stringify({ title: "Now live", body: "hidden no more", status: "published" }) }));
const upd = await r.json();
ok(r.status === 200 && upd.publishedAt, "draft can be edited and published");
r = await posts(req("/api/posts"));
ok((await r.json()).posts.length === 2, "edited story now visible to public");

// removing an image from a story deletes it
r = await posts(req("/api/posts?id=" + post.id, { method: "PUT", headers: auth(token), body: JSON.stringify({ title: "T", body: "b", cover: null, images: [] }) }));
r = await image(req("/api/image?id=" + img.id));
ok(r.status === 404, "unused image is cleaned up");

r = await posts(req("/api/posts?id=" + post.id, { method: "DELETE", headers: auth(token) }));
ok(r.status === 200, "admin can delete a story");
r = await posts(req("/api/posts?id=" + post.id));
ok(r.status === 404, "deleted story is gone");

// ---- share page ----
r = await share(req("/share/" + draft.id));
const html = await r.text();
ok(r.status === 200 && html.includes('property="og:title"') && html.includes("Now live"), "share page has social preview tags");
r = await posts(req("/api/posts", { method: "POST", headers: auth(token), body: JSON.stringify({ title: 'X" onload="alert(1)', body: "b" }) }));
const evil = await r.json();
r = await share(req("/share/" + evil.id));
ok(!(await r.text()).includes('onload="alert(1)'), "share page escapes titles (no injection)");
r = await share(req("/share/not-an-id"));
ok(r.status === 302, "bad share id redirects home");

// ---- newsletter ----
r = await subscribe(req("/api/subscribe", { method: "POST", body: JSON.stringify({ email: "not-an-email" }) }));
ok(r.status === 400, "invalid email refused");
r = await subscribe(req("/api/subscribe", { method: "POST", body: JSON.stringify({ email: "Ada@Example.org" }) }));
ok(r.status === 200, "valid email subscribes");
await subscribe(req("/api/subscribe", { method: "POST", body: JSON.stringify({ email: "ada@example.org" }) }));
await subscribe(req("/api/subscribe", { method: "POST", body: JSON.stringify({ email: "bot@example.org", website: "http://spam" }) }));
await subscribe(req("/api/subscribe", { method: "POST", body: JSON.stringify({ email: "+cmd@example.org" }) }));
r = await subscribers(req("/api/subscribers", { headers: auth(token) }));
let s = await r.json();
ok(s.count === 2, "duplicates merged and bots ignored (count = 2)");
r = await subscribers(req("/api/subscribers?format=csv", { headers: auth(token) }));
const csv = await r.text();
ok(csv.startsWith("email,subscribed_at") && csv.includes('"\'+cmd@example.org"'), "CSV export protects against formula injection");

// send (mock the email provider)
const realFetch = globalThis.fetch; let sentBody;
globalThis.fetch = async (u, o) => { sentBody = JSON.parse(o.body); return new Response("{}", { status: 200 }); };
r = await newsletter(req("/api/newsletter", { method: "POST", headers: auth(token), body: JSON.stringify({ subject: "June update", message: "Hello <b>friends</b>\n\nNews." }) }));
const sendRes = await r.json();
globalThis.fetch = realFetch;
ok(sendRes.sent === 2 && sendRes.failed === 0, "newsletter sent to all subscribers");
ok(sentBody.length === 2 && sentBody[0].html.includes("&lt;b&gt;") && sentBody[0].html.includes("/api/unsubscribe?e="), "emails escape HTML and include unsubscribe link");

// unsubscribe link: opening it must NOT unsubscribe (mail scanners open links); confirming does
const link = sentBody.find((m) => m.to[0] === "ada@example.org").text.match(/Unsubscribe: (\S+)/)[1];
ok(sentBody[0].headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", "emails carry the one-click unsubscribe header");
r = await unsub(req(link.replace(B, "")));
const confirmHtml = await r.text();
ok(r.status === 200 && confirmHtml.includes("Yes, unsubscribe me"), "opening the link only shows a confirm button");
r = await subscribers(req("/api/subscribers", { headers: auth(token) }));
ok((await r.json()).count === 2, "opening the link does not remove anyone");
const u = new URL(link);
r = await unsub(req(u.pathname + u.search, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `e=${encodeURIComponent(u.searchParams.get("e"))}&t=${u.searchParams.get("t")}` }));
ok(r.status === 200 && (await r.text()).includes("unsubscribed"), "confirming unsubscribes");
r = await subscribers(req("/api/subscribers", { headers: auth(token) }));
ok((await r.json()).count === 1, "subscriber removed after confirming");
r = await unsub(req(u.pathname + u.search, { method: "POST" }));
ok(r.status === 200, "one-click POST (no form body) is handled");
r = await unsub(req("/api/unsubscribe?e=%2Bcmd%40example.org&t=badtoken"));
ok((await r.text()).includes("not valid"), "forged unsubscribe link refused");

// ---- contact form ----
const send = (o, ip = "5.5.5.5") => contact(req("/api/contact", { method: "POST", body: JSON.stringify(o) }), { ip });
r = await send({ name: "", email: "a@b.org", message: "hi" });
ok(r.status === 400, "contact: missing name refused");
r = await send({ name: "Ada", email: "nope", message: "hi" });
ok(r.status === 400, "contact: bad email refused");
r = await send({ name: "Ada", email: "ada@example.org", message: "   " });
ok(r.status === 400, "contact: empty message refused");
r = await send({ name: "Bot", email: "bot@example.org", message: "buy", website: "spam" });
ok(r.status === 200, "contact: bot quietly ignored");
const realFetch2 = globalThis.fetch; let alert;
globalThis.fetch = async (u2, o) => { alert = JSON.parse(o.body); return new Response("{}", { status: 200 }); };
r = await send({ name: "Ada <b>L</b>", email: "ada@example.org", subject: "Hello", message: "Can we partner?\nThanks" });
globalThis.fetch = realFetch2;
ok(r.status === 200, "contact: valid message accepted");
ok(alert && alert.to[0] === "wofhrad95@gmail.com" && alert.reply_to === "ada@example.org" && alert.html.includes("&lt;b&gt;"), "contact: email alert sent with reply-to and escaped HTML");
r = await messages(req("/api/messages"));
ok(r.status === 401, "messages list needs login");
r = await messages(req("/api/messages", { headers: auth(token) }));
let mlist = await r.json();
ok(mlist.count === 1 && mlist.messages[0].message.startsWith("Can we partner?"), "admin sees the message (bot's was not stored)");
globalThis.fetch = async () => { throw new Error("email service down"); };
r = await send({ name: "Bo", email: "bo@example.org", message: "still saved?" }, "6.6.6.6");
globalThis.fetch = realFetch2;
ok(r.status === 200, "contact: still accepted if the email alert fails");
for (let i = 0; i < 5; i++) await send({ name: "Spam", email: "s@example.org", message: "x" + i }, "7.7.7.7");
r = await send({ name: "Spam", email: "s@example.org", message: "one more" }, "7.7.7.7");
ok(r.status === 429, "contact: flooding from one visitor is limited");
r = await messages(req("/api/messages?id=" + mlist.messages[0].id, { method: "DELETE", headers: auth(token) }));
ok(r.status === 200, "admin can delete a message");


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
