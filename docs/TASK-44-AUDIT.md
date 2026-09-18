# TASK 44 — KIWI TAXI PRODUCTION HARDENING / SUPPLY ENGINE PROOF
## Končni revizijski dokument (AUDIT)

**Datum:** 18. 9. 2026 (nadaljevanje) · **Task:** 44 (spec §1–§26)
**Baseline pred taskom:** `2758798` (Task 43) → `e74f3b8` (§1–§9) → `733f512` (1.49.3, vrzel §7) → **ta revizija (§10–§26)**
**Repo:** `markec12345678/Discover-Slovenia-AI` · **Veja:** `main`

---

## 1. Executive Summary

Task 44 je bil izveden v treh fazah:

1. **§1–§9** (`e74f3b8`, 1.49.2): clean-start, OOM, dataset integrity, kanonski model,
   izolacija providerjev, viewport/zoom, clustering, semantike.
2. **1.49.3** (`733f512`): živo odkrita vrzel §7 — negativni predpomnilnik okvar OSM
   + coalescing (~19 s → ~23 ms na ponovljenih poizvedbah ob izpadu Overpassa).
3. **§10–§26** (ta revizija, 1.49.4): pogodbe o razpoložljivosti, geo semantike,
   adversarial security, redirect, AI FIXED invariante, i18n, mobilni, produkcijska
   gradnja, **živa ponovna preverba vira (§19)** z odkritjem in popravkom
   **resne vrzeli v uredniškem ingestu**.

**Verdict: GREEN** — vsi kritični gates preverjeni živo; 390/390 testov;
2 resni vrzeli odkriti IN popravljeni med auditom (sanity vrata uredniške
skripte; product=0 v /go); izvorna pogodba vira potrjena z bitno-identičnim
re-ingestom iz ŽIVEGA vira.

---

## 2. Scope & Files Audited

**Prebrani/revizirani fajli (celovito):**
- `src/lib/supply/**` — types, registry, adapter, search, zoom, dedupe,
  taxonomy, sanitize, selection, selection-persist, stop-insert, osm-adapter
- `src/lib/supply/providers/kiwitaxi/**` — types, wkt, mapper, validate,
  dataset, ingest, adapter (vseh 7)
- `src/app/api/supply/search/route.ts`, `src/app/api/cron/kiwitaxi-reingest/route.ts`
- `src/app/api/itinerary/route.ts` (applyFixedSelectedProducts, sanitize pot)
- `src/app/go/[provider]/route.ts`, `src/lib/affiliate.ts`
- `src/components/supply/**` (product-modal, product-card, provider-panel),
  `src/components/sections/map-view.tsx`, `map-section.tsx`
- `scripts/ingest-kiwitaxi.ts`, `next.config.*`, `vercel.json`, `prisma/schema.prisma`
- Vsi obstoječi testi (15 datotek) + novo `task44-hardening.test.ts`

**Scope discipline (§24):** NI novih providerjev, NI novih funkcionalnosti.
Spremembe so IZKLJUČNO utrditve obstoječega KiwiTaxi providerja.

---

## 3. Clean-Start & Produkcija

| Preverba | Rezultat |
|---|---|
| Delovno drevo na začetku | čisto na `733f512` (descendant `2758798` ✓) |
| `bun test` | **390/390** (+46 novih v tej fazi) |
| `eslint .` | **0 napak** |
| `tsc --noEmit` (src) | **0 napak** (3 predhodne izven src: skills/×2, tailwind.config.ts — niso del aplikacije) |
| Production build (`DSA_LOW_MEMORY_BUILD=1`) | **USPEŠEN** (dev začasno ustavljen v 4 GB cgroup — standardni postopek) |
| Standalone zagon (port 3001) | **OK** — dataset v bundle (2,18 MB), 136 MB skupaj |
| Lifecycle smoke (§18) | `/` 200 · `/zemljevid` 200 · `/en/zemljevid` 200 · supply search 200 (48 produktov, 14 ms) · `/go` valid 302 → kiwitaxi.com · malicious 400 · product=0 400 · unknown provider 404 · **POST /api/itinerary 200 — FIXED transfer `kiwitaxi:410` cena €77 NATANČNO enkrat v 3-dnevnem načrtu (brez dvojnika)** |
| Standalone RSS | **256 MB** (z naloženim datasetom) |
| Vercel specifika | `outputFileTracingIncludes ./data/**` ✓ (fs lazy load + tracer) · cron sreda 07:30 (`vercel.json`) ✓ · env skrivnosti NE spreminjane ✓ |

