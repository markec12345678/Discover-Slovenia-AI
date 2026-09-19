# TASK 51 — GEOGRAPHIC ITINERARY COHERENCE & FALLBACK REALISM (1.56.0)

Datum: 20. 9. 2026 · Commit: glej §10 · Prejšnji: TASK 50 (1.55.1, GREEN —
34/34 scenarijev, 12/12 adversarial, 871/871 testov).

---

## 1. CILJ IN OBSEG

TASK 50 je odkril P2: **fallback izbor destinacij ignorira geografijo** —
dokazano ~890–1075 km cik-cak poti (urniško izvedljive po Task 50 repairu,
geografsko neumne, odkrito javljene). TASK 51 zapre točno to luknjo:
sistem ne sme brez razloga ustvarjati očitnih velikih geografskih skokov
ali vračanja čez že obiskano območje — cilj je **koherenca, ne
matematični optimum** (§1).

---

## 2. BASELINE (§2)

| Postavka | Vrednost |
|---|---|
| HEAD = origin/main | `b5d2c1b` (1.55.1, čisto drevo, branch `main`) |
| Testi | 871/871 PASS |
| Lint | 0 napak |
| tsc (src/) | 0 napak |
| Dev strežnik | GET / in /en = 200 |
| TASK 50 GREEN | reprodukcija potrjena (871/871 + poročilo 34/34) |

Baseline GREEN → nadaljevanje dovoljeno.

---

## 3. REPRODUKCIJA TASK 50 P2 (§3)

Deterministični repro (globalThis.fetch zavrnjen → AI odpoved → fallback;
**OSRM pusti ŽIV** prek node:https → realne cestne razdalje):

| Scenarij | Pred fixom | Vzrok |
|---|---|---|
| **B2** (5 dni, 300 €, narava+mesta) | **1115 km**, 9/9 OSRM nog | vrstni red obiska == vrstni red po oceni (interesi + rating/10) |
| **B3** (7 dni, 150 €, narava) | **1650 km**, 13/13 OSRM nog | enak vzorec, haversine kontrola 870 km |

Konkretna B2 pot (dokaz cik-caka):
Triglav → Soča → Bohinj → Postojnska jama → Vintgarska soteska → Kobarid
→ Slovenj Gradec → Novo mesto → Črnomelj → Dravograd
(bohinj po triglavu/soči = vračanje; vintgar po postojni = vračanje čez
bohinj; dravograd po črnomlju = skok na sever).

**Odgovori na §3 vprašanja:**
- vhod: B2 = {budget 300, days 5, interests [narava, mesta]}, B3 = {150, 7, [narava]};
- destinacije: izbor po oceni (TOP-N po `bestFor` ujemanjih + rating);
- vrstni red: **čisto oceni-red** — geografija ni sodelovala NIC;
- AI-generated ali fallback? **fallback** (source:"fallback"; AI določno odpovedan);
- FIXED prisoten? NE (fixed=0);
- OSRM prisoten? DA — 9/9 oziroma 13/13 realnih nog (razdalje so RESNIČNE);
- sprožilec fallbacka: AI 429/omrežje (v repro: fetch zavrnitev — ista catch pot, vrstica 925–929 route.ts).

**§5 potvrjen s podatki**: haversine 534 km vs OSRM 1115 km (B2) —
ravna črta NIKOLI ne sme biti predstavljena kot čas vožnje.

---

## 4. VZROČNA ANALIZA FALLBACK IZBIRE (§6)

Pregled `generateFallbackItinerary` (pred TASK 51):

| Vprašanje | Odgovor |
|---|---|
| kako izbira destinacije | ocena: `bestFor ∩ interests + rating/10 + preferred +2,5`, sezonski filter, zaprtja (destination-level) |
| naključni vrstni red | NE — deterministični oceni-red |
| uporablja razdaljo | **NE — nikjer** |
| uporablja sidra | NE (samo deževni dnevi → notranji tipi) |
| dnevni vrstni red | zaporedni odseki oceni-reda (dan N dobi ranked[2N−2], ranked[2N−1] …) |
| upošteva FIXED | NE med generiranjem (vstavljeni kasneje po najbližjem dnevu) |
| uporablja realni routing | NE v izbiri/redu (samo potem za noge/urnik) |

