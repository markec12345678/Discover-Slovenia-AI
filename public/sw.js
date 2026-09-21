// Service worker za Discover Slovenia AI — F5.7 (PWA offline načrt).
//
// STRATEGIJE (po vrsti ujemanja):
//   1. /api/itinerary/shared/*  → network-first + offline fallback iz cache-a
//      (načrti za "vzemi s sabo" — deljeni itinererji so javni in stabilni;
//       online vedno svež, offline zadnji viden primer)
//   2. OSM zemljevidni TILE-i   → cache-first (dai-tiles, LRU limit)
//      (zemljevid poti dela OFFLINE za že videna območja — Slovenija ima
//       v gorah (Triglav, Soča) slab signal)
//   3. Druge slike (CDN)        → cache-first (dai-img, LRU limit)
//   4. Lastni statični viri     → cache-first (dai-shell: chunk-i, stili,
//      fonti, ikone — hashed, nespremenljivi znotraj builda)
//   5. Navigacije (HTML)        → network-first; 200 se cachira;
//      OFFLINE fallback: zadnji viden HTML → sicer /offline.html
//      (samoizpolnitvena stran z seznamom načrtov iz localStorage +
//       cache-a — brez strežnika)
//      /pot/* (deljeni načrti) IN /na-poti (Go Mode sopotnik) gredo v
//      PLANS cache; ostale strani v SHELL (približek app shell)
//   6. Ostalo (RSC payload-i)   → network-first z cache fallbackom
//      (RSC mora ostati svež ONLINE — cache-first bi serviral odmrl
//       payload po spremembi vsebine)
//
// NIKOLI se ne cachira: ostali /api/* (avtentikacija, generiranje, košarica
// — vedno sveže), /admin, /owner, non-GET.
//
// Čiščenje: activate pobriše VSE cache-e, ki niso na whitelisti — vključno
// z legacy "discoverslovenia-v1" (pred F5.7).
//
// LRU limit-i (trim po vstavljanju; Cache API nima časovnih žigov, zato
// brišemo NAJSTAREJŠE po vrstnem redu vstavljanja — praksa v Chrome/FF):
//   dai-shell 400 vnosov (chunk-i + HTML strani)
//   dai-plans 40 vnosov (načrti: HTML /pot/* + JSON, ≤250 KB/kos)
//   dai-tiles 600 vnosov (OSM tile-i ~15–30 KB/kos → ~15 MB)
//   dai-img   120 vnosov (unsplash/CDN slike destinacij)
//
// Web push: `push` + `notificationclick` handlerja (obvestila z VAPID).
//
// DEV preklop: sw-register.tsx v developmentu registrira "/sw.js?dev=1".
// V dev je caching IZKLOPLJEN (fetch passthrough — drugače bi SW cache-al
// stale HMR chunk-e in podrl hidracijo: dev chunk-i imajo STABILNE URL-je
// brez content-hash-a), push handlerji pa ostanejo AKTIVNI (testiranje
// obvestil). V produkciji (čist "/sw.js") velja polna caching logika.

const DEV_MODE = self.location.search.includes("dev=1");

// Verzije cache-a — bump ob spremembi precache seznama ali strategije.
const SHELL_CACHE = "dai-shell-v2";
const PLANS_CACHE = "dai-plans-v1";
const TILES_CACHE = "dai-tiles-v1";
const IMG_CACHE = "dai-img-v1";
const CACHE_WHITELIST = [SHELL_CACHE, PLANS_CACHE, TILES_CACHE, IMG_CACHE];

const MAX_ENTRIES = {
  [SHELL_CACHE]: 400,
  [PLANS_CACHE]: 40,
  [TILES_CACHE]: 600,
  [IMG_CACHE]: 120,
};

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.svg",
  "/offline.html",
];

// Relativna pot deljenega itinererja (JSON) — "offline načrt" jedro.
const SHARED_ITINERARY_PREFIX = "/api/itinerary/shared/";
// Stran deljenega potovanja (HTML) — drugi del jedra.
const SHARE_PAGE_PREFIX = "/pot/";
// GO MODE strani (HTML, TASK 73): /na-poti je najobčutljivejša offline
// izkušnja (sopotnik MED potovanjem). HTML hranimo v PLANS cache (40
// vnosov) namesto v SHELL (400 vnosov) — v SHELL-u bi jo LRU iztrebljanje
// (chunk-i + RSC payload-i vsake navigacije) lahko pregnalo ravno, ko je
// uporabnik brez signala. Vnosni format je identičen obstoječim (Response
// za URL) → imena cache-a NAMENOMA ne bumpamo (bump bi ob aktivaciji SW
// pobrisal že-shranjene offline načrte popotnikov).
const GO_PAGE_PATHS = ["/na-poti", "/en/na-poti"];

/** Ali je zahtevek OSM tile (Leaflet)? (a|b|c.)tile.openstreetmap.org */
function isOsmTileHost(hostname) {
  return (
    hostname === "tile.openstreetmap.org" ||
    hostname.endsWith(".tile.openstreetmap.org")
  );
}

/** LRU trim: če cache preseže limit, pobriši najstarejše vnose. */
function trimCache(cacheName, maxEntries) {
  caches
    .open(cacheName)
    .then((cache) =>
      cache.keys().then((keys) => {
        if (keys.length <= maxEntries) return;
        const excess = keys.length - maxEntries;
        // keys() je v praksi vrstni red vstavljanja → prvi = najstarejši.
        // (Spec ne zagotavlja vrstnega reda; odveč bi bil le manj optimalen
        //  izbor — nikoli pa ne pokvari podatkov.)
        return Promise.all(
          keys.slice(0, excess).map((key) => cache.delete(key))
        );
      })
    )
    .catch(() => {
      // nekritično
    });
}

