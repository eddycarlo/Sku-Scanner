/* Service worker: cache the app shell for offline use in stores with poor signal.
 * products.json is ALWAYS fetched from the network first (so status updates show up
 * immediately) and only falls back to the cached copy if you're fully offline. */

const SHELL_CACHE = "cis-scanner-shell-v1";
const DATA_CACHE = "cis-scanner-data-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/html5-qrcode.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.endsWith("products.json")) {
    // network-first for data
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // cache-first for app shell (JS libs, css, html, icons)
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