Deterministični vzrok cik-caka **dokazan**: geografsko slep oceni-red.
Fix oblika (§7 ANCHORS, prilagojeno arhitekturi): glej §5.

---

## 5. FIX — DETERMINISTIČNO SIDROVNO UREJANJE (§6/§7/§8)

### 5.1 Načelo

**IZBIRA postankov ostaja POPOLNOMA enaka** (iskrena ocena interesov,
sezona, zaprtja, deževni dnevi → notranji nabori, gostota iz tempa).
Spremeni se SAMO VRSTNI RED. Novi modul `src/lib/geo-order.ts`:

1. **Sidra (hrbtenica)** = VERIFICIRANE FIXED izbire v **vrstnem redu
   izbire** (§8 F2: vrstni red FIXED se ne spremeni; koordinate so
   kanonske iz Task 49 verify plasti — klientove podstavljene NIKOLI ne
   pridejo do sem; dokaz G-A10 z (0,0) tamper → kanon zmagá).
   Željene destinacije (preferredDestinations) NISO urejevalna sidra:
   +2,5 pohitritev (obstoječe) jih zajamči v nabor, njihova umeščanje
   pa zaupa verigi — vhodni vrstni red želja nima geografske semantike
   (adversarialni dokaz G-A3: sidranje po vhodnem redu bi prisililo
   NW → NE → NW vračanje, kar §4 izrecno prepoveduje).
2. **Gruče**: postanki znotraj 60 km (OUTLIER_KM — intra-regijski radiij,
   dokumentirano) najbližjega sidra; gruče izpisane po hrbtenici.
   **Outlierji** (> 60 km od VSEH sidrov) NE gredo v gruče — verižijo se
   ZA gručami kot nadaljevanje poti (dokazano vzročno: vlečenje
   ljubljane/triglava/pirana v »najbližjo« mariborovo gručo je ustvarilo
   vzhod → zahod → vzhod vračanje — regresijski test U12).
3. **Brez sidrov**: veriga najbližjih-sosedov od postanka najbližjega
   težišču IZBRANIH postankov (podatkovni referenč, ne izmišljen
   »uporabnik začne v Ljubljani«).
4. **Vremenski bloki**: deževni dnevi obdržijo SVOJ notranji nabor na
   svojem dnevu (iskrenost Task 50 deževne logike); urejanje znotraj
   blokov, pozicijski kazalec se prenese med bloki.
5. **Determinizem**: izenačenja po poolIndex (dataset vrstni red);
   nekončne koordinate → razdalja +∞ (pasivno potonejo; brez crasha).
   **NE optimaliziramo** — poštena požrešna verika (greedy NN) daje
   koherenco, ne TSP optimum.

### 5.2 Pipeline po fixu (§16)

```
izbor destinacij (ista iskrena ocena)
      ↓
geografsko urejanje (geo-order.ts, haversine = SAMO hevristika urejanja)
      ↓
OSRM noge (buildLegRouteIndex — vir realne razdalje/časa)
      ↓
schedule sloti (drive-aware, Task 50)
      ↓
schedule repair (repairScheduleGaps nad REALNIMI OSRM nogami)
      ↓
časovna validacija (geo-validation)
      ↓
budget/geo validacija + coherence meritve (M1–M5)
      ↓
končni itinerer
```

NE: naključni vrstni red → repair → upanje. Haversine NI nikjer
predstavljen kot čas vožnje (§5) — noge ostanejo OSRM + odkrita
hevristika (»~«, vir »heuristic«).

### 5.3 Rezultati po fixu (ŽIVI OSRM)

| Scenarij | Pred | Po | Napredek | Backtracking |
|---|---|---|---|---|
| B2 (5 dni) | 1115 km | **755 km** | −32 % | 0 dogodkov |
| B3 (7 dni) | 1650 km | **870 km** | −47 % | 0 dogodkov |
| FIXED Bled + Umag/Piran (4 dni, 265989 s tamper (0,0)) | — | **530 km** | — | 0 dogodkov |

