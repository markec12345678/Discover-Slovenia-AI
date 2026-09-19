# TASK 52 — Full Provider Production Activation & Live Supply — REVIZIJSKO POROČILO

> **Repo:** github.com/markec12345678/Discover-Slovenia-AI
> **Baseline:** TASK 51 final `1e0ffb7` + `ab30f0c` (regresija 947/947 PASS)
> **Datum izvedbe:** 2026-09-20
> **Rezultat:** **GREEN** — matrika + dostop + varnost preverjeni, 979/979 testov, lint 0, tsc 0 (src), živi E2E dokazi (supply search / /go/ redirecti / vir-podatkov / zemljevid / mobile)

---

## 0. GLAVNI CILJ — izvedba

Cilj TASK 52 ni bil nov planner/AI/UI, temveč **produkcijska aktivacija vseh
načrtovanih providerjev z realno možnostjo integracije + iskrena klasifikacija
vseh ostalih**. Ugotovitev po popolnem inventarju (§1) in živi preverbi
uradnih dostopov (§5):

- **Že v produkciji (pred TASK 52):** OSM (živi odprti vir), slovenia.info
  (RAG ingest + cron), KiwiTaxi (objavljeni CSV inventar: 9 614 transferjev,
  48 SI rut na zemljevidu, cene v AI proračunu).
- **CODE READY, čaka IZKLJUČNO na legitimne ključe:** Viator (self-serve
  ključ po registraciji) in GetYourGuide (žeton izda partner manager). Adapterja
  sta priklopljena na `/api/supply/search` in **iskreno prazna** (`not-configured`)
  — ko ključ pride v env, živi podatki stečejo BREZ spremembe kode.
- **Ni moglo biti aktiviranih več:** `.env` instance vsebuje IZKLJUČNO
  `DATABASE_URL` — vsi affiliate ID-ji, API ključi in žetoni so MISSING.
  Po specifikaciji (§0/§19) **NIČ izmišljenih podatkov, NOBEN placeholder**:
  vsak tak provider je razvrščen v ACCESS NOT AVAILABLE / PARTNER APPROVAL
  REQUIRED / NOT CONFIGURED / BLOCKED / NOT APPLICABLE.

**Osrednji artefakti:**
1. `src/lib/supply/production-matrix.ts` — STROJNO berljiva matrika
   (življenjski cikel §0, vrsta dostopa §4, cene §16, razpoložljivost §17,
   CTA/AI, env dostop §6 SAMO PRESENT/MISSING — vrednosti ne zapustijo
   strežnika; 32 testov varuje drift z registrom).
2. `docs/PROVIDER-APPLICATIONS.md` — ČLOVEŠKO berljiva master matrika
   (popravljen dangling reference iz `registry.ts:11`!) + access matrix +
   aktivacijski runbooki (kaj točno mora pasti v env, da provider oživi).
3. `.env.example` — dopolnjen manjkajoči dokumentirani imeni
   (`OSRM_BASE_URL`, `APP_URL`, `FSQ_PLACES_DIR`).

---

## 1. POPOLN INVENTAR (§1) — izvedba

Repo-wide iskanje (registry, affiliate.ts, /go/ ruta, .env.example, docs/,
tests, fixtures, prisma, data/, package.json, TODO/FIXME, UI kategorije;
podagent "very thorough" + ročne preverbe). **Ujetih 16 vnosov registra + 4
skupine dodatnih omemb:**

| Skupina | Primeri | Zaključek za matriko |
|---|---|---|
| Affiliate OMREŽJA (gostujejo redirecte) | CJ (dpbolvw.net…), Impact (*.sjv.io…), Awin (awin1.com), ShareASale, Travelpayouts hosti (tp.media…) | ŽE dovoljeni v `/go` ALLOWED_HOSTS po partnerju; niso samostojni providerji |
| Tekmovalci (samo analiza) | TripAdvisor (starš Viatorja), Expedia, Mindtrip, Layla, Withlocals, Kimkim, Bókun… | NISO naši viri — nikoli v registru |
| Vsebinske omembe (SEO/FAQ) | FlixBus, SŽ, Airbnb | Plain-text priporočila, brez integracije |
| Dejansko uporabljeni strežniški viri | Overpass, OSRM, Open-Meteo, Wikimedia, OSM tiles, OpenRouter/Gemini/Puter/z-ai, Stripe | Izven supply registra — lastne produkcijske odvisnosti |

