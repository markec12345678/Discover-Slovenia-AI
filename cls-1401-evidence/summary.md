# CLS 1.140.1 — dokazi (popravek zamikov na /pot poteh)

**Datum:** 28. 9. 2026 · **Verzija:** 1.140.1 · **Odkrito s:** prvim Lighthouse
dimom nad ŽIVO produkcijo (ne le CI standalone)

## Povzetek številk

| Stran | CLS pred (1.140.0, produkcija) | CLS po (1.140.1, lokalni dev) | Prag vrat |
|---|---|---|---|
| `/pot/embed/bb183cd77d` | **0.3805** | **0.0000** (412px) / 0.026 periodično (375px) | 0.10 |
| `/pot/bb183cd77d` | **0.3393** | (ista komponenta — enak popravek) | 0.10 |
| 5 kanonskih strani vrat | 0.0023–0.0051 (vedno zeleno) | nedotaknjene | 0.10 |

## Diagnostika (5 kanonskih strani — VSE NAD izhodišči 1.107.0)

| Stran | perf | LCP | TBT | izhodišče 1.107.0 (perf/LCP) |
|---|---|---|---|---|
| `/` | 0.61 | 4.0 s | 1300 ms | 0.55 / 4.8 s |
| `/destinacije` | 0.66 | 3.7 s | 1023 ms | 0.65 / 3.6 s |
| `/destinacija/bled` | 0.76 | 3.9 s | 469 ms | 0.82 / 3.9 s |
| `/na-poti` | 0.90 | 1.8 s | 391 ms | 0.75 / 2.6 s |
| `/zemljevid` | 0.74 | 3.1 s | 811 ms | 0.59–0.64 / 3.7–4.0 s |

→ 14 verzij dela (W1–W10 + KPI + D7) **ni povzročilo perf regresije** na
kanonskih straneh; odkrita vrzel je bila IZKLJUČNO na neizmerjenih /pot poteh.

## Vzrok (dokazano z viri — `layout-shift-sources.json`)

EN sam zamik na vsaki poti (~t=1 s po navigaciji): odsek „Načrt po dnevih“
skoči z y=323/388 na končni položaj, ker:

1. **GLAVNI:** pogoj `routeByDay.length > 0` je bral Zustand shrambo, ki je
   med SSR **prazna** (napolni se šele v `useEffect` po mount-u) → CELoten
   odsek zemljevida (naslov + 500/600 px + legenda) se izriše šele ob
   hidrataciji. Strežniški HTML dokumentirano NE vsebuje `map-shell`,
   `h-[500px]` niti „Nalagam“.
2. `dynamic(ssr:false)` ne izriše NIČ v strežniškem HTML-ju — niti loading
   placeholderja — prostor se ni rezerviral nikjer.

## Popravek (1.140.1)

- `deriveRoute(it)` — čista funkcija izvlečena iz `setItinerary`
  (`src/lib/store.ts`, en vir resnice); `SharedTrip` jo pokliče DIREKTNO na
  itinerer-ju propu (`useMemo`) → odsek se izriše v SSR; hidratacijska
  skladnost ohranjena (isti vhod = isto drevo).
- MapView ovit v SSR-div `h-[500px] sm:h-[600px]` (ujema se s placeholderjem
  IN MapView lastno višino — višine pred/po identične, čist popravek zamika).
- `<link rel="preconnect">` za a/b/c.tile.openstreetmap.org (LCP na obeh
  poteh je prva Leaflet ploščica; React 19 Float dvigne v `<head>`) —
  dokazano v SSR HTML; `preconnect()` iz react-dom v RSC namiga NI izstrelil.

## Metodološke lekcije (docs/E2E-GATES.md §T3)

- Hladen zagon Vercel funkcije obesi `_rsc` prednalaganja → sled se ne
  zaključi → Lantern ekstrapolira napihnjen LCP (12,0 s; ponovitev 3,7 s) —
  **veljavni so SAMO teki brez runWarnings**.
- LCP element na /pot poteh = OSM ploščica (resource load delay ~1.8 s).

## Status uvoda

1.140.1 je na GitHubu (`512ee07`); uvod ČAKA na dnevno kvoto Vercel računa
(100/100 — drugi projekti lastnika; reset 29. 9. 20:11 UTC, okno rolling).
Samodejni uvajalni nadzornik (`/home/z/vercel-auto-deploy-1401.sh`)
poskuša vsakih 15 min z idempotenco pred vsakim poskusom in samo-ustavitvijo.
Produkcijski „po“ dokaz bo dopolnjen po uvedbi.
