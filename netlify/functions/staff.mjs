import { store, update } from "../lib/db.mjs";
import { ROLES, checkNewPassword, currentUser, hashPassword, requireUser, verifyPassword } from "../lib/auth.mjs";
import { logActivity } from "../lib/activity.mjs";
import { mailConfigured, sendMail, setupEmail } from "../lib/mail.mjs";
import {
  adminView, allStaff, claimEmail, getStaff, issueSetupLink, publicView, releaseEmail, uniqueSlug,
} from "../lib/staff.mjs";
import { EMAIL_RE, HttpError, cdnCache, isId, json, newId, purge, readJson, wrap } from "../lib/util.mjs";

// /api/staff
//   GET                    public team list (visible profiles only)
//   GET ?slug=x            one public profile
//   GET ?me=1              your own profile (any signed-in staff account)
//   GET ?all=1             every profile with account details (administrators)
//   POST                   add a staff member, optionally inviting them by email (administrators)
//   POST ?id=&action=invite  send (or re-send) an invitation or password-reset link (administrators)
//   POST ?action=password  change your own password
//   PUT ?me=1              edit your own bio and photo
//   PUT ?id=               edit any profile and account (administrators)
//   DELETE ?id=            remove someone who has left (administrators)

const MAX_BIO = 4000;
const clean = (v, max, label) => {
  const t = String(v ?? "").replace(/\r\n/g, "\n").trim();
  if (t.length > max) throw new HttpError(400, `${label} is too long (${max} characters at most).`);
  return t;
};

async function setPhoto(s, photo) {
  if (photo === undefined) return s.photo;
  if (photo === null || photo === "") return null;
  if (!isId(photo)) throw new HttpError(400, "Invalid photo.");
  if (!(await store("images").getMetadata(photo))) throw new HttpError(400, "Please upload the photo again.");
  return photo;
}
async function dropOldPhoto(oldPhoto, newPhoto) {
  if (oldPhoto && oldPhoto !== newPhoto && isId(oldPhoto)) {
    await Promise.all([store("images").delete(oldPhoto), store("images").delete(`sm/${oldPhoto}`)]);
  }
}

// Sends the invitation or reset email if email is set up; always returns the link too, so an
// administrator can pass it on by WhatsApp or in person when email isn't available.
async function sendSetup(id, purpose, origin, actor) {
  const link = await issueSetupLink(id, purpose, origin);
  if (!link) throw new HttpError(404, "Staff member not found.");
  let emailed = false;
  if (mailConfigured() && link.staff.email) {
    try { await sendMail(setupEmail(link.staff, link.url, purpose, actor?.name)); emailed = true; } catch (e) { console.error("Setup email failed", e); }
  }
  return { url: link.url, emailed };
}

