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

> Izpolni se po lokalni verifikaciji (agent-browser na :3000).

| Surface | State | Guidance | Action | Result | Dokaz |
|---|---|---|---|---|---|
| Domov | NEW_USER | first-run kartica (5 nameri) | klik namera | navigacija + intent_selected | (screenshot) |
| Domov | TRIP_BUILDING | trak: zbirka {count} + NAČRTUJ | klik | /nacrtuj | (screenshot) |
| Hub | TRIP_READY | chain 3/5 + obstoječi CTA | — | napredek viden | (screenshot) |
| Planner | po SHRANI | toast + Zaženi Na poti | klik | /na-poti | (screenshot) |
| Go Mode | COMPLETED | POT ZAKLJUČENA povzetek | Odpri shranjeno pot | /pot/{shareId} | (screenshot) |
| /moja-potovanja | TRIP_STARTED | NA POTI oznaka na aktivni kartici | Nadaljuj | /na-poti | (screenshot) |

## 3. Produkcijski dokazi (Render, po pushu)

> Izpolni se po deployju: https://i-feel-slovenia.onrender.com — različica
> se zapiše ob vsakem dokazu (vzorec iz #21/#22: docs/evidence/issue21/,
> docs/evidence/issue22/).

| # | Path | Surface | State | Rezultat | Dokaz (PNG/JSON) | Verzija |
|---|---|---|---|---|---|---|
| prod-1 | / | domov | NEW_USER | first-run kartica vidna, 0 konzolnih napak | docs/evidence/issue23/prod-01-home-first-run.png | (izpolni) |
| prod-2 | / | domov | TRIP_BUILDING | trak + NAČRTUJ + chain 2/5 | docs/evidence/issue23/prod-02-home-building.png | (izpolni) |
| prod-3 | /destinacija/… | dodaj | TRIP_BUILDING | toast z »Načrtuj potovanje« | docs/evidence/issue23/prod-03-add-toast.png | (izpolni) |
| prod-4 | /moja-potovanja | hub | TRIP_READY/… | chain indikator + NA POTI oznaka | docs/evidence/issue23/prod-04-hub.png | (izpolni) |
| prod-5 | /nacrtuj | planner | TRIP_READY | toast po shranitvi z Zaženi | docs/evidence/issue23/prod-05-planner-toast.png | (izpolni) |
| prod-6 | /na-poti | go | COMPLETED | POT ZAKLJUČENA povzetek + akcije | docs/evidence/issue23/prod-06-complete.png | (izpolni) |
| prod-7 | /en | domov (EN) | TRIP_BUILDING | trak v angleščini (6 jezikov dokaz) | docs/evidence/issue23/prod-07-en.png | (izpolni) |

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
