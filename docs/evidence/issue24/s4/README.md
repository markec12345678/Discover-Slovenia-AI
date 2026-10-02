# ISSUE #24 · SKLOP 4 — STROŠEK GORIVA PO VRSTI VOZILA · produkcijski dokazi (1.166.0)

Commit: `5c830f5` (feat) · Datum: 2. 10. 2026 · Produkcijski preverbi: **Render (primarna) + Vercel**, obe na 1.166.0.

Funkcija: proračunska plošča (/nacrtuj + /pot/[shareId]) ponudi izbiro vrste vozila **bencin · dizel · hibrid · EV**; gorivo/elektrika se preštejeta nad obstoječimi km (OSRM ohranjen), vinjeta ostane pri vseh vrstah (cestnina); formula podatkovno-usmerjena (VEHICLE_PROFILES), EV z razkritim pasom elektrike.

## Posnetki (6)

| Datoteka | Vsebina |
|---|---|
| `pot-bencin-1280.png` | /pot privzeto (bencin): Vožnja (gorivo + vinjeta) **47 €**, skupaj 317 €, izbirnik 4 radii, Bencin izbran |
| `pot-ev-formula-1280.png` | /po izbiri Električni: **36 €**, razširjena formula »320 km × 18 kWh/100 km × 0,40 €/kWh + vinjeta (12.8 €)« + celoten pas elektrike |
| `nacrtuj-ev-obeh-1280.png` | /nacrtuj (zlata pot: želja → Sestavi mojo pot): kartica kvalitete IN proračunska plošča usklajeno preklopljeni na EV iz ENEGA klika |
| `pot-ev-mobil-390.png` | Mobil 390 px: izbirnik deluje, **0 prelivanja** (scrollWidth = 390) |
| `en-pot-electric-1280.png` | /en/pot: Petrol/Diesel/Hybrid/Electric, »Driving (charging + vignette)«, EN formula z €0.40/kWh pasom |
| `vercel-pot-ev-1280.png` | Vercel: isti izbirnik + EV interakcija deluje (health 1.166.0 ok) |

## Meritve (14)

| # | Preverba | Rezultat |
|---|---|---|
| 1 | Render health po namestitvi | `status ok`, verzija **1.166.0**, zagonskih preverb 21/21 ok (20 ok + 1 pričakovano skipped vercel-demo-db) |
| 2 | Vercel health | `status ok`, verzija **1.166.0** (~3 min po pushu) |
| 3 | Izbirnik na /pot | radiogroup z 4 radii (Bencin/Dizel/Hibrid/Električni), Bencin privzeto [checked=true] |
| 4 | Privzeti bencin (istost s F5.3) | Vožnja **47 €** = round(320/100×6,5)=21 l × 1,6 → 34 € + vinjeta 12,8 → 46,8 → 47 ✓ |
| 5 | EV preštevanje | oznaka → **Vožnja (elektrika + vinjeta)**; 320/100×18 = 66 kWh → round×0,4 = 26 € + 12,8 = 35,8 → **36 €**; skupaj 317→306; na osebo 159→153 |
| 6 | EV formula (razkrivnost) | »320 km × 18 kWh/100 km × 0,40 €/kWh + vinjeta (12.8 €) — objavljeni slovenski ceniki (AMZS/DARS). V porabi so izgube polnjenja; elektrika je najbolj nestanovitna: doma ~0,16 €, javno polnjenje ~0,30–0,55 €, hitro do 0,79 €/kWh.« |
| 7 | Dizel preštevanje | oznaka nazaj → Vožnja (gorivo + vinjeta); 320/100×5,5 = 17,6 → 18 l × 1,5 = 27 € + 12,8 = 39,8 → **40 €**; formula »5,5 l/100 km × 1,50 €/l« |
| 8 | Persistenca | localStorage `dsa_budget_vehicle`: null → ev → diesel → petrol (vsak klik takoj zapisan) |
| 9 | Zlata pot načrtovalca | domov → želja »Vikend na Gorenjskem — Bled in Bohinj z jezerom« → Sestavi mojo pot → /nacrtuj Dan 1 → Podrobnosti izračunov → obe plošči živi |
| 10 | Usklajenost obeh površin (1 klik) | pred: kartica »gorivo 38 € + 10-dnevna vinjeta 12.8 €« = plošča 51 €; po EV izboru NA NAČRTOVALCU se OBE hkrati prekloputa: kartica »elektrika 26 € + 10-dnevna vinjeta 12.8 €« = plošča isto številko |
| 11 | Telemetrija | 8× POST /api/analytics/event → **200 OK** (budget_vehicle_changed skozi allowlist, 0 tihih 400) |
| 12 | Mobil 390 px | izbirnik dosegljiv/klikljiv, scrollWidth = 390 → **0 prelivanja** |
| 13 | EN površina (/en/pot) | Petrol/Diesel/Hybrid/Electric; »Driving (charging + vignette)«; formula »320 km × 18 kWh/100 km × €0.40/kWh … home ~€0.16, public ~€0.30–0.55, fast charging up to €0.79/kWh« |
| 14 | Napake | **0 page errorjev + 0 konzolnih napak** na vseh preverjenih površinah (Render /pot, /nacrtuj, /en/pot, mobil; Vercel /pot) |

## Meje (iskrene, dokumentirane v CHANGELOGU)

- Cene so OCENE z razkritimi viri (gov.si/AMZS; javne cene polnjenja) — dejanska črpalka/polnilnica se razlikuje.
- EV pas najširši (0,16–0,79 €/kWh); ocena 0,40 €/kWh = sredina javnega polnjenja, izrecno ob številki.
- Ocene za osebna vozila do 3,5 t (avtodomi/kampiranja niso pokriti — izpust, ne izmišljija).
- Vrsta vozila je preferenca NAPRAVE (ne lastnost načrta) — strežniška shranjena ocena ostane privzeti bencin.
