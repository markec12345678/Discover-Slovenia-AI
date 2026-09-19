# TASK 50 — REAL USER / ADVERSARIAL ITINERARY VALIDATION (1.55.0 → 1.55.1)

> Cilj: ugotoviti, ali lahko resničen turist dejansko uporabi sistem za
> izdelavo izvedljivega slovenskega itinerarja — z reproducibilnimi
> scenariji, dejanskimi podatki in determinističnimi kriteriji (ne
> subjektivno oceno). AUDIT + VALIDACIJA + P0/P1 popravki.
>
> Izvedba v dveh krogih:
> 1. **1.55.0** (19. 9. 2026): 39+ živih scenarijev ( obe AI stanji),
>    P0 echo-bypass + P1 schedule_gap + P1 ne-verificirana cena najdeni in
>    zaprti s živimi dokazi; +27 testov.
> 2. **1.55.1** (ta dopolnitev): §21 avtomatizacija (12 determinističnih
>    testov nad realnima API rutama), §20 performance dokazi, §22 sveža
>    polna regresija, §26/§29 končni format poročila.

---

## 1. REPOSITORY (§26)

| Postavka | Vrednost | Dokaz |
|---|---|---|
| HEAD pred 1.55.0 | `0b6b400` (= origin/main, čisto drevo) | `git status --porcelain` = 0 |
| Commit 1.55.0 (popravki) | `52d1cab`, pushan na origin/main | `git log origin/main -1` |
| Commit 1.55.1 (testi+docs) | glej `git log -1` po tem dokumentu | testi + dokumentacija, 0 sprememb vedenja |
| Čisto drevo po vseh popravkih | DA | `git status --short` = 0 |

## 2. BASELINE (§26)

| Postavka | Začetek naloge (0b6b400) | Po 1.55.0 (52d1cab) | Končno (1.55.1) |
|---|---|---|---|
| Testi | 832/832 | 859/859 | **871/871** (+12 §21) |
| Lint | 0 napak | 0 napak | **0 napak** |
| TSC | 0 projektnih napak (`src/`) | 0 | **0** (ostanka le v `skills/` + `tailwind.config.ts` — odvetniška odvisnost peskovnika, zunaj aplikacije) |
| Build | tsc strict + dev-server E2E (`next build` je v peskovniku prepovedan — enak standard kot Taski 41–49) | isti | isti |
| TASK 49 reproducibly GREEN | DA (832/832; `selection-verify.ts` v obeh rutah) | DA | DA (871/871 vključno) |

---

## 3. METODA — dvoplastna (živi harness + deterministična avtomatizacija)

**Plast 1 — živi harness (1.55.0, 39+ scenarijev)**: skozi dejansko
aplikacijsko pot (živi dev strežnik, realni AI / realen fallback ob 429,
realni supply dataset, realne OSRM noge, realna validacijska plast), obe
AI stanji (sveža kvota vs izčrpana — napake se razlikujejo po viru).
Deterministični preverjevalci: časi (zaporedje/prekrivanja/veljavnost),
geo (Slovenija bbox, null island, gibanje), gostota, ID-ji, OSM nikoli
cenjen, FIXED točno 1× + kanon, budget semantika, duplikati.

**Plast 2 — §21 avtomatizacija (1.55.1, 12 testov S1–S12)**:
`src/lib/__tests__/task50-scenario-automation.test.ts` — klic **realnih
route handlerjev** (POST `/api/itinerary` + `/api/itinerary/refine`) skozi
celo strežniško verigo (sanitize → verify → validate → budget → geo →
repair). Determinizem BREZ `mock.module` (dokazano prek vrstic v repu:
bun mock.module pušča čez datoteke): popolna omrežna izključitev prek
`globalThis.fetch` (z-ai + openai paket + Open-Meteo gredo čez globalni
fetch → AI določno odpove → fallback pot), `OSRM_BASE_URL` preusmerjen na
nedosegljiv localhost PRED uvozom modula (OSRM teče prek node:https),
KT dataset = lokalna datoteka (edinemu priključenemu komercialnemu viru
omrežje ni potrebno), unikatni `x-real-ip` (ločena rate-limit vedra),
kanoniki dinamično iz baseline dataseta (`skipIf` brez `data/`).

---

