# TASK 51 — GEOGRAPHIC ITINERARY COHERENCE & FALLBACK REALISM (1.56.0/1.56.1)

Končno poročilo v formatu §29 specifikacije.
Datum: 20. 9. 2026 · Glavni del: commit `1e0ffb7` (1.56.0) · Dopolnitev
§15/§16/§21/§22/§25: 1.56.1 · Prejšnji: TASK 50 (1.55.1, GREEN — 34/34
scenarijev, 12/12 adversarial, 871/871 testov).

Detajlna vzročna analiza, matrike G3/G5/G7/F/G-A in živi dokazi pred/po so
v `docs/TASK-51-GEOGRAPHIC-COHERENCE.md` (1.56.0). To poročilo je ZAKLJUČEK
celotnega TASK 51 (vključno z dopolnitvijo §15–§30 iz 1.56.1).

---

## 1. REPOSITORY

| Postavka | Vrednost |
|---|---|
| HEAD (pred 1.56.1) | `1e0ffb7` (1.56.0 — TASK 51 glavni del) |
| origin/main | `b5d2c1b` (1.55.1 — lokalni HEAD je PRED oddajo naprej; isti projekt, sandbox repozitorij) |
| Branch | `main` |
| Drevo | čisto na `1e0ffb7`; spremembe 1.56.1: `src/lib/road-routing-server.ts`, `src/app/api/itinerary/route.ts` (2 minimalna popravka) + testi/dokumentacija |

## 2. BASELINE (§2)

| Postavka | Vrednost |
|---|---|
| Testi | 916/916 PASS (871 iz 1.55.1 + 45 iz 1.56.0) |
| Lint | 0 napak |
| tsc (src/) | 0 napak |
| Dev strežnik | GET / in /en = 200 |
| TASK 50 GREEN | reprodukcija potrjena |
| Browser E2E | SL+EN zeleni (1.56.0 session), 375/390 px 0 preliva |

## 3. ROOT CAUSE — zakaj je nastal 890–1075 km zig-zag?

`generateFallbackItinerary` je obiskoval destinacije **V VRSTNEM REDU PO
OCENI** (število ujemanj interesov + rating/10) — geografija ni sodelovala
NIC. Dokazan repro (deterministično, živi OSRM):

- **B2** (5 dni, 300 €): 1115 km — Triglav → Soča → Bohinj → Postojnska
  jama → Vintgar → Kobarid → Slovenj Gradec → Novo mesto → Črnomelj →
  Dravograd (bohinj po triglavu = vračanje; dravograd po črnomlju = skok).
- **B3** (7 dni, 150 €): 1650 km, isti vzorec (haversine kontrola 870 km).

Odgovori na §3: vhod = budget/days/interests; izbor po oceni (TOČNO določen);
vrstni red = čisti oceni-red; pot = **fallback** (AI določno odpovedan — 429 /
omrežje); FIXED ni bil prisoten; OSRM JE bil prisoten (9/9 oziroma 13/13
realnih nog — razdalje so bile RESNIČNE, vrstni red pa geografsko neumen).

**Fix (root cause, minimalen):** `src/lib/geo-order.ts` — deterministično
sidrovno urejanje (izbira postankov NESPREMENJENA, spremeni se SAMO VRSTNI
RED): sidra = VERIFICIRANE FIXED izbire (vrstni red izbire §8 F2, kanonske
koordinate Task 49), gruče ≤ 60 km okoli sidrov, outlierji (> 60 km od vseh
sidrov) verižijo ZA gručami (dokazan vzrok G5-4: vlečenje oddaljenih v
»najbližjo« gručo = vzhod→zahod→vzhod), brez sidrov = greedy NN veriga od
težišča izbranih, vremenski bloki ohranijo notranje naboré, izenačenja po
poolIndex. Haversine = IZKLJUČNO hevristika urejanja (0 omrežja); realne
noge/urnik = OSRM + repairScheduleGaps (Task 50). To NI TSP solver —
koherenca, ne optimum (§1/§28).

## 4. BEFORE / AFTER

| Metrika | Before (1.55.1) | After (1.56.0) |
|---|---|---|
| total distance — B2 (5d, 300 €) | **1115 km** (živi OSRM) | **755 km** (−32 %) |
| total distance — B3 (7d, 150 €) | **1650 km** (živi OSRM) | **870 km** (−47 %) |
| longest leg | neciljno (oceni-red) | merjeno (M2) + odkrito |
| backtracking (M3) | nezaznan | **0 dogodkov** na vseh geo-scenarijih (35 testnih) |
| schedule gaps | 0 (Task 50 repair) | 0 (nespremenjeno — §16 potrditev) |
| schedule overlaps | 0 (Task 50) | 0 (P1 assert) |
| vrstni red | nedeterministična geografija | **determinističen** (isti vhod → isti red, T3) |

