# MASTER PROVIDER MATRIX — produkcijska aktivacija ponudnikov

> **Namen:** en vir resnice o stanju VSIH supply providerjev projekta —
> odkritje, pogodba, dostop, koda, produkcija, živi podatki, cene,
> razpoložljivost, CTA in AI integracija. Strojno berljiva različica (ena
> resnica skupaj s tem listom): `src/lib/supply/production-matrix.ts`
> (testovno varovana: `task52-production-matrix.test.ts`).
>
> **Veriga življenjskega cikla (naročnik §0):**
> DISCOVERED → CONTRACT VERIFIED → ACCESS AVAILABLE → CODE READY →
> PRODUCTION CONFIGURED → LIVE DATA VERIFIED → PRICE VERIFIED →
> AVAILABILITY STATUS VERIFIED → CTA / BOOKING VERIFIED →
> AI INTEGRATION VERIFIED → **PRODUCTION ACTIVE**
>
> **Iskrenostna pravila:** provider brez legitimnega dostopa NIKOLI ne
> preseže dokazane stopnje. Affiliate globoka povezava NI inventar.
> `fromPrice` NI potrjena cena. Neuganjena razpoložljivost ostaja
> UNKNOWN / „preveri pri ponudniku" — NIKOLI „available".

Datum zadnje žive preverbe: **2026-09-19** (TASK 52 §5 — portali + API
overitvena vrata prek curl; podrobnosti v docs/TASK-52-PROVIDER-ACTIVATION.md).
Prejšnje žive preverbe pogodb: 2026-09-18 (TASK 45 Viator, TASK 46 GYG).

---

## 1. MASTER MATRIX (vseh 16 vnosov registra)

