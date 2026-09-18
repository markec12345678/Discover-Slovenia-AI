# TASK 45 — VIATOR: DRUGI REALNI SUPPLY PROVIDER (revizijski dokument)

**Task:** 45 — First Real Activity Provider: Viator
**Faze:** §1–§17 (commit `8d84766`, 1.50.0) + §18–§33 (ta dokument, 1.50.2) + popravek vrat tsc (`add0a43`, 1.50.1)
**Datum:** 18. 9. 2026 (živo preverjeno)
**Verzija dokumenta:** končna (celoten spec §1–§33)

---

## 1. Scope

Viator kot DRUGI realni supply provider (za KiwiTaxi, Task 43). **NI mock, NI fake/demo inventar, NI samo affiliate redirect** — popoln adapter proti ŽIVO preverjeni uradni pogodbi Viator Partner API v2.0. Ciljna veriga:

```
REAL VIATOR SOURCE → Viator Adapter → ProviderProduct → /api/supply/search
→ Activities/Ture layer → ProductCard/ProductModal → Add to my plan
→ FIXED AI itinerary item → validated /go/viator booking/deep link
```

**Stroge meje (izpolnjene):** kanonski model `ProviderProduct` NESPREMENJEN (0 `viator*` polj — source-scan test); KiwiTaxi popolnoma delujoč (regresija živo + testi); OSM nedotaknjen; FIXED izbira uporabnika neranljiva; brez tretjega providerja.

---

## 2. Uradna pogodba vira (živo preverjena — NE spomin)

Prebrana v polnosti 18. 9. 2026: `docs.viator.com/partner-api/technical` (curl 8,2 MB, izluščene vse sheme) + uradni Golden Path (`partnerresources.viator.com`). Ključne točke:

| Element | Pogodba |
|---|---|
| Auth | glava `exp-api-key` (ključ organizacije) |
| Verzija | `Accept: application/json;version=2.0` (OBVEZNO) |
| Jezik | `Accept-Language` — **sl NI podprt** → `en-US` (dokumentirano) |
| Iskanje | `POST /products/search` po `destinationId` (kot NIZ) |
| Taksonomija | `GET /destinations` (DestinationDetails s centri) |
| Odgovor | `products[]` ProductSummary; primeri uradni: Acadia `227717P1`, Edinburgh |
| Cena | `pricing.summary.fromPrice` = »najnižja možna cena, po navadi na odraslo osebo«; `currency`; PER_PERSON/UNIT kategorija SAMO v produktu DETAIL |
| Ocena | `reviews.totalReviews` + `combinedAverageRating` |
| Slike | `images[].variants[]` (https, dimenzije) |
| Dostopni tierji | 4 (Basic Access = affiliate; nima `/availability/check`) |
| Rate limiti | okna 10 s na endpoint + `Retry-After` pri 429 |
| Predpomnjenje | taksonomija »refreshed weekly«; rezultati iskanj krатkoročno |
| Atribucija | © Viator; `productUrl` z `pid`/`mcid` (affiliate) |
| no-index | SAMO `/attractions/*` (NE uporabljamo — dokumentirano) |

Živi dokaz stanja: klic na sandbox brez ključa = **HTTP 401 Invalid API Key** (projekt nima partnerskega računa).

---

## 3. Poverilnice / stanje zmožnosti (CAPABILITY GATE — iskren)

| Vidik | Stanje |
|---|---|
| Pogodba API | **VERIFIED** (živo preverjena, uradni viri) |
| Dostop do API / podatki | **NOT_CONFIGURED** (`VIATOR_API_KEY` manjka — self-serve po registraciji partnerskega računa: Tools → Affiliate API) |
| Razpoložljivost | capability-dependent — Basic Access NIMA `/availability/check` → `unknown` |
| Booking | `affiliate_redirect` (koda priklopljena; partner URL ne — dokler ključ/affiliate ni izdan) |
| Monetizacija | NOT_CONFIGURED (fail-closed; `monetized: false`) |

