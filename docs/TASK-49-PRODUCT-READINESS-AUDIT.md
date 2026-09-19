# TASK 49 — PRODUCT READINESS & REAL-WORLD ITINERARY AUDIT (1.54.0)

> Cilj: ugotoviti, kje je Discover Slovenia AI glede dejanske produkcijske
> uporabnosti in kaj je največja preostala tehnična/products luknja.
> AUDIT + VALIDACIJA + P0/P1 popravki. Brez novih providerjev, brez novih
> funkcij, brez arhitekturnih sprememb brez dokaza.

---

## 1. REPOSITORY (§2)

| Postavka | Vrednost | Dokaz |
|---|---|---|
| HEAD pred taskom | `a4299da` (= origin/main, čisto drevo) | `git status --porcelain` = 0 |
| `bdd5f86` v origin/main? | **DA** | `git log origin/main` (fetch 19. 9.) |
| `a4299da` dokumentacijski HEAD? | **DA** | isto |
| GYG 2 testa reproducibilna na pristine? | **DA — VZROK NAJDEN IN POPRAVLJEN** (glej §2.1) | bisect: viator-hardening + gyg-hardening par = 2 fail |
| Novi failureji, ki jih Task 48 report ni zajel? | **NE** (isti 2 GYG, 0 novih) | polni suite |
| Package manager | bun (`bun.lock`) | — |
| Verzija | 1.53.0 → **1.54.0** | package.json |

### 2.1 VZROK 2 GYG FAILOV (odkrit v tem tasku — 807/807 prvič zeleno)

`providerRateLimited` v `search.ts` je **modulno stanje** (60 s drseče
okno). Register: viator `maxCallsPerMin: 20`. V polnem suite-u:

- `viator-hardening.test.ts` pošlje ~16 viator adapter klicev v `searchSupply`
- `getyourguide-hardening.test.ts` doda 7 (4 §23 + 3 ostali) → skupaj 23 > 20
- zadnja 2 GYG §23 testa (network + "vsi štirje živi") sta **lažno
  rate-limited** — viator adapter ni bil izveden, izdelek manjka.

Bisect verifikacija: `bun test viator-hardening + gyg-hardening` = 2 fail
(na obeh vrstnih redih); posamično 0 fail. **Fix**: `clearProviderRateLimits()`
v `beforeEach` gyg-hardening (isti vzorec kot
`getyourguide-regression.test.ts` in `supply-contract.test.ts`).
Po fixu: **807/807, polni suite zelen PRVIČ** (predhodna poročila 44–48
so 2 faila pripisovala "order interference" — vzrok ni bil znan).

---

## 2. NAJDENE LUKNJE (§3–§13) — prioritizacija (§16)

### P0 — FAKE PRICE / CLIENT-ONLY TRUST BYPASS (§4, §7) — POPRAVLJENO

**Vrzel**: `selectedProviderProducts` in trenutni načrt (refine) sta
klientova payloada. Sanitizacija (`sanitizeSelectedProviderProducts`)
validira OBliko (whitelist providerjev, enumi, kapice) — ne IZVOR.
`buildKnownSupplyIndex` nato izbire razglasi za "kanonsko avtoriteto":
*"Uporabnikove izbire PREPIŠEJO kontekst"*.

**Živi dokazi (pred popravilom, 19. 9. 2026 na dev strežniku):**

| Vektor | Klient poslal | Kanonska resnica | Finalni načrt | Budget status |
|---|---|---|---|---|
| KT cena | `kiwitaxi:411`, €1 per_transfer | dataset: **€77** fromPrice | **€1** | lažni "within" |
| OSM cena | `osm:node-3591726079`, €5 total | info_only vir **nikoli nima cene** | **€5** | "within" (€5 štel kot kanon) |
| Nepriključen vir | `viator:98765`, €79 per_person | provider **ni priključen** (0 strežnih produktov) | **€158** (79×2!) | lažni "uncertain" s klientovo ceno kot kanoniko |
| Refine currentStops | načrt s KT €1 | dataset: €77 | **€1** (avtoriteta drugega reda = klientov payload) | "within" |

**Fix (nova plast `src/lib/supply/selection-verify.ts`, strežniška, 0
novih remote klicev)**:
- `verifySelectedProducts(clean, serverSupply?)` — klicana na generaciji
  (po `fetchAiSupplyContext`) in refinu:
  - **kiwitaxi**: dataset = popoln inventar → kanonska cena
    (minPriceEur, per_transfer, fromPrice), pin, naslov `from → to`,
    tip `transfer`; odstopanje → popravek; **id ni v datasetu → izbira
    ZAVRŽENA** (fail-closed); dataset manjka → cena/razpoložljivost
    odstranjeni (unknown — produkt ostane).
  - **osm**: cena/razpoložljivost VEDNO odstranjeni (info_only vir jih
    nikoli nima — fabrikacija nemogoča).
  - **ostali (viator/gyg/…)**: če so v `serverSupply` (priključeni) →
    strežna vrednost zmaga; sicer → cena/razpoložljivost odstranjeni
    (unknown is unknown).
