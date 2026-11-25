import { store } from "../lib/db.mjs";
import { legacyUnsubOk } from "../lib/auth.mjs";
import { subKey } from "../lib/subscribers.mjs";
import { esc, messagePage, safeEqual, wrap } from "../lib/util.mjs";

const confirmForm = (email, token) =>
  messagePage("Unsubscribe from the newsletter?", email,
    `<form method="POST"><input type="hidden" name="e" value="${esc(email)}"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Yes, unsubscribe me</button></form>`);

export default wrap(async (req) => {
  const url = new URL(req.url);
  let email = String(url.searchParams.get("e") || "");
  let token = url.searchParams.get("t") || "";

  if (req.method === "POST") {
    // Accept the form on the confirmation page and the one-click POST that mail apps send.
    try {
      const form = await req.formData();
      email = String(form.get("e") || email);
      token = String(form.get("t") || token);
    } catch { /* one-click requests carry no form fields; use the link's values */ }
  } else if (req.method !== "GET") {
    return messagePage("Not allowed", "This link cannot be used that way.");
  }

  email = email.trim().toLowerCase();
  const subs = store("subscribers");
  const rec = email ? await subs.get(subKey(email), { type: "json" }) : null;
  // Valid if it matches the subscriber's own token, or an older signed link.
  const valid = email && ((rec?.token && safeEqual(rec.token, token)) || legacyUnsubOk(email, token));
  if (!valid) {
    // One message for every failure, so this page can't be used to test who is subscribed.
    return messagePage("Link not valid", "This link is not valid, or you have already unsubscribed. If you still receive our newsletter, email us and we will remove you.", "", 400);
  }
  if (req.method === "GET") return confirmForm(email, token);

  await subs.delete(subKey(email));
  return messagePage("You are unsubscribed", "You will no longer receive the WOFHRAD-SL newsletter.");
});

export const config = { path: "/api/unsubscribe" };
