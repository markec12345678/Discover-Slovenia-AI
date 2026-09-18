# Discover Slovenia — TRAVEL SUPPLY MAP
## Sistemski audit, capability matrix, produkcijska arhitektura in fazni načrt

**Datum:** 18. 9. 2026 · **Verzija sistema:** 1.48.3 (`main` @ `06c3789`) · **Status: SAMO ANALIZA — brez spremembe kode**

Cilj (potrjen z naročnikom): iz obstoječega OSM zemljevida razviti **Discover Slovenia Travel Supply Map** — en zemljevid, kjer uporabnik odkrije slovensko lokalno ponudbo (OSM/lokalni viri) + komercialno turistično ponudbo več ponudnikov, izbrane produkte doda v AI načrt in rezervira prek ponudnikovega kanala. **Ni** »Booking map« — je skupni ponudniški (supply) motor z adapterji, ne ločeni UI sistemi.

---

## 1. POVZETEK ZA ODLOČITEV

| Vprašanje | Odgovor (dokazano 18. 9. 2026) |
|---|---|
| Imamo danes kakšen pravi ponudniški API? | **NE.** 0 klicev na ponudniške API-je; 10 ponudnikov = samo affiliate redirect prek `/go/[provider]` |
| Kateri ponudniki dejansko omogočajo zemljevidni sloj (geo+cene+inventar)? | **Viator, GetYourGuide, Tiqets, KiwiTaxi** (partner/affiliate API), **Booking.com** (Demand API — podpogojeno z »Managed Affiliate Partner« statusom), **Airalo** (državni nivo) |
| Kaj je dosegljovo BREZ odobritve (self-serve)? | **KiwiTaxi** (javni CSV podatkovni API — živ dokaz: 992 transfer rut v Sloveniji, koordinate WKT, cene), **Travelpayouts** (API s predpomnjenimi cenami letov/hotelov +affiliate link API), **Foursquare Open Places** (odprti PODATKI, Apache 2.0) |
| Kaj ostane samo redirect/kartica? | **Skyscanner, Omio, DiscoverCars** (kartice z globokimi povezavami na iskanja), **World Nomads, SafetyWing** (zavarovanja — nikakršnih API-jev več) |
| Google Places? | **IZKLJUČEN** — ToS §3.2.3(e) izrecno prepoveduje prikaz Places vsebine na ne-Google zemljevidu |
| Restavracije? | Ostanejo **OSM/lokalni sloj** (+ morebitna dopolnitev FSQ Open Places) — noben komercialni ponudnik nima ustreznega zakonitega vira |
| Največja ozka grlo? | **Čas odobritve partnerstev** (Viator/GYG/Tiqets/Booking) — prijave je treate sprožiti takoj (Faza 0), implementacija fundacije pa teče vzporedno |

---

## 2. AUDIT TRENUTNEGA SISTEMA

### 2.1 Zemljevid — štiri površine, ena tehnologija

Tehnologija: **Leaflet 1.9.4** (imperativni `L.map`, brez react-leaflet/MapLibre), OSM raster ploščice `tile.openstreetmap.org`, maxZoom 18, atribucija `© OpenStreetMap`.

| Površina | Datoteka | Funkcija |
|---|---|---|
| `/zemljevid` raziskovalec | `src/app/zemljevid/page.tsx` → `sections/map-section.tsx` → `sections/map-view.tsx` (~940 vrstic) | 22 editorialnih destinacij (emoji divIcon, bogati popupi s sliko/oceno/trajanjem/budgetom → `DestinationModal`); opcijski **POI sloj (privzeto IZKLOPJEN)** iz `/api/pois`; 8-kategorijске čipi z iskrenimi števci; `map_poi_filtered` telemetrija |
| Načrtovalnik | `components/trip-map-panel.tsx` | Uporabnikova ruta: dnevno obarvane polilinije (OSRM realna geometrija), številčni markerji, dvosmerna sinhronizacija s karticami postankov |
| Chat mini mapa | `components/chat-mini-map.tsx` | Številčni pinji obarvani po **provenienci** (zeleno t1 / jantarno osm / turkizno t2) |
| Deljena pot | `components/shared-trip.tsx` | `/pot/[shareId]` |

i18n: `next-intl` 4.3.4, lokalni prefiks `as-needed` (sl = `/`, en = `/en/…`); `/zemljevid` je na EN whitelisti (`/en/zemljevid` deluje); `de`/`it` sta legacy 308→sl. Mapa komponente uporabljajo vzorec `L`/`T` (SL/EN) + `useLocale()`.

Mobilno: fiksne višine, `invalidateSize` retry; PWA: SW predpomnilnik OSM ploščic `dai-tiles-v1` (LRU 600) → offline zemljevid za videna območja.

### 2.2 OSM/Overpass — podatkovni tok