B3 pot po fixu (dokaz koherence):
Ljubljana → Postojna → Piran → Kobarid → Soča → Triglav → Bohinj → Bled
→ Vintgar → Dravograd → Slovenj Gradec → Novo mesto → Otočec → Črnomelj
(center → obala → Soča → Alpe → sever → vzhod → JV — en sam pomet).

---

## 6. METRIKE M1–M5 (§4/§13)

NOVA `src/lib/geo-coherence.ts` (čiste funkcije, brez omrežja, brez
stanja — isto vhod → isto poročilo):

- **M1** totalDistanceKm — vsota nog po zaporedju; vir vsake noge ODKRITO
  (osrm / heuristic, delež poročan);
- **M2** longestLegKm — najdaljša noga z virom in parom postankov;
- **M3** backtrackingEvents — DOKUMENTIRANA deterministična definicija:
  postanek s[k] »backtracka« čez s[i] (i ≤ k−2) natanko tedaj, ko
  (1) dist(s[i], s[k]) ≤ **30 km** (R_VISIT — radiij regije: Bled–Bohinj
  ~12 km, Bled–Vintgar ~5 km so NOTRI, Ljubljana–Piran ~50 km IZVEN) in
  (2) ∃ m (i<m<k): dist(s[i], s[m]) ≥ **45 km** haversine (D_LEFT ≈ 60+
  km ceste — nedvoumen medregijski odhod). Primer A→B→C→B: B obiskan,
  C ≥ 45 km stran, vračanje v B-jevo območje = dogodek. Lokalna gruča
  (Triglav → Soča → Bohinj, vsi pari < 45 km) NI backtracking. Brez
  subjektivne ocene, brez nedokumentiranih pragov;
- **M4** medianLegKm + legsOver120Km (opisno; dolga noga NI prepovedana
  — celo-državni načrti jo legitimno potrebujejo, a se šteje);
- **M5** anchorCoherence — za vsak FIXED sidro razdalje ostalih postankov
  ISTEGA dneva (sidro je canonical, nikoli premaknjeno).

Observability: `[itinerary] TASK 51 geo coherence (fallback): km=755
(osrm=9/heuristic=0) longest=205km [osrm] backtracking=0 anchors=0`.

---

## 7. OSRM (§14/§15)

Obstoječa integracija JE dovolj (uporabljena, NI nov routing engine):
`buildLegRouteIndex` + node:https klient (timeout 2,5 s, konkurenca 4,
breaker, TTL predpomnilnik, injektirljiv fetcher za teste), vir nog
odkrit (`osrm`/`heuristic`), geometrija za zemljevid.

Routing failure (§15) — dokazano v G-A5/G-A6 + obstoječih testih
method-disclosure (geo-validation.test.ts: osrm/heuristic/mixed):
- OSRM mrtev/preusmerjen → VSE noge hevristika, POŠTENO OZNAČENE
  (test izrecno zahteva `source === "heuristic"`, NIKOLI »osrm«);
- urnik OSTANE izvedljiv (drive-aware sloti + repair nad hevristiko);
- FIXED vstavitev deluje tudi brez OSRM (haversine najbližji dan);
- uporabnik vidi hevristiko kot hevristiko (~ predznak, vir razkrit),
  NIKOLI kot verified dejstvo.

---

## 8. FIXED LOKACIJE (§8) IN SUPPLY KOORDINATE (§20)

| Zahteva | Dokaz |
|---|---|
| F1 en FIXED ostane na mestu | test F1: 1× kanon €77, M5 min so-dnevna ≤ 60 km |
| F2 dva FIXED: vrstni red izbire ohranjen | test F2: day(411) ≤ day(258775), oba 1× kanon |
| F3 trije FIXED: zahtevnost iskreno priznana | test F3: vsi 1× kanon, geoValidation javi leg_distance/day_km |
| F4 FIXED + fallback brez cik-caka | test F4/G-A4: 0 backtracking, M5 za obe sidri, dan(411) ≤ dan(265989) |
| §20 kanonske koordinate | G-A10: KT 411 s podstavljeno (0,0) → kanonske Bled koordinate v odzivu, urejanje/noge/M5 iz kanona; selection-verify (Task 49) obnovi PRED geoAnchors |

