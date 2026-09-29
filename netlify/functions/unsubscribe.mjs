import { store } from "../lib/db.mjs";
import { verifyUnsubToken } from "../lib/auth.mjs";
import { esc, sha256hex, wrap } from "../lib/util.mjs";

const page = (title, message) =>
  new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#F8FAFC;color:#1e293b;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:1.5rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:2rem;max-width:460px;text-align:center}
h1{color:#0D2B6B;font-size:1.4rem;margin:0 0 .75rem}p{line-height:1.7;margin:0 0 1.25rem;color:#475569}
a{display:inline-block;background:#1565C0;color:#fff;text-decoration:none;padding:.65rem 1.4rem;border-radius:9999px;font-weight:600}</style></head>
<body><div class="card"><h1>${esc(title)}</h1><p>${esc(message)}</p><a href="/">Back to WOFHRAD-SL</a></div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );

const confirmPage = (email, token) =>
  new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe</title>
<style>body{font-family:system-ui,sans-serif;background:#F8FAFC;color:#1e293b;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:1.5rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:2rem;max-width:460px;text-align:center}
h1{color:#0D2B6B;font-size:1.4rem;margin:0 0 .75rem}p{line-height:1.7;margin:0 0 1.25rem;color:#475569;overflow-wrap:anywhere}
button{background:#1565C0;color:#fff;border:0;padding:.7rem 1.6rem;border-radius:9999px;font:600 1rem system-ui;cursor:pointer}</style></head>
<body><div class="card"><h1>Unsubscribe from the newsletter?</h1><p>${esc(email)}</p>
<form method="POST"><input type="hidden" name="e" value="${esc(email)}"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Yes, unsubscribe me</button></form></div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );

export default wrap(async (req) => {
  const url = new URL(req.url);
  let email = String(url.searchParams.get("e") || "");
  let token = url.searchParams.get("t") || "";

  if (req.method === "POST") {
    // Accept the form on the confirmation page and the one-click POST some mail apps send.
    try {
      const form = await req.formData();
      email = String(form.get("e") || email);
      token = String(form.get("t") || token);
    } catch { /* one-click requests carry no form fields; use the link's values */ }
  } else if (req.method !== "GET") {
    return page("Not allowed", "This link cannot be used that way.");
  }

  email = email.trim().toLowerCase();
  if (!email || !verifyUnsubToken(email, token)) {
    return page("Link not valid", "This unsubscribe link is not valid. Please email us and we will remove you.");
  }
  if (req.method === "GET") return confirmPage(email, token);

  await store("subscribers").delete(sha256hex(email));
  return page("You are unsubscribed", "You will no longer receive the WOFHRAD-SL newsletter.");
});

export const config = { path: "/api/unsubscribe" };
