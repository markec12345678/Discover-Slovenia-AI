# TRAVEL GUARDIAN — STATUS (Issue #22)

> Stanje po šabloni CURRENT STATE → IMPLEMENTATION → TEST → PRODUCTION
> EVIDENCE → FINAL STATUS (kot PRODUCTION-ACTIVATION-STATUS.md iz #20).

---

## CURRENT STATE (pred #22, HEAD 1.161.1)

`/na-poti` (Go Mode) je pokazal LOKACIJO in NASLEDNJI postanek (#21), a NI
poznal stanja dneva: ni rezerve do termina, ni opozoril ob konfliktih, ni
recoveryja ob motnjah, ni izkoriščanja prostih lukenj. `/moja-potovanja` ni
imel neposrednega člena nazaj na živi tok. 4.608 testov, lint 0, tsc 0.

## IMPLEMENTATION (1.162.0 → 1.162.3)

- **Jedro (čisto, deterministično):** `time-reserve.ts` (ETA kanon
  hevristika + rezerva fixed terminov + fail-closed + DataQuality),
  `conflict-detect.ts` (10 vrst konfliktov, FACTS→REASON→IMPACT→ACTIONS),
  `trip-health.ts` (ON_TRACK/NEEDS_ATTENTION/BLOCKED/UNKNOWN + sestavni
  koren `buildGuardian`), `recovery.ts` (5 sprožilcev, predlogi pod
  potrditvijo), `day-start.ts` (jutranji povzetek), `free-time.ts` (okno z
  varnostno rezervo 15 min + 10 %, varnostna vrata kandidatom: celotna
  zanka ≤ okno), `go-edit.ts` (dodajanje nearby v v2, stabilni ključi).
- **UX (dodajanje, ne predelava — strategija E iz #21):**
  `go-mode/guardian-banner|conflict|free-time|day-start.tsx` — banner ob
  glavi z uporabniškimi imeni (🟢/🟠/🔴/⚪ §30.E), konflikt kartica z
  akcijami prek obstoječih mehanizmov, kategorije §30.F, [ZAČNI DAN],
  [Nadaljuj na poti] na Moja potovanja (prijavljeni + gostje).
- **Dokumentacija:** `docs/TRAVEL-GUARDIAN.md` (arhitektura, ADR, offline
  matrika, data-quality legenda, zasebnostna revizija §19/§20, UX vhodna
  mapa §30.L).
- **Popravki med produkcjskimi dokazi:** 1.162.1/1.162.2 (nearby
  kandidati — abort/dedupe tekma; korensko: last-write-wins po ključu),
  1.162.3 (Nadaljuj na poti v gostovem pogledu).

## TEST

- **4.690 testov, 4.689 zelenih** (+81 za #22: 32 core + 17 recovery +
  15 free-time + 17 UX source contract); edini fail = znana sandbox DB
  odvisnost (issue7-g11 ④, enaka kot bazna linija).
- **lint 0, tsc 0.** Zero feature loss: vsi obstoječi testi (#21, task64,
  task65, task102 …) nedotaknjeni in zeleni.
- Invariante zaklenjene s testi: Guardian ne piše ConfirmationStatus
  (frozen-rows), determinizem (isti vhodi → izhod), okno nikoli brez
  varnostne rezerve, nearby ne more povzročiti zamude (zanka ≤ okno),
  dodajanje samo v2, ON_TRACK samo z dokazom.

## PRODUCTION EVIDENCE (Render 1.162.3, mobilni 390×844)

16 dokazov v `docs/evidence/issue22/` (README zvrašča vsakega): banner ⚪/🟢/🟠
z dejanskimi številkami (rezerva 182/137 min, zamuda 39 min), konflikt
kartica + RECOVERY MODE (Nadaljuj/Preskoči/Preuredi + »Odločiš ti«),
preskok → samodejna progresija, PROST ČAS (147/108 min + varnostna rezerva
izrecno), 4 kandidati iz živih FSQ pinov (166 v bbox-u), v1 iskrena
opomba, v2 DODAJANJE USPEŠNO (✓ Don Andro + ključ nearby:… + viden v
dnevu), Nadaljuj na poti (gostov pogled → svež v2 zapis v /na-poti).
0 konzolnih napak. GPS simulacija (ista metoda kot #21) + dve dokazni
pripravi pošteno dokumentirani v evidence README.

## FINAL STATUS

| §26 dostavljivec | Stanje |
|---|---|
| Travel Guardian engine + trip health | ✅ IMPLEMENTED + VERIFIED + PRODUCTION VERIFIED |
| time reserve engine | ✅ IMPLEMENTED + VERIFIED + PRODUCTION VERIFIED |
| conflict detection | ✅ IMPLEMENTED + VERIFIED + PRODUCTION VERIFIED |
| Dynamic Trip Recovery + user-controlled UI | ✅ IMPLEMENTED + VERIFIED + PRODUCTION VERIFIED |
| Smart Free-Time + nearby + safety rules | ✅ IMPLEMENTED + VERIFIED + PRODUCTION VERIFIED |
| morning/day-start flow | ✅ IMPLEMENTED + VERIFIED (unit + contract; jutranja produkcijska slika = časovna meja) |
| data-quality classification | ✅ IMPLEMENTED + VERIFIED |
| offline capability matrix | ✅ (docs/TRAVEL-GUARDIAN.md §3) |
| privacy/security review | ✅ (docs/TRAVEL-GUARDIAN.md §5 — 0 analitike s pozicijo) |
| accessibility review | ✅ (aria-live/status/alert, ≥44 px tipke — E7 testi) |
| unit + integration + E2E/negativni | ✅ 81 testov (vključno negativnimi) |
| production evidence | ✅ 16 dokazov (Render) |
| architecture documentation | ✅ (docs/TRAVEL-GUARDIAN.md) |

**REMAINING (iskrene vrzeli, ne blokerji):**
- Jutranja produkcijska slika ZAČNI DAN (seja pred 11:00) — logika je
  ista čista projekcija, utrjena s testi.
- Opažena vrzel PRED #22: shranjevanje obnovljenega načrta (update-pot)
  ne pokliče `addSavedTrip` → vnos v dai:my-trips je treba predhodno
  sprožiti (prva shranitev ga zapiše). Zabeleženo; ne blokira #22.
- Vreme 502 na Renderu (izven obsega #22, kot v #21).
- Vercel deploy (kvota/GitHub App — priporočilo iz #21 ostaja).