Komercialni viri (KiwiTaxi/Viator/GYG) ohranijo kanonske koordinate —
pot »provider koordinata → AI spremeni → routing uporabi spremenjeno« je
zaprt že v Task 48/49 (geoRestored); TASK 51 urejanje gradi IZKLJUČNO
nad verificiranimi koordinatami (geoAnchors iz verifiedSelection).

---

## 9. TESTI (§9–§12, §19, §21) — 45 NOVIH (skupaj 916/916)

`src/lib/__tests__/task51-geo-coherence.test.ts` (deterministično:
fetch zavrnjen → AI odpoved → fallback; OSRM na mrtev naslov → hevristika
odkrito; KT dataset lokalno = kanon; unikatni IP → ločena rate-limit
vedra):

- **Čiste enote geo-order (12)**: U1 NN veriga brez sidrov (nabori
  ohranjeni); U2 §7 primer (FIXED Bled + FIXED Piran → bohinj → soca →
  ljubljana → postojna, NE Bled → Piran → Bohinj interleave); U3 vremenski
  bloki; U4 determinizem + izenačenja po poolIndex; U5 nekončne
  koordinate (brez crasha, pasivno); U6 FIXED vrstni red hrbtenice; U6b
  sidrni postanek prvi v gruči; U7 prazni vhodi; U12 outlierji (G5-4
  regresija); + metrike U8–U11 (M3 A→B→C→B; lokalna gruča NI backtracking;
  M1/M2 viri; M5 sidro-dan).
- **3-dnevni (§9)**: G3-1 Bled/Bohinj, G3-2 Piran/Primorska, G3-3
  Ljubljana + osrednja, G3-4 Bled + Piran, G3-5 Bela krajina/Dolenjska,
  G3-6 Slovenia-wide + determinizem (isti vhod dvakrat → IDENTIČEN red).
- **5-dnevni (§10)**: G5-1 (B2 repro razred — ≥ 50 % nog intra-regijskih
  ≤ 60 km, mediana ≤ 60), G5-2 zahod, G5-3 osrednja, G5-4 vzhod/JV,
  G5-5 Slovenia-wide. Daljši plan NI naključno dodajanje oddaljenih.
- **7-dnevni (§11)**: G7-1 wide (B3 razred), G7-2 nizki proračun, G7-3
  brez avta (mestni), G7-4 s FIXED.
- **Adversarial geografija (§12)**: G-A1 dve zelo oddaljeni (Maribor +
  Piran — prisotni, povezava odkrito označena, 0 vračanj); G-A2 tri v
  nasprotnem redu (vsi obiskani v KOHERENTNEM redu, ne slepo obratnem,
  deterministično); G-A3 FIXED zahod + kandidat vzhod + zahod (0
  vračanj); G-A4 = F4; G-A5/G-A6 OSRM nedosegljiv (hevristika odkrito,
  urnik izvedljiv, FIXED dela); G-A7 popolna blackout (200, 0 izmišljenih,
  KT kanon lokalen); G-A8 AI 429 → fallback (root-cause fix dokazan);
  G-A8b AI malformed izhod → graceful fallback; G-A9 neveljavne koordinate
  (robustno); G-A10 podstavljene FIXED koordinate (kanon zmagá, urejanje
  iz kanona).
- **Refinement (§19)**: R1 quick-action »manj vožnje« (FIXED preživi,
  koherenca ohranjena); R2 echo ob AI odpovedi (isti vrstni red,
  validacija, koherenca, FIXED 1× kanon). Refinement NE ustvari zig-zaga.
- **SL/EN pariteta**: isti vhod v obeh jezikih → IDENTIČEN vrstni red
  in noge (urejanje je jezikovno neodvisno).

