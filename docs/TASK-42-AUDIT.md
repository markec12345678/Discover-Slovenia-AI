# TASK 42 AUDIT — F1 HARDENING / REAL PROVIDER CONTRACT AUDIT

Datum: 18. 9. 2026 · Repo: markec12345678/Discover-Slovenia-AI · Osnova: Task 41 (F1 fundacija)
Metoda: 3 vzporedna revizijska agenta (42-b register/affiliate, 42-d produkt→AI, 42-e varnost/performanse) + lastna revizija kanonskega modela in adapter pogodbe (42-a/42-c) + popravki + 258 testov + E2E brskalniška verifikacija.

---

## GREEN — dokazano

1. **Kanonski model pokriva VSE 17 kategorij naročnika** (hotel, apartma, soba, kamp, aktivnost, izlet, tura, vstopnico, atrakcijo, transfer, rent-a-car, let, vlak/bus, eSIM, zavarovanje, lokalni POI) brez spremembe modela — `type` + `subcategory` + `geoPrecision` (exact/city/destination_center/country/route). Brez provider-specifičnih polj (poslovna odločitev: `(provider, providerProductId)` je ključ za nazaj obratni klic; vse ostalo ostane v adapterju). Test: supply-contract §1.
2. **EN provider register** — /vir-podatkov, ProviderPanel, ProductCard/Modal, sanitize whitelist in adapter wiring so IZPELJANI iz `PROVIDER_REGISTRY` (16 vnosov). `GoRoute` je zdaj TIPSKO izpeljan iz `AFFILIATE_PROVIDERS` (affiliate.ts) — drift med besednjakoma je prevajalniško nemogoč; dodatna testna varovalka preverja tudi `envKeys.affiliate` ↔ `affiliateStatus()` imena.
3. **Adapter izolacija** — naročnikov scenarij (A=200, B=timeout, C=malformed, D=prazno, OSM=200 → rezultat OSM+A, `degraded:[B,C]`, brez sesutja) je testirano; timeout (entry.timeoutMs), AbortSignal (request.signal → preklic nodo-https + retry zanke) in `skipped` (partial result) so v pogodbi. Zoom gating: pri z<10 se adapter SPOH NE pokliče (števec klicev v testu); pri z13 se pokliče; majhen bbox pride do adapterja NEPOSPREMEMNJEN in v Overpass QL (brez fiksnega SI bbox-a).
4. **/api/supply/search** — vsi parametri (bbox/zoom/cats/date/pax/locale) pridejo do adapterja; rate limit 30/min/IP; kape po zoomu (0/120/220/400); cats dedupe+kap 32; meja površine PO ZOOM-u (36→16→9→4 deg²); Cache-Control IZPELJAN iz registrov aktivnih adapterjev (živi vir s TTL 0 → no-store). Brez skrivnosti klienta (samo imena env).
5. **OSM ostaja LOKALNI place data** (skupina "local", `info_only`, brez cen/rezervacij) — ločeno od komercialnega inventarja; affiliate NIKOLI predstavljen kot inventar (registry invariantni testi).
6. **Dedupe: DO NOT MERGE** — komercialni/lastni viri se NIKOLI ne združujejo čez vire (prej sta se lahko združili dve različni turi z istim imenom na isti lokaciji!); združevanje ostaja SAMO za lokalne vire (osm/fsq) na geo+TIP+ime. Testi pokrivajo vse primere.
7. **Produkt → AI veriga** — modal → izbira (store+sessionStorage) → planner → POST /api/itinerary → sanitize → strukturirani AI kontekst → deterministična utrditev FIXED (tudi na fallback poti) → E2E DOKAZANO v brskalniku: FIXED produkt je postanek z ohranjenimi koordinatami (lat/lng), zlobni `bookingUrl` izpuščen.
8. **FIXED/PREFERRED/SUGGESTED** — implementirano v tipih, sanitize, AI promptu (izrecna pravila) in sedaj TUDI v UI: krogotek stanja na čipu v plannerju (fixed→preferred→suggested) s persistenco.
9. **Affiliate varnost** — /go veriga (allowlist 404, samo dest/from/days parametri z whitelisti, https+host allowlist s piko-mejo, fail-closed brez lažnega sledenja) ostaja nedotaknjena in je ZDaj tudi tipsko+testno povezana z registrom; product podatki ne omogočajo injekcije URL-jev (bookingUrl se odstrani na meji; provider-panel /go href iz tipiziranega goRoute + statičnega dest).
10. **Cena z semantiko enote** — 6 enot (total, per_person, **per_night**, per_day, per_vehicle, **per_transfer**) + strukturiran `fromPrice` ("od €79"); AI kontekst izpiše "from €79 (per night)" / "od 79 €"; UI (modal+kartica) prikaže enoto, "od" in opombo. Testi + E2E.
11. **Razpoložljivost** — 4-vrednostni status (LIVE_AVAILABLE / LIVE_UNAVAILABLE / UNKNOWN / NOT_SUPPORTED) zamenjava zavajajočega `live:boolean`; OSM izrecno `not_supported`; AI kontekst razlikuje LIVE available/unavailable/unknown; neveljavni statusi odpadejo. "available=true brez preverjanja" ni več mogoče.
12. **Provenance** — vsak produkt nosi provider + license{source,attribution} + lastUpdated (čas pridobitve); AI kontekst vsebuje `source: X`; UI izpisuje atribucijo (modal, kartica).
13. **Slike** — imageCredit (Wikimedia Commons / OpenStreetMap contributor / © Ponudnik), hotlink z atribucijo BREZ kopiranja v naš storage; wikimedia_commons "File:X.jpg" se prevede v Commons Special:FilePath; http(s) validacija na obeh mejah (adapter + render); referrerPolicy no-referrer.
14. **SSRF/XSS obramba** — OSM tagi (javno ureljivi!) se validirajo: `javascript:`/`data:` website → izpuščen (klik-XSS; prej AKTIVNA vrzel — E2E dokazano, da se ne izriše); slike samo http(s); buildWikiLinkFromTag validira jezik; /api/pois/[id] SSRF-utrjen (od 1.33) + ZDaj tudi rate-limitiran (30/min); /api/pois/describe kap velikosti telesa 32 KB.
15. **Performanse** — markercluster grozdenje, strežniške kape (max 400 pri z14+), stabilna `cats` memo, debounce 500 ms + abort + seq varovalka (brez request storm), EMPTY_STATE konstanta (brez ponovnega izrisa markerjev vsak render); 390px brez horizontalnega scrolla (E2E izmerjeno); brez 1000+ DOM markerjev.

