# TASK 56 — P2 DATA INTEGRITY HARDENING (GitHub-first → dokazani popravki)

> **Datum:** 2026-09-20 · **Verzija:** 1.58.3 · **Repo:** github.com/markec12345678/Discover-Slovenia-AI
> **Metoda:** §0 GitHub-first (dejanski HEAD = source of truth) → §2 read-only audit
> vsake P2 točke IZ KODE → §7 test-first (rdeče dokazano) → minimalni popravek →
> regresija + živi dokazi. **0 novih funkcij, 0 novih providerjev, 0 credentialov,
> 0 nove arhitekture/verification sistema.**

---

## A. GITHUB BASELINE (§0)

| Element | Vrednost |
|---|---|
| Dejanski GitHub HEAD (API 200) | `58d456d` = lokalni HEAD = TASK 55 commit (pričakovano — potrjeno) |
| `package.json` verzija | `1.58.2` → `1.58.3` (ta task) |
| Delovno drevo | čisto pred startom; po tasku: 5 spremenjenih + 1 nov testni file |
| Baseline | `bun test` 1196/1196 → po tasku **1214/1214** (+18 novih) |

---

## B. AUDIT — REPRODUKCIJA IZ DEJANSKE KODE (§2)

| Problem | Dejanska datoteka | Dejanska funkcija | Trenutna (pre-task) zaščita | Dejanska vrzel | Reproduciran |
|---|---|---|---|---|---|
| **P2-1** `/go/transfers` membership | `src/app/go/[provider]/route.ts:72-76` + `src/lib/affiliate.ts:416-428` | `PRODUCT_VALIDATORS.transfers` / `getKiwitaxiUrl` | format `^\d{1,10}$` + `>0`; https; host allowlist | veljavno-formatiran, a NE-obstoječ transferId (999999999) → **302 na neobstoječ produkt** | **DA** (živi dokaz prej: curl 302) |
| **P2-2** save re-verifikacija | `src/app/api/itinerary/save/route.ts:78` | `POST` handler | `sanitizeItinerary` (SAMO shape guard) | klientova €1 cena / fabrikantrt `providerProductId` / drug provider / duplikat → **shranjeno + prikazano na javni /pot/{shareId}** | **DA** (koda; živi dokaz cene prek POST) |
| **P2-3** refine `notes` | `src/app/api/itinerary/refine/route.ts:591/746/877` | tri `validateItinerarySupply` poti | cena/ID/geo/dedupe ZAŠČITENI; `notes` SE ne re-vezujejo na kanon | AI odmev/klientova opomba lahko obdrži halucinirano frazo o razpoložljivosti v PROSTEM BESEDILOM opombe | **DA, a DISPLAY-ONLY** → FOLLOW-UP (glej D) |

**Ključna ugotovitev ID prostorov (P2-1):** `product` param v `/go` je
**transferId** (razred vozila — `classes[].transferId`/`cheapestTransferId`),
NE routeId (`r.id` — to je prostor `providerProductId`/`ktRouteById`).
Membership preverja PRAVI prostor. Dataset je strežniško dostopen (9614
transfer id-jev v baseline) → preverba je poceni, lokalna, deterministična
(0 remote klicev).

---

## C. SPREMEMBE (samo dokazane vrzeli — minimalne)

### P2-1 — `/go/transfers` canonical membership

| | |
|---|---|
| **Datoteka** | `src/lib/supply/providers/kiwitaxi/dataset.ts` + `src/app/go/[provider]/route.ts` |
| **Funkcija** | nova `kiwitaxiTransferExists(transferId)` (dataset plast) + membership vrata v `GET` |
| **Problem** | format-validacija ≠ članstvo; fabricated ID → 302 na neobstoječ produkt |
| **Fix** | `true`=član → 302 (nespremenjeno); `false`=NI član (dataset prisoten) → **404** (fail-closed, isto načelo kot `selection-verify.rejectedFake`); `null`=dataset manjka (okolje) → 302 kot prej (NE kaznujemo — isti duh kot `ktRouteById` undefined) |
| **Zakaj minimalno** | 1 nov helper v obstoječi dataset plasti + 8 vrstic v obstoječi validacijski veji; affiliate logika (`buildPartnerUrl`/pap/allowlist) NESPREMENJENA; 0 remote klicev; veljaven tok (ID iz našega `bookingUrl` = vedno član) točno 302 kot prej |

