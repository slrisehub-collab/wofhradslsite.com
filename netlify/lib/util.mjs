import { createHash, randomUUID } from "node:crypto";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

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
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

export const sha256hex = (s) => createHash("sha256").update(String(s)).digest("hex");
export const newId = () => randomUUID();
export const isId = (s) => typeof s === "string" && /^[a-f0-9-]{36}$/.test(s);

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// One visitor's address, however the host tells us. Netlify passes context.ip and also
// sets x-nf-client-connection-ip; Vercel (and most other hosts) only set the standard
// x-forwarded-for / x-real-ip headers. Without this, every visitor would fall back to
// the same "unknown" bucket on a host that doesn't set Netlify's own header, and a single
// wrong password anywhere would lock every visitor's rate limit at once.
export function clientIp(req, context) {
  if (context?.ip) return context.ip;
  const nf = req.headers.get("x-nf-client-connection-ip");
  if (nf) return nf;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
