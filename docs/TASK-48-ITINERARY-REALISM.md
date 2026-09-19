# TASK 48 — ITINERARY REALISM & SUPPLY CONSISTENCY (1.53.0)

> Cilj: AI generiran itinerer, ki uporablja REALNE supply produkte, je
> FIZIČNO, ČASOVNO in FINANČNO konsistenten — brez izmišljenih podatkov.
> Task 47 je dokazal, da AI uporablja kanonski supply; Task 48 dokazuje,
> da je sestavljeni načrt preverljiv (čas / geo / cena / proračun / FIXED
> izbire / supply reference) — na generaciji IN na refine poti.
>
> ```
> USER INTENT → AI ITINERARY → REAL SUPPLY → TIME/GEO/PRICE VALIDATION
>            → VALIDATED ITINERARY (fail-closed)
> ```

---

## 1. AUDIT (§1) — kaj je sistem dejansko preverjal pred Taskom 48

Prebrana dejanska koda na HEAD (`649fa79` — vsebina Taska 47; checkpoint SHA
iz specifikacije v tem repu ne obstaja, delo Taska 47 je prisotno):
`supply/types.ts`, `sanitize.ts`, `stop-insert.ts`, `selection*.ts`,
`registry.ts`, `search.ts`, `api/itinerary/route.ts`,
`api/itinerary/refine/route.ts`, `geo-validation.ts`,
`itinerary-quality.ts`, `itinerary-sanitize.ts`, `types.ts`.

| # | Ugotovitev (pred) | Resnost |
|---|---|---|
| 1 | **REFINEMENT BYPASS (§14) — POTRJEN**: refine pot sanitizira shape, a NE ponovno uveljavi FIXED (AI lahko tiho zbriše supply postanek), NE deduplicira supply referenc, NE preverja cen/koordinat/smeri supply postankov | **P0** |
| 2 | **Časovne invariante (§4)**: `schedule_overlap`/`schedule_gap` se računata SAMO za noge z OBEEMA T1 konci (`COORDS.get` miss → `continue`) — noge s supply postanki (lastne koordinate) so IZVZETE iz vseh treh preverjanj (razdalja, vožnja, urnik). Obrnjen/neveljaven `time_slot` (`parseSlot` → null) se tiho preskoči BREZ issue | P1 |
| 3 | **Cena supply postanka (§7)**: `estimated_cost` = flat znesek neodvisno od unita (`per_person` se NE pomnoži z groupSize) | P1 |
| 4 | **Budget status (§12)**: `recomputeTotalBudget` sicer preračuna vsoto, a je NIČOLI ne primerja z uporabnikovim budgetom; ni statusa within/exceeded/uncertain | P1 |
| 5 | **Dedupe (§10)**: `insertProductStop` deduplicira ob vstavitvi, a AI lahko v odgovoru izpiše isti `provider:productId` dvakrat (post-generation dedupe ne obstaja) | P1 |
| 6 | **Supply ref (§17)**: kolon-format ref v AI izhodu se NE preverja proti kanonski avtoriteti — izmišljen ID (npr. `viator:999`) se tiho sprejme kot postanek | P0 |
| 7 | **Observability (§18)**: ni dogodka o validaciji itinererja | P2 |
| 8 | Diskriminator: chat `osm-node-*` (brez dvopičja) ≠ supply `osm:node-123` (dvopičje); T1 id-ji brez dvopičja — kolon-format JE zanesljiv supply ref | — |
| 9 | `/api/itinerary/ask` = read-only Q&A — ne mutira načrta, ni vrzel | — |
| 10 | Hitre akcije = deterministične transformacije (`stop_removed` = eksplicitna intencija) — vrzel je SAMO AI refine pot | — |

---

## 2. ARHITEKTURA REŠITVE

### 2.1 Nova plast: `src/lib/supply/itinerary-validation.ts`

ČISTA, deterministična, 100 % lokalna funkcija (brez remote klicev — §19),
ki teče NAD AI izhodom na VSEH treh poteh (generacija AI, fallback,
refine AI + hitra akcija). Fail-closed:

