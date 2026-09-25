# E2E Gates — Discover Slovenia AI

> **Namen:** iskrena razvrstitev end-to-end dokazov po nivojih. CI NIKOLI ne
> trdi, da je preverjanje steklo, če ni (pravilo Issue #6 faze 6: „No false
> green status if E2E did not actually run").

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

## T3 — Ročno/lokalno (reproducibilnost)

Obe skripti tečeta identično lokalno (isti izhodni statusi). Priročnik za
offline: `bun run build && bash scripts/ops/browser-offline-e2e.sh`.

## Meje (iskrene)

- Offline zemljevid pokriva SAMO že videna območja (tiles cache-first —
  dokumentirano v sw.js).
- Sveži podatki (vreme/odpiralni časi/zaloge) so offline pošteno označeni
  stale/unknown — nikoli izmišljeni (FRESH/STALE resnica §17/§19).
- Push (trip-push-card) zahteva registriran push kanal (online).
