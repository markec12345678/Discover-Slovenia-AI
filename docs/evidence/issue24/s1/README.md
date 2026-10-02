# ISSUE #24 — SKLOP 1 (1.164.0): produkcijski dokazi

Implementacijska faza benchmarka UI/UX 2026-10-02 (P2-a + P2-b).
Produkcija: **Render 1.164.0** (primarna; Vercel enako — obeh health
`status:ok, version:1.164.0`). Testna javna pot: `/pot/da7060cf57`
(»QA #24 S1 — Bled & Vintgar«, ustvarjena prek javnega `POST /api/itinerary/save`).

## Matrika preverb (2. 10. 2026, agent-browser + curl)

| # | Preverba | Rezultat | Dokaz |
|---|---|---|---|
| 1 | Routing: `/en/pot/[id]` odprt (prej 308) | **200** | curl |
| 2 | Routing: `/it` `/de` `/fr` `/es` `/pot/[id]` še vedno 308 → SL | **308 → /pot/[id]** vsi | curl |
| 3 | EN stran — vse plošče angleške | Route on the map · Day-by-day itinerary · Events during your visit · Trip budget · What to pack · Like this itinerary? · Group polls · Group chat · Travel diary | 01, 05, 06 |
| 4 | EN stran — 0 SL uhodov v UI (klepet, všečki, dnevnik, prazna stanja) | **0 zadetkov** (Skupinski klepet / Všeč mi / Trenutno ni sporočil / Ni sporočil …) | curl rg |
| 5 | SL stran `/pot/[id]` — NESPREMENJENA | vsi SL nizi prisotni, 0 EN uhodov | 04 + curl rg |
| 6 | **Skupinski klepet @AI v EN** — sporočilo poslano, svetovalec odgovoril | ime **AI Advisor** (EN prikaz), značka »deterministic · from platform data«, **odgovor v angleščini** (»Bled (Slovenia): The pearl of the Alps …«) — locale passthrough klient→API→pogon | 01 |
| 7 | EN metadata | `2-day AI travel plan around Slovenia — Bled, Blejski grad. Total budget ~€64.` | curl |
| 8 | Jezikovni preklopnik na /pot ponuja English | menuitem Slovenščina ✓ + **English**; klik → `/en/pot/[id]` z EN vsebino | interaktivno |
| 9 | **GuidanceStrip /nacrtuj (SL)** | `TRIP_READY`: veriga ✓Odkrij ✓Načrtuj ③Rezerviraj ④Na poti ⑤Zaključi, »Korak 3 od 5«, sporočilo iz jedra | 02 |
| 10 | GuidanceStrip /en/nacrtuj (EN) | `TRIP_READY`: »Your plan is saved — book providers or start your trip.« | 03 |
| 11 | Skriti stanji na plannerju | NEW_USER (first-run kartica je domača pristojnost) in TRIP_BUILDING (samopovezava; add-toast pokriva) — **trak se ne izriše**; DISCOVERING (prazna zbirka) se pokaže iskreno | interaktivno |
| 12 | Responsive EN /pot | 390 px: scrollWidth=390 (0 preliva) · 1280 px: scrollWidth=1280 (0 preliva) | 05, 06 |
| 13 | Napake | **0 page errors, 0 konzolnih napak/opozoril** na vseh obiskanih zaslonih | agent-browser errors/console |

## Posnetki

- `01-en-pot-chat-ai-answer.png` — skupinski klepet @AI na `/en/pot`: uporabniško sporočilo + **AI Advisor odgovarja v angleščini** (ključna nova zmožnost)
- `02-nacrtuj-strip-tripready-sl.png` — vodeni trak na /nacrtuj (SL, TRIP_READY, veriga 5 korakov)
- `03-en-nacrtuj-strip-tripready.png` — EN trak na /en/nacrtuj (»Your plan is saved …«)
- `04-sl-pot-nespremenjeno.png` — SL stran `/pot/[id]` po 1.164.0: byte-identičen izhod (vsi nizi slovenski)
- `05-en-pot-mobile-390.png` — EN stran 390 px (0 prelivanja)
- `06-en-pot-desktop-1280.png` — EN stran 1280 px (0 prelivanja)

## Regresija (lokalno, commit 94bf1ba)

`bun test`: **4.784 pass** + 1 znana sandbox DB napaka (issue7-g11 ④,
CI-semantika — nespremenjena od prej) · `bun run lint`: **0** ·
`npx tsc --noEmit`: **0**. 28 novih pogodbenih testov
(`issue24-s1-pot-en-planner-strip.test.ts`).