**NE enačimo** dostop ≠ razpoložljivost ≠ rezervacija ≠ monetizacija. Plast Aktivnosti/Ture je iskreno PRAZNA (`note: not-configured`, 0 klicev na vir) — živo dokazano. Ko ključ pride v env, živi podatki stečejo BREZ spremembe kode (aktivacijska knjiga v TASK-45-AUDIT.md §7).

---

## 4. Arhitektura adapterja

`src/lib/supply/providers/viator/**` (vese Viator logika — kanonski model čist):

- **client.ts** — HTTP klient: pogodbene glave, timeout 8 s + `AbortSignal` posredovanje, klasifikacija napak (`unauthorized`/`forbidden`/`rate-limited`+Retry-After/`bad-request`/`server`/`network`/`timeout`/`aborted`/`invalid-response`), DI fetch za teste.
- **destinations.ts** — ujemanje naših 22 destinacij z Viator taksonomijo (diakritike, prednost CITY), slovensko poddreveso (COUNTRY koren), `center` validacija (`Number.isFinite` — NaN/Infinity → fallback na NAŠE kanonske koordinate), viewport izbor (1–3 mestna iskanja oz. 1 državno + post-filter pinov na bbox).
- **mapper.ts** — kanonska preslikava (spodaj) + `productUrl` predpomnilnik (24 h) za `/go`.
- **types.ts** — sheme vira + fail-safe validatorji (`isViatorProductSummary`, `filterValidSummaries`, `isViatorProductCode`, `isViatorDestination`).
- **adapter.ts** — `SupplyAdapter` (search + telemetrija): capability gate, viewport/zoom gating, pozitivni predpomnilnik (TTL registra 10 min), negativni (60 s po ključu), coalescing, kap 48.

Priklop: **1 factory vrstica** v `search.ts` + 1 register vnos (forward-compat formula Taska 44 drži v praksi).

---

## 5. Kanonska normalizacija (ProviderProduct nespremenjen)

0 `viator*` polj (source-scan + objektni test). Preslikava:

| Vir | Kanonsko |
|---|---|
| `productCode` | `providerProductId`; `id = viator:{code}` |
| `itineraryType` | ACTIVITY→`activity`; ostalo→`tour` (0 novih tipov) |
| `flags: PRIVATE_TOUR` | `subcategory: "private_tour"` (izpeljano iz vira) |
| naslov/opis | iz vira (en-US — sl vir ne podpira); očiščeni (spodaj §17) |
| `destinations[].ref` | pin = center PRIMARNE destinacije |
| `pricing.summary.fromPrice` | `price: per_person + fromPrice:true + opomba` (samo EUR) |
| `reviews` | `rating` (2 decimalki) + `reviewCount` (samo če > 0) |
| `images` | naslovnа https varianta ≤ 674 px + `imageCredit © Viator` |
| — | `availability: unknown + opomba` (cena ≠ razpoložljivost) |
| — | `bookingMode: affiliate_redirect`; `bookingUrl = /go/viator?product=` (NAŠA konstrukcija) |
| `productUrl` | `sourceUrl` (validiran https + viator.com host) |

Manjka v viru → polje ODSOTNO (`undefined`) — NIKOLI `0`, `4.8`, `€25`, izmišljena lokacija.

---

## 6. Geo semantika

Pin = **center lastne PRIMARNE destinacije produkta** (ne iskane, ne bbox centroid) → `geoPrecision: "destination_center"` — NIKOLI točen meeting point (naročnik §8). Neznan ref/brez destinacij → fallback pin iskane destinacije (`fallback: true`) ali brez geo (`lat/lng/geoPrecision` odsotni — iskrena izbira za AI). Post-filter: državno iskanje → pins zunaj bboxa izločeni. Taksonomija: NaN/Infinity center → NAŠE kanonske koordinate (test §22 ⑪).

---

## 7. Semantika cen

`fromPrice` (uradni spec: najnižja možna cena, po navadi na odraslo osebo) → `unit: "per_person"`, `fromPrice: true` + odkrivajoča opomba (SL: »od-cena (najnižja, navadno na osebo)« / EN: »from price (lowest, usually per person)«). Zahtevamo `currency: EUR`; **ne-EUR → brez cene** (ne pretvarjamo, ne lažemo o valuti). 0/negativno/NaN/Infinity → brez cene. PER_PERSON/UNIT natančnost je v produktu DETAIL (Basic Access je nima) — dokumentirana omejitev, NE izmišljujemo. **Cena ≠ razpoložljivost** (regresijski test).

