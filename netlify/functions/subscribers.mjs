import { store } from "../lib/db.mjs";
import { requireAdmin } from "../lib/auth.mjs";
import { HttpError, json, sha256hex, wrap } from "../lib/util.mjs";
import { listSubscribers } from "../lib/subscribers.mjs";

// Stops spreadsheet programs from treating an email as a formula.
const csvCell = (v) => {
  const t = String(v);
  return /^[=+\-@\t\r]/.test(t) ? `"'${t.replace(/"/g, '""')}"` : `"${t.replace(/"/g, '""')}"`;
};

export default wrap(async (req) => {
  requireAdmin(req);
  const url = new URL(req.url);

  if (req.method === "GET") {
    const subs = await listSubscribers();
    if (url.searchParams.get("format") === "csv") {
      const csv = ["email,subscribed_at", ...subs.map((s) => `${csvCell(s.email)},${csvCell(s.subscribedAt)}`)].join("\n");
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="wofhrad-subscribers.csv"',
          "cache-control": "no-store",
        },
      });
    }
    return json({ count: subs.length, subscribers: subs });
  }

  if (req.method === "DELETE") {
    const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
    if (!email) throw new HttpError(400, "Missing email.");
    await store("subscribers").delete(sha256hex(email));
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/subscribers" };
