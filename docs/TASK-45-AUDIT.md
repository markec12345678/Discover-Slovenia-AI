# TASK 45 AUDIT — FIRST REAL ACTIVITY PROVIDER: VIATOR

**Datum:** 18. 9. 2026 · **Verzija:** 1.50.0 · **Stanje:** GREEN (s pošteno klasifikacijo dostopa)
**Prejšnji:** docs/TASK-44-AUDIT.md (supply engine proof) · HEAD ob začetku: `51247d6`

---

## 0. ZADETJE V KRATKO

| Vprašanje | Odgovor |
|---|---|
| Je Viator pravi provider? | **DA — arhitekturno in pogodbeno.** Adapter je implementiran proti *živo preverjeni* uradni pogodbi (docs.viator.com, prebrana 18. 9. 2026 + Golden Path). NI mock, NI fake inventar, NI "samo affiliate redirect". |
| Teče živi inventar danes? | **NE — in to je ISKRENO dokumentirano.** Projekt nima partnerskega računa → `VIATOR_API_KEY` ni nastavljen → adapter vrne prazen sloj z opombo `not-configured` (0 klicev na vir). Živi dokaz: sandbox brez ključa = HTTP 401. |
| Kaj se zgodi, ko ključ pride? | Nastavi `VIATOR_API_KEY` v env → sloj Aktivnosti/Ture oživi **brez spremembe kode** (ista pot, isti kanonski model, isti testi). Ključ je **self-serve**: partnerski račun → Tools → Affiliate API → „Start your development" (uradni Golden Path). |
| Se je kanonski model spremenil? | **NE** (glavni gate). 0 viator* polj v `ProviderProduct`. Forward-compat iz Taska 44 drži — priklop = 1 factory vrstica (dokazano v testsuiti). |
| KiwiTaxi po implementaciji? | **Popolnoma delujoč** (živo E2E: Transferji 48, /go/transfers 302, produkti na mapi). |

---

## 1. DEJANSKO PREVERJENA VIATOR POGODBA (§2 — živi vir, ne spomin)

**Metoda:** uradna dokumentacija prebrana ŽIVO (curl 8,2 MB HTML iz
docs.viator.com/partner-api/technical) + uradni Golden Path vodnik
(partnerresources.viator.com) + spletna preverba uradnih virov + živi
klic na sandbox (dokaz 401). Vsa polja v `types.ts` so preslikana iz
uradnih primerov (Acadia/Edinburgh primeri spodaj).

### 1.1 Avtentikacija in dostop

