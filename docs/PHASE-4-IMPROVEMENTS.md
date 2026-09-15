# Faza 4 — Tri izboljšave po Pilot Validation Gate

**Datum:** 2026-09-14 · **Branch:** `phase-4-improvements` · **Osnova:** `pilot-validation` (50a109c)
**Upravičenost:** Pilot Validation Gate je potrdil stabilen osnovni tok (Test 1 ✅, Test 4 ✅,
Test 5 ✅ do moderacije; zlata pot na 390 px kompletna) — razvojni cikel je bil po uporabnikovem
naročilu omejen na IZKLJUČNO tri izboljšave + pilotna analitika.

> Načelo faze: **izboljšave so podatkovno utemeljene in poštene** — ni marketinških razlag,
> ni generičnega "Verified", ni izmišljenih statusov. Enaka etika kot prejšnji vali.

---

## 1) »Zakaj je to priporočeno?« — razlaga vsakega postanka

**Kaj:** vsak postanek itinererja nosi kratko razlago, sestavljeno IZKLJUČNO iz dejstev.

**Kje:** `src/lib/stop-insights.ts` (čista funkcija `buildStopReasons`), enrich na OBEH poteh
generiranja (`/api/itinerary` AI + fallback) in po vsakem refine-u; prikaz v plannerju
(`/načrtuj`) in na deljeni povezavi (`/pot/[shareId]`).

**Dovoljeni viri razlage (nič drugega):**
| Vir | Primer izpisa |
|---|---|
| interes | »ugotavljen interes: romantika, narava« (bestFor ∩ interesi potnika) |
| tip skupine | »primerno za pare/družine« — SAMO kadar bestFor dejansko vsebuje značko |
| razdalja | »samo 5 km od prejšnjega postanka« / »104 km od prejšnjega postanka (daljša vožnja — razmisli o prilagoditvi dneva)« (haversine × 1,3 cestni faktor) |
| vreme | »notranja izbira — uporabna tudi ob dežju« (tip destinacije + deževen dan) / »zunanja aktivnost — za ta dan preveri vreme« |
| sezona | »v sezoni (poletje)« (bestSeason vključuje sezono potovanja) |

Zgornja meja 4 dejstva na postanek. EN razlike: interesi se preslikajo
(narava → nature …), vse ostalo dvojezično. **Ni marketinških fraz** (veljala je
blacklist preverjanja: čarobn/magičn/nepozabn/must-see/unforgettable …).

**Hrošč, ki ga je to odkrilo pri testiranju:** AI kdaj halucinira `destination_id`
(primer: `socca` namesto `soca`) — tak postanek razlage NIMA (ni podatkov = ni izmišljene
razlage), klient pa sproži analitični dogodek `invalid_location`.

---

## 2) »Prilagodi ta dan« — hitre akcije prek obstoječega refine mehanizma

**Kaj:** šest kratkih akcij na izbrani dan: **Manj vožnje · Primerno za dež ·
Počasnejši tempo · Več narave · Več hrane · Za družino**.

**Kje:** čipi v `ItineraryRefiner` (`src/components/sections/itinerary-refiner.tsx`,
dvojezično — prej je bila komponenta trdo slovenska tudi za EN uporabnike) →
ISTI endpoint `/api/itinerary/refine` z dodatnima (opcijskima) poljema `action` + `day`.

**Dve poti izvedbe (ni nov AI sistem):**
- **AI pot** (ko je žeton dejansko nastavljen): akcija se pošlje kot naravnojezikovni
  ukaz — AI jo obdela s polnim kontekstom, razlage se preračunajo.
