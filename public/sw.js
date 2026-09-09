// Service worker za Discover Slovenia AI.
// Cache-first za statične vire (slike, stili, skripte),
// network-first za navigacije (z offline fallback na cache).
// API klici se nikoli ne cachirajo.
// Web push: `push` + `notificationclick` handlerja (obvestila z VAPID).

// DEV preklop: sw-register.tsx v developmentu registrira "/sw.js?dev=1".
// V dev je caching IZKLOPLJEN (fetch passthrough — drugače bi SW cache-al
// stale HMR chunk-e), push handlerji pa ostanejo AKTIVNI (testiranje
// obvestil). V produkciji (čist "/sw.js") velja polna caching logika.
const DEV_MODE = self.location.search.includes("dev=1");

const CACHE_NAME = "discoverslovenia-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.svg",
];

// Namestitev: predpomni statične vire in takoj prevzemi nadzor.
// V DEV preskočimo tudi install-time precache (poleg fetch passthrough-a)
// — v dev NE SME ostati nič v cache-u (sveža vsebina ob vsakem reloadu).
self.addEventListener("install", (event) => {
  if (!DEV_MODE) {
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
  }
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

  // DEV: BREZ caching-a — transparenten passthrough (HMR chunk-i ostanejo
  // sveži). Push/notificationclick handlerji spodaj so NEODVISNI od fetch
  // handlerja in delujejo tudi v DEV_MODE.
  if (DEV_MODE) return;

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

// Web push: prikaz obvestila (payload pošilja server kot JSON).
self.addEventListener("push", (event) => {
  // Payload: { title, body, url?, tag? } — varen parse s fallbackom.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    console.warn("[SW] Push payload ni veljaven JSON:", err);
  }

  const title = (data && data.title) || "Discover Slovenia AI";
  const body = (data && data.body) || "";
  const tag = (data && data.tag) || "discover-slovenia";
  const url = (data && data.url) || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: tag, // isto-tag obvestila se zamenjajo (ne kopičijo)
      vibrate: [100, 50, 100],
      data: { url: url }, // notificationclick prebere in odpre
    })
  );
});

// Klik na obvestilo: zapri obvestilo, fokusiraj odprto okno (in sporoči
// URL prek postMessage) ALI odpri novo okno na ciljni URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            // Aplikacija (npr. navigation listener) lahko reagira na klik.
            client.postMessage({ type: "NOTIFICATION_CLICK", url: url });
            return;
          }
        }
        // Nobeno okno ni odprto — odpri novo na ciljni strani.
        return self.clients.openWindow(url);
      })
  );
});

// Sporočanje klientom ob update-jih.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