---

## 4. Revizijske sekcije (GREEN / YELLOW / RED)

### §10 Availability Contract — **GREEN**
- KiwiTaxi CSV nima real-time razpoložljivosti → `availability.status = "not_supported"`
  (dokumentirana semantika tipa: vir koncepta sploh nima — natančnejše od generičnega
  `unknown`; OBA sta ne-trditev). [types.ts:186–189]
- **»price exists → available=true« je NEMOGOČ**: source-scan — niz
  `live_available` se v celotni kiwitaxi provider kodi NE pojavi (6 fajlov);
  edini izdani status je `not_supported` (hardcoded v mapperju).
- Dataset-wide: VSAKIH 1494 realnih rut → `not_supported` (test ②).
- sanitize: cena sama NE ustvari razpoložljivosti (test ④); `not_supported`
  se v AI kontekst NE prenaša (odsoten = pošteno, test ⑤); AI kontekst
  nikoli ne izpiše žive razpoložljivosti za CSV produkt (test ⑥).
- `live_available`/`live_unavailable` smeta obstajati SAMO za bodoče žive
  adapterje z dejansko validacijo — UI badge se izriše LE za žive statuse.

### §11 Geo Semantics — **GREEN** (1 dokumentirana struktura meja)
- WKT parser: POLYGON ✓ (edini tip v viru — 29.480 krajev preverjenih živo);
  MULTI*/POINT/LINESTRING/GEOMETRYCOLLECTION zavrnjeni (iskren odklon).
- Invalid: neobdelani oklepaji ✓, 2-točkovna »geometrija« ✓, trojne vrednosti ✓,
  sumljiva ločila ✓; NaN/±Infinity/1e999/hex zavrnjeni (regex števke + isFinite);
  |lat|>90, |lng|>180 zavrnjeni; kapike 100 kB / 2.000 točk.
- **Reversed coordinates (lat-first)**: YELLOW — strukturNO nedetektabilno
  (obe vrednosti v legitinem razponu). Obramba: vir je DOKUMENTIRAN lng-first
  (živo preverjeno na 4 množicah) + dataset-wide EU sanity (test ⑥: vsi pini
  40–52°N / 8–24°E — zamaknjene/swapped bi padle ven).
- geoPrecision: KIWITAXI pin NIKOLI `exact` — vedno `city` (centroid
  prevzemnega območja; NI centroid route) — test ⑧ (fixture + dataset).
- Pin-v-bbox invariant: VSAK od 1316 pinov leži znotraj svojega fromBbox (test ⑤).
- SI sanity: slovenski prevzemi znotraj razširjene SI (test ⑦, >80 krajev).

### §12 Security Adversarial — **GREEN** (2 utrditvi dodani med auditom)
- **bookingUrl**: VEDNO naša `/go/transfers?product=\d{1,10}&from=…&dest=…`
  konstrukcija na VSEH 1494 produktih (test ① — raw provider URL nima poti
  do tega polja); nikoli absoluten/javascript:/data:.
- **sourceUrl**: VEDNO `https://kiwitaxi.com/en/…` (fiksni host, čista pot,
  brez queryja/hash) na vseh produktih (test ②).
- **Kodirani URL (NOVO)**: `%2e%2e`/`%2F%2F`/`%40`/`%3A`/`%252e`/neveljavni
  `%ZZ` so prej TIHOTAPILI charset filter → **dodana dekodirna preverba**
  (decode + isti nabor nevarnih znakov). Legitimni `%3E` (→) format vira
  nepoškodovan (1494/1494 realnih poti mineva — preverjeno).