---

## 8. Razpoložljivost

Basic Access NIMA `/availability/check` → vedno `availability: { status: "unknown", note }`. NIKOLI `live_available` (nisli preverili) in NIKOLI `not_supported` (vir KONCEPT ima — ločena semantika enuma). Preverja se pri ponudniku ob rezervaciji (opomba v modalu).

---

## 9. Slike

Samo naslovnа slika vira (`isCover`), https variante z dimenzijami > 0 in ≤ 674 px (največja dovoljena). `http://` variante zavrnjene; wrong-type `variants`/`images` (objekt/niz/številka/null) → slika ODSOTNA (test §22 ⑤⑥). Brez slik → `image: undefined` (NI placeholderja, NI naključnih slik, NI image-search inventarja). `imageCredit: "© Viator"` (atribucija pogodbe).

---

## 10. Ocene / recenzije

`combinedAverageRating` zaokrožen na 2 decimalki SAMO če `totalReviews > 0` in ocena končna v (0, 5]. 0 recenzij → brez ocene (test). Wrong-typed nested `sources` ne vpliva (brane samo številčne vrednosti — test §22 ⑦).

---

## 11. Predpomnilnik (po pogodbi vira)

| Sloj | TTL | Razlog |
|---|---|---|
| Taksonomija destinacij | 7 dni | pogodba: »refreshed weekly« |
| Iskalni rezultati | 10 min (register) | žive cene iskanj; konzervativneje od dovoljenega |
| Negativni (okvare, po ključu) | 60 s | vir z 401/429/5xx NE dobi zaporednih klicev (Task 44-b vzorec) |
| Coalescing | sočasno | enaki poizvedbi delijo ENO izvedbo |
| productUrl (za /go) | 24 h | poti URL-jev stabilne |

Ključ poizvedbe: zaokrožen bbox (~0,02°) + locale + datum — majhna gibanja viewporta NE raztresajo predpomnilnika. FIFO evict (200 rezultatov / 500 URL-jev). Podatkov ob okvari NE predpomnimo — samo stanje (plast ostane iskreno degraded).

---

## 12. Rate limiti / zloraba

Pogodba: okna 10 s na endpoint, 429 + `Retry-After` (preberemo, izpostavimo — NE potrjujemo sami). Naše ublažitve: sekvencialna (ne vzporedna) destinacijska iskanja (≤ 3 na poizvedbo); `maxCallsPerMin: 20` v registru; negativni predpomnilnik 60 s; coalescing; zoom ≥ 10 + sloj default OFF → 0 klicev; debounce 500 ms + abort + seq-guard v browser hooku (0 duplikatnih klicev brskalnika); `VIATOR_API_BASE` prepiše base (sandbox).

---

## 13. Integracija zemljevida

Čipa **Aktivnosti/Ture** (SL) / **Activities/Tours** (EN) — kanonska taksonomija, default IZKLOPLJENO. Sloj OFF ali zoom < 10 → 0 klicev na vir (živo dokazano: zoom-gate namig). Vklopljen + z ≥ 10 → destinacijsko-scoped poizvedba, dedupe po `productCode`, kap 48, gruče (leaflet.markercluster). **Dokumentirana omejitev vira:** iskanje je PO DESTINACIJI (ne bbox) — 1–3 mestne poizvedbe oz. 1 državna + post-filter pinov; NE pretvarjamo se, da je geo-radius query. Brskalnik NIKOLI ne dobi več kot 48 produktov na plast.

---

## 14. ProductModal

100 % provider-agnostic (isti modal kot KiwiTaxi): naslov, opis (z razredom/trajanjem iz vira), lokacija, cena + enota + opomba od-cene, vir `Viator Partner API`, ocena/recenzije, `geoPrecision` destinacijski center, gumb **Preveri ponudbo** → `/go/viator` (externo, fail-closed), gumb **Dodaj med izbrane**. Dostopost `unknown` → iskrena opomba. Brez provider-specific UI modela.