```
GENERACIJA (AI pot):
AI JSON
  → sanitizeItinerary (shape guard — obstoječe)
  → revalidateSupplyStops (TASK 47, obstoječe — ref avtoriteta: izbira ∪
     strežni supply kontekst; izmišljen → dropped; znan → rebind naslov/
     cena/geo/notes/category)
  → validateItinerarySupply (NOVA TASK 48 plast — INVARIANTI):
       1. SUPPLY REFERENCE  — kolon-ref proti avtoriteti; izmišljen → ODSTRANJEN
       2. DUPLICATE SUPPLY  — isti (provider, providerProductId) → največ 1×
       3. PRICE CONSISTENCY — unit semantika (§7) — popravi Task 47 FLAT rebind:
                              per_transfer/per_vehicle/total → znesek
                              per_person → znesek × groupSize
                              per_night/per_day → unknown (§8)
       4. GEO CANONICAL     — koordinate odmeva → kanonske iz vira
       5. TRANSFER DIRECTION — obrat puščice v naslovu → kanonski naslov (§5)
       6. FIXED INVARIANT   — manjkajoča FIXED izbira → deterministična
                              vstavitev (insertProductStop: najbližji dan,
                              večernji slot) — točno enkrat, z kanonsko ceno
  → enrich (vreme/dogodki/kakovost/OSRM/geo-validation/razlage)
  → computeBudgetValidation (§12): within | exceeded | uncertain
  → odgovor: itinerary.supplyValidation + itinerary.budgetValidation

REFINE (AI + hitra akcija) — P0 POPRAVEK:
AI JSON / quick action
  → sanitizeItinerary (shape guard)
  → validateItinerarySupply (ISTA TASK 48 plast; avtoriteta: izbira ∪
     currentStops = supply postanki načrta PRED spremembo)
```

**Avtoriteta (prioriteta)**:
1. `selection` — izbira z zemljevida (PriceInfo z unit semantiko + fromPrice
   + geo + selectionState). Generacija prejme `selection` iz zahteve; refine
   prejme `selection` (klient pošlje store stanje — isti vzorec kot
   generacija) ∪
2. `currentStops` — supply postanki NAČRTA PRED spremembo (samo refine):
   prikazana cena/koordinate so izhodišče, ki ga AI odmev ne sme tiho
   spremeniti (avtoriteta drugega reda).

**Semantika FIXED ponovne vstavitev** (`reinsertFixedFrom`):
- `"selection"` (generacija): vse FIXED izbire — AI jih ne more izničiti.
- `"current"` (refine): SAMO FIXED, ki so bile v načrtu pred spremembo —
  refine ne vsiljuje NOVIH postankov, ki jih trenutni načrt nima (to je
  delo generacije; sicer bi "pomiri dan 2" lahko vstavilo nov večernji
  postanek).
- `reinsertFixed: false` (hitre akcije): odstranitev postanka je eksplicitna
  uporabnikova intencija (`stop_removed`) — sloj ne vsiljuje nazaj.

**Smer prevoza (§5)** — `isDirectionReversed`: ozko deterministično pravilo
(puščica v naslovu, žetoni krajev brez kvalifikatorjev "Private/Airport/
Transfer/…"). Obrat je popravljen SAMO, kadar je dokazljiv (obstojnost
žetonov) — nikoli false positive. Kvalifikatorji se ignorirajo; brez
puščice → ni trditve.

### 2.2 Časovne invariante (§4): `src/lib/geo-validation.ts`

- **`time_slot_invalid`** (ERROR, novo): termin, ki ustreza vzorcu `HH:MM-HH:MM`,
  a se konča pred/ob začetku (npr. `13:00-09:00`) — prej TIHO preskočen
  (`parseSlot` → null), zdaj issue. Neformatiran termin ("cel dan") ostaja
  brez trditve (§8).
- **`duration_invalid`** (ERROR, novo): nepozitivno/NaN trajanje (varovalka za
  stare shranjene načrte; novi gredo skozi clamp sanitize).
- **Supply noge sodelujejo** (§6): koordinate se razrešijo iz T1 dataseta
  ALI lastnih lat/lng postanka — prej je bila KATERAKOLI noga z ne-T1 koncem
  izvzeta iz razdalje/vožnje/urnika. Razdalje ostajajo hevristika
  (haversine × 1,3 ÷ 55 km/h, pošteno z `~`), razkrita v
  `geoValidation.method` — NI novih OSRM klicev za supply id-je (§19).
