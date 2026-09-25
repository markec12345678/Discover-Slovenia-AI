# PRODUCT-FUNCTIONALITY-MATRIX — Discover Slovenia AI

> **Datum:** 2026-09-26 · **Verzija:** 1.100.3 (audit) / 1.102.0 (T5-B) / 1.104.0 (T5-D dostava) · **HEAD ob auditu:** a854404 · **Popravljeni v T5-B (1.102.0):** H1, H2, M3-chat, M4, M5, M6 · **Popravljeni v T5-C (1.103.0):** M11, M9-pot · **Popravljeni v T5-D (1.104.0):** M1, M7, M8, M9-arhiv, M10 (označeno spodaj)
> **Namen:** Issue #5 „COMPLETE PRODUCT FUNCTIONALITY / DETERMINISTIC SDK + SCRIPTS FIRST" — Faza 2 (popolna funkcijska matrika), Faza 3 (AI odvisnosti), Faza 4 (SDK/scripts), Faza 5 (vrzeli). Izdelano iz TREH neodvisnih read-only revizij (dokazi `file:line`): [T5-a1 AI-odvisnosti](audit/t5-a1-ai-dependency.md) · [T5-a2 Discovery/Planning/Import](audit/t5-a2-capabilities-discovery-planning-import.md) · [T5-a3 Trip/Map/Offline/Skupnost/L10n/SDK](audit/t5-a3-capabilities-trip-map-offline-community-l10n-sdk.md).
> **Metoda:** read-only analiza kode (src/, public/, scripts/, prisma/, docs/), žive sonde na lokalnem dev strežniku in produkciji (Render + Vercel), NI sprememb aplikacijske kode.

## 1. Izhodiščni dokazi (Faza 1)

| Vrata | Dokaz |
|---|---|
| HEAD | `a854404` = origin/main, working tree čist |
| Testi | **2745/2745 pass** (55.323 expect, 107 datotek, 14,3 s) |
| Lint | `bun run lint` — **0 napak** |
| Typecheck | `tsc --noEmit` — 0 napak v `src/` (2 predhodni v `skills/`, izven aplikacije) |
| GitHub CI (a854404) | Build ✓ · Lint & Type Check ✓ (celoten pipeline zelen — quality + Postgres migracije + drift vrata + functional smoke) |
| Render (primarna) | `/api/health` **ok**, v1.100.3, 17/17 startup korakov, 0 ne-ok; migrate:baseline ok (heal dogodek 1.100.1) |
| Vercel (sekundarna) | živa, `/api/health` ok v1.100.3 (hosted Postgres, Pot B) — druga zahteva počasna (hladen zagon) |
| PWA datoteke | `public/manifest.json` (113 vrstic) · `public/sw.js` (411, sw3) · `public/offline.html` (741) · ikone 192/512 |

## 2. Legenda statusov

