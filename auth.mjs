import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./util.mjs";

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

// The admin password lives ONLY in the ADMIN_PASSWORD environment variable
// on the server. It is never sent to the browser or stored in the pages.
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new HttpError(503, "Admin is not set up yet.");
  return createHash("sha256").update("wofhrad-session:" + pw).digest("hex");
}

export function passwordOk(input) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new HttpError(503, "Admin is not set up yet.");
  const a = createHash("sha256").update(String(input ?? "")).digest();
  const b = createHash("sha256").update(pw).digest();
  return timingSafeEqual(a, b);
}

export function signToken(ttlMs = 12 * 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ttlMs })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function isAdmin(req) {
  try {
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return false;
    const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export function requireAdmin(req) {
  if (!isAdmin(req)) throw new HttpError(401, "Please log in again.");
}

export const unsubToken = (email) =>
  createHmac("sha256", secret()).update("unsub:" + email).digest("hex").slice(0, 32);

export function verifyUnsubToken(email, token) {
  try {
    const a = Buffer.from(String(token));
    const b = Buffer.from(unsubToken(email));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
