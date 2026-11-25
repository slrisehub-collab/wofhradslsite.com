import { store, update } from "../lib/db.mjs";
import { subKey } from "../lib/subscribers.mjs";
import { messagePage, safeEqual, wrap } from "../lib/util.mjs";

export default wrap(async (req) => {
  const url = new URL(req.url);
  const email = String(url.searchParams.get("e") || "").trim().toLowerCase();
  const token = String(url.searchParams.get("t") || "");
  const rec = email && (await store("subscribers").get(subKey(email), { type: "json" }));
  if (!rec || !rec.token || !safeEqual(rec.token, token)) {
    return messagePage("Link not valid", "This confirmation link is not valid or has already been used to unsubscribe. Please sign up again on our website.", "", 400);
  }
  if (rec.status !== "confirmed") {
    await update(store("subscribers"), subKey(email), (r) => (r ? { ...r, status: "confirmed", confirmedAt: new Date().toISOString() } : undefined));
  }
  return messagePage("You're subscribed", "Thank you for confirming. You will now receive the WOFHRAD-SL newsletter.");
});

export const config = { path: "/api/confirm" };