**DELA** · **DELA Z OMEJITVAMI** (funkcionalno, a z dokumentirano pomanjkljivostjo) · **AI-ONLY** (brez AI ključev vrne iskreno napako — ni deterministične rezerve) · **MANJKA** (ne obstaja) · **API-ONLY** (ruta živi, UI je ne kliče) · **DEMO ONLY** (namerno simulirano, nikoli „production-ready") · **PROVIDER NOT ACTIVATED** · **STRIPE NOT ACTIVATED** · **ZASTARELO** (dokumentacija/opis drifter od kode).

## 3. Funkcijska matrika po domenah

Števci: **95 zmožnosti, 89 DELA/DELA Z OMEJITVAMI, 2 AI-ONLY, 1 MANJKA, 1 broken-UX (HIGH)**. Podrobne vrstice z dokazi `file:line` so v treh revizijskih dokumentih; tu je konsolidat.

### A. Discovery (14 zmožnosti — vse dosegljivo iz navigacije)

| Zmožnost | Deterministično | AI | Test | Status |
|---|---|---|---|---|
| Homepage (AI-first hierarhija + hero quick input 0-AI) | DA | ne (hero parse je keyword) | issue3-ux | DELA |
| Destinacije listing (38, filtri država/regija/tip/cena/ocena + sort) | DA | ne | task69/task62/wave7 | DELA |
| Destinacija detail hub + things-to-do/guide/itinerary/best-time (SSG) | DA | ne | wave7 (§18/A git-truth) | DELA |
| POIs (OSM overpass + describe lazy) | DA | describe: optional (fallback 1 vrstica) | map-pins/wave8 | DELA |
| Doživetja (DB + modal detail) | DA | ne | task87/task84 | DELA |
| Lokali (B2B imenik, DB) | DA | ne | task85/99a + CI smoke | DELA |
| Dogodki (statični koledar + „Dodaj v mojo pot") | DA | ne | events-i18n | DELA |
| Vodiči (adria SSG) + blog (SL-only) | DA | ne | sitemap sampling | DELA Z OMEJITVAMI (EN brez bloga — LOW) |
| Zbirke (collections modal) | DA | ne | task84 | DELA |
| Smart search (NL iskanje po platformi) | fallback DA (keyword ≤16 s) | optional (hard cap 15 s) | issue5-t5b-smartsearch-nav (16) | DELA — **H1 ZAPRT v 1.102.0** (vse 4 skupine navigirajo; browser dokaz: klik Bled → /destinacija/bled) |
| `/api/destinations*` (javni JSON) | DA | ne | task99a | API-ONLY (LOW, dokumentirati) |
| Explore hub + tržnica + zemljevid | DA | ne | — | DELA |

### B. Planning (21 zmožnosti — „golden truth" domena)

| Zmožnost | Deterministično | AI | Test | Status |
|---|---|---|---|---|
| AI planner (engine=auto, hard cap 70 s) | fallback DA | optional | itinerary-validation + CI smoke POST | DELA |
| **Deterministični motor — UI stikalo „Brez AI"** (`/načrtuj`, engine:"deterministic", 0 LLM, sonda <1 s) | **DA — 0 žetonov/0 omrežja/0 ure** | **ne** | **task100 (39 testov + purity guard)** | **DELA — golden truth** |
| Fallback ob odpovedi AI (badge „fallback") | DA | sprožilec | task100/task53 | DELA |
| Deterministična personalizacija (§10: party/pace/budget/weekday zaprtja/deževna logika) | DA | ne | wave4 | DELA |
| Itinerary quality/validacija + budget recompute (AI `total_budget` se IGNORIRA) | DA | ne | wave1 | DELA |
| Geo-validacija (km/dan, noge, schedule_gap) | DA | ne | geo-validation/task51 | DELA |
| Route optimization (2-opt/izčrpna ≤7) + gumb „Krajša pot" | DA | ne | **wave6 (41 testov)** | DELA |
| intentLocked (§21 — namerni vrstni red zamrznjen) | DA | ne | wave6 (517–693) | DELA |
| OSRM road truth (cache 24 h, circuit breaker; hevristika ×1,3 fail-open, razkrito) | DA | ne | task51-routing-failure | DELA |
| Time windows/sloti + repairScheduleGaps | DA | ne | schedule-slots | DELA |
| Opening hours truth (OPEN/CLOSED/UNKNOWN, DST) | DA | ne | wave7 §18/A | DELA |
| Vreme (Open-Meteo brez ključa; weatherEstimated iskren) | DA | ne | task88/task66 | DELA |
| Refine — hitre akcije (6 čipov, 0 LLM, primarna pot) | DA | ne | wave4/issue3 | DELA |
| Refine — prosti jezik (hard cap 60 s; fallback = echo + opozorilo) | fallback DA | optional | — | DELA Z OMEJITVAMI |
| PlanCopilot „Vprašaj" (computed-first, brez ugibanja) | DA | sfraziranje optional | plan-qa.test (29) — **M5 ZAPRT v 1.102.0** | DELA |
| Plan-check validator tujih načrtov (0 AI, zigzag) | DA | ne | wave6 + živa sonda | DELA |
| Leg suggestions + meal stops (koridor ≥75 min) | DA | ne | — | DELA |
| Ročna urejanja (remove/optimalno zaporedje/dodaj dogodek/kraj) | DA | ne | — | DELA — **M7 ZAPRT v 1.104.0 + D6-B v 1.105.0** (premik ↑/↓ + HTML5 drag + premik MED dnevi z mejno logiko; +dan/−dan 1–14 s potrditvenim dialogom ob postankih) |
| Shrani/deli/e-pošta/ics/TTS/GO persist | shrani/deli/ics DA | TTS: AI-only | wave5/task89 | DELA (TTS → F) |

### C. Start Anywhere / import (6 vhodnih tipov)

| Vhod | Deterministično | AI | Test | Status |
|---|---|---|---|---|
| Besedilo (NL keyword parse SL+EN → interesi) | DA | ne | issue3 tag-align | DELA |
| URL (SSRF bloklista, redirect re-validacija, 8 s fetch) | DA | ne | issue5-t5b-ingest-ssrf (20) — **M6 ZAPRT v 1.102.0** | DELA |
| PDF (unpdf, %PDF- magija, max 60 strani; skeniran → poštena 422) | DA | ne | **task95 (94–352)** | DELA |
| Google Pins (Takeout JSON/KML/besedilo; ≤25 km) | DA | ne | pins-ingest.test (29) — **M4 ZAPRT v 1.102.0** | DELA |
| Slika/screenshot | ujemanje DA | **HARD — VLM; 502 brez ključev** | — | **AI-ONLY (ostaja iskrena izjema — slika nima besedila za det. parser)** |
| Rezervacije (parse slika/PDF/besedilo/ICS → normalizacija → POTRDI) | normalizacija + parse-besedilo/PDF/ICS DA | parse: AI ali **deterministični regex fallback** | issue5-t5d (29) + issue6-d6b-edge (28) — **M1 ZAPRT v 1.104.0, ICS dodan v 1.105.0** (slika ostaja AI-ONLY) | **DELA** — brez ključev: `method:"deterministic", via:"fallback"`; smeti → iskren 422 + nasvet |

### D. Trip platform (17 zmožnosti)

Vse DELA (dokazi T5-a3 A1–A17): save (SHA-256 editToken + timing-safe), load/deljen pogled (404-nevidnost zasebnih), PATCH na mestu (CAS), **strežniške revizije + undo sklad (§22)**, sodelovanje (7-dnevna TTL vabila, vloga rangi owner/editor/viewer, `trip-permissions.ts` ena točka resnice), dokumenti (.ics + register — **PDF izvoz: SL+EN + noge km/min + rezervacije — M8 ZAPRT v 1.104.0, dopolnjen v 1.105.0 (D6-B)**), stroški/proračun (TripExpense + 5 vedric), rezervacije (JourneyBooking lifecycle DRAFT→CONFIRMED→used, izvor vedno razkrit), transport (journey orchestrator), gost→račun kontinuiteta (localStorage → claim `/api/user/trips/claim`), svežina (FRESH/STALE/UNKNOWN/LIVE §17/§19), provenance.

### E. Map / Go Mode (13 zmožnosti)

Vse DELA: Leaflet + markercluster, statični FSQ sloj (125.445 točk, ~8 ms, zoom-aware, poštena atribucija), OSRM route rendering, Go Mode z GPS premico (iskreno labelirano), ETA (hevristika ×1,3 @ 55 km/h — „NEZNANO brez vira prometa"), navigacijski handoff (geo: URI / Google Maps), K-7 most (AI načrt → Go Mode gumb „Zaženi Na poti"), offline zemljevid videna območja (tiles cache-first).

### F. Offline / PWA (7 zmožnosti)

Vse DELA: manifest popoln (ikone any+maskable, 4 shortcuts, screenshots — description zastarel „22 destinacij", LOW), sw.js 4 strategije (shell 400 / plans 40 / tiles 600 / img 120, LRU trim), network-first za deljene načrte + `/na-poti`, push handlerji, update toast, samoizpolnitvena offline.html. **Omejitev dokaza (MEDIUM):** §16 „realni E2E dokaz" je harness-ravni (pwa-test.ts v mock SW scope; task73 prek `new Function` + stub DOM) — brskalniški offline test bo v T5-C.

### G. Skupnost (8 zmožnosti — 100 % DB-backed, 0 demo/mock)

Vse DELA: glasovi (TripVote unique), komentarji (2–500 znakov), všečki (idempotentni toggle), ankete (prestavitev glasu, avtor edini zaključi), potni dnevnik (rating 1–5), vodniki (tips, editToken za urejanje), skupnost načrtuje (server komponenta), wishlist (localStorage + DB hibrid). Anonimna identiteta `client-identity.ts`, enotna vrata `communityTripGate`.

### H. Lokalizacija

**sl (default) + en (/en prefix) s testirano pariteto** (task71: identična množica ključev, 2262 vrstic vsak; fragment sistem ×39 parov + merge skripta). Preklop URL prefix (trda navigacija zaradi Router Cache). DST-varovana datumска aritmetika (task79). Omejitve: de/it legacy ostanki (LOW), dvojni mehanizem i18n JSON + inline L slovarji (LOW, zavestna izbira).

### I. Zaupanje / kakovost podatkov (razred A — 100 % AI-free, dokazano)

Razdalje (OSRM+hevristika), urniki (repairScheduleGaps), geo urejanje (route-order/route-intent), zaprtja (opening-hours + closureLevel F5.5), vreme (Open-Meteo prepiše AI ali `weatherEstimated`), aritmetika proračuna (recompute), DB mutacije (save sanitizira + revalidira), permissions (auth-guards/trip-permissions), validacija (itinerary-sanitize/supply), rezervacijski lifecycle (stateless parse + potrditev), revizije (CAS). **Noben `generateCompletion` klic teh ne dotika** (T5-a1 dokaz).

### J. Sistem / UX

Auth (NextAuth + anonimna identiteta + claim kontinuiteta) DELA · My Trips (`/moja-potovanja`) DELA · navigacija desktop+mobilni meni DELA · responsive (mobile-first) DELA · prazna/loading/error stanja DELA · 404 DELA · AI odpoved → `source:"fallback"` badge povsod DELA · prilagojenost (a11y) — osnovno (semantični HTML, AIAA labeli — globji pregled ni bil del tega audita).

### K. SDK / scripts + komercialne poti (Faza 4)

| Vidik | Ugotovitev |
|---|---|
| Arhitektura SDK | **Koherentna**: `src/lib` = en vir resnice; 14+ skriptnih uvozov `../src/lib/*`; API/UI/testi uvažajo iste module; bivša duplikacija motorja route↔lib odstranjena (1.87.0); route-order NI dupliran |
| **Preostali dolg primitivov (HIGH)** | **H2 ZAPRT v 1.102.0** — `src/lib/geo-distance.ts` (haversineKm + ROAD_FACTOR + AVG_SPEED_KMH + heuristicLeg*): 10/11 lokacij bit-identično konsolidiranih; 1 dokumentirana izjema `journey/orchestrator.ts:65` (anti-NaN objem, namerno ločena) |
| Scripts inventar | 74 datotek — **M9 ZAPRT v 1.104.0**: ~35 zgodovinskih premaknjenih v `scripts/archive/` (git mv, 2 importa popravljena na `@/` alias, `archive/README.md` s tabelama tierov; izjeme ostanejo žive: `db/p9-smoke-cleanup.ts` — referenca production-smoke.sh, `client-test.d.ts` — ambientna deklaracija); revenue-analysis.ts pot popravljen že v 1.103.0 |
| CI e2e | **M10 ZAPRT v 1.104.0** — `scripts/ops/ci-e2e.sh` (8 korakov: načrt → save → ogled → PDF → revizija → 409 → parse → 422) pognan v CI build jobu za functional-smoke; zavrne ne-lokalne cilje (piše v DB); lokalno 9/9 zeleno |
| `/api/stripe`, `/api/checkout`, `/api/orders` | **STRIPE NOT ACTIVATED** — live-capable a DORMANT, fail-closed (brez `STRIPE_SECRET_KEY` → 503; demo izrecen `DSA_DEMO_PAYMENTS=1`, nikoli tiha) |
| commissions.ts / affiliate.ts | commissions = realna DB logika (12 %, mesečni računi, pdf-lib — B2B) · affiliate = LIVE (env-gated, `monetized:false` brez ID-jev) |
| FEATURE-FLAGS.md | **ZASTARELO (MEDIUM)** — opisuje `PAYMENTS_ENABLED`, ki v kodi NE obstaja (dejansko: `isStripeConfigured`/`isStripeDemo`) |

## 4. AI-odvisnostna matrika (povzetek — polna tabelа v T5-a1, 25 klicnih mest)

| Razred | Število | Povzetek |
|---|---|---|
| **A — mora biti deterministično** | 11 domen | **100 % AI-free, dokazano** (razdalje/urniki/urejanje/zaprtja/vreme/proračun/DB/permissions/validacija/rezervacije/revizije) |
| **B — mora imeti fallback** | 4 površine | itinerary ✓ (auto-fallback 70 s + naravna pot) · refine ✓ (echo + opozorilo) · ingest-image ✗ (**fallback MANJKA**) · bookings/parse ✗ (**fallback MANJKA — tudi PDF/besedilo!**) |
| **C — AI izboljšava** | 13 površin | Vse z iskrenimi determinističnimi rezervami RAZEN TTS (enojni vir z-ai SDK, 502/503 ob padcu) |

**Ključne lastnosti verige:** en hub `ai-client.ts` (OpenRouter→Gemini→Puter→z-ai→null; 0 direktnih SDK klicev izven); hard cap IMAMO SAMO na 3/19 klicev (itinerary 70 s, refine 60 s, smart-search 15 s) — preostalih 11 teče na privzetem 150 s (chatbot fetch brez AbortControllerja) — **MEDIUM**. Fail-open analiza: **nobena halucinirana številka ne postane kanon** (cene→kanon, vreme→prepis, budget→preračun, supply→revalidacija, ID-ji→DB filter). Persistirana AI vsebina je grounded + pošteno označena RAZEN: seo-faq 90-dnevni cache fallbacka (LOW), poi-descriptions trajni cache fallbacka (LOW), admin AI tagi brez review (LOW).

## 5. Seznam vrzeli (konsolidat, po resnosti)

**BLOCKER: 0** — izrecna no-op ugotovitev z dokazom (tri neodvisne revizije niso našle nobene blokirane zlatе poti; vse jedrne pote so kodno celovite in produkcijsko dosegljive).

### HIGH (2) → T5-B

| # | Vrzel | Dokaz | Predlagan popravek |
|---|---|---|---|
| H1 | SmartSearch mrtvi kliki — noben rezultat ne navigira (niti destinacije); edino globalno iskanje konvergira v slepo ulico | navigation.tsx:420 (brez `onSelectDestination`); smart-search.tsx:293–343 (vsi onClick = `handleClose()`) | Dodaj `onSelectDestination` → `/destinacija/[slug]`; listings → `/lokali`, izdelki/doživetja → modal ali `/trznica` |
| H2 | Duplikacija determinističnih primitivov: haversineKm ×11, ROAD_FACTOR ×5, AVG_SPEED ×3 — tveganje drifta formule/konstant | 11 lokacij (K. tabela zgoraj) | En `src/lib/geo-distance.ts` (haversineKm + ROAD_FACTOR + AVG_SPEED + heuristicLeg) + import swap vseh 11 datotek + test enačnosti (stare vrednosti ≡ nove) |

### MEDIUM (11) → T5-B/C po vrednosti

| # | Vrzel | Dokaz |
|---|---|---|
| M1 | Vision poti brez determinističnega fallbacka — ingest-image VEDNO 502 brez ključev; bookings/parse (slika AND PDF AND besedilo) VEDNO 502 | ingest-image/route.ts:138–149; bookings/parse/route.ts:132–233 | **ZAPRT v 1.104.0 (T5-D):** `reservation-text-parse.ts` (473 vrstic regex parser) na PDF (unpdf besedilo) + besedilo poteh; slika ostaja iskrena izjema (VLM nima besedila) |
| M2 | TTS enojni vir (z-ai SDK) brez verige — produkcijska zanesljivost nedokazana | tts-engine.ts:163 |
| M3 | Hard cap samo 3/19 AI klicev — chat lahko čaka ~150 s pred fallbackom; klientni fetch brez AbortController | ai-client.ts:310; chatbot.tsx:931 |
| M4 | pins-ingest.ts (403 vrstice, 3 formati) — 0 testov | rg = 0 zadetkov v __tests__ |
| M5 | plan-qa.ts + plan-facts.ts (~700 vrstic det. Q&A) — 0 testov | rg = 0 |
| M6 | /api/itinerary/ingest ruta (SSRF plast) netestirana na ravni route | edini test = task95 (PDF cevovod) |
| M7 | Planner: ni drag/drop prestavljanja, ni dodajanja/odstranjevanja dneva | rg draggable|addDay = 0 | **ZAPRT v 1.104.0 (T5-D):** `planner-reorder.ts` + `planner-days.ts` + UI (GripVertical + ↑/↓ tipkovniški gumbi + HTML5 drag; +dan/−dan 1–14) + i18n SL/EN + testi |
| M8 | PDF izvoz itinererja ne obstaja (pdf-lib že v uporabi za račune) | A16 | **ZAPRT v 1.104.0 (T5-D):** `pdf/trip-itinerary-pdf.ts` (455 vrstic, č/š/ž, paginacija) + `GET /api/itinerary/shared/[shareId]/pdf` (attachment, 30/h) + gumb na /pot; 12 testov |
| M9 | ~30 zastaralih skript brez arhiva; revenue-analysis.ts pokvarjena pot `/home/z/Discover-Slovenia-AI` | revenue-analysis.ts:8 | **ZAPRT (pot v 1.103.0, arhiv v 1.104.0 T5-D):** 35 datotek v `scripts/archive/` z README; tsc/lint/test identični bazni |
| M10 | CI poganja 0 e2e skript; §16 dokaz je harness-ravni, ne brskalniški | pwa-test.ts:4–9 (iskreno prizna) | **ZAPRT v 1.104.0 (T5-D):** `scripts/ops/ci-e2e.sh` v CI build jobu (API-dim zlata pot, 8 korakov, ~10 s); brskalniški offline dokaz ostaja harness-raven (iskreno) |
| M11 | FEATURE-FLAGS.md drift — opisuje neobstoječi `PAYMENTS_ENABLED` sistem | FEATURE-FLAGS.md:7 |

### LOW (13) → T5-C ali dokumentirano

seo-faq AI v SSR renderu + 90-dnevni fallback cache · poi-descriptions trajni fallback cache · ask-local kvota porabljena tudi ob fallbacku · admin AI tagi brez review · zastarela trditev „uporablja z-ai-web-dev-sdk" (i18n:832) · /api/destinations API-only · EN /vodici brez bloga · URL/PDF/pins samodejna generacija brez eksplicitne potrditve · manifest description „22 destinacij" · de/it legacy · ročni sw.js byte-bump · dai-plans LRU 40 · dvojni lokalizacijski mehanizem.

### INFO (2)

config:secrets ne izpiše degradiranega AI načina v /api/health (svetujemo informativen korak) · Go Mode vreme zahteva signal (iskreno prikazano).

## 6. Zlate poti — stanje ob auditu (brskalniški E2E dokaz pride v T5-C)

| # | Pot | Stanje |
|---|---|---|
| 1 | Domov → ustvari pot → deterministični itinerer → validacija → zemljevid → shrani → Moja potovanja → znova odpri | ✓ kodno + živa sonda (POST engine=deterministic <1 s; save/claim/revizije testirane) |
| 2 | Domov → Start Anywhere → uvoz besedila → destinacije → itinerer → shrani | ✓ (keyword parse 0-AI) |
| 3 | Start Anywhere → PDF/slika/screenshot/povezava | povezava ✓ · PDF ✓ (unpdf) · slika = AI-ONLY (iskrena izjema, M1 ostalo zaprto za besedilo/PDF) |
| 4 | Shranjena pot → urejanje → prestavi → intentLocked → optimizacija → revizija → undo | ✓ (wave6 41 testov) |
| 5 | Shranjena pot → Go Mode → naslednji postanek → pot → ETA → odpiralni časi/vreme → handoff | ✓ (K-7 most, ETA hevristika iskreno) |
| 6 | Shranjena pot → offline → zapri/odpri → itinerer/Go Mode → ponovna povezava | ✓ mehanizmi (sw strategije) — dokaz harness-ravni (iskreno); API-dim CI e2e od 1.104.0 |
| 7 | Pot → deljenje → zasebnost/prevzem → pravilen dostop prejemnika | ✓ (§23: claim zahteva editToken, 404-nevidnost) |
| 8 | Pot → sodelovanje → owner/editor/viewer | ✓ (§13: vrata + TTL) |
| 9 | Pot → uvoz rezervacije → lifecycle → povezava z itinererjem | parse besedilo/PDF ✓ (deterministična rezerva od 1.104.0; slika AI-ONLY — iskrena izjema); ročni vnos + lifecycle + normalizacija ✓ |
| 10 | Pot → proračun/stroški → skupne → revizije → persistenca | ✓ (5 vedric + TripExpense) |
| 11 | Brskanje → filtri → podrobnost destinacije → POI → dodaj v izlet | ✓ — SmartSearch navigacija H1 zaprta v 1.102.0 (browser dokaz: klik Bled → /destinacija/bled) |

## 7. Iskren predodgovor na končno vprašanje Issue #5

> *Ali lahko uporabnik danes uporabi celoten jedrni produkt Discover Slovenia end-to-end brez AI ključa, brez živih komercialnih providerjev in brez Stripe?*

**Predhodni odgovor (audit-raven): DA — z dokumentiranimi izjemami.** Načrtovanje (vključno stikalom „Brez AI"), celoten Class A sloj, trip platforma, zemljevid/Go Mode, offline/PWA, skupnost, lokalizacija delujejo z nič AI ključi in nič providerji/Stripe (Stripe je fail-closed dormant). Izjeme, ki brez AI ključev vrnejo iskrene napake (ne tihe pokvarjenosti): uvoz slike (502), parse rezervacij iz dokumentov (502 — ročni vnos ostane), TTS zvok (502/503), NL refine (original + opozorilo), NL iskanje/klepet (deterministični fallback). **Končni odgovor bo podan v T5-C po brskalniškem E2E dokazu na produkciji (Render + Vercel) z izklopljenimi ključi.**

---

*Zaključek T5-D (1.104.0): vsi MEDIUM feature-razredi zaprti (M1/M7/M8/M9/M10 + prej H1/H2/M3–M6/M11). Odprte ostanejo samo dokumentirane LOW/iskrene izjeme (slika VLM, TTS, brskalniški offline dokaz) — glej Issue #5 komentarje za končno poročilo.*
