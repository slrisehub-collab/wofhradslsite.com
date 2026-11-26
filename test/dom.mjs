// Loads the built pages (dist/) in a simulated browser and drives them against the real API code.
process.env.WOFHRAD_MEMORY_DB = "1";
process.env.ADMIN_PASSWORD = "test-only-password-not-real";
process.env.ADMIN_USERS = "Simeon:editor:simeon-long-password-1";
process.env.RESEND_API_KEY = "test-key";
process.env.NEWSLETTER_FROM = "WOFHRAD-SL <news@example.org>";
import pkg from "jsdom";
const { JSDOM, VirtualConsole } = pkg;
import fs from "node:fs";
import path from "node:path";

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("https://api.resend.com/")) return Response.json({ data: [] });
  if (url.endsWith("/team-template.html")) return new Response(fs.readFileSync("dist/team-template.html", "utf8"));
  if (url.endsWith("/story-template.html")) return new Response(fs.readFileSync("dist/story-template.html", "utf8"));
  return realFetch(input, init);
};

const fn = async (n) => (await import(`../netlify/functions/${n}.mjs`)).default;
const handlers = {};
for (const n of ["login", "posts", "image", "contact", "messages", "subscribe", "subscribers", "newsletter", "settings", "documents", "activity", "story", "feed", "staff", "account", "team"]) {
  handlers["/api/" + n] = await fn(n);
}
const ORIGIN = "https://site.test";
let pass = 0, fail = 0;
const ok = (c, l) => { c ? pass++ : fail++; console.log(c ? "ok  :" : "FAIL:", l); };
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await wait(20); } return false; };

let offline = false;
function apiFetch(input, init = {}) {
  if (offline) return Promise.reject(new TypeError("Failed to fetch"));
  const url = new URL(input, ORIGIN);
  const h = handlers[url.pathname];
  if (!h) return Promise.resolve(new Response("nf", { status: 404 }));
  return h(new Request(url, init), { ip: "3.3.3.3" });
}

// Inline the site's own scripts (as a browser would load them) and drop external ones.
function prepare(html) {
  return html
    .replace(/<script src="\/assets\/([a-z]+\.js)\?v=[a-z0-9]+" defer><\/script>/g, (_, f) => "<script>" + fs.readFileSync("dist/assets/" + f, "utf8") + "</script>")
    .replace(/<script [^>]*src="https?:[^>]*><\/script>/g, "");
}

async function openHtml(html, urlPath) {
  const vc = new VirtualConsole(); const errors = [];
  vc.on("jsdomError", (e) => { if (!/Could not load|Not implemented: navigation/.test(e.message)) errors.push(e.message); });
  vc.on("error", (e) => errors.push(String(e)));
  const dom = new JSDOM(prepare(html), {
    url: ORIGIN + urlPath, runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = apiFetch;
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.scrollTo = () => {};
      w.confirm = () => true;
      w.alert = (m) => errors.push("alert: " + m);
      w.HTMLElement.prototype.focus = function () { w.document.__lastFocus = this; };
      // jsdom has <dialog> but not its methods; real browsers do.
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); };
    },
  });
  await wait(250);
  return { dom, w: dom.window, d: dom.window.document, errors };
}
const open = (file, search = "") => openHtml(fs.readFileSync(`dist/${file}`, "utf8"), `/${file === "index.html" ? "" : file}${search}`);
const submit = (w, form) => form.dispatchEvent(new w.Event("submit", { cancelable: true }));

