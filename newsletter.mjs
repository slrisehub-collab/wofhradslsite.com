import { requireAdmin, unsubToken } from "../lib/auth.mjs";
import { HttpError, esc, json, readJson, wrap } from "../lib/util.mjs";
import { listSubscribers } from "../lib/subscribers.mjs";

function buildHtml(message, unsubUrl) {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.7">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto">
<div style="background:#0D2B6B;color:#fff;padding:20px 24px;font-size:20px;font-weight:bold">WOFHRAD-SL</div>
<div style="padding:24px;font-size:16px">${paragraphs}</div>
<div style="border-top:1px solid #e2e8f0;padding:16px 24px;font-size:12px;color:#64748b">
Women's Forum for Human Rights &amp; Democracy, 17 Frontier Road, Makeni, Sierra Leone.<br>
<a href="${esc(unsubUrl)}" style="color:#1565C0">Unsubscribe</a></div></div>`;
}

export default wrap(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  requireAdmin(req);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM;
  if (!apiKey || !from) {
    throw new HttpError(501, "Sending is not set up yet. Add RESEND_API_KEY and NEWSLETTER_FROM in Netlify, or export the subscriber list instead.");
  }

  const data = await readJson(req, 60000);
  const subject = String(data.subject ?? "").trim();
  const message = String(data.message ?? "").replace(/\r\n/g, "\n").trim();
  if (!subject || subject.length > 150) throw new HttpError(400, "Please add a subject (150 characters or fewer).");
  if (!message) throw new HttpError(400, "Please write the newsletter.");

  const subs = await listSubscribers();
  if (!subs.length) throw new HttpError(400, "There are no subscribers yet.");

  const origin = new URL(req.url).origin;
  const replyTo = process.env.NEWSLETTER_REPLY_TO;
  let sent = 0;
  let failed = 0;
  let firstError = "";

  for (let i = 0; i < subs.length; i += 100) {
    const batch = subs.slice(i, i + 100).map((s) => {
      const unsubUrl = `${origin}/api/unsubscribe?e=${encodeURIComponent(s.email)}&t=${unsubToken(s.email)}`;
      return {
        from,
        to: [s.email],
        subject,
        html: buildHtml(message, unsubUrl),
        text: `${message}\n\n--\nUnsubscribe: ${unsubUrl}`,
        headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        ...(replyTo ? { reply_to: replyTo } : {}),
      };
    });
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (res.ok) sent += batch.length;
      else {
        failed += batch.length;
        if (!firstError) firstError = (await res.text()).slice(0, 300);
      }
    } catch (e) {
      failed += batch.length;
      if (!firstError) firstError = String(e.message || e);
    }
  }

  return json({ sent, failed, error: firstError || undefined });
});

export const config = { path: "/api/newsletter" };
