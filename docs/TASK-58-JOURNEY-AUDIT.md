# TASK 58 — FULL PROVIDER JOURNEY AUDIT (First Deliverable)

Datum: 2026-09-20 · baseline: `5a700dc` (1.58.3) · revizija: GitHub-first (koda = source of truth).

## 0. Namen

Pred implementacijo orkestracije celotnega potovanja: **natančen matriks zmožnosti
vsakega ponudnika IZ DEJANSKE KODE** (registry.ts, adapterji, /go, save veriga).
Razvrstitvena beseda NI želja — je stanje, dokazano iz datoteke:vrstica.

Besednjak (naročnikova klasifikacija):

| Oznaka | Pomen |
|---|---|
| LIVE | živi klic na vir Teče danes (dokazljivo) |
| CODE_READY | adapter/koda implementirana, a vrata še zaprta (ključ/dataset) |
| AFFILIATE_ONLY | samo globoka povezava prek /go — NIKOLI inventar |
| STATIC_CONTENT | objavljeni (npr. CSV) podatki po ingestu — realni, niso živi citat |
| INFO_ONLY | prikaz/kontakt brez transakcije |
| NOT_CONFIGURED | env ključ MANJKA (0 poverilnic v okolju) |
| BLOCKED | vir/okolje onemogoča dostop (DNS peskovnik idr.) |
| NOT_SUPPORTED | vir koncepta sploh nima |

## 1. Matriks zmožnosti (16 ponudnikov + lastna tržnica)

