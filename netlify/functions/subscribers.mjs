import { store, update } from "../lib/db.mjs";
import { requireUser } from "../lib/auth.mjs";
import { logActivity } from "../lib/activity.mjs";
import { confirmEmail, mailConfigured, sendMail } from "../lib/mail.mjs";
import { listSubscribers, statusOf, subKey } from "../lib/subscribers.mjs";
import { confirmUrl } from "./subscribe.mjs";
import { HttpError, json, randomToken, readJson, sleep, wrap } from "../lib/util.mjs";

// Stops spreadsheet programs from treating a value as a formula.
const csvCell = (v) => {
  const t = String(v ?? "");
  return /^[=+\-@\t\r]/.test(t) ? `"'${t.replace(/"/g, '""')}"` : `"${t.replace(/"/g, '""')}"`;
};
const view = (s) => ({ email: s.email, status: statusOf(s), subscribedAt: s.subscribedAt, confirmedAt: s.confirmedAt || null, confirmSentAt: s.confirmSentAt || null });

export default wrap(async (req) => {
  const user = requireUser(req, "admin");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const subs = (await listSubscribers()).map(view);
    if (url.searchParams.get("format") === "csv") {
      const csv = ["email,status,subscribed_at,confirmed_at", ...subs.map((s) => [s.email, s.status, s.subscribedAt, s.confirmedAt || ""].map(csvCell).join(","))].join("\n");
      await logActivity(user, "Downloaded the subscriber list");
      return new Response(csv, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="wofhrad-subscribers.csv"', "cache-control": "no-store" },
      });
    }
    const confirmed = subs.filter((s) => s.status === "confirmed").length;
    return json({ count: subs.length, confirmed, pending: subs.length - confirmed, subscribers: subs });
  }

  // Send (or resend) confirmation emails to people who haven't confirmed yet.
  // Works through the list for a few seconds per call; the admin page calls again
  // until "remaining" is 0, so a long list never hits the function time limit.
  if (req.method === "POST") {
    const { action } = await readJson(req, 500);
    if (action !== "send-confirmations") throw new HttpError(400, "Unknown action.");
    if (!mailConfigured()) throw new HttpError(501, "Email sending is not set up yet. Add RESEND_API_KEY and NEWSLETTER_FROM first.");
    const dayAgo = Date.now() - 24 * 3600e3;
    const due = (await listSubscribers()).filter((s) => statusOf(s) === "pending" && !(s.confirmSentAt && new Date(s.confirmSentAt) > dayAgo));
    const origin = url.origin;
    const started = Date.now();
    let sent = 0;
    for (const s of due) {
      if (Date.now() - started > 7000) break;
      const rec = await update(store("subscribers"), subKey(s.email), (r) => (r ? { ...r, token: r.token || randomToken(), confirmSentAt: new Date().toISOString() } : undefined));
      if (!rec) continue;
      await sendMail(confirmEmail(rec.email, confirmUrl(origin, rec)));
      sent++;
      await sleep(250); // stay inside the email service's rate limit
    }
    if (sent) await logActivity(user, "Sent confirmation emails", `${sent} sent`);
    return json({ sent, remaining: due.length - sent });
  }

  if (req.method === "DELETE") {
    const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
    if (!email) throw new HttpError(400, "Missing email.");
    await store("subscribers").delete(subKey(email));
    await logActivity(user, "Removed a subscriber", email);
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/subscribers" };
