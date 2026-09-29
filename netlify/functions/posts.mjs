import { store } from "../lib/db.mjs";
import { isAdmin, requireAdmin } from "../lib/auth.mjs";
import { HttpError, isId, json, newId, readJson, wrap } from "../lib/util.mjs";

const MAX_TITLE = 150;
const MAX_EXCERPT = 300;
const MAX_BODY = 30000;
const MAX_IMAGES = 12;

function validate(input) {
  const title = String(input.title ?? "").trim();
  const excerpt = String(input.excerpt ?? "").trim();
  const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  const status = input.status === "draft" ? "draft" : "published";
  const cover = input.cover ? String(input.cover) : null;
  const images = Array.isArray(input.images) ? input.images.map(String) : [];

  if (!title) throw new HttpError(400, "Please add a title.");
  if (title.length > MAX_TITLE) throw new HttpError(400, `Title must be ${MAX_TITLE} characters or fewer.`);
  if (excerpt.length > MAX_EXCERPT) throw new HttpError(400, `Summary must be ${MAX_EXCERPT} characters or fewer.`);
  if (!body) throw new HttpError(400, "Please write the story.");
  if (body.length > MAX_BODY) throw new HttpError(400, "The story is too long.");
  if (cover && !isId(cover)) throw new HttpError(400, "Invalid cover image.");
  if (images.length > MAX_IMAGES || !images.every(isId)) throw new HttpError(400, "Invalid images.");
  return { title, excerpt, body, status, cover, images };
}

const imageIds = (p) => [...new Set([p.cover, ...(p.images || [])].filter(Boolean))];

async function allPosts() {
  const s = store("posts");
  const { blobs } = await s.list();
  const posts = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return posts.filter(Boolean);
}

const sortKey = (p) => p.publishedAt || p.createdAt;

function summary(p) {
  const fallback = p.body.replace(/\s+/g, " ").slice(0, 180);
  return {
    id: p.id,
    title: p.title,
    excerpt: p.excerpt || fallback + (p.body.length > 180 ? "…" : ""),
    cover: p.cover,
    status: p.status,
    date: sortKey(p),
    updatedAt: p.updatedAt,
  };
}

export default wrap(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const admin = isAdmin(req);
  const posts = store("posts");

  if (req.method === "GET") {
    if (id) {
      if (!isId(id)) throw new HttpError(404, "Story not found.");
      const post = await posts.get(id, { type: "json" });
      if (!post || (post.status !== "published" && !admin)) throw new HttpError(404, "Story not found.");
      return json(post);
    }
    const includeAll = admin && url.searchParams.get("all") === "1";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
    const list = (await allPosts())
      .filter((p) => includeAll || p.status === "published")
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
      .slice(0, limit)
      .map(summary);
    return json({ posts: list });
  }

  requireAdmin(req);

  if (req.method === "POST") {
    const data = validate(await readJson(req));
    const now = new Date().toISOString();
    const post = {
      id: newId(),
      ...data,
      createdAt: now,
      updatedAt: now,
      publishedAt: data.status === "published" ? now : null,
    };
    await posts.setJSON(post.id, post);
    return json(post, 201);
  }

  if (req.method === "PUT") {
    if (!isId(id)) throw new HttpError(400, "Missing story id.");
    const existing = await posts.get(id, { type: "json" });
    if (!existing) throw new HttpError(404, "Story not found.");
    const data = validate(await readJson(req));
    const now = new Date().toISOString();
    const updated = {
      ...existing,
      ...data,
      updatedAt: now,
      publishedAt: data.status === "published" ? existing.publishedAt || now : existing.publishedAt,
    };
    await posts.setJSON(id, updated);
    const keep = new Set(imageIds(updated));
    const images = store("images");
    await Promise.all(imageIds(existing).filter((i) => !keep.has(i)).map((i) => images.delete(i)));
    return json(updated);
  }

  if (req.method === "DELETE") {
    if (!isId(id)) throw new HttpError(400, "Missing story id.");
    const existing = await posts.get(id, { type: "json" });
    if (!existing) throw new HttpError(404, "Story not found.");
    const images = store("images");
    await Promise.all(imageIds(existing).map((i) => images.delete(i)));
    await posts.delete(id);
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/posts" };