**Seznam naročnika §3 obdelan v celoti:** OSM ✅, KiwiTaxi ✅, Viator ✅,
GetYourGuide ✅, Booking ✅, DiscoverCars ✅, Skyscanner ✅, Airalo ✅,
Omio ✅, Tiqets ✅, World Nomads ✅, SafetyWing ✅ (+ odkriti: FSQ, STO,
own, travelpayouts). Noben provider iz repota ni izpuščen (testovno
varovano: §3 pokritost registra ↔ matrika).

**Popravljeni dangling references:** `docs/PROVIDER-APPLICATIONS.md`
(registry.ts:11 je referenciral neobstoječo datoteko — ZDAJ obstaja);
`indexnow-ping.sh` (izven obsega TASK 52 — ni provider; ostaja kot znana
napaka dokumentacije, ni kode).

---

## 2. MASTER PROVIDER MATRIX (§2) — vsebina

Glej `docs/PROVIDER-APPLICATIONS.md` (človeška) +
`production-matrix.ts` (strojna). Povzetek stanja:

| Stopnja (§0) | Providerji |
|---|---|
| **PRODUCTION ACTIVE** | osm (OPEN DATA), sto (STATIC CONTENT/RAG), kiwitaxi (STATIC CONTENT/CSV) |
| CODE READY | viator (NOT_CONFIGURED — ključ self-serve manjka), getyourguide (PARTNER_APPROVAL_REQUIRED — žeton NI self-serve), own (geo plasti še ni) |
| CONTRACT VERIFIED | tiqets, booking, discovercars, skyscanner, omio, airalo (PARTNER_APPROVAL_REQUIRED), worldnomads + safetywing (NOT_APPLICABLE — vir brez API-ja), booking |
| DISCOVERED | fsq (ACCESS_NOT_AVAILABLE — množica ni ingestirana), travelpayouts (NOT_CONFIGURED — ni računa) |

Vsak vnos nosi: kategorijo (§7–§11), vrsto dostopa (§4), stopnjo (§0),
blokirni razlog, klasifikacijo cene (§16) in razpoložljivosti (§17),
CTA način, AI integracijo, uradni vir (docsUrl) + iskreno opombo.

**Statusi so IZKLJUČNO iz dovoljenega nabora** (ACTIVE/CODE READY/
ACCESS NOT CONFIGURED/PARTNER APPROVAL REQUIRED/CONTRACT VERIFIED/
BLOCKED/NOT APPLICABLE).

---

## 3. VRSTA DOSTOPA (§4) — klasifikacija

LIVE_INVENTORY_API / SEARCH_API / STATIC_CONTENT / PARTNER_FEED /
AFFILIATE_DEEP_LINK / API_BOOKING / DIRECT_BOOKING / OPEN_DATA — vsak
provider točno ena. **Ključne iskrenosti:**
- Viator/GYG: `accessKind = AFFILIATE_DEEP_LINK` (danes), adapter CODE READY
  — affiliate povezava NIKOLI ni live inventory (testovno varovano).
- Booking: affiliate povezava NI hotelski inventory (§8) — brez fake sob.
- Skyscanner/Omio: affiliate iskanje NI letalski/javnoprometni inventory (§10).
- WN/SW: affiliate ponudba NI živi quote (§11) — „preveri pri ponudniku".
- OSM: OPEN_DATA, `info_only`, NIKOLI affiliate (testovno varovano — §12).

---

## 4. URADNI DOSTOP (§5) — živi dokazi 2026-09-19

Web-search skill je bil nedosegljiv (z-ai 429 — dokumentirano kot omejitev
okolja). Namesto tega NEPOSREDNA živa preverba uradnih virov (curl):

