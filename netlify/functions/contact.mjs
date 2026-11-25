import { store } from "../lib/db.mjs";
import { hit } from "../lib/rate.mjs";
import { mailConfigured, sendMail } from "../lib/mail.mjs";
import { EMAIL_RE, HttpError, clientIp, esc, json, newId, readJson, wrap } from "../lib/util.mjs";

export const REASONS = { general: "General enquiry", partnership: "Partnership", internship: "Internship", volunteering: "Volunteering", donation: "Donation", media: "Media" };
const CURRENCIES = { SLE: "Le", USD: "$", GBP: "£", EUR: "€" };

function readPledge(p) {
  if (p == null) return null;
  const amount = Number(p.amount);
  if (!(amount > 0 && amount < 1e9)) throw new HttpError(400, "Please choose a valid amount.");
  if (!CURRENCIES[p.currency]) throw new HttpError(400, "Please choose a currency.");
  const frequency = p.frequency === "monthly" ? "monthly" : "one-time";
  return { amount: Math.round(amount * 100) / 100, currency: p.currency, frequency };
}
export const pledgeText = (p) => `${CURRENCIES[p.currency]} ${p.amount.toLocaleString("en-GB")} ${p.currency} (${p.frequency})`;

export default wrap(async (req, context) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const data = await readJson(req, 20000);

  // Hidden "website" field: bots fill it in, people don't.
  if (data.website) return json({ ok: true });

  const reason = REASONS[data.reason] ? data.reason : "general";
  const name = String(data.name ?? "").trim();
  const email = String(data.email ?? "").trim();
  const phone = String(data.phone ?? "").trim();
  const subject = String(data.subject ?? "").trim();
  const message = String(data.message ?? "").replace(/\r\n/g, "\n").trim();
  const pledge = reason === "donation" ? readPledge(data.pledge) : null;

  if (!name || name.length > 100) throw new HttpError(400, "Please enter your name.");
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, "Please enter a valid email address.");
  if (phone.length > 40 || (phone && !/^[0-9+()\-.\s]{5,40}$/.test(phone))) throw new HttpError(400, "Please enter a valid phone number, or leave it empty.");
  if (subject.length > 150) throw new HttpError(400, "The subject is too long.");
  if (!message && !pledge) throw new HttpError(400, "Please write a message.");
  if (message.length > 5000) throw new HttpError(400, "The message is too long (5,000 characters at most).");

  // Limits so the form cannot be used to flood the inbox: per visitor and overall.
  const ip = clientIp(req, context);
  if (!(await hit("contact", ip, 5, 3600e3))) throw new HttpError(429, "You have sent several messages already. Please try again later.");
  if (!(await hit("contact-all", "all", 200, 3600e3))) throw new HttpError(429, "We are receiving a lot of messages right now. Please try again later or email us.");

  const id = newId();
  const record = { id, reason, name, email, phone, subject, message, pledge, receivedAt: new Date().toISOString() };
  await store("messages").setJSON(id, record);

  // Optional email alert. The message is already saved, so a failure here never loses it.
  if (mailConfigured()) {
    const topic = pledge ? `Donation pledge: ${pledgeText(pledge)}` : `${REASONS[reason]}: ${subject || "(no subject)"}`;
    const lines = [`${name} (${email}${phone ? ", " + phone : ""})`, pledge ? `Pledge: ${pledgeText(pledge)}` : "", message].filter(Boolean);
    try {
      await sendMail({
        from: process.env.NEWSLETTER_FROM,
        to: [process.env.CONTACT_TO || "wofhrad95@gmail.com"],
        reply_to: email,
        subject: `Website ${topic}`.slice(0, 200),
        html: lines.map((l) => `<p>${esc(l).replace(/\n/g, "<br>")}</p>`).join(""),
        text: lines.join("\n\n"),
      });
    } catch (e) {
      console.error("Contact email alert failed", e);
    }
  }
  return json({ ok: true });
});

export const config = { path: "/api/contact" };
