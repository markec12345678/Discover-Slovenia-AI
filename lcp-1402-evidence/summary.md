# LCP 1.140.2 — dokazi (zgodnji zagon Leaflet uvoza na /pot poteh)

**Datum:** 29. 9. 2026 · **Verzija:** 1.140.2 · **Nadaljevanje:** 1.140.1
(CLS) — LCP na OSM ploščicah je bila dokumentirana naslednja meja · **Izbor
naloge:** uporabnikov tretji „nadaljuj“ brez smeri → najbolj obrambno vezana
dokumentirana točka (precedens Task ID 16)

## Zakaj

LCP element na OBEH `/pot` poteh je prva Leafletova OSM ploščica. Časovnica
na topli produkciji 1.140.1 (`timeline-before.json`) je pokazala, da se
Leaflet chunk naloži **serijsko ZA hidratacijo**:

| Dogodek | Čas (ms) |
|---|---|
| HTML responseEnd | 889 |
| Začetni JS grafi (2 valova) | 682–1328 |
| **Map/Leaflet chunki (dynamic uvoz)** | **1445 → 1898** |
| Prve OSM ploščice (LCP element) | 1971 |

`dynamic(ssr:false)` pokliče uvozno tovarno ŠELE ob prvi izrisu komponente
med hidratacijo (~445 ms po začetku hidratacije) — chunk potem čaka še
svoj download (~453 ms tu; na simuliranem 4G večkratno dlje).

## Popravek

`src/components/shared-trip.tsx` — obljuba uvoza se začne **ob evaluaciji
modula** (vzporedno s hidratacijo), `dynamic()` prejme že začeto obljubo:

- `const mapViewModule = typeof window === "undefined" ? null : import(…)`
  — varovalka je OBVEZNA: modul se evaluira tudi na strežniku (SSR client
  komponent) in v bun testih; Leaflet dostopa do `window` ob uvozu.
- `dynamic(() => mapViewModule ?? import(…), { ssr: false, loading })` —
  `??` je varovalka za robne runtime.
- **NAMERNO samo `/pot`** (`shared-trip.tsx` je v grafu samo te dve poti):
  drugod (hero slika na `/`) bi ~450 KB prednalaganja tekmovalo za
  pasovno širino NJIHOVEGA LCP → `map-section.tsx` nedotaknjen
  (regresijsko varovano).

## Zaprtje vrzeli vrat (razlog, da je CLS 0.38 sploh ušla)

/pot poti niso bile v NOBENEM samodejnem pregledu. Nov korak v
`prod-monitor.yml` (vercel job, vsake 3 h): strežniški HTML javne testne
poti `/pot/embed/bb183cd77d` mora vsebovati `h-[500px]` (višinska
rezervacija) IN `»Načrt po dnevih«` (odsek v SSR) — izginotje = rdeči
alarm CLS regresije razreda 1.140.0. Recept za polno CI Lighthouse
razširitev na /pot: `docs/E2E-GATES.md` §T4.

## Lokalna preverba (pred uvedbo)

- SSR HTML: odsek + ovojnica + placeholder + 3 preconnecti VSI prisotni
  (uvoz na strežniku se NE sproži — varovalka deluje) · 0 napak
- Brskalnik 412×823: CLS embed **0.0026** (1 droben zamik = umiritev
  pisav 1–3 px, kategorialno drugačen od nekdanjega skoka odseka) ·
  polna **0.0000** · 0 napak strani/konzole · zemljevid se prikaže
  (`.leaflet-container`, 4 ploščice) · brez preliva
- Vrata: tsc 0 · eslint 0 · suite **4156** (+3 pogodbe: window varovalka,
  začeta obljuba, map-section brez vzorca)
- Testna pot `ee5bba7df0` (sveža — prejšnja `08ec4c69ae` po resetu lokalne
  DB ne obstaja več)

## Produkcijski „po“ dokazi

Dopolnjeno po uvedbi (isti inštrumenti kot izhodišče): `timeline-after.json`
(pričakovano: zagon chunka ~ob evaluaciji modula, ne ~445 ms za
hidratacijo) + Lighthouse mobile/simulate pred/pos.

## Iskrene opombe

- Dev strežnik je med preverbo enkrat umrl (OOM kanon: Fast Refresh poln
  reload + kompilacija + brskalnik) — restart, ogretje s curl, ponovitev
  meritve; rezultat pred restartom enak (0.0026).
- Izbor „nadaljuj brez smeri“ po precedensu Task ID 16: najbolj obrambno
  vezana DOKUMENTIRANA točka („LCP na OSM ploščicah je dokumentirana
  naslednja meja“ — worklog Task ID 17), ne nova produktna površina.
