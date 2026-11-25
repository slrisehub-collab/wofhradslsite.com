import { store } from "../lib/db.mjs";
import { currentUser, requireUser } from "../lib/auth.mjs";
import { logActivity } from "../lib/activity.mjs";
import { PROGRAMMES, indexPut, indexRemove, readIndex } from "../lib/posts.mjs";
import { HttpError, cdnCache, isId, json, newId, purge, readJson, wrap } from "../lib/util.mjs";

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
  const programme = input.programme ? String(input.programme) : null;

  if (!title) throw new HttpError(400, "Please add a title.");
  if (title.length > MAX_TITLE) throw new HttpError(400, `Title must be ${MAX_TITLE} characters or fewer.`);
  if (excerpt.length > MAX_EXCERPT) throw new HttpError(400, `Summary must be ${MAX_EXCERPT} characters or fewer.`);
  if (!body) throw new HttpError(400, "Please write the story.");
  if (body.length > MAX_BODY) throw new HttpError(400, "The story is too long.");
  if (cover && !isId(cover)) throw new HttpError(400, "Invalid cover image.");
  if (images.length > MAX_IMAGES || !images.every(isId)) throw new HttpError(400, "Invalid images.");
  if (programme && !PROGRAMMES.includes(programme)) throw new HttpError(400, "Unknown programme.");
  return { title, excerpt, body, status, cover, images, programme };
}

const imageIds = (p) => [...new Set([p.cover, ...(p.images || [])].filter(Boolean))];

async function deleteImages(ids) {
  const images = store("images");
  await Promise.all(ids.flatMap((i) => [images.delete(i), images.delete(`sm/${i}`)]));
}

export default wrap(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const user = currentUser(req);
  const posts = store("posts");

  if (req.method === "GET") {
    if (id) {
      if (!isId(id)) throw new HttpError(404, "Story not found.");
      const post = await posts.get(id, { type: "json" });
      if (!post || (post.status !== "published" && !user)) throw new HttpError(404, "Story not found.");
      return json(post, 200, post.status === "published" ? cdnCache(["posts", `post-${id}`]) : {});
    }
    const includeAll = Boolean(user) && url.searchParams.get("all") === "1";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), includeAll ? 1000 : 50);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
    const programme = url.searchParams.get("programme");
    const list = (await readIndex())
      .filter((p) => includeAll || p.status === "published")
      .filter((p) => !programme || p.programme === programme);
    return json({ total: list.length, posts: list.slice(offset, offset + limit) }, 200, includeAll ? {} : cdnCache(["posts"]));
  }

  const actor = requireUser(req, "editor");

  if (req.method === "POST") {
    const data = validate(await readJson(req));
    const now = new Date().toISOString();
    const post = { id: newId(), ...data, createdAt: now, updatedAt: now, publishedAt: data.status === "published" ? now : null, author: actor.name };
    await posts.setJSON(post.id, post);
    await indexPut(post);
    await purge(["posts"]);
    await logActivity(actor, data.status === "published" ? "Published a story" : "Saved a draft", post.title);
    return json(post, 201);
  }

  if (req.method === "PUT") {
    if (!isId(id)) throw new HttpError(400, "Missing story id.");
    const input = await readJson(req);
    const data = validate(input);
    const found = await posts.getWithMetadata(id, { type: "json" });
    if (!found) throw new HttpError(404, "Story not found.");
    const existing = found.data;
    // Someone else saved this story after you opened it: don't silently overwrite their work.
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== existing.updatedAt) {
      throw new HttpError(409, "Someone else changed this story after you opened it. Copy your text, reload the story and try again.");
    }
    const now = new Date().toISOString();
    const updated = {
      ...existing, ...data, updatedAt: now,
      publishedAt: data.status === "published" ? existing.publishedAt || now : existing.publishedAt,
    };
    const res = await posts.setJSON(id, updated, { onlyIfMatch: found.etag });
    if (!res.modified) throw new HttpError(409, "Someone else saved this story at the same moment. Reload it and try again.");
    await indexPut(updated);
    const keep = new Set(imageIds(updated));
    await deleteImages(imageIds(existing).filter((i) => !keep.has(i)));
    await purge(["posts", `post-${id}`]);
    await logActivity(actor, "Edited a story", updated.title);
    return json(updated);
  }

  if (req.method === "DELETE") {
    if (!isId(id)) throw new HttpError(400, "Missing story id.");
    const existing = await posts.get(id, { type: "json" });
    if (!existing) throw new HttpError(404, "Story not found.");
    await deleteImages(imageIds(existing));
    await posts.delete(id);
    await indexRemove(id);
    await purge(["posts", `post-${id}`]);
    await logActivity(actor, "Deleted a story", existing.title);
    return json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});

export const config = { path: "/api/posts" };