- `src/lib/overpass.ts`: primerjava dveh endpointov (`overpass-api.de` + kumi mirror), 3 poskusi, 5 s timeout na poskus, časovni budget 8/15 s; LRU predpomnilnik 10 min/50 vnosov; UA `DiscoverSlovenia-AI/1.41`.
- `GET /api/pois`: fiksni bbox cele Slovenije (`45.4,13.4,46.9,16.6`), `out center tags 1000`, 9 OSM kategorij (turism\*, historic\*, amenity\*, natural\*, shop\*), `limit` ≤500 (privzeto 200). **`bbox` parameter je dokumentiran, a NI implementiran.** `cache: "no-store"` — živ klic na Overpass na vsak zahtevek; rate limit 30/min.
- Obogatitev: `/api/pois/[id]` (Wikidata→Wikipedia extract+slika, SSRD utrjeno), `/api/pois/describe` (AI opis, trajni JSON predpomnilnik `data/poi-descriptions.json`).
- STO/slovenia.info: `scripts/ingest-sto.ts` → `data/sto-sources.json` (664 zapisa iz llms.txt datotek, samo metapodatki, editorialni pregled prek git diff) — RAG T2 plast za chat, NE zemljevid.
- `src/lib/pins-ingest.ts`: Google Takeout GeoJSON/KML → 22 destinacij.

**POI model:** `Poi` vmesnik podvojen **3×** (`/api/pois/route.ts`, `map-view.tsx`, `poi-modal.tsx`); chat površina ima ločen `ChatPlace` (provenienca t1/osm/t2). Nobenega polja za ceno/ponudnika/rezervacijo.

### 2.3 Affiliate/provider plast — 10 ponudnikov, 0 API-jev

`src/lib/affiliate.ts` (zveza `AffiliateProvider`) + `GET /go/[provider]?dest=&days=&from=` (302, allowlist ponudnikov + gostov, kanonična destinacija iz whitelistne 22, `affiliate_click` telemetrija, fail-closed Brez ID-jev → čista partnerska stran + `monetized:false`):

| Ponudnik (slug) | Env spremenljivka (tip) | Omrežje | Današnja integracija |
|---|---|---|---|
| Booking.com (`hotels`) | `BOOKING_AFFILIATE_ID` (aid) | direktno | globoka povezava na iskanje |
| DiscoverCars (`cars`) | `DISCOVERCARS_AFFILIATE_CODE` (a_aid) | direktno | globoka povezava (+14/+21 d fiksno) |
| GetYourGuide (`activities`) | `GETYOURGUIDE_PARTNER_ID` | direktno | globoka povezava `?q=` |
| Skyscanner (`flights`) | `SKYSCANNER_MEDIA_PARTNER_ID` | Impact | globoka povezava z IATA mapo (lju) |
| World Nomads (`insurance`) | `WORLDNOMADS_AFFILIATE_URL` | CJ | polni URL passthrough |
| SafetyWing (isti slug) | `SAFETYWING_AMBASSADOR_ID` | direktno | id → referenceID |
| Airalo (`esim`) | `AIRALO_AFFILIATE_URL` | Impact/TP | polni URL passthrough |
| KiwiTaxi (`transfers`) | `KIWITAXI_PAP_ID` (pap) | direktno | globoka povezava /en/slovenia/{slug} |
| Omio (`transport`) | `OMIO_AFFILIATE_URL` | TP | polni URL passthrough |
| Viator (`viator`) | `VIATOR_AFFILIATE_URL` | ShareASale/TP | polni URL passthrough |

Grep po `src/`+`scripts/` za fetch na vse partnerske domene: **0 zadetkov.** Edini zunanji API-ji danes: OSRM, Open-Meteo, AI veriga, Stripe, SMTP.

Šibke točke: **4 ročno vzdrževani vzporedni registri** (union tipa, `buildPartnerUrl` switch, `ALLOWED_HOSTS`, `PROVIDER_LABELS_SI`); `/vir-podatkov` navaja 5/10 ponudnikov (zastarelo); `days`/potniki/datumi se ne posredujejo; brez sub-ID/click-ID zaprto-zankanega pripisa.

Močne točke: fail-closed arhitektura, sanitizacija, `rel="sponsored"`, EU razkritja v pogoji-uporabe §4, 641-vrstična testna zbirka + E2E redirect skripta.

### 2.4 Lastni marketplace (nez relevanten vir supply-a, a pomemben vzorec)

Prisma: `Listing` (hotel/restavracija/aktivnost/trgovina/transport; moderacija; praktični podatki), `Experience` (cena, trajanje, skupine), `Product` (tržnica, zaloge), Stripe checkout (demo mode / produkcijski način), 12 % provizija AI-pripisanim izkušnjam (`commissions.ts`), B2B naročnine. `bookingMode` polje ne obstaja nikjer.

### 2.5 AI itinerary sistem

Veriga: `ai-client.ts` (OpenRouter → Gemini compat → Puter → z-ai-sdk → deterministični rezerva; vezavni varovalki 3 napake→5 min) → kontekst (T1 dataset 22 destinacij z preverjenimi odpiralnimi časi, `ranking-engine.ts` nad objavljenimi Listingi ≤50, vreme Open-Meteo) → JSON → `sanitizeItinerary` → obogatitev (vreme/dogodki/pakirni seznam) → OSRM noge → kvaliteta → `validateItineraryGeo` (10 pravil) → `SavedItinerary` (shareId, editToken) → `/pot/[shareId]`.

