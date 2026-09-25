# T5-a3 — Revizija zmožnosti: Trip + Map/Go Mode + Offline/PWA + Skupnost + Lokalizacija + SDK/scripts (v1.100.3, a854404)

> Datum: 2026-09-25 · Agent: Explore (T5-a3) · Metoda: read-only revizija kode (src/, public/, scripts/, prisma/, docs/), brez poganjanja test suite (glavni agent: 2745/2745).
> Obseg: Issue #5 Phase 2 (Trip platform, Map/Go Mode, Offline/PWA, Skupnost, Lokalizacija) + Phase 4 (SDK + scripts audit, Stripe/providers klasifikacija).
> Paralelna agenta: T5-a1 (AI odvisnosti), T5-a2 (Discovery/Planning/Import) — njun obseg NI pregłesan globlje.

---

## Povzetek

- **Trip platform**: 17 zmožnosti, vse delujoče in produkcijsko dosegljive — save/load/share z editToken (SHA-256 hash + timing-safe primerjava), PATCH na mestu s CAS + strežniške revizije + undo sklad, vloga sistem (trip-permissions.ts = ena točka resnice), sodelovanje z 7-dnevno TTL vabili, dokumenti (.ics + register, NE PDF izvoz), stroški/proračun (TripExpense + trip-budget), rezervacije (JourneyBooking + AI parse z determinantno normalizacijo), transport (journey orchestrator). Gost ima LOKALNA potovanja + claim plast ob prijavi (`/api/user/trips/claim`).
- **Map / Go Mode**: zemljevid (Leaflet + markercluster) s statičnim FSQ slojem (125.445 točk, ~8 ms, zoom-aware grid/pins, kaps + poštena atribucija), OSRM road routing, Go Mode z GPS premico (iskreno labelirano), ETA (hevristika ×1,3 @ 55 km/h, "NEZNANO" brez pogojev), navigacijski handoff (geo: URI / Google Maps URL — zunanji, izrecno). K-7 premoštitev AI načrt → Go Mode JE implementirana (`itinerary-go.ts` + gumb "Zaženi Na poti").
- **Offline/PWA**: manifest.json popoln (ikone 192/512 any+maskable, shortcuts ×4, screenshots ×2); sw.js s 4 caches (shell 400 / plans 40 / tiles 600 / img 120, LRU trim) + push handlerji + debug MessageChannel; offline.html je samoizpolnitvena stran (dai:go-trip + cachani načrti + matrika zmožnosti brez signala + retry gumb). "E2E dokaz" §16 je HARNESS ravni (izvedba dejanske inline skripte prek `new Function` + stub DOM; sw.js v mock ServiceWorkerGlobalScope v scripts/pwa-test.ts) — NI realen brskalniški offline test.
- **Skupnost**: VSE zmožnosti (vote/comments/likes/polls/diary/guide) so REALNE DB-backed (7 Prisma modelov), anonymous-first (clientId/voterId iz localStorage), z enotnim `communityTripGate` na zasebnih poteh. NIČ demo/mock.
- **Lokalizacija**: sl (default, brez prefix) + en (`/en`, whitelist poti) prek next-intl; pariteta ključev testno varovana (task71-i18n-parity.test.ts); de/it sta legacy 39-vrstične oglate (308 redirect).
- **SDK/scripts**: 74 skript datotek; ~10 je ŽIVO vezanih na src/lib deterministične module (route-order, geo-validation, itinerary-quality, trip-costs, pins-ingest, plan-check, adria-guides, kiwitaxi ingest, sto-llms, trip-collaborator-migration) — vzorec "en vir resnice" je REALEN. Bivša duplikacija itinerer motorja (route lokalna kopija) je bila odstranjena v 1.87.0. OSTANEJOČA duplikacija: **haversineKm ×11+**, **ROAD_FACTOR 1.3 ×5**, **AVG_SPEED 55 ×3** (konkretni file:line spodaj).
- **Stripe/providers**: checkout/portal/webhook so LIVE-CAPABLE in DORMANT (demo mode z `DSA_DEMO_PAYMENTS=1`, sicer fail-closed 503/501); webhook obdeluje 4 event vrste z ProcessedStripeEvent dedupe + provizijsko plačilno verigo. commissions.ts (12 %) + affiliate.ts (fail-closed env-gated) sta realni; affiliate redirect `/go/[provider]` deluje BZDAZ kreditov (monetized:false brez ID-jev).

---

## A. Trip platform — matrika

