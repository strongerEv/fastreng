// Offline cache for the Fastreng app shell. Bump VERSION after changing files.
const VERSION = "fastreng-v1";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "config.js",
  "app.js",
  "manifest.webmanifest",
  "assets/logo.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/menu/original-rujak.jpg",
  "assets/menu/sambal-matah.jpg",
  "assets/menu/daun-jeruk.jpg",
  "assets/menu/daging-suwir.jpg",
  "assets/menu/mint-almond.jpg",
  "assets/menu/sweet-mix.jpg",
  "assets/menu/platter-dessert.jpg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network-first so config/menu updates show up immediately; fall back to cache offline.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