- **Deterministična fallback pot** (`src/lib/refine-actions.ts`, čiste transformacije nad
  istim datasetom destinacij — isti vzorec poštenosti kot `generateFallbackItinerary`):
  - *Manj vožnje:* nearest-neighbor preureditev dneva + odstranitev najbolj oddaljenega
    postanka (pri izenačenju tistega z šibkejšim ujemanjem interesov), če dan presega
    100 cestnih km; sicer pošteno »ničesar ni bilo treba odstraniti«.
  - *Primerno za dež:* zunanje postanke zamenja z neuporabljenimi notranjimi
    (jame/mestna jedra/terme), sezonsko ustreznimi.
  - *Počasnejši tempo:* obdrži najbolj interesno ujemani postanek, razširi na ves dan.
  - *Več narave/hrane/družine:* zamenja najšibkejši (neustrezem) postanek z najboljšo
    neuporabljeno destinacijo s pripadajočo značko (NATURE_TYPES / bestFor "hrana" /
    bestFor "družina").
  - Vsaka sprememba se poroča v `changes[]` (kind/day/destination/replacement/km) —
    iz tega se sprožijo analitični dogodki `stop_removed` / `stop_replaced`.
  - `total_budget` se vedno preračuna; število dni se ne spreminja.

> To je uporabnikovo orodje za SAMO-POPAVLO Test 3 ugotovitve (geografsko razpotegnjeni
> dnevi fallbacka): dan s 103 km vožnje po kliku »Manj vožnje« postane enpostankovni dan,
> razlaga pa prav tako odkrito pokaže dolge razdalje (»104 km … razmisli o prilagoditvi«).

---

## 3) »Preveri praktične podatke« — samo podatki, ki obstajajo

**Kaj:** pod vsakim postankom zložljiv blok »Praktični podatki«.

**Kje:** `src/components/stop-insights.tsx` (StopInsights), prikaz samo pri obstoječih
podatkih iz dataseta destinacij.

**Prikazano (obstoječe):** trajanje · okvirna cena (€/osebo) · sezona · vremenska
ustreznost (notranja/mešana/zunanja — iz tipa destinacije) · vir (»Uredniški vodnik
destinacij«) + zadnja posodobitev (2026-09-13, git-zabeležena sprememba dataseta).

**NI prikazano (ker ne obstoja):** parkiranje/odpiralni časi za destinacije — ti obstojejo
samo pri partnerjih/lokalih (kjer se prikazujejo tam, z oznako vira ponudnika).
**Prazno ≠ izmišljeno.**

**Opozorilo (vedno):** »Pred obiskom preveri urnike, cene in dostopnost na uradni strani
lokacije.« + povezava na hub stran destinacije (`/destinacija/[slug]`).

**Brez generičnega zelenega "Verified"** — dokler ni dejanskega postopka potrjevanja.
Ob tem je bil pošteno popravljen tudi noga deljene poti (`shared-trip.tsx`): prej
»Načrt generiran z AI · **vsi kraji preverjeni**« (utrjetna trditev brez postopka
potrjevanja) → zdaj »Predlog poti · pred obiskom preveri urnike in cene«.

---

## 4) Pilotna analitika — merjenje zlate poti

**Načelo:** najpomembnejša metrika NI število ustvarjenih itinererjev, ampak
**delež uporabnikov, ki načrt dobi, ga razume, ga spremeni ali shrani**.

**Infrastruktura:**
- klient: `src/lib/planner-analytics.ts` (`trackPlannerEvent` — fire-and-forget,
  keepalive, anonimni sessionId UUID v localStorageju, brez PII)
- strežnik: `POST /api/analytics/event` (`src/app/api/analytics/event/route.ts`) —
  STREŽNIŠKA whitelist imen, rate limit 60/min, sanitizacija props (max 12 ključev,
  max 120 znakov), zapis v obstoječi model `AnalyticsEvent` (type = `planner_<ime>`,
  metadata = JSON { props, path }) — **ni spremembe sheme**.

**Dogodki uspeha** (železna pot):
`planner_started` (prva interakcija z obrazcem) → `planner_submitted` →
`planner_result_rendered` → (`day_adjusted` / `planner_refined` / `stop_replaced` /
`stop_removed` / `weather_alternative_used` / `map_opened` / `provider_detail_opened` /
`affiliate_clicked`) → `itinerary_saved`

**Dogodki neuspeha:**
`planner_error` · `empty_result` · `invalid_location` (ID izven dataseta — AI
halucinacija) · `unrealistic_day` (dan > 250 cestnih km — prag geo validatorja,
haversine × 1,3) · `save_failed` · `refine_failed` · `result_session_ended_without_action`

