import { store } from "../lib/db.mjs";
import { EMAIL_RE, HttpError, esc, json, newId, readJson, sha256hex, wrap } from "../lib/util.mjs";

const MAX_PER_HOUR = 5;

export default wrap(async (req, context) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const data = await readJson(req, 20000);

  // Hidden "website" field: bots fill it in, people don't.
  if (data.website) return json({ ok: true });

  const name = String(data.name ?? "").trim();
  const email = String(data.email ?? "").trim();
  const subject = String(data.subject ?? "").trim();
  const message = String(data.message ?? "").replace(/\r\n/g, "\n").trim();
  if (!name || name.length > 100) throw new HttpError(400, "Please enter your name.");
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, "Please enter a valid email address.");
  if (subject.length > 150) throw new HttpError(400, "The subject is too long.");
  if (!message) throw new HttpError(400, "Please write a message.");
  if (message.length > 5000) throw new HttpError(400, "The message is too long (5,000 characters at most).");

  // Simple limit per visitor so the form cannot be used to flood the inbox.
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const rateKey = sha256hex("contact:" + ip);
  const rates = store("contact-rate");
  const rec = (await rates.get(rateKey, { type: "json" })) || { count: 0, since: Date.now() };
  if (Date.now() - rec.since > 3600e3) { rec.count = 0; rec.since = Date.now(); }
  if (rec.count >= MAX_PER_HOUR) throw new HttpError(429, "You have sent several messages already. Please try again later.");
  rec.count += 1;
  await rates.setJSON(rateKey, rec);

  const id = newId();
  const record = { id, name, email, subject, message, receivedAt: new Date().toISOString() };
  await store("messages").setJSON(id, record);

  // Optional email alert. The message is already saved, so a failure here never loses it.
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM;
  if (apiKey && from) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [process.env.CONTACT_TO || "wofhrad95@gmail.com"],
          reply_to: email,
          subject: `Website message: ${subject || "(no subject)"}`,
          html: `<p><strong>${esc(name)}</strong> (${esc(email)}) wrote:</p><p>${esc(message).replace(/\n/g, "<br>")}</p>`,
          text: `${name} (${email}) wrote:\n\n${message}`,
        }),
      });
    } catch (e) {
      console.error("Contact email alert failed", e);
    }
  }
  return json({ ok: true });
});

export const config = { path: "/api/contact" };
