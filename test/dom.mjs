// Loads the real pages in a simulated browser and drives them against the real API code.
process.env.WOFHRAD_MEMORY_DB = "1";
process.env.ADMIN_PASSWORD = "test-only-password-not-real";
import pkg from "jsdom";
const { JSDOM, VirtualConsole } = pkg;
import fs from "node:fs";

const fn = async (n) => (await import(`../netlify/functions/${n}.mjs`)).default;
const handlers = {
  "/api/login": await fn("login"), "/api/posts": await fn("posts"), "/api/image": await fn("image"),
  "/api/contact": await fn("contact"), "/api/messages": await fn("messages"),
  "/api/subscribe": await fn("subscribe"), "/api/subscribers": await fn("subscribers"), "/api/newsletter": await fn("newsletter"),
};
const ORIGIN = "https://site.test";
let pass = 0, fail = 0;
const ok = (c, l) => { c ? pass++ : fail++; console.log(c ? "ok  :" : "FAIL:", l); };
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await wait(20); } return false; };

function apiFetch(input, init = {}) {
  const url = new URL(input, ORIGIN);
  const h = handlers[url.pathname];
  if (!h) return Promise.resolve(new Response("nf", { status: 404 }));
  return h(new Request(url, init), { ip: "3.3.3.3" });
}

