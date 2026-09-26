# ISSUE #7 — PRODUCTION GOLDEN-PATH RECONCILIATION (v1.115.1, 2026-09-26)

> **Namen:** dokazati, da je tisto, kar je v `main`, tisto, kar teče v produkciji —
> `GitHub HEAD → CI → Render → Vercel → real browser → API → DB → offline → PDF/ICS/share`.
> Read-only audit prvi; koda spremenjena SAMO za dokazane vrzeli (G11-A, G11-B, G-1 vrata, G-4 oznake).

- **Audit izvedel:** agent (main), 2026-09-26 12:30–13:40 UTC
- **Baseline ob začetku:** `4fcc380` / v1.115.0 / working tree clean / 0 nepushanih commitov
- **Končno stanje:** `v1.115.1` (2 P3 popravka + verzijska vrata + regresijski testi)

---

## 1. VERSION TRUTH MATRIX

| Plast | Pričakovano | Dejansko | Status |
|---|---|---|---|
| GitHub main HEAD | — | `4fcc380` (pushano, 0 lokalnih razlik) | ✅ |
| package.json | 1.115.0 | 1.115.0 | ✅ |
| README „Stanje" | v1.115.0 | v1.115.0 | ✅ |
| CHANGELOG vrh | 1.115.0 | 1.115.0 | ✅ |
| CI (run 36239495555) | HEAD = 4fcc380 | 4fcc380, `success` | ✅ |
| Lokalni testi | 3663 | **3663 pass / 0 fail** (60098 expect, 143 datotek, 19.9 s) | ✅ |
| tsc --noEmit | 0 napak | 0 | ✅ |
| eslint | 0 napak | 0 | ✅ |
| **Vercel produkcija** | 1.115.0 | **1.115.0** (health ×3; smoke 18/18; sitemap **1224** URL) | ✅ |
| **Render produkcija** | 1.115.0 | **1.102.0** (health ×3; smoke 17/17 a STARA koda; sitemap **1220** URL) | ❌ **G-1 (P1)** |

**Trojni dokaz Render zaostanka** (isti test, obe produkciji, 2026-09-26 12:39 UTC):

| Dokaz | Vercel (1.115.0) | Render (1.102.0) |
|---|---|---|
| `/api/health` verzija | 1.115.0 | 1.102.0 |
| sitemap.xml števec | 1224 URL | 1220 URL (razlika = 4 = F3-E EN whitelista /trznica+/dozivetja+/lokali+/dogodki) |
| `/en/trznica`, `/en/dogodki`, `/en/moja-potovanja` | 200 | **308** (preusmeritev nazaj na SL — obnašanje pred 1.115.0) |

Zadnji uspešni Render deploy torej vsebuje kodo commita `5eb96e5` (1.102.0, push 2026-09-25 11:28).
Vsi pushi od 1.103.0 naprej (13 verzij, 24 h) na Render niso bili postavljeni.

---

## 2. GIT → CI RECONCILIATION (run 36239495555, HEAD 4fcc380)

| Job | Korak | Rezultat |
|---|---|---|
| Lint & Type Check | Checkout (fetch-depth 0) / Setup Bun / Install / Prisma generate / 🔍 Lint / 🔧 Type check / 🧪 Unit tests | vsi `success` |
| Build | Initialize containers (postgres:16-alpine) / 📜 Migration drift check (migrations ⇄ schema) / 🗄️ Prisma client & test DB / 🔨 Build / 🚀 Functional smoke + API e2e | vsi `success` |

- HEAD SHA ≡ CI tested SHA ✅ (4fcc380 = run head_sha)
- Browser offline E2E workflow obstaja (`browser-e2e.yml`, workflow_dispatch) in NI every-push gate — usklajeno z docs/E2E-GATES.md ✅
- Prejšnja rdeča CI runa (0c3e91a, c839f71) sta bili pdf-lib CI flaky (dokumentirano v 1.111.1) — od ac75070 naprej vsi zeleni.

---

## 3. GOLDEN PATH MATRIX G1–G13

Statusi: **VERIFIED** (neposreden dokaz) · **PARTIAL** · **NOT VERIFIED** · **FAIL**.

