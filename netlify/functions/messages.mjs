import { store, readAll } from "../lib/db.mjs";
import { requireUser } from "../lib/auth.mjs";
import { logActivity } from "../lib/activity.mjs";
import { HttpError, isId, json, wrap } from "../lib/util.mjs";

export default wrap(async (req) => {
  const user = requireUser(req, "editor");
  const s = store("messages");

  if (req.method === "GET") {
    const items = await readAll(s);
    items.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return json({ count: items.length, messages: items });
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!isId(id)) throw new HttpError(400, "Invalid message.");
    const m = await s.get(id, { type: "json" });
    await s.delete(id);
    if (m) await logActivity(user, "Deleted a message", `from ${m.name}`);
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/messages" };
