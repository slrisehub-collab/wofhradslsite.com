import { store } from "../lib/db.mjs";
import { requireAdmin } from "../lib/auth.mjs";
import { HttpError, isId, json, newId, wrap } from "../lib/util.mjs";

const MAX_BYTES = 2.5 * 1024 * 1024;

// Decide the type from the file's real bytes, not from what the client claims.
function sniff(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export default wrap(async (req) => {
  const images = store("images");

  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("id");
    if (!isId(id)) throw new HttpError(404, "Image not found.");
    const found = await images.getWithMetadata(id, { type: "arrayBuffer" });
    if (!found) throw new HttpError(404, "Image not found.");
    return new Response(found.data, {
      headers: {
        "content-type": found.metadata?.contentType || "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  }

  if (req.method === "POST") {
    requireAdmin(req);
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0) throw new HttpError(400, "No image received.");
    if (buf.byteLength > MAX_BYTES) throw new HttpError(413, "That image is too large.");
    const contentType = sniff(buf);
    if (!contentType) throw new HttpError(415, "Please upload a JPG, PNG or WebP image.");
    const id = newId();
    await images.set(id, buf, { metadata: { contentType } });
    return json({ id }, 201);
  }

  if (req.method === "DELETE") {
    requireAdmin(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!isId(id)) throw new HttpError(400, "Invalid image.");
    await images.delete(id);
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/image" };