## YELLOW — deluje, izboljšanje priporočeno

1. **~8 sekundarnih ročnih seznamov partnerjev** (affiliate-section, destination-modal, affiliate-cta-block, booking-panel, partner-badge, admin stats, i18n nizi) — vsi so biljni prikazi obstoječega affiliate sistema, ne registri zmožnosti; each has its own disclosure context. Priporočilo: postopno izpeljati href/nazive iz registra (ni blokada za providerje).
2. **/api/itinerary/refine** ne vrača FIXED izbire — refine dela na obstoječem načrtu, kjer so postanki že vnešeni; vendar AI-refine lahko izpusti supply postanke (izhod sanitize prenese koordinate, vrne pa AI). Priporočilo za F2: podaj izbiro tudi na refine + re-apply applyFixedSelectedProducts.
3. **removeProductStop** (stop-insert.ts) je mrtva koda — uporabniška pot odstranjevanja teče prek removeChatPlaceFromItinerary (kategorija "supply" pokrita). Odstraniti ali delegirati v prihodnji cikl.
4. **Asimetrija odstranjevanja**: × na postanku ne odstrani iz izbire (regeneracija ponovno vstavi). Manjša UX izboljšava za F2.
5. **Marker diff-render** — trenutno full teardown/rebuild (≤400) ob vsakem odgovoru; optimizacija (keyed diff) za F5.
6. **ProductModal detail fetch** brez klientnega memoja — odprta zavarovana z novim rate limitom 30/min; session-cache za F5.
7. **Telemetrija supply_query** se šteje samo na origin zadetkih (CDN zadetki podštejejo) — dokumentirano ob Cache-Control.
8. **Overpass iz peskovnika občasno nedosegljiv** (omrežje, ne koda) — iskrena degradacija deluje (degraded:["osm"], mapa ostane funkcionalna; v produkciji deluje).

## RED — blokade pred realnim providerjem

**NI OSTATIH RED UGOTOVITEV.** Vse tri izvirno odkrite RED vrzeli so odpravljene in preverjene:

- ~~Klik-XSS prek `product.sourceUrl` (OSM `website` tag → `<a href>`)~~ → FIX: safeExternalHref + adapter validacija (E2E dokaz).
- ~~`sanitizeLocation` izpuščal lat/lng~~ (AI-odmevi izgubili pince; deljeni načrti /pot izgubili vse ne-T1 pince) → FIX: passthrough s clampom (E2E dokaz: postanek z lat/lng).
- ~~Geo-validacija lažno prijavila missing_coords za supply postanke z veljavnimi koordinatami~~ → FIX: lastne koordinate se upoštevajo.

---

## PROVIDER READINESS

READY pomeni: adapter pogodba + pravni dostop do podatkov + normalizacija + geo + semantika cen + semantika razpoložljivosti + prikaz na zemljevidu + obravnava odpovedi. Affiliate povezava SAMO ni dovolj za READY.