// Inline the site's own script and drop anything that would fetch from the internet.
function prepare(html) {
  return html
    .replace(/<script src="assets\/extras\.js"><\/script>/, () => "<script>" + fs.readFileSync("public/assets/extras.js", "utf8") + "</script>")
    .replace(/<script src="https?:[^>]*><\/script>/g, "")
    .replace(/<link [^>]*href="https?:[^>]*>/g, "");
}

async function open(file, search = "") {
  const html = prepare(fs.readFileSync(`public/${file}`, "utf8"));
  const vc = new VirtualConsole(); const errors = [];
  vc.on("jsdomError", (e) => { if (!/Could not load/.test(e.message)) errors.push(e.message); }); vc.on("error", (e) => errors.push(String(e)));
  const dom = new JSDOM(html, {
    url: `${ORIGIN}/${file}${search}`, runScripts: "dangerously",  pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = apiFetch;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.scrollTo = () => {};
      w.tailwind = {}; // the real page loads this from a CDN, which the test skips
      w.confirm = () => true;
      w.alert = (m) => errors.push("alert: " + m);
    },
  });
  await wait(200);
  return { dom, w: dom.window, d: dom.window.document, errors };
}

// ---------- admin ----------
{
  const { w, d, errors } = await open("admin.html");
  const $ = (id) => d.getElementById(id);
  ok(!$("login-view").classList.contains("hidden") && $("app").classList.contains("hidden"), "admin: dashboard hidden until login");

  $("password").value = "nope"; $("login-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await until(() => $("login-msg").textContent.includes("Incorrect"));
  ok($("login-msg").textContent.includes("Incorrect password"), "admin: wrong password shows an error");
  ok($("app").classList.contains("hidden"), "admin: still locked after wrong password");

  $("password").value = "test-only-password-not-real"; $("login-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await until(() => !$("app").classList.contains("hidden"));
  ok(!$("app").classList.contains("hidden"), "admin: correct password opens dashboard");

  // write a story
  $("new-story").click(); await wait();
  $("title").value = "Girls' safe spaces <em>grow</em>"; $("body").value = "First paragraph.\n\nSecond paragraph.";
  $("story-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await until(() => d.querySelectorAll("#story-list .row").length === 1);
  ok(d.querySelectorAll("#story-list .row").length === 1, "admin: published story appears in list");
  ok(!$("story-list").innerHTML.includes("<em>"), "admin: title shown as text, not HTML");

  // draft
  $("new-story").click(); await wait();
  $("title").value = "Draft one"; $("body").value = "hidden"; d.querySelector("input[name=status][value=draft]").checked = true;
  $("story-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await until(() => d.querySelectorAll("#story-list .row").length === 2);
  ok(d.querySelectorAll("#story-list .badge.draft").length === 1, "admin: draft is labelled Draft");

  // empty title validation
  $("new-story").click(); await wait();
  $("story-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  ok($("editor-msg").textContent.includes("title"), "admin: empty story blocked with a message");
  $("cancel-edit").click();

  // subscribers tab starts empty
  d.querySelector('[data-tab="subs"]').click(); await until(() => $("sub-list").textContent.includes("No one"));
  ok($("sub-count").textContent === "0", "admin: subscribers tab shows 0");

  // messages tab shows what visitors sent (the contact form test runs later, so send one now)
  await handlers["/api/contact"](new Request(ORIGIN + "/api/contact", { method: "POST", body: JSON.stringify({ name: "Visitor <i>V</i>", email: "v@example.org", subject: "Hi", message: "Line one\nLine two" }) }), { ip: "4.4.4.4" });
  d.querySelector('[data-tab="msgs"]').click(); await until(() => d.querySelectorAll("#msg-list .row").length === 1);
  ok(d.querySelectorAll("#msg-list .row").length === 1 && $("msg-count").textContent === "1", "admin: Messages tab lists contact-form messages");
  ok(!$("msg-list").innerHTML.includes("<i>V</i>"), "admin: message text shown safely");
  d.querySelector("#msg-list .btn-danger").click(); await until(() => $("msg-count").textContent === "0");
  ok($("msg-count").textContent === "0", "admin: message can be deleted");

  // logout locks again
  $("logout").click();
  ok(!$("login-view").classList.contains("hidden") && $("app").classList.contains("hidden"), "admin: logout locks the dashboard");
  ok(errors.length === 0, "admin: no script errors " + errors.join(" | "));
}

// ---------- stories (public) ----------
{
  const { w, d, errors } = await open("stories.html");
  await until(() => d.querySelectorAll("#story-grid .story-card").length > 0);
  const cards = d.querySelectorAll("#story-grid .story-card");
  ok(cards.length === 1, "stories: public sees only the published story (draft hidden)");
  ok(cards[0].querySelector("h3").textContent.includes("<em>grow</em>") && !cards[0].innerHTML.includes("<em>"), "stories: card renders title safely");
  const href = cards[0].getAttribute("href");

  const s = await open("stories.html", "?" + href.split("?")[1]);
  await until(() => s.d.querySelector("#story-article h1"));
  ok(s.d.querySelector("#story-article h1").textContent.includes("Girls' safe spaces"), "story page: title shown");
  ok(s.d.querySelectorAll(".story-text p").length === 2, "story page: two paragraphs rendered");
  const links = [...s.d.querySelectorAll(".share-btn")].map((a) => a.getAttribute("href") || a.textContent);
  ok(links.some((l) => l.startsWith("https://wa.me/")) && links.some((l) => l.includes("facebook.com")) && links.includes("Copy link"), "story page: WhatsApp, Facebook and copy-link share buttons");
  ok(links.join().includes("%2Fshare%2F"), "story page: sharing uses the /share/ link");
  ok(s.errors.length === 0 && errors.length === 0, "stories: no script errors " + [...errors, ...s.errors].join(" | "));

  const m = await open("stories.html", "?id=00000000-0000-0000-0000-000000000000");
  await until(() => m.d.querySelector("#story-article h1"));
  ok(m.d.querySelector("#story-article h1").textContent === "Story not found", "story page: unknown story shows 'not found'");
}

// ---------- homepage: latest stories + newsletter ----------
{
  const { w, d, errors } = await open("index.html");
  await until(() => !d.getElementById("latest-stories").hidden);
  ok(!d.getElementById("latest-stories").hidden && d.querySelectorAll("#latest-stories .story-card").length === 1, "home: Latest Stories appears with the published story");

  const form = d.querySelector("form[data-subscribe]");
  form.elements.email.value = "reader@example.org"; form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await until(() => form.querySelector(".subscribe-msg").classList.contains("ok"));
  ok(form.querySelector(".subscribe-msg").textContent.includes("Thank you"), "home: newsletter sign-up confirms to the visitor");
  form.elements.email.value = "bad"; form.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await until(() => form.querySelector(".subscribe-msg").classList.contains("err"));
  ok(form.querySelector(".subscribe-msg").classList.contains("err"), "home: invalid email shows an error");
  // contact form really sends
  const cf = d.getElementById("contact-form");
  const setv = (id, v) => { d.getElementById(id).value = v; };
  setv("f-name", ""); setv("f-email", "x@example.org"); setv("f-message", "hello");
  cf.dispatchEvent(new w.Event("submit", { cancelable: true }));
  ok(d.getElementById("form-error").textContent.includes("name") && d.getElementById("form-error").style.display === "block", "home: contact form asks for a missing name");
  setv("f-name", "Ada Lovelace"); setv("f-email", "ada@example.org"); setv("f-subject", "Partnership"); setv("f-message", "We would like to partner.");
  cf.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await until(() => d.getElementById("form-success").style.display === "block");
  ok(d.getElementById("form-success").style.display === "block" && d.getElementById("form-error").style.display === "none", "home: contact form shows success after the server accepts it");
  ok(d.getElementById("f-name").value === "", "home: contact form clears after sending");
  // server down: visitor must be told, not shown a fake success
  const realFetch = w.fetch;
  w.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
  setv("f-name", "Bo"); setv("f-email", "bo@example.org"); setv("f-message", "Anyone there?");
  cf.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await until(() => d.getElementById("form-error").style.display === "block" && !d.getElementById("form-submit").disabled);
  ok(d.getElementById("form-error").textContent.includes("wofhrad95@gmail.com") && d.getElementById("form-success").style.display !== "block", "home: contact form is honest when the server is unreachable");
  ok(d.getElementById("form-submit").textContent === "Send Message", "home: send button recovers after an error");
  w.fetch = realFetch;
  ok(errors.length === 0, "home: no script errors " + errors.join(" | "));
}

// subscriber was stored
{
  const r = await handlers["/api/login"](new Request(ORIGIN + "/api/login", { method: "POST", body: JSON.stringify({ password: "test-only-password-not-real" }) }), { ip: "8.8.8.8" });
  const { token } = await r.json();
  const list = await (await handlers["/api/subscribers"](new Request(ORIGIN + "/api/subscribers", { headers: { authorization: "Bearer " + token } }))).json();
  ok(list.count === 1 && list.subscribers[0].email === "reader@example.org", "backend: subscriber from the homepage form was saved");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
