import { store } from "../lib/db.mjs";
import { adminConfigured, passwordOk, signToken } from "../lib/auth.mjs";
import { HttpError, clientIp, json, readJson, sha256hex, wrap } from "../lib/util.mjs";

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default wrap(async (req, context) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  if (!adminConfigured()) {
    throw new HttpError(503, "Admin login is not set up yet. Add ADMIN_PASSWORD in your Netlify settings.");
  }

  const ip = clientIp(req, context);
  const key = sha256hex("ip:" + ip);
  const attempts = store("auth-attempts");
  const rec = (await attempts.get(key, { type: "json" })) || { count: 0, until: 0 };
  if (rec.until > Date.now()) {
    throw new HttpError(429, "Too many wrong attempts. Please try again in 15 minutes.");
  }

  const { password } = await readJson(req, 2000);
  if (passwordOk(password)) {
    if (rec.count) await attempts.delete(key);
    return json({ token: signToken(), expiresInHours: 12 });
  }

  rec.count += 1;
  if (rec.count >= MAX_FAILS) {
    rec.until = Date.now() + LOCK_MS;
    rec.count = 0;
  }
  await attempts.setJSON(key, rec);
  await sleep(500);
  throw new HttpError(401, "Incorrect password.");
});

export const config = { path: "/api/login" };
