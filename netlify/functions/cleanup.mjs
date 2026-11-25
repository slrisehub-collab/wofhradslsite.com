import { store, readAll } from "../lib/db.mjs";

// Runs once a day on Netlify (see config.schedule). It:
//  - deletes rate-limit and login-attempt records older than a day,
//  - deletes photos that were uploaded but never saved into a story (older than a day),
//  - deletes activity-log entries older than a year.
const DAY = 24 * 3600e3;

export async function cleanup(now = Date.now()) {
  const report = { rate: 0, attempts: 0, images: 0, activity: 0 };

  for (const [name, field] of [["rate", "since"], ["auth-attempts", "since"]]) {
    const s = store(name);
    const { blobs } = await s.list();
    for (const b of blobs) {
      const rec = await s.get(b.key, { type: "json" });
      if (!rec || (now - (rec[field] || 0) > DAY && !(rec.until > now))) { await s.delete(b.key); report[name === "rate" ? "rate" : "attempts"]++; }
    }
  }

  const used = new Set();
  for (const p of await readAll(store("posts"))) [p.cover, ...(p.images || [])].filter(Boolean).forEach((i) => used.add(i));
  const images = store("images");
  const { blobs } = await images.list();
  for (const b of blobs) {
    const id = b.key.replace(/^sm\//, "");
    if (used.has(id)) continue;
    const m = await images.getMetadata(b.key);
    const at = m?.metadata?.uploadedAt ? Date.parse(m.metadata.uploadedAt) : NaN;
    if (at && now - at > DAY) { await images.delete(b.key); report.images++; } // photos from before this change have no date and are kept
  }

  const act = store("activity");
  const cutoff = new Date(now - 365 * DAY).toISOString();
  for (const b of (await act.list()).blobs) if (b.key < cutoff) { await act.delete(b.key); report.activity++; }
  return report;
}

export default async () => {
  const report = await cleanup();
  console.log("Daily clean-up", JSON.stringify(report));
  return new Response(JSON.stringify(report), { headers: { "content-type": "application/json" } });
};

export const config = { schedule: "@daily" };