- HTML/script-like imena: cleanName odstrani injekcijske znake (< > " ' ` { } $ \);
  ostalo besedilo je inertno (React escaping = druga plast, isti vzorec OSM).
- Dolgi vnosi: providerProductId > 80 → sanitize zavrne (10k znakov test);
  URL pot > 200 → ruta zavrnjena; ime > 80 → kapika (kraj ostane).
- Oversized CSV vrstica: WKT > 100 kB ALI > 2.000 točk → NULL (kraj brez geo,
  ne sesuje normalizacije — fail-safe).
- Malformed WKT → kraj brez geo, dataset živi.

### §13 Redirect Contract — **GREEN** (1 utrditev dodana)
- Route-level testi (`GET /go/transfers` direktno):
  - VALID → **302** `https://kiwitaxi.com/en/transfers/{id}` (brez pap —
    monetizacija NEKONFIGURIRANA, fail-closed).
  - VALID + pap env → 302 s `pap=` (monetizacija = LOČENA plast nad ENAKIMI
    podatki).
  - INVALID (javascript:, ../, URL vrednost, presledki, abc, decimala,
    11+ števk, negativno, **`0` — POPRAVLJENO**: prej je šel skozi regex) → **400**.
  - MISSING → 302 destinacijska oblika (search deep-link / slovenija stran) —
    kontrolirano, nikoli 500.
  - UNKNOWN provider → **404** (allowlist).
  - OPEN REDIRECT invariant: izhod VEDNO https + `kiwitaxi.com` (allowlist
    hostov; napadalni dest/from ne morejo vnesti svojega hosta — whitelist
    kanonizacija).
- **Monetizacija NI pogoj za podatke**: brez `KIWITAXI_PAP_ID` so realni
  podatki/ map/modal/AI živi (test ⑧); `monetized: false` je ekspliciten.
- NUMERIČNI a neobstoječi ID → partnerjeva 404 stran (pošteno; obstoj
  se ne da preveriti brez živega API-ja klica — dokumentirana meja, oblika
  ID-ja je validirana).

### §14 Add-to-Plan / AI Invariant — **GREEN**
- Cel chain živo (EN, production build): Map → ProductModal → Add to my plan →
  sessionStorage (`dai:supply-selection`: provider/providerProductId/type/
  lat/lng/price.fromPrice/selectionState=fixed) → POST /api/itinerary →
  **AI izda `kiwitaxi:410` z natanko ceno €77** v 3-dnevnem načrtu.
- Deterministične invariante (testi): destination_id = `{provider}:{providerProductId}`
  NATANČNO ✓; naslov ✓; cena (od 77 €, per_transfer) ✓; lat/lng točni ✓;
  vir izrecen ✓; sanitize ohranja identiteto nespremenjeno ✓; lažni provider
  (neveljaven slug) → ZAVRNJEN ✓ (AI ne vidi izmišljenega vira).
- AI prompt vsebuje izrecna pravila: »NE zamenjuj FIXED produkta«, transfer =
  transportna omejitev, prevoz ŽE POKRIT.

### §15 Duplicate Transfer Invariant — **GREEN**
- ISTI produkt dvakrat → drugi vstavek ZAVRNJEN (`duplicate`) — natanko
  1 pojavek v načrtu (test ②).
- VEČ izbranih transferjev → vsak NATANČNO enkrat, cene se NE mešajo (test ③).
- TRANSFER + OSM POI → oba v načrtu (test ④).
- MULTI-DAN → transfer v NAJBLIŽJEM dnevu, ne v vseh (ni razmnoževanja, test ⑧).
- AI kontekst izrecno prepoveduje odvečne prevoze za pokrito pot (test ⑤).
- Production build: AI izdal NATANČNO 1 kiwitaxi postanek (ni izmišljenega
  drugega transferja za isto pot).

### §16 Internationalization — **GREEN**
- Route struktura: `/zemljevid` (SL) + `/en/zemljevid` (EN whitelist,
  `src/i18n/routing.ts:76`) — obe 200 na PRODUCTION buildu.
- Živo EN E2E: chip »Transfers 48« ✓ · zoom hint »Zoom in for local places
  (z ≥ 10)« ✓ · popup »… → Details« ✓ · ProductModal: »Published data« /
  »from €33 per transfer« / »published price, not a live quote« /
  »Vehicle classes (published prices)« ✓ · »Add to my plan« → »Added to
  selection (AI will account for it)« ✓.
- Ni hardkodiranih slovenskih nizov v EN poti — vsi UI nizi so `{sl, en}`
  dvojice (product-modal 40+ parov, product-card, map-view).
- Degraded hint / viri: prevodi obstoječi (preverjeno §9 prejšnje faze).

### §17 Mobile — **GREEN**
- **390 px**: `/en/zemljevid` — 0 px horizontalnega preliva, footer prisoten,
  modal paše v viewport (modalFitsViewport: true), cluster → marker → popup →
  modal veriga deluje.
- **375 px**: `/zemljevid` (SL) — 0 px preliva, footer prisoten; `/` (domov) —
  0 px preliva.

### §18 Production Build — **GREEN** (glej tabelo §3)
- Build → start → zahtevek → supply search → mapa → produkt → AI → redirect:
  VSE živo preverjeno na standalone strežniku (port 3001), ne samo dev.
- Vercel: tracing (`outputFileTracingIncludes ./data/**` — dataset 2,18 MB V
  bundle) ✓ · fs dostop (lazy read-once) ✓ · server runtime (cron sreda 07:30)
  ✓ · env nedotaknjene ✓.

### §19 Real Data Source Contract — **GREEN** (1 RESNA vrzel odkrita + popravljena)
**Živa ponovna preverba vira (18. 9. 2026, 17:25 UTC) — ne predpostavka:**

| Vidik | Dejansko stanje |
|---|---|
| Source | `kiwitaxi.com/services/data/csv/{places,routes,transfer_types,transfers}` — ŽIVO dosegljiv (HTTP 200) |
| Schema | `places`: id, country_id, region_id, type_id, name_en, name_ru, name_de, name_fr, name_es, iata, place_polygon · `routes`: id, country_id, place_from_id, place_to_id, distance, timeinway, weight, url · `transfer_types`: id, name_en, …, pax, … · `transfers`: id, route_id, type_id, price_rub, price_eur, price_usd, url — **≡ Task 43 implementacija (4 glave primerjane dobesedno)** |
| Velikosti | places 62,79 MB / routes 11,85 MB / transfers 41,45 MB / transfer_types 5,7 kB — **≡ dokumentirano (~63/12/41 MB)** |
| Format | TSV, `\n`, `\t`, `\N` = NULL, glavna vrstica ✓ |
| Update mechanism | cron `/api/cron/kiwitaxi-reingest` (sreda 07:30, Vercel) — prenos → normalizacija → sanity vrata → atomarni overlay; uredniška skripta → git baseline |
| Price semantics | `price_eur` na (route × razred) — OBJAVLJENE (`payment_type=partial`), NI živi citat → `fromPrice: true`, `unit: per_transfer`, note |
| Currency | EUR (price_eur; vir ima še rub/usd) |
| Geography | place_polygon = WKT POLYGON, **lng-first** (živo preverjeno) |
| Route semantics | ruta = from-place → to-place; pin = centroid prevzemnega območja |
| Usage permissions | javni partner CSV (dokumentiran varnostni žeton, »same for everyone«) |
| Attribution | `© KiwiTaxi` (license polje produkta) |
| Cache requirements | register TTL 24 h (static); Overpass-style rate limit na viru (429) — ingest sekvencialen s pavzami |
| Booking deep-link | `/en/transfers/{transferId}` + `pap=` (dokumentiran) — prek našega `/go` |
| **Re-ingest dokaz** | **Polne CSV-jev re-ingest = BITNO IDENTIČEN baseline-u** (0 novih/odstranjenih rut, 0 sprememb cen — edina razlika `fetchedAt`) |

**RESNA VRZEL ODKRITA (in popravljena):** uredniška skripta
`scripts/ingest-kiwitaxi.ts` je zapisala git baseline IZ PRETRGANIH CSV-jev
(34 rut / 128 krajev — 97 % padec) BREZ sanity vrat (cron-overlay pot jih ima).
Pretrgani chunked prenos pusti vidno-zdravo, a odsekano datoteko.
**Popravek:** `passesKiwiSanityGate(ds, baseline)` PRED zapisom + izstop
non-zero; baseline ostane nedotaknjen. Regresijski test pokriva točen živi
scenarij (34/1494 → zavrnjeno) + source-contract test vrstnega reda.

### §20 Provider Registry — **GREEN**
- EN centralni `PROVIDER_REGISTRY` (labels/status/capabilities/goRoute/minZoom/
  TTL/timeout). `kiwitaxi` se pojavi NATANČNO enkrat.
- Dovoljeni izvenci (dokumentirana druga semantika + drift-guard test):
  `AFFILIATE_PROVIDERS` (affiliate redirect semantika — `supply-contract.test.ts`
  preverja ≡ goRoute vrednosti registra), `ADAPTER_FACTORIES` v search.ts
  (dokumentirana razširitvena točka: 1 vrstica na providerja).
- Source-scan: UI/selection/sanitize plasti NE hardcodirajo providerjev
  (preverjenih 7 fajlov — vse skozi getProvider/registry).

### §21 Test Suite — **GREEN**
390/390 (+46 v tej fazi; 317 → 390 čez cel Task 44). Novo datoteko
`task44-hardening.test.ts` pokriva: availability (6), geo/WKT/SI (9),
security adversarial (10), redirect route-level (8), FIXED/duplicate (8),
ingest regresijo (3), registry (2). Obstoječi nizi (kiwitaxi-core 30,
kiwitaxi-adapter 40, supply-* …) ostajajo zeleni.

### §22 Performance Report — izmerjeno (NIČ izmišljenega)

| Metrika | Vrednost |
|---|---|
| Dataset records (rut) | 1.494 (od 1603 SI-dotikajočih svetovnih; 110 zavrnjenih) |
| Valid records | 1.494/1.494 rut · 9614 transferjev · 308 krajev · 1316 pinov |
| Slovenia records | 992 rut odhaja IZ SI (country_id=3) · 1.603 dotika SI (from ALI to) |
| Unique products | 1.494 (0 duplikatov ID) |
| Hladen dataset load | 20,0 ms (svež proces, fs lazy) |
| Topel dataset load | 0,0008 ms |
| Viewport: Ljubljana z13 | 109 ms hladen / 10 ms topel (48 produktov) |
| Viewport: Bled z12 | 6,5 ms hladen / 9 ms topel (48) |
| Viewport: Piran z13 | 33 ms hladen / 6 ms topel (48) |
| Viewport: Slovenija-wide z10 | 8 ms hladen / 8 ms topel (48; OS degraded ~19 s plača ENKRAT na 60 s okno — 1.49.3) |
| Markers pred clustering | 48 (adapter kap) + 22 destinacijskih pinov |
| Clusters (z10, E2E brskalnik) | 3 (4+20+22) |
| Production build | USPEŠEN (DSA_LOW_MEMORY_BUILD=1) |
| Build peak memory | **NOT MEASURED** — natančen vrh ni bil izmerjen (build tekel brez /usr/bin/time); ZGORNJA MEJA dokazana: `--max-old-space-size=2560` v 4 GB cgroupa brez OOM kill (dev ustavljen med gradnjo) |
| Standalone RSS (runtime) | 256 MB |
| AI itinerer (standalone) | 18,2 s (3 dni, FIXED transfer ohranjen) |
| E2E | Živo (agent-browser): SL + EN, plasti, gruče, popup, modal, add-to-plan, mobilni 390/375 px — 0 napak strani |

---

## 5. Remaining Issues (YELLOW — dokumentirano, NI implementirano po §24)

1. **WKT reversed coordinates** — strukturNo nedetektabilno (obe vrednosti v
   razponu). Obramba: dokumentiran lng-first vir + EU sanity test. Follow-up
   možnost: statistična detekcija (99 % pinov EU → sum ob globalnem premiku).
2. **Numerični a neobstoječi product ID** → partnerjeva 404 (pošteno, a ne
   najlepše). Follow-up: validacija ID-ja proti datasetu v `/go` (danes samo
   oblika) — NI dodano, ker /go ostaja provider-agnostic po obliki.
3. **Dvojno kodirani URL** (`%252e`) ostane `%2e` po enkratni dekodiravi —
   strežniki dekodirajo enkrat (dokumentirana meja, tveganje nizko).
4. **Build peak memory** — izmeriti z `/usr/bin/time -v` pri naslednji gradnji
   (danes samo zgornja meja).

## 6. Final Verdict

**GREEN.** Supply abstraction je dokazano pripravljena za drugega realnega
providerja: kanonski model provider-agnostic (0 kršitev, forward-compat dokaz
z viator mockom §5 prejšnje faze), izolacija, fail-closed varnost, FIXED
invariante, registry kot enoten vir. Priključitev novega providerja = 1 union
slug + 1 register vnos + 1 adapter (+ 1 factory vrstica).

**Kljjučne invariante ohranjene:** fail-closed affiliate · FIXED user-selected
supply items · ločevanje LIVE DATA ≠ LIVE AVAILABILITY ≠ MONETIZATION ·
OOM fix trajen · negativni predpomnilnik okvar (1.49.3) · sanity vrata
uredniškega ingesta (1.49.4).