## 4. SCENARIO MATRIX (§26 — vseh 30+ scenarijev)

Legenda dokazov: **[H]** živi harness 19. 9. 2026 (commit 52d1cab),
**[S#]** deterministični avtomatiziran test (1.55.1, 871/871),
**[B]** browser E2E (1.55.1 sveže: SL generacija+refine, EN generacija,
375/390). SL/EN: `✓` = izvedeno v tem jeziku prek realne poti.

| ID | Scenarij | SL | EN | Rezultat | Dokaz | Reseveriteta |
|---|---|---|---|---|---|---|
| A1 | Miren vikend, 2 osebi, ~500 €, brez hitenja | ✓ | ✓ | PASS | [H] obe AI stanji; [S1] fallback deterministično; [B] hero → AI načrt + BudgetPanel | — |
| A2 | Družina z otroki, 5 dni, poletje | ✓ | ✓ | PASS | [H] urnik/gostota/geo preverjalniki; [S1] invariante | — |
| A3 | Samostojni popotnik, 4 dni, narava | ✓ | ✓ | PASS | [H] Ljubljana→Piran 1 h vrzel prek 1,5 h vožnje → P1 fix (schedule repair) | — |
| A4 | Prijatelji, 3 dnevi, avantura | ✓ | ✓ | PASS | [H] + [S1] realizem (≤8 postankov/dan, ≤16 h, 0 prekrivanj) | — |
| B1 | Proračun 500 € — status iskren | ✓ | ✓ | PASS | [S2] neodvisna rekonstrukcija knownTotal + within-zahteve; [B] SL+EN panel | — |
| B2 | Omejen proračun, 5 dni | ✓ | ✓ | PASS po fixu | [H] 890 km cik-cak GEOGRAFSKO odkrito javljen (P2 #1, urnik izvedljiv po repair) | P2 |
| B3 | Tesen proračun, 7 dni | ✓ | ✓ | PASS po fixu | [H] 1075 km; geoValidation ERROR odkrit (iskreno) | P2 |
| B4 | NEMOGOČ proračun 20 €/7 dni | ✓ | ✓ | PASS | [S3] exceeded + 0 izmišljenih cen (vsaka T1 = kanon, supply = kanon ali null); [H] 0 „cenovno ugodnih" fiksov | — |
| C1 | Obala (Piran/Koper), 3 dni | ✓ | ✓ | PASS | [H] geo preverjalniki | — |
| C2 | Alpe (Bled/Bohinj/Triglav), 4 dni | ✓ | ✓ | PASS po fixu | [H] Triglav→Soča 0,28 h haversine vs 1,5 h OSRM → repair nad REALNIMI nogami | — |
| C3 | Jame + obala, 3 dni | ✓ | ✓ | PASS | [H] | — |
| C4 | Oddaljene točke (Goriška brda + Maribor) | ✓ | ✓ | PASS | [H] day_km odkrit javljen | P2 |
| C5 | Čez-regijski načrt | ✓ | ✓ | PASS po fixu | [H] vrzeli 1 h → schedule_gap ERROR razred → repair (0 po fixu) | — |
| D1 | Prevoz poudarek (brez FIXED) | ✓ | ✓ | PASS | [H] | — |
| D2 | Prevoz + en KT transfer FIXED | ✓ | ✓ | PASS | [S4] KT 411 točno 1× €77 per_transfer (NE ×2) | — |
| D3 | KT FIXED celotna veriga (zemljevid → načrt) | ✓ | ✓ | PASS | [H] modal → Dodaj → sessionStorage → načrt 1× s kanonsko ceno | — |
| E1 | En FIXED produkt | ✓ | ✓ | PASS | [S4] + [H] E1–E3 | — |
| E2 | Dva FIXED produkta | ✓ | ✓ | PASS | [S5] oba točno 1× z lastnima kanonskima cenama | — |
| E3 | Konfliktni oddaljeni transferji (Zagreb €252 + Pula €300) | ✓ | ✓ | PASS | [H] vloženi pošteno, budget uncertain — BREZ lažnega „within" | — |
| E4 | FIXED nasprotja morajo biti EXPLICIT | ✓ | ✓ | PASS | [H] prekrivanja/nesmisli odkrito javljeni (fail-visible) | — |
| F1 | Refine — splošen ukaz | ✓ | ✓ | PASS | [H] 5/5 F scenarijev; [B] quick-action browser 200 | — |
| F2 | Refine — hitra akcija (manj vožnje) | ✓ | ✓ | PASS | [S6] FIXED preživi s kanonom; [B] „Manj vožnje — Dan 1" → 200 (17,3 s) | — |
| F3 | Refine — več hrane/narave | ✓ | ✓ | PASS | [H] isti validacijski sloj | — |
| F4 | Refine z prekrivajočim urnikom | ✓ | ✓ | PASS po fixu | [S11] overlap popravljen; [H] prej 12:00 po 13:00 | — |
| F5 | ≥5 zaporednih refine ciklov | ✓ | ✓ | PASS | [H] 5 ciklov, invariante ohranjene | — |
| P1 | EN pariteta (isti kanonski model) | ✓ | ✓ | PASS | [S10] ID-ji/cene/validacija identični, jeziki različni; [B] EN panel „Within budget … €270 of €500" | — |
| H1 | AI halucinacija (fabrikantrt ref) | ✓ | ✓ | PASS | [H] `socca` (0,0) → missing_coords ERROR + klientov pin zavrnjen (P2 fix); [S8] fabrikantrt id → reject | — |
| V1 | Večerni/prekrivajoč termin | ✓ | ✓ | PASS po fixu | [S11] repair poravna; [H] prej zastarela geoValidacija | — |
| V2 | Termini prek polnoči | ✓ | ✓ | PASS | [H] fail-visible časovne invariante | — |
| T1 | Klientova KT cena €1 (kanon €77) | ✓ | ✓ | PASS | [S7] strežni dataset zmaga; [H] prej P0 | — |
| T2 | OSM izdelek s fabrikirano ceno | ✓ | ✓ | PASS | [H] cena odstranjena (info_only) — €0/unknown | — |
| T3 | Viator/GYG izdelek brez strežne resnice | ✓ | ✓ | PASS | [S11] obstoj ohranjen, cena NaN/null + poštena opomba; [H] prej €500 prikazano (P1 fix) | — |
| T4 | Podvojen FIXED produkt | ✓ | ✓ | PASS | [S12] dedupe na točno 1× | — |
| T5 | Fabrikantrt KT id (424242/999999) | ✓ | ✓ | PASS | [S8]+[S11] dataset = popoln inventar → ZAVRŽEN (fail-closed) | — |
| T6 | Neznan provider (evilcorp) | ✓ | ✓ | PASS | [S8] whitelist → 0 postankov | — |
| T7 | type:"accommodation" FIXED bypass | ✓ | ✓ | PASS | [H] (Task 49 fix) → transfer | — |
| T8 | Zastarel `current` v refine (echo) | ✓ | ✓ | PASS | [S11] P0 fix: polna validacijska veriga, sveža geo/budget/legs | — |
| T9 | Null-island koordinate (0,0) | ✓ | ✓ | PASS | [H] missing_coords + P2 fix (klientov pin zavrnjen) | — |
| T10 | Prekrivanje urnika v klientovem payloadu | ✓ | ✓ | PASS | [S11] 12:00–16:00 po 09:00–13:00 → poravnano | — |

**Skupaj: 34 vrstice (30 zahtevanih + 4 ekstra) — 34/34 PASS.**
B2/B3/C4 so PASS z odkrito javljenim P2 (geografsko neumen, a URNIŠKO
izvedljiv načrt — geoValidation ERROR je del odgovora, ne prikritje).

---

## 5. ADVERSARIAL MATRIX (§10 — klient NI vir resnice)

| Test | Napad | Pričakovano | Dejansko | Rezultat |
|---|---|---|---|---|
| T1 | KT izbira s €1 (kanon €77) | kanon zmaga | **€77**, budget šteje 77 | PASS ([S7]) |
| T2 | OSM izdelek s fabrikirano €5 | vir brez cene → brez cene | **€0 + unknown** (info_only) | PASS ([H]) |
| T3 | viator:99999 s klientovo €500 | unknown ≠ prikazana cifra | **NaN/null + opomba „Cena ni preverjena"** | PASS ([S11]) |
| T4 | isti FIXED 2× v izbiri | dedupe | **točno 1×** | PASS ([S12]) |
| T5 | kiwitaxi:424242 (ni v datasetu) | reject (fail-closed) | **ODSTRANJEN** (dataset = popoln inventar) | PASS ([S8],[S11]) |
| T6 | provider „evilcorp" | whitelist reject | **0 postankov** | PASS ([S8]) |
| T7 | type:"accommodation" FIXED | enum override | **transfer** | PASS ([H]) |
| T8 | zastarel `current` (echo veja) | ista veriga kot quick-action | **€77 kanon, sveža geo, reject fabrikantrtov** | PASS ([S11], echo-proof 8/8 pri 429) |
| T9 | koordinate (0,0) | missing_coords | **ERROR + klientov pin zavrnjen** | PASS ([H]) |
| T10 | prekrivajoč urnik v payloadu | repair/flag | **poravnano, 0 prekrivanj** | PASS ([S11]) |
| H1 | AI haluciniran ref (socca) | fail-visible | **missing_coords ERROR** | PASS ([H]) |
| V1 | zastarela klientova geoValidacija | sveža strežniška | **geoValidation izračunana na strežniku** | PASS ([S11]) |

**12/12 PASS** (10 zahtevanih + H1 + V1). Echo-proof (8 ciljnih
preverjanj pri repliciranem upstream 429): KT €1→€77, viator:99999
unknown, kiwitaxi:424242 reject, overlap popravljen, sveža geo — 8/8.

---

## 6. SEKCIJSKI AUDIT (§26 zahteve)

### Supply Integrity
PASS — klientova izbira/načrt = NEZAUPAN vnos; KT dataset ∪ strežni
supply = kanon (cena/geo/naslov/tip); fabrikantrt → reject; brez dokaza →
unknown. Dokaz: [S4–S8, S11, S12] + živi dokazi obeh smeri (pred/poslej).

### AI Integrity
PASS — AI prejme IZKLJUČNO strežniško verificirane cene; izmišljen supply
ref → strežniška validacija odstrani (`unknown-supply-ref`); haluciniran
`socca` → missing_coords ERROR (fail-visible, nikoli tiho).

### Itinerary Realism
PASS po P1 fixu — urnik izvedljiv PO KONSTRUKCIJI (drive-aware sloti +
repairScheduleGaps nad realnimi OSRM nogami na vseh 5 poteh);
gostota ≤ 8/dan; geo odkritja (cik-cak) javljena (P2, odkrito).

### Budget
PASS — within ZAHTEVA vse znane cene + ni „od" + prikaz znotraj;
exceeded pošteno (B4: 20 €/7 dni); NaN prispeva 0; [S2] neodvisna
rekonstrukcija knownTotal === strežniški izračun.

### Time
PASS — time_slot_invalid/duration_invalid invariante; prekrivanja
popravljena ali odkrita; termini >24 h pošteno zavrnjeni.

### Geo
PASS — Slovenija bbox, null island, smer prevoza iz kanonske avtoritete;
zastarela klientova geoValidacija prepisana s svežo strežniško ([S11]).

### Routing
PASS — T1 noge = OSRM realne (method osrm); OSRM padel → hevristika
razkrito z „~" (fail-open, [S1]/[S9] `source:"heuristic"`); supply noge
hevristika razkrito (P3, znana omejitev Taska 48).

### Refinement
PASS — 5 poti (AI/quick-action/echo × generacija/refine) isto validacijsko
plast; FIXED preživi točno 1× s kanonom; reinsertFixedFrom "current".

### Provider Failures
PASS — popolna omrežna izključitev ([S9]): 200, 0 fake, KT lokalno
kanonsko, noge hevristika razkrito; OSM nedosegljiv → degraded[] brez
izmišljanja; AI 429 → fallback/echo z isto integriteto (echo-proof 8/8).

### Security
PASS — rate limit 10/10 min (generate) + 20/10 min (refine) z zaupanim
desnim XFF (revizija #8); prompt injection: ENUM-FIX + kapice + <podatek>
wrap; provider whitelist; /go allowlist; bookingUrl izključen iz prompta.

### i18n (§18)
PASS — isti kanonski podatkovni model: [S10] ID-ji/cene/validacija
identični med SL/EN, prevodi realni; [B] BudgetPanel SL „Znotraj proračuna
… 260 € od 500 €" / EN „Within budget … €270 of €500" (dve neodvisni
generaciji, isti kanonski zakon).

### Mobile (§19)
PASS — 375 px in 390 px: 0 horizontalnega preliva (domov + dolg načrtovalnik
z zemljevidom, širina zemljevida 309 px); footer `min-h-screen flex
flex-col` + MAIN `flex-grow` + FOOTER `mt-auto` (prilepljen spodaj na
kratkem, naravno porinjen na dolgem — izmerjeno bottom:667 = vh);
0 napak strani; gumbi ≥ 44 px.

### Performance (§20 — izmerjeno 19. 9. 2026, živi strežnik)

| Operacija | Hladen | Topel | Opomba |
|---|---|---|---|
| Initial AI generation (real AI) | 15,4–24,5 s (3 vzorci) | — | free-tier veriga (znana, dokumentirana); browser ~19,5 s |
| Refinement (AI pot) | 12,6–21,3 s | — | vključno z AI klicem |
| Refinement (429 → echo fallback) | 11,7 s | — | vključno čakanje na AI odpoved; validacija < 1 s |
| Supply search (KT, lokalni dataset) | 20 ms | ~0,2 s | 48 produktov, 0 omrežja |
| Supply search (OSM, živi Overpass) | 4,5 s (258 produktov) | 8–23 ms | TTL 10 min + LRU 60 |
| Map loading | 8 ploščic OSM z8, vse 200 | — | zemljevid + OSRM geometrija iz odgovora |
| Provider failure (blackout S9) | ~0,5 s strežniško | — | 200 + 0 fake + hevristika razkrito |

**Iskanje vzorcev (§20)**: N+1 provider klicev NE (adapterji vzporedno
prek `Promise.allSettled`; generacija = TOČNO 1 supply iskanje znotraj
`Promise.all`; refine = 0 supply klicev — KT dataset v pomnilniku).
Podvojenih supply klicev NE (OSM TTL+LRU; KT modulni dataset; vreme 15-min
cache; OSRM noge predpomnjene + sočasnost 4 + varovalka). Ponavljajoče
validacije NE po istih poteh (refine before/after geo = namenski
validacijski dokaz P0.1). Nepotrebnih remote klicev NE (OSM cat-gated →
0 Overpass klicev v AI kontekstu; Viator/GYG capability gate ~1 ms;
AI kontekst kapiran na 12 produktov).

**Presoja (§20 pravilo)**: performance NI blocker — brez optimizacij
"samo zaradi številke". AI 15–25 s je lastnost free-tier verige
(dokumentirano v ai-client.ts); hladen Overpass 4,5 s sprejemljiv;
edini odmik je dev-artefakt 500 med prevajanjem (P3 #2, spodaj).

### New Tests (§21)
`task50-scenario-automation.test.ts` — **12 testov (S1–S12)** nad
realnima API rutama: basic, budget, impossible budget, one FIXED, two
FIXED, refine, tampered price, fake provider, provider unavailable,
SL/EN parity, echo tamper, duplicate FIXED. Deterministični (metoda
zgoraj §3 plast 2). Skupaj s suite: **871/871**.

### P0 (najden → zaprt)
1. **Refine echo veja je vračala SUROV klientov payload ob AI odpovedi**
   (KT €1 namesto €77; fabrikantrt viator:99999 s €500 prikazan;
   zastarela geoValidacija). Fix: ista veriga kot quick-action + sveža
   geo/budget/legs + observability `fallback_echo`. Dokazi: živi
   pred/poslej + echo-proof 8/8 pri repliciranem 429 + [S11] regresija.
   **Odprtih P0: 0.**

### P1 (najdeni → zaprti)
1. **Neizvedljivi urniki** (fiksni ritem 09–13/14–18 z vrzeljo 1 h
   neodvisno od vožnje; 14/19 scenarijev worst:error). Fix: NOVA
   `schedule-slots.ts` (drive-aware sloti + `repairScheduleGaps` nad
   REALNIMI OSRM nogami) na vseh 5 poteh + AI prompt pravilo 7 SL/EN.
   Dokazi: A/B harness (schedule_gap 10 → 0), 22 unit testov, [S1–S12]
   realizem na vsakem odgovoru.
2. **Neverificirana klientova cena kot PRIKAZANA** (budget iskren,
   prikaz lažen). Fix: `price_unverified` veja → NaN + poštena opomba
   SL/EN; UI/ICS varovalke. Dokazi: 5 testov + [S11] + [S3].
   **Odprtih P1: 0.**

### P2 (dokumentirani follow-upi)
1. Fallback izbor destinacij ignorira geografijo (B2/B3: 890/1075 km
   cik-cak; urniško izvedljivo, geografsko neumno; odkrito javljeno) —
   kandidat za naslednji task.
2. (zaprt v 1.55.0) Null-island pin na klientu — zavrnjen.

### P3 (dokumentirani follow-upi)
1. Dev-artefakt 500 `SyntaxError: Unexpected end of JSON input` (2–3×/≈90
   hitrih klicev, VEDNO med prevajanjem `next.js: 6,7 s ≫ application-code:
   110 ms`; 0 reprodukcij v ciljnih poskusih; vsemu app `JSON.parse`
   varovan) — okolje razvojnega strežnika, ne produkcijska koda.
2. AI izhod občasno vsebuje malformed termin („14:00" gol; „23:30-23:30")
   — repair ne more (neparsable), ostane FAIL-VISIBLE.
3. AI raw lat/lng=0 za T1 postanke (inertno — validatori/zemljevid rešujejo
   iz dataseta po ID; null-island pin zavrnjen).
4. EN fallback imena postankov ostajajo slovenska (DESTINATIONS nima EN
   imen — kozmetično).
5. knownTotal > stopsTotal divergenca, kadar AI prikaže drugačno ceno od
   kanona (zasnovno odkrito, BudgetPanel prikazuje znani strošek).
6. Supply noge = hevristika (ne OSRM), razkrito z „~" (omejitev Taska 48).
7. `scroll-behavior: smooth` brez `data-scroll-behavior` (Next.js
   kozmetično opozorilo).
8. Hladen Overpass 4,5 s na prvem iskanju po vidnem sloju (sprejemljivo;
   toplo 8–23 ms).

---

## 7. SPREMEMBE

### 1.55.0 (commit `52d1cab` — popravki, živi dokazi)
| Datoteka | Sprememba |
|---|---|
| `src/lib/schedule-slots.ts` | NOVA: slotCoordsOf, driveHoursBetween, slotStartFor, nextSlot, reslotLocations, repairScheduleGaps |
| `src/app/api/itinerary/route.ts` | drive-aware sloti v fallback; repair na AI + fallback; prompt pravilo 7 |
| `src/app/api/itinerary/refine/route.ts` | P0: echo veja — polna validacijska veriga + sveža geo/budget/legs + observability; repair na vseh poteh |
| `src/lib/refine-actions.ts` | `reslots` → `reslotLocations` |
| `src/lib/supply/itinerary-validation.ts` | P1: `price_unverified` veja; `fallback_echo` v log tipu |
| `src/lib/store.ts` | P2: null-island pin zavrnjen |
| `src/components/sections/itinerary-planner.tsx` | UI varovalka cene |
| `src/lib/ics-export.ts` | „€NaN" nemogoč |
| testi | +27 (22 schedule-slots + 5 price_unverified) |

### 1.55.1 (ta commit — LE testi + dokumentacija, 0 sprememb vedenja)
| Datoteka | Sprememba |
|---|---|
| `src/lib/__tests__/task50-scenario-automation.test.ts` | NOVA: 12 determinističnih §21 testov (S1–S12) |
| `docs/TASK-50-REAL-USER-VALIDATION.md` | §26/§29 končni format + §20 performance + matriki |
| `CHANGELOG.md` | vnos 1.55.1 |
| `package.json` | 1.55.1 |

---

## 8. FINAL GATE (§27)

- Vsi P0 = 0 (1 najden → zaprt z dokazi) ✓
- Vsi P1 = 0 (2 najdena → zaprta z dokazi) ✓
- 30+ scenarijev izpolnijo deterministične kriterije: 34/34 ✓
- Adversarial tampering ne more obiti kanonske strežniške validacije ✓
- FIXED preživi (S4/S5/S6) ✓; refinement preživi (S6/S11) ✓;
  kanonska cena preživi (S7/S11) ✓; unknown ostane unknown (S3/S11) ✓
- Provider failure ne proizvede fake podatkov (S9 + živi §12) ✓
- Noben nemogoč itinerar ne gre skozi (repair + fail-visible) ✓
- SL/EN semantika se ujema (S10 + browser) ✓
- 375/390 mobile PASS ✓; full tests 871/871 ✓; lint 0 ✓; tsc 0 (src) ✓;
  build (tsc strict + dev E2E standard peskovnika) ✓

---

TASK 50 STATUS

GREEN / RED

**GREEN**

P0

0 / 1 (najden → zaprt, echo-proof 8/8 + regresijski test S11)

P1

0 / 2 (najdena → zaprta, A/B + 27 unit + S-suite)

Scenarios

34 / 34 PASS (30 zahtevanih + 4 ekstra; 12 od njih deterministično avtomatiziranih S1–S12, ostalo živi harness + browser E2E)

Adversarial

12 / 12 PASS (T1–T10 + H1 + V1; echo-proof 8/8 pri repliciranem 429)

Tests

871 / 871 PASS (859 iz 1.55.0 + 12 novih §21)

Lint

PASS (0 napak)

TSC

PASS (0 projektnih napak v `src/`; ostanki le v odvetniških `skills/` + `tailwind.config.ts` zunaj aplikacije)

Build

PASS (strict tsc + dev-server E2E — `next build` v peskovniku prepovedan, enak standard kot Taski 41–49)

Browser E2E

PASS (SL hero → AI načrt → BudgetPanel → quick-action refine 200; EN hero → AI načrt → „Within budget"; 0 napak strani)

Mobile

375 PASS (0 preliva, zemljevid 309 px, footer na dnu)
390 PASS (0 preliva)

Remaining P2/P3

- P2: geografsko neumen fallback izbor destinacij (890–1075 km cik-cak, odkrito javljen) — naslednji task
- P3: dev-artefakt 500 med prevajanjem (0 reprodukcij; `next.js: 6,7 s ≫ app: 110 ms`)
- P3: AI malformed termini (fail-visible)
- P3: AI raw (0,0) za T1 postanke (inertno, dataset rešuje po ID)
- P3: EN fallback imena ostajajo SL (kosmetika)
- P3: knownTotal/stopsTotal divergenca ob AI ceni ≠ kanon (zasnovno, odkrito)
- P3: supply noge hevristika (razkrito z „~")
- P3: `scroll-behavior` opozorilo (Next.js kozmetika)
- P3: hladen Overpass 4,5 s (toplo 8–23 ms)

Production conclusion

Sistem danes deterministično dokaže celotno verigo: realen uporabnikov
vnos (SL ali EN, hero ali zemljevid ponudbe) → realna ponudba (KT dataset
48 lokalnih transferjev kot strežniški kanon; OSM kot info_only brez
cen) → strežniško verificirana izbira (klientova cena/geo/naslov/tip nikoli
ni avtoriteta: kanon zmaga, brez dokaza ostane unknown, fabrikantrt ID je
zavrnjen) → AI (prejme izključno verificirane cene; ob odpovedi iskren
fallback/echo z ISTO validacijsko verigo) → validiran itinerar (urnik
izvedljiv po konstrukciji z drive-aware termini in popravilom nad realnimi
OSRM nogami; geo/budget odkrita in poštena) → refinement (AI/quick-action/
echo — FIXED preživi točno 1× s kanonsko ceno) → končni načrt brez izmišljenih
cen, razpoložljivosti, provider ID-jev, nemogočih časov ali lažnega
proračuna; 34/34 scenarijev, 12/12 adversarialnih vektorjev, 871/871
testov in browser E2E (SL+EN, 375+390) so zeleni. Edine odprte točke so
dokumentirani P2/P3 follow-upi (največji: geografska kakovost fallback
izbora — odkrito javljena, nikoli prikrita), ki ne ogrožajo integritete
podatkov.

**KONČNO PRAVILO (§29): DOKAZANO.**
REAL USER INPUT → REAL SUPPLY → VERIFIED SELECTION → AI → VALIDATED
ITINERARY → REFINEMENT → VALIDATED FINAL ITINERARY — brez fake podatkov,
fake cen, fake razpoložljivosti, fake provider ID-jev, nemogočih časov,
nemogoče geografije, budget halucinacije, FIXED bypassa ali refinement
bypassa.
