import { store } from "../lib/db.mjs";
import { requireAdmin } from "../lib/auth.mjs";
import { HttpError, isId, json, wrap } from "../lib/util.mjs";

export default wrap(async (req) => {
  requireAdmin(req);
  const s = store("messages");

  if (req.method === "GET") {
    const { blobs } = await s.list();
    const items = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
    items.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return json({ count: items.length, messages: items });
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!isId(id)) throw new HttpError(400, "Invalid message.");
    await s.delete(id);
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/messages" };
