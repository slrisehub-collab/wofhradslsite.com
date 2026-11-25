import { store, readAll, update } from "./db.mjs";
import { randomToken, sha256hex } from "./util.mjs";

export const subKey = (email) => sha256hex(String(email).trim().toLowerCase());

// Subscribers created before double opt-in existed have no status: they signed up
// on the old form and are treated as confirmed.
export const statusOf = (s) => s.status || "confirmed";

export async function listSubscribers() {
  const items = await readAll(store("subscribers"));
  return items.sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));
}

// Every subscriber needs a permanent random token for confirm and unsubscribe links.
export async function ensureToken(email) {
  const rec = await update(store("subscribers"), subKey(email), (r) => (r && !r.token ? { ...r, token: randomToken() } : undefined));
  return rec;
}