| Provider | Discovery | Live inventory | Price | Availability | Booking | Payment | Confirmation | Affiliate | AI | Current route |
|---|---|---|---|---|---|---|---|---|---|---|
| **osm** | LIVE (Overpass po viewportu) | NOT_SUPPORTED (odprti podatki ≠ inventar) | NOT_SUPPORTED | NOT_SUPPORTED (izrecno `not_supported`) | INFO_ONLY | NOT_SUPPORTED | NOT_SUPPORTED | NE | LIVE (izbira → selectedProviderProducts → AI kontekst) | `/api/supply/search` → Map → ProductModal → načrt |
| **fsq** | CODE_READY (lokalna množica) | NOT_CONFIGURED (FSQ_PLACES_DIR manjka) | NOT_SUPPORTED | NOT_SUPPORTED | INFO_ONLY | NOT_SUPPORTED | NOT_SUPPORTED | NE | NOT_CONFIGURED | adapter vrne [] + „no-dataset" |
| **sto** | STATIC_CONTENT (llms.txt RAG T2) | NOT_SUPPORTED | NOT_SUPPORTED | NOT_SUPPORTED | INFO_ONLY | NOT_SUPPORTED | NOT_SUPPORTED | NE | LIVE (T2 iskanje virov) | `/api/ai/sources?q=` |
| **own** | CODE_READY (DB Listingi) | CODE_READY | LIVE (DB cene) | NOT_SUPPORTED | API_BOOKING (Stripe, lastna tržnica) | MERCHANT_SIDE (Stripe checkout; demo = unpaid, NIKOLI v provizijsko osnovo) | CONFIRMED (samo plačana transakcija) | NE | CODE_READY | `/api/itinerary/bookings` → booking-panel |
| **kiwitaxi** | STATIC_CONTENT (CSV ingest: 1494 rut, 9614 transferjev) | NOT_SUPPORTED (niso živi citati) | STATIC (per_transfer, `fromPrice:true` — objavljene, kanonske) | NOT_SUPPORTED (CSV koncepta nima — iskrena opomba) | AFFILIATE_ONLY (EXTERNAL: `/go/transfers?product={id}` + membership 404) | EXTERNAL_PROVIDER | EXTERNAL (neznan nam — brez webhooka) | DA (pap; monetized:false brez PAP_ID) | LIVE (supply kontekst + FIXED veriga + kanonska revalidacija) | search → izbira → AI → /go |
| **booking** | CODE_READY (Demand API v3) | NOT_CONFIGURED (BOOKING_API_KEY manjka; Managed Affiliate Partner status) | CODE_READY (per_night rates blok) | UNKNOWN (blok-dostopnost nad tierjem) | AFFILIATE_ONLY (danes `/go/hotels`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | adapter [] + „not-configured" |
| **viator** | CODE_READY (Partner API v2) | NOT_CONFIGURED (VIATOR_API_KEY manjka; vrata 401 živo) | CODE_READY (fromPrice) | NOT_SUPPORTED (Basic Access nima checka) | AFFILIATE_ONLY (`/go/viator?product=`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | adapter [] + „not-configured" |
| **getyourguide** | CODE_READY (Partner API OpenAPI) | NOT_CONFIGURED (žeton manjka; 401 živo) | CODE_READY (StartingPrice) | NOT_SUPPORTED | AFFILIATE_ONLY (`/go/getyourguide?product=`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | adapter [] + „not-configured" |
| **tiqets** | CODE_READY (Distributor API) | NOT_CONFIGURED (ključ manjka; 401 živo) | CODE_READY | UNKNOWN | AFFILIATE_ONLY (`/go/tickets`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | adapter [] + „not-configured" |
| **discovercars** | AFFILIATE_ONLY | NOT_SUPPORTED (B4B pogodba) | NOT_SUPPORTED | NOT_SUPPORTED | AFFILIATE_ONLY (`/go/cars?dest=`) | EXTERNAL_PROVIDER | EXTERNAL | DA (a_aid) | NOT_CONFIGURED | affiliate kartica |
| **skyscanner** | CODE_READY (Travel API v3) | NOT_CONFIGURED (ključ manjka; Request Forbidden živo) + PRODUCT GAP origin | CODE_READY (per_person od-cena) | UNKNOWN | AFFILIATE_ONLY (`/go/flights`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | adapter [] (origin gate) |
| **omio** | AFFILIATE_ONLY | NOT_SUPPORTED | NOT_SUPPORTED | NOT_SUPPORTED | AFFILIATE_ONLY (`/go/transport`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | affiliate kartica |
| **airalo** | CODE_READY (Partner API v2; peskovnik 200 živo) | NOT_CONFIGURED (OAuth2 poverilnici manjkata) | CODE_READY (SAMO EUR iz vira) | UNKNOWN | AFFILIATE_ONLY (`/go/esim`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | adapter [] + „not-configured" |
| **worldnomads** | AFFILIATE_ONLY | NOT_SUPPORTED | NOT_SUPPORTED | NOT_SUPPORTED | AFFILIATE_ONLY (`/go/insurance`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | affiliate kartica |
| **safetywing** | AFFILIATE_ONLY | NOT_SUPPORTED | NOT_SUPPORTED | NOT_SUPPORTED | AFFILIATE_ONLY (`/go/insurance`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | affiliate kartica |
| **travelpayouts** | CODE_READY (Data API) | NOT_CONFIGURED (žeton manjka; 401 živo) + origin gate | CODE_READY (predpomnjene fromPrice) | UNKNOWN | AFFILIATE_ONLY (`/go/flights`) | EXTERNAL_PROVIDER | EXTERNAL | DA | NOT_CONFIGURED | adapter [] (origin gate) |

**Legenda z dokazi (datoteka:vrstica, baseline `5a700dc`):**
- registry.ts:115–705 (16 vnosov: inventoryAccess, capabilities, envKeys, accessNote)
- search.ts:51–64 (10 tovarn adapterjev: osm, kiwitaxi, viator, getyourguide, tiqets, booking, skyscanner, airalo, travelpayouts, fsq)
- production-matrix.ts (PRODUCTION_ACTIVE: osm/sto/kiwitaxi; 57/57 drift testov)
- /go/[provider]/route.ts:73–77 (PRODUCT_VALIDATORS), :150–157 (KT membership 404)
- affiliate.ts:141–260 (buildPartnerUrl, pap, a_aid — fail-closed brez env)
- selection-verify.ts:125–159 (KT dataset = resnica izbire; fabricated → rejectedFake)
- itinerary-validation.ts:432–700 (fake_supply_ref, dedupe, kanonska cena/geo, FIXED)
- save/route.ts:98 (revalidateSavedItinerarySupply PRED persistenco)
- 27 env imen VSIH MISSING v okolju (samo DATABASE_URL) — 0 poverilnic.

## 2. Kaj ARHITEKTURA ŽE podpira (dokazano) in kaj MANJKA

### ŽE obstaja (NOVEGA NE gradimo):

- **Kanonski model**: ProviderProduct (types.ts:156–221) — provider, providerProductId,
  cena (PriceInfo: amount/unit/fromPrice/note), razpoložljivost (4-statusna semantika),
  bookingMode (affiliate_redirect | api_bookable | info_only | own_marketplace),
  bookingUrl, sourceUrl, geo, openingHours, licenca.
- **Discovery**: searchSupply runner (zoom gating, dedupe, kap, degraded, rate limit).
- **Kanonska verifikacija**: selection-verify (KT dataset = resnica) → itinerary-validation
  (fake_supply_ref/dedupe/cena/geo/FIXED reinsert) → save revalidacija → /pot.
- **FIXED/PREFERRED/SUGGESTED** semantika (types.ts:292–319 + 4-plastna zaščita).
- **Affiliate tok**: /go (allowlist hostov, KT membership, 302/404/400).
- **AI projekcija**: AiSupplyProduct (varna, SUGGESTED privzeto, kanonske cene).
- **AI orkestrira, ne izmišljuje**: vse invariante cene/ID/geo/razpoložljivosti.
- **Shranjena pot = enoten vir resnice**: SavedItinerary (persistenca + javni /pot).
- ** Čas/geo konsistentnost**: repairScheduleGaps, OSRM noge, geo-validacija (itinerary).
- **Lastna tržnica plačila**: Booking + Stripe (paymentStatus ločen od statusa; „paid"
  SAMO iz Stripe webhooka — NIKOLI demo).

### MANJKA (kaže implementacija TASK 58):

1. **Journey orkestrator** — ni osrednje plasti, ki iz INTENTA (izhodišče/destinacija/
   datum/čas/potniki) orchestrira VEČ kategorij (transfer/nastanitve/dogodki/
   restavracije/bencin/najem) v eno potovalno verigo z zmožnostmi po produktu.
2. **KT iskanje po ruti** — dataset poizvedba je SAMO viewport (bbox); orkestrator
   potrebuje from→to poizvedbo (npr. „Ljubljana Airport → Maribor": 3 rute obstajajo).
3. **Bencinske postaje** — taksonomija NIMA tipa (OSM filter amenity=fuel manjka).
4. **Journey skupne cene** — ločba confirmed/known/estimated/fromPrice/unknown na
   nivoju POTOVANJA (itinerary total_budget ima svojo pošteno semantiko — ne mešamo).
5. **Tok rezervacije po zmožnosti** — bookingMode je na produktu, a ni potovalne
   plasti, ki ga preslika v zunanji/podatkovni tok z iskrenim plačilom/potrditvijo.
6. **Kanonični model potrditve** — Booking je lastna tržnica (Experience+Stripe);
   ponudniške potrditve (EXTERNAL/CONFIRMED/…) nimajo modela. Vrstni red statusov
   (§19) + invariant EXTERNAL ≠ CONFIRMED ni zapisan.
7. **Statusi pina na zemljevidu potovanja** — selected/recommended/informational/
   booked/pending/failed (mapStatus) ne obstajajo kot model.
8. **Journey UI** — stran, ki vodi uporabnika skozi prihod → transfer → nastanitev →
   dogodki → restavracije → bencin → najem z iskrenimi oznakami.

## 3. Sledljivost izbire (§5) — preslikava obstoječega v journey

| Zahtevano | Obstoječe (kje) | Vrstni red |
|---|---|---|
| provider, providerProductId | ProviderProduct.id = `{provider}:{providerProductId}` | iz kanonskega produkta |
| tip | ProductType (taksonomija) | iz produkta |
| kanonski naslov/geo | KT: dataset (verifyCurrentStopsAuthority popravi naslov/geo) | strežniško |
| cena + valuta + semantika | PriceInfo (amount/currency/unit/fromPrice) | strežniško (KT dataset = resnica) |
| semantika razpoložljivosti | AvailabilityStatus (4-statusna) | strežniško |
| booking mode + URL | bookingMode + bookingUrl (strežniško izgrajen, NIKOLI klientov) | strežniško |
| source URL | sourceUrl (validiran) | strežniško |
| izbrani datum/čas, trajanje, količina | dates? v SelectedProviderProduct; KT durationMin | journey dodajek (nad kanon) |
| popotniški podatki | groupSize (PlannerInput) | journey dodajek |

**Invariant (nespremenjen):** klientov vput NIKOLI ne postane avtoriteten za ceno/
provider ID/geo/razpoložljivost — obstoječa veriga (selection-verify →
itinerary-validation → save revalidacija) že to zagotavlja; journey plast samo
PONOVNO UPORABLJA kanonske produkte (ne gradi novega verifica).

## 4. Primerjalna potovanja — resnična podpora (Brnik → Maribor)

| Kategorija | Vir danes | Resnični produkti | Iskrena oznaka |
|---|---|---|---|
| Transfer | kiwitaxi dataset | 3 rute (Ljubljana Airport → Maribor [+ train/bus station]), €162+, 100 min, 6–7 razredov vozil | STATIC_PRICE + BOOKABLE/EXTERNAL |
| Nastanitev | osm (živi Overpass) | hoteli/gostilne v bbox Maribora | INFO_ONLY + PRICE_UNKNOWN |
| Dogodki | events-data (lokalni) | 3 mariborski (npr. Festival Stara trta) | INFO_ONLY + znan datum |
| Restavracije | osm (živi Overpass) | amenity=restaurant/cafe/bar | INFO_ONLY + PRICE_UNKNOWN |
| Bencin | osm (živi Overpass) | amenity=fuel — **zahteva NOV taksonomski tip** | INFO_ONLY (discovery) |
| Najem avta | discovercars | 0 produktov (affiliate ≠ inventar) — realni tok /go/cars | AFFILIATE_ONLY + EXTERNAL |

## 5. Odločitve za implementacijo (minimalne, po §0 „ne prepiši arhitekture")

1. `src/lib/journey/` — nova osrednja plast: types, capabilities (matriks IZPELJAN
   iz registra — en vir resnice), orchestrator, totals, booking. BREZ provider-specifičnih
   hackov: vsak kategorijo zadovoljuje obstoječi adapter/dataset.
2. KT: `searchKiwitaxiRoutes(from, to)` — ČISTA lokala poizvedba nad obstoječim
   datasetom (0 omrežja). Ni nov provider; ni nova vrsta validacije.
3. Bencin: nov kanonski tip `petrol` (taksonomija + OSM filter + register osm.types)
   — razširitev OBSTOJEČEGA lokalnega vira, ne nov provider.
4. Potrjevanje: model `JourneyBooking` (Prisma) s statusi §19 + invarianti
   (EXTERNAL NIKOLI → CONFIRMED; shranjujemo SAMO kar vrne provider). Danes 0
   zapisov — 0 poverilnic = 0 API_BOOKING ponudnikov (iskreno).
5. Plačilo: NI novih Stripe integracij. Payment zmožnost je IZPELJANA iz stanja
   (external_provider | merchant_side(own) | none) — brez fake gumbov.
6. Skupna cena: JourneyTotals { confirmedTotal, knownTotal, estimatedTotal,
   fromPriceTotal, unknownCount } — unknown se NIKOLI prišteje kot 0.
7. Zemljevid potovanja: statusi pinov (selected/recommended/informational/
   booked/pending/failed) — booked/pending/failed so v modelu, danes NEDOSEGLJIVI
   (0 API_BOOKING) — barve NIKOLI ne nakazujejo rezervacije, ki je ni.
8. Persistenca: SavedItinerary ostane enotni vir resnice potovanja (journey =
   kontekst izbire + načrt); JourneyBooking se veže na shareId ob shranitvi.

## 6. Iskrenost (nespremenjene invariante)

- affiliate povezava ≠ inventar (tipi v registru; rental = kartica, NE ProviderProduct)
- bookingUrl ≠ opravljena rezervacija (EXTERNA tok → potrditev je pri ponudniku)
- cena ≠ razpoložljivost (4-statusna semantika; fromPrice ≠ končna cena)
- preusmeritev ≠ plačilo (plačilo pri ponudniku; lastna tržnica = Stripe, ločeno)
- EXTERNAL NIKOLI ≠ CONFIRMED (model potrjevanja)
- AI orkestrira, ne izmišljuje (FIXED/PREFERRED/SUGGESTED ostanejo avtoritativni)
