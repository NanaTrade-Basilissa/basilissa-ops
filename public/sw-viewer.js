// Basilissa Ops — Offline Viewer Service Worker
const CACHE_NAME = "basilissa-viewer-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Cache strategy for hosted file views and previews
  if (
    url.pathname.startsWith("/view/") ||
    url.pathname.includes("/hosted-files/") ||
    url.hostname.includes("storage") ||
    url.hostname.includes("neon.tech") ||
    url.hostname.includes("r2.dev") ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/vendor/")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          // Network first, fall back to cache
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            // Clone and cache successful response
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          // Network failed (offline) — serve from cache!
          const cachedResponse = await cache.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          throw error;
        }
      })
    );
  }
});
