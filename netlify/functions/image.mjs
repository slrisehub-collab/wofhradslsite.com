import { store } from "../lib/db.mjs";
import { requireUser } from "../lib/auth.mjs";
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

// Image ids never change and their bytes never change, so browsers and the CDN can keep
// them for a year. This saves a function call and a storage read on every view.
const IMMUTABLE = {
  "cache-control": "public, max-age=31536000, immutable",
  "netlify-cdn-cache-control": "public, durable, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
};

export default wrap(async (req) => {
  const images = store("images");
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (req.method === "GET") {
    if (!isId(id)) throw new HttpError(404, "Image not found.");
    // size=sm asks for the small version used on story cards; fall back to the full photo.
    const found = (url.searchParams.get("size") === "sm" && (await images.getWithMetadata(`sm/${id}`, { type: "arrayBuffer" })))
      || (await images.getWithMetadata(id, { type: "arrayBuffer" }));
    if (!found) throw new HttpError(404, "Image not found.");
    return new Response(found.data, { headers: { "content-type": found.metadata?.contentType || "image/jpeg", ...IMMUTABLE } });
  }

  if (req.method === "POST") {
    const user = await requireUser(req, "staff"); // staff upload their own profile photo
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0) throw new HttpError(400, "No image received.");
    if (buf.byteLength > MAX_BYTES) throw new HttpError(413, "That image is too large.");
    const contentType = sniff(buf);
    if (!contentType) throw new HttpError(415, "Please upload a JPG, PNG or WebP image.");
    const metadata = { contentType, uploadedAt: new Date().toISOString(), by: user.name };
    const parent = url.searchParams.get("thumbFor");
    if (parent) {
      if (!isId(parent) || !(await images.getMetadata(parent))) throw new HttpError(400, "Upload the full photo first.");
      await images.set(`sm/${parent}`, buf, { metadata });
      return json({ id: parent, thumb: true }, 201);
    }
    const newIdValue = newId();
    await images.set(newIdValue, buf, { metadata });
    return json({ id: newIdValue }, 201);
  }

  if (req.method === "DELETE") {
    await requireUser(req, "editor");
    if (!isId(id)) throw new HttpError(400, "Invalid image.");
    await images.delete(id);
    await images.delete(`sm/${id}`);
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/image" };