- `verifyCurrentStopsAuthority(stops)` — refine: KT refi iz dataseta
  (cena/naslov/geo), fabrikantrt KT id → izvzet (Task 48 plast ga nato
  zavrže), OSM €0 pošteno / ostalo NaN, viator/gyg VEDNO NaN
  (Number.isFinite → unknown v budget sloju).
- AI prompt (`selectedProductsBlock`) se gradi nad **verificirano**
  izbiro; `buildKnownSupplyIndex`, `validateItinerarySupply` (AI + fallback
  + refine + quick-action pot) prejemajo isto verificirano izbiro.

**Živi dokazi PO popravilu (isti 4 vektorji):**

| Vektor | Rezultat |
|---|---|
| KT €1 | **€77** + budget honest `uncertain` s `fromPriceCount:1` (ne lažni "within") |
| OSM €5 | **€0 + unknownCostStops:1** |
| viator €79 | cena ODSTRANJENA iz prompta/avtoritete (obstoj izbire ostane — uporabnikova želja) |
| Refine KT €1 | **€77** (izbira popravljen + currentStops overjen) |

 dodatno: `type:"accommodation"` (bypass, ker `insertProductStop`
preskoči nastanitve) → ponastavljen na `transfer`; klientova
razpoložljivost na KT/OSM → odstranjena (vira nima).

### P2 — TEST HIGIENA (§2.1) — POPRAVLJENO (trivialen, varen fix)

`clearProviderRateLimits()` v gyg-hardening beforeEach. Glej zgoraj.

### P2/P3 — DOKUMENTIRANO, NI POPRAVLJENO (§15 NO SCOPE CREEP)

| # | Najdba | Prioriteta | Razlog |
|---|---|---|---|
| 1 | `buildSelectedProductsContext` vstavlja naslove izbir NEovite v `<podatek>` (prompt injection površina enaka uporabnikovemu prostemu vnosu; sistemsko pravilo AI opozori, da je vsebina podatek) | P3 | sanitize čisti kontrolne znake; wrap bi bil konsistentnejši, a brez dokazanega izkoriščanja |
| 2 | OSRM noge pokrivajo samo T1 id-je; supply noge = haversine × 1,3 (razkrito v `geoValidation.method`) | P3 | znana omejitev Taska 48 §5.1 — ni regressiona |
| 3 | FIXED vstavitev v pozni večernji slot lahko da `schedule_overlap` ERROR | P3 | odkrito, ne skrito (fail-visible) |
| 4 | Refine pot ne pridobiva strežnega supply konteksta (viator/gyg izbire na refinu ostanejo brez cene) | P3 | 0 dodatnih remote klicev na refinu (§19 načelo); generacija s strežnim kontekstom ceno vrne |

---

## 3. SEKCIJSKI AUDIT — GREEN/YELLOW/RED + dokaz (§17)

