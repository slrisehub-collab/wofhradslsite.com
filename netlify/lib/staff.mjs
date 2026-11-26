import { createHash } from "node:crypto";
import { store, readAll, update } from "./db.mjs";
import { newId, randomToken, safeEqual } from "./util.mjs";
import SEED from "./team-seed.mjs";

// Staff profiles and accounts.
//
// A profile is what visitors see on the About page and at /team/<slug>. A profile may or may
// not have an account:
//   status "profile"  shown on the website, no login
//   status "invited"  an administrator has invited them; they have not set a password yet
//   status "active"   they can log in with their email address and password
// visible: false hides a profile from the website (for example during leave) without deleting it.

const emailKey = (email) => createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");
const tokenHash = (t) => createHash("sha256").update(String(t)).digest("hex");
export const SETUP_DAYS = 7;

export const slugify = (name) => String(name).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "staff";

export async function ensureSeeded() {
  const meta = store("staff-meta");
  if (await meta.get("seeded")) return;
  const res = await meta.setJSON("seeded", { at: new Date().toISOString() }, { onlyIfNew: true });
  if (!res.modified) return; // another request is seeding
  const s = store("staff");
  const now = new Date().toISOString();
  await Promise.all(SEED.map((p, i) => {
    const id = newId();
    return s.setJSON(id, {
      id, slug: slugify(p.name), name: p.name, email: null, title: p.title, bio: p.bio || "", photo: p.photo,
      leader: Boolean(p.leader), order: i, visible: true, role: "staff", status: "profile", createdAt: now, updatedAt: now,
    });
  }));
}

export async function getStaff(id) {
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) return null;
  return store("staff").get(id, { type: "json" });
}

export async function allStaff() {
  await ensureSeeded();
  const list = await readAll(store("staff"));
  return list.sort((a, b) => (b.leader - a.leader) || (a.order - b.order) || a.name.localeCompare(b.name));
}

export async function findByEmail(email) {
  if (!email) return null;
  const ref = await store("staff-email").get(emailKey(email), { type: "json" });
  return ref ? getStaff(ref.id) : null;
}

// Claims an email address for one profile. Fails if another profile already has it.
export async function claimEmail(email, id) {
  const res = await store("staff-email").setJSON(emailKey(email), { id }, { onlyIfNew: true });
  if (res.modified) return true;
  const ref = await store("staff-email").get(emailKey(email), { type: "json" });
  if (ref?.id === id) return true;
  // A leftover claim pointing at a deleted profile can be taken over.
  if (ref && !(await getStaff(ref.id))) { await store("staff-email").setJSON(emailKey(email), { id }); return true; }
  return false;
}
export const releaseEmail = (email) => email ? store("staff-email").delete(emailKey(email)) : null;

export async function uniqueSlug(name, exceptId) {
  const list = await readAll(store("staff"));
  const base = slugify(name);
  let slug = base, n = 2;
  while (list.some((s) => s.slug === slug && s.id !== exceptId)) slug = `${base}-${n++}`;
  return slug;
}

export const photoUrl = (s, small) => {
  if (!s.photo) return null;
  if (s.photo.startsWith("/")) return s.photo;
  return `/api/image?id=${s.photo}${small ? "&size=sm" : ""}`;
};

// What the public may see.
export const publicView = (s) => ({ slug: s.slug, name: s.name, title: s.title, bio: s.bio || "", photoUrl: photoUrl(s, true), photoFull: photoUrl(s), leader: Boolean(s.leader) });

// What an administrator sees in the Team tab: everything except secrets.
export const adminView = (s) => ({
  id: s.id, slug: s.slug, name: s.name, email: s.email, title: s.title, bio: s.bio || "", photoUrl: photoUrl(s, true), leader: Boolean(s.leader),
  order: s.order, visible: s.visible !== false, role: s.role, status: s.status, lastLoginAt: s.lastLoginAt || null,
  setupExpires: s.setupExpires || null, createdAt: s.createdAt, updatedAt: s.updatedAt,
});

// A one-time link for setting a password (an invitation, or a reset). Only a hash of the
// token is stored, so the link can't be rebuilt from the database.
export async function issueSetupLink(id, purpose, origin) {
  const token = randomToken();
  const s = await update(store("staff"), id, (r) => r ? {
    ...r, setupHash: tokenHash(token), setupPurpose: purpose, setupExpires: new Date(Date.now() + SETUP_DAYS * 86400e3).toISOString(),
    status: r.status === "active" ? "active" : "invited",
  } : undefined);
  if (!s) return null;
  return { staff: s, url: `${origin}/admin.html?setup=${id}.${token}` };
}

export async function checkSetupLink(t) {
  const [id, token] = String(t || "").split(".");
  const s = await getStaff(id);
  if (!s || !s.setupHash || !token || !safeEqual(s.setupHash, tokenHash(token))) return null;
  if (!(new Date(s.setupExpires) > new Date())) return null;
  return s;
}
