# TASK 50 — REAL USER / ADVERSARIAL ITINERARY VALIDATION (1.55.0)

> Cilj: ugotoviti, ali lahko resničen turist dejansko uporabi sistem za
> izdelavo izvedljivega slovenskega itinerarja — z reproducibilnimi
> scenariji, dejanskimi podatki in determinističnimi kriteriji (ne
> subjektivno oceno). AUDIT + VALIDACIJA + P0/P1 popravki.

---

## 1. REPOSITORY FORENSICS (§2)

| Postavka | Vrednost | Dokaz |
|---|---|---|
| HEAD pred taskom | `0b6b400` (= origin/main, čisto drevo) | `git status --porcelain` = 0 |
| TASK 49 reproducibly GREEN | **DA** | 832/832, lint 0, tsc 0 v `src/` |
| `selection-verify.ts` v obeh rutah | DA | generacija r. 409/754, refine r. 302/320 |
| Refinement server validation | DA | Task 48 P0 + Task 49 verify |
| Canonical price verification | DA | KT dataset = kanon (živi dokazi spodaj) |
| FIXED invariants | DA | E1–E3 točno 1× s kanonskimi cenami |
| OSM/Overpass stanje med auditom | **NEDOSEGLJIV iz peskovnika** (živi §12 test) | `overpass-unreachable`, `degraded:["osm"]` |

Stanje po popravilih: **859/859 testov** (832 + 22 TASK 50 + 5 price_unverified
v obstoječi datoteki), lint 0, tsc 0 v `src/`.

---

## 2. METODA — SCENARIO HARNESS (§3)

30+ scenarijev skozi **dejansko aplikacijsko pot** (živi dev strežnik,
realni AI / realen fallback, realni supply dataset, realne OSRM noge,
realna validacijska plast):

- **Del 1 (20)**: A1–A4 (osnovni popotniki), B1–B4 (proračun), C1–C5
  (geografija), D1–D3 (prevoz/FIXED), E1–E4 (FIXED omejitve)
- **Del 2 (19)**: F1–F5 (refinement), T1–T10 (adversarial tampering),
  H1 (AI halucinacija), V1/V2 (večerni/prekrivajoč termin), P1 (EN pariteta)
- **Echo-proof (8 preverjanj)**: ciljani dokaz P0 popravila (spodaj)
- Deterministični preverjevalci: časi (zaporedje/prekrivanja/veljavnost),
  geo (Slovenija bounding box, null island, gibanje 120 km/h + 25 km),
  gostota (>8 postankov/dan, >16 h), ID-ji (T1 ∪ provider:id), OSM nikoli
  cenjen, FIXED točno 1× + kanonska cena/geo/naslov, budget semantika,
  duplikati.

Vsak korak je poganjal obe poti (AI kvota sveža vs izčrpana → fallback),
ker se napake razlikujejo po viru.

---

## 3. NAJDENE LUKNJE — prioritizacija + dokazi

### P0 — REFINE ECHO VEJA: SUROV KLIENTOV PAYLOAD KOT "ITINERARY" — POPRAVLJENO

**Vrzel**: ko AI odpove (upstream 429 — pogosto: 13/18 refine zahtev v
harnessu) in zahteva ni quick-action, je r. 827 vračala **surov klientov
`current`** kot itinerary z oznako fallback — BREZ verify/invariant/
budget/geo/legs plasti.

**Živi dokazi (pred popravilom, harness 19. 9. 2026)**:

| Vektor | Klient poslal | Vrnjeno (pred) | Pričakovano |
|---|---|---|---|
| T10 stale current | KT postanek s €1 | **€1** (kanon €77) | €77 |
| H1 fabrikantrt ref | `viator:99999` s €500 | **€500 prikazano** | unknown |
| H1 fabrikantrt ref | `kiwitaxi:424242` s €99 | **prisoten s €99** | reject |
| V1 prekrivanje | 12:00–16:00 po 09:00–13:00 | **overlap + ZASTARELA geoValidacija "ok" iz klienta** | popravljen/označen |

**Fix**: echo veja zdaj izvede ISTO verigo kot quick-action pot —
`validateItinerarySupply` (overjena izbira + currentStops), sveža
`geoValidation` + `budgetValidation` + `legs` (OSRM), observability
`itinerary_validated` z `source:"fallback_echo"`.

