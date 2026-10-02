# PRODUCTION ACTIVATION STATUS — Issue #20

> **En vir resnice o dejanski produkcijski aktivaciji** vseh zmožnosti.
> Izpeljano iz `src/lib/supply/production-matrix.ts` + `registry.ts`
> (mehansko, brez lastnih odločitev). Živi izpis: `bun run activation:check`
> (tabela) ali `bun run activation:check -- --json`.
>
> Ustvarjeno v okviru [Issue #20](https://github.com/markec12345678/Discover-Slovenia-AI/issues/20)
> (faza 1.157.0). Štiri stanja po §11: **ACTIVE / CONFIGURED /
> NOT CONFIGURED / BLOCKED** — pravila preslikave so v
> [`src/lib/supply/activation-check.ts`](../src/lib/supply/activation-check.ts)
> in testno zaklenjena (`issue20-activation-check.test.ts`, 12 testov).

---

## 0. Kako brati stanja (§11)

| Stanje | Pomen | Pravilo |
|---|---|---|
| 🟢 **ACTIVE** | živo dokazano, polno produkcijsko | matrika: `PRODUCTION_ACTIVE` |
| 🟡 **CONFIGURED** | sloj priklopljen in DEJANSKO teče (lahko že z živimi podatki), polna aktivacija (booking/CTA) še ni dokazana | stopnja ≥ `PRODUCTION_CONFIGURED` in < `PRODUCTION_ACTIVE` |
| ⚪ **NOT CONFIGURED** | ključ/ID je self-serve dostopen, a NI v env | `blockedReason: NOT_CONFIGURED` |
| 🔴 **BLOCKED** | potrebna zunanja odobritev/pogodba, vir nima te vrste dostopa, ali je psevdo-vir | vse ostalo |

ENV prisotnost v izpisu je IZKLJUČNO Boolean (`IME:✓/✗`) — vrednosti
nikoli ne zapustejo plasti (test kanarček). Cena `FROM_PRICE` pomeni
objavljeno/izpeljano ceno, **NIKOLI živega citata**.

---

## 1. MASTER ACTIVATION MATRIX (§5 — vseh 16 vnosov)

Stolpci po Issue #20 §5: manjkajoča zunanja predpogoj · stanje kode ·
stanje testov · točen aktivacijski korak · pričakovano uporabniško vedenje.

| Provider | Manjka zunanja predpogoj | Koda | Testi (dat. z omembo) | Točen aktivacijski korak | Uporabniško vedenje po aktivaciji |
|---|---|---|---|---|---|
| **osm** 🟢 | — (nič) | adapter živ | 32 | nič (že aktivno) | živi POI po viewportu (info_only, atribucija ODbL) |
| **fsq** 🟢 | — (snapshot nameščen) | lokalni sloj | 20 | osvežitev: `bun run fsq:ingest` | 125.446 POI sloj SI+HR+ME+AL (info_only) |
| **sto** 🟢 | — | RAG ingest | 7 | tedenski cron `sto-reingest` | klepet/RAG z uradno vsebino slovenia.info |
| **own** 🟡 | Stripe ključi (checkout — §4); prvi partner-submitted geo zapis | adapter živ, LIVE_DATA_VERIFIED | 12 (+116 geo testov) | Stripe: račun → `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` v env → payout? | živi lastni lokali na zemljevidu ✓ (že zdaj); rezervacija po ključih |
| **viator** ⚪ | `VIATOR_API_KEY` (self-serve: partnerresources.viator.com → Affiliate API) | adapter priklopljen (iskreno prazen) | 29 | partner portal → ključ v env | živi produkti+cene na sloju; productUrl deep-link |
| **getyourguide** 🔴 | žeton izda partner manager (NI self-serve) | adapter priklopljen | 19 | partner.getyourguide.com → odobritev → `GETYOURGUIDE_API_TOKEN` (+`_PARTNER_ID`) | živi produkti + Option 1 booking povezave |
| **tiqets** 🔴 | odobritev affiliate prijave prek Awin | adapter priklopljen | 11 | Awin → cread.php URL → `TIQETS_AFFILIATE_URL`/`_API_KEY` | vstopnice z objavljenimi cenami |
| **booking** 🔴 | Managed Affiliate Partner status (Demand API) + `BOOKING_AFFILIATE_ID` | adapter priklopljen | 17 | partnerhub prijava (aid) → env | nastanitve s FROM_PRICE per_night |
| **kiwitaxi** 🟢 | monetizacija: `KIWITAXI_PAP_ID` (inventar ŽE aktiven) | CSV feed + adapter | 40 | partner račun → PAP ID → env | transferji že živi (9.614); `/go/transfers` postane monetiziran |
| **discovercars** 🔴 | Search API le B4B pogodba; affiliate code self-serve | brez adapterja | 0 | affiliate prijava → a_aid → `DISCOVERCARS_AFFILIATE_URL/CODE` | `/go/cars` monetiziran (brez inventarja) |
| **omio** 🔴 | odobritev programa (tracking URL format po odobritvi) | brez adapterja | 0 | program → `OMIO_AFFILIATE_URL` (https) | `/go/transport` monetiziran |
| **skyscanner** 🔴 | Impact račun → mediaPartnerId; Travel API „za uveljavljena podjetja" | adapter priklopljen (origin gate §7) | 10 | Impact → `SKYSCANNER_MEDIA_PARTNER_ID` (+ API ključ po odobritvi) | letni rezultati (izhodišče glej §7) |
| **airalo** 🔴 | OAuth2 CLIENT_ID/SECRET po odobritvi Partner API | adapter priklopljen | 8 | odobritev → obe poverilnici v env (DELNA konfiguracija = NE konfigurirano) | eSIM paketi s cenami |
| **worldnomads** 🔴 | CJ partner URL (self-serve prijava) | affiliate-only | 0 | CJ dashboard → `WORLDNOMADS_AFFILIATE_URL` | `/go/insurance` monetiziran (prednostni) |
| **safetywing** 🔴 | Ambassador program ID | affiliate-only | 0 | program → `SAFETYWING_AMBASSADOR_ID` | `/go/insurance` monetiziran (rezerva WN) |
| **travelpayouts** ⚪ | `TRAVELPAYOUTS_TOKEN` (self-serve) + `TRAVELPAYOUTS_ORIGIN` | adapter priklopljen | 10 | račun → developers/api → token + IATA izhodišče | nov search vir letov (citat ≠ sedeži) |

**Povzetek (bun run activation:check):** 16 · 🟢 4 · 🟡 1 · ⚪ 2 · 🔴 9.
Psevdo-vir `manual` (DISCOVERED) NI vnos registra in se v poročilu ne
prikaže (testno zaklenjeno).

---

## 2. LASTNA TRŽNICA (§3 — P0) — PRODUKCIJSKO PREVERJENO ✅

Struktura po Issue #20 §15: **CURRENT STATE → ROOT CAUSE / GAP →
IMPLEMENTATION → TEST → PRODUCTION EVIDENCE → FINAL STATUS**.

### CURRENT STATE (pred 1.157.0)
`own` = PRODUCTION_CONFIGURED / NO_LIVE_DATA: adapter, geo stolpci in
supply priklop obstajajo, vendar ima **0 od 20 objavljenih zapisov
(10 listingov + 10 izkušenj) koordinate** → lastni sloj na zemljevidu
je bil iskreno prazen.

### ROOT CAUSE / GAP
Produkcijska baza je bila napolnjena z demo-seedom (2026-09-16, glej
`scripts/seed-demo.ts`), ki pred TASK 84 ni vseboval geo polj; nikoli
ni bil opravljen naknadni geo-vnos. Produkcijski demo partnerji so po
P7-A **inertni** (naključna gesla — prijava nemogoča po zasnovi), zato
owner-UI pot v produkciji ni bila na voljo brez pravega partnerja.

### IMPLEMENTATION (1.157.0, 2026-10-01)
- **Geo-dopolnitev vzdrževalca** (transparenten popravek podatkov, ne
  nov demo inventar): 2 REALNA lokala na REALNIH naslovih sta dobila
  veljavne koordinate — `postojna-jama-partner` (Jamska cesta 30,
  6230 Postojna → 45.7819, 14.2137) in `kavarna-zvezda-ljubljana`
  (Krojaška ulica 5, 1000 Ljubljana → 46.0513, 14.5058). Ostalih 18
  zapisov je iskreno ostalo brez koordinat (izpuščeni iz sloja).
- **Matrika dvignjena s snapshotom**: own → `LIVE_DATA_VERIFIED`
  (`blockedReason: NO_LIVE_DATA` odstranjen; nov iskreni razlog za
  NAPREJ: `NOT_CONFIGURED` — Stripe checkout ključi). Vir:
  `src/lib/supply/production-matrix.ts` (komentar vsebuje dokazno pot).

### TEST
- Adapter vrata so bila ŽE pokrita (116 testov: `task84-own-supply` /
  `task85-listing-geo-form` / `task87-experience-geo` — viewport,
  cat-gating, kap, DB napaka → MEČE, neveljavne koordinate → null,
  zapis brez koordinat → izpuščen).
- Novo (1.157.0): preslikava activation-check zaklenjena z 12 testi
  (`issue20-activation-check.test.ts`) — pokritost 16/16, mehanska
  preslikava iz matrike, kanarček proti izdaji env vrednosti.
- Posodobljeni source-contract testi za novo stopnjo own:
  `task84` (LIVE_DATA_VERIFIED + NOT_CONFIGURED checkout), `task87`,
  `task53 ⑦` (števci stopenj), `task52 §0` (invarianta razloga).

### PRODUCTION EVIDENCE (Render — PRIMARNA produkcija, 2026-10-01 ~08:50 UTC)
1. **Supply odgovor vsebuje točen source** — `GET /api/supply/search?
   bbox=45.77,14.19,45.79,14.24&zoom=14&cats=poi` → `provider: "own"`,
   `id: "own:cmtvgsm0t000mq5udjus7fcmo"`, `bookingMode:
   "own_marketplace"`, `geoPrecision: "exact"`, naslov/ocena prisotni.
2. **Marker na zemljevidu** — /zemljevid iskanje »restavracije
   Ljubljana« → zadetek »Lokal Kavarna Zvezda — Ljubljana« → supply
   sloj (940 markerjev) → produktni marker → POI popup z naslovom,
   oceno (★ 4.4 · 156), kategorijo. 📸 `p1-own-poi-popup.png`
3. **Add v My Trip** — gumb »+ Dodaj v mojo pot« → »✓ Dodano« +
   `dai:my-trip-items` vsebuje `{kind:"product",
   refId:"own:cmtvgslvj000kq5ud6j8b42es", source:"zemljevid"}` —
   kanonski write-through (#16 F3) z lastnim tržničnim produktom.
   📸 `p2-dodano-gumb.png`
4. **Hub** — /moja-potovanja → »Moja pot 1« vsebuje »Kavarna Zvezda —
   Ljubljana«. 📸 `p3-hub-moja-pot.png`
5. **Zapis brez koordinat je izpuščen** — pred popravkom je bil lastni
   sloj prazen kljub 20 objavljenim zapisom (0 v supply odgovoru —
   dokazano z metodo: `own` count 0 @ 2026-10-01 ~08:35 UTC).

### FINAL STATUS
**own = LIVE_DATA_VERIFIED (🟡 CONFIGURED)** — živi podatki produkcijsko
preverjeni skozi celotno pot; PRODUCTION_ACTIVE čaka Stripe ključe
(checkout, §4) in prvi partner-submitted geo zapis. Owner → create/
update → moderacija → published → geo validacija je kode+testno
preverjena (`/api/owner/listings/[id]` zod lat/lng + revalidacija;
demo računi v produkciji inertni po P7-A — pravi partner bo opravil
produkcijsko pot prvič).

---

## 3. LASTNI CHECKOUT — STRIPE (§4 — P0): AKTIVACIJSKA POT ZAKLJUČENA (1.158.0), ZUNANJI BLOKER = KLJUČI

> **Iskrena dopolnitev FAZE 2 (1.158.0):** oznaka FAZE 1 »tehnično
> dokončan, zunanji bloker« je bila po neodvisni verifikaciji PREVEČŠNA
> za B2C obseg — produkcijska veja `/api/checkout` (izdelki) in
> `/api/bookings` (izkušnje) je bila **501 TODO tudi ob prisotnih
> ključih** (zaključeni so bili samo B2B tokovi: naročnina,
> sponzorstvo, provizijski račun). FAZA 2 je dopolnila manjkajoči B2C del.

Struktura po Issue #20 §15: **CURRENT STATE → ROOT CAUSE / GAP →
IMPLEMENTATION → TEST → PRODUCTION EVIDENCE → FINAL STATUS**.

### CURRENT STATE (pred 1.158.0)
B2B tokovi (subscription `mode:"subscription"`; sponsorship in
commission_invoice `mode:"payment"`) so bili produkcijsko zaključeni.
B2C tok (§4: »product/experience → checkout session → payment result →
webhook → idempotent state transition → order/booking state →
user-facing confirmation«) pa je bil v `/api/checkout` in
`/api/bookings` **izrecen 501 TODO** — dodaja `STRIPE_SECRET_KEY`
tržnice NE bi vklopilo (UI `checkout-modal` je medtem obljubljal
»ko bomo dodali prave Stripe ključe, se bo vklopilo pravo plačevanje«).
Webhook je obdelal samo subscription/sponsorship/commission dogodke —
brez primerov za Order/Booking.

### ROOT CAUSE / GAP
Demo pot je nastala prva (1.36.0, P7-C3/P7-C4 varovalke), produkcijska
veja pa je ostala načrtovana v komentarjih (»TODO: ko boš dodal realne
Stripe ključe …«) brez implementacije — FAZA 1 (1.157.0) jo je v tem
dokumentu po pomoti označila kot zaključeno.

### IMPLEMENTATION (1.158.0, 2026-10-01)
Cela B2C veriga je zdaj implementirana (isti vzorci kot B2B tokovi):
1. **`POST /api/checkout`** (izdelki): atomarna SERIALIZABLE
   transakcija (dedup po aktivnih vrsticah + pogojni decrement zaloge +
   `Order` `status:"pending"`, `paymentMethod:"stripe"`, brez `paidAt`)
   → Stripe Checkout Session (`mode:"payment"`, cene iz DB v centih +
   poštnina kot postavka, `metadata.type=marketplace_order` +
   `orderNumber`, `expires_at` 60 min) → `{ url }` za preusmeritev.
   Kompenzacija: napaka ustvarjanja seje → takojšnja sprostitev
   rezervacije (brez seje ni webhook-a, ki bi jo sprostil).
2. **`POST /api/bookings`** (izkušnje): ista transakcija kot demo pot
   (dedup + TASK 33 koledar — pending ZASEDA kapaciteto dneva) z
   `status:"pending"`, brez `confirmedAt` → Checkout Session
   (`metadata.type=marketplace_booking` + `bookingNumber`) → `{ url }`.
3. **Webhook `/api/stripe/webhook`** (ZA `constructEvent` overitvijo in
   dedup markerjem — klientski payload NE MORE ponarediti »paid«):
   `checkout.session.completed` + `marketplace_order` → preverba
   `payment_status` + zneska (P3b-6) → pogojni prehod `pending→paid` +
   `paidAt` (idempotenca RC-4) → e-pošta kupcu; `marketplace_booking` →
   preverba → pogojni prehod `pending→confirmed` + `confirmedAt` +
   **`paymentStatus:"paid"`** (edini writer — provizijska osnova FW1) →
   bookingCount + e-pošta gostu in ponudniku.
4. **Življenjska doba (§9 pending/fail/cancelled):**
   `checkout.session.expired` in `async_payment_failed` → idempotentna
   sprostitev: `releasePendingOrder` (PREKLIČI-NATO-SPROSTI: pogojni
   `updateMany pending→cancelled`, nato vrnitev zaloge + saleCount;
   smer napake varna — zaloga pod-štetja, preprodaja nemogoča) in
   `releasePendingBooking` (kapaciteta se sprosti prek statusa
   »cancelled«). Refund (`charge.refunded`) ostaja dokumentiran
   nedokončan del do aktivacije računa (brez živega računa ga ni mogoče
   pošteno preveriti).
5. **Uporabniška potrditev:** preusmeritev modalov ob `{ url }` +
   `PaymentReturnBanner` na `/trznica?placilo=uspeh|preklicano` in
   `/dozivetja?…` (izriše se SAMO ob parametru `placilo`; demo tok
   bannera nikoli ne sproži).
6. Čista plast `src/lib/marketplace-checkout.ts` (brez db/env) +
   db-plast `src/lib/marketplace-checkout-server.ts`.

### TEST
37 novih testov (`issue20-marketplace-checkout.test.ts`): vedenjski
(line items, okno rezervacije, diskriminator, preverba plačila
pozitivno/negativno, razčlenitev items pozitivno/negativno) +
source-contract zaklepniki (503 NE 501, pending+stripe v transakciji,
metadata, povratni URL-ji, kompenzacija, dedup po aktivnih vrsticah,
webhook veji ZA podpisom+dedupom, pogojni prehodi, sprostitve,
frontend preusmeritev + banner, demo v produkciji izrecen). Stara
Stripe pokritost (7 datotek) ostaja zelena; demo pot je nespremenjena
(ZERO FEATURE LOSS).

### PRODUCTION EVIDENCE
Živi dokaz aktivacije zahteva Stripe račun (zunanji bloker) — do
takrat so dokazi STRUKTURNI: vsak-push CI (tsc 0, lint 0, cel suite) +
37 novih testov. Brez ključev obe ruti iskreno vračata **503** (izpis:
»Plačila niso konfigurirana …«) — NE 501 in NIKOLI tiho demo plačilo.

### FINAL STATUS
**Stripe = NOT CONFIGURED (⚪)** — tehnična aktivacijska pot za vse
lastne tokove (B2B naročnina/sponzorstvo/provizija + B2C
izdelki/izkušnje) je zdaj ZAKLJUČENA. Aktivacija je čisto zunanje
dejanje: Stripe račun → `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
v env (Render/Vercel) → prijava webhook dogodkov
`checkout.session.completed | expired | async_payment_failed`,
`customer.subscription.*`, `invoice.payment_failed` na
`/api/stripe/webhook` → produkcijski smoke prvega pravega
naročila/rezervacije. Do takrat `own` ostaja 🟡 CONFIGURED (CTA
own_checkout ni produkcijsko verifikovan).

---

## 4. AFFILIATE MONETIZACIJA (§6): POT DOKUMENTIRANA, 0 AKTIVNIH

Vseh 11 affiliate env spremenljivk manjka (Boolean izpisi v
`activation:check`). Vsaka ima: env handling (fail-closed — brez ID-ja
redirect vodi na čisto partnersko stran, `monetized: false`, NIKOLI
lažnega sledenja), host allowlist v `/go/[provider]`, telemetrijo
(`monetized` flag). Točni koraki po ponudniku: §1 tabela zgoraj +
`docs/PROVIDER-APPLICATIONS.md` §4 (runbooki). Pričakovano vedenje:
`/go/*` postane monetiziran BREZ spremembe kode.

---

## 5. LETI — ORIGIN (§7): ODLOČITEV + DOKAZ

**Ugotovitev:** `SupplyQuery` (`src/lib/supply/types.ts:240-255`) nima
izvornega letališča — potrjeno. Arhitektura je pripravljena: adapterja
Skyscanner/Travelpayouts ob prisotnem žetonu BREZ izhodišča vrneta
`[]` z opombo **»origin-required«** (registry.ts:539-543, 691-695 —
`deps.originPlaceId` resolver pripravljen); `TRAVELPAYOUTS_ORIGIN`
(IATA) je operaterska konfiguracija, ki se NE šteje kot konfiguracija
vira (TASK 53 §21).

**Odločitev (1.157.0):** vnos poljubnega `origin` v SupplyQuery brez
semantične spremembe JE izvedljiv (opcijsko polje), vendar obema
letnima providerjama manjkata žetoni (BLOCKED) — UI, ki bi zahtevalo
izhodišče, bi danes služilo izključno opombi »origin-required«.
Skladno z načelom najmanjše pravilne spremembe se polni UI vnos
odloži do prvega aktiviranega letnega vira; stanje `origin-required`
je že danes jasno prikazano v supply odgovoru (adapter note) in
zaklenjeno s testi (`task53-no-credential-mode` — origin gate).

---

## 6. E-POŠTA / RESERVATION IMPORT (§10): DORMANT, POT DOKUMENTIRANA

`/api/journey/bookings/email-inbound` je tehnično pripravljen (surovo
RFC 5322 → OSNUTEK DRAFT; `SESSION_KEY_RE` vrata). Aktivacija zahteva:
(1) `DSA_EMAIL_INBOUND_TOKEN` v env, (2) naključni posredovalni naslov
pri ponudniku vhodne pošte (SendGrid Inbound Parse / Postmark / SES).
Brez tega je kanal iskreno zaprt (404/401) — javnega naslova NI
smemo izmisliti (Issue #20 §10). Konzistenca koda ↔ README ↔ UI:
preverjena (UI zavihek Pošta kaže dormant stanje z navodili).

---

## 7. ENOTEN PRODUCTION ACTIVATION CHECK (§11) ✅

```bash
bun run activation:check           # tabela: stanje, stopnja, live, dostop, CTA, cena, env Boolean
bun run activation:check -- --json # strojno berljivo (CI/dokumentacija)
```

Izpis vsebuje IZKLJUČNO stanja/Booleane/klasifikacije — nobene
vrednosti env (test kanarček). Jedro: `src/lib/supply/activation-check.ts`
(prehodno izključno iz matrike+registra — agent stanj NE more
»lepšati«); ovoj: `scripts/activation-check.ts` (tanjek, testirano).

**ENV DOKUMENTACIJA (1.163.4 — pripravljenost na vstavitev ključev).**
`.env.example` pokriva vsako produkcijsko env ime: dodan
`JOURNEY_PROVIDER_TOKEN` (§9 kanal ponudniških prehodov — fail-closed 503
brez žetona), zastavice zagona/izdelave (`DSA_DISABLE_SCHEMA_MIGRATION`,
`DSA_DISABLE_BASELINE_RESOLVE`, `DSA_DISABLE_IMAGE_MIGRATION`,
`DSA_PRISMA_QUERY_LOG`, `DSA_LOW_MEMORY_BUILD`, `DIST_DIR`,
`DSA_ALLOWED_DEV_ORIGINS`), razvojna orodja (`BASE_URL`, `RUN_AT_UTC`,
`ADMIN_DEMO_SEED`, `DEV_FIXED_DEMO_PASSWORDS`); mrtvi `APP_URL` odstranjen,
`STRIPE_PUBLISHABLE_KEY` pošteno označen NEBRAAN (čisti strežniški
redirect tok). Drift med kodo in dokumentacijo varuje pogodbenski test
`issue20-env-documentation-contract` (5 testov: brano → dokumentirano;
dokumentirano → brano ali izrecna izjema).

---

## 8. README USKLADITEV (§12) ✅

- Popravljen zastareli zapis »4142 testov« → dejansko stanje suite-a
  (4413 testov: 4412 pass + 1 DB-gated preskok brez baze — CI-semantika).
- Zgodovinski auditi niso spreminjani; dodana omemba `activation:check`.

---

## 9. REGRESIJSKI STATUS (zadnja: 1.163.4)

`bun test` 4462 (4461 pass + 1 DB-gated preskok brez baze — CI-semantika:
v CI s Postgresom je ta test zelen, glej vsak-push CI) ·
`bun run lint` 0 · `bunx tsc --noEmit` 0 — vključno z novimi 37 testi
`issue20-marketplace-checkout` (1.157.0: 4425; 1.156.2: 4413).
Produkcijski smoke: §2 (faza 1, 5 dokazov) + strukturni dokazi §3
(faza 2 — živi smoke čaka Stripe račun).

**1.163.4:** `bun test` 4757 (4756 pass + 1 DB-gated preskok brez baze —
CI-semantika: v CI s Postgresom je ta test zelen) · `bun run lint` 0 ·
`bunx tsc --noEmit` 0 — vključno s 5 novimi testi env dokumentacije
(`issue20-env-documentation-contract`).

---

*Zgodovina faz: 1.157.0 (faza 1 — §3 lastna tržnica produkcijsko
preverjena + dvig LIVE_DATA_VERIFIED, §11 activation:check, §5 ta
dokument, §12 README uskladitev, §4/§6/§7/§9/§10 dokumentirana
stanja) · **1.158.0 (faza 2 — §4 B2C aktivacijska pot implementirana:
pending rezervacije + Stripe seje + webhook prehodi + sprostitve +
povratni banner; iskrena popravka oznake faze 1; JourneyBooking ima
14 statusov — 13 + DRAFT iz Issue #4)**. Naslednji koraki: aktivacija
Stripe računa (zunanje), prvi partner-submitted geo zapis (zunanje),
odložitev UI origin (§7).*
