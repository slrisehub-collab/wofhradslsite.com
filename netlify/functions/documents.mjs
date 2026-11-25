import { store, readAll } from "../lib/db.mjs";
import { requireUser } from "../lib/auth.mjs";
import { logActivity } from "../lib/activity.mjs";
import { HttpError, cdnCache, isId, json, newId, purge, wrap } from "../lib/util.mjs";

// Annual reports, accounts and similar PDFs for the Reports & Accountability page.
// Netlify functions accept requests up to about 6 MB, so files are limited to 5 MB.
const MAX_BYTES = 5 * 1024 * 1024;
const isPdf = (buf) => { const b = new Uint8Array(buf, 0, 5); return String.fromCharCode(...b) === "%PDF-"; };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "document";

export default wrap(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const meta = store("documents");
  const files = store("document-files");

  if (req.method === "GET") {
    if (id) {
      if (!isId(id)) throw new HttpError(404, "Document not found.");
      const [m, data] = await Promise.all([meta.get(id, { type: "json" }), files.get(id, { type: "arrayBuffer" })]);
      if (!m || !data) throw new HttpError(404, "Document not found.");
      return new Response(data, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="wofhrad-${slug(m.title)}.pdf"`,
          "x-content-type-options": "nosniff",
          ...cdnCache([`doc-${id}`], 86400),
        },
      });
    }
    const docs = (await readAll(meta)).sort((a, b) => (b.year || "").localeCompare(a.year || "") || b.uploadedAt.localeCompare(a.uploadedAt));
    return json({ documents: docs }, 200, cdnCache(["documents"]));
  }

  const user = requireUser(req, "editor");

  if (req.method === "POST") {
    const title = decodeURIComponent(req.headers.get("x-title") || "").trim();
    const year = decodeURIComponent(req.headers.get("x-year") || "").trim();
    if (!title || title.length > 150) throw new HttpError(400, "Please give the document a title (150 characters or fewer).");
    if (year && !/^(19|20)\d{2}(\s*[-–/]\s*(19|20)?\d{2})?$/.test(year)) throw new HttpError(400, "Please enter the year like 2025 or 2024-25, or leave it empty.");
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) throw new HttpError(400, "No file received.");
    if (buf.byteLength > MAX_BYTES) throw new HttpError(413, "That file is larger than 5 MB. Please compress the PDF and try again.");
    if (!isPdf(buf)) throw new HttpError(415, "Please upload a PDF file.");
    const doc = { id: newId(), title, year, size: buf.byteLength, uploadedAt: new Date().toISOString(), uploadedBy: user.name };
    await files.set(doc.id, buf);
    await meta.setJSON(doc.id, doc);
    await purge(["documents"]);
    await logActivity(user, "Published a document", title);
    return json(doc, 201);
  }

  if (req.method === "DELETE") {
    if (!isId(id)) throw new HttpError(400, "Invalid document.");
    const m = await meta.get(id, { type: "json" });
    await Promise.all([meta.delete(id), files.delete(id)]);
    await purge(["documents", `doc-${id}`]);
    if (m) await logActivity(user, "Removed a document", m.title);
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/documents" };
