import { store } from "./db.mjs";

export async function listSubscribers() {
  const s = store("subscribers");
  const { blobs } = await s.list();
  const items = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
  return items.sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));
}