- **Urnik neodvisen od koordinat**: prekrivanje terminov (`schedule_overlap`)
  se preverja za VSE zaporedne pare s parsable termini (§4: prejšnji konec ≤
  naslednji začetek, ko sta termina časovno fiksna); primerjava vrzeli z
  vožnjo (`schedule_gap`) le ob znani nogi (§6 — brez izmišljenih časov).
- **Null island (0,0)**: točno (0,0) se šteje kot MANJKAJOČE koordinate
  (geo sentinel "ni podatka", ki ga AI odmev izpljune namesto koordinat —
  živ primer: refine "socca" @ (0,0) bi izračunal ~6.920 km nogo) →
  `missing_coords` ERROR, ne absurdne razdalje.

### 2.3 Budget status (§12): `computeBudgetValidation`

Deterministični status iz ZNANIH (dokazljivih) stroškov:

| Status | Pogoj |
|---|---|
| `exceeded` | znani kanonski stroški > budget (celo spodnja meja je čez) |
| `within` | kanonski IN prikazani seštevek ≤ budget IN vsi postanki cenovno znani IN brez "od" cen |
| `uncertain` | sicer (neznan strošek / fromPrice / prikaz nad budgetom / brez budgeta) |

Znani stroški: supply postanki z veljavno PriceInfo in znano unit semantiko
+ T1 postanki (uredniški dataset: costPerPerson × groupSize). Vse ostalo
(klepet kraji, OSM info_only, per_person brez groupSize, per_night …) šteje
kot unknown — **unknown is unknown** (§8): nikoli "znotraj proračuna",
česar ne moremo dokazati.

### 2.4 Refine pot (§14 — P0 fix)

- Klient (`itinerary-refiner.tsx`) pošlje `selectedProviderProducts` iz
  store-a z vsako refine zahtevo (isti vzorec kot generacija).
- Strežnik sanitizira izbiro (ista meja zaupanja: provider whitelist, enumi,
  kapice) in po `sanitizeItinerary` požene `validateItinerarySupply` z
  avtoriteto `selection` + `currentStops` (načrt pred spremembo),
  `reinsertFixedFrom: "current"`.
- Hitra akcija pot (AI padel): isti sloj, `reinsertFixed: false`.
- Prompt (SL+EN) dobi novo pravilo 8: postanki z dvopičjem v ID so
  uporabnikova izbira — ohrani jih nespremenjene, nikoli ne izmišljuj novih.

### 2.5 Prikaz (§12): `BudgetPanel`

Strežniško izračunan status (rdeča/zelena/oranžna ploščica v proračunskem
panelu, SL+EN): "Znotraj proračuna: vsi načrtovani stroški so preverjeni —
€X od €Y" / "Znani stroški (€X) že presegajo proračun…" / "Znani stroški
doslej: €X od €Y — končnega zneska ni mogoče v celoti dokazati (razlog)".
Stari shranjeni načrti brez polja → ploščica se ne prikaže (nazaj
kompatibilno).

### 2.6 Observability (§18)

`itinerary_validated` dogodek v `AnalyticsEvent` (strežniško, neblokirajoče,
brez PII/skrivnosti): `path` (generate|refine), `source`
(ai|fallback|quick_action), `supply_stops`, `validated`, `rejected`,
`deduped`, `price_corrections`, `geo_restored`, `directions_fixed`,
`reinserted`, `fixed_count`, `budget_status`, `issues`. + `console.warn`
ob vsakem nepraznem poročilu.

---

## 3. TESTI (§16) — `src/lib/__tests__/itinerary-validation.test.ts` (50) + `geo-validation.test.ts` (+13)

**SUPPLY REF**: kolon-format parse (provider:id / T1 brez dvopičja /
klepet `osm-node-*` / neznan provider `fake:123` → null) · veljaven ref
ostane · izmišljen ref ODSTRANJEN (fail-closed) · T1/klepet postanki
nespremenjeni.

**DUPLICATE (§10)**: isti provider+id dvakrat → dedupe · ISTI id pri
različnih ponudnikih = 2 RAZLIČNA produkta (oba ostanejo) · isti naslov
pri različnih ponudnikih NE deduplicira.