---

## 15. Dodaj v načrt (Add to plan)

Strukturiran FIXED item (`dai:supply-selection`): `provider: viator`, `providerProductId: REAL_ID`, `selectionState: fixed`, `type`, geo, `price` (per_person/fromPrice/opomba), `availability: unknown`, `source`. Sanitizacija meje: whitelist providerjev, enumi, kapice, dedupe po `provider:id`, `bookingUrl` NAMENOMA izpuščen (rezervacija gre prek `/go`). Živo dokazano (sessionStorage FIXED item).

---

## 16. AI FIXED invariant

`applyFixedSelectedProducts` → `insertProductStop` (dedupe po `destination_id === provider:id`). AI kontekst izrecno pravi: `[FIXED] provider: viator, id: 227717P1 … NE zamenjuj FIXED produkta`. **Živi dokaz (POST /api/itinerary, nov build, 15,9 s):** vhod s podvojenim Viator FIXED itemom + KiwiTaxi FIXED itemom → izhod: `viator:227717P1` NATANČNO enkrat (dan 2, €500, »cena: od 500 € (per person) · Dodano z zemljevida ponudbe · vir: Viator Partner API«) + `kiwitaxi:47235` NATANČNO enkrat (dan 1, €137) — AI NI zamenjal, NI podvojiл, NI spremenil ID/cene/vira; oba providerja SOOBSTAJATA v enem itinererju. AI sme dodajati okolico (transport/hrana/POI) — izbrani produkt ostaja FIXED.

---

## 17. Varnost (provider response = UNTRUSTED INPUT; validacija na meji adapterja)

Meje zaupanja (vse z regresijskimi testi `viator-hardening.test.ts` §22):

1. **Naslov/opis:** `cleanViatorText` — kontrolni znaki (\u0000–\u001f, \u007f) + HTML/JS injekcijski nabor `<>"'`{}$\`` stran (ISTI vzorec kot kiwitaxi `cleanName`, Task 44 §12 — React escaping je druga plast, meja je prva); kap 200/1200.
2. **productCode:** `isViatorProductCode` (`^[A-Za-z0-9]{3,20}$`) v `isViatorProductSummary` — koda z ločili/URL metaznaki/predolga NIKOLI ne pride v inventar (njen bookingUrl bi itak padel na /go 400).
3. **productUrl:** `viatorSourceUrl` — https + host `viator.com`/`www.viator.com` (uradna pogodba). `javascript:`/`data:`/`http`/TUJ https host (npr. `viator.com.evil.example.com`) → NE razrešen, NE predpomnjen. Ista meja v `rememberViatorProductUrl`.
4. **Slike:** https + končne dimenzije ≤ 674; `Array.isArray(cover?.variants)` varovalka (wrong-type objekt NE sesuje preslikave — popravljen del tega taska).
5. **Cena/ocena:** typeof + Number.isFinite + obsegi (0 < cena, 0 < ocena ≤ 5, recenzije > 0).
6. **Centri destinacij:** Number.isFinite — NaN/Infinity → NAŠE kanonske koordinate (NI NaN pinov).
7. **filterValidSummaries:** null/številke/nizi/wrong-types → skipped (fail-safe, en slab zapis NE sesuje plasti); `mapViatorSummaries` defenziven za VSakEGA klicatelja.
8. **/go/viator:** validacija po providerju; `url=` parameter NE OBSTOJA v arhitekturi (živo: `?url=https://attacker.example` → 302 čista viator.com povezava — napadalčev URL NIKOLI v location); kodirani `%2E%2E%2F`/`%64ata%3A`/`%6Aavascript%3A` → 400 (URL dekodiranje je del meje); IZHOD: https + host allowlist (viator.com/shareasale/tp.media/travelpayouts) — 500 sicer; fail-closed: brez predpomnjenega URL + brez `VIATOR_AFFILIATE_URL` → čista `https://www.viator.com/` (monetized: false — NE lažemo o sledenju).

---

