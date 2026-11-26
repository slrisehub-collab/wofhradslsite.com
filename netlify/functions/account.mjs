import { store, update } from "../lib/db.mjs";
import { checkNewPassword, hashPassword, signStaffToken } from "../lib/auth.mjs";
import { logActivity } from "../lib/activity.mjs";
import { hit } from "../lib/rate.mjs";
import { mailConfigured, sendMail, setupEmail } from "../lib/mail.mjs";
import { checkSetupLink, findByEmail, issueSetupLink } from "../lib/staff.mjs";
import { EMAIL_RE, HttpError, clientIp, json, readJson, wrap } from "../lib/util.mjs";

// /api/account: things people do before they can log in.
//   GET ?t=<link>                 who an invitation or reset link is for, so they can confirm it's them
//   POST { action: "setup" }      choose a password using that link, then log in
//   POST { action: "forgot" }     email a reset link (same answer whether or not the address exists)
export default wrap(async (req, context) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const s = await checkSetupLink(url.searchParams.get("t"));
    if (!s) throw new HttpError(404, "This link has expired or has already been used. Ask an administrator to send a new one.");
    return json({ name: s.name, email: s.email, title: s.title, purpose: s.setupPurpose || "invite" });
  }
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const data = await readJson(req, 3000);
  const ip = clientIp(req, context);

  if (data.action === "setup") {
    if (!(await hit("setup", ip, 20, 3600e3))) throw new HttpError(429, "Too many attempts. Please try again later.");
    const s = await checkSetupLink(data.t);
    if (!s) throw new HttpError(404, "This link has expired or has already been used. Ask an administrator to send a new one.");
    const pw = checkNewPassword(data.password);
    const purpose = s.setupPurpose || "invite";
    const done = await update(store("staff"), s.id, (r) => ({
      ...r, passwordHash: hashPassword(pw), status: "active", setupHash: null, setupExpires: null, setupPurpose: null,
      lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }));
    await logActivity({ name: s.name }, purpose === "invite" ? "Accepted their invitation" : "Reset their password");
    return json({ token: signStaffToken(done), name: done.name, role: done.role, kind: "staff", id: done.id });
  }

  if (data.action === "forgot") {
    const email = String(data.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Please enter your email address.");
    if (!(await hit("forgot", ip, 5, 3600e3)) || !(await hit("forgot-email", email, 3, 3600e3))) {
      throw new HttpError(429, "Too many requests. Please try again later.");
    }
    if (!mailConfigured()) {
      return json({ ok: true, message: "Email isn't set up on this website yet, so please ask an administrator to send you a reset link." });
    }
    const s = await findByEmail(email);
    if (s && s.status === "active") {
      const link = await issueSetupLink(s.id, "reset", url.origin);
      try { await sendMail(setupEmail(link.staff, link.url, "reset")); } catch (e) { console.error("Reset email failed", e); }
    }
    return json({ ok: true, message: "If that address belongs to a staff account, we have emailed it a link to choose a new password." });
  }

  throw new HttpError(400, "Unknown action.");
});

export const config = { path: "/api/account" };
