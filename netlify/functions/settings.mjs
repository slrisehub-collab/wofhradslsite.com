import { store } from "../lib/db.mjs";
import { requireUser } from "../lib/auth.mjs";
import { logActivity } from "../lib/activity.mjs";
import { HttpError, cdnCache, json, purge, readJson, wrap } from "../lib/util.mjs";

// Details the team can change without a developer: how to pay, and the registration number.
const FIELDS = {
  donateLink: 300,          // e.g. a Stripe Payment Link, Flutterwave or Donorbox page
  orangeMoney: 300,
  afrimoney: 300,
  bankDetails: 1000,
  whatsapp: 30,             // WhatsApp number shown as a chat link across the site
  registrationNumber: 100,
};

export async function readSettings() {
  return (await store("settings").get("site", { type: "json" })) || {};
}

export default wrap(async (req) => {
  if (req.method === "GET") {
    const s = await readSettings();
    const out = {};
    for (const k of Object.keys(FIELDS)) out[k] = s[k] || "";
    return json(out, 200, cdnCache(["settings"]));
  }

  if (req.method === "PUT") {
    const user = await requireUser(req, "admin");
    const data = await readJson(req, 10000);
    const next = { updatedAt: new Date().toISOString(), updatedBy: user.name };
    for (const [k, max] of Object.entries(FIELDS)) {
      const v = String(data[k] ?? "").replace(/\r\n/g, "\n").trim();
      if (v.length > max) throw new HttpError(400, `"${k}" is too long (${max} characters at most).`);
      next[k] = v;
    }
    if (next.whatsapp && !/^\+?[0-9 ()-]{8,30}$/.test(next.whatsapp)) throw new HttpError(400, "Please enter the WhatsApp number with the country code, for example +232 76 335 749.");
    if (next.donateLink) {
      let u;
      try { u = new URL(next.donateLink); } catch { throw new HttpError(400, "The online donation link must be a full web address starting with https://"); }
      if (u.protocol !== "https:") throw new HttpError(400, "The online donation link must start with https://");
    }
    await store("settings").setJSON("site", next);
    await purge(["settings"]);
    await logActivity(user, "Changed donation and organisation settings");
    return json(next);
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/settings" };