### P2-2 — save-meja kanonska revalidacija

| | |
|---|---|
| **Datoteka** | `src/lib/supply/itinerary-validation.ts` + `src/app/api/itinerary/save/route.ts` |
| **Funkcija** | nova `revalidateSavedItinerarySupply(it, lang)` + žičenje v `POST` |
| **Problem** | save je zaupal SAMO shape guard → klientova cena/ID/provider/duplikat shranjeni na javni strani |
| **Fix** | **PONOVNA UPORABA obstoječe verige** (točno sestava refine echo poti, TASK 50): `verifyCurrentStopsAuthority` (KT dataset = kanon cena/naslov/geo; fabrikantrt KT ref → avtoriteta ga izvrže → `validateItinerarySupply` postanek ODSTRANI) → `validateItinerarySupply(selection=[])` (dedupe točno 1×, geo/smer obnova, cena kanon ali NaN + iskrena opomba SL/EN) → `recomputeTotalBudget` (skupna iz DEJANSKIH postankov — isti princip kot P0.2 recenzija). Prenos že-popravljenih KT naslovov iz avtoritete v izhod (avtoriteta jih izračuna v `titlesRestored`, izhod pa jih prej ni prevzel). |
| **Zakaj minimalno** | NOV verification sistem NI ustvarjen — 1 sestavna funkcija nad 3 OBSTOJEČIMI plastmi + 12 vrstic žičenja v ruti; `selection-verify`/`sanitize`/FIXED/cena/geo/ID pravila NESPREMENJENA; legitimen strežniško-generiran načrt gre skozi ** nespremenjen** (test ⑨: 0 popravkov) |

### P2-3 — refine `notes` → **P2 DOCUMENTATION / FOLLOW-UP** (brez kode)

Preverjeno iz kode (pravilo taska §5):
- `notes` so PROSTO BESEDILO (`LocationVisit.notes: string`) — **niso source of
  truth** za ceno (`estimated_cost` re-vezan na kanon v `validateItinerarySupply`
  1e), ID (`destination_id` dedupe/fake vrata 1a/1b), geo (1c) ali strukturo
  razpoložljivosti (`LocationVisit` sploh NIMA polja availability);
- **ne morejo povzročiti napačne rezervacije** (booking izključno prek `/go`
  product ID → od TASK 56 P2-1 celo membership-overjan) **ne napačne cene**
  (kanon €77 vedno zmaga);
- edini ostanek: prikaz halucinirane FRAZE v opombi pri prehodnem prikazu po
  refine — isti prikazni razred kot vsako drugo klientovo besedilo (naslovi T1
  postankov, `reason`, `recommendations`);
- **perzistenčna meja je zdaj pokrita**: save pot (P2-2) za neverificirane
  cene zamenja opombo z iskrenim "Cena ni preverjena…" (veja `price_unverified`,
  TASK 50), KT postanki pa dobijo kanonske naslove;
- polna kanonizacija opomb na refine bi zahtevala known-supply indeks tam
  (arhitekturna sprememba) → ** zavrnjena kot nepotreben refactoring** po
  lastnem pravilu taska. FOLLOW-UP zapisan tu.

---

## D. TESTI (§7 — test-first; rdeče stanje dokazano pred popravkom)

```text
PRED:  1196/1196 (TASK 55 baseline) — nov file se ni naločil
       (SyntaxError: revalidateSavedItinerarySupply ne obstaja) = RDEČE dokazano
PO:    1214/1214 PASS (44 553 expectov, 42 datotek), lint 0, tsc 0 (src)
NOVI:  18 testov v src/lib/__tests__/task56-p2-hardening.test.ts
```

Novi testi (kanoniki DINAMIČNO iz baseline dataseta — brez fixture dvojnikov):

