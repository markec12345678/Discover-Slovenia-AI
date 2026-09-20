# TASK 58 — FULL PROVIDER JOURNEY (Celotno potovanje čez vse ponudnike)

Datum: 2026-09-20 · baseline: `5a700dc` (1.58.3) → **1.59.0** · prvi predmet: `docs/TASK-58-JOURNEY-AUDIT.md`.

## 0. Cilj in mejniki

Cilj NI nov ponudnik — cilj je ORKESTRACIJA celotnega uporabniškega potovanja čez
OBSTOJEČE ponudnike: prihod (Brnik, 20. 9. 14:00) → transfer → nastanitev →
dogodki → restavracije → bencin → najem avta → eno potovanje, en zemljevid,
iskrene cene in pravilen tok rezervacije.

## A. Kaj je bilo dodano (minimalno, nad obstoječo arhitekturo)

| Del | Datoteka | Vsebina |
|---|---|---|
| Matriks zmožnosti | `src/lib/journey/capabilities.ts` | 10-stolpčni matriks IZPELJAN iz `PROVIDER_REGISTRY` (en vir resnice; drift-testi) |
| Kanonski model | `src/lib/journey/types.ts` | TravelJourney, JourneyProduct (sledljivost §5), BookingFlow, PaymentCapability, ConfirmationCapability + statusi (§19), MapProductStatus (§13), JourneyTotals (§16) |
| Tok rezervacije | `src/lib/journey/booking.ts` | bookingMode → tok (§17 A–D), državna naprava statusov (EXTERNAL ≠ CONFIRMED), validacija zapisov potrditve |
| Skupna cena | `src/lib/journey/totals.ts` | confirmed/known/estimated(fromPrice)/unknown — unknown NIKOLI kot 0 |
| Orkestrator | `src/lib/journey/orchestrator.ts` | intent → kategorije (KT rute / OSM runner / EVENTS / affiliate kartice) → validacija čas+geo → totals; DI adapterjev za teste |
| KT iskanje po ruti | `dataset.ts` (`searchKiwitaxiRoutes`) | from→to poizvedba nad OBSTOJEČIM datasetom (0 omrežja; vzdevki Brnik/LJU) |
| Bencin | types/taxonomy/registry/osm-adapter | nov kanonski tip `petrol` (OSM `amenity=fuel`) — razširitev OBSTOJEČEGA lokalnega vira, NE nov ponudnik |
| Potrditve | `prisma/schema.prisma` (`JourneyBooking`) | kanonski model potrditve §19 (prazna tabela — 0 API_BOOKING ponudnikov; iskrena arhitektura) |
| API | `/api/journey/plan` (POST), `/api/journey/bookings` (GET) | orkestracija + branje potrditev (rate-limited, validirano) |
| UI | `/potovanje` + `journey-planner.tsx` + `journey-map.tsx` | obrazec potovanja, kategorije z iskrenimi oznakami, skupna cena, zemljevid s statusi, prenos izbir v načrtovalnik |
| EN | `routing.ts` + sitemap | `/en/potovanje` (whitelist + sitemap + hreflang) |

## B. Zgled potovanja (živo dokazano, Brnik → Maribor)

```
POST /api/journey/plan { origin: "Brnik", destination: "maribor",
                          startDate: "2026-09-20", arrivalTime: "14:00",
                          travelers: 2, lang: "sl" }
```

