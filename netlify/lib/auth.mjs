import { createHash, createHmac } from "node:crypto";
import { HttpError, safeEqual } from "./util.mjs";

export const MIN_PASSWORD = 12;
export const ROLES = ["admin", "editor"];

// Staff accounts come from environment variables, never from the code:
//   ADMIN_PASSWORD   the main administrator's password (user name "Admin", full access)
//   ADMIN_USERS      optional extra people, one per line (or separated by ";"):
//                    name:role:password      e.g.  Simeon:editor:a-long-password-here
// Roles: "admin" can do everything; "editor" can write stories, read messages and
// publish reports, but cannot see subscribers, send newsletters or change settings.
export function users() {
  const list = [];
  if (process.env.ADMIN_PASSWORD) list.push({ name: "Admin", role: "admin", password: process.env.ADMIN_PASSWORD });
  for (const line of String(process.env.ADMIN_USERS || "").split(/[;\n]/)) {
    const t = line.trim();
    if (!t) continue;
    const a = t.indexOf(":"), b = t.indexOf(":", a + 1);
    if (a < 1 || b < 0) continue;
    const name = t.slice(0, a).trim(), role = t.slice(a + 1, b).trim().toLowerCase(), password = t.slice(b + 1);
    if (name && ROLES.includes(role) && password) list.push({ name, role, password });
  }
  return list;
}
export const adminConfigured = () => users().length > 0;

const fingerprint = (u) => createHash("sha256").update(`pv:${u.name}:${u.password}`).digest("hex").slice(0, 16);

// Key that signs login sessions. Each token also carries a fingerprint of that person's
// password, so changing a password ends every session that used the old one.
function sessionKey() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const all = users();
  if (!all.length) throw new HttpError(503, "Admin is not set up yet.");
  return createHash("sha256").update("wofhrad-session:" + all.map((u) => u.password).join("\n")).digest("hex");
}

export function findUser(name) {
  const all = users();
  if (!name) return all.find((u) => u.name === "Admin") || (all.length === 1 ? all[0] : null);
  const n = String(name).trim().toLowerCase();
  return all.find((u) => u.name.toLowerCase() === n) || null;
}

export function passwordOk(user, input) {
  // Hash both sides first so the comparison takes the same time whatever the length.
  const a = createHash("sha256").update(String(input ?? "")).digest("hex");
  const b = createHash("sha256").update(user ? user.password : "\u0000no-user").digest("hex");
  return safeEqual(a, b) && Boolean(user);
}

export function signToken(user, ttlMs = 12 * 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({ u: user.name, r: user.role, pv: fingerprint(user), exp: Date.now() + ttlMs })).toString("base64url");
  const sig = createHmac("sha256", sessionKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

// Returns { name, role } for a valid session, or null.
export function currentUser(req) {
  try {
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = createHmac("sha256", sessionKey()).update(payload).digest("base64url");
    if (!safeEqual(sig, expected)) return null;
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!(p.exp > Date.now())) return null;
    const user = findUser(p.u);
    if (!user || fingerprint(user) !== p.pv || user.role !== p.r) return null;
    return { name: user.name, role: user.role };
  } catch {
    return null;
  }
}
export const isAdmin = (req) => Boolean(currentUser(req));

// role "editor": any signed-in person. role "admin": administrators only.
export function requireUser(req, role = "editor") {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, "Please log in again.");
  if (role === "admin" && u.role !== "admin") throw new HttpError(403, "Only an administrator can do this.");
  return u;
}

// Unsubscribe links in newsletters sent before November 2026 were signed with this key.
// They are still honoured so nobody is left unable to leave the list. New emails use
// a random token stored with each subscriber instead, which never changes.
function legacyKey() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? createHash("sha256").update("wofhrad-session:" + pw).digest("hex") : null;
}
export function legacyUnsubOk(email, token) {
  const k = legacyKey();
  if (!k) return false;
  return safeEqual(token, createHmac("sha256", k).update("unsub:" + email).digest("hex").slice(0, 32));
}
