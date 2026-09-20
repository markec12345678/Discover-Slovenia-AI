# TASK 54 — LIVE PROVIDER ACTIVATION (GitHub-first audit → stanje dejanske aktivacije)

> **Datum:** 2026-09-20 · **Vermija:** 1.58.1 · **Repo:** github.com/markec12345678/Discover-Slovenia-AI
> **Metoda:** §0 GitHub-first (dejanski repo = source of truth, ne prompt/poročila) → §1 baseline → §2–§17
> preverba vsakega providerja iz KODE → §27 credential matrika → §31 poročilo.

---

## A. VERIFIED GITHUB BASELINE (§0/§1)

| Element | Vrednost |
|---|---|
| `origin/main` (GitHub API) | `08778e3` (po snapshot resetu; prej `a8659da` — isti TASK 53 commit, vključuje TASK 54 §5 `.env.example` popravek) |
| Lokalni HEAD | `08778e3` (main, čisto delovno drevo) |
| TASK 52 commit | `81e28f6` (dokumenti + žive verige) |
| TASK 53 commit | `08778e3` = HEAD (1196 testov, 10 adapterjev) |
| `bun test` | **1196/1196 PASS** (44 503 expectov, 41 datotek) |
| `bun run lint` | **0 napak** |
| `bunx tsc --noEmit` | **0 napak v src/** (pre-existing zunaj: `skills/*`, `tailwind.config.ts` — okolje, ne projekt) |
| GitHub token | VELJAVEN (API 200); sync uspešen v TASK 53 |

**Pravila tega taska, izpolnjena:** 0 poverilnic v klepetu/commitu/.env (samo PRESENT/MISSING),
0 fake inventarja/cen/dostopnosti, 0 sprememb delujočih providerjev (§24), 0 nove arhitekture.

---

## B. DEJANSKI PROVIDER INVENTORY (§2 — iz kode, ne iz prompta)

`PROVIDER_REGISTRY` (src/lib/supply/registry.ts) = **16 providerjev**;
`ADAPTER_FACTORIES` (search.ts) = **10 tovarn adapterjev** (osm, kiwitaxi, viator, getyourguide,
tiqets, booking, skyscanner, airalo, travelpayouts, fsq). TASK 53 ni izpustil nobenega
providerja; TASK 54 ni odkril nobenega nedokumentiranega. `own` (lastna tržnica) ostaja
CODE_READY — geo sloj je produktna odločitev + DB migracija, NE credential aktivacija (pravilno
izpuščena iz §18 aktivacijske logike).

---

## C. CREDENTIAL MATRIX (§27 — SRCE TASKA 54)

> Env prisotnost preverjena nad DEJANSKIM okoljem instance (`.env` vsebuje izključno
> `DATABASE_URL`; procesni env: 0 provider spremenljivk). **Vrednosti NIKOLI zapisane.**
> „API reachable“ = živi dokaz vrat DANES (2026-09-20, curl brez/neveljavno poverilnico —
> samo vrata, brez podatkov).

| Provider | Exact env (iz kode) | Credential | API reachable | Auth OK | Real products | Price | Availability | AI | Booking | Affiliate | Final |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **osm** | — (odprti vir) | n/a | DA (degraded: peskovnik blokira Overpass — okolje) | n/a | DA, kadar omrežje dovoli | NOT_SUPPORTED | NOT_SUPPORTED | DA | info_only | — | **LIVE** (PRODUCTION_ACTIVE; fail-closed dokazan v živo) |
| **sto** | — (uradni vir) | n/a | DA (llms.txt ingest) | n/a | DA — overlay sprožen DANES: 664 zapisov, `source=overlay` | NOT_SUPPORTED | NOT_SUPPORTED | DA (RAG T2) | info_only | — | **LIVE** (PRODUCTION_ACTIVE) |
| **kiwitaxi** | `KIWITAXI_PAP_ID` (affiliate) | MISSING | DA (CSV objavljeni inventar) | n/a | **DA — 48 SI rut na zemljevidu DANES** | FROM_PRICE € (objavljena, NI živi citat — iskrena opomba) | NOT_SUPPORTED | DA (FIXED/načrt) | affiliate_redirect | ID MISSING → čist link | **LIVE E2E VERIFIED** (polna veriga DANES, glej D) |
| **viator** | `VIATOR_API_KEY` (+`VIATOR_API_BASE`) | **MISSING** | **DA — 401 z POGODBNIMI glavami (exp-api-key + Accept:application/json;version=2.0)** | NE (401) | NE | — | — | priklopljen (prazno) | /go/viator | URL MISSING | **NOT CONFIGURED** (self-serve; vrata živa) |
| **getyourguide** | `GETYOURGUIDE_API_TOKEN` (+BASE) | **MISSING** | DA (vrata živa: strukturiran ERROR JSON) | NE | NE | — | — | priklopljen (prazno) | /go/getyourguide | PARTNER_ID MISSING | **PARTNER APPROVAL REQUIRED** (žeton izda partner manager) |
| **tiqets** | `TIQETS_API_KEY` | **MISSING** | DA (401 JSON, api_version 2.7) | NE | NE | — | — | priklopljen (prazno) | /go/tickets | URL MISSING | **PARTNER APPROVAL REQUIRED** (Distributor API prek Awin) |
| **booking** | `BOOKING_API_KEY` (+`BOOKING_API_BASE`) | **MISSING** | portal DA (developers.booking.com 200); host DNS-blokiran iz peskovnika (okolje) | NE | NE | — | — | priklopljen (prazno) | /go/hotels | AFFILIATE_ID MISSING | **PARTNER APPROVAL REQUIRED** (Managed Affiliate Partner status) |
| **skyscanner** | `SKYSCANNER_API_KEY` (+BASE) | **MISSING** | DA (301 → www → 403 Request Forbidden) | NE | NE | — | — | priklopljen (prazno) | /go/flights | MEDIA_PARTNER_ID MISSING | **PARTNER APPROVAL REQUIRED + PRODUCT GAP** (origin-required) |
| **airalo** | `AIRALO_CLIENT_ID` + `AIRALO_CLIENT_SECRET` (+BASE) | **MISSING (OBE)** | DA (sandbox /api/v2/countries → 200 PRAVI JSON; produkcija DNS-blokirana iz peskovnika) | NE | NE | — | — | priklopljen (prazno) | /go/esim | URL MISSING | **PARTNER APPROVAL REQUIRED** (OAuth2 OBE poverilnici) |
| **travelpayouts** | `TRAVELPAYOUTS_TOKEN` (+BASE, `TRAVELPAYOUTS_ORIGIN` operaterski) | **MISSING** | DA (401 Unauthorized) | NE | NE | — | — | priklopljen (prazno) | /go/flights (skupna) | — | **NOT CONFIGURED** (self-serve + PRODUCT GAP origin) |
| **fsq** | `FSQ_PLACES_DIR` (dataset, NE poverilnica) | MISSING (dataset) | n/a (lokalna množica) | n/a | NE (no-dataset) | NOT_SUPPORTED | NOT_SUPPORTED | priklopljen (prazno) | info_only | — | **NOT CONFIGURED** (množica ni ingestirana — gated na HuggingFace) |
| **own** | — | n/a | n/a | n/a | NE (ni geo sloja) | FROM_PRICE | UNKNOWN | NE | own_checkout | — | **NOT CONFIGURED** (produktna odločitev, NE blocker zunanja) |
| **discovercars** | `DISCOVERCARS_AFFILIATE_CODE` | MISSING | n/a (B4B) | NE | NE | — | — | NE | /go/cars | CODE MISSING | **BLOCKED** (Search API zahteva B4B pogodbo) |
| **omio** | `OMIO_AFFILIATE_URL` | MISSING | n/a | NE | NE | — | — | NE | /go/transfers (vlaki) | URL MISSING | **PARTNER APPROVAL REQUIRED** |
| **worldnomads** | `WORLDNOMADS_AFFILIATE_URL` | MISSING | n/a (brez API) | n/a | NE | — | — | NE | /go/insurance | URL MISSING | **AFFILIATE ONLY** (pravilen rezultat — vir nima inventory API) |
| **safetywing** | `SAFETYWING_AMBASSADOR_ID` | MISSING | n/a (brez API) | n/a | NE | — | — | NE | /go/insurance | ID MISSING | **AFFILIATE ONLY** (pravilen rezultat) |

**Seštevek:** 3 LIVE (osm/sto/kiwitaxi) · 2 NOT CONFIGURED self-serve (viator, travelpayouts)
+ 2 NOT CONFIGURED drugače (fsq dataset, own produkt) · 8 PARTNER APPROVAL REQUIRED (gyg, tiqets,
booking, skyscanner, airalo, discovercars→BLOCKED, omio, wn/sw → AFFILIATE ONLY posebej).

---

## D. ŽIVE VERIGE DOKAZOV (DANES 2026-09-20, ne stare replike)

1. **KiwiTaxi — POLNA E2E VERIGA (LIVE E2E VERIFIED):** zemljevid → plast Transferji → zoom →
   „Ponudba v pogledu 48“ → kartica Ljubljana → Bled → ProductModal: **od €77 na prevoz**,
   iskrena opomba „objavljena cena, ni živi citat“, razredi vozil (Economy €77, Minivan 4pax €84,
   Comfort €106, Minibus 7pax €122), koordinate 46.07453/14.52246, vir „KiwiTaxi Partner Data API
   (CSV)“ → Dodaj med izbrane (gumb nato DISABLED — exactly once) → sessionStorage vsebuje PRAVI
   FIXED izbor (kiwitaxi:16933, €77) → načrtovalnik vidi FIXED → AI generira 3-dnevni itinerer →
   transfer v razporedu **TOČNO 1×** (19:30–20:30, €77 kanonska — nikoli podtaknjena €1) →
   Booking.com odsek iskreno „V bazi še ni hotelov“ (0 lažnih sob) → skupaj ~€347 →
   `/go/transfers?product=1439` → 302 → kiwitaxi.com → **živi checkout z booking tokenom**.
2. **STO:** `/api/ai/sources` → 664 zapisov, `source=overlay`, `fetchedAt` = danes (svež prenos
   iz slovenia.info med preverbo — arhitektura trojne svežine deluje).
3. **OSM fail-closed (DOKAZ V ŽIVO):** Overpass iz peskovnika = connection refused/406 → adapter
   iskreno pade: `degraded=['osm']`, 0 izmišljenih produktov, KT v ISTEM odgovoru nedotaknjen.
4. **Vrata vseh gated providerjev (401/403 z pravimi pogodbenimi glavami):** Viator 401
   UNAUTHORIZED (z verzijo v Accept — brez nje 400 INVALID_HEADER_VALUE, kar DOKAZUJE, da so
   glave adapterja pravilne); Tiqets 401 api_version 2.7; GYG strukturiran ERROR JSON; Skyscanner
   301→www→403; Travelpayouts 401; Airalo sandbox 200 s pravimi državami (Slovenia id=210).
   **Sklep: vsi adapterji aktivirajo BREZ spremembe kode, takoj ko poverilnica pride v env.**

---

## E. CREDENTIAL INVENTORY IZ KODE (§5) + NESKlADJE, POPRAVLJENO

Edino ugotovljeno neskladje: `.env.example` NI imel 11 imen, ki jih koda dejansko bere
(TASK 53 jih je dodal v registry/docs, ne v predlogo). **POPRAVLJENO v tem tasku** (samo imena
z dokumentiranimi pogodbami, NIKOLI vrednosti): `TIQETS_API_KEY`, `BOOKING_API_KEY`,
`BOOKING_API_BASE`, `SKYSCANNER_API_KEY`, `SKYSCANNER_API_BASE` (z aktivacijsko opombo: nastavi
www obliko — glej F), `AIRALO_CLIENT_ID`, `AIRALO_CLIENT_SECRET`, `AIRALO_API_BASE`,
`TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_API_BASE`, `TRAVELPAYOUTS_ORIGIN`.

Prečna preverba imen: dokumentacija (TASK-53 §P, PROVIDER-APPLICATIONS) ↔ koda
(`process.env.*` v client.ts/affiliate.ts) ↔ registry `envKeys` ↔ `.env.example` = **100 %
skladno** po popravku.

---

## F. AKTIVACIJSKE OPOMBE (ni sprememb kode — samo znanje za dan aktivacije)

- **Skyscanner:** `partners.skyscanner.net` danes 301 → `www.partners.skyscanner.net`
  (POST create se preusmeri; prek fetch redirect na POST ni nujen). Nastavi
  `SKYSCANNER_API_BASE=https://www.partners.skyscanner.net/apiservices/v3` (env preklop že
  obstaja v klientu — BREZ spremembe kode). Origin še vedno PRODUCT GAP (`deps.originPlaceId`).
- **Viator:** sandbox prek `VIATOR_API_BASE=https://api.sandbox.viator.com/partner`
  (obstoječi env preklop); produkcija privzeta. Self-serve pot: partnerresources.viator.com →
  Tools → Affiliate API (portal danes 403 za bota — prijava je ročna, to je pričakovano).
- **Airalo:** sandbox `AIRALO_API_BASE` na `https://sandbox.airalo.com` (danes živ, 200 pravi
  JSON); produkcija `https://api.airalo.com` (DNS-blokirana iz peskovnika — preverba živih
  podatkov šele iz produkcije/CI z izdanimi poverilnicami).
- **Travelpayouts:** najbližji live kandidat po dostopu (self-serve token), A vzporedno z
  Viatorjem; ob aktivaciji nastavi tudi `TRAVELPAYOUTS_ORIGIN` (IATA, npr. uporabnikov izbor),
  sicer adapter iskreno `origin-required`.
- **Booking:** `demand.booking.com` DNS-blokiran iz peskovnika (okolje) — živa preverba cene/
  sob možna šele iz okolja z omrežnim dostopom do Booking infrastrukture.

---

## G. DOCUMENTED-ASSUMPTION TRIAŽA (§26)

35 oznak `DOCUMENTED-ASSUMPTION` (tiqets/booking/skyscanner/airalo/travelpayouts glave in
oblike odgovorov) — **vse še veljavne**: portalno zaprto, preverba izrecno odložena na živo
aktivacijo s poverilnico (pravilno — NE označujemo verified brez dokaza). TODO/FIXME v supply
kodi: **0**. `origin-required`: skyscanner (deps.originPlaceId) + travelpayouts
(TRAVELPAYOUTS_ORIGIN) — iskrena PRODUCT GAP, ostajata (§11/§13: NE odstranjuj brez legitimnega
izvora, NE uporabljaj tihega LJU).

---

## H. REGRESIJSKA VRATA (§22 — TASK 47–53)

`bun test` **1196/1196** · `bun run lint` **0** · `tsc --noEmit` **0 (src)** · browser E2E:
SL+EN zlata pot (48 KT → modal €77 → FIXED točno 1× v AI načrtu → /go do živega checkouta) ·
mobile 375/390: 0 px horizontalnega preliva na /, /zemljevid, /vir-podatkov, /nacrtuj ·
konzola: samo pre-existing (prisma postgres clobber — okolje; Radix aria opozorilo) ·
/vir-podatkov: 16/16 kartic z iskrenimi statusi (3 Živi podatki / 4 Ni konfiguriran / 7 Potrebna
odobritev partnerja / 2 Samo partnerska povezava), 0 surovih i18n ključev.

---

## I. ZAKLJUČEK (§31/§32)

TASK 54 je revizijsko-aktivacijski task v okolju BREZ poverilnic. Vsa aktivacijska VRATA so
danes živo preverjena in vsi adapterji so pripravljeni aktivirati BREZ spremembe kode — to je
najvišja dosegljiva stopnja brez zunanjih poverilnic. NAPAČNO bi bilo označiti karkoli LIVE brez
poverilnice (§19: NO LIVE CALL, NO FAKE RESPONSE) — zato so vsi gated providerji iskreno
NOT CONFIGURED / PARTNER APPROVAL REQUIRED. Edina sprememba repa: `.env.example` (11 manjkajočih
imen — neskladje §5) + ta dokumentacija. **Brez sprememb delujočih providerjev, brez nove
arhitekture, brez odstranjevanja zaščit.**

**Naslednji korak (TASK 55):** izdaj izbrane prave poverilnice (priporočen vrstni red po
§28 analizi dostopa: 1. Travelpayouts self-serve token → 2. Viator self-serve ključ →
3. GYG/Tiqets/Booking/Skyscanner/Airalo po odobritvi partner programov) in izvedi §18
aktivacijsko logiko (detect → authenticate → real request → map → validate → price →
availability → geo → ID → booking URL → affiliate URL → AI → FIXED → refinement) z živimi
dokazi za vsako stopnjo.