- **Izhodišče**: „Ljubljana Airport (Brnik)" — geo IZ KT dataseta (46.2249, 14.4637; vir partnerja)
- **Destinacija**: Maribor (46.5547, 15.6459; destinacijski kanon)
- **Transfer**: 3 realne rute (airport €162/100 min/7 razredov + train/bus station); od-cene, per_transfer, „objavljena cena, ni živi citat"; razredi vozil iz vira; bookingUrl `/go/transfers?product=9227` (EXISTENCA preverjena s TASK 56 membership plastjo)
- **Najzgodnejši prihod**: 15:40 (14:00 + 100 min iz vira) — časovna konsistenca §15
- **Dogodki**: 3 realni mariborski (Festival Stara trta …) — INFO ONLY, datumi iz vira
- **Nastanitve/restavracije/bencin**: OSM Overpass runner (živi klic; v peskovniku trenutno mreža do overpass-api.de NI dosegljiva → ISKRENA opomba „ni dosegljiv", 0 izmišljenih produktov — pipeline dokazan z DI testi)
- **Najem**: DiscoverCars affiliate kartica (`/go/cars?dest=Maribor`) — affiliate ≠ inventar (0 produktov)
- **Skupna cena**: Potrjeno €0 · Znane cene €0 · **Ocena (od-cene) €604** (162+216+226) · 3 neznane cene (dogodki — ne štejejo kot brezplačno)
- **Validacija**: 0 napak (ruta obstaja; izhodišče razrešeno)

## C. Invariante (vse testno varovane — 45 novih testov)

1. **Affiliate ≠ inventar**: rental = kartica (0 ProviderProduct); matriks Discovery=AFFILIATE_ONLY.
2. **bookingUrl ≠ rezervacija**: KT tok = `external_affiliate` (plačilo/potrditev pri ponudniku); statusi pinov `booked/pending/failed` NISO dosegljivi v zunanjem toku (`mapStatusReachable` test).
3. **Cena ≠ razpoložljivost**: KT `not_supported` + poštena opomba (nespremenjeno).
4. **fromPrice ≠ končna cena**: `estimatedTotal` ločeno; UI „od €"; describeTotals pojasni pomen.
5. **Unknown ≠ 0**: `unknownCount` izrecen; NI prištet v vsote.
6. **Preusmeritev ≠ plačilo**: PaymentCapability izpeljan (external_provider|merchant_side(own)|none); NI novih Stripe integracij.
7. **EXTERNAL ≠ CONFIRMED**: prehod prepovedan (test); CONFIRMED zahteva providerBookingId+ceno IZ odgovora ponudnika; EXTERNAL zapis ne sme nositi obeh.
8. **AI orkestrira, ne izmišljuje**: izbire iz /potovanje gredo v OBSTOJEČO verigo kot `fixed` (sessionStorage + store — kanonični vzorec); FIXED/PREFERRED/SUGGESTED nespremenjeni.
9. **Klient ≠ avtoriteta**: orkestrator bere SAMO kanonske vire; cene/ID/geo so strežniški (nadaljnja zaščita = obstoječa veriga selection-verify → itinerary-validation → save).
10. **One user — one trip**: persistenca ostaja SavedItinerary (shranjevanje prek obstoječe poti); JourneyBooking se veže na shareId.

## D. Zemljevid potovanja (§13)

`journey-map.tsx`: ✈ izhodišče → 🎯 destinacija + produkti s statusi:
selected (smaragdna obroba ✅) · recommended (vijolična) · informational (siva) ·
booked/pending/failed (model obstaja, dosegljivi SAMO prek API_BOOKING — danes
0 ponudnikov → NIKOLI prikazani). Barva NIKOLI ne nakazuje rezervacije, ki je ni.

## E. Regresija (dejanske številke)

- `bun test`: **1259/1259** (1214 + 45 novih; 44 698 expect() klicev, 43 datotek)
- `bun run lint`: 0 napak
- `bunx tsc --noEmit`: 0 napak v src/ (pre-existing zunaj: skills/*, tailwind.config.ts)
- Browser E2E: /potovanje SL + /en/potovanje EN 200; obrazec → načrt → izbira →
  prenos v načrtovalnik (chip „Ljubljana Airport → Maribor: fixed") ✓; skupna
  cena €0/€0/od €604 ✓; 375px + 390px = 0 px preliva; 0 napak konzole.
- Sitemap: 736 → 738 URL (+/potovanje SL+EN; števci usklajeni — test zelen).

## F. Omejitve (iskrene)

1. **0 poverilnic** → 0 API_BOOKING ponudnikov: API_BOOKING tok je arhitektura
   (BookingFlow + JourneyBooking model + invariante), NE izvedena rezervacija.
   Aktivacija ne zahteva spremembe kode (ista pot kot TASK 53/54).
2. **Peskovnik**: overpass-api.de trenutno nedosegljiv (mreža okolja) → lokalne
   kategorije se iskreno praznejo z opombo; pipeline je dokazan z DI testi
   (fake adapter → vse tri kategorije + razdalje + razvrstitev).
3. **db:push** v peskovniku odpove (DATABASE_URL=file: SQLite nasproti postgres
   schemi — dokumentirana okoljska omejitev od TASK 54; schema commitana,
   produkcija = Pot B Neon). Prisma client regeneriran (tsc čist).
4. **Dogodki**: informacijski (lokalni dataset nima geo/cene/ure) — izbrano
   NI ponujeno za prenos v načrt (iskro: vstopnice niso podprte).

## G. Naslednji korak

`WAITING FOR REAL PROVIDER CREDENTIALS` — vsak API_BOOKING ponudnik (Viator,
GetYourGuide, Tiqets, Booking, Skyscanner, Airalo, Travelpayouts) oživi
živi inventar BREZ spremembe kode; JourneyBooking se napolni SAMO iz
providerjevih odgovorov (invariante §19 že varovane s testi).