**PRICE (§7/§8)**: per_transfer NI × osebe (€51 za 2 = €51) · per_vehicle/
total neodvisno od skupine · per_person × groupSize (€79×2=€158) ·
per_person brez groupSize → null · per_night/per_day → null · fromPrice →
cost + fromPrice:true · odmev z ×osebe popravljen na kanonsko · odmev z
golim zneskom popravljen na ×groupSize · kanonsko neznan → brez popravka.

**GEO (§6)**: koordinate odmeva (drift na Piran) → obnovljene iz kanona.

**DIRECTION (§5)**: obrat puščice → true · ista smer s kvalifikatorji →
false · kvalifikatorji se ignorirajo (Airport) → dokazljiv obrat · različni
kraji brez skupnih žetonov → false (brez false positive) · brez puščice →
false.

**FIXED (§9)**: izpust → vstavitev točno ENKRAT (najbližji dan) · že
prisoten → ne podvoji · nastanitev NI postanek · brez geo → ni vstavljena ·
dva FIXED → oba enkrat · `reinsertFixed:false` → ostane izpuščen.

**REFINEMENT (§14)**: UNCHANGED → 0 sprememb · CHANGED cena → obnovljena
(izbira ima prednost, current druga) · REMOVED FIXED → PONOVNO VNEŠEN ·
REMOVED PREFERRED → ostane odstranjen · NOV fabrikantrt ref → ODDSTRANJEN ·
FIXED v izbiri, ki NI bil v current → refine ga NE vsili · currentStops kot
edina avtoriteta (stari klient brez izbire) → cena stabilna.

**BUDGET (§12)**: vsi znani + znotraj → within · znani nad budgetom →
exceeded · prikazani nad budgetom → uncertain · neznan strošek → uncertain ·
fromPrice → uncertain · supply z znanimi kanonskimi → within · per_night →
uncertain · brez budgeta → uncertain · T1 brez groupSize → uncertain ·
**500 € + 480 € znanih + 100 € nov izdelek → exceeded**.

**TIME (§4, geo-validation)**: obrnjen termin → `time_slot_invalid` ERROR ·
termin 09:00-09:00 → invalid · neformatiran → brez issue · duration 0/NaN →
`duration_invalid` · prekrivanje supply+T1 brez koordinat → `schedule_overlap`.

**GEO noge (§6, geo-validation)**: T1→supply z lastnimi koordinatami
sodeluje v razdalji (Ljubljana→Piran POI warn + km > 80) · supply+supply
noga šteje v km dneva · schedule_gap s supply koordinatami · brez koordinat
→ samo missing_coords (ni urniške/razdaljske trditve) · **null island
(0,0) → missing_coords, NE ~6.920 km noga** · veljavne koordinate niso null
island.

**FAILURE**: malformed JSON shape → obstoječa `sanitizeItinerary` plast
(1.33.0, pokrito v `itinerary-sanitize.test.ts`) · fake availability/
booking URL → sanitize izbire (Task 47, pokrito v `supply-contract.test.ts`)
· fake supply ID → REJECT (zgoraj).

---

## 4. E2E DOKAZI (§17) — živi klici na dev strežnik (2026-09-19)