**Definicija opustitve (dokumentirana):** rezultat prikazan → 45 s brez refine-a
ali shranjevanja → uporabnik zapusti stran (pagehide/unmount, keepalive fetch preživi
zapiranje zavihka) → `result_session_ended_without_action` { sekunde gledanja, dni, vir }
(P1-3: preimenovano iz `user_abandoned_after_result` — proxy signal, NE dokaz
nezadovoljstva; definicije vseh dogodkov: docs/ANALYTICS-EVENTS.md).
Refine/shranitev stanje označi kot angažirano in opustitev prekliče.

**Priključene točke:** planner (started/submitted/result/error/empty/invalid/
unrealistic/saved/abandoned), refiner (refined/day_adjusted/stop_*/refine_failed/
weather_alternative_used), BookingPanel (affiliate_clicked s ponudnikom+destinacijo
iz /go/ povezave, provider_detail_opened na »Obišči« partnerja), TripTimeline
Navigacija + stran /zemljevid (map_opened).

**Poročanje:** dogodki so v `AnalyticsEvent` tabeli (type `planner_*`) — poizvedba
združuje po tipu; strežniški funnel (`PageView.funnelStep`) ostaja nespremenjen
(`itinerary_generate` / `itinerary_saved` / `affiliate_click`).

---

## Validacija

- `tsc --noEmit` 0 napak (src), `eslint` 0 napak/0 opozoril na spremenjenih datotekah.
- `scripts/phase4-verify.ts` (novo orodje, isti vzorec kot pilot-*): lokalno 9/9 ✅
  (razlage SL+EN, brez marketinških fraz, hitra akcija, whitelist 400).
- Lokalni E2E s siljenim fallbackom (`DSA_FORCE_AI_OFF=1`, temp patch — revertan):
  vseh 6 akcij deterministično (odstranitev outlierja 103 km → 0 km, zamenjave
  Triglav→Piran hrana, Slovenj Gradec→Postojnska jama družina, pošteni »Ni sprememb«).
- agent-browser 390×844: rezultat z razlagami ✅, praktični podatki se odprejo
  (Trajanje/cena/sezona/vir+posodobljeno) ✅, vsi 6 čipov ✅, brez generičnega
  Verified ✅, 0 horizontalnega preliva ✅, hitra akcija klik → posodobitev ✅.
- Produkcija (po deployu): `bun scripts/phase4-verify.ts` — glej README.

## Spremenjene datoteke

| Datoteka | Sprememba |
|---|---|
| `src/lib/stop-insights.ts` | NOVO — razlage postankov (čiste funkcije, haversine, tipi) |
| `src/lib/refine-actions.ts` | NOVO — 6 determinističnih hitrih akcij |
| `src/lib/planner-analytics.ts` | NOVO — klient analitike + opustitveno merjenje |
| `src/app/api/analytics/event/route.ts` | NOVO — whitelist endpoint |
| `src/components/stop-insights.tsx` | NOVO — razlaga + praktični podatki (UI) |
| `src/components/map-opened-tracker.tsx` | NOVO — map_opened na /zemljevid |
| `src/lib/types.ts` | `LocationVisit.reason` + `QuickActionId`/`RefineChange` |
| `src/app/api/itinerary/route.ts` | enrich razlag na obeh poteh |
| `src/app/api/itinerary/refine/route.ts` | action+day (deterministična veja) + preračun razlag |
| `src/components/sections/itinerary-planner.tsx` | StopInsights + analitika + abandonment |
| `src/components/sections/itinerary-refiner.tsx` | dvojezičnost + »Prilagodi ta dan« čipi |
| `src/components/sections/booking-panel.tsx` | affiliate_clicked + provider_detail_opened |
| `src/components/trip-timeline.tsx` | map_opened (Navigacija) |
| `src/components/shared-trip.tsx` | razlaga na /pot + poštena noga |
| `src/app/zemljevid/page.tsx` | MapOpenedTracker |
| `scripts/phase4-verify.ts` | NOVO — validacijsko orodje |
