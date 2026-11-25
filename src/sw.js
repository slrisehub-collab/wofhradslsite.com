/* WOFHRAD-SL offline support. Version __BUILD__ (each deploy replaces the cache).
 *
 * Mobile data in Sierra Leone can be slow, patchy or expensive, so:
 *  - pages are fetched fresh when there is a connection, and the last copy is shown when not;
 *  - CSS, scripts, fonts and photos are kept after the first visit, so return visits are fast;
 *  - story lists and photos from the API are kept as a fallback for when the connection drops;
 *  - the admin panel, and anything that sends data, always goes straight to the network.
 */
const VERSION = "__BUILD__";
const PAGES = "pages-" + VERSION;
const ASSETS = "assets-" + VERSION;
const API = "api-" + VERSION;
const PRECACHE = ["/", "/offline.html", "/stories.html", "/assets/site.css?v=__BUILD__", "/assets/site.js?v=__BUILD__",
  "/assets/fonts/dm-sans-latin-400-normal.woff2", "/assets/fonts/playfair-display-latin-700-normal.woff2", "/assets/img/logo-96.webp"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req) || await caches.match(req);
    if (hit) return hit;
    if (fallback) return caches.match(fallback);
    throw err;
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(ASSETS)).put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/admin") || req.headers.get("authorization")) return;

  if (req.mode === "navigate") { e.respondWith(networkFirst(req, PAGES, "/offline.html")); return; }
  if (url.pathname.startsWith("/assets/") || url.pathname === "/api/image") { e.respondWith(cacheFirst(req)); return; }
  if (url.pathname === "/api/posts" || url.pathname === "/api/settings" || url.pathname === "/api/documents") {
    e.respondWith(networkFirst(req, API));
  }
});