| Provider | Kategorija | Adapter | Pogodba | Vrsta dostopa (dejanska) | Access | Production | Live verified | Price | Availability | CTA/Booking | AI | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **OSM** | Lokalni (odprti) | ✅ `osm-adapter.ts` | ODbL (odprta) | OPEN DATA | brez ključa | ✅ AKTIVEN | ✅ žive Overpass poizvedbe | NOT SUPPORTED | NOT SUPPORTED | info_only | ✅ | **ACTIVE** |
| **Foursquare Open Places** | Lokalni (odprti) | ❌ ni datoteke | Apache-2.0 | OPEN DATA (množica NI nameščena) | MISSING (`FSQ_PLACES_DIR`) | ❌ | ❌ | NOT SUPPORTED | NOT SUPPORTED | info_only | ❌ | **ACCESS NOT AVAILABLE** |
| **slovenia.info (STO)** | Lokalni (vsebina) | ingest + RAG (ni sloj zemljevida) | llms.txt (uradna vsebina) | STATIC CONTENT | brez ključa | ✅ (RAG vir) | ✅ ingest 2026-09-17 + tedenski cron | NOT SUPPORTED | NOT SUPPORTED | info_only | ✅ (RAG) | **ACTIVE** (ne-sloj) |
| **Lastna tržnica (own)** | Own | DB + Stripe | lastna | DIRECT BOOKING (geo še manjka) | — | ❌ (brez geo plasti) | ❌ | FROM_PRICE (lastne cene) | UNKNOWN | own_checkout | ❌ | **CODE READY** |
| **Viator** | A — activities | ✅ `providers/viator/*` | ✅ živo preverjena | AFFILIATE DEEP LINK (API danes NE dostopen) | API key MISSING | ❌ (iskreno prazen sloj) | ❌ (vrata živa: 401 brez ključa) | FROM PRICE (ko bo aktiven) | UNKNOWN (nad Basic tierjem) | affiliate_redirect | ✅ priklopljen | **CODE READY / NOT CONFIGURED** |
| **GetYourGuide** | A — activities | ✅ `providers/getyourguide/*` | ✅ živo preverjena | AFFILIATE DEEP LINK (API danes NE dostopen) | API token MISSING (NI self-serve) | ❌ (iskreno prazen sloj) | ❌ (vrata živa: „X-ACCESS-TOKEN missing") | FROM PRICE (ko bo aktiven) | UNKNOWN | affiliate_redirect | ✅ priklopljen | **CODE READY / PARTNER APPROVAL REQUIRED** |
| **Tiqets** | A — activities | ❌ | ✅ (portal živ) | AFFILIATE DEEP LINK | affiliate URL MISSING; API po odobritvi | ❌ | ❌ | NOT SUPPORTED | NOT SUPPORTED | affiliate_redirect | ❌ | **PARTNER APPROVAL REQUIRED** |
| **Booking.com** | B — accommodation | ❌ | ✅ (docs živi) | AFFILIATE DEEP LINK | affiliate ID MISSING; Demand API zahteva Managed Affiliate Partner | ❌ | ❌ | NOT SUPPORTED | NOT SUPPORTED | affiliate_redirect | ❌ | **PARTNER APPROVAL REQUIRED** |
| **KiwiTaxi** | C — transport | ✅ `providers/kiwitaxi/*` | ✅ (objavljeni partner podatki) | STATIC CONTENT (CSV feed) + affiliate | PAP ID MISSING (monetizacija) | ✅ **INVENTAR AKTIVEN** | ✅ CSV ingest 2026-09-18 (9 614 transferjev; tedenski cron) | FROM PRICE (objavljene, niso živi citat) | NOT SUPPORTED („preveri pri ponudniku") | affiliate_redirect | ✅ | **ACTIVE** (inventar) |
| **DiscoverCars** | C — transport | ❌ | ✅ (portal živ) | AFFILIATE DEEP LINK | affiliate code MISSING; Search API le B4B | ❌ | ❌ | NOT SUPPORTED | NOT SUPPORTED | affiliate_redirect | ❌ | **BLOCKED** (B4B) |
| **Omio** | C — transport | ❌ | ✅ (portal živ) | AFFILIATE DEEP LINK | affiliate URL MISSING (format po odobritvi) | ❌ | ❌ | NOT SUPPORTED | NOT SUPPORTED | affiliate_redirect | ❌ | **PARTNER APPROVAL REQUIRED** |
| **Skyscanner** | D — flights | ❌ | ✅ (portal živ) | AFFILIATE DEEP LINK | mediaPartnerId MISSING; Travel API „za uveljavljena podjetja" | ❌ | ❌ | NOT SUPPORTED | NOT SUPPORTED | affiliate_redirect | ❌ | **PARTNER APPROVAL REQUIRED** |
| **Airalo** | E — eSIM | ❌ | ✅ (portal živ) | AFFILIATE DEEP LINK | affiliate URL MISSING; Partner API po odobritvi | ❌ | ❌ | NOT SUPPORTED | NOT SUPPORTED | affiliate_redirect | ❌ | **PARTNER APPROVAL REQUIRED** |
| **World Nomads** | E — insurance | ❌ | ✅ (portal živ) | AFFILIATE DEEP LINK (CJ) | affiliate URL MISSING | ❌ | ❌ | NOT SUPPORTED (brez API-ja — plačilo po quote) | NOT SUPPORTED | affiliate_redirect | ❌ | **NOT APPLICABLE** (API) |
| **SafetyWing** | E — insurance | ❌ | ✅ (portal živ) | AFFILIATE DEEP LINK (Ambassador) | ambassador ID MISSING | ❌ | ❌ | NOT SUPPORTED (brez javnega API) | NOT SUPPORTED | affiliate_redirect | ❌ | **NOT APPLICABLE** (API) |
| **Travelpayouts** | Infra/vir | ❌ | ✅ (docs živi) | SEARCH API (self-serve, bodoče) | marker/token MISSING (ni računa) | ❌ | ❌ | UNKNOWN | UNKNOWN | affiliate_redirect (hosti že dovoljeni v /go) | ❌ | **NOT CONFIGURED** |

**Povzetek (productionSummary):** 16 vnosov · **3 PRODUCTION ACTIVE**
(osm, sto, kiwitaxi) · 2 CODE READY (viator, getyourguide — adapterja
priključena, iskreno prazna do ključev) · 1 CODE READY (own — geo manjka)
· 2 DISCOVERED (fsq, travelpayouts) · 8 CONTRACT VERIFIED (affiliate-only,
blokirani na dostopu).

---

## 2. ACCESS MATRIX (§6 — samo PRESENT/MISSING, NIKOLI vrednosti)

> Strežniško stanje TE instance (2026-09-19): `.env` vsebuje IZKLJUČNO
> `DATABASE_URL`. **VSI** affiliate ID-ji, API ključi in žetoni so MISSING.
> Posledica (fail-closed po zasnovi): vsak `/go/*` redirect vodi na ČISTO
> partnersko stran (`monetized: false` — brez lažnega sledenja), Viator/GYG
> supply sloja sta iskreno prazna (`[]` + „not-configured"), KiwiTaxi inventar
> teče (dataset v repotu, monetizacija CTA pa čaka na `KIWITAXI_PAP_ID`).

| Provider | API key | Partner ID | Affiliate ID/URL | OAuth | Production access | Sandbox |
|---|---|---|---|---|---|---|
| osm | — | — | — | — | DA (odprti vir) | — |
| fsq | `FSQ_PLACES_DIR` MISSING (datoteka) | — | — | — | NE (množica ni ingestirana) | — |
| sto | — | — | — | — | DA (llms.txt) | — |
| own | — | — | — | — | DA (lastna DB/Stripe) | — |
| booking | — | — | `BOOKING_AFFILIATE_ID` MISSING | NE | NE (čaka Managed Affiliate Partner) | NE |
| viator | `VIATOR_API_KEY` MISSING | — | `VIATOR_AFFILIATE_URL` MISSING | NE | NE (self-serve po registraciji) | DA (javna; brez ključa = 401) |
| getyourguide | `GETYOURGUIDE_API_TOKEN` MISSING | `GETYOURGUIDE_PARTNER_ID` MISSING | — | NE | NE (žeton izda partner manager) | DA (`api.gygtest.net`, žetona ni) |
| tiqets | — | — | `TIQETS_AFFILIATE_URL` MISSING | NE | NE (Distributor API po prijavi) | NE |
| kiwitaxi | — (CSV feed) | — | `KIWITAXI_PAP_ID` MISSING | — | DELNO: inventar DA (dataset), monetizacija NE | — |
| discovercars | — | — | `DISCOVERCARS_AFFILIATE_CODE` MISSING | NE | NE (Search API = B4B pogodba) | NE |
| skyscanner | — | — | `SKYSCANNER_MEDIA_PARTNER_ID` MISSING | NE | NE (Travel API za uveljavljena podjetja) | NE |
| omio | — | — | `OMIO_AFFILIATE_URL` MISSING | NE | NE (iskalni API po prijavi; brez lat/lng) | NE |
| airalo | — | — | `AIRALO_AFFILIATE_URL` MISSING | NE | NE (Partner API po odobritvi) | NE |
| worldnomads | — | — | `WORLDNOMADS_AFFILIATE_URL` MISSING | NE | NE (brez API-ja — CJ affiliate) | — |
| safetywing | — | — | `SAFETYWING_AMBASSADOR_ID` MISSING | NE | NE (brez javnega API-ja) | — |
| travelpayouts | marker/token MISSING | marker MISSING | — | NE | NE (self-serve, ni računa) | — |

Dodatni strežniški viri (izven supply registra, a produkcijsko odvisni):
`OSRM_BASE_URL` (router.project-osrm.org privzeto), `APP_URL`, AI veriga
(`OPENROUTER_API_KEY`/`GEMINI_API_KEY`/`PUTER_AUTH_TOKEN`/z-ai) — stanje v
`.env.example`.

---

## 3. ZAKAJ NI LAŽNEGA „LIVE" (§4 — vrste dostopa nikoli pomešane)

- **Viator/GetYourGuide:** pogodba preverjena + adapter + kanonski model SO
  pripravljeni; API ključ/žeton pa NISTA izdana. Sloj je priklopljen na
  `/api/supply/search` in ob vsakem klicu **iskreno prazen** (`note:
  "not-configured"`). Affiliate URL se NE predstavlja kot inventar.
- **Booking:** povezava `/go/hotels` NI hotelska razpoložljivost. Brez
  Demand API dostopa NE ustvarjamo sob/cen/availability.
- **Skyscanner/Omio/DiscoverCars/Tiqets/Airalo:** affiliate iskanje NI
  letalski/javnoprometni/najemni/vstopniški/eSIM inventar.
- **World Nomads/SafetyWing:** affiliate ponudba NI živi quote — UI
  izpiše „preveri pri ponudniku".
- **Travelpayouts:** omrežne gostitelje imamo dovoljene v `/go`, a brez
  računa NE prikazujemo nobene povezave kot partnerjevo.

## 4. AKTIVACIJSKI RUNBOOKI (kaj točno mora pasti v env)

| Provider | Korak 1 | Korak 2 (env) | Učinek brez spremembe kode |
|---|---|---|---|
| Viator | partnerresources.viator.com → račun → Tools → Affiliate API | `VIATOR_API_KEY` (+ po želji `VIATOR_API_BASE`) | živi produkti + cene na sloju, productUrl deep-link |
| GetYourGuide | partner.getyourguide.com prijava → partner manager izda žeton | `GETYOURGUIDE_API_TOKEN` (+ `GETYOURGUIDE_PARTNER_ID`) | živi produkti + Option 1 booking povezave |
| KiwiTaxi (monetizacija) | partner račun → PAP ID | `KIWITAXI_PAP_ID` | vsak `/go/transfers` postane monetiziran (`pap`) |
| Booking | partnerhub prijava (aid) | `BOOKING_AFFILIATE_ID` | `/go/hotels` monetiziran; (Demand API ločen korak Managed status) |
| DiscoverCars | affiliate prijava → a_aid | `DISCOVERCARS_AFFILIATE_CODE` | `/go/cars` monetiziran |
| Skyscanner | Impact račun → mediaPartnerId | `SKYSCANNER_MEDIA_PARTNER_ID` | `/go/flights` monetiziran |
| Omio | program → tracking URL | `OMIO_AFFILIATE_URL` (cel https URL) | `/go/transport` monetiziran |
| Tiqets | Awin → cread.php URL | `TIQETS_AFFILIATE_URL` | `/go/tickets` monetiziran |
| Airalo | Impact/TP → URL | `AIRALO_AFFILIATE_URL` | `/go/esim` monetiziran |
| World Nomads | CJ dashboard → URL | `WORLDNOMADS_AFFILIATE_URL` | `/go/insurance` monetiziran (WN prednost) |
| SafetyWing | Ambassador program | `SAFETYWING_AMBASSADOR_ID` | `/go/insurance` monetiziran (če WN manjka) |
| Foursquare | download SI podmnožice | `FSQ_PLACES_DIR` + adapter (F2) | nov lokalni sloj (zahteva adapter) |
| Travelpayouts | račun → marker/token | marker env + adapter (F2) | nov search vir (zahteva adapter) |

---

## 5. ZGODOVINA NAŠTETIH (a NE aktiviranih) — zakaj manjkajo iz matrike

Izključno kot kontekst (ne načrtovani supply): TripAdvisor (starš Viatorja —
recenzije pridejo POSREDNO prek Viator API odgovorov), Expedia/Hotels.com/
Agoda/Sabre (kontingentna omrežja iz RISK-REGISTER), CJ/Impact/Awin/
ShareASale/Travelpayouts-hosti (OMREŽJA, gostujejo obstoječe redirecte —
že dovoljeni v `/go` allowlisti), Withlocals/Kimkim/Bókun/Mindtrip/Layla
(tekmovalci — samo konkurenčna analiza). Noben od teh ni v registru in
NIKOLI ne bo prikazan kot naš vir.

---

*Vzdrževanje: ta list se posodablja ob vsaki spremembi registra/adapterjev
(commit TASK 52+). Strojno stanje (env PRESENT/MISSING) je živo dostopno
prek `accessMatrix()`; matrika in register se preverjata za drift v testih.*