| Sekcija | Status | Dokaz |
|---|---|---|
| **Repository** | GREEN | HEAD=origin, čisto, 832/832 (prvič 0 fail) |
| **Supply integrity** | GREEN (po fixu) | 4 živa tamper vektorja → kanon/unknown/reject; 25 novih unit testov |
| **AI integrity** | GREEN | Task 47 revalidacija + Task 48 invarianta + Task 49 verify: fake ref → drop; prompt nosi samo verificirane cene |
| **Itinerary realism** | GREEN | Task 48 §16 matrika (50+13 testov) nedotaknjena; 0 regresij |
| **Refinement** | GREEN (po fixu) | P0 Taska 48 + currentStops overitev Taska 49; živi dokaz: refine KT €1 → €77 |
| **Price** | GREEN (po fixu) | per_transfer ≠ ×osebe; per_person × groupSize; per_night → unknown; fromPrice → honest uncertain; KT €77 kanon |
| **Budget** | GREEN (po fixu) | within ZAHTEVA vse znane cene; tamper ne more več izsiliti "within" |
| **Geo** | GREEN | Task 48: null island, geo restore, supply noge sodelujejo; KT pin restore (verify sloj) |
| **Routing (OSRM)** | YELLOW (P3 #2) | T1 noge OSRM; supply hevristika razkrito `~`; degradacija fail-open; NI routing luknje — omejitev dokumentirana |
| **Security** | GREEN | /go open redirect nemogoč (allowlist + kodirani napadi → 400, Task 44–46 testi); prompt injection: sistemsko pravilo + kontrolni znaki; rate limit 10/10min generate + 20/10min refine; IDOR: shareId editToken (branje javno, urejanje prek tokena — audit brez najdbe); SSRF: /go gostitelji fiksni; oversized: kapice povsod |
| **i18n** | GREEN | BudgetPanel SL+EN (Task 48); verify sloj ne dodaja UI besedila (console.warn interno EN — sprejemljivo, ni user-facing) |
| **Mobile** | GREEN | 390 px + 375 px: 0 horizontalnega overflow; footer `min-h-screen flex flex-col` + `mt-auto`; 0 page errors |
| **Observability** | GREEN | `itinerary_validated` dogodki (Task 48 §18) + `[itinerary] TASK 49 supply verify` vrstica (števci, brez PII); request correlation izven obsega (P3) |
| **Providerji** | GREEN | OSM LIVE; KiwiTaxi LIVE (dataset, 48 produktov na Bled bbox); Viator CONTRACT VERIFIED / NOT CONFIGURED (0 produktov — ni fake inventarja); GYG CONTRACT VERIFIED / NOT CONFIGURED (0 produktov) |

### User journey (§3) — tok HOME → prompt → AI → map → supply → ProductModal → Add to plan → FIXED → planner → validacija → map/OSRM → refinement → re-validacija → final

- Source of truth: strežnik (AI izhod → sanitize → revalidate → invarianta
  → verify; vsak sloj fail-closed). **Najdena nezadoslednost** (ista
  vsebina obravnavana drugače na dveh poteh) je bila ravno P0 zgoraj —
  zaprta.
- Loading/empty/error stanja: planner ima spinner + error toast; supply
  search ima degraded[] transparency; verify sloj nikoli ne vrže.
- Stale selection: selection-persist (sessionStorage) + verify sloj
  (stara/ročno spremenjena izbira → kanon ali unknown).
- Duplicate state: sanitize dedupe (živi dokaz A: 2× isti KT FIXED → 1).

---

## 4. TESTI (§14)

| Sklop | Datoteka | Št. |
|---|---|---|
| NOVO — supply integrity (verify sloj: KT kanon/drift/odpad, OSM strip, viator unknown, currentStops, kombinacija z Task 48) | `src/lib/__tests__/task49-selection-verify.test.ts` | **25** |
| POPRAVLJENO — test higiena | `getyourguide-hardening.test.ts` (clearProviderRateLimits) | (2 fail → 0) |

**Celoletno stanje**: 832 testov / 832 pass / 0 fail (prvič popolnoma
zelen suite). Lint: 0 napak. TSC: 0 projektnih napak.

Testi berjo kanonike **dinamično iz produkcijskega baseline-a**
(route 411 = Bled → Ljubljana Airport €77) — brez fixture dvojnikov;
`test.skipIf(!hasKt)` za okolja brez data/.

---

## 5. SPREMEMBE (samo dokazane — §19)

| Datoteka | Sprememba |
|---|---|
| `src/lib/supply/selection-verify.ts` | NOVA: verifySelectedProducts + verifyCurrentStopsAuthority + hasVerifyChanges |
| `src/app/api/itinerary/route.ts` | verify sloj po fetchAiSupplyContext; selectedProductsBlock/knownSupply/invariant (AI+fallback) nad verificirano izbiro; currentStops overitev |
| `src/app/api/itinerary/refine/route.ts` | isti verify sloj (izbira + currentStops) na AI in quick-action poti |
| `src/lib/__tests__/task49-selection-verify.test.ts` | NOVA: 25 testov |
| `src/lib/__tests__/getyourguide-hardening.test.ts` | clearProviderRateLimits (test higiena) |
| `package.json` | 1.54.0 |

## 6. GATE (§18)

- Novih P0: 0 odprtnih (1 najden → zaprt istočasno) ✓
- Novih P1: 0 ✓
- Supply/AI integrity bypass: klientov tamper ne doseže finalnega načrta (živo dokazano na 4+2 vektorjih) ✓
- Refinement server-validated: DA (+ currentStops overitev) ✓
- FIXED immutable: DA (type bypass zaprt) ✓
- Canonical price source of truth: KT dataset / strežni supply ✓
- Fake provider/product/price v finalnem itinererju: NE more (reject/strip/override) ✓
- SL/EN journey: živo verificirano ✓
- Mobile 375/390: 0 blockerjev ✓
- test/lint/tsc: 832/832, 0, 0 ✓

**TASK 49 GATE: GREEN.**
