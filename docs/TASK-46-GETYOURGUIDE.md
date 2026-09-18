# TASK 46 — GETYOURGUIDE: TRETJI REALNI SUPPLY PROVIDER (revizijski dokument)

**Task:** 46 — Third Real Provider: GetYourGuide
**Datum:** 18. 9. 2026 (živo preverjeno)
**Verzija:** 1.51.0
**Prejšnji checkpoint:** b3d2246 (Task 45 §18–§33; 498/498 testov)

---

## 1. Scope

GetYourGuide kot TRETJI realni supply provider (za KiwiTaxi, Task 43 in Viator, Task 45). **NI mock, NI fake/demo inventar, NI samo affiliate redirect** — popoln adapter proti ŽIVO preverjeni uradni pogodbi GetYourGuide Partner API (OpenAPI specifikacija + uradni wiki). Ciljna veriga:

```
REAL GYG SOURCE → GYG Adapter → ProviderProduct → /api/supply/search
→ Activities/Ture layer → ProductCard/ProductModal → Add to my plan
→ FIXED AI itinerary item → validated /go/getyourguide booking/deep link
```

**Stroge meje (izpolnjene):** kanonski model `ProviderProduct` NESPREMENJEN (0 `gyg*` polj — source-scan test); KiwiTaxi + Viator popolnoma delujoča (regresija živo + testi); OSM nedotaknjen; FIXED izbira uporabnika neranljiva; brez četrtega providerja.

---

## 2. Uradna pogodba vira (živo preverjena — NE spomin)

Prebrano v polnosti 18. 9. 2026:
- **OpenAPI spec** `code.getyourguide.com/partner-api-spec/spec/api.yaml` + vse delne datoteke (`paths/tours.yaml`, `components/commons/{query,fields,objects}.yaml`, `components/schema/{tour,picture,location}.yaml`)
- **Uradni GitHub wiki** (repo `getyourguide/partner-api-spec.wiki` kloniran): Getting-started.md, Access-levels.md, Image-Formats.md, Making-a-booking.md, Home.md
- **Uradni primer odgovora** /1/tours (Catacombs t66985, Making-a-booking.md)

| Element | Pogodba |
|---|---|
| Base | `https://api.getyourguide.com/1/` (verzija v POTI; test: `https://api.gygtest.net`) |
| Auth | glavi `X-ACCESS-TOKEN` + `Accept: application/json` na VSAKEM klicu (stateless: še `currency` + `cnt_language`) |
| Živi dokaz | brez žetona = **HTTP 401, errorCode 2420 "The access token is invalid."** |
| Jezik | `cnt_language` — **sl NI podprt** → `en` (dokumentirano; hr JE, a ga NE uporabljamo) |
| Valuta | EUR podprt za prikaz; potrditev v `_metadata.exchange.currency` |
| Iskanje | `GET /1/tours` — **`coordinates[]` = [lat, lng, radius]** (medsebojno izključno s `q`); `q` = ime lokacije ali IATA (`iata:jfk`) |
| **Enota radija** | **UNKNOWN** — specifikacija NE dokumentira (primer: 10); adapter domneva km + post-filter (§9) |
| ID produkta | `tour_id` — celo število (spec TourId; `tour_code` je DEPRECATED — ne preslikamo) |
| Vsebina | `title`, `abstract` (teaser), `description` (full); `preformatted`: teaser/home/full — **BASIC tier SAMO teaser** |
| Cena | `price.values.amount` + `price.description` (PROSTO BESEDILO: 'individual', 'per person', 'per group', 'per Group up to 10 people'); dokumentirano: »Should be read as e.g. 'from XX.YY USD'« |
| Ocena | `overall_rating` (0–5) + `number_of_ratings` |
| Slike | `pictures[].url/ssl_url` s `[format_id]` prostorom (uradna tabela 156 formatov) + `copyright` (nullable) |
| Geo | `coordinates: {lat, long}` na produktu + `locations[]` (area/city/poi/…, urejene po pomembnosti) |
| Booking URL | `url` — uradna **Option 1** povezava: getyourguide.com Z `partner_id` samodejno priključenim žetonu (»booking will be attributed to your account«) |
| Tierji | BASIC/LIMITED_READ (katalog: /tours, /categories; samo teaser) → READ (+availability, price-breakdown) → BOOKING (+carts, bookings, payments) |
| Rate limit | **privzeto 130 klicev/min; ob presegu VSI klici BLOKIRANI 5 MINUT**; konfigurabilno po partnerju |
| Predpomnilnik | vir IZRECNO odvrača: »We encourage to access the API in real-time; please do not scrape the API in an attempt to cache its output.« |
| Paginacija | `limit` 1–500 (default 10) + `offset`; `_metadata.totalCount` |
| Sortiranje | `sortfield`: popularity (priporočila vira)/price/rating/duration + `sortdirection` |
| Dostop do API | NI self-serve (razlika od Viatorja): žeton izda **partner manager** po prijavi v partner.getyourguide.com |

---

## 3. Poverilnice / stanje zmožnosti (CAPABILITY GATE — iskren)

| Vidik | Stanje |
|---|---|
| Pogodba API | **VERIFIED** (živo preverjena: OpenAPI + wiki + živi 401) |
| Dostop do API / podatki | **NOT_CONFIGURED** (`GETYOURGUIDE_API_TOKEN` manjka — živi dokaz: 401 errorCode 2420; izdaja prek partner managerja, NE self-serve) |
| Razpoložljivost | `unknown` — odgovor ISKANJA je brez nje (endpoint /tours/{id}/availability je ločen in nad BASIC tierjem); cena ≠ dostopnost |
| Booking | `affiliate_redirect` (url vira z partner_id — uradna Option 1 pot; priključeno fail-closed) |
| Monetizacija | GETYOURGUIDE_PARTNER_ID (affiliate) neodvisen od API žetona; brez obeh → čista povezava (`monetized: false`) |