**P2-1 (route-level):** ① član → 302 (regresija neporezana) · ② **veljaven
format + NE-član → 404 + brez location** (prej 302 — P2-1 dokaz) · ③ malformiran
→ 400 (regresija) · ④ dataset manjka → 302 (okolje NE kaznuje) · ⑤ helper
true/false/null · ⑥ neznan provider → 404 (allowlist regresija).

**P2-2 (save veriga):** ① cena €1 + realen ref → **kanonska zmaga** +
total_budget preračunan · ①b podtaknjen naslov → kanonski · ①c podtaknjene
koordinate → kanonske · ② **veljaven format ref, NI v datasetu → ODSTRANJEN**
(fake_supply_ref) · ③ drug provider (viator:99999, €500) → obstoj ohranjen,
cena **NaN + "Cena ni preverjena"** (ISTA semantika kot refine echo/TASK 50) ·
④ OSM €5 → NaN / €0 → €0 · ⑤ duplikat → točno 1× · ⑥ total_budget iz
postankov · ⑦ dataset manjka → cena unknown, postanek ostane · ⑧ T1 postanki
nedotaknjeni · ⑨ **legitimen načrt → 0 popravkov (regresija)** · ⑩ EN opombe.

---

## E. VARNOST / INTEGRITETA (potrditve iz testov + živih dokazov)

```text
client price tampering:        BLOCKED   (test ①: €1 → kanon €77; živo: P2-2 veriga teče prej db)
provider ID tampering:        BLOCKED    (test ②: fabricated ref ODSTRANJEN)
fake product:                 BLOCKED    (KT: drop; viator: cena unknown — isto kot refine echo)
invalid /go ID:               BLOCKED    (živo: malformed 400, fabricated 999999999 404, član 1439 302 → živi checkout)
affiliate != inventory:       PRESERVED  (affiliate.ts/buildPartnerUrl nespremenjena)
FIXED exactly once:           PRESERVED  (test ⑤ dedupe; generacijska plast nedotaknjena)
unknown availability ≠ avail:  PRESERVED  (LocationVisit brez availability polja; price_unverified opombe)
origin / LJU tihi default:    PRESERVED  (0 dotikov supply adapterjev/origin logike)
delujoči providerji:          NESPREMENJENI (osm/sto/kiwitaxi adapter + affiliate 0 sprememb)
```

**Živi dokazi (dev strežnik, danes):**
- `/go/transfers?product=1439` → 302 → **živi kiwitaxi checkout z booking
  tokenom** (brskalnik — veljaven tok neporezan);
- `/go/transfers?product=999999999` → **404** (curl + brskalnik; prej 302);
- supply search: 48 KT produktov s kanonskimi cenami (nespremenjeno);
- save ruta: `[itinerary/save] supply revalidacija: ODSTRANJENIH 1 fabrikantrnih
  supply postankov: kiwitaxi:99999999` (živi zapis v dev.log — validacija teče
  PRED persistenco; nadaljnje shranjevanje je padlo SAMO na znani okoljski
  postgres clobber peskovnika — ENVIRONMENT failure, ne code failure);
- mobile 375/390 px: 0 px horizontalnega preliva na /, /zemljevid, /nacrtuj,
  /vir-podatkov; konzola: samo pre-existing (sandbox auth/db).

---

## F. ODLOČITEV

```text
GREEN — P2-1 in P2-2 ZAPRTI z dokazanimi minimalnimi popravki;
        P2-3 dokumentiran kot FOLLOW-UP (display-only, brez refactoringa);
        0 P0/0 P1 odkritih med taskom; 0 znanih integrity vrzeli.
```

---

## G. NASLEDNJI KORAK

```text
WAITING FOR REAL PROVIDER CREDENTIALS
```

0 poverilnic v okolju → aktivacija gated providerjev (Viator, GetYourGuide,
Tiqets, Booking, Skyscanner, Airalo, Travelpayouts — self-serve oz. po
odobritvi partnerja) ostaja iskreno NEIZVEDENA (brez simulacije). Ob prihodu
prave poverilnice: aktivacijski protokol dokazov v
`docs/TASK-54-LIVE-PROVIDER-ACTIVATION.md` razdelek J. Skyscanner zahteva
tudi produktno odločitev `originPlaceId` (PRODUCT GAP — brez tihih defaultov).
