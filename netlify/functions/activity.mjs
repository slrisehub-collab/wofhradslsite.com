import { store } from "../lib/db.mjs";
import { requireUser } from "../lib/auth.mjs";
import { HttpError, json, wrap } from "../lib/util.mjs";

export default wrap(async (req) => {
  requireUser(req, "admin");
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const s = store("activity");
  const { blobs } = await s.list();
  // Keys start with the time, so sorting the keys sorts by time.
  const latest = blobs.map((b) => b.key).sort().reverse().slice(0, 150);
  const items = (await Promise.all(latest.map((k) => s.get(k, { type: "json" })))).filter(Boolean);
  return json({ items });
});

export const config = { path: "/api/activity" };
