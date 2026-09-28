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
