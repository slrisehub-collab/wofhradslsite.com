import { store, update } from "../lib/db.mjs";
import { MIN_PASSWORD, findEnvUser, passwordOk, signStaffToken, signToken, verifyPassword } from "../lib/auth.mjs";
import { findByEmail } from "../lib/staff.mjs";
import { logActivity } from "../lib/activity.mjs";
import { HttpError, clientIp, json, readJson, sha256hex, sleep, wrap } from "../lib/util.mjs";

const MAX_FAILS = 5;                 // wrong passwords from one address before it is locked
const GLOBAL_MAX_FAILS = 50;         // wrong passwords from everywhere before all logins pause
const LOCK_MS = 15 * 60 * 1000;

// Records one failed attempt and says whether this address (or everyone) is now locked.
// Each attempt is recorded BEFORE the password is checked, using conditional writes, so
// firing many guesses at once cannot get around the limit.
async function reserveAttempt(key) {
  let blocked = false;
  await update(store("auth-attempts"), key, (rec) => {
    const now = Date.now();
    if (!rec || (now - rec.since > LOCK_MS && !(rec.until > now))) rec = { count: 0, since: now, until: 0 };
    if (rec.until > now) { blocked = true; return undefined; }
    const count = rec.count + 1;
    const limit = key === "global" ? GLOBAL_MAX_FAILS : MAX_FAILS;
    return { count, since: rec.since, until: count >= limit ? now + LOCK_MS : 0 };
  });
  return blocked;
}

export default wrap(async (req, context) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");

  const { name, password } = await readJson(req, 2000);
  const ipKey = sha256hex("ip:" + clientIp(req, context));

  if ((await reserveAttempt(ipKey)) || (await reserveAttempt("global"))) {
    throw new HttpError(429, "Too many wrong attempts. Please try again in 15 minutes.");
  }

  // Staff log in with their email address; the environment logins ("Admin") with a name.
  if (String(name || "").includes("@")) {
    const staff = await findByEmail(String(name).trim().toLowerCase());
    if (staff && staff.status === "active" && verifyPassword(password, staff.passwordHash)) {
      await store("auth-attempts").delete(ipKey);
      await update(store("staff"), staff.id, (r) => (r ? { ...r, lastLoginAt: new Date().toISOString() } : undefined));
      await logActivity({ name: staff.name }, "Logged in");
      return json({ token: signStaffToken(staff), name: staff.name, role: staff.role, kind: "staff", id: staff.id, expiresInHours: 12 });
    }
  } else {
    const user = findEnvUser(name);
    if (user && passwordOk(user, password)) {
      if (user.password.length < MIN_PASSWORD) {
        throw new HttpError(403, `For security, admin passwords must be at least ${MIN_PASSWORD} characters. Please set a longer password in your Netlify environment variables, then redeploy.`);
      }
      // A correct password clears this address's count (the global count is left to expire).
      await store("auth-attempts").delete(ipKey);
      await logActivity(user, "Logged in");
      return json({ token: signToken(user), name: user.name, role: user.role, kind: "env", expiresInHours: 12 });
    }
  }

  await sleep(400);
  throw new HttpError(401, name ? "Incorrect email or password." : "Incorrect password.");
});

export const config = { path: "/api/login" };
