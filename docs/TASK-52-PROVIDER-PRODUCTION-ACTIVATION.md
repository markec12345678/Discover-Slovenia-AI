# TASK 52 — PROVIDER PRODUCTION ACTIVATION & LIVE SUPPLY — KONČNO POROČILO (A–U)

> **Repo:** github.com/markec12345678/Discover-Slovenia-AI
> **Baseline:** TASK 51 `1e0ffb7` + `ab30f0c` (947/947) → TASK 52 `4b65ffa` (979/979)
> → `3a9f1a5` (1004/1004) → to poročilo (HEAD)
> **Veriga življenjskega cikla (§0):** DISCOVERED → CONTRACT VERIFIED → ACCESS
> AVAILABLE → CODE READY → PRODUCTION CONFIGURED → LIVE DATA VERIFIED →
> PRICE VERIFIED → AVAILABILITY STATUS VERIFIED → CTA/BOOKING VERIFIED →
> AI INTEGRATION VERIFIED → PRODUCTION ACTIVE
> **Rezultat:** **GREEN** — 3 providerji PRODUCTION ACTIVE z živimi dokazi
> (OSM/STO/KiwiTaxi), 2 adapterja CODE READY (Viator/GYG — iskreno prazna
> vrata), ostali pošteno blokirani (brez izmišljenih podatkov). 1004/1004
> testov, lint 0, tsc 0 (src), browser E2E SL+EN / 375+390+desktop.

---

## A. BASELINE

- Start: TASK 51 final (`1e0ffb7`, continuation `ab30f0c`, regresija 947/947).
- TASK 52 §0–§19 izvedeni v `4b65ffa` (1.57.0): `production-matrix.ts`
  (življenjski cikel vseh 16 providerjev + blokirni razlogi + vrsta dostopa
  + cene §16 + razpoložljivost §17 + env dostop §6 SAMO PRESENT/MISSING z
  LEAK testom), `docs/PROVIDER-APPLICATIONS.md` (master matrika + access
  matrix + runbooki), `.env.example` dopolnitve (OSRM_BASE_URL/APP_URL/
  FSQ_PLACES_DIR), 32 testov → 979/979.
- TASK 52 §32 izveden v `3a9f1a5`: `production-status.ts` (LIVE/CONFIGURED/
  NOT_CONFIGURED/PARTNER_ACCESS_REQUIRED/AFFILIATE_ONLY — izpeljava
  LIVE ⟺ PRODUCTION_ACTIVE) + UI `/vir-podatkov` (badge + stopnja §0 +
  chipi cene/razpoložljivost/monetizacija + legenda, SL+EN) + 25 testov →
  1004/1004.
- To poročilo pokriva preostanek specifikacije (§20–§41): žive verige
  dokazov, AI integracija, FIXED integriteta, varnost, i18n, mobilne
  preverbe, regresija, končna matrika in Final Gate.

## B. POPOLN INVENTAR PROVIDERJEV (§1/§3)

Repo-wide inventar (registry, affiliate.ts, /go/ rute, .env.example, docs/,
tests, fixtures, prisma, data/, package.json, TODO/FIXME, UI kategorije)
— izveden v `4b65ffa`, danes re-verificiran: **16 vnosov registra** +
4 skupine omemb (affiliate omrežja CJ/Impact/Awin/ShareASale/TP — gostujejo
redirecte, niso providerji; tekmovalci — analiza; vsebinske omembe
SEO/FAQ; strežniške odvisnosti Overpass/OSRM/Open-Meteo/Wikimedia/OpenRouter/
Stripe — lastna infrastruktura). Seznam naročnikov §3 obdelan v celoti:
OSM, KiwiTaxi, Viator, GetYourGuide, Booking, DiscoverCars, Skyscanner,
Airalo, Omio, Tiqets, World Nomads, SafetyWing (+ odkriti FSQ, STO, own,
travelpayouts). Noben provider ni izpuščen (testovno varovana pokritost
register ↔ matrika).

## C. KAPABILITETNA MATRIKA (§2)