`LocationVisit` (postanek) že podpira `lat/lng?` za OSM kraje zunaj T1 + `chat-add-place.ts` (deterministično dodajanje OSM mesta v načrt z iskrenimi opombami provenience). **To je pripravljena infrastruktura za »Add to my plan« iz zemljevida — ni povezana le s PoiModal.**

### 2.6 Prisma, telemetrija, testi

- 29 modelov (sqlite sandbox / postgres produkcija). `AIUsageLog` **definiran, a ni runtime zapisov** — naravni observability hook za adapterje.
- Telemetrija: ~50 whitelistanih dogodkov; relevantni: `map_opened`, `map_poi_filtered`, `chat_geo_*`, `provider_detail_opened`, `affiliate_clicked`, `booking_cta_clicked`, `planner_*` lijak.
- Testi: `bun test` 135+ (affiliate 53, geo-validation 26, geo 20, …) + skriptni E2E (road-routing 29, pwa 36, phase4, affiliate-redirects.sh). Ni CI za teste (lokalno izvajanje).
- Infra za ponovno uporabo: `overpass.ts` (adapter blueprint), `road-routing-server.ts` (predpomnilnik 24 h + vezavna varovalka + fail-open), `rag/freshness.ts` (baseline+overlay+single-flight), `rate-limit.ts` (drsnokretno okno na ključ), cron avtentikacija, `mini-services/` mapa obstaja a je **prazna**.

---

## 3. KAJ ŽE IMAMO (prednosti za TSM)

1. **Zemljevidni UI okvir:** kategoriji čipi, iskreni števci, telemetrija, PWA offline ploščice, modalna arhitektura (DestinationModal že prikazuje partnerske CTA vrstice!).
2. **Provenienčna/trust arhitektura:** t1/osm/t2 barvanje, SYSTEM_DATA_GUARD, data-honesty znamka — neposredno preslikava v `source`/`license` polja kanoničnega modela.
3. **Pošten affiliate redirect sloj:** /go varnost (allowlist, sanitizacija, fail-closed) produkcijsko kaljen — adapterjem dodamo samo produkt-nivo globokih povezav.
4. **Adapter vzorci:** retry+failover+budget (overpass), predpomnilnik+varovalka (OSRM), veriga z rezervo (ai-client) — trije dokazani vzorci za SupplyAdapter.
5. **Deterministično dodajanje krajev v načrt** (chat-add-place) — mehanizem za »Add to my plan«.
6. **Telemetrija + admin statistika** + AIUsageLog prazen model, ki čaka namestitev.

## 4. KAJ MANJKA (vrzeli)

1. **Kanonični `ProviderProduct`** — trije razhajajoči se modeli (Poi ×3, ChatPlace) brez ponudnika/cene/razpoložljivosti/rezervacije.
2. **Složje ponudnikov** — komercialne kategorije (hoteli, aktivnosti, vstopnice, transferji, avto, leti, eSIM) nimajo prostorske predstavitve.
3. **Viewport poizvedbe** — `bbox` ni implementiran; fiksni državni bbox; živ Overpass na vsak klic (no-store!) — potreben normaliziran predpomnilnik na strani strežnika.
4. **Datum/potnik/`zoom` dimenzije** — ni datuma, zasedenosti, gostote glede na zoom.
5. **Grozdenje (clustering)** — nobenega markerclustra/superclustra; komercialni složji pomenijo tisoče pinov.
6. **Strežniški dostop ponudnikov** — 0 API ključev, 0 adapterjev, brez proračunskih omejitev na ponudnika.
7. **Zapis o poslovanju (bookingMode)** — ne obstaja.
8. **PoiModal → plan gumb** — ni povezan (mehanizem obstaja v chat-add-place).
9. **Zastareli viri podatkovna stran** + 4 vzporedni registri ponudnikov.

---

## 5. MATRIKA ZMOŽNOSTI PONUDNIKOV (preverjeno 18. 9. 2026, uradni viri)

> Lega verdiktov: **SLOŽJE-PRIPRavljen** = realni inventar + geo + cene → zemljevidni sloj · **SAMO KARTICA** = brez lastnih geo/API podatkov, a produkt-nivo globokih povezav → kartica/panel · **SAMO PREUSMERITEV** = destinacijska raven affiliate povezava · **VIR PODATKOV** = dopolnitev lokalnega OSM sloja.

