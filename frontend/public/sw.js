const CACHE_NAME = "alphavyuh-v3";
const STATIC_ASSETS = [
  "/offline",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() =>
      caches.open(CACHE_NAME).then((cache) =>
        Promise.all([
          cache.delete("/"),
          cache.delete("/landing.html"),
          cache.delete("/dashboard"),
        ])
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip API requests and Next.js build chunks — always go network-first
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.hostname.includes("railway.app") ||
    url.hostname.includes("supabase.co")
  ) {
    return;
  }

  // For navigation requests: network-first. Never serve cached landing HTML.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/offline").then((r) => r || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // For static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