| Vir | Rezultat |
|---|---|
| docs.viator.com/partner-api/technical/ | **200** (dokumentacija živa) |
| api.viator.com/partner/v1/products (brez/neveljaven ključ) | overitvena vrata ŽIVA: `INVALID_HEADER_VALUE`/401 — brez ključa NI podatkov |
| api.getyourguide.com/1/tours (s parametri, brez žetona) | **„The X-ACCESS-TOKEN header is missing"** — vrata živa, žetona ni |
| developers.booking.com/demand/docs | 200 |
| developers.tiqets.dev / developers.skyscanner.net / developers.partners.airalo.com | 200 / 200 / 200 |
| partner.worldnomads.com / safetywing.com/ambassador / discovercars.com/affiliate | 200 / 200 / 200 |
| www.omio.com/affiliate | 403 (bot-zaščita; stran obstaja) |
| kiwitaxi.com/services/data/csv | 404/429 s tega IP — NI relevantno: dataset je v repotu (ingest 2026-09-18) + tedenski cron |

Sklep: pogodbe/zahteve dostopa iz TASK 45/46 (živo preverjene 2026-09-18)
so POTRJENE tudi danes. **Vsak API, ki bi lahko tekel, zahteva poverilnice,
ki jih ta nima — aktivacija brez ključev je nemogoča in se iskreno ne laže.**

---

## 5. ACCESS MATRIX (§6) — brez skrivnosti

`.env` instance: SAMO `DATABASE_URL`. Vsa ostala imena: **MISSING**.
Strojno dostopna prek `accessMatrix()` — vsak odgovor IZKLJUČNO
`{envVar, present: boolean}`. **Leak test** (testovno varovan): z vsemi
env vrednostmi nastavljenimi na `SKRIVNOST-T52-xyz` JSON izpis matrike
vrednosti NE vsebuje. Semantika presence (usklajena z affiliate.ts):
ID/ključ → ne-prazno po trimu; `_URL` → VELJAVEN https; `_BASE`/`_DIR`
NISTA credential (samo base/dir brez ključa ≠ konfiguriran provider).

---

## 6. KATEGORIJE (§7–§11) — izvedba

- **A (activities):** Viator + GYG = CODE READY (adapter + kanonski model +
  AI kontekst + product deep-link varen); Tiqets = PARTNER APPROVAL REQUIRED
  (Distributor API po prijavi). Iskrenost: sloja sta priključena in PRAZNA.
- **B (accommodation):** Booking — affiliate globoka povezava ONLY (Demand
  API zahteva Managed Affiliate Partner). **NI fake inventoryja** (§8).
- **C (transport):** KiwiTaxi = PRODUCTION ACTIVE (CSV); DiscoverCars =
  BLOCKED (B4B); Omio = PARTNER APPROVAL REQUIRED.
- **D (flights):** Skyscanner = PARTNER APPROVAL REQUIRED; affiliate
  iskanje NI označeno kot live inventory (§10).
- **E (insurance/connectivity):** WN/SW brez API-ja (NOT_APPLICABLE — samo
  affiliate ponudba); Airalo PARTNER APPROVAL REQUIRED. Kategorije NE
  pomešane (product catalog ≠ affiliate offer ≠ live quote ≠ live
  availability) — klasifikacije ločene v matriki.

---

## 7. OSM AUDIT (§12)

- Overpass: glavni API + kumi mirror failover, retry ×3, časovni budget,
  preklic odjemalca (signal) — `src/lib/overpass.ts` ✅
- Cache: TTL 10 min (register), LRU 60, praznine po napakah SE NE cachajo ✅
- Rate limit: registry `maxCallsPerMin: 60` (globalna instanca) +
  per-IP 30/min ✅
- Map display: OSM tiles + **atribucija `© OpenStreetMap`** (link na
  copyright) na vseh zemljevidih (trip-map-panel, chat-mini-map) ✅
- Category filtering: kanonska taksonomija → OSM filtri (TAXONOMY) ✅
- Geo precision: OSM node = `exact` ✅
- Licenca: `license: {source: "OpenStreetMap", attribution: "© OpenStreetMap"}`
  na produktih; ODbL ✅