Glavne trditve (brez arbitrarnih pragov): **T1** backtracking = 0 na
vseh geo-scenarijih; **T2** haversine total odziva ≤ stari oceni-red nad
ISTIMI postanki (razen FIXED sidrov — uporabniška omejitev lahko
legitimno stane km, iskreno javlja); **T3** determinizem; **T4** FIXED
točno 1× s kanonom; **T5** vremenski bloki ohranijo notranje naboré.

---

## 10. BROWSER E2E (§22)

- SL hero (»Želim miren vikend … 500 €«) → AI načrt: 3 dnevi, ~380 km,
  realno vreme, OSRM črte po realnih cestah, Urnik drive-aware, BudgetPanel;
  geo zastave na dolgih etapah odkrito (⚠/!).
- Quick-action »Manj vožnje« → 200, »0 sprememb, geo ok→ok« (dan pod
  pragom — brez dokaza NI trditve izboljšave; med sejo je AI zadela
  realni 429 → določna pot je odpovedala elegantno).
- EN hero → isti kanonski model (~380 km, €270/€500), BudgetPanel
  »Within budget: all planned costs are verified — €270 of €500.«
- 375 px in 390 px: 0 horizontalnega preliva; footer `min-h-screen flex
  flex-col` (+ `mt-auto`) — porinjen naravno na dolgi strani; 0 napak strani.

---

## 11. P0–P3 (§23)

- **P0**: 0 odprtih.
- **P1**: 0 odprtih.
- **P2 zaprta**: (1) geografsko slep fallback izbor (ta task, root cause);
  (2) degeneriran termin ob nasičenem dnevu (tla nasičenja 23:00–23:30).
- **P3 (dokumentirane omejitve, odkrito javljene)**:
  1. Več FIXED, ki pristanejo na ISTEM nasičenem dnevu (npr. trojna
     protislovna sidra), se vstavijo v vrstnem redu izbire na konec dneva —
     intra-dan E→W→E→W vzorec je možen (F3: odkrito javljen — day_km/
     leg_distance zastave + urnik pokaže vožnje). Morebitni popravek:
     geografska intra-dnevna vstavitev FIXED (mid-day insert) — izven
     minimalnega obsega tega taska.
  2. Coherence observability vrstica samo na fallback poti (AI pot ima
     geo-validation zastave; AI vrstni red je avtorski).

---

## 12. REGRESIJA (§22)

| Preverjanje | Rezultat |
|---|---|
| Testi | **916/916** (871 prej + 45 novih) |
| Lint | 0 napak |
| tsc (src/) | 0 napak |
| Browser E2E SL/EN | GREEN (§10) |
| 375 px / 390 px | 0 preliva |
| Vsi prejšnji invarianti | FIXED 1× kanon, echo veja, schedule repair, budget iskrenost — nedotaknjeni (916/916 vključno TASK 48/49/50 suite) |

---

## 13. ZAKLJUČEK

TASK 51 STATUS: **GREEN**.

Geografska koherenca fallback itinerarjev je zdaj **deterministično
zagotovljena in izmerljiva**: izbor destinacij ostaja iskren (enak
oceni-interesov, sezoni, vremenu), vrstni red pa urejen okoli
verificiranih FIXED sidrov s požrešno veriko najbližjih-sosedov —
živi OSRM dokazi: B2 1115 → 755 km (−32 %), B3 1650 → 870 km (−47 %),
0 backtracking dogodkov na vseh preizkušenih scenarijih; haversine je
izključno hevristika urejanja (nikoli trditev o času vožnje), realne
noge in urnik ostajajo OSRM + repair; FIXED sidra ostanejo na kanonskih
lokacijah v vrstnem redu izbire, klientove podstavljene koordinate ne
preidejo validacijske plasti; ko OSRM ni dosegljiv, hevristika ostane
odkrito označena; refinement koherence ne pokvari. Preostale omejitve
so dokumentirane (P3 zgoraj) in odkrito javljene v izdelku.