## 18. Izolacija odpovedi (živa matrika — testi + živo)

Testi (`viator-hardening.test.ts` §23): Viator **{400, 401, 403, 429, 500, malformed, network, timeout}** × {OSM 200, KiwiTaxi 200} → `degraded: ["viator"]` TOČNO, OSM+KiwiTaxi produkti ŽIVI (NI whole supply failed). **PRAZEN odgovor (200, 0 produktov) → NI degraded** (iskren prazen sloj). **Obratno:** KiwiTaxi timeout → `degraded: ["kiwitaxi"]`, Viator ŽIV; OSM timeout → `degraded: ["osm"]`, Viator ŽIV. Kombinacije vseh treh (§19): OSM+KT, OSM+VT, KT+VT, OSM+KT+VT — vsi prispevajo svoje pin, 0 degraded. Živo: OSM (Overpass nedosegljiv v sandboxu) je bil degraded VSAK dan E2E — KiwiTaxi plast nemotena (48) + Viator iskren (0/not-configured).

---

## 19. KiwiTaxi regresija — GREEN

- **Testi:** 455 obstoječih (Task 43/44) + 43 novih = 498/498; 0 regresij (isti suite, novi testi le dodani).
- **Živo (nov build, ta task):** Transferji plast 48 produktov (SL + EN), modal z realnimi podatki (Bled → Zagreb, razredi vozil €258–€300, badge Objavljeni podatki), Dodaj med izbrane → sessionStorage FIXED (kiwitaxi/16400), AI itinerer s FIXED transferjem (kiwitaxi/47235 €137 natanko enkrat), `/go/transfers` 302 → kiwitaxi.com, `product=abc` → 400. **KiwiTaxi popolnoma delujoč.**

---

## 20. Duplicate invariant + komercialni dedupe (§18/§20 spec)

- **Isti provider + isti product ID:** sanitizacija izbire dedupe po `provider:providerProductId` (podvojen vhod → 1); vstavljanje v načrt → `duplicate` zavrnjen (živo dokazano prek AI: podvojen FIXED vhod → 1 postanek).
- **Semantično podoben RAZLIČEN ID:** DVA LOČENA produkta (NI fuzzy dedupe — naročnikovo pravilo; spajanje bi bilo izmišljanje). Test: dva Viator produkta z IDENTIČNIM naslovom + lokacijo, različna koda → oba v načrtu.
- **Komercialni dedupe (DO NOT MERGE):** `dedupeProducts` — komercialni/lastni viri imajo ključ `id:{provider}:{code}` (NIKOLI geohash+ime); KiwiTaxi + Viator z istim naslovom + isto lokacijo → OSTANETA DVA (test); komercialni se ne združi niti z lokalnim (test). **OSM/local pravila ostanejo LOČENA** (geohash7+tip+normaliziran naslov SAMO znotraj local skupine — test potrjuje, da lokalni fuzzy dedupe še vedno deluje).

---

## 21. i18n (SL + EN) — GREEN

Živo preverjeno na novem buildu: čipi (Aktivnosti/Ture/Transferji ↔ Activities/Tours/Transfers), zoom namig (»Približajte zemljevid (z ≥ 10)« ↔ »Zoom in for local places (z ≥ 10)«), modal (na prevoz ↔ per transfer; opombe od-cene SL/EN), vir, gumba (Dodaj med izbrane / Preveri ponudbo ↔ Add/Check), načrtovalnik (Izbrani produkti / FIXED / opomba invarianta), /go (locale-agnostičen). 0 hardcoded SL nizov v EN poti (EN E2E: Transfers 48 + Activities 0 + modal + hint — vse EN).

---

## 22. Mobilni (§26) — GREEN (0 px horizontalnega preliva)

| Širina | Strani | Preliv | Modal/plast |
|---|---|---|---|
| 390 px | /en/zemljevid (plasti ON: Transfers 48 + Activities 0) | **0 px** | ProductModal odprt (Kranjska Gora → Ljubljana Airport), 0 px |
| 375 px | / (SL domov, footer prisoten) | **0 px** | — |
| 375 px | /zemljevid (SL) | **0 px** | čipi/plast |
| 390 px | /nacrtuj s FIXED izbiro | **0 px** | Izbrani produkti (1) + FIXED kartica |