| Scenarij | Rezultat |
|---|---|
| **A TRANSFER**: live OSM iskanje (Bled, zoom 15) → 25 realnih produktov; FIXED izbira (Mala Osojnica `osm:node-3591726079` + Viator tura per_person €79) → generacija (source: **ai**) | `supplyValidation {supplyStops:2, validated:2, reinserted:2}` — AI je IZPUSTIL oba FIXED → sloj ju vstavil **vsak točno 1×**; Viator kanonska cena **€158** (79×2); OSM €0 (info_only, unknown is unknown); `budgetValidation {status:"uncertain", knownTotal:418, unknownCostStops:1}` — iskreno, ker OSM postanek nima cene |
| **D REFINEMENT**: isti načrt → refine "Dodaj še en mirno jezero" z izbiro | AI odmev je vseboval **2 IZMIŠLJENA supply refa** → `rejected:2` (ODSTRANJENA, fail-closed) + 2 FIXED ponovno vnešena; kasneje: geo drift vnešenega ture → `geoRestored:1` — **P0 bypass fix deluje živo** |
| **Null island**: AI odmev "socca" @ lat 0, lng 0 | prej (pred fix): ~6.920 km noga; zdaj: `missing_coords` ERROR (iskreno "ne morem preveriti"), tripKm 225 |
| **BUDGET (§12)**: fallback generacija brez izbire | `budgetValidation {status:"within", knownTotal:200, stopsTotal:200}` — vse cene znane |
| **§18 observability** | 5 × `itinerary_validated` dogodkov v DB (generate/ai, generate/fallback, refine/ai ×3) s polnimi števci |
| **SL UI** | načrt se izriše (Dan 1), plošča izvedljivosti, BudgetPanel "Znotraj proračuna: vsi načrtovani stroški so preverjeni — 200 od 500" |
| **EN UI** | plan renders (Day 1), "Trip budget" panel, status "Known costs so far … not fully provable" (uncertain — iskreno) |
| **MOBILE** | 390 px + 375 px: brez horizontalnega overflow, footer `min-h-screen flex flex-col` (prilepljen na dnu kratke vsebine, porinjen pri dolgi) |
| **Regresija geo** | isti fallback načrt skozi `validateItineraryGeo` PRED in PO spremembah → IDENTICEN izid (`2:schedule_gap:error`) — T1 obnašanje nespremenjeno |

---

## 5. POZNANE OMEJITVE (iskreno)

1. **Supply noge = hevristika**: OSRM indeks nog pokriva samo T1 id-je
   (`collectLegPairs` filtrira po `DESTINATION_COORDS`) — supply noge
   uporabljajo razkrito haversine × 1,3 (enako kot padec OSRM). NI novih
   remote klicev (§19). FOLLOW-UP: razširitev `collectLegPairs` na lastne
   koordinate postankov.
2. **Vstavitev FIXED v pozni večer**: `insertProductStop` (Task 47
   mehanika, nespremenjena) lahko na zelo polnem dnevu vstavi FIXED v slot,
   ki se prekriva z odmevim večernim postankom — prekrivanje je ODKRITO
   (`schedule_overlap` ERROR), ne skrito. FOLLOW-UP: pametnejši izbor
   slota.
3. **AI lahko izmisli ne-supply id** (npr. `mala-osojnica` brez dvopičja):
   sloj ga NE odstrani (diskriminator je dvopičje — §13: CONTENT ≠
   COMMERCIAL SUPPLY), geo-validation ga odkrije kot `missing_coords`
   (neznan id) — fail-visible.
4. **currentStops avtoriteta za stare načrte**: načrti, generirani PRED
   Taskom 48, lahko nosijo netočno flat ceno supply postanka — refine jo
   ohrani stabilno (konzervativno), popravi jo le generacija z živo izbiro.
5. **Availability**: supply validacija NE preverja razpoložljivosti
   (noben živi availability klic ne obstaja za priložene providerje —
   OSM nima koncepta, komercialni niso priključeni). Unknown ostaja
   unknown (§8).

## 6. FOLLOW-UP (NI del tega taska — brez novih providerjev/API-jev)

- OSRM noge za supply id-je (točke 1 zgoraj).
- Pametnejši večernji slot za FIXED vstavitev (točka 2).
- Kanonizacija T1 cen odmevov (echo popravek na `costPerPerson × groupSize`
  — zdaj se echo pusti, budget status pa se računa kanonsko).
- Live availability preverjanje, ko bo provider dejansko priključen
  (Tiqets/Booking/GYG/Viator ostajajo CONTRACT VERIFIED / NOT CONFIGURED).

## 7. DATOTEKE