| Ponudnik | Dostop (2026) | Produkti prek API | Geo | Cene | Razpoložljivost | Slike/ocene | Globoka povezava produkta | Predpomnilnik (pogoji) | Verdikt | Zaupanje |
|---|---|---|---|---|---|---|---|---|---|---|
| **Booking.com** | Partner API (Demand API v3.2) — **samo pogodbeni »Managed Affiliate Partner«** (affiliate prijava → Partner Centre → ključ) | nastanitve (GA), najem avtomobila, prevozi; atrakcije = BETA (zaprt pilot) | lat/lng nepremičnine ✔ | žive ✔ | žive ✔ | ✔ / ✔ (recenzije endpoint) | redirect pretok + pomoč za pomoč (pomoč pri izgradnji povezav) | brez številčnega TTL — »odgovornost za aktualnost« | **SLOŽJE-PRIPRavljen (pogojno)**; brez odobritve SAMO KARTICA | visoko |
| **Viator** | **Brezplačni affiliate API tier** (prijava partnerresources.viator.com; 4 ravni dostopa; sandbox z produkcijskimi inventarji) | 300k+ tur & aktivnosti | center destinacije lat/lng; atrakcije POI; **brez bbox parametra** | žive ✔ | žive ✔ (/availability) | ✔ / ✔ (vključno s TripAdvisor) | ✔ `productUrl` + ID kampanje | availability ≥1 h osvežitev; modified-since 15 min | **SLOŽJE-PRIPRavljen** (Ljubljana destId 5257) — najboljše razmerje trud/vrednost | visoko |
| **GetYourGuide** | Partner API — odobritev (partner.getyourguide.com; token X-ACCESS-TOKEN; ravni BASIC/LIMITED_READ/READ/BOOKING) | 75k+ aktivnosti | **geo-polmer iskanje** `coordinates[]` + koordinate tura ✔ | žive ✔ + razčlenitev cen | žive ✔ | ✔ / ✔ (skupna ocena, št. ocen) | ✔ `url` s partner_id v vsakem izdelku | »ni scrapinga/predpomnjenja« → na zahtevo + kratek privatni predpomnilnik; 130 klicev/min | **SLOŽJE-PRIPRavljen** (najboljša geo iskanja) | visoko |
| **Tiqets** | Partner API (Distributor API v2.7, api.tiqets.com) — affiliate prijava → pregled → API + vodja računa; javna dokumentacija developers.tiqets.dev | muzeji/atrakcije/vstopnice | **lat/lng + max_distance** ✔ + naslov prizorišča ✔ | žive ✔ | žive ✔ (koledar, odpiralni časi) | ✔ / ✔ (recenzije — **zahtevana branding oznaka Tiqets + noindex**) | ✔ `product_url` + `product_checkout_url` | tedenska osvežitev produktov priporočena; 15 zahtevkov/s | **SLOŽJE-PRIPRavljen** (vstopnice/atrakcije) | visoko |
| **KiwiTaxi** | **Self-serve affiliate + JAVNI CSV podatkovni API** (kiwitaxi.com/en/partner — brez pogodbe) | prevozi: 110+ držav, 7k+ mest | ✔ **WKT POLIGONI mest/pristanišč/vpostaj** + IATA | **objavljene realne cene po razredu vozila** (LJU transfer €51–166) | objavljeno (ne živi citat) | ✔ slike vozil / ocene samo widget | ✔ `/transfers/{id}?pap=`; iskanje po koordinatah! | CSV zapisi — lokalna shramba, periodična osvežitev (cron) | **SLOŽJE-PRIPRavljen** (transferji; 992 SI rut) — živo dokazano | visoko |
| **DiscoverCars** | Samostojna prijava affiliate (bannerji, pomoč za izgradnjo povezav) / B4B raven iskanja API (odobritev) | primerjalni vozni park 800+ | neznano (zaprta dokumentacija) | žive samo prek B4B | žive samo prek B4B | vozila/dobavitelji neznano | ✔ globoka povezava lokacija+datumi; piškotek 365 d | ni javno | **SAMO KARTICA** (B4B = sloj, če odobren) | visoko (affiliate) / srednje (API) |
| **Skyscanner** | Partnerski API — **samo uveljavljena podjetja** (partners.skyscanner.net); affiliate prek Impact (>5k obiskovalcev/mes) | leti/hoteli/avto živi citati + Geo API (letišča/mesta) | letišča/mesta ✔ | žive ✔ | žive ✔ | ✔ / ✔ | ✔ obvezen pogoju API; affiliate globoka povezava | žive cene = seje (ne shranjevanje); indikativne za brskalne strani | **SAMO KARTICA** (API maloverjeten za naš obseg) | visoko |
| **Omio** | Affiliate (Impact) vključno »Search API« (spec po sprejemu; 14 dni pregled); B2B Meta Search API (komercialno) | vlaki/avtobusi/trajekti/leti | **samo mesta** (brez lat/lng) | žive na povezavo ✔ | žive ✔ | — / — | ✔ globoka povezava na povezavo | ni dokumentirano | **SAMO KARTICA** (složno, če Search API odobren; geometrijo geokodiramo sami) | srednje |
| **Airalo** | Partner REST API (partners.airalo.com — trgovec/preprodajalec) ali affiliate (~10 %) | eSIM paketi 200+ destinacij | **samo država** (country_code) | net + MRP multicurrency ✔ | zastava zaloge ✔ | ✔ / — | API prek naročil; affiliate povezava ločeno | 80 zahtevkov/min; paketi ~24 h | **SAMO KARTICA** (državni nivo: »eSIM od €X«) | visoko |
| **World Nomads** | Affiliate-only (Partner Network, CJ; plačilo po ponudbi) | zavarovanje | — | — | — | — | samo sledene povezave na obrazec | — | **SAMO PREUSMERITEV** | visoko (negativno) |
| **SafetyWing** | Affiliate-only (Ambassador 10 %); Platform Partners = B2B sestanki | zavarovanje | — | — | — | — | sledene ambassador povezave | — | **SAMO PREUSMERITEV** | visoko (negativno) |
| **Travelpayouts** (agregator) | **Self-serve API + marker** (podpora.travelpayouts.com API kategorija) | predpomnjeni najcenejši leti (po ruti/datumu), Hotellook hotelski izbori, slovarji mest/letišč s koordinatami, **Partner links API** (pretvorba URL-jev v affiliate) | mesta/letišča ✔; hotelske lokacije ✔ | predpomnjene ✔ | predpomnjene | delno / — | ✔ (marker) | uradno priporočilo: predpomnjenje za generiranje strani | **VIR PODATKOV + SLOŽJE-PRIPRavljen** (cene letov/hotelov sloj, kjer smiselno) | visoko |
| **Foursquare Open Places** | **Odprti PODATKI** (100M+ POI; portal Iceberg katalog; HF dataset) | POI: hoteli/restavracije/atrakcije s koordinatami, urami, kategorijami | ✔ lat/lng | — (brez cen) | — | — / — | — | Apache 2.0 + obvezna atribucija; mesečna osvežitev izdaje | **VIR PODATKOV** (dopolnitev OSM sloja restavracije/hoteli) | visoko |
| **STO slovenia.info** | Odprta vsebina llms.txt (brez JSON/geo vira) | besedila opisov | — | — | — | — | povezave na uradne strani | — | **VIR PODATKOV (samo besedilo)** — že integriran kot T2 | srednje-visoko |
| **Google Places** | Javni API, a ToS §3.2.3(e) **prepoveduje prikaz na ne-Google zemljevidu** | — | — | — | — | — | — | — | **NI-PREMOGLJIVO — izključen** | visoko |