Živi dokazi po fixu (živi OSRM): B2 755 km, B3 870 km, FIXED+tamper 530 km
— vsi 0 backtracking, noge vir "osrm". Browser E2E (1.56.1): SL AI načrt
~210 km (NW→W→JV koherentno), fallback načrt 365 km/5 OSRM nog/0
backtracking (dev.log vrstica `TASK 51 geo coherence (fallback): stops=6
km=365 (osrm=5/heuristic=0) longest=105km [osrm] backtracking=0`), EN isti
model (~215 km, ~€200 od €500).

## 5. MATRICE (povzetek; dokazi v TASK-51-GEOGRAPHIC-COHERENCE.md + testi)

| Matrika | Rezultat | Dokaz |
|---|---|---|
| 3-dnevna (G3-1–G3-6) | 6/6 PASS | task51-geo-coherence.test.ts |
| 5-dnevna (G5-1–G5-5) | 5/5 PASS | isto (G5-4 outlier regresija) |
| 7-dnevna (G7-1–G7-4) | 4/4 PASS | isto (B3 repro) |
| FIXED (F1–F4) | 4/4 PASS | isto (1×/2×/3× FIXED + fallback) |
| Fallback (AI 429/malformed/omrežje) | PASS | G-A8 + G-A8b + S11 (task50) |
| OSRM failure (500/timeout/malformed/omrežje) | PASS | RF1–RF12 (1.56.1): PRAVI pridobivalec v podprocesu nad lokalnim TLS strežnikom + nivo nog + nivo rute |
| Refinement (R1/R2 + FIXED 1/2/3/0) | PASS | R1 (quick-action), R2 (echo 429) + F1–F4 |
| Adversarial (G-A1–G-A10) | 10/10 PASS | task51-geo-coherence.test.ts |
| Geo data integrity (§21) | 9/9 PASS | GI baterija (1.56.1): null island / manjkajoče / neveljavne / zamenjane / lažne / Infinity (1e999) / fake id (fail-closed) / T1 bbox |

## 6. PERFORMANCE (§25)

- **Brez N+1**: `collectLegPairs` deduplicira pare (test N1: 4 postanki →
  NATANKO 3 OSRM klici, ne 12); drugi klic nad istim načrtom → 0 klicov
  (predpomnilnik 24 h / 600 vnosov, test N2).
- **Varovalka**: 4 zaporedne odpovedi → OSRM izklopljen 10 min (test N3:
  nevihta se ne razvnese) — vljudnost do javnega demo strežnika.
- **Sočasnost ≤ 4** (test N1 meri vrh).
- **Geografsko urejanje = 0 omrežja**: `orderAroundAnchors` je čista
  funkcija (haversine) — OSRM se kliče SAMO za relevantne noge končnega
  načrta (cheap candidate filtering → small candidate set → OSRM za legs →
  final validation; §25 zahtevani vrstni red).
- **Kandidate NE sortiramo po OSRM**: §5 — haversine je dovolj za
  razvrščanje kandidatov (pre-filter); OSRM samo za izbrane noge.
- Presoja po §25/§28: performance je zadostna → 0 dodatnih optimizacij.

## 7. OBSERVABILITY (§26)

Vrstice (brez PII, brez občutljivih podatkov):

```
[itinerary] Ranking engine: N kandidatov, top: …           (kandidati)
[itinerary] TASK 49 supply verify (izbira): X zavrnjenih … (supply integriteta)
[itinerary] TASK 50 schedule repair (fallback): X terminov … (urnik)
[itinerary] TASK 51 geo coherence (fallback): stops=N km=… (osrm=X/heuristic=Y)
  longest=…km [vir] backtracking=… anchors=…                (1.56.1: +stops=)
```

