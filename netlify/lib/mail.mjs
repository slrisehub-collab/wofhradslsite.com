import { esc } from "./util.mjs";

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.NEWSLETTER_FROM);

// Sends one or more emails through Resend. A single email goes to /emails, a list to
// /emails/batch (100 at most). idempotencyKey makes a retried request safe: Resend
// will not send the same batch twice within 24 hours.
export async function sendMail(messages, idempotencyKey) {
  const batch = Array.isArray(messages);
  const headers = { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.resend.com/emails${batch ? "/batch" : ""}`, {
    method: "POST", headers, body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    const err = new Error(`Email service error ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json().catch(() => ({}));
}

const ADDRESS = "Women's Forum for Human Rights &amp; Democracy, 17 Frontier Road, Makeni, Sierra Leone.";

export function emailLayout(innerHtml, footerHtml = "") {
  return `<div style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto">
<div style="background:#0D2B6B;color:#fff;padding:20px 24px;font-size:20px;font-weight:bold">WOFHRAD-SL</div>
<div style="padding:24px;font-size:16px">${innerHtml}</div>
<div style="border-top:1px solid #e2e8f0;padding:16px 24px;font-size:12px;color:#64748b">${ADDRESS}<br>${footerHtml}</div></div>`;
}

export const paragraphs = (text) =>
  text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;line-height:1.7">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

export function confirmEmail(email, url) {
  return {
    from: process.env.NEWSLETTER_FROM,
    to: [email],
    subject: "Please confirm your WOFHRAD-SL newsletter subscription",
    html: emailLayout(
      `<p style="margin:0 0 16px;line-height:1.7">Thank you for signing up to the WOFHRAD-SL newsletter. Please confirm that this is your email address:</p>
<p style="margin:0 0 16px"><a href="${esc(url)}" style="display:inline-block;background:#1565C0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Confirm my subscription</a></p>
<p style="margin:0;line-height:1.7;color:#64748b;font-size:14px">If you did not sign up, ignore this email and you will not hear from us.</p>`),
    text: `Thank you for signing up to the WOFHRAD-SL newsletter. Please confirm your subscription by opening this link:\n${url}\n\nIf you did not sign up, ignore this email and you will not hear from us.`,
    ...(process.env.NEWSLETTER_REPLY_TO ? { reply_to: process.env.NEWSLETTER_REPLY_TO } : {}),
  };
}

// Invitation to create an account, or a password reset. The link works once, for 7 days.
export function setupEmail(s, url, purpose, invitedBy) {
  const invite = purpose === "invite";
  const subject = invite ? "You're invited to the WOFHRAD-SL website" : "Reset your WOFHRAD-SL password";
  const intro = invite
    ? `${invitedBy ? esc(invitedBy) + " has" : "WOFHRAD-SL has"} created an account for you on the WOFHRAD-SL website, so you can manage your staff profile${s.role !== "staff" ? " and help run the website" : ""}.`
    : "We received a request to reset the password for your WOFHRAD-SL website account. If you did not ask for this, you can ignore this email.";
  return {
    from: process.env.NEWSLETTER_FROM,
    to: [s.email],
    subject,
    html: emailLayout(
      `<p style="margin:0 0 16px;line-height:1.7">Hello ${esc(s.name)},</p>
<p style="margin:0 0 16px;line-height:1.7">${intro}</p>
<p style="margin:0 0 16px"><a href="${esc(url)}" style="display:inline-block;background:#1565C0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${invite ? "Accept invitation" : "Choose a new password"}</a></p>
<p style="margin:0;line-height:1.7;color:#64748b;font-size:14px">This link works once and expires in 7 days. Your login will be this email address, ${esc(s.email)}.</p>`),
    text: `Hello ${s.name},\n\n${intro.replace(/&amp;/g, "&")}\n\n${invite ? "Accept the invitation" : "Choose a new password"}: ${url}\n\nThis link works once and expires in 7 days. Your login will be this email address, ${s.email}.`,
    ...(process.env.NEWSLETTER_REPLY_TO ? { reply_to: process.env.NEWSLETTER_REPLY_TO } : {}),
  };
}