---

## 6. LICENCE & POGOJI — KLJUČNE OBAVEZNOSTI

1. **OSM (ODbL):** obstoječa atribucija `© OpenStreetMap` ✔; zemljevidne ploščice + Overpass že skladno.
2. **Google Places:** §3.2.3(e) »No Use With Non-Google Maps« — izrecna prepoved prikaza Places vsebine na OSM/Leaflet → **arhitekturno izključen**, dokumentirano.
3. **Foursquare OS Places:** Apache 2.0 z obvezno atribucijo Foursquare — atribucijo držimo LOČENO od OSM (dve ločeni vrstici zasluge).
4. **Tiqets:** odseki ocen morajo nositi logotip Tiqets + noindex; upoštevati `marketing_restrictions` po produktu.
5. **GetYourGuide:** izrecno odvračajo od predpomnjenja/scrapinga → na zahtevo iskanja + kratek privatni TTL (5–10 min), spoštovanje 130/min.
6. **Viator:** availability ≥1 h osvežitev; vsebina prek modified-since 15 min.
7. **Booking.com:** affiliate pogodba; caching brez številčnega TTL (»odgovornost za aktualnost«) — TTL določi vodja računa.
8. **Skyscanner:** žive cene samo za generiranje rezervacij (redirect obvezen), indikativne cene za brskalne prikaze.
9. **Travelpayouts:** marker v povezavah obvezen; predpomnjenje uradno priporočeno.
10. **EU affiliate razkritja:** obstoječa §4 pogoji-uporabe + `rel="sponsored"` vzorec se razširi na nove kartice; VSOTA: nobena lažna razpoložljivost/cena brez vira.

---

## 7. PREDLAGANA PRODUKCIJSKA ARHITEKTURA

### 7.1 Skica toka podatkov

```
OSM/Overpass + FSQ OS + STO (lokalni viri)          Partner API-ji (strežniška stran)
        │                                                   │
        ▼                                                   ▼
  LocalPoiAdapter ──────────┐                    SupplyAdapter implementacije
                            │                     (viator, getyourguide, tiqets,
                            │                      kiwitaxi, booking, airalo, tp, …)
                            ▼                                   │
                 ┌─────────────────────────┐                     │
                 │  NORMALIZACIJA →        │ ◄───────────────────┘
                 │  kanonski ProviderProduct│
                 └───────────┬─────────────┘
                             ▼
              /api/supply/search  (bbox, zoom, cats, date, pax)
              · per-provider TTL predpomnilnik + rate proračun
              · dedupe (geo-hash + normalizirano ime)
              · zoom-gating gostote · degeneracija (OSM vedno na voljo)
                             ▼
        Zemljevid: složji/kategorije + grozdenje + kartice produktov
                             ▼
        Kartica produkta → »Dodaj v moj načrt« (AI itinerary kontekst)
                             ▼
        bookingMode: affiliate_redirect (/go/[provider] z ID-jem produkta)
                     | api_bookable | info_only | own_marketplace
```

