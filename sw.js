// Service worker.
// - Network-first for the app shell (HTML / JS / CSS / JSON): code updates
//   always apply on reload, and a deploy can never mix old + new shell files.
// - Cache-first for heavy immutable assets (ONNX model, ORT runtime, images):
//   the ~24 MB download is paid only once, and the site works offline after.
// Bump CACHE only when those heavy assets change (model / runtime / gallery).

const CACHE = "crop-demo-v5";

function isHeavy(url) {
  return (
    url.pathname.includes("/vendor/") ||
    /\.(onnx|wasm|jpe?g|png|svg|gif)$/i.test(url.pathname)
  );
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (isHeavy(url)) {
    // cache-first
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const resp = await fetch(req);
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      })
    );
  } else {
    // network-first, fall back to cache when offline
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const resp = await fetch(req);
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        } catch (err) {
          const hit = await cache.match(req);
          if (hit) return hit;
          throw err;
        }
      })
    );
  }
});