| Datoteka | Sprememba |
|---|---|
| `src/lib/supply/itinerary-validation.ts` | NOVA plast (parseSupplyRef, canonicalStopCost, isDirectionReversed, computeBudgetValidation, validateItinerarySupply, extractSupplyStops, logItineraryValidation) |
| `src/lib/geo-validation.ts` | `time_slot_invalid` + `duration_invalid` pravili, coordsOfStop (T1 ∪ lastne ∪ null island), urnik neodvisen od koordinat |
| `src/lib/types.ts` | `Itinerary.supplyValidation` + `Itinerary.budgetValidation` (+ `SupplyValidationInfo`, `BudgetValidationInfo`), GeoRuleId razširitev |
| `src/app/api/itinerary/route.ts` | TASK 48 invariantna plast NAD Task 47 revalidacijo (nadomesti `applyFixedSelectedProducts` klic — ista mehanika + unit cena; avtoriteta: izbira ∪ aiSupplyAuthority ∪ currentStops), budget status, observability |
| `src/app/api/itinerary/refine/route.ts` | **P0 fix**: supply revalidacija na AI + quick-action poti, prompt pravilo 8 (SL+EN), budget status, observability |
| `src/components/sections/itinerary-refiner.tsx` | izbira se pošlje z refine zahtevo (store → formData) |
| `src/components/budget-panel.tsx` | status proračuna (within/exceeded/uncertain, SL+EN) |
| `src/lib/__tests__/itinerary-validation.test.ts` | NOVA: 50 testov (§16 matrika) |
| `src/lib/__tests__/geo-validation.test.ts` | +13 testov (§4/§6/null island) |

**Testi (integrirano na origin/main 3ed963c)**: 807 testov / 805 pass /
2 fail — OBA fail sta PREDHODNA na pristine origin/main (GYG Task 46
test-order interference: samostojen zagon datoteke 45/45, polni suite 2
fail zaradi modulnega stanja med datotekami; NI Task 48 regresija —
dokazano A/B: pristine 745/743+2, z Task 48 807/805+2, +62 novih pass).
**Lint**: 0 napak. **TypeScript**: 0 napak (samo predhodne `skills/` +
`tailwind.config` opombe zunaj projekta).

**Končni SHA (1.53.0)**: `bdd5f86` — ponovno E2E verifikacija po
integraciji (2026-09-19): generacija z FIXED izbiro
(`reinserted:2`, Viator €158 = 79×2 per_person, OSM €0 info_only),
refine P0 pot (`reinserted:2` — AI odmev izpusti FIXED, plast jih
vrne točno 1×), `itinerary_validated` dogodki v DB (generate/ai +
refine/ai), BudgetPanel SL (uncertain z razlogom) + EN (within
"€280 of €500"), 390 px + 375 px brez horizontalnega overflow,
footer `min-h-screen flex flex-col` + `mt-auto` (porinjen pri dolgi
vsebini).

---

## RE-VERIFIKACIJA (2026-09-19, HEAD `ab30f0c` — po TASK 49/50/51)

Nadzor nad izvirno specifikacijo §1–§22 po tem, ko so se nad plastjo
Taska 48 nabrala trije naslednji taski (49: selection-verify strežna
resnica; 50: schedule-slots/repair + price_unverified; 51: geo-order +
geo-coherence + OSRM failure matrika). Audit „ne zaupaj poročilom" —
branje dejanske kode na HEAD + polna regresija + živa E2E.

### Ugotovitve audita (§1)

- **Vrsta §15 JE samo okrepljena**: `sanitizeItinerary →
  revalidateSupplyStops → verifyCurrentStopsAuthority →
  validateItinerarySupply (ref/dedupe/cena/geo/smer/FIXED) →
  recomputeTotalBudget → computeBudgetValidation →
  buildLegRouteIndex (OSRM) → repairScheduleGaps →
  validateItineraryGeo` — velja za VSEH 5 poti (AI, fallback,
  refine-AI, quick-action, fallback_echo; refine route vrstice
  571/591/627/660/690/746/877/908/918/932).
- **§4 časovne invariante** (`time_slot_invalid`, `duration_invalid`,
  `schedule_overlap` v geo-validation.ts) + TASK 50 repair — intaktne.
- **§7 unit semantika** (`canonicalStopCost`: per_transfer ≠ ×osebe,
  per_person × groupSize, per_night unknown) — intaktna; TASK 49
  `selection-verify` dodaja kanonsko avtoriteto NAD klientovo izbiro.
- **§8 unknown is unknown** — okrepljeno (TASK 50 `price_unverified`:
  neverificirana klientova cifra → NaN + poštena opomba SL/EN).
- **§9/§10 FIXED/dedupe** — intaktni (refine le iz `current`,
  dedupe SAMO po (provider, id)).
- **§12 budget** — `computeBudgetValidation` unchanged; „uncertain"
  zahteva dokazljivost — živo dokazano spodaj.
- **§13 vsebina ≠ komercialna ponudba** — OSM info_only: cena/razpolo
  žljivost VEDNO odstranjena (selection-verify vrstica 193).
