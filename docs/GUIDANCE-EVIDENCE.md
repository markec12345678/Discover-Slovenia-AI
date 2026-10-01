# GUIDANCE EVIDENCE — dokazi vodene plasti (Issue #23, 1.163.0)

> Tabela po vzoru issue §39: | Surface | State | Guidance | Action | Result |
> Production Evidence |. Produkcijski dokazi se zbirajo po pushu na Render
> (agent-browser); struktura sledi vzorcu docs/evidence/issue21 + issue22.

## 1. Zlata pot (§38 G1–G10)

| # | Golden path | Stanje | Pričakovana pot |
|---|---|---|---|
| G1 | NEW USER | NEW_USER | Domov → first-run kartica → izbira namera → prva smiselna akcija |
| G2 | DISCOVER | DISCOVERING/NEW_USER | Destinacija/iskanje → Dodaj v mojo pot |
| G3 | MY TRIP | TRIP_BUILDING | Dodaj → hub (chain indikator) → naslednji korak |
| G4 | PLAN | TRIP_BUILDING→TRIP_READY | Hub → NAČRTUJ → generiraj → SHRANI |
| G5 | BOOK | TRIP_READY | Po shranitvi: REZERVIRAJ (booking paneli) — iskrena stanja |
| G6 | START | TRIP_READY | Toast po shranitvi → Zaženi Na poti |
| G7 | GO | TRIP_STARTED | /na-poti → GPS → NASLEDNJE |
| G8 | ARRIVAL | ARRIVED→COMPLETED | Prihod → Opravi → (zadnji postanek) → POT ZAKLJUČENA |
| G9 | RECOVERY | NEEDS_ATTENTION/BLOCKED | Konflikt → razlaga → uporabniku nadzorovana rešitev |
| G10 | RETURNING | katerokoli | 2. seja → welcome baner z nadaljevanjem (ne first-run) |

## 2. Lokalni dokazi (dev, 1.163.0)

> Lokalni dev zahteva produkcijsko bazo (Postgres) — verifikacija je bila
> izvedena DIREKTNO na produkciji (Render), kar je močnejši dokaz (§38).

| Surface | State | Guidance | Action | Result | Dokaz |
|---|---|---|---|---|---|
| Domov | NEW_USER | first-run kartica (5 nameri) | klik namera | navigacija + intent_selected | (screenshot) |
| Domov | TRIP_BUILDING | trak: zbirka {count} + NAČRTUJ | klik | /nacrtuj | (screenshot) |
| Hub | TRIP_READY | chain 3/5 + obstoječi CTA | — | napredek viden | (screenshot) |
| Planner | po SHRANI | toast + Zaženi Na poti | klik | /na-poti | (screenshot) |
| Go Mode | COMPLETED | POT ZAKLJUČENA povzetek | Odpri shranjeno pot | /pot/{shareId} | (screenshot) |
| /moja-potovanja | TRIP_STARTED | NA POTI oznaka na aktivni kartici | Nadaljuj | /na-poti | (screenshot) |

## 3. Produkcijski dokazi (Render 1.163.0 — ŽIVO, 2026-10-01)

> Polna tabela + dokazne priprave: `docs/evidence/issue23/README.md`
> (8 PNG dokazov, mobilni 390×844, 0 konzolnih napak, 0 page errorjev).

| Surface | State | Guidance | Action | Result | Production Evidence |
|---|---|---|---|---|---|
| / (prvi obisk) | NEW_USER | first-run kartica (5 nameri + „Ne vem") | klik namera | navigacija + intent_selected | prod-01-home-first-run.png |
| / (po dodajanju) | TRIP_BUILDING | trak Korak 2/5 + VODENA POT + [NAČRTUJ] | sledi glavnemu gumbu | /nacrtuj | prod-02-home-building-tour.png |
| destinacijski modal | dodaj | toast [Odpri pot][Načrtuj potovanje] | klik Načrtuj | naslednji korak | prod-03-add-toast.png (VLM-potrjen) |
| /moja-potovanja | TRIP_BUILDING | chain indikator (informacijsko) | — | Korak 2/5 viden | prod-04-hub-chain.png |
| / (2. seja) | TRIP_STARTED | banner „Tvoja pot je aktivna" [NADALJUJ] | klik | /na-poti | prod-05-returning-banner.png |
| /na-poti (konec) | COMPLETED | „POT ZAKLJUČENA 🎉 1 dan · 2 opravljenih" + akcije | Načrtuj novo | /nacrtuj | prod-06-go-complete.png |
| /en | TRIP_BUILDING | trak v angleščini (6-jezični dokaz) | — | Step 2 of 5 | prod-07-en-strip.png |
| / (po zaključku) | COMPLETED | trak Korak 5/5 „Pot je zaključena" | — | terminalno stanje | prod-08-home-completed.png |

## 4. Meje in znane omejitve (iskreno)

- **/na-poti ostaja SL/EN** (obstoječa whitelist meja iz #21/#22) — COMPLETED
  kartica sledi isti meji; trak na 6-jezičnih površinah (domov, hub) je
  polno preveden.
- **Živi kontekst** (NAVIGATING/ARRIVED/FREE_TIME/NEEDS_ATTENTION/BLOCKED/
  RECOVERY) obstaja samo v seji /na-poti — trak izven pade na iskreno
  TRIP_STARTED (namerno, §30).
- **BOOKING_PENDING** nastopi samo z dejanskim podatkom o odprtih
  rezervacijah (živi kontekst) — sicer TRIP_READY (§31).
- Skip-to-content link ostaja znana predhodna vrzel (docs/ACCESSIBILITY-
  REVIEW.md §2.1) — izven obsega #23 (vodena plast ne uvaja novih modalov,
  ki bi jo nujno zahtevala).