**Dokaz PO popravilu (echo-proof 8/8, upstreem 429 repliciran)**:
KT €1 → **€77**; viator:99999 → obstoj ohranjen (Task 48 invarianta —
ne odstranjuj uporabnikovih postankov) + cena **unknown** + opomba
„Cena ni preverjena — vir ni strežniško priključen."; kiwitaxi:424242 →
**ODSTRANJEN** (KT dataset = popoln inventar, fail-closed); prekrivanje →
popravljeno; geoValidation **sveža** (klientov lažni "ok" prepisan).

### P1 — NEIZVEDLJIVI URNIKI (schedule_gap ERROR razred) — POPRAVLJENO

**Vrzel**: fiksni terminski ritem 09:00–13:00 + 14:00–18:00 (vrzel TOČNO
1 h) neodvisno od dejanske vožnje. **14 od 19 uspešnih scenarijev** je
imelo `worst:"error"`; B2/B3: 890/1075 km, dnevi s 245 km in 1 h vrzelmi
(Triglav→Soča 1,5 h vožnje; Bohinj→Postojna 1,8 h). Hitra akcija "swap"
je isti ritem ponovno vnesla (`reslots`). AI pot: A3 Ljubljana→Piran 1 h
vrzel prek 1,5 h vožnje; F4 prekrivanje 12:00 po 13:00.

**Fix (3 plasti)**:
1. **`src/lib/schedule-slots.ts`** (NOVA, čista, 0 žetonov): drive-aware
   termini (konzervativna ocena haversine ×1,5 / 50 km/h + 30 min rezerva)
   + **`repairScheduleGaps`** — popravljalna plast nad REALNIMI OSRM nogami
   (minute-natančnost; premakne LE začetke; trajanja/vrstni red/cene/ID-ji
   ostanejo; prekrivanja poravna TUDI brez noge; neparsable termine pusti —
   geo validacija jih pošteno javi). Gorski pari (hevron haversine
   podceni: Triglav→Soča 0,28 h prek OSRM 1,5 h) — zato repair teče NAD
   nogami, ne nad hevristiko.
2. Vpenjanje na **vseh 5 poteh**: generacija fallback + AI, refine AI +
   quick-action + echo. Dnevnik: `[itinerary] TASK 50 schedule repair…`.
3. **AI prompt pravilo 7** (SL+EN) okrepljeno: „naslednji termin se začne
   ŠELE po (konec prejšnjega + čas vožnje)" z regionalnimi primeri.

**Dokaz A/B**: fallback harness 20 scenarijev → **19/20 ALL PASS** (1×
dev-artefakt 500, spodaj P3), `schedule_gap` na fallback poti **0** (prej
10). F4 prekrivanje → popravljen (0 overlapov).

### P1 — NEVERIFICIRANA KLIENTOVA CENA KOT PRIKAZANA — POPRAVLJENO

**Vrzel** (odkrit v echo-proofu): postanek v currentStops z virom, ki ga
strežnik NE more verificirati (viator/gyg nepriključen, KT brez dataseta,
OSM z netrivialno trditvijo) je ohranjil **klientovo cifro kot prikazano
ceno** (€500), budget sloj pa je bil iskren — prikaz in proračun sta si
nasprotovala (§10: klientov podatek NI kanonski).

