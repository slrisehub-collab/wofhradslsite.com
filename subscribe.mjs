import { store } from "../lib/db.mjs";
import { EMAIL_RE, HttpError, json, readJson, sha256hex, wrap } from "../lib/util.mjs";

export default wrap(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const data = await readJson(req, 2000);

  // Hidden "website" field: real people leave it empty, bots fill it in.
  if (data.website) return json({ ok: true });

  const email = String(data.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw new HttpError(400, "Please enter a valid email address.");
  }

  const subs = store("subscribers");
  const key = sha256hex(email);
  const existing = await subs.get(key, { type: "json" });
  if (!existing) await subs.setJSON(key, { email, subscribedAt: new Date().toISOString() });
  // Same response either way, so the form can't be used to check who is subscribed.
  return json({ ok: true });
});

export const config = { path: "/api/subscribe" };