- OSM NIKOLI affiliate: `group: local`, brez goRoute, cta `info_only`
  (testovno varovano) ✅

---

## 8. KANONSKI MODEL + ADAPTERJI (§13/§14)

- ProviderProduct ostaja provider-agnostic (0 provider-specifičnih polj —
  nov test: vnosi matrike vsebujejo SAMO kanonska polja). Ni
  `viatorPrice`/`bookingPrice`/`gygPrice`.
- Arhitektura: External Provider → Adapter → ProviderProduct →
  ProviderRegistry → Supply Search → UI/AI — potrjena (4 priklopljeni
  adapterji: osm, kiwitaxi, viator, getyourguide; provider logika ŽE
  izključno v `providers/*/adapter|client|mapper|types`).
- Production-matrix je NASTAVLJEN na register (envKeys izpeljani iz
  registra — en vir resnice; drift guard test za affiliateStatus() ↔
  registry envKeys).

---

## 9. FAIL-CLOSED (§15) — dokazi

| Način | Dokaz |
|---|---|
| API missing | viator/gyg adapterja: `[]` + `not-configured` (živi E2E: `adapter viator: ok=True count=0 note=not-configured`) |
| API invalid | 401/INVALID_HEADER_VALUE živi dokaz + negativni predpomnilnik okvar (60 s) |
| auth failure | enako kot invalid (capability gate) |
| timeout | adapter timeoutMs (runner izvede diro; OSM 50 s budget) |
| 429 | Viator/GYG negativni cache (60 s/310 s) + graceful degradation (`degraded[]`, OSM ostane) |
| malformed | filterValidSummaries / parseInt10 meje / parseFloatBounded (cena 0.01–MAX) |

**NIKOLI fallback fake provider produkt** — 0 izmišljenih vrstic (živi
odziv supply/search: samo 48 realnih KT produktov).

## 10. CENE (§16) in RAZPOLOŽLJIVOST (§17)

- LIVE_PRICE: **NIHČE** (nima živega cenovnega API-ja priključenega) —
  iskren assertion v testih.
- FROM_PRICE: kiwitaxi (objavljene cene, `note: "objavljena cena, ni živi
  citat"`, unit `per_transfer`, fromPrice:true — živi dokaz v odzivu),
  viator/gyg (semantika prihodnje plasti), own (lastne cene).