| Vidik | Preverjena dejstva |
|---|---|
| Base URL | `https://api.viator.com/partner` (produkcija) / `https://api.sandbox.viator.com/partner` (sandbox — „All testing must be done in Sandbox") |
| Auth | glava `exp-api-key: <ključ organizacije>` na VSAKEM klicu; izda ga partner account manager; **Basic Access affiliate ključ je SELF-SERVE**: „Find your API key in your account dashboard … Tools → Affiliate API → Start your development … verify your email address" (Golden Path) |
| Obvezne glave | `Accept: application/json;version=2.0` (sicer 400 INVALID_HEADER_VALUE — preverjeno v živem primeru), `Accept-Language`, `Content-Type: application/json` pri POST |
| **ŽIVI DOKAZ DOSTOPA** | `POST api.sandbox.viator.com/partner/products/search` z invalid ključem → **HTTP 401 `{"code":"UNAUTHORIZED","message":"Invalid API Key"}`** (18. 9. 2026 17:51 UTC) → projekt NIMA dejansko aktivnega dostopa |
| Ravni dostopa | Basic-access / Full-access / Full-access+Booking Affiliate / Merchant (dostopna matrika po endpointih prebrana) |
| Basic Access endpointi | `/products/search` ✅, `/products/{product-code}` ✅, `/products/tags` ✅, `/attractions/search` ✅, `/availability/schedules/{product-code}` ✅, `/search/freetext` ✅, `/destinations` ✅, `/locations/bulk` ✅, `/exchange-rates` ✅ — NE pa `/products/modified-since`, `/availability/check`, bookings |

### 1.2 POST /products/search ( jedro našega adapterja)

Zahteva (uradi primer):
```json
{
  "filtering": { "destination": "732", "tags": [], "flags": [], "lowestPrice": 5, "highestPrice": 500, "startDate": "2023-01-30", "endDate": "2023-02-28", "confirmationType": "INSTANT", "durationInMinutes": {"from":20,"to":360}, "rating": {"from":3,"to":5} },
  "sorting": { "sort": "TRAVELER_RATING", "order": "DESCENDING" },
  "pagination": { "start": 1, "count": 5 },
  "currency": "EUR"
}
```
- `destination` = **destinationId kot NIZ** — iskanje je PO DESTINACIJI, **NE po bbox** (dokumentirana omejitev; naročnik §9: „ne pretvarjaj destination searcha v lažen bbox")
- `currency`: zahtevamo **EUR** (41 podprtih valut; „all pricing will be denominated in the response" v zahtevani valuti)
- Affiliate query parametra: `campaign-value`, `target-lander` (NE uporabljamo — productUrl že vsebuje pid/mcid)
- Pogodba: „must not be used to ingest the catalog" (samo uporabniške poizvedbe — točno naš viewport primer) in „only active products are returned"

Odgovor ProductSummary (uradi primer Acadia — Golden Path):
`productCode`, `title`, `description`, `images[{imageSource, caption, isCover, variants[{width,height,url}]}]`, `reviews{sources[{provider, totalCount, averageRating}], totalReviews, combinedAverageRating}`, `duration{fixedDurationInMinutes}`, `confirmationType`, `itineraryType`, `pricing{summary{fromPrice, fromPriceBeforeDiscount}, currency}`, `productUrl` (affiliate globoka povezava z `mcid`/`pid`/`medium=api`), `destinations[{ref, primary}]`, `tags[]`, `flags[]`, `translationInfo`.

### 1.3 GET /destinations

- Odgovor: `{destinations: DestinationDetails[], totalCount}`; DestinationDetails: `destinationId, name, type (CITY|COUNTRY|REGION|…), parentDestinationId, lookupId, defaultCurrencyCode, timeZone, center{latitude, longitude}, destinationUrl, iataCode`
- Pogodba: „Destinations should be refreshed **weekly**"; „You must store a local copy of this mapping" → naš 7-dnevni predpomnilnik + single-flight

### 1.4 Geo semantika (§8)

- Produkt NIMA lastnih lat/lng — nosi `destinations[].ref`
- Pin produkta = **center destinacije** → `geoPrecision: "destination_center"` (kanonski enum OBSTOJI — nič novega)
- Natančen meeting point: produkt DETAIL `logistics.start[].location.ref` → `/locations/bulk` (TRIPADVISOR provider da geo; GOOGLE zahteva lasten Google Places API — NE uporabljamo)
- **Ne prikazujemo centroida destinacije kot meeting pointa** — kanonska polja to onemogočajo po konstrukciji

### 1.5 Cena (§11)

- `pricing.summary.fromPrice` = **„od"-cena** — uradni spec (apis.guru mirror uradne OpenAPI): „the 'From Price', which is the **lowest possible price for an adult**"; partnerresources: „This value can be used to advertise a 'from' price"
- Kategorija cene **PER_PERSON vs UNIT** (na skupino/vozilo) je v produktu DETAIL (`pricingInfo.type`) — **NI v iskalnem povzetku**
- Zato: `unit: "per_person"`, `fromPrice: true`, opomba „od-cena (najnižja, navadno na osebo)" — odkriva izjemo UNIT produktov; **cena ≠ razpoložljivost** (regresijski test)
- Ne-EUR kljub zahtevi → ceno NE preslikamo (ne pretvarjamo, ne lažemo)
- Opozorilo vira: uporabnik vidi na viator.com svojo lokalno valuto — izpišemo EUR, vir potrdi končno ceno

### 1.6 Razpoložljivost (§12)

- Basic Access **NIMA** `/availability/check` (Full-access+ tier) → `status: "unknown"` + opomba „razpoložljivost se preveri pri ponudniku"
- To je NATANČNO semantika našega enuma: vir ima koncept, mi ga pri svojem tierju ne moremo preveriti (≠ `not_supported` pri KiwiTaxi CSV, ≠ `live_available` kar bi bila laž)

### 1.7 Jeziki

- Podprti Accept-Language: en, da, nl, no, es, sv, fr, it, de, pt, ja (+zh/ko samo merchant). **sl-SI NI podprt** → adapter VEDNO zahteva `en-US`; vsebina vira je EN, lastne oznake/čipi so dvojezični (dokumentirana omejitev)

### 1.8 Rate limiti (pogodba)

- Okno **10 s PO ENDPOINTU**, šteto na partnerski račun; glave `RateLimit-Limit/Remaining/Reset`; 429 z `Retry-After` (endpoint) ali brez glav (skupni kap → eksponentna pavza)
- Reviews: max 30 req/min; „More frequent updates will place an excessive burden … may result in your integration being shut off" (15–30 min polling za modified-since)
- Naša disciplina: ≤ 3 iskanja/poizvedbo, sekvenčno, + registrovni `maxCallsPerMin: 20` (≤ 60 klicev vira/min najslabše; dovoljena meja vira ~150/10 s na endpoint) + negativni predpomnilnik okvar 60 s

### 1.9 Predpomnjenje (§10 — NE izmišljeni TTL)

| Kaj | Politika | Vir trditve |
|---|---|---|
| /destinations taksonomija | 7 dni | „Destinations should be refreshed weekly" |
| Iskalni rezultati (viewport) | 10 min (register `cacheTtlMs`) | konservativno znotraj pogodbe (15–30 min dovoljeno za vsebinske deltе; žive cene → krajše) |
| productUrl predpomnilnik (/go) | 24 h | poti URL-jev stabilne; osvežujejo jih nova iskanja |
| Negativni predpomnilnik okvar | 60 s | vljudnost (Task 44-b vzorec) — vir NE dobi zaporednih 401/429/5xx |
| Coalescing | sočasne enake poizvedbe → 1 izvedba | Task 44-b vzorec |

### 1.10 Atribucija in pogoji prikaza

- Slike: source URL-ji (media-cdn.tripadvisor.com), `imageCredit: "© Viator"`, `license: {source: "Viator Partner API", attribution: "© Viator"}` — **NIKOLI lasten storage/kopija** (hotlink, licenčna čistost — ista disciplina kot OSM/Wikimedia)
- `translationInfo.containsMachineTranslatedText` — ne uporabljamo strovnih prevodov (zahtevamo en-US)
- **NO-INDEX politika (pomembno):** „Pages generated using data from [attractions] endpoint are subject to a strict no-index policy … no Viator Unique Content is indexed" — naš zemljevid renderira supply plast **klientsko** (JS fetch → Leaflet markerji; NI strežniško generiran HTML z vsebino), zato politike ne kršimo. Dokumentirano za bodoče: če kdaj strežniško renderiramo vsebino iz `/attractions/*`, OBAVEZNO noindex.
- Affiliate program: 8 % končane rezervacije, piškot 30 dni (najdaljši v portfelju); prijava partnerresources.viator.com (tudi ShareASale/Travelpayouts)

---

## 2. CAPABILITY GATE (§3 — iskrena klasifikacija)

```
┌────────────────────────────────────────────────────────────────────┐
│ VIATOR — DEJANSKO STANJE (18. 9. 2026, živo preverjeno)             │
├────────────────────────────────────────────────────────────────────┤
│ API contract : VERIFIED (docs.viator.com prebrana ŽIVO + Golden     │
│                Path; vsa polja iz uradnih primerov)                 │
│ API access   : NOT_CONFIGURED — VIATOR_API_KEY ni nastavljen        │
│                (živi dokaz: sandbox = HTTP 401 Invalid API Key)     │
│ data         : NOT_CONFIGURED (adapter = pripravljena               │
│                infrastruktura; ko ključ pride → LIVE search)        │
│ availability : capability-dependent — Basic Access NIMA             │
│                /availability/check → izdajamo "unknown"             │
│ booking      : affiliate_redirect (/go/viator?product=) —           │
│                KONFIGURIRANA koda, NEKONFIGURIRAN partner URL       │
│ monetization : unconfigured (VIATOR_AFFILIATE_URL prazen; /go/viator│
│                → čista povezava, monetized:false — fail-closed)     │
└────────────────────────────────────────────────────────────────────┘
```

**Ne enačimo:** API dostop ≠ razpoložljivost ≠ rezervacija ≠ monetizacija —
vsaka vrstica ima svoje stanje. Register to zrcali: `status: "affiliate"`
(dejansko stanje DANEŠ), `inventoryAccess: ["affiliate_deep_link"]`
(samo to IMAMO), `active: true` (adapter priklopljen — runtime gate varuje
iskrenost), `capabilities` opisujejo POGODBO (kaj adapter dostavi, ko
ključ pride).

**LIVE gate NI lažno zelen:** adapter brez ključa vrne `[]` + opombo
`not-configured` (vidna v `/api/supply/search` telemetriji in provider
panelu — živo E2E dokazano spodaj). Naročnikova zahteva §2: „adapter lahko
ostane pripravljena infrastruktura, vendar LIVE gate ne sme biti lažno
zelen" — izpolnjeno.

---

## 3. ARHITEKTURA IMPLEMENTACIJE

```
src/lib/supply/providers/viator/
├── types.ts       — pogodbene vrste (iz uradne sheme) + fail-safe
│                    validacijski vzorci (isViatorProductSummary …)
├── client.ts      — ViatorClient: exp-api-key + Accept verzija 2.0 +
│                    Accept-Language en-US (sl NI podprt) + timeout +
│                    abort + klasifikacija napak (unauthorized/rate-
│                    limited/server/network/timeout/…) + 429 Retry-After;
│                    DI fetch za teste; env: VIATOR_API_KEY, VIATOR_API_BASE
├── destinations.ts— taksonomija (7-dnevni cache + single-flight),
│                    ujemanje naših 22 kanonskih destinacij z Viator
│                    imeni (normalizacija diakritik, prednost tipa CITY),
│                    slovensko poddreveso pod COUNTRY, viewport izbira
├── mapper.ts      — ViatorProductSummary → ProviderProduct (kanonska
│                    preslika; 0 viator* polj) + productUrl predpomnilnik
│                    (24 h) za /go razrešitev globokih povezav
└── adapter.ts     — SupplyAdapter: capability gate → viewport →
│                    destinacijska iskanja (≤ 3) → dedupe/kap → izid;
│                    pozitivni cache (TTL registra) + negativni (60 s) +
│                    coalescing
```

Priklop: `search.ts` ADAPTER_FACTORIES `viator: createViatorAdapter`
(1 vrstica — forward-compat dokaz Taska 44 drži).

### 3.1 Viewport → poizvedba (dokumentirana omejitev §9)

1. Katere od naših destinacij ležijo v bbox (naše koordinate = avtoriteta zemljevida)
2. **1–3 v pogledu** → iskanje PO TEH destinacijah (≤ 3 klicev, 24 produktov/destinacijo)
3. **≥ 4 v pogledu** (širok/državni z10) → **ENO državno iskanje** „Slovenia" + krajevni post-filter pinov na bbox (pin = vedno center lastne primarne destinacije produkta)
4. 0 v pogledu (morje/meja) → državno iskanje (pokrije); brez države v taksonomiji → pademo na ≤ 3 mesta
5. Dedupe po productCode; kap 48; sort TRAVELER_RATING (razvrščanje VIRA, ne lastno)

**Zoom/cat gating (0 klicev, ko sloj izklopljen):** runner pokliče adapter
SAMO ko je activity/tour med vidnimi kategorijami (čipa sta privzeto
IZKLOPLJENA v UI — naročnik §9) IN zoom ≥ minZoom 10. Živo dokazano
(z9 → „zoom-gated", cats=transfer → „cat-gated", 0 fetch klicev).

### 3.2 /go/viator?product={productCode} veriga

1. Adapter predpomni `productUrl` iz vsakega iskanja (24 h, FIFO 500)
2. `/go/viator?product=` validira productCode (`^[A-Za-z0-9]{3,20}$` — uradni primeri „227717P1"; brez ločil → injekcija nemogoča) → `getViatorUrl(productId)`
3. Zadetek predpomnilnika → 302 na povezavo VIRA (pid/mcid vgrajen — monetized:true)
4. Zgrešek → `VIATOR_AFFILIATE_URL` (če konfiguriran) → sicer čista `https://www.viator.com/` (monetized:false — fail-closed, NIKOLI izmišljen product URL)
5. Izhodni host allowlist (obstoječi varnostni vzorec) + `affiliate_click` analitika z productId (razširjena s transfers-only na transfers+viator)

### 3.3 UI (ni provider-specific UI modela)

- Čipa **Aktivnosti/Ture** (Activities/Tours) v map-view — kanonska taksonomija (ikone/barve/oznake obstajajo že od F1), default OFF
- ProductModal/ProductCard/provider-panel so 100 % provider-agnostic (badge iz registra, cena z enoto, availability „Dostopnost neznana" že podprta)
- Provider plošča: Viator → „Povezava partnerja" + „aktiven sloj" + iskrena opomba

---

## 4. TESTI (455/455 — +65 novih)

| Datoteka | Pokritje |
|---|---|
| `viator-contract.test.ts` (33) | §5 kanonska čistost (0 viator* polj, tipi iz itineraryType, subcategory iz flags); §7 real-data-only (brez cene/ocen/slik → ODSOTNO, http slike zavrnjene, ne-EUR zavrnjen); §8 geo (destination_center, brez pina → brez geo); §11/§12 cena+razpoložljivost (fromPrice per_person+opomba; cena≠available regresija); §15 modal podprtje (bookingUrl /go, sourceUrl, licenca); §4 fail-safe (slab zapis ne sesuje); productCode meje zaupanja; taksonomija (ujemanja, viewport, pini, post-filter); klient (pogodbene glave, 401/429+Retry-After/5xx/ne-JSON/timeout, env) |
| `viator-adapter.test.ts` (32) | §2/§3 capability gate (brez ključa → [] + not-configured + 0 klicev; runner iskrenost; defaultAdapters 3; source-contract brez demo inventarja); §9 viewport (zoom-gated z9=0 klicev, cat-gated=0, no-bbox=0, ozek=1 mestno iskanje s pravilnim telesom, datum→startDate/endDate, širok=1 državno+post-filter, dedupe, slab zapis, kap 48); §10 cache (pozitivni TTL, taksonomija 1×, 401→negativni 60 s, PO KLJUČU, coalescing); §6 izolacija (401 → degraded=[viator], OSM živi); §16/§17 FIXED (toSelectedProduct, sanitize+kontekst [FIXED]+identiteta, insertProductStop imutabilnost, duplicate); §7 getViatorUrl (cache→monetized, fail-closed, affiliate URL, injekcija); /go/viator route (302/400/404, transfers regresija) |
| `supply-core.test.ts` (posodobljen) | registrske invariante za novo stanje: affiliate-only brez adapterja NI inventarja (izjema: runtime-gated adapter z živo preverjeno pogodbo); aktivni = osm+kiwitaxi+viator; viator invariante (status affiliate, envKeys.api, cacheTtlMs>0) |

**Mock disciplina:** testni mock je TEST-ONLY preslikava uradnih primerov
(dokumentirano v glavah obeh datotek) — identičen vzorec kiwitaxi testov
(fs injekcija) iz Taska 43. NI izmišljenega inventarja v produkcijski kodi
(source-contract test preverja).

---

## 5. ŽIVA E2E PREVERBA (agent-browser + curl, 18. 9. 2026)

| Preverba | Rezultat |
|---|---|
| `/api/supply/search?cats=activity,tour&z=12` | `viator ok=true count=0 note="not-configured" ms=1` — **0 klicev na vir** (brez ključa); osm/kiwitaxi cat-gated; degraded=[] ✓ |
| `/api/supply/search?cats=transfer&z=12` (Bled bbox) | **kiwitaxi 48 produktov** — KiwiTaxi popolnoma delujoč ✓ |
| Cache-Control | `public, s-maxage=60, stale-while-revalidate=300` — NI no-store regresija (viator TTL 10 min > 0) ✓ |
| /zemljevid (SL) | čipi „Aktivnosti", „Ture" (default OFF); vklop → **„Aktivnosti 0"** (iskren števec) ✓ |
| Provider panel | „Viator · Povezava partnerja · aktiven sloj · Partner API (Basic Access) — pogodba živo preverjena; API ključ še ni izdan (self-serve po registraciji). Danes samo affiliate povezava, sloj je pripravljen in iskreno prazen." ✓ |
| Plasti soobstajajo | **„Transferji 48" + „Aktivnosti 0"** hkrati (gruče 3) — izolacija v živo ✓ |
| /go/viator | brez product → 302 `https://www.viator.com/`; product brez cache → 302 (fail-closed); `javascript:alert(1)` → **400**; 21 znakov → **400** ✓ |
| /en/zemljevid | „Transfers, Activities, Tours" čipi ✓ |
| Mobilni 390 px | **0 px horizontalnega preliva**, footer prisoten ✓ |
| Napake strani/konzola | 0 (samo znana next-auth dev opozorila, predhodna) ✓ |

---

## 6. KANONSKA ČISTOST (§4/§5 — glavni gate)

- **0 sprememb `ProviderProduct`/`PriceInfo`/`SupplyQuery`/`SelectedProviderProduct`/`AdapterRunInfo`** (source-scan v testih: 0 viator* polj na preslikanih produktih)
- Priključitev = 1 union slug (obstajal od F1) + 1 register vnos (posodobljen) + 1 factory vrstica — **forward-compat formula Taska 44 drži v praksi**
- Edina razširitev vmesnika: `SupplyAdapter.lastRunNote?()` (OPCIJSKO — telemetrija iskrenosti „not-configured"/„capped"; nazaj kompatibilno: kiwitaxi/osm ne implementirata → nespremenjeno obnašanje)
- Taxonomy: activity/tour OBSTAJATA od F1 — **0 novih tipov, 0 Viator kategorij** (preslikava: ACTIVITY→activity; STANDARD/MULTI_DAY_TOUR/HOP_ON_HOP_OFF→tour; UNSTRUCTURED/neznan→tour)

---

## 7. AKTIVACIJSKA KNJIGA (ko bo ključ)

1. Registriraj partnerski račun: partnerresources.viator.com (affiliate program; prijava tudi prek ShareASale/Travelpayouts)
2. Dashboard → **Tools → Affiliate API → „Start your development"** → potrdi e-pošto → ključ (self-serve, uradni Golden Path)
3. Integracijsko testiranje na sandboxu: `VIATOR_API_BASE=https://api.sandbox.viator.com/partner` (pogodba: vsa testiranja MORAJO na sandboxu)
4. Produkcija: `VIATOR_API_KEY=<ključ>` (+ odstrani VIATOR_API_BASE) → deploy
5. Sloj Aktivnosti/Ture takoj prikaže žive produkte (adapter, cache, /go veriga — vse že nameščeno in testirano)
6. (Opcionalno) `VIATOR_AFFILIATE_URL` iz Viator Selectorja za panel kartico/primarno monetizacijo; productUrl iz API-ja nosi pid/mcid samodejno
7. Register po aktivaciji: `inventoryAccess` dodaš `search_api`, `status` → `search` (dokumentiran postopek — iskrenost registra)

---

## 8. OMEJITVE IN ODLOČITVE (dokumentirane)

1. **Destination-scoped, ne bbox** (pogodbena omejitev vira) — post-filter pinov pri državnem iskanju; pin vedno `destination_center`
2. **Vsebina vira v EN** (sl NI podprt) — lastne oznake dvojezične, naslovi/opisi vira EN
3. **unit per_person pri od-ceni** — uradni spec: „lowest possible price for an adult"; PER_PERSON/UNIT kategorija je samo v produktu DETAIL (izjemni UNIT produkti odkriti z opombo)
4. **availability unknown** (ne live_*, ne not_supported) — natančna semantika Basic Access tierja
5. **pax ne vpliva na iskalni povzetek** (končna cena se izračuna pri ponudniku ob rezervaciji; /products/search nima pax parametra)
6. **productUrl cache hladen zagon** — /go product klik brez predpomnjenga URL-ja pade na affiliate/fallback (ne izmišljujemo URL-ja produkta, ki ga ne poznamo); /api/supply/search klica pred klikom vedno napolni predpomnilnik v praksi
7. **Attractions no-index** — NE uporabljamo `/attractions/*` (edini endpoint s striktno no-index politiko); če ga kdaj priklopiš → obvezno noindex teh strani

---

## 9. VRATA

| Vrata | Rezultat |
|---|---|
| `bun test` | **455/455** (390 prej + 65 novih; 2 posodobljeni registrska testa za novo stanje) |
| `bun run lint` | **0 napak** |
| `tsc --noEmit` (src) | **0 napak** (3 predhodne izven src: skills/×2 + tailwind.config.ts — nedotaknjene, dokumentirane od Taska 44) |
| Dev strežnik | zagnan, 0 napak v dev.log (živi E2E zgoraj) |
| Produkcija | NI buildana v tem tasku (change je v strežniški knjižnici + 2 UI čipa; build varnost: isti vzorci kot Task 43/44 — lazy poti, brez novih velikih datasetov; naslednji build bo del rednega cikla) |

## 10. SLEDENJE NAPREJ (YELLOW)

1. **Registracija partnerskega računa Viator** (lastnik projekta) → ključ → aktivacija po §7 zgoraj — edina odprta točka za živi inventar
2. Po aktivaciji: preveriti live pin pozicije (destinacijski centri vs. pričakovani) in traveler-rating gostoto po slovenskih destinacijah
3. Eventualno: lazy product DETAIL ob odprtju modala (točen PER_PERSON/UNIT + meeting point iz logistics) — NOVA endpoint potrditev proti pogodbi pred implementacijo