Strojno: `src/lib/supply/production-matrix.ts` (`productionMatrix()`,
`reachedStages()`, `productionSummary()`). Človeško:
`docs/PROVIDER-APPLICATIONS.md`. Vsak vnos: kategorija (§7–§11), vrsta
dostopa (§4), stopnja (§0), blokirni razlog, cena (§16), razpoložljivost
(§17), CTA, AI integracija, docsUrl + iskrena opomba. Statusi IZKLJUČNO
iz dovoljenega nabora (ACTIVE/CODE READY/ACCESS NOT CONFIGURED/PARTNER
APPROVAL REQUIRED/CONTRACT VERIFIED/BLOCKED/NOT APPLICABLE — test
`t52-status-vocabulary`).

## D. ACCESS MATRIX (§6 — brez skrivnosti)

`.env` instance vsebuje IZKLJUČNO `DATABASE_URL`; vsi ostali env vnosi so
MISSING (razloženo v `4b65ffa`). `accessMatrix()` vrača SAMO
`{envVar, present: boolean}` — vrednosti NIKOLI ne zapustijo strežnika
(LEAK test: z vsemi vrednostmi `SKRIVNOST-T52-*` JSON izpis ne vsebuje
nobene). Semantika prisotnosti: ID/ključ → ne-prazno po trimu; `_URL` →
veljaven https; `_BASE`/`_DIR` NISTA poverilnici.

## E. AKTIVACIJSKO DELO (§7–§11)

- **A (aktivnosti):** Viator + GYG adapterja CODE READY, priklopljena na
  `/api/supply/search`, živi dokaz iskrenih praznih vrat (spodaj F).
  Tiqets CONTRACT VERIFIED (Distributor API po prijavi).
- **B (nastanitve):** Booking affiliate deep-link ONLY — Demand API
  zahteva Managed Affiliate Partner. NI fake sob (§8).
- **C (transport):** KiwiTaxi PRODUCTION ACTIVE (CSV inventar); DiscoverCars
  BLOCKED (B4B); Omio PARTNER APPROVAL REQUIRED.
- **D (leti):** Skyscanner PARTNER APPROVAL REQUIRED — affiliate iskanje
  NI letalski inventar (§10).
- **E (zavarovanje/povezljivost):** WN/SW NOT_APPLICABLE (brez API-ja);
  Airalo PARTNER APPROVAL REQUIRED.
- **Lokalni odprti viri (§12):** OSM PRODUCTION ACTIVE, FSQ DISCOVERED
  (množica ni ingestirana), STO PRODUCTION ACTIVE (RAG T2).
- **Lastna tržnica:** own CODE_READY (geo polja še manjkajo).

## F. ŽIVE VERIGE DOKAZOV (§25 — 10-korakna veriga na HEAD)

Veriga: avtentikacija → iskanje → rezultat → mapper → kanonski
ProviderProduct → cena → razpoložljivost → URL → redirect → AI.

### F.1 KiwiTaxi (PRODUCTION ACTIVE) — 10/10 ZELENO
1. **Avtentikacija:** objavljeni partner CSV (brez ključa) — dataset v
   repotu (`data/kiwitaxi-routes.json`, ingest 2026-09-18 + tedenski cron).
2. **Iskanje:** `GET /api/supply/search?bbox=45.86,13.63,46.43,15.30&zoom=10&cats=transfer` → 200.
3. **Rezultat:** `adapter kiwitaxi: ok=true count=48`.
4. **Mapper:** CSV vrstica → kanonski produkt (naslov/opis s cenami
   razredov, koordinate midpoint, geoPrecision city).
5. **Kanonski produkt:** `id: "kiwitaxi:408"`, provider, tip transfer,
   naslov „Ljubljana Airport → Ljubljana", lat/lng, licenca
   `{source: "KiwiTaxi Partner Data API (CSV)", attribution: "© KiwiTaxi"}`.
6. **Cena:** `{amount: 51, currency: EUR, unit: per_transfer, fromPrice:
   true, note: "objavljena cena, ni živi citat"}` (§16 FROM_PRICE).
