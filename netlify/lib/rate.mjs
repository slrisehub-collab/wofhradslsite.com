import { store, update } from "./db.mjs";
import { sha256hex } from "./util.mjs";

// Counts events per key inside a time window. Safe under simultaneous requests:
// the count is updated with a conditional write, so parallel requests cannot all
// read the same old value and slip through.
export async function hit(bucket, id, limit, windowMs) {
  const key = `${bucket}/${sha256hex(id)}`;
  let allowed = false;
  await update(store("rate"), key, (rec) => {
    const now = Date.now();
    if (!rec || now - rec.since > windowMs) rec = { count: 0, since: now };
    if (rec.count >= limit) { allowed = false; return undefined; }
    allowed = true;
    return { count: rec.count + 1, since: rec.since };
  });
  return allowed;
}
