import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

// Security headers for HTML that functions render. netlify.toml headers only cover
// static files, so pages built by functions must carry their own.
export const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; script-src 'self' https://plausible.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://plausible.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};
export const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS, ...headers } });

// Public responses that the CDN may keep. Writes purge them by tag (see purge below),
// so new stories appear straight away even though the cache is long.
export const cdnCache = (tags, seconds = 3600) => ({
  "cache-control": "public, max-age=0, must-revalidate",
  "netlify-cdn-cache-control": `public, durable, s-maxage=${seconds}, stale-while-revalidate=86400`,
  "cdn-cache-control": `public, s-maxage=${seconds}, stale-while-revalidate=86400`,
  "netlify-cache-tag": tags.join(","),
});

export async function purge(tags) {
  if (process.env.WOFHRAD_MEMORY_DB === "1" || !process.env.NETLIFY_PURGE_API_TOKEN) return;
  try {
    const { purgeCache } = await import("@netlify/functions");
    await purgeCache({ tags });
  } catch (e) {
    console.error("Cache purge failed", e);
  }
}

// Wraps a handler so thrown HttpErrors become clean JSON responses.
export const wrap = (fn) => async (req, context) => {
  try {
    return await fn(req, context);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong on the server." }, 500);
  }
};

export async function readJson(req, maxChars = 200000) {
  const text = await req.text();
  if (text.length > maxChars) throw new HttpError(413, "Request is too large.");
  try {
    const v = JSON.parse(text || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

export const sha256hex = (s) => createHash("sha256").update(String(s)).digest("hex");
export const newId = () => randomUUID();
export const randomToken = () => randomBytes(24).toString("hex");
export const isId = (s) => typeof s === "string" && /^[a-f0-9-]{36}$/.test(s);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
}

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// One visitor's address, however the host reports it. Netlify passes context.ip;
// Vercel sets x-forwarded-for itself (it overwrites any value the visitor sends).
export function clientIp(req, context) {
  if (context?.ip) return context.ip;
  const nf = req.headers.get("x-nf-client-connection-ip");
  if (nf) return nf;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Small framed page used by the unsubscribe and confirm links.
export function messagePage(title, message, extra = "", status = 200) {
  return html(`<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | WOFHRAD-SL</title>
<style>body{font-family:system-ui,sans-serif;background:#F8FAFC;color:#1e293b;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:1.5rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:2rem;max-width:460px;text-align:center}
h1{color:#0D2B6B;font-size:1.4rem;margin:0 0 .75rem}p{line-height:1.7;margin:0 0 1.25rem;color:#475569;overflow-wrap:anywhere}
a,button{display:inline-block;background:#1565C0;color:#fff;text-decoration:none;border:0;padding:.65rem 1.4rem;border-radius:9999px;font:600 1rem system-ui;cursor:pointer}</style></head>
<body><main class="card"><h1>${esc(title)}</h1><p>${esc(message)}</p>${extra || '<a href="/">Back to WOFHRAD-SL</a>'}</main></body></html>`, status);
}
