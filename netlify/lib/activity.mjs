import { store } from "./db.mjs";
import { randomToken } from "./util.mjs";

// A simple record of who did what in the admin panel. Never throws: logging must not
// break the action it describes.
export async function logActivity(user, action, detail = "") {
  try {
    const at = new Date().toISOString();
    await store("activity").setJSON(`${at}-${randomToken().slice(0, 8)}`, {
      at, user: user?.name || "system", action, detail: String(detail).slice(0, 200),
    });
  } catch (e) {
    console.error("Activity log failed", e);
  }
}