**Fix**: nova veja `price_unverified` v `validateItinerarySupply` —
`estimated_cost` → NaN (JSON `null`; značilke/proračun čisti) + poštena
opomba SL/EN („Cena ni preverjena — vir ni strežniško priključen.
Ceno in razpoložljivost preveri pri ponudniku pred rezervacijo.").
UI varovalke: planner značilka cene `> 0` (NaN/null skrito — unknown ≠
„brezplačno"), ICS izvoz ne piše „€NaN".

**Testi**: 5 novih (SL/EN opomba, KT-NaN, regresija finite-kanon, budget
math NaN → 0 prispevek). Dokaz: echo-proof 8/8.

### P2 (majhen, varen) — NULL-ISLAND PIN NA KLIENTU — POPRAVLJENO

AI haluciniran ID (`socca`) z lat/lng 0/0 v T1 postanku: strežnik pošteno
javí `missing_coords` ERROR, klientov zemljevid pa bi risal pin + pot
čez Gvinejski zaliv (5334 km). Fix: `store.ts` zavrača (0,0) (isto
pravilo kot strežniška `coordsOfStop`).

### P2/P3 — DOKUMENTIRANO, NI POPRAVLJENO (brez scope creepa)

| # | Najdba | Prioriteta | Dokaz |
|---|---|---|---|
| 1 | Fallback izbor destinacij ignorira geografijo (B2/B3: 890/1075 km cik-cak načrti; Dolenjska/Bela krajina prošnje → splošni top seznami) | **P2** — kandidat za naslednji task | geoValidation odkrito javi day_km/leg_distance ERROR; načrt izvedljiv po urniku (po fixu), geografsko pa neumen |
| 2 | Dev-strežnek 500 `SyntaxError: Unexpected end of JSON input` (2×/≈90 hitrih zaporednih klicev, med prevajanjem `next.js: 8.4s` ≫ `application-code: 375ms`; 0 reprodukcij v 16+ ciljnih poskusih; VSI app `JSON.parse` varovani) | P3 (dev-artefakt) | dev.log vrstici 372/582; burst 6 + 10 zaporednih = 12× 200 |
| 3 | AI izhod občasno vsebuje malformed termin („14:00" gol niz; „23:30-23:30") — repair ga ne more (neparsable), ostane označen | P3 (fail-visible) | E3: `time_slot_invalid` ERROR prikazan |
| 4 | AI raw lat/lng=0 za T1 postanke (inertno — zemljevid/validatori rešujejo iz dataseta po ID; P2 fix ubija null-island pin pri neznanih ID-jih) | P3 | A1–A4: 5–8 postankov z (0,0), zemljevid pravilen |
| 5 | EN fallback imena postankov ostajajo slovenska („Reka Soča" — DESTINATIONS nima EN imena, samo EN tagline) | P3 (kozmetično) | P1 EN tekmovalec: „Reka Soča" med EN opombami |
| 6 | knownTotal (kanonske cene) > stopsTotal (prikazane cene AI), kadar AI prikaže drugačno ceno od T1 kanona — divergenca je odkrita (BudgetPanel prikazuje znani strošek) | P3 (zasnovno) | B4: known 406 / stops 203 |

---

## 4. SEKCIJSKI AUDIT — PASS/FAIL po §17 kriterijih

| Kriterij | Rezultat | Dokaz |
|---|---|---|
| H1 vsa postaja realna | PASS (T1/dataset/OSM) | stops-real-ids: edino `socca` (AI halucinacija) — odkrito zavrnjena kot missing_coords ERROR |
| H2 commercial stops preverljiv ref | PASS | KT iz dataseta; viator/gyg → obstoj = uporabnikova želja, cena = unknown (ne lažna) |
| H3 časovni sloti veljavni | PASS po fixu | repair odstrani prekrivanja/vrzeli na vseh 5 poteh; malformed ostane FAIL-VISIBLE |
| H4 geografsko skladni | PASS urnik / YELLOW geografija | urnik izvedljiv povsod; cik-cak fallback (P2 #1) odkrito javljen |
| H5 budget matematično pravilen | PASS | within zahteva vse znane; exceeded pošten (B4 20€ → exceeded); NaN prispeva 0 |
| H6 unknown jasno označen | PASS | BudgetPanel fromPrice/unknown števci; postanek opomba „Cena ni preverjena" |
| H7 FIXED ostane FIXED | PASS | E1–E3 + F1/F4: točno 1×, kanonska cena/geo preživi refinement |
| H8 refinement ohrani invariante | PASS po fixu | 5/5 F scenarijev + echo-proof (pred popravkom T10/H1/V1 FAIL) |
| H9 provider failure → brez halucinacije | PASS | OSM down → `degraded:["osm"]`, 0 lažnih; KT ostane (48 produktov); B4 brez izmišljanja |
| H10 uporabnik ve, kaj preveriti | PASS | opombe „preveri pri ponudniku", BudgetPanel razlogi, geo opozorila |

**SL/EN pariteta (§18)**: isti kanonski podatkovni model; živi dokazi —
SL „Znotraj proračuna: vsi načrtovani stroški so preverjeni — X € od
500 €" / EN „Within budget: all planned costs are verified — €370 of
€500" (browser, obe poti generaciji + refinement).

**Mobile (§19)**: 375 px + 390 px = **0 horizontalnega overflow** (domov +
dolg načrtovalnik z zemljevidom); footer `min-h-screen flex flex-col` +
`mt-auto` (porinjen pri dolgi vsebini); 0 page errors; quick-action gumbi
dosegljivi (44 px+).

**B4 impossible budget (20 € / 7 dni)**: status **exceeded**, 0 izmišljenih
„cenovno ugodnih" produktov, 0 izmišljene nastanitve/prevoza — UNKNOWN
ostaja UNKNOWN.

**D3/E1–E4 (FIXED)**: KT 411 €77 per_transfer (NE ×2 osebi); dva/three
FIXED vse preživijo točno 1×; konfliktni oddaljeni transferji (Zagreb
€252 + Pula €300) vloženi pošteno, budget uncertain — brez lažnega
„within".

**OSRM/routing (§6)**: T1 noge = OSRM realne (method:"osrm"); supply noge
= hevristika razkrito (P3, znana omejitev Task 48); routing odpoved →
hevristika z „~" (fail-open, odkrito).

---

## 5. TESTI (§14 — samo kjer revizija našla luknjo)

| Sklop | Datoteka | Št. |
|---|---|---|
| NOVO — drive-aware termini + repairScheduleGaps (vrzeli, prekrivanja, kaskade, FIXED-čas, čistost, gorska meja hevristike) | `src/lib/__tests__/schedule-slots.test.ts` | **22** |
| NOVO — price_unverified (SL/EN, KT-NaN, regresija kanona, budget math) | `itinerary-validation.test.ts` (dodano) | **5** |
| Skupaj | | **859/859 pass, 0 fail** |

## 6. SPREMEMBE (samo dokazane)

| Datoteka | Sprememba |
|---|---|
| `src/lib/schedule-slots.ts` | NOVA: slotCoordsOf, driveHoursBetween, slotStartFor, nextSlot, reslotLocations, **repairScheduleGaps** |
| `src/app/api/itinerary/route.ts` | drive-aware sloti v generateFallbackItinerary; repairScheduleGaps na AI + fallback poti; prompt pravilo 7 (SL+EN) |
| `src/app/api/itinerary/refine/route.ts` | P0: echo veja — polna validacijska veriga + sveža geo/budget/legs + observability `fallback_echo`; repair na AI + quick-action poti |
| `src/lib/refine-actions.ts` | `reslots` → `reslotLocations` (drive-aware) |
| `src/lib/supply/itinerary-validation.ts` | P1: veja `price_unverified` (NaN + poštena opomba); `fallback_echo` v log tipu |
| `src/lib/store.ts` | P2: null-island (0,0) pin zavrnjen |
| `src/components/sections/itinerary-planner.tsx` | UI varovalka cene (NaN/null skrito) |
| `src/lib/ics-export.ts` | „€NaN" nemogoč v koledarju |
| testi (zgoraj) | +27 |
| `package.json` | 1.55.0 |

## 7. GATE (KONČNO PRAVILO)

> Ali lahko uporabnik izbere realno oskrbo → zahteva AI načrt → dobi
> preverljiv itinerar → ga spremeni → sistem ohrani resničnost podatkov?

**DA, po fixih** — dokazano z 39+ živimi scenariji (20 + 19 + echo-proof),
vključno z obema AI stanjema (sveža kvota / 429 fallback + echo):
izbira (KT €77, OSM €0) → generacija (AI ali fallback) → urnik izvedljiv
po konstrukciji → refinement (AI/quick-action/echo) → kanon preživi,
fabricacija ne.

- Odprtih P0: **0** (1 najden → zaprt, dokaz 8/8)
- Odprtih P1: **0** (2 najdeni → zaprta, A/B + unit dokazi)
- Invalid schedule skozi: prekrivanja vrne repair; malformed termini
  ostanejo FAIL-VISIBLE (P3 #3)
- Klientova cena nikoli kanonska: kanon / unknown / reject — dokazano na
  10 tamper vektorjih + echo
- test/lint/tsc: **859/859, 0, 0**

**TASK 50 GATE: GREEN.**
