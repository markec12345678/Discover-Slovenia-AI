# TASK 53 — ALL PROVIDERS READY WITHOUT API KEYS (1.58.0)

**Datum:** 2026-09-20 · **Baseline:** TASK 47–52 GREEN (1004/1004 @ 1.57.2) · **Končno stanje:** 1196/1196 PASS, lint 0, tsc 0 (src)

**Cilj (naročnik §1):** VSI providerji dosežejo NAJVEČJO možno produkcijsko pripravljenost **BREZ API ključev, tokenov ali skrivnosti**. Ne iščemo ključev v repotu, ne ustvarjamo placeholder skrivnosti, ne zahtevamo vnosov od uporabnika. Prihodnja aktivacija = **SAMO env vnos** (TASK 54).

**Glavna načela (PONARJENA v tej tabeli — vsaka vrstica ima test):**

| Načelo | Izvedba |
|---|---|
| Brez poverilnic → `NOT CONFIGURED` | capability gate v vsakem adapterju → `[]` + opomba, 0 klicev na vir |
| Affiliate/deep-link brez API → `AFFILIATE READY` | /go redirect CTA deluje DANES (brez trackinga = iskreno) |
| Partner odobritev → `PARTNER ACCESS REQUIRED` | production-matrix blockedReason + UI status |
| NIKOLI fake inventar | NO-FAKE invarianta test §20③ + mapper strict skip+count |
| NIKOLI fake cena (0) | cena samo numerična > 0 + izrecna valuta; sicer IZPUŠČENA |
| NIKOLI fake razpoložljivost | `unknown` brez dokaza; affiliate URL ≠ razpoložljivost |

---

## A. Baseline

- **TASK 47** (supply-aware AI, FIXED, prioritete): GREEN — `3ed963ca`, 745/745.
- **TASK 48–51** (itinerary realism, schedule slots, geografska koherenca): GREEN — `ab30f0c`, 947/947.
- **TASK 52** (production matrix, dostopi, statusi UI): GREEN — `81e28f6`, 1004/1004.
- **TASK 53 začetno stanje:** 5 adapterjev (osm/kiwitaxi/viator/gyg + sto RAG), 11 providerjev brez adapterja.
- **Končno stanje TASK 53:** 10 adapterjev + STO RAG; 1196/1196 PASS (192 novih testov TASK 53); lint 0; tsc 0 (src — edina znana pre-existing napaka zunaj obsega: `tailwind.config.ts` modul `tailwindcss-animate`, dokumentirana že v TASK 45/52).

## B. Complete Provider Inventory (16 — noben tiho izpuščen)

| # | Provider | Kategorija | Razlog stanja (iskren) |
|---|---|---|---|
| 1 | **osm** | LOCAL_OPEN_DATA | žive Overpass poizvedbe — LAHKO |
| 2 | **kiwitaxi** | C_TRANSPORT | CSV dataset (1494 rut, 48 SI v view) — LAHKO |
| 3 | **sto** | LOCAL_OPEN_DATA | RAG vir (llms.txt 664 zapisov + freshness overlay) — LAHKO |
| 4 | **viator** | A_ACTIVITIES | javna pogodba; ključ manjka (partner api) |
| 5 | **getyourguide** | A_ACTIVITIES | javna pogodba; žeton manjka (partner manager) |
| 6 | **tiqets** | A_ACTIVITIES | vrata ŽIVO preverjena (401 sondo); ključ manjka (Awin/portal) |
| 7 | **booking** | B_ACCOMMODATION | javna dokumentacija Demand API v3; ključ + status Managed Affiliate Partner manjkata |
| 8 | **skyscanner** | D_FLIGHTS | javna dokumentacija Live Prices v3; ključ manjka (partners portal) |
| 9 | **airalo** | E_INSURANCE_CONNECTIVITY | sandbox vrata ŽIVO (200 pravi JSON); OAuth2 ID+SECRET manjkata |
| 10 | **travelpayouts** | INFRASTRUCTURE | javna Data API; token manjka (self-serve) |
| 11 | **fsq** | LOCAL_OPEN_DATA | Open Places shema javna; GATED množica na HuggingFace še ni nameščena |
| 12 | **discovercars** | C_TRANSPORT | BREZ javnega API (B4B) — affiliate-only ZA VEDNO |
| 13 | **omio** | C_TRANSPORT | BREZ javnega API — affiliate-only ZA VEDNO |
| 14 | **worldnomads** | E_INSURANCE_CONNECTIVITY | brez inventarskega API — affiliate-only |
| 15 | **safetywing** | E_INSURANCE_CONNECTIVITY | brez inventarskega API — affiliate-only |
| 16 | **own** | OWN_MARKETPLACE | tržnica teče (DB/listingi); geo polja + supply sloj = bodoča produktna faza (NE credential aktivacija) |

