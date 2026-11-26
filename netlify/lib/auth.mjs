import { createHash, createHmac, randomBytes, scryptSync } from "node:crypto";
import { HttpError, safeEqual } from "./util.mjs";
import { getStaff } from "./staff.mjs";

export const MIN_PASSWORD = 12;
export const ROLES = ["admin", "editor", "staff"];
const LEVEL = { staff: 1, editor: 2, admin: 3 };

// Two kinds of login:
//
// 1. Staff accounts, created by an administrator in the admin panel (Team tab) and stored
//    with the staff profiles. Staff log in with their email address.
// 2. "Break-glass" logins from environment variables, so the site can always be recovered:
//      ADMIN_PASSWORD   the main administrator's password (log in with the name "Admin")
//      ADMIN_USERS      optional, one per line: name:role:password
//
// Roles: "admin" can do everything; "editor" can write stories, read messages and publish
// reports; "staff" can only edit their own profile.
export function envUsers() {
  const list = [];
  if (process.env.ADMIN_PASSWORD) list.push({ name: "Admin", role: "admin", password: process.env.ADMIN_PASSWORD });
  for (const line of String(process.env.ADMIN_USERS || "").split(/[;\n]/)) {
    const t = line.trim();
    if (!t) continue;
    const a = t.indexOf(":"), b = t.indexOf(":", a + 1);
    if (a < 1 || b < 0) continue;
    const name = t.slice(0, a).trim(), role = t.slice(a + 1, b).trim().toLowerCase(), password = t.slice(b + 1);
    if (name && ["admin", "editor"].includes(role) && password) list.push({ name, role, password });
  }
  return list;
}
export const users = envUsers;
export const adminConfigured = () => true; // staff accounts can exist without environment logins

export function findEnvUser(name) {
  const all = envUsers();
  if (!name) return all.find((u) => u.name === "Admin") || (all.length === 1 ? all[0] : null);
  const n = String(name).trim().toLowerCase();
  return all.find((u) => u.name.toLowerCase() === n) || null;
}
export const findUser = findEnvUser;

// ---------- passwords ----------
// scrypt is deliberately slow, so a stolen copy of the database can't be guessed quickly.
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const test = scryptSync(String(password ?? ""), salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return safeEqual(test, hash);
}
export function passwordOk(user, input) {
  const a = createHash("sha256").update(String(input ?? "")).digest("hex");
  const b = createHash("sha256").update(user ? user.password : "\u0000no-user").digest("hex");
  return safeEqual(a, b) && Boolean(user);
}
export function checkNewPassword(pw) {
  const p = String(pw ?? "");
  if (p.length < MIN_PASSWORD) throw new HttpError(400, `Please choose a password of at least ${MIN_PASSWORD} characters. A short sentence you will remember works well.`);
  if (p.length > 200) throw new HttpError(400, "That password is too long.");
  return p;
}

// ---------- sessions ----------
function sessionKey() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Without SESSION_SECRET, derive a key from the environment passwords; with none of those,
  // fall back to a fixed key plus each account's own password fingerprint (still unforgeable
  // without knowing a password hash, but setting SESSION_SECRET is strongly recommended).
  return createHash("sha256").update("wofhrad-session:" + envUsers().map((u) => u.password).join("\n")).digest("hex");
}
const envFingerprint = (u) => createHash("sha256").update(`pv:${u.name}:${u.password}`).digest("hex").slice(0, 16);
// Changes whenever the password, role or status changes, which ends existing sessions.
const staffFingerprint = (s) => createHash("sha256").update(`pv:${s.id}:${s.passwordHash}:${s.role}:${s.status}`).digest("hex").slice(0, 16);

function sign(payload) {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${p}.${createHmac("sha256", sessionKey()).update(p).digest("base64url")}`;
}
const TTL = 12 * 60 * 60 * 1000;
export const signToken = (user) => sign({ k: "env", u: user.name, r: user.role, pv: envFingerprint(user), exp: Date.now() + TTL });
export const signStaffToken = (s) => sign({ k: "db", u: s.id, pv: staffFingerprint(s), exp: Date.now() + TTL });

// Returns { name, role, kind, id? } for a valid session, or null.
export async function currentUser(req) {
  try {
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    if (!safeEqual(sig, createHmac("sha256", sessionKey()).update(payload).digest("base64url"))) return null;
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!(p.exp > Date.now())) return null;
    if (p.k === "db") {
      const s = await getStaff(p.u);
      if (!s || s.status !== "active" || staffFingerprint(s) !== p.pv) return null;
      return { name: s.name, role: s.role, kind: "staff", id: s.id };
    }
    const user = findEnvUser(p.u);
    if (!user || envFingerprint(user) !== p.pv || user.role !== p.r) return null;
    return { name: user.name, role: user.role, kind: "env" };
  } catch {
    return null;
  }
}

// min "staff": anyone signed in. "editor": editors and administrators. "admin": administrators only.
export async function requireUser(req, min = "editor") {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, "Please log in again.");
  if ((LEVEL[u.role] || 0) < LEVEL[min]) throw new HttpError(403, min === "admin" ? "Only an administrator can do this." : "Your account can't do this. Ask an administrator.");
  return u;
}

// Unsubscribe links in newsletters sent before November 2026 were signed with this key.
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
