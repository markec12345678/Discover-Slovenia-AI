# E2E Gates — Discover Slovenia AI

> **Namen:** iskrena razvrstitev end-to-end dokazov po nivojih. CI NIKOLI ne
> trdi, da je preverjanje steklo, če ni (pravilo Issue #6 faze 6: „No false
> green status if E2E did not actually run").
>
> Nivoji: **T1** API-dim vsak push · **T2** workflow_dispatch (browser
> offline E2E + Lighthouse/CWV vrata — pred release) · **T3** ročno/lokalno
> (iste skripte, reproducibilnost).

## T1 — API-dim (vsak push/PR, obvezna, ~10 s)

**Skripta:** `scripts/ops/ci-e2e.sh` · **Poganja:** CI `build` job, korak
„Functional smoke + API e2e" — ista instanca strežnika kot functional-smoke
(zavestno: `trap cleanup EXIT` v isti lupini ubije strežnik šele po OBEH
skriptah).

Dokazuje (8 korakov, brez brskalnika, brez AI ključev — CI jih nima):

| # | Preverjanje |
|---|---|
| 1 | `POST /api/itinerary {engine:"deterministic"}` → veljaven načrt (0 AI) |
| 2 | `POST /api/itinerary/save` → shareId + tajni editToken |
| 3 | `GET /api/itinerary/shared/{id}` → ista vsebina nazaj |
| 4 | `GET …/pdf` → %PDF + application/pdf + attachment |
| 5 | `PATCH` (editToken, baseVersion 0) → revizija |
| 6 | `PATCH` z zastarelo verzijo → 409 (iskrena sočasnost) |
| 7 | `POST /api/journey/bookings/parse {text}` → 200 + razbita polja |
| 8 | `POST parse {smeti}` → 422 z nasvetom (brez slepe ulice) |

Varnostna vrata: skripta ZAVRNE ne-lokalne cilje (piše v DB).
**Dokaz v logih CI (f264f3d+):** `✅ CI-E2E: jedrni življenjski cikel poti
deluje BREZ AI žetonov` + `method: deterministic, via: fallback`.

## T2 — Browser offline E2E (workflow_dispatch, 7 preverjanj)

**Skripta:** `scripts/ops/browser-offline-e2e.sh` · **Poganja:**
`.github/workflows/browser-e2e.yml` (ročni zagon — npr. pred release) —
ZAKAJ ne v vsakem pushu: chromium ~300 MB na vsak push je slab razmerje
strošek/vrednost; API-dim (T1) že pokriva jedrno logiko vsakic.

Dokazuje z brskalniško OMREŽNO EMULACIJO (`agent-browser set offline on`,
SW in caches čisto brskalniški — NI mock znotraj testa):

| # | Preverjanje |
|---|---|
| 0 | standalone strežnik vstal (dev SW z `?dev=1` NE predpomni — zato build!) |
| 1 | testna deljena pot ustvarjena |
| 2 | online nalaganje + `navigator.serviceWorker.controller` = KONTROLIRAN |
| 3 | offline ON + reload → naslov/URL ostaneta (SW prevzel navigacijo) |
| 4 | offline VSEBINA: načrt izrišen iz predpomnilnika (Dan 1/Načrt po dnevih) |
| 5 | offline OFF + reload → povratek |
| 6 | API integriteta po povratku (views/dni, brez poškodb) |

**Dokaz (lokalno, 1.105.0):** `7 ok / 0 neuspešnih — shranjen načrt deluje
brez omrežja (SW, ne mock)`.

## T2 — Lighthouse + CWV vrata (workflow_dispatch, 36 preverjanj)

**Skripta:** `scripts/ops/lighthouse-gates.sh` · **Poganja:**
`.github/workflows/lighthouse.yml` (ročni zagon — npr. pred release) —
ZAKAJ ne v vsakem pushu: chromium + build + ~5 min meritev; API-dim (T1)
že pokriva jedrno logiko vsakič, perf vrata so budnost pred release, ne
vsakodnevna draga rutina.

Dokazuje nad **PRODUKCIJSKIM standalone buildom** (dev bundli niso
minificirani → TBT ~13 s artefakt; vrata merijo isto pot kot Docker/Render)
z Lighthouse **mobile + simulate (Lantern)** throttling — determinističnejši
od devtools na šumnem CI hardwareju:

| Stran | Preverjanja |
|---|---|
| `/` | perf/a11y/bp/seo + LCP/CLS/TBT (7 pragov) |
| `/destinacije` | 7 pragov |
| `/destinacija/bled` | 7 pragov |
| `/na-poti` | 7 pragov |
| `/zemljevid` | 7 pragov |
| (+1) | strežnik pripravljen (health) |

**Pragi = REGRESIJSKA vrata** (ščitijo baseline, ne zahtevajo čudeža):
`perf ≥ 0.50 · a11y ≥ 0.90 · bp ≥ 0.90 · seo ≥ 0.90 · LCP ≤ 5000 ms ·
CLS ≤ 0.10 · TBT ≤ 2500 ms`

**Baseline (1.107.0, standalone, mobile simulate, 5 strani):**

| Stran | perf | a11y | bp | seo | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/` | 0.55 | 0.90 | 0.96 | 1.0 | 4.8 s | 0 | 1728 ms |
| `/destinacije` | 0.65 | 0.93 | 0.96 | 1.0 | 3.6 s | 0 | 1341 ms |
| `/destinacija/bled` | 0.82 | 0.94 | 0.96 | 1.0 | 3.9 s | 0 | 277 ms |
| `/na-poti` | 0.75 | 0.92 | 0.96 | 1.0 | 2.6 s | 0 | 983 ms |
| `/zemljevid` | 0.59–0.64 | 0.95 | 0.92 | 1.0 | 3.7–4.0 s | 0.003 | 1360–2147 ms |

**Dokaz (lokalno, 1.107.0):** `36 ok / 0 neuspešnih — perf/a11y/bp/seo +
CWV (LCP/CLS/TBT) znotraj pragov`.

## T3 — Ročno/lokalno (reproducibilnost)

Vse tri skripte tečejo identično lokalno (isti izhodni statusi). Priročnik:

```bash
# offline/PWA:      bun run build && bash scripts/ops/browser-offline-e2e.sh
# perf/CWV vrata:   bash scripts/ops/lighthouse-gates.sh   # builda sam, če ni
```

## Meje (iskrene)

- Offline zemljevid pokriva SAMO že videna območja (tiles cache-first —
  dokumentirano v sw.js).
- Sveži podatki (vreme/odpiralni časi/zaloge) so offline pošteno označeni
  stale/unknown — nikoli izmišljeni (FRESH/STALE resnica §17/§19).
- Push (trip-push-card) zahteva registriran push kanal (online).
- Lighthouse vrata so REGRESIJSKA, ne izboljševalna naloga: baseline perf
  0.55–0.82 mobile; Google „good“ meje (LCP 2.5 s, TBT 200 ms) so znani
  izboljševalni dolg (bundle razrez/dynamic import — Tier 2, benchmark
  Task 28).
- TBT šum med zagoni istega stroja je izmerjen do +57 % (1360→2147 ms,
  zemljevid) — zato prag 2500 ms in ne 2000: vrata, ki padajo naključno,
  niso vrata.
- Lighthouse „simulate“ je model (Lantern), ne instrumentalna meritev
  realnega uporabnika (RUM) — field podatkov (CrUX) za i-feel-slovenia
  še ni (domain je nov); ko bodo, se pragovi umaknejo RUM resnici.