- Affiliate-only: NOT_SUPPORTED (povezava NI dokaz cene — §16).
- Razpoložljivost: KT = NOT_SUPPORTED („preveri pri ponudniku"), OSM =
  NOT_SUPPORTED, viator/gyg = UNKNOWN (concept, nad tierjem) — NIKOLI
  „available" brez dokaza.

---

## 11. CTA / REDIRECT VARNOST (§18) — živi dokazi (15/15)

| # | Primer | Rezultat |
|---|---|---|
| 1 | `/go/transfers?product=408` | 302 → `kiwitaxi.com/en/transfers/408` (čisto, brez pap — NOT CONFIGURED iskren) |
| 2 | `/go/transfers?from=Ljubljana&dest=Bled` | 302 → uradni iskalni deep-link |
| 3 | `product=408<script>` | **400** (validator števk) |
| 4 | `viator?product=../../evil` | **400** |
| 5 | `/go/neznan-provider` | **404** (allowlist) |
| 6 | `/go/hotels?dest=Bled` | 302 → booking.com searchresults BREZ aid (monetized:false) |
| 7 | `/go/insurance` | 302 → worldnomads.com/travel-insurance (čist fallback) |
| 8 | `/go/esim` | 302 → airalo.com (čist) |
| 9 | `/go/flights?dest=Bled` | 302 → skyscanner BREZ mediaPartnerId |
| 10 | `dest=javascript:alert(1)` | 302 → whitelist fallback `ss=Slovenija` (raw vnos NIKOLI v URL) |
| 11 | dvojno kodiranje `%252e%252e%252f` | **400** |
| 12 | `dest=data:text/html,evil` | 302 → kanonični fallback (Slovenija) |
| 13 | dest 150 znakov | **400** (meja 100) |
| 14 | ne-https env URL | unit testi (affiliate.test.ts: http/smét → fail-closed) |
| 15 | izhodni host izven ALLOWED_HOSTS | 500 (zadnja varovalka; unit testi) |

## 12. AFFILIATE AKTIVACIJA (§19)

- **Dejanskih affiliate ID-jev NI** (env MISSING) → vsi statusi
  NOT CONFIGURED; povezave vodijo na ČISTE partnerske strani
  (`monetized: false` v analitiki — nikoli „affiliate-looking" laž).
- **NI placeholderjev** (npr. „1234567" je bil odstranjen že v affiliate
  hardeningu — potrjeno v affiliate.test.ts „brez slovenia-demo").
- Ko ID pade v env: link builder (affiliate.ts) → `/go/[provider]` →
  redirect SAMO na dovoljene hoste — **brez spremembe kode** (runbooki v
  docs/PROVIDER-APPLICATIONS.md §4).

---

## 13. TESTI + REGRESIJA + ŽIVA E2E

- **Novih testov: 32** (`task52-production-matrix.test.ts`) — pokritost
  registra ↔ matrika (§3), življenjski cikel + blokirni razlogi (§0), vrste
  dostopa (§4), kategorije (§7–§11), cene/razpoložljivost (§16/§17), env
  dostop + LEAK test (§6), usklajenost affiliateStatus ↔ accessMatrix +
  drift guard env imen (§19), kanonska polja (§13).
- **Regresija: 979/979 PASS** (947 baznih + 32 novih), lint 0, tsc 0 (src).
- **Živi E2E (agent-browser + curl):**
  - `/` stran: 200, 0 napak, 0 console error; naslov pravilen.
  - `/vir-podatkov`: 200 — iskreni statusi („Povezava partnerja",
    „Objavljeni podatki partnerja (CSV ingest)…").
  - Zemljevid: Pokaži POI + Transferji → **48 KiwiTaxi produktov**
    (živi dokaz: `GET /api/supply/search` 200; čip „Transferji | 48";
    oznaka „48 POI · KiwiTaxi"; grozd 46+2 pinov; screenshot
    `.zscripts/e2e/t52-map-48kt.png`).
  - Supply API: `adapter viator: ok=True count=0 note=not-configured`,
    `adapter getyourguide: ok=True count=0 note=not-configured` —
    iskreni capability gates v živo.
  - Mobilni 375px: 0 horizontal overflow, 0 napak.

## 14. OMEJITVE OKOLJA (iskrene)

- z-ai web-search 429 (3 poskusi) → uradni viri preverjeni NEPOSREDNO
  (curl na portale + API overitvena vrata) — zadosten dokaz za odločitve.
- Affiliate ID/API ključi fizično manjkajo → „activation" = dokazljivo
  pripravljen runbook + fail-closed obnašanje (nikoli lažni live).
- `indexnow-ping.sh` dangling (SEO pripomoček, ni provider) — znan
  dokumentacijski dolg, izven obsega.
- Glede prispevka TASK 51: potrjena celota (947/947 pred novimi testi;
  končno poročilo TASK-51-GEOGRAPHIC-ITINERARY.md §29/§30 GREEN) — NIČ
  manjkalo, TASK 52 gradi na zelenem bazenu.

## 15. SLEDEČI KORAKI (izven obsega — odkrito)

1. Ko pade `VIATOR_API_KEY` v env → takojšen živi E2E nove plasti
   (destId → produkti → cene fromPrice → productUrl deep-link).
2. `GETYOURGUIDE_API_TOKEN` (po partner odobritvi) → enako.
3. Affiliate ID-ji po prijavah → `bun run verify:affiliate` nad živimi
   redirecti (skript obstaja: `scripts/verify/affiliate-redirects.sh`).
4. FSQ ingest slovenske podmnožice (F2) → nov lokalni sloj.