**NE enačimo** dostop ≠ razpoložljivost ≠ rezervacija ≠ monetizacija. Plast Aktivnosti/Ture je iskreno PRAZNA (`note: "not-configured"`, 0 klicev na vir — živo dokazano v browserju: chip „Aktivnosti 0"). Ko žeton pride v env, živi podatki stečejo BREZ spremembe kode.

---

## 4. Arhitektura adapterja

`src/lib/supply/providers/getyourguide/**` (vesa GYG logika — kanonski model čist):

- **client.ts** — HTTP klient: pogodbene glave (X-ACCESS-TOKEN + Accept), verzija v poti /1/, timeout 8 s + AbortSignal, klasifikacija napak (unauthorized/rate-limited/bad-request/not-found/server/network/timeout/aborted/invalid-response), DI fetch za teste. `GETYOURGUIDE_API_TOKEN` + `GETYOURGUIDE_API_BASE` (test: api.gygtest.net).
- **types.ts** — sheme vira (GygTour, GygToursResponse, …) + fail-safe validatorji (`isGygTour`, `filterValidTours`, `isGygTourId` `^\d{1,10}$`, `isValidGygCoordinates` — meje ISO 6709 iz specifikacije).
- **mapper.ts** — kanonska preslikava (§5–§15 spodaj) + `tour.url` predpomnilnik (24 h) za `/go`.
- **adapter.ts** — `SupplyAdapter` (search + telemetrija): capability gate, viewport→krog, post-filter, coalescing, negativni predpomnilnik (60 s / 310 s za 429).

Priklop: **1 factory vrstica** v `search.ts` + 1 register vnos + 1 affiliate builder + 1 /go validator + 4 testne datoteke. Formula Taska 44 (provider-agnostic priklop) drži pri TRETJEM providerju.

---

## 5. Kanonska normalizacija (ProviderProduct nespremenjen)

0 `gyg*`/`getyourguide*` polj (source-scan + objektni test). Preslikava:

| Vir | Kanonsko |
|---|---|
| `tour_id` | `providerProductId`; `id = getyourguide:{tour_id}` |
| `activity_type` | guidedTour/privateTour/multiDayTrip/dayTrip/hopOnHopOff/bundle/neznan→`tour`; waterActivity/workshopOrClass→`activity`; entryTicket/hostedTicket/ticket/cityCard→`ticket` (iskren tip — vstopniška ikona 🎟️); transfer→`transfer` |
| `activity_type` (snake_case) | `subcategory` (izpeljano iz vira) |
| `title`/`abstract` | naslov/opis vira (en — sl vir ne podpira; teaser tier); trajanje iz `durations` |
| `coordinates` | pin + `geoPrecision: "city"` (§9) |
| `locations[]` | `address` = prva city/poi lokacija (sicer locations[0]) |
| `price.values.amount` | `price: fromPrice:true` + enota iz `price.description` (§12) |
| `overall_rating`/`number_of_ratings` | `rating` (2 decimalki) + `reviewCount` (samo če > 0 in končno) |
| `pictures[0].ssl_url` | slika s `[format_id]`→132 (480×320) + `imageCredit: copyright vira ?? "© GetYourGuide"` |
| — | `availability: unknown + opomba` (cena ≠ razpoložljivost) |
| — | `bookingMode: affiliate_redirect`; `bookingUrl = /go/getyourguide?product={tour_id}` (NAŠA konstrukcija) |
| `url` | `sourceUrl` (validiran https + getyourguide.com/gygtest host) |

`tour_code` (DEPRECATED v viru) se NAMERNO ne preslika. Manjka v viru → polje ODSOTNO.

**Registarski `types: ["activity","tour"]`** = sloji, ki SPROŽIJO adapter (vrata v searchSupply); tip POSAMEZNEGA produkta ostaja iskren (ticket/transfer produkta dobijo svoje kanonske ikone v plasti). Dokumentirana ločitev vrednosti polja `types` (trigger) od `product.type` (iskrenost).

---

## 6. Geo semantika (§9/§10 — NE lažni bbox)

Vir isče **PO KROGU**: `coordinates[] = [lat, lng, radius]` (spec; medsebojno izključno s `q`). **ENOTA RADIJA = UNKNOWN** (spec ne dokumentira; primer 10). Adapter:

1. center = središče viewport bboxa;
2. radius = pol-diagonala bboxa v km × 1,25 (min 5, max 150) — **DOMNEVA km** (evropski/metrični vir), izrecno dokumentirana;
3. **post-filter**: produkti s koordinatami MORAJO ležati v bbox (varovalka: če je enota vira večja od km, odvečne pine ODSKRBI post-filter; če manjša, plast iskreno pod-fetča); produkti brez koordinat ostanejo (vir jih je geografsko uvrstil v krog).

Pin produkta = `tour.coordinates` = **PREDSTAVITVENA lokacija produkta** (uradni primer dokumentacije: koordinate središča Pariza za katakombski vstopniški produkt!) → `geoPrecision: "city"` (konzervativno iskreno; NIKOLI exact — meeting point je razkrit šele na strani ponudnika ob rezervaciji). Neveljavne koordinate (NaN/Infinity/izven ±90/±180/wrong type) → geo ODSOTNO.

---

## 7. Semantika cen (§12)

`price` = StartingPrice: dokumentirano »Should be read as e.g. 'from XX.YY USD'« → `fromPrice: true` VEDNO. Enota iz PROSTEGA BESEDILA `price.description` (uradni primeri):
- 'individual' / 'per person' → `unit: per_person` + standardna opomba od-cene;
- 'per group…' → `unit: total` + opomba „od-cena na skupino (vir)" (pomen ohranjen);
- odsotno/neznano → `per_person` + **razkrivajoča** opomba „od-cena (enota po viru)" (privzetek dokumentiran, NE tiho ugibanje).

Valuta: zahtevamo `currency=EUR`; potrditev v `_metadata.exchange.currency` (kdaj podan) — **ne-EUR → cene ODSOTNE** (ne pretvarjamo, ne lažemo). 0/negativno/NaN/Infinity → brez cene. **Cena ≠ razpoložljivost** (regresijski test).

---

## 8. Razpoložljivost (§13)

Odgovor ISKANJA (`/1/tours`) NE vsebuje razpoložljivosti — endpoint `/tours/{id}/availability` je ločen in nad BASIC tierjem. → VEDNO `availability: { status: "unknown", note }`. NIKOLI `live_available` (nisli preverili). Datum uporabnika (če je podan) pošljemo kot pogodbeno okno `date[]` (»tours that are offered on date«) — to zoži REZULTATE, a NI dokaz razpoložljivosti (dokumentirano).

---

## 9. Slike (§14)

`pictures[0]` (primarna; vir nima isCover zastavice), `ssl_url` predno `url` (https), `[format_id]` zamenjan z **132** (480×320 px, JPEG q80 — uradna tabela Image-Formats.md). Meja zaupanja: https + host `cdn.getyourguide.com`/`getyourguide.com`/`*.getyourguide.com` + uradni test domeni `*.gygtest.net`/`*.gygtest.com` (iz OpenAPI spec). `http`/`javascript:`/`data:`/tuj host → slika ODSOTNA. `copyright` vira (nullable) → `imageCredit`; sicer „© GetYourGuide". Brez slik → `image: undefined` (NI placeholderja).

---

## 10. Ocene / recenzije (§15)

`overall_rating` zaokrožen na 2 decimalki SAMO če je `number_of_ratings` končen in > 0 IN ocena končna v (0, 5]. 0 recenzij → brez ocene. **Infinity v number_of_ratings ujame Number.isFinite** ( odkrit in popravljen V TEGN tasku — test ga je ulovil pred produkcijo).

---

## 11. Predpomnilnik (§11 — PO POGODBI VIRA)

| Sloj | Politika | Razlog |
|---|---|---|
| Rezultati iskanj | **BREZ predpomnilnika** (zaporedna enaka poizvedba = NOV klic) | vir: »do not scrape the API in an attempt to cache its output« — nasprotje Viatorja (tam 10 min) |
| Coalescing | sočasni enaki poizvedbi delita ENO izvedbo | dedup sočasnih klicev, NE predpomnilnik izpisa |
| Negativni (okvare) | 60 s | vir z 401/5xx NE dobi zaporednih klicev (Task 44-b) |
| Negativni (429) | **310 s** | vir dokumentira 5-minutno blokado vseh klicev ob presegu |
| tour.url (za /go) | 24 h (kap 500, FIFO) | pot rezervacije (Option 1), NI inventar; poti URL-jev stabilne |

**POSL EDICA (dokumentirana):** `cacheTtlMs: 0` v registru → odgovor `/api/supply/search` postane `no-store` (dizajn: vsak AKTIVNI adapter s TTL 0 → no-store). OSM (10 min) in KiwiTaxi (24 h) imata SVOJA adapterjska predpomnilnika; brskalnik ima debounce 500 ms + abort — vpliv na UX minimalen. Iskrenost živega vira nad priročnostjo CDNa.

---

## 12. Rate limiti (pogodba)

Vir: privzeto **130 klicev/min; ob presegu VSI nadaljnji klici blokirani 5 MINUT** + monitoring »excessive usage in relation to bookings«. Naše ublažitve: **EN klic na poizvedbo** (limit 24); `maxCallsPerMin: 60` v registru (46 % limita vira); negativni predpomnilnik (60 s / 310 s za 429); coalescing; zoom ≥ 10 + sloj default OFF → 0 klicev; debounce 500 ms + abort + seq-guard v browser hooku. `GETYOURGUIDE_API_BASE` prepiše base (test integracija).

---

## 13. Integracija zemljevida (§10)

Čipa **Aktivnosti** + **Ture** (kanonska taksonomija, default IZKLOPLJENO). Sloj OFF ali zoom < 10 → 0 klicev na vir (živo: zoom-gate namig). Vklopljen + z ≥ 10 → **geo poizvedba po krogu** (center viewporta + radius) — za razliko od Viatorja (po destinaciji) je to DEJANSKA geo-semantika, bližje našemu bbox modelu; omejitve so dokumentirane v §6. Kap 24 produktov na poizvedbo (limit vira 1–500 — mi zavestno varčni). Dedupe po `id` (kanonski, čez-vir).

---

## 14. ProductModal / Add-to-plan / AI (§16–§18)

Modal: 100 % provider-agnostic (isti kot KiwiTaxi/Viator): naslov, opis (abstract + trajanje), lokacija (address hint), cena + enota + od-opomba, vir „GetYourGuide Partner API", ocena/recenzije, geoPrecision city, gumb **Preveri ponudbo** → `/go/getyourguide` (fail-closed), gumb **Dodaj med izbrane**.

Add-to-plan: strukturiran FIXED item (`dai:supply-selection`): `provider: getyourguide`, `providerProductId: {tour_id}`, `selectionState: fixed`, type/geo/price/availability/source. Sanitizacija meje: whitelist providerjev (register — `getyourguide` že vsebovan), enumi, kapice, dedupe po `provider:providerProductId`, `bookingUrl` NAMENOMA izpuščen.

AI FIXED invariant: `applyFixedSelectedProducts` → `insertProductStop` (dedupe po `destination_id === provider:id`). AI kontekst izrecno pravi `[FIXED] provider: getyourguide, id: {tour_id} … NE zamenjuj FIXED produkta`. Test: GYG + Viator + KiwiTaxi izbire SOOBSTAJO v enem kontekstu brez podvajanj.

---

## 15. Varnost (provider response = UNTRUSTED INPUT; §17)

Meje zaupanja (vse z regresijskimi testi `getyourguide-hardening.test.ts`):

1. **Naslov/opis:** `cleanGygText` — kontrolni znaki + HTML/JS injekcijski nabor `<>"'`{}$\`` stran (ISTI vzorec kot kiwitaxi/viator); kap 200/1200.
2. **tour_id:** `isGygTourId` (`^\d{1,10}$`, > 0) — koda z ločili/URL metaznaki NIKOLI v inventar (bookingUrl bi padel na /go 400).
3. **tour.url:** `gygSourceUrl` — https + host `www.getyourguide.com`/`getyourguide.com`/`*.gygtest.net`/`*.gygtest.com`. `javascript:`/`data:`/`http`/TUJ https host → NE razrešen, NE predpomnjen. Ista meja v `rememberGygTourUrl`.
4. **Slike:** `gygImageUrl` — ista host meja + `[format_id]` zamenjava (placeholder ne more vbrizgati poti).
5. **Cena/ocena:** typeof + Number.isFinite + obsegi (0 < cena ≤ 100k, 0 < ocena ≤ 5, recenzije končne > 0).
6. **Koordinate:** ISO 6709 meje (±90/±180) — NaN/Infinity/wrong type → geo ODSOTNO.
7. **filterValidTours:** null/številke/nizi/wrong-types → skipped (fail-safe); `mapGygTours` defenziven za VSAKEGA klicatelja.
8. **/go/getyourguide:** validacija po providerju (`^\d{1,10}$` + > 0); `url=` parameter NE OBSTOJA v arhitekturi (živo: `?url=https://attacker.example` → 302 ČISTA getyourguide.com povezava); kodirani `%2E%2E%2F`/`%64ata%3A`/`%6Aavascript%3A` → 400; alfanumerični ID (kot Viatorjev) → 400 (GYG prostor ID je številčen); IZHOD: https + host allowlist (getyourguide.com + test domeni); fail-closed: brez predpomnilnika + brez `GETYOURGUIDE_PARTNER_ID` → čista `https://www.getyourguide.com/` (monetized: false).

---

## 16. Izolacija odpovedi (§23 — testi + živo)

Testi: GYG **{400, 401, 429, 500, malformed, network}** × {OSM, KiwiTaxi, Viator vsi 200} → `degraded: ["getyourguide"]` TOČNO, sosedje ŽIVI. **PRAZEN odgovor (200, 0) → NI degraded** (iskren prazen sloj). Obratno: KiwiTaxi timeout → `degraded: ["kiwitaxi"]`, GYG ŽIV. Vsi štirije živi → 0 degraded, vsak prispeva pin. Živo: supply s cats=activity → GYG `not-configured` (ok: true, 0 klicev, NI degraded) — OSM/KiwiTaxi nemotena.

---

## 17. Komercialni dedupe (§19 — DO NOT MERGE)

- **Isti provider + isti tour_id:** dedupe v izbiri (sanitize) + načrtu (insertProductStop duplicate).
- **Semantično podoben RAZLIČEN ID:** DVA LOČENA produkta (NI fuzzy dedupe — naročnikovo pravilo).
- **GYG + Viator + KiwiTaxi z ISTIM naslovom + isto lokacijo → TRIJE LOČENI** (test); komercialni se ne združi niti z lokalnim (OSM). Kanonski `dedupeProducts` — komercialni ključ `id:{provider}:{code}`.

---

## 18. Živa E2E verifikacija (18. 9. 2026, nov build)

| Preverba | Rezultat |
|---|---|
| `/api/supply/search?cats=activity,tour` (LJU z12) | GYG `ok:true, count:0, note:"not-configured", ms:1` — **0 klicev na vir** (gate path), NI degraded; Viator enako (iskreno) |
| `/go/getyourguide` | 302 → `https://www.getyourguide.com/` (fail-closed, monetized:false) |
| `/go/getyourguide?product=12345` (hladen predpomnilnik) | 302 → čista domača stran (NE izmišljujemo URL-ja produkta) |
| `/go/getyourguide?product=%2E%2E%2Fevil` | **400** |
| `/go/getyourguide?url=https://attacker.example&product=…` | 302 → ČISTA povezava (napadalčev URL NIKOLI v location) |
| `/go/getyourguide2` | **404** (allowlist) |
| `/go/activities?dest=Ljubljana` (obstoječa kartica pot) | 302 → `getyourguide.com/s?q=Ljubljana&utm_source=discoverslovenia` (regresija NETA — kartica nespremenjena) |
| KiwiTaxi regresija (cats=transfer, Bled z12) | **48 transferjev ŽIVI**, 0 degraded; GYG `cat-gated` (transfer poizvedba NE kliče GYG) |
| Cache-Control supply odgovora | `no-store` (dokumentirana posledica GYG real-time politike — §11) |
| Browser /zemljevid 390 px | **0 px horizontalnega preliva**; 0 napak strani/konzole |
| Čipi plasti | Transferji / Aktivnosti / Ture (default OFF); „Aktivnosti 0" po vklopu (iskreno prazna plast) |
| Provider panel | „GetYourGuide · Povezava partnerja · aktiven sloj · Partner API (OpenAPI, odobritev prek partner portala) — pogodba živo preverjena; API žeton še ni izdan. Danes samo affiliate povezava, sloj je pripravljen in iskreno prazen." |

---

## 19. Testi (601/601)

Novo v 1.51.0 — **103 testov** v 3 datotekah:
- `getyourguide-contract.test.ts` (40): §4 model agnostičen (0 gyg* polj) + taksonomija + subcategory; §7 odsotni podatki; §9 geo (city, malformed); §12 cena (individual/per person/per group/odsoten opis + ne-EUR + meje); §13/14/15 razpoložljivost/slike/ocene (copyright, format_id, http/tuj host zavrnjen); §16 bookingUrl/sourceUrl/predpomnilnik; fail-safe validacija; klient (glave, pot, parametri, date[], klasifikacija napak, env).
- `getyourguide-adapter.test.ts` (25): §3 gate (0 klicev); §10 geo (center/radius/meje/post-filter/brez-geo/capped/date); §11 predpomnilnik (NI rezultatov — 2 klica za 2 zaporedni poizvedbi!, coalescing 1 izvedba, negativni 60 s, 429 → 310 s); §12 valuta; §6 registry + searchSupply integracija (zoom-gated/cat-gated, kanonski produkt).
- `getyourguide-hardening.test.ts` (38): §18 dedupe (izbira/načrt/semantični); §19 komercialni DO-NOT-MERGE (3 providerji); AI FIXED kontekst; §23 izolacija (7 razredov odpovedi × živi sosedje + prazni ≠ degraded + obratno + vsi 4 živi); §17 /go varnost (10 testov); §17 adversarial vhodi (injekcija/kontrolni znaki/kapice/wrong-types/NaN/Infinity); §8 source-scan (ni sample/DEMO/staticnih podatkov; 0 gyg* polj v types.ts).

Posodobljeni invariantni testi (novi DEJANSKI stanji — enak vzorec kot Task 45): supply-core (aktivni = 4; RUNTIME_GATED_ADAPTERS + getyourguide), supply-contract (PRODUCT_ONLY_ROUTES izjema za produkt pot; cache-control REALNO STANJE no-store), viator-adapter (defaultAdapters 4), supply-route-hardening (Cache-Control no-store).

**Vrata:** `bun test` **601/601** · `eslint` **0** · `tsc --noEmit` **0 napak v src** (3 predhodne izven: skills/×2 + tailwind.config.ts — nedotaknjene).

---

## 20. NO FAKE FALLBACK (§8) — GREEN

Source-scan CELE mape `providers/getyourguide/` (test): NI `sample`, NI `DEMO_`, NI `fallbackProducts`, NI hardcodanih produktov; NI statičnih JSON/CSV/db datotek (koti Viator — ČISTO API). Edini vir podatkov je pogodbena pot (client); brez žetona plast iskreno prazna (`not-configured`). Živi vir nikoli ni „pretendanj" — plast je ali živa (z žetonom) ali iskreno prazna.

---

## 21. Real data gate — izid

| Kriterij | Stanje |
|---|---|
| Real GYG API/source | POGODBA preverjena živo (OpenAPI + wiki + 401); DOSTOP ni aktiven |
| Real product IDs / products / geo / price | **NOT CONFIGURED** (plast prazna — 0 klicev) |
| Semantika cen/geo/razpoložljivosti | implementirana + testirana (na uradnem primeru Catacombs t66985) |
| Map/ProductModal/Add-to-plan/AI FIXED | arhitektura živa (dokazano skozi isto kanonsko pot + GYG testi) |
| Booking/deep link | /go/getyourguide veriga živa (fail-closed — 302/400/404) |
| Security / isolation / regression | GREEN (testi + živo) |

**GetYourGuide capability: NOT CONFIGURED** (iskren status — NI označen LIVE). Vrsta dokaza, ki bo status dvignil na LIVE: `GETYOURGUIDE_API_TOKEN` v env (partner manager, partner.getyourguide.com) → živi produkti stečejo BREZ spremembe kode → ponovni revizijski zapis.

---

## 22. Sledenje naprej (YELLOW)

1. **Pridobitev API žetona** (lastnik projekta): prijava v partner.getyourguide.com → partner manager → žeton → `GETYOURGUIDE_API_TOKEN` v env → aktivacija (ista koda; preveriti tier — BASIC: teaser; READ: +availability/price-breakdown za prihodnjo nadgradnjo modala).
2. Po aktivaciji: preveriti žive pin pozicije (predstavitvene lokacije — ali so mestni centri ali točke), gostoto po SI, dejansko enoto radija (domneva km — če vir pove drugače, popraviti `searchRadiusKm` dokumentacijo), obnašanje 429.
3. Affiliate program (GETYOURGUIDE_PARTNER_ID) je LOČEN od API žetona — nastavitev po želji za monetizacijo fallback povezav.
4. Bodoče (po potrditvi pogodbe): lazy produkt DETAIL (READ tier) za točno razpoložljivost/ceno v modalu — NE širiti scope-a pred potrditvijo.

---

## 23. KONČNA VRATA

| Vrata | Rezultat |
|---|---|
| `bun test` | **601/601** (+103 v tej nalogi) |
| `bun run lint` | **0 napak** |
| `tsc --noEmit` (src) | **0 napak** |
| Živa E2E | supply (not-configured iskren, 0 klicev), /go/getyourguide 302/400/404 + url= napad nemogoč, /go/activities regresija NETA, KiwiTaxi 48 ŽIVIH, browser 390 px 0 px preliva, 0 napak |
| KiwiTaxi regresija | **GREEN** (48 živo + testi) |
| Viator regresija | **GREEN** (testi + iskren not-configured) |
| OSM regresija | **GREEN** (cat-gated telemetrija + testi) |
| AI FIXED | **GREEN** (testi — 3 providerji soobstajajo) |
| Security | **GREEN** (38 utrditvenih testov + živa /go veriga) |
| Kanonski model | **NESPREMENJEN** (0 gyg* polj) |

**FINAL:** Tretji realni provider je arhitekturno, pogodbeno in varnostno ŽIV (adapter + geo-semantika po krogih + normalizacija + veriga do bookinga), iskreno NOT_CONFIGURED na podatkovnem sloju (brez žetona — 0 lažnih podatkov, 0 klicev na vir). OSM + KiwiTaxi + Viator + GetYourGuide delujejo hkrati (testi + živo). Kanonska abstrakcija ostaja provider-agnostic (priklop = 1 vrstica; dokazano pri TRETJEM providerju). Supply engine je pripravljen za nadaljnje providerje.

---

# DRUGA FAZA (spec §20–§33) — regresija, izolacija, disciplina, i18n, mobile, performance

**Datum:** 19. 9. 2026 (nadaljevanje po commitu 91332df; vrata 646/646)
**Verzija:** 1.51.1
**Prejšnji checkpoint:** 91332df (prva faza §1–§19; 601/601 testov)

---

## 24. Regresija kombinacij (§20) — GREEN

`getyourguide-regression.test.ts` — **kombinacijska matrika vseh 11 kombinacij** skozi `searchSupply` (isti runner kot produkcija): 4 samotne (OSM / KiwiTaxi / Viator / GetYourGuide) + 6 parov (OSM+KT, OSM+VT, OSM+GYG, KT+VT, KT+GYG, VT+GYG) + vse 4 hkrati. Vsaka kombinacija: vsak ponudnik prispeva pin, `degraded=[]`, 0 duplikatov.

- **Viator NOT_CONFIGURED ne vpliva na KiwiTaxi:** realni Viator adapter (brez `VIATOR_API_KEY`, note `not-configured`, NI degraded) + realni KiwiTaxi adapter (dataset) → KT produkti ŽIVI z realnimi ID-ji.
- **GYG odpoved (500) ne pokvari OSM+KT:** `degraded=["getyourguide"]`, OSM+KT produkti živi.
- Živo: Transferji 48 + Aktivnosti 0 soobstajata na zemljevidu (SL + EN).

## 25. Izolacija odpovedi — POPOLNA matrika (§21) — GREEN

Dopolnjena matrika (prej 7 razredov, zdaj **9 + 2**): GYG `{400, 401, 403, 429, 500, malformed, network, timeout}` × `{OSM 200, KT 200, Viator 200}` → `degraded=["getyourguide"]`, sosedi živi; GYG 200 prazen → NI degraded; **točen scenarij §21:** `OSM=200, KT=200 (realni dataset), Viator=not-configured (realni), GYG=timeout` → produkti OSM+KT, `degraded=["getyourguide"]` — **NE „whole supply failed"** (odgovor je vedno uspešen s seznamom degraded — `Promise.allSettled` izolacija v runnerju).

## 26. Varnost — dopolnitve (§22) — GREEN

Nad 38 obstoječih utrditvenih testov (1.51.0): ogromen seznam slik (10.000) in lokacij (10.000) → preslikava uspe brez sesutja; 1.000 veljavnih tur v enem odgovoru → vsi preslikani (kap da runner); kodiran URL (`https%3A%2F%2Fevil…`) → zavrnjen; `data` kot seznam (ne objekt) → `invalid-response`; mešani tipi v `data.tours` → samo veljavni; /go oversize ID (11 števk, 20 števk) / `0` / `-5` → **400**. Booking redirect fail-closed (9 živih primerov spodaj §28).

## 27. Redirect / booking (§23) — GREEN (živo, 19. 9. 2026)

| Primer | Rezultat |
|---|---|
| `/go/getyourguide` (BREZ produkta) | 302 → `https://www.getyourguide.com/` (fail-closed; z `GETYOURGUIDE_PARTNER_ID` → monetizirana domača stran) |
| `/go/getyourguide?product=66985` (veljaven, hladen predpomnilnik) | 302 → čista povezava (NE izmišljujemo globoke povezave produkta) |
| `?product=12345678901` (oversize) | **400** |
| `?product=0` / `?product=-5` | **400** |
| `?product=%6Aavascript%3A…` | **400** |
| `?product=%2E%2E%2Fevil` | **400** |
| `?url=https://attacker.example&product=…` | 302 → ČISTA povezava (param `url` NE obstaja v arhitekturi — open redirect nemogoč) |
| `/go/getyourguide2` | **404** (allowlist) |
| `/go/transfers?product=601746` (KT regresija) | 302 → `kiwitaxi.com/en/transfers/601746` |

Monetizacija ni konfigurirana → `monetized:false`, čista povezava (iskreno; LIVE DATA ni, ker API dostop ni konfiguriran — nič ne prikazujemo kot živo).

## 28. Request disciplina (§24) — GREEN

- **Uradni rate limit:** 130 klicev/min + 5-minutna blokada (pogodba) → naša instanca `maxCallsPerMin 60` (konzervativno pod; test + registrska vrednost).
- **Timeout:** klientova dira 8 s (test: hanging fetch → `GygApiError kind "timeout"` v < 1 s, NE obesi); runner dira 10 s.
- **AbortSignal:** preklic odjemalca se širi do vira (test: zunanji abort → kind `"aborted"` — NI napaka vira); use-supply-query prekliče zastarelo poizvedbo ob novi (debounce 500 ms na moveend/zoomend, seq varovalka).
- **Coalescing:** sočasni ENAKI poizvedbi delita 1 izvedbo; **sub-mrežni pan (< 0,02° bbox zaokrožitve) deli ključ** → 1 klic vira (test z dvema sočasnima bbox-oma, ki se razlikujeta za 0,005°).
- **Duplicate suppression:** zaporedna identična poizvedba = NOV klic — **POGODBENA ODLOČITEV** (vir: »please do not scrape the API in an attempt to cache its output« → `cacheTtlMs 0`; iskreno dokumentirano, NE kraja pomena).
- **Viewport/zoom gating:** brez bbox → `no-bbox` (0 klicev); zoom < 10 → adapter NE klican (runner); kategorije brez activity/tour → `cat-gated` (0 klicev) — živo potrjeno v telemetriji.
- Map panning NE ustvarja nepotrebnih klicev: debounce 500 ms + abort + coalescing + sub-mrežna zaokrožitev; rezultatov NE cachamo (pogodba vira).

## 29. Internationalizacija (§25) — GREEN

Testi + živo: SL izdelek ima vse opombe slovenske (od-cena/razpoložljivost/Trajanje), EN izdelek vse angleške (from price/availability confirmed/Duration); **NI SL besedila v EN izpilu in obratno** (negativne trditve v testih); enota „per group" semantika v obeh jezikih; registrarna `accessNote` dvojezična (provider panel). Živo EN: Transfers 48 / Activities 0 / modal „per transfer" / „Published data" / „Add to selection" / FIXED note „published price, not a live quote".

## 30. Mobile (§26) — GREEN (živo, 19. 9. 2026)

| Mera | 390 px | 375 px |
|---|---|---|
| /zemljevid (SL) horizontalni preliv | **0 px** | **0 px** |
| /zemljevid (EN) + modal odprt | **0 px** (modal ODPRT, deluje) | — |
| / (domov, SL, footer) | — | **0 px**, footer na dnu vsebine |
| /nacrtuj z 2 FIXED izdelki | **0 px** („Izbrani produkti (2) … obvezne") | — |
| Gruče / popup / pin / čipi | delujejo (27-pin gruča se razpre) | delujejo |

0 napak strani in konzole vseh mobilnih preverbah.

## 31. Performance (§27) — ISKRENE meritve (19. 9. 2026, dev strežnik)

| Meritev | Vrednost |
|---|---|
| **GYG živi vir** | **NOT MEASURED** — API dostop NI konfiguriran (NE simuliramo) |
| GYG gate path (`cats=activity,tour`) | hladna ruta (prevod) 4,95 s / **toplo 17 ms**; 0 klicev na vir; note `not-configured`; NI degraded |
| Viator gate path | 7 ms, 0 klicev (not-configured) |
| KiwiTaxi (ŽIV, dataset) — LJU | hladna 37 ms / topla 221 ms — 48 produktov |
| KiwiTaxi — Bled | 12–759 ms (1 izpad 6,3 s = dev-prevod; produkcijski standalone 12–48 ms po Tasku 44) — 48 produktov |
| KiwiTaxi — Piran | hladna 105 ms / topla 36 ms — 48 produktov |
| KiwiTaxi — SI-wide (z12) | hladna 224 ms / topla 83 ms — 48 produktov (zoom kap) |
| OSM (Overpass) | ta seja: DOSTOPEN — prvi fetch na bbox ~21 s (Overpass počasen iz peskovnika), nato predpomnjen; prejšnje seje: nedosegljiv → negativni predpomnilnik 60 s (Task 44-b) |
| Browser render (/zemljevid, dev) | DCL 772 ms · load 1484 ms · FCP 844 ms |
| Browser supply round-trip | hladen (OSM Overpass) ~21 s · topel isti bbox hiter · Transferji 48 pinov → gruče → modal |
| Markerji/gruče v pogledu | 48 transfer pinov (z12), 2–3 gruče, razprti do 27 pinov |

Zahteva „largest useful viewport": SI-wide z12 = 48 produktov (zoom kap — po dizajnu), 224 ms hladno. Vse meritve so dejanske (curl `time_total` + `performance` API); NIČ ni simulirano.

## 32. Test suite (§28) — 646/646

Nova datoteka `getyourguide-regression.test.ts` (**45 testov**):
- **§20 matrika** (13): 11 kombinacij + Viator-not-configured-ne-vpliva-na-KT (realna adapterja) + GYG-500-ne-pokvari-OSM+KT.
- **§21 izolacija** (11): 9 razredov odpovedi × živi sosedi (vključno NOVO 403 + timeout), prazen ≠ degraded, točen scenarij naročnika (realni KT + realni not-configured Viator + GYG timeout).
- **§22 varnost** (7): ogromni seznami (slike/lokacije/ture), kodiran URL, unexpected JSON (data-seznam, mešani tipi), /go oversize/ničelni/negativni ID.
- **§23 redirect** (2): /go brez produkta → fail-closed (± partner_id).
- **§24 disciplina** (5): klient timeout < 1 s, AbortSignal → „aborted", sub-mrežni pan coalescing (1 klic), zaporedna = nov klic (pogodbena iskrenost), registrske meje (60 < 130).
- **§25 i18n** (5): EN vse angleško / SL vse slovensko (negativne trditve obeh smeri), per-group semantika, trajanja, dvojezična accessNote.
- **§28 regresija** (3): realni KT dataset + realni GYG v eni poizvedbi (ločena ID prostora), OSM lokalni fuzzy dedupe intakten, pogodbene glave ločene (GYG ne pušča Viator glav).

Obstoječi: 601 (1.51.0: 103 GYG + 498 prej) — skupaj **646 testov, 40 336 expect**. `bun test` 646/646 · `eslint` 0 · `tsc --noEmit` 0 napak v src (3 predhodne izven: skills/×2 + tailwind.config.ts — nedotaknjene).

## 33. Real data gate (§29) — NOT CONFIGURED (veljaven izid)

`[ ] actual official source` — **DA** (OpenAPI + wiki, živo preverjeno 18. 9. 2026)
`[ ] active access` — **NE** (živi 401 errorCode 2420; partner manager izda žeton)
`[ ] real products / IDs / geo / prices` — **NOT CONFIGURED** (plast prazna, 0 klicev)
`[ ] correct price/availability semantics` — implementirano + testirano (uradni primer t66985)
`[ ] map / ProductModal / Add-to-plan / AI FIXED` — arhitektura živa (kanonska pot + AI FIXED živi dokaz: podvojen GYG FIXED → točno 1× v 3-dnevnem itinererju z iskreno ceno/virom)
`[ ] secure booking` — /go veriga GREEN (fail-closed)
`[ ] failure isolation / security / SL / EN / mobile` — GREEN

**Veljavni rezultat:** NOT CONFIGURED (brez poverilnic ni živih podatkov — in mi jih NE izmišljujemo).

## 34. NO FAKE DATA (§30) — GREEN

Source-scan (test ①–④ iz 1.51.0): mapa `providers/getyourguide/` NE vsebuje sample/DEMO/fallback/hardcoded produktov NI statičnih podatkovnih datotek; NI demo fixture, ki bi bil označen LIVE. Plast je ali živa (z žetonom) ali iskreno prazna — nič vmes.

## 35. AI FIXED — ŽIVI dokaz (druga faza)

POST `/api/itinerary` (200, 17,2 s): vhod = **PODVOJEN** GYG FIXED (`getyourguide:66985` 2×) + KT FIXED (`kiwitaxi:47235`) → izhod: `getyourguide:66985` NATANČNO 1× (dan 2: „cena: od 29 € (per person) · Dodano z zemljevida ponudbe · vir: GetYourGuide Partner API") + `kiwitaxi:47235` NATANČNO 1× (dan 1: „cena: od 137 € (per transfer) … vir: KiwiTaxi Partner Data API (CSV)"). Imutabilnost + dedupe + soobstajanje dokazani skozi realni AI klic pri TRETJEM komercialnem providerju.

## 36. Sledenje naprej (YELLOW — nespremenjeno + dopolnjeno)

1. **API žeton** (lastnik): partner.getyourguide.com → partner manager → `GETYOURGUIDE_API_TOKEN` v env → živi podatki BREZ spremembe kode (aktivacijska knjiga §22 prve faze).
2. Po aktivaciji: žive pin pozicije, gostota po SI, dejanska enota radija (domneva km), obnašanje 429 (310 s blokada), tier (BASIC: teaser).
3. Affiliate `GETYOURGUIDE_PARTNER_ID` (ločeno od API žetona) za monetizacijo fallback povezav.
4. Prihodnje (NE širiti scope-a): produkt DETAIL (READ tier) za točno razpoložljivost/ceno v modalu.

## 37. KONČNA VRATA (druga faza)

| Vrata | Rezultat |
|---|---|
| `bun test` | **646/646** (+45 v tej fazi; 40 336 expect) |
| `bun run lint` | **0 napak** |
| `tsc --noEmit` (src) | **0 napak** |
| Živa E2E | SL+EN zemljevid (Transferji 48 / Aktivnosti 0), zoom gating, gruče, popup, modal, FIXED izbira (SL+EN note), AI FIXED (2× → 1×), /go 9 primerov, mobile 390/375 px = 0 px preliva, 0 napak |
| KiwiTaxi regresija | **GREEN** (48 živo v vseh pogledih + realni-dataset test) |
| Viator regresija | **GREEN** (not-configured iskren; ne vpliva na KT — test + živo) |
| OSM regresija | **GREEN** (lokalni fuzzy intakten test + živi pins) |
| AI FIXED | **GREEN** (živi dokaz z GYG itemom) |
| Security | **GREEN** (45 novih + obstoječih 38 utrditvenih + živa /go veriga) |
| Kanonski model | **NESPREMENJEN** (0 gyg* polj — source-scan) |

**FINAL (celoten Task 46, §1–§33):** GetYourGuide je TRETJI realni supply provider — pogodba živo preverjena, adapter 100 % implementiran (geo po krogih + post-filter, kanonska normalizacija, varnostna meja, /go veriga, AI FIXED), podatkovni sloj pa **ISKRENO NOT CONFIGURED** (brez žetona: 0 klicev na vir, 0 izmišljenih podatkov). OSM + KiwiTaxi + Viator + GetYourGuide soobstajajo v istem supply engine-u (11 kombinacij + živo); `ProviderProduct` NESPREMENJEN; abstrakcija ostaja provider-agnostic (priklop = 1 factory vrstica — dokazano pri tretjem). Supply engine je pripravljen za četrti provider (NI dodan — spoštovana meja naročnika).