| Provider      | Stanje | Utirjenost | Blokada / naslednji korak |
|---------------|--------|------------|---------------------------|
| **KiwiTaxi**  | **ARHITEKTURNO READY** | javni CSV (kraje WKT/rute/cene, živo preizkušen 18. 9. 2026) + affiliate globoka povezava | F2: napiši adapter (CSV ingest → statični sloj transfer tipov, cena per_transfer, geoPrecision route/city, availability not_supported), legal dostop potrjen — **prvi kandidat za Task 43** |
| **Viator**    | ARHITEKTURNO READY | affiliate povezava AKTIVNA; Partner API (brezplačni tier) zahteva prijavo | F3: prijava + API ključ → adapter (destinationId 5257, cene per_person, live_available) |
| **GetYourGuide** | ARHITEKTURNO READY | affiliate povezava; Partner API zahteva odobritev portala | F3: odobritev → adapter (coordinates[] radius, tracked URL) |
| **Tiqets**    | ARHITEKTURNO READY | affiliate povezava; Distributor API po prijavi | F3: prijava → adapter (lat/lng filtri, live razpoložljivost) |
| **Booking**   | pogojno | affiliate povezava; Demand API zahteva Managed Affiliate Partner status | F4: pogodba → adapter (accommodation, cena per_night, live_available) |
| **Travelpayouts** | načrtovan (status "planned") | self-serve API (predpomnjene cene) — brez povezave/inventarja danes | F2: preverba pogojev uporabe podatkov → adapter |
| **FSQ Open Places** | načrtovan ingest | Apache-2.0 odprti podatki (100M+ POI) | F2: ingest slovenske podmnožice → lokalni adapter (dedupe z OSM že pripravljen) |
| **DiscoverCars / Skyscanner / Omio** | REDIRECT-ONLY | affiliate povezave; API = B4B/velika-podjetja | ostanejo kartice (/go) — ni načrtovane priključitve inventarja |
| **Airalo**    | priključitev po odobritvi | affiliate povezava; Partner API državni nivo | F4: odobritev → choropleth (country geoPrecision), cena total |
| **World Nomads / SafetyWing** | REDIRECT-ONLY | plačilo po ponudbi, brez API | kartice (/go) |
| **OSM (lokalni vir)** | **AKTIVEN** ✓ | edini priključen adapter | deluje (viewport poizvedbe, dedupe, degradacija) |

**Sklep:** F1 arhitektura je utrjena in DEJANSKO pripravljena na realne providerje (pogodba adapterja z timeoutom/preklicem/rate limitom, semantike cen in razpoložljivosti, DO-NOT-MERGE dedupe, varnostne meje, koordinate v celotni verigi). Prvi realni provider za Task 43: **KiwiTaxi** (edini s potrjenim živim API/dostopom do podatkov brez odobritve).

---

## Spremembe v Task 42 (24 datotek)

**Jedro:** types.ts (PriceUnit+fromPrice, AvailabilityStatus, imageCredit, signal, skipped), registry.ts (timeoutMs, maxCallsPerMin, planned, minZoom uskladitev, GoRoute=AffiliateProvider), adapter.ts (timeout/abort dira), search.ts (cats dedupe/kap, zoom-scaled bbox, providerRateLimited, supplyResponseCacheControl), dedupe.ts (DO-NOT-MERGE + tip v ključu), osm-adapter.ts (URL validacija, wikimedia konverzija, camp_site, availability, skipped, signal), overpass.ts (AbortSignal), sanitize.ts (tip-semantika AI, fromPrice/availability/source v kontekstu, buildSelectionRecommendations), stop-insert.ts (cena z enoto/od), selection.ts (klient kap 20 + availability).

**Veriga itinererja:** itinerary-sanitize.ts (lat/lng passthrough), geo-validation.ts (lastne koordinate), itinerary/route.ts (fallback priporočila izbir).

**API:** supply/search/route.ts (signal + odvodni Cache-Control), pois/[id] (rate limit 30/min), pois/describe (kap telesa 32 KB).

**UI:** product-modal.tsx (safeExternalHref/isSafeHttpUrl slike, referrerPolicy, cena od/enota/opomba, availability badge, kredit slike, per_night/per_transfer), product-card.tsx, provider-panel.tsx + vir-podatkov (planned), itinerary-planner.tsx (mounted guard + krogotek stanja čipa), use-supply-query.ts (EMPTY_STATE).

**Testi:** nova supply-contract.test.ts (41 testov: pogodbe modela/registerja/adapterja, izolacija odpovedi, abort, rate limit, cache-control, DO-NOT-MERGE, cene, razpoložljivost, provenanca, AI semantika, SSRF) + posodobljeni supply-search.test.ts (zoom-gating števci, bbox propagacija, area po zoomu, cats dedupe, XSS/camp/wikimedia normalizacija). **258/258 testov, tsc 0 napak v src/, eslint 0.**