### 7.2 Kanonski model `ProviderProduct` (specifikacija, ne implementacija)

```ts
type ProviderSlug =
  | 'osm' | 'fsq' | 'sto'                      // lokalni viri
  | 'booking' | 'viator' | 'getyourguide' | 'tiqets'
  | 'kiwitaxi' | 'discovercars' | 'skyscanner' | 'omio'
  | 'airalo' | 'worldnomads' | 'safetywing'
  | 'travelpayouts' | 'own'                    // lastni marketplace

type ProductType =
  | 'accommodation' | 'activity' | 'tour' | 'ticket' | 'attraction'
  | 'car_rental' | 'transfer' | 'transport' | 'flight'
  | 'esim' | 'insurance' | 'restaurant' | 'poi'

type BookingMode = 'affiliate_redirect' | 'api_bookable' | 'info_only' | 'own_marketplace'

interface ProviderProduct {
  id: string                     // `${provider}:${providerProductId}`
  provider: ProviderSlug
  providerProductId: string
  type: ProductType
  subcategory?: string
  title: string
  description?: string
  lat?: number
  lng?: number
  geoPrecision?: 'exact' | 'city' | 'destination_center' | 'country' | 'route'
  address?: string
  image?: string
  rating?: number                // 0–5, izključno iz vira ponudnika
  reviewCount?: number
  price?: { amount: number; currency: 'EUR'; unit: 'total'|'per_person'|'per_day'|'per_vehicle' }
  availability?: { live: boolean; note?: string }
  bookingMode: BookingMode
  bookingUrl?: string            // VEČINOMA prek /go/[provider]?product=… (strežniška izgradnja)
  sourceUrl?: string
  lastUpdated: string            // ISO 8601
  license?: { source: string; attribution?: string }   // OSM/FSQ/Tiqets-branding …
}
```

### 7.3 Enotni register ponudnikov (konec 4 vzporednih registrov)

```ts
interface ProviderRegistryEntry {
  slug: ProviderSlug
  label: { sl: string; en: string }
  envKeys: string[]                       // obstoječi affiliate ID + novi API ključi
  capabilities: {
    search: boolean
    geo: 'bbox' | 'radius' | 'city' | 'country' | 'none'
    livePrices: boolean
    availability: boolean
    images: boolean
    reviews: boolean
    deepLink: 'per_product' | 'per_search' | 'none'
    booking: 'redirect' | 'api' | 'none'
  }
  minZoom: number                         // pri katerem zoom-u se sloj prikaže
  cacheTtlMs: number                      // izračunano iz pogojev (razdelek 6)
  rateLimit: { max: number; windowMs: number }
  failClosed: boolean                     // brez ključa → sloj skrit, ne lažen
}
```

En sam vir resnice: `AffiliateProvider` union, `buildPartnerUrl`, `ALLOWED_HOSTS`, admin oznake — vsi izpeljani iz registra. `/vir-podatkov` generiran iz registra (samodejno odpravljanje odmikanja).

### 7.4 `SupplyAdapter` vmesnik (vzorec: overpass.ts + road-routing-server.ts + ai-client.ts)

```ts
interface SupplyQuery {
  bbox?: [number, number, number, number]   // lat1,lng1,lat2,lng2 (viewport)
  zoom: number
  cats: ProductType[]
  date?: string                             // ISO datum (check-in / aktivnost)
  pax?: number
  currency?: 'EUR'
  locale?: 'sl' | 'en'
}

interface SupplyAdapter {
  slug: ProviderSlug
  search(q: SupplyQuery): Promise<ProviderProduct[]>   // normalizirano ZAvedno
  health(): { ok: boolean; breakerOpenUntil?: number }
}
```

Skupne lastnosti adapterjev: poskusi+varovalke (kot OSRM), TTL predpomnilnik (kot road-routing), časovni budget (kot overpass), strežniški ključi izključno v env, AIUsageLog zapis uspehov/latence/izvora na klic.

### 7.5 `/api/supply/search` — obnašanje

- **Zoom-gating gostote:** zoom < 8 → samo števci na destinacijo (badge »36 aktivnosti v okolici«); 8–12 → top-N po destinaciji (npr. 5 z najboljšo oceno/ceno); > 12 → polni markerji znotraj viewport bbox.
- **Dedupe:** OSM hotel + Booking hotel → en pin z dvema viroma (razširitev obstoječega provenienčnega vzorca), ključ = geo-hash ~100 m + normalizirano ime.
- **Degradacija:** ponudnik neuspešen/omejen → sloj izostane, odgovor nosi `degraded[]`, OSM ostane vedno.
- **Zaupanja vredno iskanje:** prazni rezultati so izrecni (`count: 0` + `note`), nikoli izmišljeni.
- Rate limit: 30/min/IP (enako `/api/pois`); odgovor `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` na strani CDN.
- Telemetrija: `supply_query` (ponudniki, števci, ms, predpomnjeno), `supply_layer_toggled`, `supply_product_viewed`, `supply_add_to_plan`, `supply_booking_click` (razširitev obstoječega `affiliate_click` z productId).

