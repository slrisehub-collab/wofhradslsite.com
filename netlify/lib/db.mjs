import { getStore } from "@netlify/blobs";

// In-memory stand-in with the same small API surface. Only used when
// WOFHRAD_MEMORY_DB=1 (automated tests). Never set this in production.
const memory = new Map();
function memoryStore(name) {
  if (!memory.has(name)) memory.set(name, new Map());
  const m = memory.get(name);
  const read = (entry, type) => {
    if (!entry) return null;
    if (type === "json") return JSON.parse(entry.data);
    if (type === "arrayBuffer") {
      const b = Buffer.from(entry.data);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
    return Buffer.from(entry.data).toString();
  };
  return {
    async get(key, opts = {}) { return read(m.get(key), opts.type); },
    async getWithMetadata(key, opts = {}) {
      const e = m.get(key);
      return e ? { data: read(e, opts.type), metadata: e.metadata || {} } : null;
    },
    async set(key, data, opts = {}) {
      m.set(key, { data: Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data), metadata: opts.metadata });
    },
    async setJSON(key, obj) { m.set(key, { data: Buffer.from(JSON.stringify(obj)) }); },
    async delete(key) { m.delete(key); },
    async list(opts = {}) {
      const prefix = opts.prefix || "";
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: "x" })) };
    },
  };
}

// On Netlify, credentials are injected automatically and getStore({ name }) just works.
// On Vercel (or any other host) there is no automatic injection, so the same Netlify
// Blobs store is reached with an explicit site ID and a Netlify personal access token.
// This is what lets both deployments share one set of stories, subscribers and images
// instead of needing two different databases. See README.md for how to create these.
export function store(name) {
  if (process.env.WOFHRAD_MEMORY_DB === "1") return memoryStore(name);
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token, consistency: "strong" });
  return getStore({ name, consistency: "strong" });
}