## C. Provider Architecture (§5)

```
External Provider (API/dataset/affiliate)
      → Provider Adapter (src/lib/supply/providers/<slug>/)
          client.ts   — pogodba vira + klasifikacija napak (401/403/429/timeout/malformed)
          mapper.ts   — STRICT fail-closed preslikava → kanonski ProviderProduct
          adapter.ts  — capability gate + cache + coalescing + telemetrija
          types.ts    — pogodbene vrste vira (LIVE-VERIFIED / DOCUMENTED-ASSUMPTION)
      → ProviderRegistry (registry.ts — EN centralni imenik)
      → searchSupply() (search.ts — Promise.allSettled izolacija)
      → dedupe → zoom gating → cap
      → map/ProductModal → AI kontekst → FIXED → /go CTA
```

- Provider-specifična logika ŽIVI SAMO v adapter mapi (§19 izolacija).
- Kanonski model `ProviderProduct` ostaja provider-agnostic (§7 — testovno varovano: §8/§9/§10 ② matrika nima provider-specific polj).
- `ADAPTER_FACTORIES` v `search.ts`: 10 tovarn; adapterji brez svojega vira se pošteno izpraznijo (nikoli "na silo").

## D. Contract Matrix (§6 — dokazano, ne ugibano)

| Provider | Endpoint (preverjen) | Auth | Živa preverba (2026-09-19, curl) | Dokumentirano v |
|---|---|---|---|---|
| viator | api.viator.com/partner/v1 | exp-api-key | 401 INVALID_HEADER_VALUE (vrata živa) | viator/types.ts + TASK-45 |
| getyourguide | api.getyourguide.com/1 | X-ACCESS-TOKEN | "header is missing" (vrata živa) | gyg/types.ts + TASK-46 |
| tiqets | api.tiqets.com/v2/products | Api-Key (ASSUMPTION) | **401 JSON** {success:false, api_version 2.7} — uspešna ovojnica je izpeljana konvencija | tiqets/types.ts |
| booking | demand.booking.com/v3 (search + rates) | Booking-API-Key (ASSUMPTION) | portal 200; host DNS-blokiran v peskovniku (okolje, ne pogodba) | booking/types.ts |
| skyscanner | partners.skyscanner.net/apiservices/v3 (create+poll) | x-api-key | **403 Request Forbidden** (vrata živa) | skyscanner/types.ts |
| airalo | (sandbox) sandbox.airalo.com/api/v2 | OAuth2 client_credentials | **200 PRAVI JSON** (Slovenia id=210, package_count=4) | airalo/types.ts |
| travelpayouts | api.travelpayouts.com/aviasales/v3 | token | **401 Unauthorized** (vrata živa) | travelpayouts/types.ts |
| fsq | LOKALNO (.jsonl iz FSQ_PLACES_DIR) | — (gated dataset) | shema javna (Places OS Data Schemas) | fsq/types.ts + dataset.ts |
| kiwitaxi | CSV dataset (data/kiwitaxi-routes.json) | — | 1494 rut v repotu | kiwitaxi/* |

**Pravilo:** neznan endpoint/ime glave = `DOCUMENTED-ASSUMPTION` z opombo "preveri ob aktivaciji" — NIKOLI ugibanje v sili.

## E. Adapter Matrix (novi — vsi po vzorcu viator/gyg)

| Adapter | Datoteke | Vrata brez ključa | Cache | Posebnosti |
|---|---|---|---|---|
| tiqets | types/client/mapper/adapter | `[]` + not-configured, 0 klicev | TTL iz registra; negativni 60 s | city iskanje po 1–3 kanonskih destinacijah; cena SAMO izrecno EUR; pin samo iz venue (exact) |
| booking | types/client/mapper/adapter | `[]` + not-configured | 10 min; negativni 60 s | bbox→destinacija; rates VERIGA (search→1 batch rates); cena = nočna (okno 1 noč); bookingBbox pretvorba |
| skyscanner | types/client/mapper/adapter | `[]` + not-configured / **origin-required** | TTL 0 (žive cene — no-store); negativni 60 s | create→poll z ZGORNJO MEJO 5; deep_link validiran; PRODUCT GAP izvor (§Q) |
| airalo | types/client/mapper/adapter | `[]` + not-configured (OBE poverilnici) | države 24 h; paketi 1 h; žeton −60 s | cena SAMO ob currency==="EUR" (USD → izpuščena + opomba — NIKOLI pretvorba); pin = center SI (country) |
| travelpayouts | types/client/mapper/adapter | `[]` + not-configured / origin-required | TTL iz registra; negativni 60 s | Data API izhodišče→cilj; bookingUrl /go/flights?dest= |
| fsq | types/dataset/mapper/adapter | `[]` + no-dataset | 24 h + FIFO | LOKALNI bralec JSONL; kategorije → kanonski tipi; info_only (NIKOLI booking) |

Vsak adapter ima: DI fetch (testabilnost), coalescing, negativni cache, rate-limit prek `maxCallsPerMin` iz registra, telemetrijo (`lastRun*`, `reset*AdapterCaches`), env leak guard test.

## F. Affiliate Matrix (§11 — deluje DANES brez ID-jev, iskreno)

| Provider | goRoute | Affiliate ID (env) | Stanje brez ID | Testi |
|---|---|---|---|---|
| booking | /go/hotels | BOOKING_AFFILIATE_ID | čist URL BREZ aid (fail-closed) | affiliate.test.ts |
| viator | /go/viator | VIATOR_AFFILIATE_URL / VIATOR_PARTNER_ID | čist URL brez pid/mcid | affiliate.test.ts |
| getyourguide | /go/activities (+/go/getyourguide produkt) | GETYOURGUIDE_PARTNER_ID | brez partner_id | affiliate.test.ts |
| tiqets | /go/tickets | TIQETS_AFFILIATE_URL (Awin) | čista stran | affiliate.test.ts |
| kiwitaxi | /go/transfers | KIWITAXI_PAP_ID | čista stran BREZ pap | affiliate.test.ts (ŽIVO: 302 brez pap) |
| discovercars | /go/cars | DISCOVERCARS_AFFILIATE_CODE | brez a_aid | affiliate.test.ts |
| skyscanner | /go/flights | SKYSCANNER_MEDIA_PARTNER_ID (Impact) | čist URL | affiliate.test.ts |
| omio | /go/transport | OMIO_AFFILIATE_URL | čista stran | affiliate.test.ts |
| airalo | /go/esim | AIRALO_AFFILIATE_URL (Impact) | čista stran | affiliate.test.ts |
| worldnomads + safetywing | /go/insurance | WORLDNOMADS_AFFILIATE_URL / SAFETYWING_AMBASSADOR_ID | čista stran | affiliate.test.ts |

**Živo dokazano (E2E danes):** /go/hotels?dest=Ljubljana → 302 booking.com; /go/tickets?dest=Bled → 302 tiqets.com; /go/flights?dest=Bled → 302 skyscanner.net/bled; /go/esim → 302 airalo.com — VSI brez fake tracking parametrov.

## G. Booking Matrix (§12 — CTA fail-closed centralen)

- **EN centralna ruti** `src/app/go/[provider]/route.ts`: allowlist providerjev → validacija dest (whitelist → kanonična/fallback) → `buildPartnerUrl` (strežniško!) → 302.
- **bookingUrl adapterjev** = VEDNO naša /go konstrukcija (NIKOLI raw partner URL — test task44 §12① + vsak mapper).
- **Produkt deep-link** (transfers/viator/getyourguide): PRODUCT_VALIDATORS po ID prostoru vira (`^\d{1,10}$` transfer, `[A-Za-z0-9]{3,20}` viator …).
- **Živo dokazano (danes):** neveljaven product → 400; neznan provider → 404; `javascript:`/`../`/URL-vrednost → 400 ali whitelist fallback; izhod VEDNO https + dovoljen host (open redirect nemogoč).
- **API_BOOKING** (lastna tržnica `own`): direct booking — geo sloj je produktna odločitev (§Q).

## H. AI Integration (§15)

- `ProviderProduct → AiSupplyProduct → AI kontekst` — AI dobi SAMO kanonska polja (ID/naslov/tip/provider/cena/enota/razpoložljivost/lokacija/URL).
- `ai-context.ts` projekcija + `aiIntegrated: true` za VSE 10 adapterje + STO RAG.
- AI NE MORE izmisliti ID-jev (register allowlist v sanitize) NE cen (selection-verify popravlja na kanon — ŽIVO dokazano §I).
- Supply-aware log (ŽIVO): `context=48 (capped 12) providers=kiwitaxi fixed=1`.

## I. FIXED / Refinement (§16–§18 — živi dokaz na današnjem HEAD)

1. Klient poslal FIXED `kiwitaxi:408` s **podrivno ceno €1 in lažnim naslovom** "Ljubljana → Bled".
2. `selection-verify` → **1 cena popravljenih na kanon** + kanonski naslov "Ljubljana Airport → Ljubljana".
3. AI kontekst: `fixed=1`; končni načrt vsebuje `kiwitaxi:408` **TOČNO 1×**, `estimated_cost: 51` (kanon), notes "od 51 € (per transfer) · Dodano z zemljevida ponudbe · vir: Supply Map".
4. `budgetValidation.knownTotal = 231` (samo verificirane cene — 180 + 51).
5. **Refine (browser, z-ai-sdk 200):** "Manj vožnje — Dan 1" → schedule repair (1 premik za vožnjo, 1 za prekrivanje) → FIXED transfer + kanonska cena "od 77 €" OHRANJENA po izboljšavi.
6. Browser veriga (SL): map → Transferji → 48 → kartica → modal → "Dodaj med izbrane" → gumb DISABLED (točno enkrat) → načrtovalnik vidi "Ljubljana → Bled: fixed" → generiraj → načrt vsebuje FIXED.

## J. Security (§22 Security — vsi testi ZELENI)

| Vektor | Obramba | Test |
|---|---|---|
| malicious URL | strežniška konstrukcija + host allowlist | task44 §12① ② ⑦ |
| malicious ID (product) | PRODUCT_VALIDATORS regex po viru | task44 §13③ (živo: 400) |
| encoded URL (%2e%2e, %252e, %ZZ) | decode + whitelist + zavrnitev | task44 §12③ ④ |
| javascript: / data: | https-only + konstrukcija | task44 §12⑩ + mapper testi vsakega adapterja |
| path traversal | dest whitelist → fallback | affiliate.test.ts (živo: Slovenia/lju fallback) |
| open redirect | izhod VEDNO https + allowlistan host | task44 §13⑦ |
| PII v URL | dest izključno destinacija | affiliate.test.ts PII |
| env leak | vrednosti NIKOLI v izhodnih produktih | LEAK guard v VSAKEM adapter testu + task52 |

## K. Failure Isolation (§19)

- `searchSupply` → `Promise.allSettled`: padel vir = `degraded[]`, ostali nedotaknjeni.
- **Živo dokazano (danes):** OSM overpass 406/črna luknja → `degraded:['osm']`, KT 48 produktov v ISTEM odgovoru, gated adapterji nedotaknjeni.
- Vsak adapter: timeout (8–20 s iz registra), `invalid-response` klasifikacija, negativni cache 60 s (okvarjen vir → 0 ponovnih klicev), rate-limit vrata.
- Mapper STRICT: manjkajoči id/naslov/koordinate → preskočen + štet (`lastSkipped`) — NIKOLI delni izum.

## L. No-Credential Mode (§20/§33 — današnje stanje instance)

- `.env` ima **0** od: TIQETS_API_KEY, BOOKING_API_KEY, SKYSCANNER_API_KEY, AIRALO_CLIENT_ID/SECRET, TRAVELPAYOUTS_TOKEN, FSQ_PLACES_DIR, VIATOR_API_KEY, GETYOURGUIDE_API_TOKEN, KIWITAXI_PAP_ID.
- `searchSupply` odgovor (živo): 7 gated adapterjev `ok=true count=0 note=not-configured`, fsq `no-dataset`, KT 48, OSM degraded (iskreno). **0 fake produktov.**
- `/vir-podatkov`: 3 Živi podatki / 4 Ni konfiguriran / 7 Potrebna odobritev partnerja / 2 Samo partnerska povezava = 16/16 kartic (SL + EN).
- Test §20: določen https mock (omrežje IZKLOPLJENO) — OSM degradira TAKOJ, gated 0 klicev, KT dataset nedotaknjen (BREZ omrežja, deterministično).
- **Credentials NOT required for build/test:** cel suite 1196/1196 z izbrisanimi env ključi (beforeEach čisti vse 15 ključev).

## M. Tests (§22/§26 — pokritost, ne številka)

| Sloj | Testna datoteka | Testov |
|---|---|---|
| tiqets (mapper/gate/401/429/malformed/cap/leak/fixture) | tiqets-adapter.test.ts | 22 |
| booking (+rates veriga, stayDates, bbox pretvorba) | booking-adapter.test.ts | 27 |
| skyscanner (+create→poll, origin gate, no result-cache) | skyscanner-adapter.test.ts | 27 |
| airalo (+žeton single-flight, EUR-only, države 24 h) | airalo-adapter.test.ts | 29 |
| travelpayouts (+origin gate, Data API oblika) | travelpayouts-adapter.test.ts | 26 |
| fsq (+dataset loader, kategorije, izven-SI skip) | fsq-adapter.test.ts | 36 |
| NO-CREDENTIAL MODE + FUTURE ACTIVATION + /go + kanon + §23 fixture | task53-no-credential-mode.test.ts | 23 |
| **Nove TASK 53 vrstice** | | **190** |

Minimalna pokritost §26: 6 × mapper ✓, 6 × missing credential ✓, 6 × malformed response ✓, 6 × redirect (bookingUrl /go + živa /go ruta) ✓; 401/403/429+Retry-After/timeout klasifikacija v VSAKEM client.test bloku ✓; FIXED/duplicate/canonical price v task44/47/49 + živo §I ✓.

**§23 CONTRACT FIXTURES:** vseh 6 datotek nosi oznako `TEST FIXTURE — NOT LIVE DATA`; strukturni test prepoveduje uvoz iz `__tests__` v produkciji (src scan) + NO-FAKE scan (fallbackProducts/DEMO_PRODUCTS/sampleProducts prepovedani).

**Regresija TASK 47–51:** vseh 41 datotek GREEN — 1196/1196 (od tega 1004 prejšnji baseline + 192 novih TASK 53), 44.503 expect klicev.

## N. Browser E2E (§28 — agent-browser, današnji dev strežnik)

**SL (desktop 1280×800):**
- domov → Zemljevid → Ponudba & viri → Pokaži POI → Transferji → zoom → **"Ponudba v pogledu 48"** + "Nekateri viri trenutno niso dosegljavi — lokalna plast ostaja" (iskreni degraded OSM).
- kartica "Ljubljana → Bled" → ProductModal: PRICE od €77 / na prevoz, razredi vozil (Economy €77 … Minibus €122), sourceUrl kiwitaxi.com, koordinate, CTA "Preveri ponudbo in rezerviraj pri partnerju", vir "KiwiTaxi Partner Data API (CSV)".
- "Dodaj med izbrane" → gumb DISABLED (točno 1×; v EN seji duplikat prav tako blokiran).
- Načrtuj → "Ljubljana → Bled: fixed" viden → Generiraj → 3-dnevni itinerer vsebuje FIXED "od 77 €" → Prilagodi (Manj vožnje) → refine 200 (z-ai-sdk) → FIXED OHRANJEN.

**EN (desktop):** /en → /en/zemljevid → "Supply in view 48" → modal "PRICE from €77 per transfer" + "Check the offer and book with the partner" + "Partner published data (CSV ingest): real transfer prices, not live quotes." — vse prevedeno, 0 raw i18n ključev.

**Mobile:** 375×812 in 390×844 — 0px horizontalni overflow na /, /vir-podatkov, /zemljevid, /nacrtuj.

**Console:** 0 napak TASK 53 kode; znane pre-existing: prisma datasource validacija (postgres clobber — okolje peskovnika, zunaj src, dokumentirano TASK 52 FOLLOW-UP) + Radix DialogContent aria-describedby opozorilo.

## O. Performance (§29)

- **Parallel:** adapterji tečejo sočasno (`Promise.allSettled`) — brez N+1 (1 poizvedba = 1 krog vseh adapterjev).
- **Bounded:** kap 48 produktov/adapter (mapper) + `maxProductsForZoom` globalni + `maxCallsPerMin` po registru.
- **Isolated:** padel adapter ne zadrži ostalih (negativni cache prekine ponovne poskuse na mrtvem viru 60 s).
- **Brez poverilnic = 0 zunanjih klicev:** dokazano (a) test §20② z izklopljenim omrežjem (gated adapterji se ne kličejo), (b) telemetrija `ms=1` v živem odgovoru gated adapterjev, (c) 21 s odgovor supply/search = SAMO OSM živi klic (KT 2 ms iz dataset pomnilnika, gated 1 ms gate).

## P. Future Activation (§21 — RUNBOOK po providerju)

| Provider | env vnos (TOČNO ime) | Kje dobiti | Po vnosu |
|---|---|---|---|
| viator | `VIATOR_API_KEY` (+ `VIATOR_API_BASE` sandbox preklop) | partner.viator.com (API access request) | CONFIGURED → živi inventar BREZ spremembe kode |
| getyourguide | `GETYOURGUIDE_API_TOKEN` | partner manager (email iz TASK 46) | isto |
| tiqets | `TIQETS_API_KEY` | portals.tiqets.com (Distributor API prek Awin) | isto; ob aktivaciji preveri header ime (Api-Key ASSUMPTION) |
| booking | `BOOKING_API_KEY` (+ `BOOKING_API_BASE`) | developers.booking.com (status Managed Affiliate Partner) | isto; preveri header (Booking-API-Key ASSUMPTION) |
| skyscanner | `SKYSCANNER_API_KEY` | partners.skyscanner.net (Apply for Flights API) | isto + **IZVOR**: SupplyQuery še nima izvora → adapter čaka `deps.originPlaceId` (produktna odločitev, glej §Q) |
| airalo | `AIRALO_CLIENT_ID` + `AIRALO_CLIENT_SECRET` (OBE!) | partners.airalo.com | `AIRALO_API_BASE=https://api.airalo.com` za produkcijo (sandbox privzet) |
| travelpayouts | `TRAVELPAYOUTS_TOKEN` (+ `TRAVELPAYOUTS_ORIGIN` npr. LJU) | travelpayouts.com/developers/api (self-serve) | isto; origin je operaterski config NE poverilnica |
| fsq | `FSQ_PLACES_DIR` (pot, NE poverilnica) | HuggingFace Open Places (sprejem pogojev + prenos; runbook v fsq/dataset.ts) | lokalni sloj oživi brez kode |
| kiwitaxi monetizacija | `KIWITAXI_PAP_ID` | partner dashboard | tracking se priključi nad ENAKE podatke |
| booking monetizacija | `BOOKING_AFFILIATE_ID` | partner portal | aid se vstavi v obstoječe /go/hotels |

Prihodnja aktivacija zahteva **0 sprememb kode** — testi §21 dokazujejo, da tovarna ADAPTER_FACTORIES vrne ISTIH 10 adapterjev z in brez ključev; `productionConfigured`/`userFacingStatus` se dvigneta iz NOT_CONFIGURED → CONFIGURED (LIVE samo po živi preverbi — TASK 54).

## Q. Remaining External Dependencies / Products Gaps (iskreni)

1. **skyscanner/travelpayouts IZVOR letov:** SupplyQuery nima izvornega letališča — letalske cene so iskanja IZHODIŠČE→CILJ. Adapterji iskreno vračajo `origin-required` (0 klicev). Arhitektura pripravljena (`deps.originPlaceId`); produktna odločitev za TASK 54+.
2. **own geo sloj:** lastna tržnica še ni sloj zemljevida (DB geo polja + migracija — produktna faza, NE credential).
3. **Peskovniške omejitve okolja (NE pogodbe):** demand.booking.com DNS-blokiran; api.airalo.com DNS-blokiran (sandbox preklop deluje); overpass-api.de občasno 406/črna luknja (fail-closed dokazan); z-ai 429 v viškovih (fallback pot).
4. **Pre-existing zunaj src/:** prisma datasource postgres clobber (peskovnik; produkcija uporablja Neon — sledi TASK 52 FOLLOW-UP), tailwind.config.ts TS2307 (tailwindcss-animate tipi).
5. **Header imena (ASSUMPTION):** tiqets `Api-Key`, booking `Booking-API-Key` — preveriti ob aktivaciji (dokumentirano v types.ts).

## R. Final Matrix (§24/§30 — današnje stanje instance, 0 poverilnic)

| Provider | Category | Code | Contract | Adapter | Affiliate | Booking | AI | Credentials | Live | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| osm | LOCAL_OPEN_DATA | YES | VERIFIED | YES | NO | info_only | YES | NONE | YES | **ACTIVE** |
| kiwitaxi | C_TRANSPORT | YES | VERIFIED | YES | YES | partner CTA | YES | monetizacija NE | YES | **ACTIVE** |
| sto | LOCAL_OPEN_DATA | YES | VERIFIED | RAG | NO | NO | YES | NONE | YES | **ACTIVE** |
| viator | A_ACTIVITIES | YES | VERIFIED | YES | YES | partner CTA | YES | MISSING | NO | CODE READY |
| getyourguide | A_ACTIVITIES | YES | VERIFIED | YES | YES | partner CTA | YES | MISSING | NO | CODE READY |
| tiqets | A_ACTIVITIES | YES | VERIFIED | YES | YES | partner CTA | YES | MISSING | NO | CODE READY |
| booking | B_ACCOMMODATION | YES | VERIFIED | YES | YES | partner CTA | YES | MISSING | NO | CODE READY |
| skyscanner | D_FLIGHTS | YES | VERIFIED | YES | YES | partner CTA | YES | MISSING (+origin) | NO | CODE READY |
| airalo | E_INS_CONN | YES | VERIFIED | YES | YES | partner CTA | YES | MISSING (par) | NO | CODE READY |
| travelpayouts | INFRASTRUCTURE | YES | VERIFIED | YES | — | /go/flights | YES | MISSING (+origin) | NO | CODE READY |
| fsq | LOCAL_OPEN_DATA | YES | VERIFIED | YES | NO | info_only | YES | dataset manjka | NO | CODE READY |
| own | OWN_MARKETPLACE | YES | — | partial | NO | direct | partial | NONE | NO | CODE READY (geo faza) |
| discovercars | C_TRANSPORT | NO | VERIFIED | NO | YES | partner CTA | NO | NONE (B4B) | NO | AFFILIATE READY |
| omio | C_TRANSPORT | NO | VERIFIED | NO | YES | partner CTA | NO | NONE (ni API) | NO | AFFILIATE READY |
| worldnomads | E_INS_CONN | NO | VERIFIED | NO | YES | partner CTA | NO | NONE | NO | AFFILIATE READY |
| safetywing | E_INS_CONN | NO | VERIFIED | NO | YES | partner CTA | NO | NONE | NO | AFFILIATE READY |

**Števci:** DISCOVERED 16 · CODE READY (adapter) 11 (+ own delno) · AFFILIATE READY 12 · BOOKING READY 12 (partner CTA) · AI READY 11 · LIVE 3 · BLOCKED 1 (discovercars B4B) · credentials MISSING 7 API (viator, gyg, tiqets, booking, skyscanner, airalo, travelpayouts) + 1 dataset (fsq).

## S. Final Gate (§32)

| Pogoj | Stanje |
|---|---|
| vsi providerji iz master inventory obdelani | ✅ 16/16 (B) |
| noben tiho izpuščen | ✅ (B — vsak z razlogom stanja) |
| pravilna capability klasifikacija | ✅ (§20⑥ + task52 suite) |
| adapter obstaja, kjer tehnično mogoče | ✅ 10 (B4B/ni-API iskreno brez) |
| canonical mapping obstaja | ✅ (mapper testi 6× + viator/gyg/kt/osm) |
| registry pravilen | ✅ (register↔matrika↔statusi test §12③) |
| UI status pravilen | ✅ (16/16 kartic SL+EN, 0 lažnih LIVE) |
| AI integration pripravljena | ✅ (H — aiIntegrated 11) |
| FIXED deluje | ✅ (I — živo 1×, kanon €51) |
| refinement združljiv | ✅ (I — FIXED ohranjen po refine) |
| affiliate arhitektura | ✅ (F — 12, fail-closed brez ID) |
| CTA arhitektura | ✅ (G — centralna /go) |
| redirect fail-closed | ✅ (J — živo 400/404/fallback) |
| credentials niso potrebni za build/test | ✅ (L — 1196/1196 brez ključev) |
| brez credentials ni fake inventoryja | ✅ (§20③ NO-FAKE + živo 0) |
| contract fixtures samo testni | ✅ (§23 oznaka + strukturni test) |
| provider failure izoliran | ✅ (K — živo degraded OSM) |
| ni N+1 | ✅ (O — allSettled vzporedno) |
| SL deluje | ✅ (N) |
| EN deluje | ✅ (N) |
| mobile 375/390 | ✅ (N — 0px overflow) |
| TASK 47–51 regresija GREEN | ✅ (M — 1004 baseline testov nedotaknjenih) |
| full test suite GREEN | ✅ 1196/1196, lint 0, tsc 0 (src) |

**Opomba §27 (build):** `bun run build` v peskovniku NI izvedljiv (okoljsko pravilo — samo dev strežnik na :3000). Kompilacijska pravilnost je dokazana z `tsc --noEmit` (0 napak v src) + dev-server E2E (vse ključne rute 200, 0 napak nove kode v konzoli). Produkcjski build poteka prek CI/Vercel.

---

**SKLEP:** TASK 53 GREEN. Vseh 16 providerjev je na največji možni stopnji BREZ poverilnic: 3 LIVE, 8 CODE READY z živo preverjenimi pogodbami in iskrenimi capability gates, 4 affiliate-only iskreno komunikiranih, 1 v produktni fazi (own geo). Nič fake inventarja, cen, razpoložljivosti ali ključev. Prihodnja aktivacija (TASK 54) = samo env vnos + živa preverba.