| # | Capability | Code (file:line) | API | SDK/Script reused | Deterministic? | AI dependency | Test | E2E | Prod reachable | Reachable UI | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Generiranje itinererja (AI + fallback veriga) | `src/app/api/itinerary/route.ts:189` (POST), enrichment veriga 99–1417 | POST /api/itinerary | deterministic-itinerary.ts (route:1221) | Mešano (AI pot + čist det. motor) | DA (OpenRouter→Gemini→Puter→z-ai; engine="deterministic" = 0 žetonov, route:541) | task100-deterministic-engine.test.ts, supply-* testi | scripts/pilot-scenarios.ts (živi POST) | DA | /nacrtuj (itinerary-planner.tsx) | DELA | route.ts:285-292 engine validacija; route.ts:390 skipRanking |
| A2 | Deterministični motor (naravna pot) | `src/lib/deterministic-itinerary.ts:1` (495 vrstic) | — (interno A1) | NEO (čist: 0 LLM/0 omrežja/0 ure — testno varovano task100:409) | DA | NE | task100-deterministic-engine.test.ts, issue4-wave4-personalization.test.ts | — | DA | stikalo "Z AI / Brez AI" v plannerju | DELA | purity guard: task100:409 codeOnly source |
| A3 | Save (anonimno ali račun) | `src/app/api/itinerary/save/route.ts:24` | POST /api/itinerary/save | itinerary-sanitize, supply revalidation | DA (validacija) | NE | hardening-itinerary-boundary, supply-itinerary.test | pilot-scenarios (živi /save) | DA | gumb Shrani (planner, trip-timeline) | DELA | editToken SHA-256 (save:21-23), rate limit 30/h |
| A4 | Load/deljen pogled | `src/app/api/itinerary/shared/[shareId]/route.ts` + `src/app/pot/[shareId]/page.tsx` | GET /api/itinerary/shared/[shareId] | events-match, trip-dates (page:7-8) | DA | NE | issue4-wave8-share-security.test.ts | DA (živi /pot linki) | DA | /pot/[shareId] | DELA | warm=1 brez štetja ogleda; zasebne pote 404-nevidnost |
| A5 | Update na mestu (CAS) | `src/lib/itinerary-share.ts:148` (updateItinerary) + shared/[shareId]/route.ts PATCH | PATCH /api/itinerary/shared/[shareId] | — | DA | NE | issue4-wave5-revisions.test.ts | — | DA | planner handleSaveShare (planner:1576+) | DELA | 409 konflikt sočasnega urejanja |
| A6 | Revizije + obnovitev | `src/app/api/itinerary/shared/[shareId]/revisions/route.ts` (197 vrstic) | GET …/revisions?version= | fetchTripRevisions/fetchTripRevisionContent (itinerary-share.ts:216/254) | DA | NE | issue4-wave5-revisions.test.ts:378-418 | — | DA | trip-collaboration.tsx:297/325 (zavihek Zgodovina na /pot) | DELA | SavedItineraryRevision model (schema:159) |
| A7 | Sejni undo sklad | `src/lib/itinerary-undo.ts:39` (pushUndo/popUndo) | — (klient) | NEO (0 stranskih učinkov) | DA | NE | issue4-wave5-revisions.test.ts:424+ | — | DA | planner "Razveljavi" (import planner:152-158) | DELA | bound 10 vnosov, `at` injicira klicalnik |
| A8 | Gostova lokalna potovanja | `src/lib/my-trips-storage.ts` (dai:my-trips) | — (localStorage) | — | DA | NE | task96-d1-workspace.test.ts | — | DA | /moja-potovanja gost view (page:199-321) | DELA | K-6 fix: NI login zida |
| A9 | Claim ob prijavi | `src/app/api/user/trips/claim/route.ts` + prijava/page.tsx:54 | POST /api/user/trips/claim | getEditToken | DA | NE | (prek wave8 share-security) | — | DA | prijava/registracija toast "povezali N potovanj" | DELA | neblocirajoče, editToken iz localStorage |
| A10 | My Trips (prijavljen) | `src/app/api/user/trips/route.ts:63` (findMany) + /moja-potovanja/page.tsx:127 | GET /api/user/trips | — | DA | NE | — | — | DA | /moja-potovanja | DELA | + konzultacije + MyOrdersSection (FW2-C) |
| A11 | Sharing/privacy (isPublic) | `src/app/api/trip/[shareId]/route.ts:22` (PATCH) | PATCH /api/trip/[shareId] | trip-permissions (resolveTripRole) | DA | NE | issue4-wave8-share-security.test.ts | — | DA | trip-collaboration.tsx (preklop javno/zasebno) | DELA | revoke = 404 nevidnost (ne 403 oracle) |
| A12 | Sodelovanje (owner/editor/viewer) | `src/lib/trip-permissions.ts:105` (resolveTripRole) + /api/trip/[shareId]/collaborators | GET/POST/DELETE collaborators | resolveTripRole — ENA točka resnice (vse §13 rute) | DA | NE | issue4-wave6-schema-parity.test.ts | — | DA | trip-collaboration.tsx na /pot | DELA | 5 vlog, timing-safe, PENDING ne razkriva vloge |
| A13 | Vabila s TTL | `src/app/api/trip/collaborators/accept/route.ts:33-34` | POST /api/trip/collaborators/accept | — | DA (TTL 7 dni, brez sheme) | NE | issue4-wave8 testi | — | DA | vabilo URL ?invite={token}, 410 po poteku | DELA | SMTP ni nastavljen → inviteUrl kopira lastnik (route:22) |
| A14 | Dokumenti (register) | `src/app/api/trip/[shareId]/documents/route.ts:53` + TripDocument model (schema:752) | GET/POST/DELETE | — | DA | NE | issue4-wave4-documents.test.ts, task72-trip-doc.test.ts | — | DA | trip-documents-card.tsx na /pot | DELA | format pdf/image/text/link/none + bookingId/dni |
| A15 | .ics izvoz | `src/lib/ics-export.ts:103` (buildItineraryICS) | — (klient blob) | planner import (planner:169, 2217) | DA (0 ure) | NE | task72-trip-doc.test.ts | — | DA | gumb koledar v plannerju | DELA | vsak postanek → event |
| A16 | **PDF izvoz itinererja** | **NE OBSTOJA** (edini pdf-lib: `src/lib/pdf/commission-invoice-pdf.ts` — B2B računi) | — | — | — | — | — | — | NE | NE | **MANJKA** | pdf-lib odvisnost obstaja; ingest-PDF (uvoz) DA, izvoz NE; print CSS na /na-poti + print-qr.tsx delno nadomesti |
| A17 | Rezervacije (uvožene) | `src/lib/imported-reservation.ts:20` + /api/journey/bookings/parse + import | POST parse/import | normalizacijska plast (striže/validira AI izhod) | DA (determinantna plast nad AI parse) | DA (VLM/LLM ekstrakcija — AI NE zapisuje brez potrditve) | task95-ingest-pdf.test.ts, task99-booking-lifecycle | — | DA | trip-reservations.tsx na /pot | DELA | parse STATELESS; DRAFT pri nezanesljivem |
| A18 | Stroški/proračun | `src/lib/trip-budget.ts:141` (computeTripBudgetSummary) + /api/trip/[shareId]/expenses + TripExpense (schema:721) | GET/POST/DELETE expenses | cost-truth.ts (dayCostSummary) | DA | NE | issue4-wave1-truth, issue4-wave3-truth, hardening-price-truth | — | DA | trip-budget-card.tsx + budget-panel.tsx | DELA | trojna resnica: booked + expenses + plan stops |
| A19 | Cenovna resnica (unknown ≠ 0) | `src/lib/cost-truth.ts:29` | — | trip-timeline, trip-budget, testi | DA | NE | hardening-price-truth.test.ts | — | DA | timeline "N z neznano ceno" | DELA | NaN sentinel nikoli → €0 |
| A20 | Transport (journey) | `src/lib/journey/orchestrator.ts` (784) + /api/journey/plan:18 | POST /api/journey/plan | journey/* (16 modulov) | Mešano (OSRM+OSM živi; KT dataset statičen) | NE (0 LLM) | task58-journey.test.ts, task63 | — | DA | /potovanje (journey-planner.tsx 785) | DELA | rate limit 20/min; observability dogodki |
| A21 | Provenanca/svežina | `src/lib/data-freshness.ts:38` (FRESH/STALE/UNKNOWN/LIVE) + `destination-provenance.ts` | /vir-podatkov page | FSQ_SNAPSHOT_DATE (map-pins.ts:43) | DA (now injiciran — :20-22) | NE | issue4-wave5-freshness.test.ts | — | DA | /vir-podatkov + stop-insights UI | DELA | 8 razredov pragov; affiliateOffers vedno unknown |
| A22 | Vreme v načrtu | `src/lib/itinerary-weather.ts` + weather-utils + /api/weather | GET /api/weather | route.ts fetchAnchorForecasts:132 | Mešano (Open-Meteo živi) | NE | task88-itinerary-weather.test.ts | — | DA | planner + shared-trip dnevi | DELA | K-1/K-2 FIXED: `weatherEstimated` marker (trip/[shareId]/route.ts:76,88) |

**Opombe A:**
- Seja vs DB persistenca: `itinerary-persist.ts` (localStorage `discoverslovenia_last_itinerary`, 250 KB kap, defenzivno) = zadnji NEshranjen načrt; `dai:my-trips` = seznam shranjenih; DB = deljene pote. Tri plasti, vsaka z jasno vlogo (ena resnica po 99-b).
- `my-orders-storage.ts` (FW2-C) — lokalna zgodovina naročil, javni lookup API-ji.

---

## B. Map / Go Mode — matrika

| # | Capability | Code | API | SDK/Script reused | Deterministic? | AI dep | Test | E2E | Prod | UI | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B1 | Zemljevid stran | `src/app/zemljevid/page.tsx:80` + map-section.tsx + map-view.tsx (1328) | — | DESTINATIONS/DESTINATIONS_EN | DA | NE | task86-map-deep-link.test.ts | DA (živi, ux-audit) | DA | /zemljevid + EN whitelist | DELA | Leaflet + markercluster, Balkan bbox (map-view:71) |
| B2 | Statčni FSQ pins sloj | `src/lib/map-pins.ts` (426) + `map-pins-client.ts:55` (useMapPins) | GET /api/map/pins (bbox, zoom, cats) | fsq dataset indeks (isti kot adapter) | DA (0 omrežja, ~8 ms) | NE | map-pins.test.ts | scripts/test-pins.ts (pins-ingest — DRUG modul, ne map-pins!) | DA | map-view čipi + mehurčki | DELA | grid z≤10 / pini z≥11, kap 800 + "capped" iskrenost |
| B3 | Bad bbox obramba | `src/lib/map-pins.ts:164-184` parseMapPinsQuery | 400 z jasno napako | — | DA | NE | map-pins.test.ts | — | DA | — (klient pokaže error hint) | DELA | 5 varovalk: required/4 številke/s<n, w<e/meje/400°² |
| B4 | Route rendering (AI načrt na zemljevidu) | map-view.tsx (routeCoords/routeByDay iz useAppStore) + road-routing.ts | — | road-routing (legKey, DESTINATION_COORDS) | DA (OSRM noge + hevristika fallback) | NE | issue4-wave6-route-regression.test.ts | road-routing-test.ts --live | DA | /zemljevid ko je načrt + planner mini-map | DELA | dan žetoni + barve DAYS |
| B5 | Current location (GPS) | `src/lib/journey/use-geolocation.ts:1` (106) | — | — | NE (živi senzor) | NE | — | — | DA | go-mode GPS žeton | DELA | zasebnost: živi samo v pomnilniku seje (na-poti/page:23) |
| B6 | Next stop / Now&Next | `src/lib/journey/go-view.ts` (389) buildGoView | — | haversineKm (geo-corridor) | DA | NE | task64-go-mode.test.ts | — | DA | /na-poti | DELA | dnevni override, done ključi, zamrznjeni dnevi |
| B7 | ETA do naslednjega | go-mode.tsx:526-547 (etaInfo) | — | heuristicLeg (road-routing) | DA (premica ×1,3 @ 55 km/h — POŠTENO labelirano) | NE | task67-go-nav.test.ts (handoff) | — | DA | PREDVIDEN PRIHOD kartica | DELA | brez GPS/geo → izrecno NEZNANO (ne tiho); promet = "NEZNANO — nimamo vira" (go-mode:192) |
| B8 | Navigation handoff | `src/lib/journey/go-nav.ts:70/98/136` + /go/[provider]/route.ts (365) | /go/[provider] redirect | handoff-record.ts (observability) | DA (validacija koordinat fail-closed) | NE | task67-go-nav.test.ts | — | DA | gumb "Navigiraj" (geo: URI mobitel / Maps URL desktop) | DELA | 0 URL injection (samo validirane številke); izrecno zunanja aplikacija |
| B9 | Go Mode vreme | `src/lib/journey/go-weather.ts` (180) + go-mode.tsx:459-519 | GET /api/weather | — | NE (živi Open-Meteo) | NE | task65-go-weather.test.ts, task66-trip-weather.test.ts | — | DA | vremenska kartica naslednjega postanka | DELA | iskrenost: brez signala → zadnje znano / sporočilo |
| B10 | AI načrt → Go Mode most (K-7) | `src/lib/journey/itinerary-go.ts` (316) + planner:1540 handleStartGoMode | — | trip-dates, road-routing legKey | DA (čista pretvorba) | NE | task73-offline-gomode.test.ts (offline.html prek mostu) | — | DA | gumb "Zaženi Na poti" v plannerju + shared-trip | DELA | persistenca dai:go-trip v2 + shareId povezava |
| B11 | Journey map (/potovanje) | `src/components/journey-map.tsx` + journey-planner.tsx | POST /api/journey/plan | journey/* | Mešano | NE | task58-journey.test.ts | — | DA | /potovanje | DELA | KT transferi + FSQ nastanitve na zemljevidu |
| B12 | Map deep link | task86 (zemljevid → destinacija modal) | — | — | DA | NE | task86-map-deep-link.test.ts | — | DA | URL parametri | DELA | — |
| B13 | Offline map (tiles) | sw.js:218-229 (dai-tiles cache-first) | — | — | — | — | pwa-test.ts (strategije) | — | DA | videna območja delajo offline | DELA-DELUJE | LRU 600; iskrena matrika "delno — samo območja, ki si jih že odpral" |

---

## C. Offline / PWA — matrika

### C.1 manifest.json (public/manifest.json, 113 vrstic)
- `name`/`short_name`: Discover Slovenia AI; `start_url: "/"`; `display: standalone`; `orientation: portrait-primary`; `lang: sl-SI`; scope `/`.
- Ikone: 192 + 512 PNG, `purpose: any` IN `maskable` (obe velikosti) — namestljivost izpolnjena.
- Shortcuts ×4 (Načrtuj /zemljevid /tržnica /destinacije) + screenshots ×2 (wide 1280×720, narrow 540×720).
- **Najdba**: description še vedno pravi "22 najlepših destinacij" — zastarelo (38 destinacij od TASK 62); kozmetična nedoslednost.

### C.2 sw.js — analiza predpomnilnika (411 vrstic, verzija skripte sw3)
| Cache | Vsebina | Strategija | Limit | Namensko |
|---|---|---|---|---|
| `dai-shell-v2` | precache STATIC_ASSETS (/, manifest, ikone, logo, offline.html) + chunk-i/stili/fonti + HTML navigacij + RSC fallback | cache-first (asseti) / network-first (HTML) | 400 (LRU) | app shell približek |
| `dai-plans-v1` | `/api/itinerary/shared/*` JSON + `/pot/*` HTML + `/na-poti` HTML | network-first + offline fallback iz cache | 40 (LRU) | "offline načrt" jedro — NAČRTNO ne-bumpana verzija (sw.js:84-91: bump bi izbrisal shranjene offline načrte popotnikov) |
| `dai-tiles-v1` | OSM tile-i (a/b/c.tile.openstreetmap.org, destination:image) | cache-first | 600 (LRU ~15 MB) | offline zemljevid videna območja |
| `dai-img-v1` | ostale slike (CDN) | cache-first | 120 (LRU) | hitrost |

- NIKOLI cachano: ostali `/api/*`, `/admin`, `/owner`, non-GET (sw.js:249-251) — avtentikacija/generiranje vedno sveže.
- Push: `push` + `notificationclick` handlerja (VAPID payload; tag dedupe; focus+postMessage ali openWindow).
- Debug: `GET_CACHE_INFO` MessageChannel (sw.js:378) — uporabno za E2E.
- DEV: `?dev=1` = fetch passthrough (brez cachinga) — sw-register.tsx:29.
- Versioning: `dai-shell` bump (v1→v2) ob strategiji; **offline.html je PRECACHE-AN → vsaka sprememba offline.html ZAHTEVA byte-bump sw.js** (dokumentiran vzorec sw3, sw.js:3-12; izveden ob §16 val 4). Tveganje: če razvijalec pozabi bump, stare namestitve ostanejo na stari offline strani — zmernega pomena (toast "Osveži" prek pwa-update-toast).

### C.3 offline.html (741 vrstic) — vloga
- Sejam samoizpolnitvena stran (fallback za VSE navigacije brez cache zadetka): bere `dai:go-trip` (Go Mode aktivno potovanje — NAD delom "Moji načrti"), `dai:my-trips` (seznam + cache handshake), cachane `dai-plans` vnose.
- MATRIKA zmožnosti brez signala (§16): dnevi/postanki DA · navigacijski gumb odpre ZUNANJO aplikacijo · vreme SAMO signal · rezervacije PRI PONUDNIKU — nikoli splošna "offline" oznaka.
- Retry gumb (`btn-retry`) + dvojezični slovar SL/EN z IDENTIČNO množico ključev (testirano).

### C.4 Registracija + namestljivost + stanja
| Capability | Code | Status | Evidence |
|---|---|---|---|
| SW registracija | src/components/sw-register.tsx:19 (updateViaCache:"none", waiting→SKIP_WAITING, updatefound→"dai:sw-update") | DELA | v obeh okoljih; dev ?dev=1 |
| Update toast | src/components/pwa/pwa-update-toast.tsx (posluša dai:sw-update → gumb Osveži) | DELA | izven Intl providerja — navedeno |
| Install gumb | src/components/pwa/pwa-header-icons.tsx:47 (standalone detection, beforeinstallprompt→prompt(), iOS Sheet navodila, analitika pwa_install_*) | DELA | skrit ko nameščeno |
| Offline indikator (map) | map-view.tsx:133-150 (degradedHint/networkHint — NE obtožuje virov ob offline) | DELA | iskrena ločitev client-network |
| Go Mode offline matrika | go-mode.tsx:159-169 (offlineMatrix — kaj dela brez signala) | DELA | — |
| Offline warm načrta | itinerary-share.ts:115 (warmOfflinePlanCache — fire-and-forget ?warm=1 brez štetja ogleda, editToken glava za zasebne) | DELA | kliče se ob vsakem save |
| Reconnect | offline.html btn-retry + network-first strategije (online vedno sveže) | DELA | — |

### C.5 Testni dokazi §16 ("real E2E proof" — REVIZIJA TRDITVE)
- `scripts/pwa-test.ts` (568): nalaga DEJANSKI public/sw.js v mock ServiceWorkerGlobalScope (MockCache/caches/fetch) — 36 testov strategij + manifest/offline.html pogodbene kontrole. REALNA logika, LAŽNI brskalnik.
- `src/lib/__tests__/task73-offline-gomode.test.ts` (522): izlušči inline `<script>` iz DEJANSKEGA offline.html in ga izvede z `new Function` nad stub DOM + localStorage (issue4-wave4-offline.test.ts:117). REALNA skripta, LAŽNI DOM.
- `task78-offline-days.test.ts` + `task75-pwa-shortcuts.test.ts`: statične + vedenjske kontrole.
- **Sodba**: "E2E" v pomenu "izvedba odposlane produkcjske datoteke v nadzorovanem harnessu" — NI brskalniški offline test (npr. Playwright network-offline). Documented limitation ostaja: hladen SW brez toplega cache-a → brskalnikova napaka (ux-audit K-16, LOW).

---

## D. Skupnost — matrika (REALNO DB-backed, 0 demo)

| Capability | Model (prisma/schema.prisma) | API | Klient UI | Vrata | Test | Status |
|---|---|---|---|---|---|---|
| Glasovi na lokacijah | TripVote (:206, unique[shareId,locationKey,voterId]) | /api/trip-vote (GET/POST/DELETE, trip-vote/route.ts) | shared-trip.tsx:227 ThumbsUp | communityTripGate("read") javno / comment zasebno; 404 za izmišljene tripe (route:90-100) | issue4-wave4-capability | DELA |
| Komentarji | TripComment (:220, 2-500 znakov) | /api/trip-comments | trip-social.tsx:282 | gate comment | wave4 | DELA |
| Všečki | TripLike (:234, unique[shareId,clientId]) | /api/trip-likes (toggle idempotentno) | trip-social.tsx:216 Heart | gate read | wave4 | DELA |
| Ankete | TripPoll (:249) + TripPollVote (:267, unique[pollId,voterId], prestavitev glasu) | /api/poll (GET/POST/PATCH/DELETE) + /api/poll/vote | trip-polls.tsx:159+ | avtor (authorClientId) edini zaključi; gate | wave4 | DELA |
| Potni dnevnik | TripDiaryEntry (:287, rating 1-5, dayIndex) | /api/diary (GET/POST/PATCH/DELETE, 554 vrstic) | trip-diary.tsx:404+ | gate comment; avtor ureja svoje | wave4 | DELA |
| Vodniki (F7) | TripGuide (:184, tips JSON, lang) | /api/trip-guide (268) | trip-guide.tsx:248 (obrazec z editToken) + prikaz na /pot | OWNER = editToken/userId (SHA-256, route:192) | wave4 | DELA |
| Skupnost načrtuje (homepage) | SavedItinerary (public) | — (server komponenta bere direktno DB) | community-trips.tsx:29 (SERVER async) | javne pote | — | DELA |
| Wishlist/collections | localStorage (wishlist-storage.ts, collections.ts) + /api/collections | GET/POST | wishlist-sheet.tsx | — | — | DELA (lokalno + DB hibrid) |

**Sodba D**: vseh 7 skupnostnih zmožnosti je DB-backed z anonimno identiteto (client-identity.ts — getVoterId, localStorage ID), poenotenim vratnim sistemom `communityTripGate` (trip-permissions.ts:185) in dejansko dosegljivim UI na /pot/[shareId] (page.tsx:409-470 renderira VSE komponente). NIČ ni mock/demo. Anonymous-first ostaja na javnih poteh (nazaj kompatibilno), zasebne zahtevajo vlogo.

---

## E. Lokalizacija

- **Jezika**: `sl` (default, brez prefix) + `en` (`/en` prefix, `localePrefix: "as-needed"`) — src/i18n/routing.ts. NE obstajajo drugi dejavni jeiki.
- **de/it**: `src/i18n/messages/de.json` + `it.json` = 39-vrstične LEGACY oglate (samo nav/hero/footer/common) — routing jih NE vsebuje; `/de`/`/it` zahteve proxy 308 preusmeri na slovensko pot (routing.ts:19-21). Zavajajoče prisotne v repu (LOW).
- **Mehanizem preklopa**: URL prefix (NE cookie) — language-switcher.tsx:81-97 TRDA navigacija (window.location) zaradi Router Cache čiščenja; ohrani trenutno stran.
- **EN whitelist** (routing.ts): 17 statičnih poti + 38 destinacijskih pod-poti (regex ×5 vzorcev) + 10 adria vodičev; `/en/<nedovoljeno>` → 308 na SL (proxy.ts).
- **Pariteta**: task71-i18n-parity.test.ts — IDENTIČNA množica ploščih ključev sl/en (2262 vrstic vsak), neprazni nizi, placeholder kontrole; fragment sistem (src/i18n/fragments/ ×39 parov) + scripts/merge-i18n-fragments.py (top-level merge, kolizija = napaka).
- **Dvojni mehanizem**: poleg next-intl JSON sporočil komponente uporabljajo INLINE `L`/`T` slovarje (map-view.tsx:78+, go-mode.tsx, vse page.tsx) — namerna izbira za Leaflet/komponente izven providrjev, vendar JE drugi lokalizacijski vzorec (vzdrževalna dvojnost).
- **Formatiranje**: Intl.DateTimeFormat("sl-SI") (moja-potovanja:74), formatEur = Intl.NumberFormat sl-SI EUR (stripe-server.ts:46), localeTime v go-mode; trip-dates.ts za datumsko aritmetiko (DST varovana — task79-trip-dates-dst.test.ts).

---

## F. SDK + scripts — inventar in analiza

### F.1 Inventar scripts/ (74 datotek: 46 .ts + 2 .sh v root, 9 db/, 15 ops/ .sh, 2 verify/ .sh, 2 .py)

| Kategorija | Datoteke | Runnable danes? | Referencirano |
|---|---|---|---|
| **data-ingest** | ingest-fsq.ts (+ingest-fsq.py stopnja 1), ingest-sto.ts, ingest-kiwitaxi.ts | DA (tanke ovije nad src/lib ingest moduli — poslovna logika SAMO v src/lib) | package.json (`sto:ingest`, `fsq:ingest`, `kiwitaxi:ingest`), vercel.json cron reingesti |
| **db-ops / seed / migracije** | seed-demo.ts (519), build-demo-db.sh, scripts/db/×9 (fw1, p8, p9, restore/zero-demo-ratings, retire-demo-accounts, run-trip-collaborator-migration), migrate-partner-status.ts, migrate-cdn-images.ts, fix-listings-data.ts, verify-migration.ts, check-db.ts, get-ids.ts, cleanup-test.ts | VEČINOMA (seed-demo prek `db:seed:demo`; db/* imajo STARE poti `/home/z/Discover-Slovenia-AI` v dokumentacijskih komentarjih — delujejo iz Projektnega roota z env) | package.json (build, db:seed:demo) |
| **e2e / pwa / verifikacija** | pwa-test.ts, e2e-test.ts (656), e2e-4a-seed/cleanup, pilot-audit.ts (405), pilot-scenarios.ts (281), pilot-geo-validator.ts (280), phase4-verify.ts (238), road-routing-test.ts (448, --live), road-routing-before-after.ts, test-day-order.ts, test-pins.ts, test-validator-stats.ts, test-listing-practical.ts, test-marketplace-migration.ts, launch-checklist.ts, validate-adria-en.ts, cron-runner.ts | DA (ročno; pilot-* potrebujejo produkcijski URL) | docs/PILOT-VALIDATION-GATE.md, docs/PHASE-4-IMPROVEMENTS.md; CI NE poganja nobenega |
| **image-ops (VLM/image-search)** | audit-content-images, fetch-all-images, find-duplicate-images, fix-listing-images, fix-problematic-images, regen-marketplace-images, regen-mismatched-images, replace-listing-images, update-{experience,listing,product}-images, verify-{listing,marketplace,new}-images, image-fix-data/ | ENKRATNE ZGODOVINSKE (odvisne od z-ai-web-dev-sdk + /tmp/* batch datotek, ki ne obstajajo več; rezultati JSON v root projekta) | NE |
| **ops/deploy** | ops/×15 (deploy-check, dev-health, doctor, functional-smoke, gemini/openrouter-verify, github-secret-*, github-workflow-run, migrate-baseline, migrate-deploy, render-env-set, vercel-env-set, setup-all, lib.sh), copy-standalone.sh, verify/affiliate-redirects.sh, verify/production-smoke.sh | DA | CI ci.yml:152 + prod-monitor.yml:42,54 (functional-smoke), ai-smoke.yml (github-workflow-run), package.json build (copy-standalone) |
| **i18n tooling** | merge-i18n-fragments.py | DA (ob dodajanju fragmentov) | — |
| **analitika (one-shot)** | revenue-analysis.ts | **NE (pokvarjena)** — hardcoded `file:/home/z/Discover-Slovenia-AI/db/custom.db` v KODI (:8), projekt zdaj na /home/z/my-project | NE |

**Ključno opažanje F.1**: CI ne poganja NOBENEGA TS skripta (samo bun test + lint + tsc + build + functional-smoke.sh). Vsi e2e/pilot skripti so ROČNA orodja — nikoli ne tečejo avtomatizirano. 6 skript je v package.json, 3-4 v CI/workflows.

### F.2 Deterministične knjižnice v src/lib/ — čistost in ponovna uporaba

| Modul | Čist (0 Date.now/fetch/prisma)? | Uporabniki | |
|---|---|---|---|
| deterministic-itinerary.ts | DA (testno varovano) | /api/itinerary + testi | API+test |
| route-order.ts (optimizeDayOrder v2) | DA | plan-check.ts (API), itinerary-planner.tsx:123 (UI), scripts/test-day-order.ts, wave6 testi | **API+UI+script+test** |
| geo-validation.ts | DA | /api/itinerary, scripts/road-routing-test.ts:47, road-routing-before-after.ts | **API+script** |
| itinerary-quality.ts | DA | /api/itinerary, road-routing-test.ts:48 | API+script |
| trip-costs.ts | DA | /api/itinerary, road-routing-test.ts:49 | API+script |
| road-routing.ts (+server) | DA (client-safe; OSRM v server plasti) | route, planner, go-mode (heuristicLeg), scripts | API+UI+script |
| day-segments.ts | DA | planner, shared-trip, trip-timeline, day-segment-header | **API+UI** |
| cost-truth.ts | DA | trip-timeline (UI), trip-budget (API/lib), testi | UI+lib+test |
| trip-dates.ts | DA (parseISODateLocal) | route, refine, pot page, planner, crowd-alternatives, itinerary-go, geo-validation | **API+UI+lib** |
| events-match.ts | DA | route, refine, pot page, events-i18n test | API+UI+test |
| destinations-sort.ts | DA | destinations.tsx (UI), task69 test | UI+test |
| itinerary-sanitize.ts | DA | route, save, refine | API |
| ics-export.ts | DA (0 ure) | planner (UI), task72 test | UI+test |
| itinerary-undo.ts | DA | planner (UI), testi | UI+test |
| data-freshness.ts | DA (now injiciran) | map-pins, vir-podatkov, adapterji, testi | API+UI+test |
| trip-budget.ts | DA | /api/trip/[shareId], trip-budget-card | API+UI |
| map-pins.ts | DA (dataset iz pomnilnika/datotek, 0 prisma) | /api/map/pins, useMapPins, testi | **API+UI+test** |
| imported-reservation.ts | DA | /api/journey/bookings/parse | API |
| go-nav.ts / go-view.ts / itinerary-go.ts | DA | go-mode (UI), testi | UI+test |
| trip-permissions.ts | NE (prisma) — s pravom | vse §13 rute | API |

### F.3 KLJUČNO VPRAŠANJE: koherentna deterministična izvedbena plast?

**Sodba: DA, v glavnem koherentna — "en vir resnice" vzorec je REALEN in dokumentiran.**
- Skripti UVAZAJO src/lib module (14+ importov `../src/lib/*` — F.1 tabelarni dokazi): poslovna logika ingestov živi v src/lib (ingest-sto.ts:8 "isti moduli kot adapter, ni dvojnega vira resnice"), validacijski skripti uporabljajo ISTE funkcije kot API rute.
- Nekdanja duplikacija itinerer motorja (/api/itinerary LOKALNA kopija fallback generatorja) je ODSTRANJENA v 1.87.0 (CHANGELOG:1464-1479 "route še vedno klical LOKALNO kopijo" → čist modul); route.ts:1221 zdaj kliče `generateDeterministicItinerary`.
- route-order: NI duplikacije med lib in scripts/test-day-order.ts (skript uvaža optimizeDayOrder iz lib, test-day-order.ts:3).

**KONKRETNE DUPLIKACIJE, KI OSTAJAJO (file:line):**

| # | Algoritem | Lokacije (kopije) | Dokaz |
|---|---|---|---|
| D1 | **haversineKm** (identična formula, R=6371) | 11 implementacij: geo-corridor.ts:9 (izvožena), stop-insights.ts:46 (izvožena), journey/orchestrator.ts:65 (izvožena!), schedule-slots.ts:58, itinerary-quality.ts:73, crowd-alternatives.ts:82, road-routing.ts:78, trip-costs.ts:34, supply/stop-insert.ts:26, chat-add-place.ts:110, geo-validation.ts:143 (+ geo-order.ts uporablja coherenceHaversineKm iz geo-coherence) | grep `function haversineKm` — 3 izvožene + 8 privatnih kopij; go-view/meal-stops/refine-actions uvažajo geo-corridor različico |
| D2 | **ROAD_FACTOR = 1.3** | stop-insights.ts:22 (izvožen), road-routing.ts:43 (HEURISTIC_ROAD_FACTOR, izvožen), itinerary-quality.ts:66, geo-validation.ts:47, trip-costs.ts:30 | 5 mest; schedule-slots.ts:31 NAMERNO 1.5/50 (konzervativnejši za slot repair — dokumentirano, NE duplikacija) |
| D3 | **AVG_SPEED_KMH = 55** | road-routing.ts:45 (izvožen), itinerary-quality.ts:68, geo-validation.ts:49 | 3 mesta |
| D4 | Vremenska sidra | WEATHER_ANCHOR_DEFS v route.ts:117-125 + AnchorForecast TIP v deterministic-itinerary.ts:42 | po zasnovi (tip v lib, klici v route) — sprejemljivo, a boundary med "lib čisto" in "route orkestracija" ni formaliziran |
| D5 | L-pattern inline slovarji | map-view.tsx:78, go-mode.tsx, ~vse page.tsx + i18n/messages/*.json | dvojni lokalizacijski mehanizem (E) |

### F.4 Providers/Stripe klasifikacija (samo klasifikacija, NE globok audit)

| Enota | Kaj dejansko dela | Klasifikacija | Dokaz "not activated" |
|---|---|---|---|
| /api/stripe/checkout (237) | Owner naročnina premium/enterprise; demo = takojšnja nadgradnja + email; production = Stripe Customer + Checkout Session + URL | **live-capable, DORMANT** | isStripeDemo (stripe-server.ts:24-30): produkcija demo ZAHTeva `DSA_DEMO_PAYMENTS=1`; brez ključa in brez zastavice → 503 (:147-155); FEATURE-FLAGS.md:7 "sistem NI implementiran … PAYMENTS_ENABLED=false" (samo načrt; `PAYMENTS_ENABLED` v src/ NE obstaja — dokumentacijski drift) |
| /api/stripe/webhook (577) | checkout.session.completed (provizijski račun: znesek/payment_status preverba, RC-4 dvojno-plačilo detekcija), customer.subscription.updated/deleted, invoice.payment_failed + ProcessedStripeEvent dedupe | **live-capable, DORMANT** (brequira STRIPE_SECRET_KEY + STRIPE_PRICE_ID) | schema:935 ProcessedStripeEvent; webhook signature preverba |
| /api/stripe/portal (118) | Billing portal session | **live-capable, DORMANT** | isStripeConfigured vrata |
| /api/checkout (563) | Marketplace košarica → Order (demo: status "paid" izrecno demo; real: Stripe payment intent); SERIALIZABLE + retry P2034; 501 fail-closed | **live-capable, DORMANT** | checkout/route.ts:337-345 skupni fail-closed helper |
| /api/orders/[orderNumber] (94) | Javni lookup naročila po številki (+email) | DELA (branje) | — |
| commissions.ts (264) | 12 % provizija free partnerjev, mesečni računi (issueCommissionInvoice), monthRange/invoiceNumberFor | **DB-logika REALNA; izplačila od Stripe aktivacije** | cron commission-invoices (vercel.json: 1. v mesecu); pdf/commission-invoice-pdf.ts (pdf-lib+fontkit) |
| affiliate.ts (630) | Partner URL gradnja za 11 providerjev; env-gated ID-ji | **LIVE** (redirect deluje vedno; brez ID-ja → čist partner URL + monetized:false, NIKOLI lažni tracking) | affiliate.ts:16-20 fail-closed; /go/[provider] + handoff-record.ts observability |

---

## Ugotovljene vrzeli

1. **HIGH — Duplikacija haversineKm (11 implementacij) + ROAD_FACTOR (5) + AVG_SPEED (3)** v deterministični plasti. Evidence: F.3 tabela D1–D3 (geo-corridor.ts:9, stop-insights.ts:46, journey/orchestrator.ts:65, road-routing.ts:78/43/45, itinerary-quality.ts:73/66/68, geo-validation.ts:143/47/49, trip-costs.ts:34/30, crowd-alternatives.ts:82, schedule-slots.ts:58, supply/stop-insert.ts:26, chat-add-place.ts:110). Tveganje: drift formule/konstant v prihodnjih spremembah (ena sprememba faktorja → 5 datotek); ovira za Issue #5 "deterministic SDK" cilj.
2. **MEDIUM — PDF izvoz itinererja NE obstaja** (A16). Odvisnosti (pdf-lib, @pdf-lib/fontkit) so nameščene in uporabljene SAMO za B2B provizijske račune (src/lib/pdf/commission-invoice-pdf.ts). .ics + print CSS + print-qr delno pokrivajo, a "documents" zmnožnost nima PDF izvoza, ki bi bil naravni product expectation.
3. **MEDIUM — scripts/ vsebuje ~30 enkratnih zgodovinskih skript** (image/VLM ops z /tmp batch odvisnostmi, pilot-results/ artifacts, image-fix-data/) BREZ ločitve arhiva; `revenue-analysis.ts:8` ima POKVARJENO hardcodeano pot `file:/home/z/Discover-Slovenia-AI/db/custom.db` (projekt je na /home/z/my-project) — skripta danes ne deluje; 9 db/* skript ima isto staro pot v dokumentacijskih komentarjih (delujejo prek package.json/env, a navodila so zavajajoča).
4. **MEDIUM — CI ne poganja NOBENEGA e2e/pwa/pilot skripta** — vsi (pwa-test, e2e-test, pilot-*, road-routing-test, phase4-verify) so ročna orodja; "functional smoke" v CI je EDINI živi E2E (GET-only). §16 "real E2E proof" je harness-ravni (new Function + stub DOM; mock SW scope), ne brskalniški offline test — trditev v CHANGELOG/issue je močnejša od dokaza (dokaj iskrena: pwa-test.ts:4-9 sam pove "ZAKAJ mock in ne brskalnik").
5. **MEDIUM — FEATURE-FLAGS.md dokumentacijski drift**: trdi "PAYMENTS_ENABLED=false" upravlja trenutno stanje, a `PAYMENTS_ENABLED` v src/ NE obstaja (0 zadetkov); dejanski mehanizem je `isStripeConfigured`/`isStripeDemo`/`DSA_DEMO_PAYMENTS`. Napačno navdihovanje operaterjev.
6. **LOW — manifest.json description zastarel** ("22 najlepših destinacij" — 38 od TASK 62; description v offline kontekstu prav tako omenja offline načrte kar je OK).
7. **LOW — de.json/it.json legacy 39-vrstične oglate** ostajajo v src/i18n/messages/ (routing jih ignorira, 308 redirect) — zavajajoče za vzdrževalce.
8. **LOW — offline.html precache zahteva ročni byte-bump sw.js** ob vsaki vsebinski spremembi (vzorec sw3 dokumentiran, a procesno tveganje: pozabljen bump → stale offline stran na nameščenih SW-jih; mitigacija: update toast).
9. **LOW — dai-plans LRU 40 vnosov** lahko iztrebi starejše offline načrte aktivnega popotnika (dokumentirano namerno; /na-poti HTML je namenoma v PLANS, ne SHELL — sw.js:84-91).
10. **INFO — Go Mode vreme zahteva signal** (iskreno prikazano v matriki); ETA je hevristika premice (pošteno labelirano "NEZNANO — nimamo vira prometa").

---

## Sklepi

1. **Trip platform je funkcionalno CELA in produkcijsko realna** (17/17 zmožnosti DELA razen PDF izvoza, ki ne obstaja); gost→račun kontinuiteta (localStorage → claim → DB) je vzorčno rešena; varnostna plast (SHA-256 editToken, timing-safe, CAS, 404-nevidnost, vloga rangi) je globoka in testirana.
2. **Map/Go Mode sta resnično deterministični izvedbeni plasti** — FSQ sloj, OSRM, handoff in ETA so vsi "honest by construction"; K-7 most (AI načrt → Go Mode) je implementiran in testiran.
3. **PWA/offline je NADPovprečno resen** (4 strategije, LRU, precache, push, update toast, samoizpolnitvena offline.html) — edina mehka točka je raven dokaza (harness, ne brskalnik) in procesna odvisnost od ročnih sw.js bumpov.
4. **Skupnost je 100 % DB-backed** — NIČ demo/mock; anonimna identiteta + enotna vrata so konsistentni vzorec.
5. **Lokalizacija je dvjezična (sl/en) s testirano pariteto**; de/it so mrtvi ostanki; dvojni mehanizem (i18n JSON + L inline) je zavestna, a vzdrževalno dvojna odločitev.
6. **SDK plast: koherentna v arhitekturi, NE pa še v primitivah** — vzorec "src/lib = en vir resnice, scripts/API/UI/testi samo uvažajo" je izveden in deluje (14+ skriptnih uvozov, 0 duplikacij itinerer motorja/route-order); OSTALEOČI dolg je koncentriran v geometrijskih primitivah (haversine/ROAD_FACTOR/AVG_SPEED — 11/5/3 kopij) in v 30 zastaralih skriptah. To je KONRETEN, majhen obseg za Issue #5 "deterministic SDK first" konsolidacijo: en `geo-distance.ts` izvoz + import swap.
7. **Stripe = live-capable ampak dormant (fail-closed), affiliate = live, commissions = realna DB logika** — monetizacijska infrastruktura čaka SAMO na Stripe ključe; demo plast je izrecna in nikoli tiha.