### 7.6 Složji na zemljevidu — končni prikaz

| Sloj | Vir | Stanje |
|---|---|---|
| atrakcije/muzeji/razgledi/narava/versko/trgovine | OSM (obstoječe) | danes ✔ |
| restavracije | OSM + morebitna FSQ dopolnitev | danes ✔ (FSQ = faza 1) |
| aktivnosti/ture/izleti | Viator + GetYourGuide (markerji) | faza 3 |
| vstopnice/atrakcije | Tiqets (markerji prizorišč) | faza 3 |
| transferji | KiwiTaxi (route/pickup točke, WKT) | faza 2 |
| nastanitve | Booking (markerji, ko Demand odobren) | faza 4 |
| leti | Travelpayouts indikativne cene (kartice na destinacijo, ne pinov) | faza 4 |
| najem avta / transport / eSIM / zavarovanje | kartice v supply panelu (DiscoverCars/Omio/Skyscanner/Airalo/WN/SW) — brez lažnega geo | faza 3–4 |

Pomembna iskrenost: dokler partner API ni odobren, sloj NE obstaja (fail-closed) — uporabniku se ne prikažejo prazni složji, ampak odsotni.

### 7.7 Kartica produkta → načrt → rezervacija

1. **ProductCard** (modal/stranski): slika, ocena (vir), cena (valuta/enota), razpoložljivost (živo/predpomnjeno/objavljeno — razkritje!), gumb »Dodaj v moj načrt« + gumb rezervacije.
2. **Dodaj v načrt:** razširitev `chat-add-place.ts` → nov postanek z `providerProductId`, provenienca `provider:viator`, izdatke po osebi v proračun dneva; AI kontekst (ai-context.ts) prejme ProviderProduct vrstice (SYSTEM_DATA_GUARD).
3. **Rezervacija:** `/go/[provider]?product={id}&dest=&date=&pax=` → strežniška izgradnja globokih povezav iz registra (Viator productUrl, GYG url, Tiqets product_url, KiwiTaxi /transfers/{id}?pap=, Booking aid povezava) → obstoječa 302 + `affiliate_click` telemetrija z novim `productId`.

---

## 8. FAZNI IMPLEMENTACIJSKI NAČRT

### Faza 0 — PRIJAVE (takoj, vzporedno s F1; 0 kode)

| Ponudnik | Akcija | Pričakovani čakalni čas |
|---|---|---|
| KiwiTaxi | prijava affiliate (pap ID) — podatkovni API je že javen | dni |
| Travelpayouts | registracija → marker + API token | dnevi |
| Viator | prijava partnerskega programa (affiliate tier) | 1–2 tedna |
| Tiqets | affiliate prijava → vodja računa | 1–3 tedni |
| GetYourGuide | prijava partner.getyourguide.com | tedni |
| Booking.com | affiliate prijava → zahteva Demand API (Managed) | tedni–meseci |
| DiscoverCars | affiliate prijava (Landing Page Generator) | dnevi |
| Omio | Impact prijava (GoEuro kampanja) + vprašanje za Search API | ~14 dni |
| Airalo | partnerska prijava (API) + affiliate vmesni čas | tedni |
| Skyscanner | Impact affiliate (kriterij >5k obiskovalcev/mes — preveriti) | tedni |
| FSQ OS Places | prenos SI podmnožice (Iceberg/HF) + hramba | dnevi |
| World Nomads / SafetyWing | obstoječi affiliate status zadostuje | — |

### Faza 1 — Fundacija (1–2 tedna razvoja)
1. Kanonski `ProviderProduct` + `ProviderRegistryEntry` (en register, izpeljava vseh obstoječih seznamov).
2. `SupplyAdapter` vmesnik + `LocalPoiAdapter` (OSM — implementacija `bbox`+zoom+cats na obstoječem overpass.ts) + `FsqAdapter` (lokalna kopija SI).
3. `/api/supply/search` z zoom-gatingom, dedupe, degeneracijo, telemetrijo.
4. Zemljevid UI: preklop na grozdenje (supercluster/leaflet.markercluster), sloji po kategorijah z `minZoom`, ProductCard.
5. PoiModal → »Dodaj v moj načrt« (povezava chat-add-place).
6. Posodobitev `/vir-podatkov` iz registra.

### Faza 2 — Prvi komercialni sloj (1 teden, self-serve brez odobritve)
1. **KiwiTaxi adapter**: cron reingest CSV (kraje+rute+transferji za SI) → Prisma shramba slojev → transfer sloj na zemljevidu s cenami; globoka povezava prek /go z `pap`.
2. **Travelpayouts adapter** (kjer smiselno): indikativne cene letov na destinacijo, slovarji mest/letišč.
3. AIUsageLog namestitev (vsak adapter klic = zapis).