Geo odločitve so torej ugotovljive: vrstni red (koherenca + determinizem
testi), št. kandidatov (ranking vrstica), routing available/unavailable
(delež osrm/heuristic), total distance, longest leg, backtracking,
schedule repair (shifted/overlapShifted). `routingMethod`
("osrm"/"heuristic"/"mixed") je razkrito v geoValidation.method,
quality.routingMethod IN UI (itinerary-quality-card: „Linije poteka po
realnih cestah (OSRM/OpenStreetMap)" / EN prevod).

## 8. P0 / P1 / P2 / P3

| Razred | Št. | Opis |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | (našel in ZAPRL v 1.56.1: OSRM odgovor z distance NaN/Infinity/negativ je `typeof "number"` →šel skozi kot „verified osrm" noga z NaN km — zdaj `Number.isFinite` + nenegativnost → fail-closed hevristika; testi RF NaN/Infinity/negativ) |
| P2 | 0 | glavni P2 (geografsko slep fallback) ZAPRT v 1.56.0 |
| P3 | 2 | (1) intra-dan E→W→E→W pri VEČ FIXED na istem nasičenem dnevu (odkrito javljeno, geoValidation javi dolge noge); (2) coherence vrstica samo na fallback poti (AI pot nima geo-order vrstice — AI red prevetala validacija, ne deterministično urejanje). Oba dokumentirana, brez scope creep (§28). |

Forenzična opomba (orodje, ne produkcijska napaka): bash izpis v peskovniku
lahko poje `[ho` zaporedje v prikazu (datoteke so bile vedno pravilne —
dokazano z `od -c`; „tipkarska napaka v budget-panel.tsx" je bila ILUZIJA
izpisa, datoteka pri HEAD je veljavna).

## 9. TESTI

| Kategorija | Zahteva | Dejansko |
|---|---|---|
| Unit geo | 15+ | 24 čistih enot (U1–U12 geo-order + M1–M5 metrike; 1.56.0) |
| Integration route/order | 10+ | 33 (G3/G5/G7/F/G-A/R; 1.56.0) + 16 (RF/GI/H/P/N; 1.56.1) |
| Adversarial geography | 10+ | G-A1–G-A10 + G-A8b (1.56.0) + GI koruptivi + RF odpovedi (1.56.1) |
| E2E | 3d/5d/7d/FIXED/refine/fallback/OSRM failure/SL/EN | vse pokrito (testi + browser: SL hero, EN hero, quick-action 200, fallback z živimi OSRM nogami, 375/390 px) |

Skupaj: **947/947 PASS** (871 baznih + 45 iz 1.56.0 + 31 iz 1.56.1), lint
0, tsc 0 (src). Brez podvajanja (§24: §18 AI-fallback je ŽE bil pokrit —
G-A8/G-A8b/S11; ni dupliciran).

## 10. KONČNI FORMAT (§30)

```
TASK 51 STATUS

GREEN

Root cause

Fallback vrstni red destinacij je bil čisti oceni-red (interesi+rating) —
geografija ni sodelovala; dokazan repro B2 1115 km / B3 1650 km cik-cak
nad ŽIVIMI OSRM nogami.

P0

0 / 0

P1

0 / 1 (zaprt v toku: NaN/Infinity OSRM guard)

P2

0 / 1 (glavni P2 zaprt v 1.56.0)

P3

2 (dokumentirana, brez scope creep)

Geography

PASS

Routing

PASS

Schedule

PASS

FIXED

PASS

Fallback

PASS

Refinement

PASS

Adversarial

10 / 10 PASS (+ 9 GI koruptivov + 12 RF odpovednih načinov)

Tests

947 / 947 PASS

Lint

PASS

TSC

PASS

Browser E2E

PASS

Mobile

375 PASS
390 PASS
```

### Production conclusion

Sistem zdaj v normalnem in fallback scenariju (AI uspe / 429 / malformed /
omrežje; OSRM dosegljiv / 500 / timeout / malformed / mrtev; FIXED 0–3×;
refinement quick-action ali echo) sestavi geografsko koherenten, časovno
izvedljiv in supply-integren itinerary: vrstni red je deterministično
urejen okoli kanonskih sidrov (0 zaznanih vračanj na 35+ geo-scenarijih,
B2 −32 % / B3 −47 % km), vsaka noga odkrito nosi vir (OSRM kadar
dosegljiv; hevristika NIKOLI predstavljena kot realna cesta — razkrito v
legSummary.source, geoValidation.method, quality.routingMethod in UI),
urnik je drive-aware z repair nad realnimi nogami (0 prekrivanj, 0
schedule_gap/time_slot_invalid na fallback poti), FIXED lokacije ostanejo
kanonske (klientovi tamperi − vključno null island, NaN, Infinity, zamenjane
in lažne koordinate − se obnovijo ali zavrnejo), cene so kanonske ali
unknown, izmišljeni supply/cene/koordinate = 0. Brez N+1 OSRM klicev
(dedup + predpomnilnik + varovalka). 947/947 testov, lint/tsc 0, browser
SL/EN in 375/390 px zeleni.