---

## 23. Performance (§27 — DEJANSKO izmerjeno, dev strežnik, nov build)

| Meritev | Rezultat |
|---|---|
| Viator adapter (gate path, cats=activity) | `ms=1`, count 0, note not-configured, **0 klicev na vir** |
| Viator plast: hladna ruta (prvi klic po prevodu) | 2,16 s (prevod poti) → toplo **16 ms** |
| Viator živi vir (hladno/toplo) | **NOT MEASURED** — vir ni konfiguriran (brez ključa NI poštenega klica; NE simuliramo) |
| LJU viewport (transfer+activity) | 375 ms (48 produktov; kiwitaxi 23 ms cached) |
| Bled viewport | 7,08 s (dev prevod varianca; adapter 23 ms cached) |
| Piran viewport | < 1 ms (poln topel predpomnilnik; 48 produktov) |
| SI-wide (največji dovoljeni) | < 1 ms (topel; 48) |
| Markers/gruče (browser, z10 nacional) | 48 transferjev → 2 posamezna + 3 gruče; Ljubljana z12–z14: 5 markerjev |
| Browser render /zemljevid | 165 ms–3,3 s (dev, po prevodu); 0 napak strani |
| OSM | degraded v sandboxu (Overpass nedosegljiv — znano) — zamuda plačana 1× na 60 s okno (Task 44-b) |

---

## 24. Testi (§28 — 498/498)

Novo v 1.50.2: `viator-hardening.test.ts` **43 testov** — §18 (4: dedupe izbire/načrta, semantic-NE-merge, različna ostajeta), §20 (4: KT+VT ne-merge, VT+OSM ne-merge, lokalni fuzzy INTAKTEN, id-dedupe), §19+§23 (13: 7 razredov viator odpovedi × živi sosedi, timeout, prazni ≠ degraded, obratna izolacija KT/OSM, 4 kombinacije), §21 (5: url= nemogoč, kodirani ../data:/javascript:, zloben dest), §22 (12: naslov/opis/script/kontrolni znaki/kapi/variants wrong-type/images wrong-type/cena niz/ocena nested/productUrl meja/filterValid/mapper defenziv/NaN centri/productCode meja), §30 (3: source-scan cele mape, NI statičnih podatkov, iskrena opomba).
Obstoječi iz 1.50.0: `viator-contract.test.ts` (33) + `viator-adapter.test.ts` (32) + vsi KiwiTaxi/OSM/supply suite-i (nepopravljene 455 → 498 skupaj z novimi, 0 regresij).

**Vrata:** `bun test` **498/498** · `eslint` **0** · `tsc --noEmit` **0 napak v src** (3 predhodne izven: skills/×2 + tailwind.config.ts — nedotaknjene).

---

## 25. NO FAKE FALLBACK (§30) — GREEN

Source-scan CELE mape `providers/viator/` (test): NI `sample`, NI `DEMO_`, NI `fallbackProducts`, NI hardcodanih produktov; NI statičnih JSON/CSV/db datotek (za razliko od KiwiTaxi CSV ingest — Viator je ČISTO API). Edini vir podatkov je pogodbena pot (client); brez ključa plast iskreno prazna (`not-configured`). Živi vir nikoli ni "pretvarjanje" — status v registru `affiliate`, `inventoryAccess: ["affiliate_deep_link"]`, `active: true` (runtime gate). DEMO vs LIVE ločitev: NI demo podatkov v repo — plast je ali živa (s ključem) ali iskreno prazna.

---

## 26. Real data gate (§29) — izid

| Kriterij | Stanje |
|---|---|
| Real Viator API/source | POGODBA preverjena živo; DOSTOP ni aktiven |
| Real product IDs / products / geo / price | **NOT CONFIGURED** (plast prazna — 0 klicev) |
| Semantika cen/razpoložljivosti | implementirana + testirana (na uradnih primerih) |
| Map/ProductModal/Add-to-plan/AI FIXED | arhitektura živa (dokazano skozi KiwiTaxi isto pot + Viator testi) |
| Booking/deep link | /go veriga živa (fail-closed) |
| Security / isolation / SL / EN / mobile | GREEN (živo) |