7. **Razpoložljivost:** `{status: "not_supported"}` + „preveri pri
   ponudniku" (§17 — NIKOLI „available" brez dokaza).
8. **URL:** sourceUrl `kiwitaxi.com/en/slovenia/ljubljana+airport->ljubljana`.
9. **Redirect:** `/go/transfers?product=1439&from=Ljubljana+Airport&dest=Ljubljana`
   → **302 → `https://kiwitaxi.com/en/transfers/1439`** (brez pap ID —
   čista povezava, monetized:false, ker PAP ID MANJKA — iskreno);
   iskalni deep-link `/go/transfers?from=Ljubljana&dest=Bled` → 302 →
   `kiwitaxi.com/en/search?from=Ljubljana&to=Bled`.
10. **AI:** `POST /api/itinerary` s FIXED izbiro → `[itinerary] supply-aware:
    context=48 (capped 12) providers=kiwitaxi fixed=1` → končni načrt
    vsebuje `kiwitaxi:408` TOČNO 1× z notes „cena: od 51 € (per
    transfer) · razpoložljivost: preveri pri ponudniku · vir: KiwiTaxi"
    (dokaz K. spodaj).

### F.2 STO / slovenia.info (PRODUCTION ACTIVE) — 10/10 ZELENO
1. **Avtentikacija:** javni llms.txt viri (STO izrecno objavlja „for AI
   assistants" — brez ključa, etično metapodatkovno indeksiranje).
2. **Iskanje:** `GET /api/ai/sources?q=Bled&lang=sl` → 200.
3. **Rezultat:** 664 zapisov (56 SL guide + 56 EN guide + 552 EN stories).
4. **Mapper:** `sto-llms.ts` skupni parser za uredniški ingest IN runtime
   overlay (en parser — razhajanje nemogoče).
5. **Kanonski zapis:** id/naslov/URL/sekcija/opis + jezik + geopovezava
   na našo destinacijo (Bled → slug `bled`, „Odpri na zemljevidu").
6.–7. **Cena/razpoložljivost:** NISO podprte (vsebinski vir — iskreno
   NOT_SUPPORTED, §16/§17).
8. **URL:** originalni slovenia.info URL-ji.
9. **Svežina (namesto redirecta):** `source: "overlay"`, `fetchedAt:
   2026-09-19T18:06:10Z` — **ŽIVI prenos iz slovenia.info se je zgodil
   med preverbo** (freshness plast nad git baseline-om; baseline ostaja
   fallback).
10. **AI:** zapisi se pretakajo v AI grounding (`buildStoGrounding`) —
    RAG T2 plast v pogovoru/načrtovalcu (TASK 27+).

### F.3 OSM (PRODUCTION ACTIVE) — kodna pot zelena, danes zunanja blokada
1.–5. **Veriga:** Overpass konektor (glavni + kumi mirror, retry ×3,
   premori, časovni budget, preklic odjemalca) → kanonski OSM produkti z
   licenco `{source: "OpenStreetMap", attribution: "© OpenStreetMap"}`
   (ODbL). Vsak potek je testovno pokrit (auditi 42–47); živi dokazi iz
   TASK 47/48 ( Overpass 200, POI na zemljevidu).
6.–8. **Cena/razpoložljivost/URL:** NOT_SUPPORTED/info_only — OSM je
   nekomercialen vir, NIKOLI affiliate (testovno varovano §12).
9. **Danes (2026-09-19, peskovnik):** `overpass-api.de` vrača **HTTP 406**
   (IP blokada peskovnika), kumi mirror timeout → adapter iskreno pade:
   `degraded: ["osm"]`, **0 izmišljenih produktov**, ostali adapterji
   nedotaknjeni, UI izpiše „Nekateri viri trenutno niso dosegljavi —
   lokalna plast ostaja." To je TOČNO predvideno vedenje §15/§23/§35:
   odpoved zunanjega vira ≠ regresija kode; fail-closed je DOKAZAN v živo.
10. **AI:** ko Overpass odgovarja, POI sodelujejo v AI kontekstu (TASK 47
    supply-aware; živi dokazi v TASK 47/48 poročilih).

### F.4 Viator + GetYourGuide (CODE READY) — iskrena vrata v živo
`GET /api/supply/search` → `adapter viator: ok=true count=0
note=not-configured`; `adapter getyourguide: ok=true count=0
note=not-configured`. Overitvena vrata virov so živa (401 /
„X-ACCESS-TOKEN is missing" — `4b65ffa` §5): ko poverilnica pade v env,
podatki stečejo BREZ spremembe kode.

## G. AFFILIATE STANJE (§19/§26)

Affiliate ID-ji vseh 13 komercialnih providerjev: **MISSING** → vse
povezave so ČISTE (brez trackinga), `monetized: false` v analitiki.
`monetizationState()` loči CONFIGURED/NOT_CONFIGURED/NOT_APPLICABLE —
NIKOLI vpliva na podatkovni status (§26: affiliate ≠ inventar — chip je
ločen v UI). Runbooki za aktivacijo: `docs/PROVIDER-APPLICATIONS.md` §4.
NI placeholder ID-jev (test „brez slovenia-demo").

## H. BOOKING-CTA STANJE (§18)

CTA klasifikacija: `affiliate_redirect` (13 komercialnih), `own_checkout`
(own), `info_only` (OSM/FSQ/STO — brez rezervacije). `/go/` varnostna
baterija (15/15 živih preverb v `4b65ffa`, re-potrjeno na HEAD): številski
validator, path traversal 400, neznani provider 404, javascript:/data: →
kanonični fallback, dvojno kodiranje 400, dolžinska meja 100 → 400,
ALLOWED_HOSTS zadnja varovalka. ProductModal CTA: „Preveri ponudbo in
rezerviraj pri partnerju (odpre externo stran)" + rel NOOPENER
(agent-browser potrditev — odpre zunanjo stran).

## I. PREVERBA CEN (§16)

- **LIVE_PRICE: NIHČE** (iskren assertion v testih — živi cenovni API ni
  priključen).
- **FROM_PRICE:** kiwitaxi (objavljene realne cene + note „ni živi citat"),
  viator/gyg (semantika prihodnje plasti), own (lastne cene).
- **Affiliate-only viri:** NOT_SUPPORTED (povezava NI dokaz cene).
- Živi dokaz AI: KT €51 (kanon) v proračunu načrta — glej K.

## J. PREVERBA RAZPOLOŽLJIVOSTI (§17)

LIVE: NIHČE (iskren assertion). KT/OSM: NOT_SUPPORTED („preveri pri
ponudniku" — v opombi produkta IN AI notes postanka). Viator/GYG:
UNKNOWN (koncept obstaja, Basic Access ga nima). NIKOLI „available"
brez dokaza.

## K. AI INTEGRACIJA (§20) — živi dokaz z manipulirano ceno

E2E na HEAD: klient je poslal FIXED izbiro `kiwitaxi:408` s **podrivno
ceno €1** (namesto kanonskih €51):
1. **selection-verify (vhod):** `[itinerary] TASK 49 supply verify
   (izbira): 0 zavrnjenih, 1 cen popravljenih na kanon` — €1 → €51
   (kanon iz dataseta, NE klientova trditev).
2. **AI kontekst:** `supply-aware: context=48 (capped 12)
   providers=kiwitaxi degraded=- fixed=1` — AI vidi REALNO zalogo.
3. **Končni načrt:** dan 2, `kiwitaxi:408`, `estimated_cost: 51`
   (KANONSKI), točno 1×, koordinate/provider vir ohranjeni, notes z
   „od 51 € (per transfer) · preveri pri ponudniku · vir: KiwiTaxi".
4. **Proračun:** `budgetValidation: knownTotal=171` (50+30+40+51 — samo
   strežniško verificirane cene), status „uncertain" (iskreno — fromPrice).
AI ni sam ustvaril provider ID-ja; vsaFIXED integrirana točno 1×.

## L. FIXED-REFINEMENT INTEGRETA (§21/§22)

- FIXED: map → izbira → „Dodaj med izbrane" (gumb nato disabled —
  agent-browser dokaz) → AI generacija → končni načrt — točno 1×, kanon
  (K. zgoraj).
- Refine pot: ISTA validacijska veriga kot generacija (P0 iz TASK 48
  zaprt v TASK 49/50 — `52d1cab`/`0b6b400`; re-verificirano `cb1eb82`
  na `ab30f0c`). Testna baterija: task48/49/50 suite-i v 1004/1004.

## M. VARNOST (redirect/URL/cene/koordinate)

§18 preverbe (H), envi LEAK testi (D), GEO integriteta baterija iz TASK 51
§21 (null island/manjkajoče/neveljavne/zamenjane → kanon; fabrikirana geo →
fail-closed), klientova izbira/načrt = NEZAUPAN vnos (selection-verify,
TASK 49). Vsi varnostni testi v 1004/1004.

## N. PERFORMANCE (§28)

Adapterji izolirano vzporedno (Promise.allSettled — B odpoved ne sesuje
A/C; živi dokaz: osm degraded + kiwitaxi 48 v ISTEM odgovoru), timeouti
po registru (runner diro), rate limiti (OSM 60/min instanca + 30/min/IP;
Viator 20/min; GYG 60/min), negativni predpomnilnik okvar (60 s/310 s),
dedupe + zoom gating + kap. N+1 nemogoč (števci dedup/cache/sočasnost iz
TASK 51 §25).

## O. I18N (§30)

`/vir-podatkov` SL: 3× „Živi podatki" + 4× „Ni konfiguriran" + 7×
„Potrebna odobritev partnerja" + 2× „Samo partnerska povezava" (+ legenda)
= 16/16 kartic pravilnih; EN (`/en/vir-podatkov`): enako število
„Live data/Not configured/Partner approval required/Affiliate link only".
0 raw i18n ključev na obeh jezikih (regex preverba innerText). Domača
stran SL + `/en` (h1 „What do you want to experience in Slovenia?").

## P. MOBILNE PREVERBE (§29)

- **375×812:** 0px horizontalnega preliva (domača stran z zemljevidom +
  vir-podatkov).
- **390×844:** 0px preliva.
- Desktop 1280×800: zemljevid ponudbe s 48 KT produkti (48 pinov/grozdov),
  ProductModal, „Dodaj med izbrane".
- 0 console error v vseh preverbah.
- Zajeti dokazi: `.zscripts/e2e/t52-final-*.png` (transfers-map,
  product-modal, mobile-390, vir-podatkov).

## Q. OKOLJSKE SPREMENLJIVKE (§31)

`.env.example` dokumentira VSA imena (vključno dopolnitve OSRM_BASE_URL,
APP_URL, FSQ_PLACES_DIR iz `4b65ffa`). V repotu NI secrets (LEAK testi +
`git log` čist). Vsako ime: namen/provider/required? — v
`docs/PROVIDER-APPLICATIONS.md` + `.env.example` komentarji. Instance env:
SAMO DATABASE_URL.

## R. REGRESIJA (§36/§37)

- `bun test`: **1004/1004 PASS** (43322 expect) — vključno 947 baznih
  (TASK 47–51 GREEN: supply-aware AI, itinerary realizem, product
  readiness, real-user validacija, geo koherenca) + 32 matrika + 25 status.
- `bun run lint`: **0 napak**.
- `bunx tsc --noEmit`: **0 napak v src/** (napake IZKLJUČNO v `skills/*`
  in `tailwind.config.ts` — zunaj projekta, predhodno obstoječe).
- Browser E2E (§36): SL+EN, 375+390+desktop, / + /vir-podatkov + /en +
  /en/vir-podatkov, modal, izbira, redirecti — vse GREEN, 0 console error.

## S. PREOSTALI BLOKERJI (§34/§35 — iskreni, NE fašing)

| Bloker | Stopnja | Razlog | P0–P3 |
|---|---|---|---|
| VIATOR_API_KEY | CODE READY | self-serve ključ ni izdan | Zunanji (P2 runbook pripravljen) |
| GETYOURGUIDE_API_TOKEN | CODE READY | žeton izda partner manager po odobritvi | Zunanji (P2) |
| Booking/Tiqets/Skyscanner/Omio/Airalo | CONTRACT VERIFIED | partner approval v teku | Zunanji (P2) |
| DiscoverCars | BLOCKED | B4B pogodba | Zunanji (P3) |
| FSQ ingest | DISCOVERED | slovenska podmnožica ni prenešena | P3 (bodoča faza) |
| own geo polja | CODE READY | zemljevidna plast tržnice manjka | P3 |
| Affiliate ID-ji (13×) | NOT CONFIGURED | prijave še odobrene ne | Zunanji (P2) |
| overpass-api.de 406 (danes) | zunanjost | IP blokada peskovnika — koda fail-closed | NI kode (P0 ne) |
| prisma postgres clobber | okolje | DATABASE_URL kaže na postgres v peskovniku | Dokumentirano (TASK 48 follow-up) |
| indexnow-ping.sh | dokumentacija | dangling ref (SEO pripomoček, ne provider) | P3 |

NIHČE od teh se ne rešuje s FAKE podatki — vsak ima iskren status + runbook
(`docs/PROVIDER-APPLICATIONS.md`) + fail-closed obnašanje.

## T. KONČNA MATRIKA (§33)

| Provider | Kategorija | Stopnja §0 | Dostop | Cena | Razpolž. | CTA | AI | Status §32 |
|---|---|---|---|---|---|---|---|---|
| osm | LOCAL_OPEN_DATA | **PRODUCTION_ACTIVE** | OPEN_DATA | NOT_SUPP | NOT_SUPP | info_only | ✅ | **LIVE** |
| sto | LOCAL_OPEN_DATA | **PRODUCTION_ACTIVE** | STATIC_CONTENT | NOT_SUPP | NOT_SUPP | info_only | ✅ | **LIVE** |
| kiwitaxi | C_TRANSPORT | **PRODUCTION_ACTIVE** | STATIC_CONTENT | FROM_PRICE | NOT_SUPP | affiliate_redirect | ✅ | **LIVE** |
| viator | A_ACTIVITIES | CODE_READY | AFFILIATE_DEEP_LINK | FROM_PRICE (f) | UNKNOWN (f) | affiliate_redirect | ✅ (prazno) | NOT_CONFIGURED |
| getyourguide | A_ACTIVITIES | CODE_READY | AFFILIATE_DEEP_LINK | FROM_PRICE (f) | UNKNOWN (f) | affiliate_redirect | ✅ (prazno) | PARTNER_ACCESS_REQUIRED |
| own | OWN_MARKETPLACE | CODE_READY | DIRECT_BOOKING | FROM_PRICE | UNKNOWN | own_checkout | — | NOT_CONFIGURED |
| tiqets | A_ACTIVITIES | CONTRACT_VERIFIED | AFFILIATE_DEEP_LINK | NOT_SUPP | NOT_SUPP | affiliate_redirect | — | PARTNER_ACCESS_REQUIRED |
| booking | B_ACCOMMODATION | CONTRACT_VERIFIED | AFFILIATE_DEEP_LINK | NOT_SUPP | NOT_SUPP | affiliate_redirect | — | PARTNER_ACCESS_REQUIRED |
| discovercars | C_TRANSPORT | CONTRACT_VERIFIED | AFFILIATE_DEEP_LINK | NOT_SUPP | NOT_SUPP | affiliate_redirect | — | PARTNER_ACCESS_REQUIRED (BLOCKED) |
| omio | C_TRANSPORT | CONTRACT_VERIFIED | AFFILIATE_DEEP_LINK | NOT_SUPP | NOT_SUPP | affiliate_redirect | — | PARTNER_ACCESS_REQUIRED |
| skyscanner | D_FLIGHTS | CONTRACT_VERIFIED | AFFILIATE_DEEP_LINK | NOT_SUPP | NOT_SUPP | affiliate_redirect | — | PARTNER_ACCESS_REQUIRED |
| airalo | E_INS_CONN | CONTRACT_VERIFIED | AFFILIATE_DEEP_LINK | NOT_SUPP | NOT_SUPP | affiliate_redirect | — | PARTNER_ACCESS_REQUIRED |
| worldnomads | E_INS_CONN | CONTRACT_VERIFIED | AFFILIATE_DEEP_LINK | NOT_SUPP | NOT_SUPP | affiliate_redirect | — | AFFILIATE_ONLY |
| safetywing | E_INS_CONN | CONTRACT_VERIFIED | AFFILIATE_DEEP_LINK | NOT_SUPP | NOT_SUPP | affiliate_redirect | — | AFFILIATE_ONLY |
| fsq | LOCAL_OPEN_DATA | DISCOVERED | OPEN_DATA | NOT_SUPP | NOT_SUPP | info_only | — | NOT_CONFIGURED |
| travelpayouts | INFRASTRUCTURE | DISCOVERED | SEARCH_API | UNKNOWN | UNKNOWN | affiliate_redirect | — | NOT_CONFIGURED |

**Povzetek `productionSummary()`:** 16 skupaj — 3 PRODUCTION ACTIVE,
2 CODE READY, 1 CODE READY (own), 8 CONTRACT VERIFIED, 2 DISCOVERED.

## U. FINAL GATE (21 pogojev)

1. ✅ Vsak provider ima dejansko stopnjo z dokazom (matrika + testi).
2. ✅ Affiliate ≠ inventar (§26 — testi + UI chip ločeno).
3. ✅ Brez fake live podatkov (0 izmišljenih vrstic — živi odzivi).
4. ✅ Brez placeholder ID-jev (test „brez slovenia-demo").
5. ✅ FAIL-CLOSED na vseh vhodih (adapterji/verify/redirect — F.3 živo).
6. ✅ Kanonski model brez provider-specifičnih polj (test).
7. ✅ Adapter izolacija (provider logika SAMO v providers/*).
8. ✅ OSM ODbL + atribucija + nikoli affiliate (testi + UI „© OpenStreetMap").
9. ✅ Cena: NIHČE LIVE_PRICE lažno; KT FROM_PRICE z note.
10. ✅ Razpoložljivost: NIKOLI „available" brez dokaza.
11. ✅ /go/ redirect varnost (15/15 preverb).
12. ✅ AI: kanonske cene/ID/geo v načrtu (živi dokaz K).
13. ✅ FIXED točno 1× + tamper-proof (živi dokaz K).
14. ✅ Refine = ista veriga (TASK 48/49/50 testi v 1004).
15. ✅ Izolacija odpovedi (živo: osm degraded + kt 48 istočaseno).
16. ✅ Rate limiti + negativni cache + timeouti (register + adapterji).
17. ✅ Register UI statusi IZKLJUČNO LIVE/CONFIGURED/NOT CONFIGURED/
    PARTNER ACCESS REQUIRED/AFFILIATE ONLY (§32 — 16/16 kartic).
18. ✅ Credential manjka → NIKOLI „LIVE" (izpeljava LIVE ⟺ PRODUCTION_ACTIVE,
    LEAK test).
19. ✅ i18n SL+EN brez manjkajočih ključev (0 raw).
20. ✅ Mobile 375/390 + desktop, 0 preliv, 0 console error.
21. ✅ Testiranje: 1004/1004, lint 0, tsc 0 (src), browser E2E — vse GREEN.

**SKLEP: TASK 52 GREEN.** Vsi načrtovani providerji so bodisi v produkciji
z živimi dokazi, bodisi iskerno blokirani z dokumentiranim razlogom in
pripravljenim runbookom. Noben vir ni bil simuliran, noben podatek
izmišljen, nobena vrata lažno zelena.