| # | Pot | Kje dokazano | Status | Dokaz |
|---|---|---|---|---|
| G1 | Create trip (deterministično, 0 AI) | standalone build (T3) + CI (T1) + **obe produkciji** (stateless POST) | **VERIFIED** | lokalno: `200 — 2 dni, 2 postanka, source: deterministic`; Vercel: `days:2 stops:2 source:deterministic`; Render: isto; CI run 36239495555 korak 🚀 |
| G2 | Save + share (shareId + tajni editToken) | standalone build (T3) + CI (T1) | **VERIFIED** | `200 — shareId 1f34dfddba (+ tajni editToken)`; javni GET vrne isto vsebino (2 dni ≡ načrt); editToken NI v javnem odgovoru |
| G3 | Planner editing (revizija + CAS) | API (T3+T1) + unit suite | **VERIFIED** | PATCH z editToken → `contentVersion: 1`; zastarela baseVersion → `409` (brez tihega prepisa); reorder/premik dni: 76 testov zelenih (issue5-t5d + issue6-d6b) |
| G4 | Reservation parser | deterministični lib + CI + API | **VERIFIED** | 11 formatov (Booking.com/Airbnb/Agoda/Expedia/GetYourGuide/Viator/Tripadvisor/KiwiTaxi/DiscoverCars/PNR/SŽ) → `#408.921.371.224` ipd.; smeti → iskrene null + `422` z nasvetom; CI (brez AI ključev): `method: deterministic, via: fallback`; reprodukcija: `scripts/verify/issue7-golden-path-probes.ts` |
| G5 | PDF SL/EN | standalone build (T3) + CI (T1) | **VERIFIED** | `%PDF` glava + `application/pdf` + `attachment`; rezervacije/noge v generatorju (issue6-d6b-pdf v suiti 3663) |
| G6 | ICS | unit suite | **VERIFIED** | `buildItineraryICS` (issue5-t5d-planner-reorder) — determinističen, del suitea 3663 |
| G7 | Offline (PRAVI browser) | standalone build, omrežna emulacija | **VERIFIED** | `browser-offline-e2e.sh`: **7/7** — SW kontrola, offline reload (naslov+URL ostaneta), načrt iz predpomnilnika (Dan 1), povratek online, API integriteta (views:5 dni:2); NI mock |
| G8 | AI failure / no-AI mode | CI (0 AI ključev) + explicit engine | **VERIFIED** | CI quality+build tečeta BREZ AI secretov (edina secreta: GEMINI_API_KEY, OPENROUTER_API_KEY — rabita samo ai-smoke); `engine:"deterministic"` → source: deterministic (lokalno + obe produkciji); parse fallback v CI: `via: fallback` |
| G9 | Destination provenance | lib + git-truth testi (CI fetch-depth 0) | **VERIFIED** | register: **38** destinacij (SI 22 · HR 8 · ME 4 · AL 4), **0** duplikatov; as-of/git-trnica testi v CI z polno zgodovino |
| G10 | Marketplace/providers | testi + obe produkciji | **VERIFIED** | `/api/listings` živ na obeh (200, listings[]); production-matrix + supply-contract: **81 testov zelenih**; handoff ≠ booking (kanon §23/issue #4 VAL — PINIRAN s testi, ne s trunko) |
| G11 | Security | API probi (T3) + nove regresije | **VERIFIED** (+2 popravka) | PATCH brez/napačnega žetona → 403; neznan shareId → 404; path-manipulacija → 404; javni GET NE izpostavi editToken; input limit 3 MB → 413; rate limit → 429 po 6; ~~save pokvarjen JSON → 500~~ → **400** (G11-A fix); ~~GET/PDF shareId validacija neenotna~~ → **enoten SHARE_ID_RE kanon** (G11-B fix); 8 novih regresijskih testov |
| G12 | DB/schema | CI + health startup koraki | **VERIFIED** | migration drift check (migrations ⇄ schema) `success`; committed schema: provider `postgresql`, 42 modelov, md5 `bbced394…`; obe produkciji: vsi `schema:*` startup koraki `ok` (aditivne migracije; pravi drift → 503 degraded); lokalni dev flip sqlite → skip-worktree (kanon ostaja committed postgres) |
| G13 | Mobilni UX (390 px, pravi browser) | standalone build | **VERIFIED** | tab vrstica prisotna; klik zavihka Načrtuj → `/nacrtuj` + obrazec; `/pot/a24e8eec74` render (Dan 1 / Načrt po dnevih); Moja pot → `/moja-potovanja`; `/en` EN vsebina; back + reload delujeta; **0 preliva** (scrollWidth 390/390), **0 napak strani, 0 konzolnih napak**; 5 posnetkov `docs/evidence/issue7-g13/` |

**Razlaga nivojev dokaza** (docs/E2E-GATES.md, T1/T2/T3): zlata pot življenjskega cikla (G2/G3) teče
proti **localhostu** (ci-e2e.sh varnostna vrata: skripta PIŠE v DB — produkcija se preverja GET-only;
enako politika kot vsa prejšnja valuta). Produkcijska plast je dokazana z: GET-only smoke 18/18
(Vercel), stateless POST G1 na obeh produkcijah, health/SSR/sitemap/DB/404 na obeh, in CI T1,
ki poganja isto zlato pot proti ISTEMU standalone artifactu vsak push.

---

## 4. THREE-TIER E2E GATE — stanje

- **T1** (vsak push): CI `build` job — functional-smoke + ci-e2e ✅ (run 36239495555)
- **T2** (workflow_dispatch): browser-e2e.yml + lighthouse.yml ✅ obstajata, NISTA every-push (dokumentirano v E2E-GATES.md) ✅
- **T3** (lokalno): iste skripte — izvedeno v tem auditu (smoke 18/18, ci-e2e 10/10, offline 7/7, mobilni UX 7/7)

---

## 5. FINDINGS

### G-1 — [P1] Render produkcija 13 verzij za mainom (1.102.0 ≠ 1.115.0)

**Evidence:** health `version: "1.102.0"` (×3 vzorci); sitemap 1220 ≠ 1224 URL; `/en/trznica` → 308 (Render) vs 200 (Vercel); zadnji Render deploy ≙ `5eb96e5` (2026-09-25 11:28); README dokumentira „push na main → Render (primarna)" — dokumentirani model NE drži več.

**Observed:** Render streže staro kodo; monitor (prod-monitor) je ves čas ZELEN — preverja health/SSR/SEO, ne ISTOST kode z repom.

**Expected:** produkcija ≡ main (README deployment model).

**Impact:** uporabniki primarne površine ne vidijo 13 verzij izboljšav (1.103–1.115: Issue #8 Discovery UX 2.0 v celoti, Tier 1 #3–#5, payout ledger …); tujec na /en/trznica pristane na SL strani.

**Root cause:** iz repa NEDOHQljivo (brez RENDER_API_KEY ne moremo brati build logov niti sprožiti deployja). Možnosti: autoDeploy izklopljen od ~1.103.0, ali Docker build odpoveduje od tedaj (CI Build pot z `next build` je zelena — Docker-specifična pot bi bila ločena past; v sandboxu ni Dockerja za reprodukcijo).

**Minimal fix (izveden):** VERZIJSKA VRATA — `functional-smoke.sh --expect-version` + `prod-monitor.yml` obe produkciji prejemata verzijo iz package.json. Dokazano živo: Vercel ✅ `verzija deploja ≡ repo (1.115.0)`; Render ❌ `DRIFT VERZIJE: produkcija v1.102.0 ≠ repo v1.115.0` → 3-urni monitor zdaj pošlje alarm (e-pošta lastniku).

**Lastnikova akcija (iz repa NEIZVEDLJIVA):** Render dashboard → (a) prebrati zadnje build loke (če failajo od 1.103.0 → vzrok Docker builda; če sploh ni buildov → autoDeploy izklopljen), (b) sprožiti „Manual deploy" main, (c) po ~4 min potrditi `health.version = 1.115.1`. Sledilnik: GitHub issue „Render deploy reconciliation" (ustvarjen ob zaključku #7).

**Regression test:** `issue7-g11-route-hardening.test.ts` ⑦+⑧ (vrata skripte + monitorja, source-contract).

### G-2 — [P2] Verzijski drift je bil NEVIDEN monitorju (odprto z G-1 fix)

**Evidence:** prod-monitor je 24 h (2026-09-25 11:28 → 2026-09-26) gledal 13-verzij starem Render tiho zeleno; functional-smoke.sh je verzijo le IZPISAL („verzija: 1.102.0"), nikoli preveril.

**Fix (izveden):** enak kot G-1 (vrata + prenos verzije v monitor). Po novem je drift RDEČ alarm z nedvoumnim sporočilom.

### G-3 — [P3] `POST /api/itinerary/save` pokvarjen JSON → 500 (ne 400)

**Evidence:** `printf '{????' | POST …/itinerary/save` → `500 {"error":"Napaka pri shranjevanju itinererja"}`; parse endpoint istega vnosa → 400.

**Root cause:** `await request.json()` izjema je padla v splošni catch → 500.

**Minimal fix (izveden):** ločen try/catch okoli json() → `400 "Neveljaven JSON v zahtevi"` (isti vzorec kot bookings/parse). Brez DB dostopa; telo tudi prej generično (0 popuškanja).

**Regression test:** issue7-g11-route-hardening.test.ts ① (+② pini obstoječo 400 semantiko).

### G-4 — [P3] Neenotna shareId validacija med shared rutami + monitor job oznake

**Evidence (a):** isti vhod `zzz-ne-obstaja-12345`: GET shared → 404 (samo dolžinska preverba), GET pdf → 400 (polni SHARE_ID_RE). **Evidence (b):** prod-monitor.yml joba sta bila označena „Vercel (PRIMARNA)"/„Render (SEKUNDARNA)" — nasprotje README/DEPLOYMENT (Render primarna) in lastnemu header komentarju workflowa.

**Fix (izveden):** (a) GET shared zdaj uporablja SHARE_ID_RE (veljavna-oblika-neznana ostane 404 — obstoj NE razkrije); (b) job oznaki usklajeni s README kanonom.

**Regression test:** issue7-g11-route-hardening.test.ts ③–⑥ + ⑧.

---

## 6. VAROVANJA, KI SO OBLAŽILA (niso postala findings)

- editToken NI izpostavljen v javnem GET (preverjeno direktno).
- Zasebna poti → 404 kanon (oracle zaščita) — vidno v PDF/PATCH kodnih poteh.
- Rate limiti: parse 429 po 6 zaporednih; save 30/h; PDF 30/h; shared 120/h.
- Input limit: 3 MB payload → 413.
- Neveljaven JSON na parse → 400 (referenčni vzorec).
- Startup migracije: obe produkciji `ok` (vsi schema koraki) — fail-open past iz 1.27.0 ima pokritost s prod-monitorjem.

---

## 7. TOČNOST NADALJEVANJA (samo za dokazane probleme)

1. **[P1 — lastnikova akcija]** Render deploy main + pregled build logov (glej G-1). Sledilnik issue odprt.
2. **[opcijsko, po G-1]** Če Render buildi dejansko failajo od 1.103.0 → Docker build debug (iz repa nemogoče brez logov; CI `next build` pot je zelena, Docker-specifična plast bi bila ločena naloga).

Nič drugega: 0 P0, 0 nepričakovanih P1 (razen G-1), 1 P2 (zaprt z istim fixom), 3 P3 (vsak zaprt + regresijsko piniran).

---

## 8. DEFINITION OF DONE — stanje

- [x] GitHub HEAD identificiran (4fcc380 → 1.115.1 po popravkih)
- [x] CI HEAD match potrjen (run 36239495555, jobi/koraki naštet)
- [x] test count preverjen (3663 → 3671 z novimi regresijami)
- [x] lint/tsc/build potrjen (0/0/success)
- [x] Render SHA/version preverjen (❌ 1.102.0 — G-1, dokazano trojno)
- [x] Vercel Production SHA/version preverjen (✅ 1.115.0, 1224 URL sitemap)
- [x] Vercel Preview — N/A v tem auditu (edina odprta deploymenta sta produkciji; preview ustvarja CI na PR-jih — trenutno 0 odprtih PR)
- [x] schema/database consistency preverjena (migration drift CI `success`; startup koraki obeh produkcij `ok`)
- [x] G1–G13 preverjeni (matrika zgoraj — vsi VERIFIED)
- [x] production matrix ustvarjena (§1 + §3)
- [x] vsi P0/P1 identificirani (1× P1 = G-1)
- [x] vsak P0/P1 ima minimalen follow-up (G-1: vrata izvedena + lastnikova akcija dokumentirana + sledilnik issue)
- [x] dokumentacija odraža stanje (CHANGELOG 1.115.1, README Stanje, DEPLOYMENT.md dodatek)
