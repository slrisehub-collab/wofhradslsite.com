import { store, readAll, update } from "./db.mjs";
import { plainText, readingMinutes } from "./render.mjs";
import ARCHIVE from "./archive-index.mjs";

export const PROGRAMMES = ["icsp", "girls-circle", "people-to-people", "gesa", "peacebuilding"];

export const sortKey = (p) => p.publishedAt || p.createdAt;

export function summary(p) {
  const flat = plainText(p.body);
  return {
    id: p.id,
    title: p.title,
    excerpt: p.excerpt || flat.slice(0, 180) + (flat.length > 180 ? "…" : ""),
    cover: p.cover,
    coverUrl: p.cover ? `/api/image?id=${p.cover}&size=sm` : null,
    url: `/stories/${p.id}`,
    readingMinutes: readingMinutes(p.body),
    programme: p.programme || null,
    author: p.author || null,
    status: p.status,
    date: sortKey(p),
    updatedAt: p.updatedAt,
  };
}

// One small blob listing every story's summary, newest first. Reading it costs one
// storage read however many stories there are. It is rebuilt from the stories
// themselves if it is ever missing.
const INDEX_KEY = "all";
const sorted = (list) => list.sort((a, b) => b.date.localeCompare(a.date));

export async function rebuildIndex() {
  const list = sorted((await readAll(store("posts"))).map(summary));
  await store("post-index").setJSON(INDEX_KEY, list);
  return list;
}

export async function readIndex() {
  const list = await store("post-index").get(INDEX_KEY, { type: "json" });
  // Rebuild once if the index predates a field the site now relies on (author, added later).
  if (!list || (list.length && !("author" in list[0]))) return rebuildIndex();
  return list;
}

export async function indexPut(post) {
  const s = summary(post);
  await update(store("post-index"), INDEX_KEY, async (list) => {
    list = list || (await rebuildIndex());
    return sorted([...list.filter((x) => x.id !== s.id), s]);
  });
}

export async function indexRemove(id) {
  await update(store("post-index"), INDEX_KEY, async (list) => {
    list = list || (await rebuildIndex());
    return list.filter((x) => x.id !== id);
  });
}

// Stories carried over from the old website live in content/stories/ and are built into
// static pages. They are merged into every list here so visitors see one set of stories.
export const archive = () => ARCHIVE;

export async function listAll({ includeDrafts = false } = {}) {
  const live = (await readIndex()).filter((p) => includeDrafts || p.status === "published");
  return sorted([...live, ...ARCHIVE]);
}