### Faza 3 — Aktivnosti & transport (ko odobritve pridejo)
1. Viator adapter (sandbox najprej): aktivnosti po destinaciji, cene, productUrl; zoom-gated gostota.
2. GetYourGuide adapter (geo-polmer) + Tiqets adapter (vstopnice, branding ocen).
3. DiscoverCars/Omio/Skyscanner kartice v supply panelu (destinacija+datum+pax globokih povezav — datum/pax končno posredovan).

### Faza 4 — Nastanitve & dopolnilo
1. Booking.com Demand adapter (ko Managed status): nastanitve sloj z živimi cenami, dedupe proti OSM hotelom.
2. Airalo kartica (eSIM od €X), zavarovanja kartice (WN/SW — samo preusmeritev, iskreno).
3. ProductCard → načrt → AI kontekst popolna zanka + refiniranje z ProviderProduct.

### Faza 5 — Optimizacija & vlak
1. Rate proračuni na ponudnika + vezavne varovalke vseh adapterjev (enotni vzorec).
2. Admin nadzorna plošča oskrbe (števci slojev, svežina, napake) na obstoječem affiliate-stats vzorcu.
3. A/B gostote slojev, PWA offline složi (snapshot najboljših N na destinacijo), E2E testi adapterjev (enota + živi smoke na vzorcu affiliate-redirects.sh).

---

## 9. ODPRTA VPRAŠANJA ZA POTRDITEV (pred implementacijo)

1. **Obseg Faze 1:** začeti s fundacijo (adapterji+API+složji UI) takoj, medtem ko tečejo prijave? ✔/✗
2. **FSQ Open Places:** sprejemamo dopolnitev OSM sloja (restavracije/hoteli brez cen, Apache 2.0 + atribucija)? ✔/✗
3. **Travelpayouts:** uporaba kot self-serve vir cen (leti/hoteli) + nadomestilo za obstoječe TP passthrough povezave? ✔/✗
4. **Booking strategija:** prijava affiliate zdaj + zahteva Demand API (priporočam) — potrditev smeri?
5. **Prioriteta slojev:** transferji (KiwiTaxi, self-serve) pred aktivnostmi (Viator/GYG, čakanje na odobritev) — v redu?
6. **Zavarovanja:** ostanejo kartice SAMO PREUSMERITEV brez geo (ni API-ja) — sprejemamo?
7. **Letovišča/gostišča:** OSM + FSQ medtem (fiksni sloj brez cen) + Booking sloj kasneje?

---

## Priloga A — Viri raziskave (18. 9. 2026)

- Booking.com: developers.booking.com/demand/docs (prerequisites, attractions beta, accommodations search/details/reviews)
- Viator: docs.viator.com/partner-api/technical, partnerresources.viator.com (tiers, caching 15 min/hourly, Ljubljana d5257)
- GetYourGuide: github.com/getyourguide/partner-api-spec (access levels, coordinates[] radius, 130/min, no-caching policy)
- Tiqets: developers.tiqets.dev (Distributor API v2.7, lat/lng+max_distance, product_url, reviews branding), partners.tiqets.com
- DiscoverCars: discovercars.com/affiliate, pages.discovercars.com/b4b (tieri: widget/search/full/white-label)
- Skyscanner: developers.skyscanner.net (application required), partners.skyscanner.net/product/travel-api, affiliates (Impact, >5k/mes)
- Omio: omio.com/affiliate (Search API), omio.com/corporate/omio-b2b, app.impact.com GoEuro kampanja
- KiwiTaxi: kiwitaxi.com/en/partner/webmaster + /instructions/api (CSV endpointi: places WKT, routes, transfers, cene; pap param) — živo preizkušeno 18. 9. 2026
- Airalo: developers.partners.airalo.com (/v2/packages, net+RRP, 80/min), partners.airalo.com
- World Nomads: partner.worldnomads.com (pay-per-quote, CJ) — brez API dokumentacije
- SafetyWing: safetywing.com/ambassador, hello.safetywing.com/platform-partners — brez javnega API-ja
- Travelpayouts: support.travelpayouts.com/hc/en-us/categories/200358578-API-and-data, travelpayouts.github.io/slate (Flight Data Access v1/v2, Hotels Selections, slovarji s koordinatami, Partner links API, White Label)
- Foursquare OS Places: opensource.foursquare.com/os-places (Apache 2.0 + atribucija; Iceberg katalog prek Places Portal; Okt 2025 oznanilo)
- Google Places ToS: cloud.google.com/maps-platform/terms §3.2.3(e) (No Use With Non-Google Maps)

*Sestavljeno iz 6 vzporednih podagentnih revizij (40-a/b/c: sistemski audit; 40-r1/r2/r3: preverba uradnih API-jev). Brez spremembe kode.*
