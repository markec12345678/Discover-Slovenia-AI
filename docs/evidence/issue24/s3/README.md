# ISSUE #24 · SKLOP 3 — ZEMLJEVID MOJIH POTOVANJ · PRODUKCIJSKI DOKAZI (1.165.0)

**Datum:** 2026-10-02 · **Commit:** `dc4f8e3` · **Produkciji:** Render `https://i-feel-slovenia.onrender.com` + Vercel `https://i-feel-slovenia.vercel.app` — OBE na **1.165.0** (health ok; Render 22/22 zagonskih preverb).

**Metoda:** agent-browser (Render) + curl (obe produkciji). Zlata pot v živo: /nacrtuj → želja »Vikend na Bledu z jezerom in sotesko Vintgar« → Generiraj → Shrani → deljiva povezava `/pot/7c18f6db32` (ime: »Bohinj · Triglav · Reka Soča«) → localStorage `dai:my-trips` → /moja-potovanja.

## Posnetki (vsak drugačen MD5 — vsak prikazuje DEJANSKO stanje)

| Datoteka | Kaj dokazuje |
|---|---|
| `prod-01-hub-guest-map.png` | Gostov hub, 1 shranjena pot: kartica **»Zemljevid mojih potovanj · 1 potovanje«** z živim Leaflet zemljevidom (6 piki, črtkana polyline, OSM ploščice) |
| `prod-02-marker-popup.png` | Klik pika → popup: ime postanka (**Bohinj**), ime poti, »dan 1« + povezava **»Odpri pot« → /pot/7c18f6db32** |
| `prod-03-mobile-390.png` | Mobilna širina 390 px: mapa živa (6 piki), **0 horizontalnega prelivanja** (`scrollWidth ≤ clientWidth`, izmerjeno) |
| `prod-04-two-trips-full.png` | Dve poti (druga: `da7060cf57` »D7 produkcijski preizkus embed«): **8 piki, 2 polyline**, interaktivna legenda — žetoni »Vsi« + obe poti (vsi `aria-pressed=true`) |
| `prod-05-legend-toggled-off.png` | Klik žetona D7 v legendi → **8→6 pikov, 2→1 polyline** (pot pošteno skrita; žeton izklopljen, »Vsi« izklopljen) |
| `prod-07-vercel-map.png` | Vercel produkcija: ista kartica, 6 piki, 0 napak — obe produkciji dokazani |

*Preklop nazaj (»Vsi« → 8 pikov) je bil med sejo izmerjen dvakrat (aria-pressed true→false→true, števci markerjev 8→6→8) — vsebovan v poteku seje spodaj.*

## Meritve v živo (ne posnetki — izjave DOM/omrežja)

| Preverba | Rezultat |
|---|---|
| Gost brez potovanj | kartica se NE izriše (fail-closed — prazno stanje ostane čisto) |
| Mapa po zlati poti | `markers: 6, polylines: 1, tiles: 10, hasMap: true` |
| Popup markerja | `Bohinj / Bohinj · Triglav · Reka Soča · dan 1 / Odpri pot → /pot/7c18f6db32` |
| Dve poti | `markers: 8, polylines: 2` + legenda 3 žetoni |
| Toggle žetona | `markers: 8→6, polylines: 2→1`, `aria-pressed: true→false` |
| »Vsi« reset | `markers: 6→8`, vsi žetoni `pressed=true` |
| POST /api/trips/map-pins (veljaven id) | **200** — 6 stopov `{lat,lng,name,day}` (Bohinj/Triglav dan 1, Soča/Postojnska jama dan 2, Novo mesto/Slovenj Gradec dan 3) |
| POST (neveljaven id `../evil`) | **400** |
| POST (prazen ids) | **400** |
| POST (neznan id `zzzzzz9999`) | **`{"pins":[]}`** — tiho izpust, brez potrditve obstoja |
| **Števec ogledov NEODVISEN od map-pins** | GET shared → views **1**; 3× POST map-pins; GET shared → views **2** (= točno +1 od 2. GET; map-pins NI povečal) |
| Mobile 390 px | `overflow: false`, mapa živa |
| Page/console napake | **0 / 0** na vseh zaslonih (Render + Vercel) |

## Regresija ob commitu

`bun test` **4.817 pass** + 1 znana sandbox DB napaka (issue7-g11 ④ — CI-semantika) · `bun run lint` **0** · `npx tsc --noEmit` **0** · **33 novih testov** (`src/lib/__tests__/issue24-s3-trips-map.test.ts`).
