import { store, update } from "../lib/db.mjs";
import { hit } from "../lib/rate.mjs";
import { confirmEmail, mailConfigured, sendMail } from "../lib/mail.mjs";
import { subKey } from "../lib/subscribers.mjs";
import { EMAIL_RE, HttpError, clientIp, json, randomToken, readJson, wrap } from "../lib/util.mjs";

const RESEND_GAP_MS = 10 * 60 * 1000; // don't email the same address a confirmation more often than this

export const confirmUrl = (origin, rec) => `${origin}/api/confirm?e=${encodeURIComponent(rec.email)}&t=${rec.token}`;

export default wrap(async (req, context) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const data = await readJson(req, 2000);
  const mail = mailConfigured();

  // Hidden "website" field: real people leave it empty, bots fill it in.
  if (data.website) return json({ ok: true, confirm: mail });

  const email = String(data.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, "Please enter a valid email address.");
  if (!(await hit("subscribe", clientIp(req, context), 10, 3600e3))) throw new HttpError(429, "Too many sign-ups from your connection. Please try again later.");

  // New addresses start as "pending" and only receive newsletters once they click the
  // link in the confirmation email. That stops anyone signing up someone else.
  let sendTo = null;
  await update(store("subscribers"), subKey(email), (rec) => {
    const now = new Date();
    if (rec && (rec.status || "confirmed") === "confirmed") return undefined;
    rec = rec || { email, status: "pending", subscribedAt: now.toISOString() };
    if (!rec.token) rec = { ...rec, token: randomToken() };
    if (mail && (!rec.confirmSentAt || now - new Date(rec.confirmSentAt) > RESEND_GAP_MS)) {
      sendTo = rec;
      return { ...rec, confirmSentAt: now.toISOString() };
    }
    return rec;
  });

  if (sendTo) {
    try {
      await sendMail(confirmEmail(email, confirmUrl(new URL(req.url).origin, sendTo)));
    } catch (e) {
      console.error("Confirmation email failed", e);
      // Let the team resend it from the admin panel later.
      await update(store("subscribers"), subKey(email), (r) => (r ? { ...r, confirmSentAt: null } : undefined));
    }
  }
  // Same response whatever the address's state, so the form can't reveal who is subscribed.
  return json({ ok: true, confirm: mail });
});

export const config = { path: "/api/subscribe" };
