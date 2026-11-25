import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

// In-memory stand-in with the same API surface, including etags and conditional writes,
// so tests exercise the same concurrency rules as production. Only used when
// WOFHRAD_MEMORY_DB=1 (automated tests). Never set this in production.
const memory = new Map();
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
export const resetMemory = () => memory.clear();
function memoryStore(name) {
  if (!memory.has(name)) memory.set(name, new Map());
  const m = memory.get(name);
  const read = (entry, type) => {
    if (!entry) return null;
    if (type === "json") return JSON.parse(Buffer.from(entry.data).toString());
    if (type === "arrayBuffer") {
      const b = Buffer.from(entry.data);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
    return Buffer.from(entry.data).toString();
  };
  const write = async (key, data, opts = {}) => {
    await tick(); // storage is a network call in production, so requests interleave
    const cur = m.get(key);
    if (opts.onlyIfNew && cur) return { modified: false, etag: cur.etag };
    if (opts.onlyIfMatch !== undefined && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false, etag: cur?.etag };
    const etag = randomUUID();
    m.set(key, { data, metadata: opts.metadata || {}, etag });
    return { modified: true, etag };
  };
  return {
    async get(key, opts = {}) { await tick(); return read(m.get(key), opts.type); },
    async getWithMetadata(key, opts = {}) {
      await tick();
      const e = m.get(key);
      return e ? { data: read(e, opts.type), metadata: e.metadata || {}, etag: e.etag } : null;
    },
    async getMetadata(key) { const e = m.get(key); return e ? { metadata: e.metadata || {}, etag: e.etag } : null; },
    set(key, data, opts) {
      const bytes = data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(data)) : Buffer.from(data);
      return write(key, bytes, opts);
    },
    setJSON(key, obj, opts) { return write(key, Buffer.from(JSON.stringify(obj)), opts); },
    async delete(key) { m.delete(key); },
    async list(opts = {}) {
      const prefix = opts.prefix || "";
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: m.get(key).etag })), directories: [] };
    },
  };
}

// On Netlify, credentials are injected automatically and getStore({ name }) just works.
// Elsewhere (e.g. Vercel) the same store is reached with an explicit site ID and token.
export function store(name) {
  if (process.env.WOFHRAD_MEMORY_DB === "1") return memoryStore(name);
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
  return getStore({ name, consistency: "strong" });
}

// Read-modify-write that cannot lose an update when two requests arrive at once.
// fn(current) returns the new value (or undefined to leave the record unchanged).
// If another request wrote in between, the write is refused and we try again.
export async function update(s, key, fn, retries = 8) {
  for (let i = 0; i < retries; i++) {
    const cur = await s.getWithMetadata(key, { type: "json" });
    const next = await fn(cur ? cur.data : null);
    if (next === undefined) return cur ? cur.data : null;
    const res = cur
      ? await s.setJSON(key, next, { onlyIfMatch: cur.etag })
      : await s.setJSON(key, next, { onlyIfNew: true });
    if (res.modified) return next;
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (i + 1)));
  }
  throw new Error(`Could not update ${key}: too many simultaneous changes.`);
}

// Every blob in a store, read in parallel.
export async function readAll(s, prefix = "") {
  const { blobs } = await s.list({ prefix });
  return (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
}