**Viator capability: NOT CONFIGURED** (iskren status — NI označen LIVE; brez realnega source dokaza tega NE smemo). Vrsta dokaza, ki bo status dvignil na LIVE: `VIATOR_API_KEY` v env → živi produkti stečejo (brez spremembe kode) → ponovni revizijski zapis po §29 listi.

---

## 27. Sledenje naprej (YELLOW)

1. **Registracija Viator partnerskega računa** (lastnik projekta) → self-serve ključ (Tools → Affiliate API) → `VIATOR_API_KEY` v env → aktivacija po aktivacijski knjigi (TASK-45-AUDIT.md §7) — EDELJNA odprta točka za živi inventar.
2. Po aktivaciji: preveriti žive pin pozicije (destinacijski centri), gostoto ocen po SI destinacijah, prave odgovore (429 obnašanje) — ponoviti meritve §23 z ŽIVIM virom.
3. Lazy produkt DETAIL ob odprtju modala (točen PER_PERSON/UNIT + meeting point iz logistics) — NOVA potrditev proti pogodbi PRED implementacijo (ne širiti scope-a).
4. Dev-only: prekinitveni 500 na supply poizvedbah ob hladnem prevodu (Task 44 forenzika — prisma log okolje; produkcija 0 napak; NE blokirajoče).

---

## 28. KONČNA VRATA (§32/§33)

| Vrata | Rezultat |
|---|---|
| `bun test` | **498/498** (+43 v tej fazi) |
| `bun run lint` | **0 napak** |
| `tsc --noEmit` (src) | **0 napak** |
| Živa E2E | SL + EN (plasti/modal/FIXED/načrtovalnik), 390 px + 375 px (0 px preliva), AI FIXED z viator+kiwitaxi (podvojen vhod → 1), /go veriga 302/400/404 |
| KiwiTaxi regresija | **GREEN** (48 živo + testi + AI + /go) |
| OSM regresija | **GREEN** (degradacija iskrena, sloj nemoten, lokalni dedupe test) |
| AI FIXED | **GREEN** (živo + testi) |
| Security | **GREEN** (12 §22 testov + 5 §21 route testov + živa /go veriga) |
| Kanonski model | **NESPREMENJEN** (0 viator* polj; edina razširitev 1.50.0: opcijski `lastRunNote?`) |

**FINAL:** Drugi realni provider je arhitekturno, pogodbeno in varnostno ŽIV (adapter + normalizacija + veriga do bookinga), iskreno NOT_CONFIGURED na podatkovnem sloju (brez ključa — 0 lažnih podatkov). KiwiTaxi + Viator + OSM delujejo hkrati (testi + živo). Kanonska abstrakcija ostaja provider-agnostic (priklop = 1 vrstica; dokazano). Supply engine je pripravljen za nadaljnje providerje.

---

## Priponka: spremembe kode te faze (§18–§33, 1.50.2)

- `src/lib/supply/providers/viator/mapper.ts` — §22 utrditev: `cleanViatorText` (naslov/opis: kontrolni + injekcijski znaki, kapice), `viatorSourceUrl` (productUrl meja hosta viator.com — prva varovalka pred /go allowlist), `rememberViatorProductUrl` ista meja, `pickImageUrl` Array.isArray varovalka, `mapViatorSummaries` defenziven za vsakega klicatelja.
- `src/lib/supply/providers/viator/types.ts` — §22: `isViatorProductSummary` zahteva `isViatorProductCode` (alfanumerični 3–20) — koda z metaznaki nikoli v inventarju.
- `src/lib/__tests__/viator-hardening.test.ts` — NOVO: 43 testov (§18/§20/§19/§23/§21/§22/§30).
- `docs/TASK-45-VIATOR.md` — ta dokument.
- RUNTIME obnašanje nespremenjeno za kanonski model, KiwiTaxi, OSM, AI pot, /go route (samo meje validacije viatorja ostrejše).