export default wrap(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const origin = url.origin;

  if (req.method === "GET") {
    if (url.searchParams.get("me")) {
      const me = await requireUser(req, "staff");
      if (me.kind !== "staff") return json({ profile: null });
      const s = await getStaff(me.id);
      return json({ profile: s ? adminView(s) : null });
    }
    if (url.searchParams.get("all")) {
      await requireUser(req, "admin");
      return json({ staff: (await allStaff()).map(adminView) });
    }
    const list = (await allStaff()).filter((s) => s.visible !== false);
    const slug = url.searchParams.get("slug");
    if (slug) {
      const s = list.find((x) => x.slug === slug);
      if (!s) throw new HttpError(404, "Profile not found.");
      return json(publicView(s), 200, cdnCache(["staff"]));
    }
    return json({ staff: list.map(publicView) }, 200, cdnCache(["staff"]));
  }

  if (req.method === "POST" && url.searchParams.get("action") === "password") {
    const me = await requireUser(req, "staff");
    if (me.kind !== "staff") throw new HttpError(400, "This login's password is set in the Netlify environment variables.");
    const { current, next } = await readJson(req, 2000);
    const s = await getStaff(me.id);
    if (!verifyPassword(current, s.passwordHash)) throw new HttpError(400, "Your current password is not correct.");
    const pw = checkNewPassword(next);
    await update(store("staff"), me.id, (r) => ({ ...r, passwordHash: hashPassword(pw), updatedAt: new Date().toISOString() }));
    await logActivity(me, "Changed their password");
    return json({ ok: true, relogin: true });
  }

  if (req.method === "PUT" && url.searchParams.get("me")) {
    const me = await requireUser(req, "staff");
    if (me.kind !== "staff") throw new HttpError(400, "This login has no staff profile.");
    const data = await readJson(req, 20000);
    const before = await getStaff(me.id);
    const photo = await setPhoto(before, data.photo);
    const bio = data.bio === undefined ? before.bio : clean(data.bio, MAX_BIO, "Your profile");
    const s = await update(store("staff"), me.id, (r) => ({ ...r, bio, photo, updatedAt: new Date().toISOString() }));
    await dropOldPhoto(before.photo, photo);
    await purge(["staff"]);
    await logActivity(me, "Updated their profile");
    return json({ profile: adminView(s) });
  }

  // Everything below is for administrators.
  const actor = await requireUser(req, "admin");

  if (req.method === "POST" && url.searchParams.get("action") === "invite") {
    const s = await getStaff(id);
    if (!s) throw new HttpError(404, "Staff member not found.");
    if (!s.email) throw new HttpError(400, "Add an email address for this person first.");
    const purpose = s.status === "active" ? "reset" : "invite";
    const r = await sendSetup(s.id, purpose, origin, actor);
    await logActivity(actor, purpose === "invite" ? "Sent an invitation" : "Sent a password reset link", s.name);
    return json({ ...r, purpose });
  }

  if (req.method === "POST") {
    const data = await readJson(req, 20000);
    const name = clean(data.name, 100, "The name");
    const email = clean(data.email, 254, "The email").toLowerCase();
    const title = clean(data.title, 120, "The job title");
    const role = ROLES.includes(data.role) ? data.role : "staff";
    if (!name) throw new HttpError(400, "Please enter the person's full name.");
    if (!title) throw new HttpError(400, "Please enter their job title.");
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, "Please enter a valid email address, or leave it empty.");
    if (data.invite && !email) throw new HttpError(400, "An email address is needed to send an invitation.");
    const sid = newId();
    if (email && !(await claimEmail(email, sid))) throw new HttpError(409, "Someone on the team already uses that email address.");
    const now = new Date().toISOString();
    const all = await allStaff();
    const s = {
      id: sid, slug: await uniqueSlug(name), name, email: email || null, title, bio: clean(data.bio, MAX_BIO, "The profile"),
      photo: null, leader: Boolean(data.leader), order: all.length ? Math.max(...all.map((x) => x.order || 0)) + 1 : 0,
      visible: data.visible !== false, role, status: "profile", createdAt: now, updatedAt: now, createdBy: actor.name,
    };
    await store("staff").setJSON(sid, s);
    let invite = null;
    if (data.invite) invite = await sendSetup(sid, "invite", origin, actor);
    await purge(["staff"]);
    await logActivity(actor, data.invite ? "Added and invited a staff member" : "Added a staff member", `${name}${email ? " (" + email + ")" : ""}`);
    return json({ staff: adminView(await getStaff(sid)), invite }, 201);
  }

  if (req.method === "PUT") {
    const before = await getStaff(id);
    if (!before) throw new HttpError(404, "Staff member not found.");
    const data = await readJson(req, 20000);
    const next = { ...before, updatedAt: new Date().toISOString() };
    if (data.name !== undefined) { next.name = clean(data.name, 100, "The name"); if (!next.name) throw new HttpError(400, "The name can't be empty."); }
    if (data.title !== undefined) next.title = clean(data.title, 120, "The job title");
    if (data.bio !== undefined) next.bio = clean(data.bio, MAX_BIO, "The profile");
    if (data.leader !== undefined) next.leader = Boolean(data.leader);
    if (data.visible !== undefined) next.visible = Boolean(data.visible);
    if (data.order !== undefined && Number.isFinite(Number(data.order))) next.order = Number(data.order);
    if (data.role !== undefined) {
      if (!ROLES.includes(data.role)) throw new HttpError(400, "Unknown role.");
      if (actor.kind === "staff" && actor.id === id && data.role !== "admin") throw new HttpError(400, "You can't remove your own administrator access. Ask another administrator.");
      next.role = data.role;
    }
    if (data.photo !== undefined) next.photo = await setPhoto(before, data.photo);
    if (data.email !== undefined) {
      const email = clean(data.email, 254, "The email").toLowerCase();
      if (email && !EMAIL_RE.test(email)) throw new HttpError(400, "Please enter a valid email address.");
      if (email !== (before.email || "")) {
        if (email && !(await claimEmail(email, id))) throw new HttpError(409, "Someone on the team already uses that email address.");
        await releaseEmail(before.email);
        next.email = email || null;
        // A changed address must be confirmed again: the old setup link stops working.
        next.setupHash = null; next.setupExpires = null;
        if (!email) { next.status = "profile"; next.passwordHash = null; }
      }
    }
    if (next.name !== before.name) next.slug = await uniqueSlug(next.name, id);
    await store("staff").setJSON(id, next);
    await dropOldPhoto(before.photo, next.photo);
    await purge(["staff"]);
    await logActivity(actor, "Edited a staff profile", next.name);
    return json({ staff: adminView(next) });
  }

  if (req.method === "DELETE") {
    const s = await getStaff(id);
    if (!s) throw new HttpError(404, "Staff member not found.");
    if (actor.kind === "staff" && actor.id === id) throw new HttpError(400, "You can't remove your own account. Ask another administrator.");
    await store("staff").delete(id);
    await releaseEmail(s.email);
    await dropOldPhoto(s.photo, null);
    await purge(["staff"]);
    await logActivity(actor, "Removed a staff member", s.name);
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/staff" };