/** Dodeli odgovor v cache (samo status 200). Vrne originalni odgovor. */
function cacheResponse(cacheName, request, response) {
  if (response && response.status === 200) {
    const clone = response.clone();
    caches
      .open(cacheName)
      .then((cache) => cache.put(request, clone))
      .then(() => trimCache(cacheName, MAX_ENTRIES[cacheName]))
      .catch(() => {});
  }
  return response;
}

// Namestitev: predpomni statične vire in takoj prevzemi nadzor.
// V DEV preskočimo tudi install-time precache (poleg fetch passthrough-a)
// — v dev NE SME ostati nič v cache-u (sveža vsebina ob vsakem reloadu).
self.addEventListener("install", (event) => {
  if (!DEV_MODE) {
    event.waitUntil(
      caches
        .open(SHELL_CACHE)
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

// Aktivacija: počisti VSE ne-whitelistane cache-e (tudi legacy
// "discoverslovenia-v1" izpred F5.7) in prevzemi kliente.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !CACHE_WHITELIST.includes(key))
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

  // -------------------------------------------------------------------------
  // 1) DELJENI ITINERERJI (JSON) — network-first z offline fallbackom.
  //    MORA biti PRED generičnim /api/ skipom!
  // -------------------------------------------------------------------------
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith(SHARED_ITINERARY_PREFIX)
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(PLANS_CACHE, request, response))
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) =>
                cached ||
                new Response(JSON.stringify({ error: "offline" }), {
                  status: 503,
                  headers: { "Content-Type": "application/json" },
                })
            )
        )
    );
    return;
  }

  // Cross-origin:
  if (url.origin !== self.location.origin) {
    // OSM zemljevidni tile-i → cache-first (OFFLINE ZEMLJEVID za videna
    // območja). Leaflet jih nalaga kot <img> (destination: "image").
    if (request.destination === "image" && isOsmTileHost(url.hostname)) {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) =>
            cacheResponse(TILES_CACHE, request, response)
          );
        })
      );
      return;
    }
    // Druge slike (unsplash in podobni CDN-i) → cache-first z LRU cap-om.
    if (request.destination === "image") {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) =>
            cacheResponse(IMG_CACHE, request, response)
          );
        })
      );
      return;
    }
    // Ostalo cross-origin (zunanji API klici klienta) — NE vmešavaj se.
    return;
  }

  // Same-origin API/admin/owner (izven shared itinererjev zgoraj) — vedno
  // sveže, nikoli iz cache-a (avtentikacija, generiranje, košarica ...).
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/admin")) return;
  if (url.pathname.startsWith("/owner")) return;

  // Cache-first za lastne statične vire (slike, stili, skripti, fonti).
  if (
    request.destination === "image" ||
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) =>
          cacheResponse(SHELL_CACHE, request, response)
        );
      })
    );
    return;
  }

  // -------------------------------------------------------------------------
  // 5) NAVIGACIJE (HTML) — network-first z offline fallbackom:
  //    zadnji viden HTML → sicer /offline.html (samoizpolnitvena stran).
  //    /pot/* (deljena potovanja) IN /na-poti (Go Mode) se shrani v PLANS
  //    cache ("offline načrt" — 40 vnosov, LRU-varno), ostale strani v
  //    SHELL cache (približek app shell).
  // -------------------------------------------------------------------------
  if (request.mode === "navigate" || request.destination === "document") {
    const isSharePage = url.pathname.startsWith(SHARE_PAGE_PREFIX);
    const isGoPage = GO_PAGE_PATHS.includes(url.pathname);
    const navCache = isSharePage || isGoPage ? PLANS_CACHE : SHELL_CACHE;

    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(navCache, request, response))
        .catch(() =>
          caches
            .match(request)
            .then((cached) => {
              if (cached) return cached;
              // /pot/* povezave z query parametri (npr. ?utm_...) — poskusi
              // brez search dela (isti HTML vir).
              if (isSharePage && url.search) {
                return caches.match(new Request(url.pathname));
              }
              return null;
            })
            .then((cached) => cached || caches.match("/offline.html"))
        )
    );
    return;
  }

  // -------------------------------------------------------------------------
  // 6) OSTALO (RSC payload-i, rss, ostali GET) — network-first z cache
  //    fallbackom: ONLINE vedno sveže (cache-first bi serviral odmrl RSC),
  //    OFFLINE pa zadnji viden primer.
  // -------------------------------------------------------------------------
  event.respondWith(
    fetch(request)
      .then((response) => cacheResponse(SHELL_CACHE, request, response))
      .catch(() =>
        caches.match(request).then((cached) => cached || Response.error())
      )
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

// Sporočanje klientom ob update-jih + debug vmesnik (cache stanje).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  // GET_CACHE_INFO: { type } → odgovor prek MessageChannel porta
  // (uporabno za E2E teste in debugiranje v konzoli).
  if (event.data && event.data.type === "GET_CACHE_INFO") {
    event.waitUntil(
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names.map((name) =>
              caches
                .open(name)
                .then((cache) =>
                  cache.keys().then((keys) => ({
                    name: name,
                    entries: keys.length,
                  }))
                )
            )
          )
        )
        .then((info) => {
          const port = (event.ports && event.ports[0]) || null;
          if (port) {
            port.postMessage({ caches: info });
          } else {
            self.clients.matchAll().then((clients) => {
              clients.forEach((client) =>
                client.postMessage({ type: "CACHE_INFO", caches: info })
              );
            });
          }
        })
    );
  }
});
