// Service worker za I Feel Slovenia.
// Cache-first za statične vire (slike, stili, skripte),
// network-first za navigacije (z offline fallback na cache).
// API klici se nikoli ne cachirajo.

const CACHE_NAME = "ifeelslovenia-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.svg",
];

// Namestitev: predpomni statične vire in takoj prevzemi nadzor.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // addAll odpade, če en vir manjka — uporabimo vsak posebej.
        Promise.all(
          STATIC_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn("[SW] Cache miss:", url, err.message);
            })
          )
        )
      )
  );
  self.skipWaiting();
});

// Aktivacija: počisti stare cache verzije in prevzemi kliente.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch strategija.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Ignoriraj non-GET zahtevke.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Skip cross-origin in API zahtevke (vedno fresh).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/admin")) return;
  if (url.pathname.startsWith("/owner")) return;

  // Cache-first za statične vire (slike, stili, skripti, fonti).
  if (
    request.destination === "image" ||
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Pomni samo uspešne odgovore.
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first za navigacije (HTML) z offline fallback.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/"))
        )
    );
    return;
  }

  // Privzeto: cache-first z network fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
      );
    })
  );
});

// Sporočanje klientom ob update-jih.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