// ---------- every page: structure and accessibility basics ----------
const pages = [...fs.readdirSync("dist").filter((f) => f.endsWith(".html")), ...fs.readdirSync("dist/programmes").map((f) => "programmes/" + f)];
const A = (await import("../netlify/lib/archive-index.mjs")).default.length;
const files = new Set();
(function walk(dir) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); fs.statSync(p).isDirectory() ? walk(p) : files.add("/" + path.relative("dist", p)); } })("dist");
for (const file of pages) {
  const html = fs.readFileSync("dist/" + file, "utf8");
  const d = new JSDOM(html).window.document;
  const label = file + ":";
  if (!/-template\.html$/.test(file)) ok(d.querySelectorAll("h1").length === 1, `${label} exactly one <h1>`);
  ok(d.querySelectorAll("main").length === 1, `${label} has one <main>`);
  ok([...d.querySelectorAll("img")].every((i) => i.hasAttribute("alt")), `${label} every image has alt text`);
  ok([...d.querySelectorAll("script:not([type='application/ld+json'])")].every((s) => s.src), `${label} no inline scripts (so the security policy can forbid them)`);
  ok(![...d.querySelectorAll("script[src]")].some((s) => /^https?:/.test(s.getAttribute("src"))), `${label} no third-party scripts`);
  ok(!/i0\.wp\.com|wofhrad\.com\/|cdn\.tailwindcss|lucide|fonts\.googleapis|role="menu/.test(html), `${label} no hot-linked images, unused libraries, Google Fonts or menu roles`);
  const broken = [...d.querySelectorAll("a[href^='/'], img[src^='/'], link[href^='/']")]
    .map((a) => a.getAttribute("href") || a.getAttribute("src"))
    .map((h) => h.split("#")[0].split("?")[0])
    .filter((h) => h && h !== "/" && !h.startsWith("/api/") && !["/feed.xml", "/sitemap.xml"].includes(h) && !files.has(h))
    .filter((h) => !(h.startsWith("/stories/") && fs.existsSync("content" + h + ".md")));
  ok(!broken.length, `${label} all local links and images exist${broken.length ? " (missing: " + broken.join(", ") + ")" : ""}`);
}
{
  const home = new JSDOM(fs.readFileSync("dist/index.html", "utf8")).window.document;
  const anchors = [...new JSDOM(fs.readFileSync("dist/partners.html", "utf8")).window.document.querySelectorAll("a[href^='/#']")].map((a) => a.getAttribute("href").slice(2).split("?")[0]);
  const missing = anchors.filter((id) => !home.getElementById(id));
  ok(!missing.length, "links to homepage sections all point at real sections" + (missing.length ? " (missing: " + missing.join(", ") + ")" : ""));
  ok(home.querySelector('link[rel="canonical"]').href === "http://localhost:8888/", "canonical link uses the build's site address");
}

// ---------- admin ----------
let adminToken;
{
  const { w, d, errors } = await open("admin.html");
  const $ = (id) => d.getElementById(id);
  ok(!$("login-view").classList.contains("hidden") && $("app").classList.contains("hidden"), "admin: dashboard hidden until login");

  $("password").value = "nope"; submit(w, $("login-form"));
  await until(() => $("login-msg").textContent.includes("Incorrect"));
  ok($("login-msg").textContent.includes("Incorrect password"), "admin: wrong password shows an error");
  ok($("app").classList.contains("hidden"), "admin: still locked after wrong password");

  $("password").value = "test-only-password-not-real"; submit(w, $("login-form"));
  await until(() => !$("app").classList.contains("hidden"));
  ok(!$("app").classList.contains("hidden") && $("who").textContent.includes("Admin (administrator)"), "admin: correct password opens dashboard and shows who is signed in");
  adminToken = JSON.parse(w.sessionStorage.getItem("wofhrad_admin")).token;

  $("new-story").click(); await wait();
  $("title").value = "Girls' safe spaces <em>grow</em>"; $("body").value = "First paragraph.\n\nSecond paragraph.";
  $("programme").value = "girls-circle";
  submit(w, $("story-form"));
  await until(() => d.querySelectorAll("#story-list .row").length === A + 1);
  ok(d.querySelectorAll("#story-list .row").length === A + 1 && d.querySelector("#story-list .row").textContent.includes("Girls' safe spaces"), "admin: published story appears at the top of the list");
  ok(d.querySelectorAll("#story-list .badge.archive").length === A && !d.querySelector(".badge.archive").closest(".row").querySelector("button"), "admin: stories from the old website are listed but cannot be deleted from the panel");
  ok(!$("story-list").innerHTML.includes("<em>"), "admin: title shown as text, not HTML");
  ok(d.querySelector("#story-list a").getAttribute("href").startsWith("/stories/"), "admin: View opens the story's own page");

  $("new-story").click(); await wait();
  $("title").value = "Draft one"; $("body").value = "hidden"; d.querySelector("input[name=status][value=draft]").checked = true;
  submit(w, $("story-form"));
  await until(() => d.querySelectorAll("#story-list .row").length === A + 2);
  ok($("story-list").textContent.includes("Draft"), "admin: draft is marked as draft");

  d.querySelector('.tab[data-tab="settings"]').click();
  await wait(150);
  $("s-orangeMoney").value = "076 123456 (WOFHRAD-SL)"; $("s-registrationNumber").value = "CBO/123"; $("s-whatsapp").value = "+232 76 335 749";
  submit(w, $("settings-form"));
  await until(() => $("settings-msg").textContent.includes("Saved"));
  ok($("settings-msg").textContent.includes("Saved"), "admin: donation settings can be saved");

  d.querySelector('.tab[data-tab="activity"]').click();
  await until(() => $("activity-list").textContent.includes("Published a story"));
  ok($("activity-list").textContent.includes("Admin: Published a story"), "admin: activity tab shows who did what");
  ok(!errors.length, "admin: no script errors " + errors.join(" | "));
}
{
  const { w, d } = await open("admin.html");
  const $ = (id) => d.getElementById(id);
  $("login-name").value = "Simeon"; $("password").value = "simeon-long-password-1"; submit(w, $("login-form"));
  await until(() => !$("app").classList.contains("hidden"));
  ok(d.querySelector('.tab[data-tab="subs"]').classList.contains("hidden") && !d.querySelector('.tab[data-tab="docs"]').classList.contains("hidden"), "admin: an editor does not see subscriber, newsletter or settings tabs");
}

// ---------- homepage ----------
{
  const { w, d, errors } = await open("index.html");
  await until(() => !d.getElementById("latest-stories").hidden);
  ok(!d.getElementById("latest-stories").hidden && d.querySelectorAll("#latest-stories .story-card").length === 3, "home: Latest Stories shows the three newest stories");
  ok(d.querySelector("#latest-stories .story-tag").textContent === "Girls Circle Collective" && d.querySelector("#latest-stories .story-card h3").textContent.includes("safe spaces"), "home: newest story first, with its programme");
  ok(d.querySelector("[data-years-since]").textContent === String(new Date().getFullYear() - 2006), "home: years of service are worked out from the founding year");

  const burger = d.getElementById("hamburger"), menu = d.getElementById("mobile-menu");
  burger.click();
  ok(!menu.hidden && burger.getAttribute("aria-expanded") === "true", "home: mobile menu opens");
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  ok(menu.hidden && burger.getAttribute("aria-expanded") === "false", "home: Escape closes the mobile menu");

  const toggle = d.querySelector(".marquee-toggle");
  toggle.click();
  ok(d.getElementById("partner-marquee").classList.contains("paused") && toggle.getAttribute("aria-pressed") === "true", "home: partner logos can be paused");

  const nl = d.querySelector("form[data-subscribe]");
  nl.elements.email.value = "reader@example.org"; submit(w, nl);
  await until(() => nl.querySelector(".subscribe-msg").classList.contains("ok"));
  ok(nl.querySelector(".subscribe-msg").textContent.includes("confirm"), "home: newsletter sign-up asks the visitor to confirm by email");
  nl.elements.email.value = "nope"; submit(w, nl);
  ok(nl.querySelector(".subscribe-msg").classList.contains("err"), "home: invalid email shows an error");

  const $ = (id) => d.getElementById(id);
  submit(w, $("contact-form"));
  ok($("form-error").textContent.includes("name") && $("f-name").getAttribute("aria-invalid") === "true", "home: contact form asks for a missing name and marks the field");
  $("f-name").value = "Ann"; $("f-email").value = "ann@example.org"; $("f-message").value = "Hello"; $("f-reason").value = "partnership";
  submit(w, $("contact-form"));
  await until(() => $("form-success").style.display === "block");
  ok($("form-success").style.display === "block" && $("f-name").value === "", "home: contact form shows success and clears");

  offline = true;
  $("f-name").value = "Ann"; $("f-email").value = "ann@example.org"; $("f-message").value = "Hello";
  submit(w, $("contact-form"));
  await until(() => $("form-error").style.display === "block");
  ok($("form-error").textContent.includes("wofhrad95@gmail.com") && !$("form-submit").disabled, "home: contact form is honest when the server is unreachable, and recovers");
  offline = false;
  ok(!errors.length, "home: no script errors " + errors.join(" | "));
}
{
  const { d } = await open("index.html", "?reason=internship");
  await until(() => !d.querySelector("[data-whatsapp-wrap]").hidden);
  ok(d.querySelector("[data-whatsapp]").href === "https://wa.me/23276335749" && !d.querySelector("[data-whatsapp-wrap]").hidden, "home: WhatsApp link appears once a number is saved in settings");
  ok(d.getElementById("f-reason").value === "internship", "home: internship links pre-select the contact topic");
}

// ---------- stories ----------
{
  const { d, errors } = await open("stories.html");
  await until(() => d.querySelectorAll("#story-grid .story-card").length === 12);
  ok(d.querySelectorAll("#story-grid .story-card").length === 12 && !d.getElementById("story-grid").textContent.includes("Draft one") && !d.getElementById("load-more").hidden, "stories: first 12 stories listed with Load more, draft hidden");
  d.getElementById("load-more").click();
  await until(() => d.querySelectorAll("#story-grid .story-card").length === A + 1);
  ok(d.querySelectorAll("#story-grid .story-card").length === A + 1 && d.getElementById("load-more").hidden, "stories: Load more shows the rest");
  ok(d.querySelectorAll("#year option").length > 4, "stories: year filter lists the years");
  ok(d.querySelectorAll("#filters .filter-chip").length === 6, "stories: programme filters shown");
  [...d.querySelectorAll("#filters .filter-chip")].find((c) => c.textContent === "People to People").click();
  await until(() => d.getElementById("list-state").textContent.includes("No stories from this programme"));
  ok(d.querySelectorAll("#story-grid .story-card").length === 0, "stories: filtering by a programme with no stories says so");
  ok(!errors.length, "stories: no script errors " + errors.join(" | "));
}
{
  const { d } = await open("stories.html", "?programme=girls-circle");
  await until(() => d.querySelectorAll("#story-grid .story-card").length === 1);
  ok(d.querySelector('#filters [aria-pressed="true"]').textContent === "Girls Circle Collective", "stories: programme filter can be set from the link");
}
{
  const list = await (await handlers["/api/posts"](new Request(ORIGIN + "/api/posts"))).json();
  const res = await handlers["/api/story"](new Request(ORIGIN + "/stories/" + list.posts[0].id));
  const { d, errors } = await openHtml(await res.text(), "/stories/" + list.posts[0].id);
  ok(d.querySelector("h1").textContent.includes("<em>grow</em>") && d.querySelectorAll(".story-text p").length === 2, "story page: title and paragraphs rendered on the server, safely");
  ok(!d.getElementById("copy-link").hidden && d.querySelector('.share-btn[href^="https://wa.me/"]').href.includes(encodeURIComponent("/stories/")), "story page: share buttons use the story's own address");
  ok(!errors.length, "story page: no script errors " + errors.join(" | "));
}


{
  const { w, d } = await open("stories.html", "?q=kamakwie");
  await until(() => d.querySelectorAll("#story-grid .story-card").length === 2);
  ok(d.getElementById("q").value === "kamakwie" && [...d.querySelectorAll("#story-grid h3")].every((h) => /kamakwie/i.test(h.textContent)), "stories: search from the link finds matching stories");
}
{
  const html = await (await handlers["/api/story"](new Request(ORIGIN + "/stories/the-road-to-kamakwie"))).text();
  const { w, d, errors } = await openHtml(html, "/stories/the-road-to-kamakwie");
  ok(d.querySelector("h1").textContent === "The road to Kamakwie" && d.querySelectorAll(".gallery-item").length === 2, "archived story: title and photo gallery");
  const dlg = d.querySelector("dialog.lightbox");
  d.querySelector(".gallery-item").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  ok(dlg && dlg.open && dlg.querySelector("img").getAttribute("src").includes("/assets/content/") && dlg.querySelector("p").textContent.includes("1 of 2"), "archived story: photos open in the lightbox");
  dlg.querySelector(".lb-next").click();
  ok(dlg.querySelector("p").textContent.includes("2 of 2"), "lightbox: next photo");
  dlg.querySelector(".lb-close").click();
  ok(!dlg.open, "lightbox: closes");
  await until(() => !d.getElementById("related").hidden);
  ok(d.querySelectorAll("#related .story-card").length === 3 && ![...d.querySelectorAll("#related a")].some((a) => a.getAttribute("href") === "/stories/the-road-to-kamakwie"), "archived story: three more stories, not including itself");
  ok(!errors.length, "archived story: no script errors " + errors.join(" | "));
}
{
  const { d, errors } = await open("programmes/peacebuilding.html");
  await until(() => !d.getElementById("related").hidden);
  ok(d.querySelectorAll(".gallery-item").length >= 6 && d.querySelector("#related .story-card"), "programme page: photo gallery and related stories");
  ok(!errors.length, "programme page: no script errors " + errors.join(" | "));
}
{
  const { d, errors } = await open("about.html");
  await until(() => d.querySelectorAll("#team-grid .team-member").length === 13);
  ok(d.querySelectorAll("#team-leaders .leader-card").length === 2 && d.querySelectorAll("#team-grid .team-member").length === 13 && d.getElementById("team-state").hidden, "about: team loads from the staff profiles (2 leaders, 13 staff)");
  ok(d.querySelector("#team-leaders a").getAttribute("href") === "/team/isha-kanu-moriba-alieu" && [...d.querySelectorAll("#team-grid a")].every((a) => a.getAttribute("href").startsWith("/team/")), "about: every photo and name links to that person's profile");
  ok(!d.getElementById("team-grid").textContent.includes("Fatima"), "about: Fatima D. Kamara is not listed");
  ok(d.querySelectorAll(".value-card").length === 6 && d.querySelectorAll(".timeline li").length >= 5, "about: values and timeline");
  ok(!errors.length, "about: no script errors " + errors.join(" | "));
}
{
  const html = await (await handlers["/api/team"](new Request(ORIGIN + "/team/emilia-kamara-jengo"))).text();
  const { d, errors } = await openHtml(html, "/team/emilia-kamara-jengo");
  ok(d.querySelector("h1").textContent === "Emilia Kamara Jengo" && d.querySelector(".profile-photo img") && d.querySelector(".story-text p").textContent.includes("co-founded"), "profile page: photo, name and bio");
  ok(!errors.length, "profile page: no script errors " + errors.join(" | "));
}

// ---------- inviting a new staff member, end to end ----------
{
  const { w, d, errors } = await open("admin.html");
  const $ = (id) => d.getElementById(id);
  $("password").value = "test-only-password-not-real"; submit(w, $("login-form"));
  await until(() => !$("app").classList.contains("hidden"));
  d.querySelector('.tab[data-tab="team"]').click();
  await until(() => d.querySelectorAll("#team-list .row").length === 15);
  ok(d.querySelectorAll("#team-list .row").length === 15 && d.querySelectorAll("#team-list .badge.profile").length === 15, "team tab: lists everyone, none with accounts yet");
  $("team-add-open").click();
  $("sf-name").value = "Fatmata Sesay"; $("sf-email").value = "fatmata.sesay@example.org"; $("sf-title").value = "Field Officer";
  submit(w, $("staff-form"));
  await until(() => !$("invite-box").classList.contains("hidden"));
  const inviteUrl = $("invite-url").value;
  ok($("invite-text").textContent.includes("emailed") && inviteUrl.includes("/admin.html?setup="), "team tab: adding with an email sends an invitation and shows the link");
  await until(() => d.querySelectorAll("#team-list .row").length === 16);
  ok(d.querySelector("#team-list").textContent.includes("Fatmata Sesay") && d.querySelectorAll("#team-list .badge.invited").length === 1, "team tab: new person shows as Invited");
  ok(!errors.length, "team tab: no script errors " + errors.join(" | "));

  const inv = await open("admin.html", "?" + inviteUrl.split("?")[1]);
  const $$ = (id) => inv.d.getElementById(id);
  await until(() => $$("setup-email").textContent === "fatmata.sesay@example.org");
  ok(!$$("setup-view").classList.contains("hidden") && $$("setup-name").textContent === "Fatmata Sesay" && $$("setup-job").textContent === "Field Officer", "invitation: shows the person's name, email and job title to confirm");
  $$("setup-pw").value = "fatmata-long-pass-1"; $$("setup-pw2").value = "different-pass-123"; submit(inv.w, $$("setup-form"));
  ok($$("setup-msg").textContent.includes("different"), "invitation: the two passwords must match");
  $$("setup-pw2").value = "fatmata-long-pass-1"; submit(inv.w, $$("setup-form"));
  await until(() => !$$("app").classList.contains("hidden"));
  ok(!$$("tab-me").classList.contains("hidden") && inv.d.querySelector('.tab[data-tab="stories"]').classList.contains("hidden") && inv.d.querySelector('.tab[data-tab="team"]').classList.contains("hidden"), "invitation: a staff account lands on My profile, without the admin tabs");
  await until(() => $$("me-facts").textContent.includes("fatmata.sesay@example.org"));
  $$("me-bio").value = "I work with communities in Bombali."; submit(inv.w, $$("me-form"));
  await until(() => $$("me-msg").classList.contains("ok"));
  ok($$("me-msg").textContent.includes("Saved") && $$("me-view").getAttribute("href") === "/team/fatmata-sesay", "my profile: staff save their bio and can view their public page");
  ok(!inv.errors.length, "invitation flow: no script errors " + inv.errors.join(" | "));
}

// ---------- donate ----------
{
  const { w, d, errors } = await open("donate.html");
  const $ = (id) => d.getElementById(id);
  await until(() => !$("pay-box").hidden);
  ok(!$("pay-box").hidden && $("pay-methods").textContent.includes("Orange Money") && $("pay-methods").textContent.includes("076 123456"), "donate: payment methods from the admin settings are shown");
  ok(!$("reg-line").hidden && $("reg-line").textContent.includes("CBO/123"), "donate: registration number shown");
  ok($("donate-submit").disabled, "donate: pledge button disabled until an amount is chosen");
  d.querySelectorAll(".amount-btn")[1].click();
  ok(!$("donate-submit").disabled && $("donate-summary").textContent.includes("Le 250"), "donate: choosing an amount enables the pledge");
  submit(w, $("pledge-form"));
  ok($("donate-msg").textContent.includes("name"), "donate: pledge needs a name");
  $("donor-name").value = "Fatmata"; $("donor-email").value = "fatmata@example.org";
  submit(w, $("pledge-form"));
  await until(() => $("donate-msg").classList.contains("ok"));
  ok($("donate-msg").textContent.includes("We have received your pledge"), "donate: pledge is sent to the team (no email program needed)");
  const msgs = await (await handlers["/api/messages"](new Request(ORIGIN + "/api/messages", { headers: { authorization: "Bearer " + adminToken } }))).json();
  ok(msgs.messages.some((m) => m.reason === "donation" && m.pledge.amount === 250 && m.name === "Fatmata"), "donate: pledge appears in the admin Messages tab");
  ok(!errors.length, "donate: no script errors " + errors.join(" | "));
}

// ---------- reports ----------
{
  await handlers["/api/documents"](new Request(ORIGIN + "/api/documents", { method: "POST", headers: { authorization: "Bearer " + adminToken, "x-title": "Annual Report 2025", "x-year": "2025" }, body: new TextEncoder().encode("%PDF-1.4\n") }));
  const { d, errors } = await open("reports.html");
  await until(() => d.querySelectorAll("#doc-list .doc-item").length === 1);
  ok(d.querySelector("#doc-list h3").textContent === "Annual Report 2025", "reports: published report is listed for download");
  ok(!d.getElementById("reg-row").hidden, "reports: registration number shown");
  ok(!errors.length, "reports: no script errors " + errors.join(" | "));
}

// ---------- backend saw the homepage sign-up ----------
{
  const subs = await (await handlers["/api/subscribers"](new Request(ORIGIN + "/api/subscribers", { headers: { authorization: "Bearer " + adminToken } }))).json();
  ok(subs.subscribers.some((s) => s.email === "reader@example.org" && s.status === "pending"), "backend: homepage subscriber saved as pending until they confirm");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
