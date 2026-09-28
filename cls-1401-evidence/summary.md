# CLS 1.140.1 — dokazi (popravek zamikov na /pot poteh)

**Datum:** 28. 9. 2026 · **Verzija:** 1.140.1 · **Odkrito s:** prvim Lighthouse
dimom nad ŽIVO produkcijo (ne le CI standalone)

## Povzetek številk

| Stran | CLS pred (1.140.0, produkcija) | CLS po (1.140.1, lokalni dev) | CLS po (1.140.1, PRODUKCIJA) | Prag vrat |
|---|---|---|---|---|
| `/pot/embed/bb183cd77d` | **0.3805** | **0.0000** (412px) / 0.026 periodično (375px) | **0.0000** (412×823, 0 zamikov) | 0.10 |
| `/pot/bb183cd77d` | **0.3393** | (ista komponenta — enak popravek) | **0.0000** (412×823, 0 zamikov) | 0.10 |
| 5 kanonskih strani vrat | 0.0023–0.0051 (vedno zeleno) | nedotaknjene | (niso cilj popravka) | 0.10 |

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

## Status uvoda — ŽIV V PRODUKCIJI (28. 9. 2026, 20:27:53 UTC)

1.140.1 je uvedena v produkcijo (**dpl_8CAWQCx7** iz `4545690`): samodejni
uvajalni nadzornik je uspel v poskus 2, ko se je ROLLING okno dnevne kvote
Vercel računa sprostilo ~23 h pred napovedanim resetom (29. 9. 20:11 UTC);
nadzornik se je samodejno ustavil ob 20:42:53 po idempotenčni preverbi
(kvota ni bila zapravljena). Iskren podatek: odgovor API-ja pri uspešnem
poskusu ni vseboval `uid` na vrhu, zato ga je skripta razvrstila kot
„nenavaden odgovor“ — deployment pa je bil ustvarjen in READY (potrjeno z
`GET /v6/deployments`). Webhook za push `512ee07` je ostal tih
(isti vzorec kot a1f4095/5608f9e).

### Produkcijski „po“ dokazi (dopolnjeno po uvedbi)

- **Performance API layout-shift (412×823):** obe poti **CLS 0.0000**,
  0 zamikov, 0 napak strani, 0 konzolnih sporočil, brez preliva
  (scrollW=412=clientW) — posnetka `cls-after-prod-embed.png` /
  `cls-after-prod-full.png`.
- **Lighthouse mobile/simulate nad produkcijo (0 runWarnings):**
  embed perf 0.58 / CLS **0** / LCP 4.7 s; polna perf 0.80 / CLS **0** /
  LCP 2.7 s (`lighthouse-prod-1.140.1.json`).
- **SSR dokazi v strežniškem HTML-ju produkcije:** višinska rezervacija
  `h-[500px]` ✓, placeholder „Nalagam“ ✓, 3 preconnecti na
  a/b/c.tile.openstreetmap.org ✓, naslov odseka „Načrt po dnevih“ ✓ —
  pred popravkom je bilo vse to ODSOTNO.
- Hladen zagon prvega obiska po uvodu traja ~90 s (znani pojav,
  dokumentiran v E2E-GATES.md; topla instanca ~1 s).
- Merilno pot potuje z dokazi: `layout-shift-sources.json` (razdelek
  `po_popravku_PRODUKCIJA_1.140.1_28.9_ziva`).