- **§14 refine bypass** — ZAPRT (P0 fix 1.53.0; TASK 50 je zaprl še
  echo vejo — surov klientov payload nikoli ne vrne nevalidiran).

### Regresija (§20)

- Testi: **947/947, 0 fail** (enako kot končno stanje Taska 51).
- Lint: **0**. TypeScript: **0** napak v `src/` (samo predhodne
  opombe `skills/` + `tailwind.config.ts` zunaj aplikacije).
- Git: delovno drevo ČISTO (samo gitignored `.zscripts/e2e/` orodja).

### Živa E2E (brskalnik, §17) — 2×FIXED (kiwitaxi:408 €51 + :409 €51)

- **A — TRANSFER**: /zemljevid → Pokaži POI → čip Transferji → zoom
  ≥ 10 → **48 izdelkov** → modal („na prevoz", „objavljena cena, ni
  živi citat", vir KiwiTaxi) → Dodaj v moj načrt → sessionStorage
  `dai:supply-selection` strukturiran FIXED item.
- **B — FIXED 2×**: banner „Izbrani produkti (2) · obvezne"; generi
  ran načrt vsebuje TOČNO 2 supply postanka (1× vsak — dokazano po
  števcu opomb „vir: KiwiTaxi"/„source: KiwiTaxi" = 2; dodatni pojavi
  naslova v tekstu so booking-offer vrstice, ne postanki).
- **C — BUDGET 500 €**: BudgetPanel → **uncertain** („končnega zneska
  ni mogoče v celoti dokazati — 2 „od" ceni") — §12 iskrenost, NE
  „within" nad fromPrice.
- **D — REFINEMENT**: hitra akcija `slower_pace` → deterministično,
  4 spremembe, geo error→ok (isti validacijski sloj); prosto-besedilni
  refine → FIXED supply postanki PREŽIVIJO refine (fallback_echo pot).
- **E/F — SL+EN**: EN pot: banner „Selected products (2) · mandatory",
  „Day 1–3", 2× „source: KiwiTaxi" + 2× „per transfer".
- **G — MOBILNI**: 390 px in 375 px — **0 px** horizontalnega preliva,
  0 napak strani; footer `min-h-screen flex flex-col` + `mt-auto`.
- dev.log dokazi: `supply-aware: context=48 (capped 12) fixed=2`,
  `TASK 50 schedule repair`, `TASK 51 geo coherence: stops=8 km=530
  (osrm=4) anchors=2` — realne OSRM noge.

### Omejitve okolja (iskreno, FOLLOW-UP — brez sprememb kode)

1. **z-ai SDK trenutno 429** (preizkušeno 3×): generacija E2E je
   tekla po DETERMINISTIČNI FALLBACK poti — kar je točno §15/§18
   zahtevo (AI odpoved → popolnoma validiran fallback, nikoli
   pokvarjen načrt). AI pot samo je pokrita z 947 unit testi +
   prejšnjimi živimi dokazi (Task 47: „AI uspešno (source:
   z-ai-sdk)"). FOLLOW-UP: ponovna živa AI E2E, ko se kvota sprosti.
2. **Prisma klient se ob vsakem `next dev` regenerira kot postgres**
   (`next.config.ts` vrstica 14: `execSync("npx prisma generate")` —
   default schema = postgres za Vercel): v SQLite sandboxu vsi
   DB-dotiki fail-open (ranking engine, analitika, bookings — vsi
   try/catch, zlata pot NESPREMENJENA). Ni regresija Taska 48 (baza v
   tem vsebniku nikoli ni delovala). FOLLOW-UP: pogojni
   `--schema schema.dev-sqlite.prisma` glede na `DATABASE_URL`.
3. **OOM 4 GB**: dolgo tekoči dev strežnik + Chromium presežeta RAM —
   E2E disciplina: svež strežnik na vsakem runs, `agent-browser close`
   na koncu (shranjeno v `.zscripts/e2e/`, gitignored).

**Sklep re-verifikacije**: TASK 48 GREEN na HEAD `ab30f0c` — vse
invariante §1–§22 ostajajo izvršene, nadgrajene z Taski 49–51, brez
regresij, z živimi dokazi A–G.
