# ISSUE #4 §1 — BASELINE AUDIT (READ-ONLY, 0 sprememb kode)

> **Datum:** 2026-09-24 · **Revizija:** v**1.91.1** (`ce7bf6c`) · **Produkcija:** Render
> `i-feel-slovenia.onrender.com` (primarna) + Vercel `i-feel-slovenia.vercel.app`
> (sekundarna) — obe **1.91.1**, health OK.
> **Metoda:** samo-branje kode + žive sonde API + browser E2E (dokazi iz TASK 4
> fix pass verifikacije + sveže sonde tega audita). Ta dokument izpolnjuje
> obvezni §1 zahtevan pred vsako implementacijo Issue #4.
> **Spremembe kode:** 0 (samo ta dokument).

---

## A. SISTEMSKI INVENTAR (dokazi v kodi)

| Območje | Dejstvo | Dokaz |
|---|---|---|
| Verzija / commit | v1.91.1 / `ce7bf6c` (main = origin) | package.json, git |
| Javne strani | **38** `page.tsx` ( + `/en` prefix ruta) | `rg --files src/app -g page.tsx` |
| API rute | **127** `route.ts` (49顶-level sklopov: itinerary, journey, supply, owner, admin, stripe, cron×8, analytics×4 …) | `rg --files src/app/api` |
| Prisma modeli | **30** (User, Owner, SavedItinerary, TripGuide/Vote/Comment/Like/Poll/PollVote/DiaryEntry, Listing, ListingEvent, Product, Experience, Review, Order, Booking, JourneyBooking, Sponsorship, PageView, AnalyticsEvent, AIUsageLog, AuditLog, LocalQuestion, ProcessedStripeEvent, Consultation, PushSubscription, CommissionInvoice, Lead, NewsletterSubscriber) | prisma/schema.prisma |
| Supply adapterji | **12** (viator, getyourguide, tiqets, booking, skyscanner, airalo, travelpayouts, kiwitaxi, fsq, osm, own, aggregate adapter) | src/lib/supply/providers/ |
| Planner enginei | AI veriga OpenRouter→Gemini→Puter→z-ai (ai-client.ts) + **deterministični motor** (deterministic-itinerary.ts) + chat-domain-fallback + ai-recommendations + plan-check | src/lib/ |
| Statusna taksonomija | `LifecycleStage` (11 stopenj: DISCOVERED→…→PRODUCTION_ACTIVE), `ProviderAccessKind` (8 vrst), `BlockReason` (6), `PriceClassification` (LIVE_PRICE/FROM_PRICE/UNKNOWN/NOT_SUPPORTED), `AvailabilityClassification` (LIVE/UNKNOWN/NOT_SUPPORTED) | src/lib/supply/production-matrix.ts:46-104 |
| Trde meje AI | generacija 70 s · refine 60 s · smart-search 15 s (Promise.race, padec v poštene rezerve) | itinerary/route.ts, refine/route.ts:577, smart-search/route.ts:165 |
| Trust markerji | `weatherEstimated` (K-2), `openingHoursChecked` (K-3) | types.ts, planner-trust-line.tsx |
| i18n | javno **SL (default) + EN** (`/en`, whitelist poti); de/it = legacy 308; **1612 ključev parity** sl/en | src/i18n/routing.ts, messages/ |
| PWA | manifest.json + sw.js + offline.html | public/ |
| CI | **3 workflowi**: ci.yml (testi+build vs. Postgres), ai-smoke.yml, prod-monitor.yml | .github/workflows/ |
| Cron | 8 rut (kiwitaxi-reingest, sto-reingest, daily-trip-push, draft-reminders, renewal-reminders, weekly-alerts, commission-invoices, recalculate-status) | src/app/api/cron/ |
| Testi | **2317/2317** · lint 0 · tsc 0 (src/) | bun test 24. 9. 2026 |

---

## B. ŽIVI DOKAZI (sonde + E2E, 24. 9. 2026)

| Sonda | Površina | Rezultat |
|---|---|---|
| /api/health | Render + Vercel | 200, **1.91.1**, vsi startup checki OK |
| POST /api/itinerary (2 dni, Bled) | Render | 200 v 75,8 s, `source:fallback`, `weatherEstimated:[true,true]`, `openingHoursChecked:false` — K-2/K-3 živi |
| POST /api/itinerary | Vercel | 200 v 71,1 s, `weatherEstimated:[false,false]` — **realno vreme** (delno oblačno 18°/20°); poštena divergenca površin (K-1 = Render egress) |
| POST /api/smart-search | Vercel | 200 v **12,4 s** (prej 35 s–10 min), `source:fallback`, pošten summary »Hitro iskanje po ključnih besedah…« + zadetki destinacij — K-5 živ |
| GET /api/destinations | Render | 200, **38 destinacij** (Bled, Bohinj, Ljubljana, Postojnska jama, Piran …) |
| Browser E2E: /pot/fb4162e781 | obe | 0 lažnih ✓ (§4 retroaktivno); gumb »Zaženi Na poti« → `dai:go-trip` v2 → /na-poti izriše »Načrtovani postanek — brez rezervacije« + Navigiraj + Nazaj na načrt — **K-7 živ na obeh** |
| Browser: mobilni meni 390 px | obe | »Na poti« prisoten (K-12); 0 konzolnih napak |
| /api/chat | (audit 1.90.0) | 8,7 s, `source:openrouter` — AI dela |

---

## C. MATRIKA §1 — Funkcija | Trenutno | Dokaz v kodi | Live/E2E dokaz | Omejitev | Naslednji korak

> Statusi po zahtevi Issue #4: **LIVE / CODE READY / CONTRACT VERIFIED / DEMO /
> EXTERNAL HANDOFF / NOT ACTIVE / TODO** (preslikava na `LifecycleStage` v A).

### C1. PLAN (jedro)

| # | Funkcija | Trenutno | Dokaz v kodi | Live/E2E | Omejitev | Naslednji korak |
|---|---|---|---|---|---|---|
| 1 | AI načrtovanje (multi-turn, SL/EN) | **LIVE** | ai-client.ts veriga 4 providerjev + 70 s cap | sonde 71–76 s fallback; chat 8,7 s AI | OpenRouter free vrsta (latenca) | §11 observability (tokeni/stroški/retry) |
| 2 | Deterministični motor (0 žetonov) | **LIVE** | deterministic-itinerary.ts | vsaka fallback sonda vrne veljaven načrt | sezonsko vreme = ocena (iskreno označeno) | §10 razširi odločitveno plast |
| 3 | Refine (6 čipov + prosti ukaz) | **LIVE** (K-4 fix) | refine/route.ts Promise.race 60 s + AbortController/števec FE | fix-pass E2E lokalno + proizvodnja <60 s | odgovor je AI-rezerva ob capu | §2 vključi v Trip objekt |
| 4 | AI iskanje (smart-search) | **LIVE** (K-5 fix) | 15 s cap + lokalna keyword rezerva | 12,4 s, fallback, zadetki | kvaliteta keyword iskanja | preklopi na DIRECT ključe (operater) |
| 5 | Trust vrstica | **LIVE** (K-2/K-3) | weatherEstimated + openingHoursChecked markerji | obe površini živi (true/false divergenca) | stari shranjeni načrti brez markerjev → postavke se ne izrišejo (pravilno) | §9 opening hours (DST/prazniki/overnight) |
| 6 | Geo validacija + OSRM razdalje | **LIVE** | geo-validation.ts, method osrm | audit: realne ceste, 165 km težava iskreno | hevristika ob padcu (pošteno označena) | §8 real-time kontekst v GO |
| 7 | Vreme (Open-Meteo) | **LIVE** (Vercel) / iskrena ocena (Render) | enrichWithRealWeather + estimated marker | Vercel realno 18°; Render true=ocena | **K-1: Render egress** (infra, operater) | diagnostika Render omrežja |
| 8 | Shrani + deli (/pot/[shareId]) | **LIVE** | itinerary/save + shared/[shareId] | /pot/fb4162e781 javno dostopna | — | §2 Trip enoten objekt |
| 9 | My Trip (gost) | **LIVE** (K-6 fix) | my-trips-storage.ts getSavedTrips | fix-pass E2E (390 px, 0 preliva) | sinhronizacija zahteva račun (iskreno) | §13 kolaboracija |
| 10 | GO most (načrt→Na poti) | **LIVE** (K-7 fix) | journey/itinerary-go.ts + go-persist v2 | E2E obe površini | termini iz time_slot (brez rezervacij) | §3 lifecycle rezervacij |
| 11 | Go Mode (/na-poti, offline, GPS) | **LIVE** | go-mode.tsx, sw.js, offline.html | E2E izris naslednjega postanka | K-16 offline hard reload (SW cache) | §8 real-time (delay/traffic = UNKNOWN) |
| 12 | Start Anywhere (4 zavihki) | **LIVE** | ingest / ingest-image / ingest-pdf / ingest-pins | audit T2 (scroll + PDF tab) | extraction zahteva potrditev (pravilno) | §12 E2E napačnega kraja |
| 13 | Packing/e-pošta/.ics/TTS izvoz | **LIVE** | akcijska vrstica + rute | audit: gumbi delujejo | — | — |

### C2. DISCOVER

| # | Funkcija | Trenutno | Dokaz v kodi | Live/E2E | Omejitev | Naslednji korak |
|---|---|---|---|---|---|---|
| 14 | Destinacije (38) + modal | **LIVE** | DESTINATIONS dataset + destination-modal | sonda: 38; Bled/Bohinj/Ljubljana | — | — |
| 15 | POI sloj (OSM/Overpass) | **LIVE** | supply/osm-adapter.ts + /api/pois | audit: živi POI po viewportu | občasni timeouti (iskren degraded) | caching |
| 16 | FSQ dataset 125.446 krajev | **LIVE** (statična množica) | data/ + fsq adapter | odkrivanje deluje | statičen posnetek | osvežitev posnetka |
| 17 | Zemljevid + žetoni dni | **LIVE** | Leaflet + OSRM geometrija | audit: pot na zemljevidu | zoom tipki 390 px (K-16 LOW) | poliranje |
| 18 | Tržnica/izdelki/izkušnje/lokali/dogodki | **LIVE** (lastna DB, pošteno) | 127 rut, Listing/Product/Experience | strani žive | vsebina = demo-seed (pošteno) | pilot 10 ponudnikov |
| 19 | Vodiči + Vprašaj lokalca | **LIVE** | vodici/[slug] + /api/ask-local | audit ✓ | — | — |
| 20 | Klepetalnik (FAB) | **LIVE** | /api/chat + domain fallback | 8,7 s openrouter | brez zgodovine med sejami | — |
| 21 | Glasovni klepet (STT+TTS brskalnik) | **LIVE** | lib/voice + /api/tts | Issue #2 E2E | brskalnikova podpora (iskren fallback) | — |
| 22 | Slovenia Pass / primerjava / kviz | **LIVE** | strani + komponente | audit ✓ | — | — |

### C3. BOOK (resnica rezervacij — §3/§5/§6 jedro)

| # | Funkcija | Trenutno | Dokaz v kodi | Live/E2E | Omejitev | Naslednji korak |
|---|---|---|---|---|---|---|
| 23 | Affiliate /go redirect (10 partnerjev) | **EXTERNAL HANDOFF (LIVE)** | /go/[provider] + recordExternalHandoff | audit: preusmeritev na pravi Booking.com iskalnik; 0 vtisa »rezervirano« | handoff ≠ rezervacija (pravilno) | §3 formalni lifecycle |
| 24 | BookingPanel (partner+iskanje+vstopnice) | **LIVE** | booking-panel.tsx + dsa:ln dogodek (K-14) | audit: gumbi pošteni | FROM_PRICE šele z aktivnimi ključi | §6 cenovni model |
| 25 | Lastna tržnica — povpraševanja | **LIVE** | listing-inquiry + leads + owner KPI | pilot protokol P4-6 dokazan | — | §4 import rezervacij |
| 26 | Lastna tržnica — checkout | **DEMO / 501** | checkout/route.ts:341 (DSA_DEMO_PAYMENTS=1 sicer 501) | produkcija: 501 iskren | **TODO Stripe** (naročnina owner ŽE pravi Stripe) | izdelki/izkušnje na pravi Stripe |
| 27 | Viator / GYG / Tiqets / Booking / Skyscanner / Airalo / Travelpayouts | **CODE READY / NOT ACTIVE** (ključi MISSING) | 7 adapterjev + production-matrix (vrata živa: 401/403 pošteno) | iskreno prazni sloji | ključi = operater (Awin, partner approval) | prvi LIVE: Travelpayouts (self-serve) ali Viator |
| 28 | KiwiTaxi (transferji) | **CODE READY + DATA** | kiwitaxi adapter + ingest + 2,18 MB routes | reingest cron živ | PAP ID = operater | KIWITAXI_PAP_ID |
| 29 | DiscoverCars / Omio / WN-SW / CJ / Impact / Awin | **CONTRACT VERIFIED** | production-matrix entries | — | pogodbe zunaj dosega | po prioritetah posla |
| 30 | Stripe naročnina (owner) | **LIVE** | stripe/checkout+portal+webhook + ProcessedStripeEvent | README resnica: pravi Stripe | — | — |

### C4. PLATFORMA

| # | Funkcija | Trenutno | Dokaz v kodi | Live/E2E | Omejitev | Naslednji korak |
|---|---|---|---|---|---|---|
| 31 | Owner portal (dashboard/listings/izkušnje/provizije/sponzor) | **LIVE** (pilot-ready) | owner/* rute + Owner model | PILOT-TEST-PROTOCOL v1.1 | 1 fotografija / znak partnerja (P4 popravljeno) | pilot 10 ponudnikov |
| 32 | Admin (zid gesla) | **LIVE** | admin/* + AuditLog | audit ✓ | — | — |
| 33 | Analytics (dogodki, lijak, A/B, provider-ROI) | **LIVE** | analytics/* + AnalyticsEvent + track-funnel | fix-pass: refine_cancelled/go_mode_started | — | §11 AIUsageLog nadgradnja |
| 34 | Observability (health, ai-health) | **LIVE** | health + ai-health rute | sonde OK | — | alerting (prod-monitor CI) |
| 35 | Skupnost (glasovanja/komentarji/všečki/ankete/dnevnik) | **LIVE** | TripVote/Comment/Like/Poll/Diary + rute | deljena stran z glasovanjem | — | §13 permissions (owner/editor/viewer) |
| 36 | i18n SL/EN | **LIVE** | routing.ts whitelist; 1612 ključev parity | /en deluje | de/it legacy 308 | — |
| 37 | PWA instalabilnost | **LIVE** | manifest + sw + offline.html | audit: gumb za namestitev | offline hard reload (K-16) | SW toplo-predpomnilnik |
| 38 | Auth (NextAuth + email verify + push) | **LIVE** | auth/[...nextauth] + verify + PushSubscription | login zid deluje | SMTP = operater (reset po DB) | SMTP nastavitev |
| 39 | CI + migracije + ingest skripti | **LIVE** | 3 workflowi + scripts/db + cron-runner | zelen CI; 2317 testov | — | — |

---

## D. SODBA (baseline za Issue #4)

1. **Sistem je obsegovno ZDRAV in ŽIV:** 38 strani · 127 rut · 30 modelov ·
   12 adapterjev · 2317 testov · obe produkciji 1.91.1 · 0 lažnih trditev
   (TASK 4 zaprt z živimi dokazi).
2. **Statusna taksonomija IZHUČI ZAHTEVO §1:** LifecycleStage/AccessKind/
   BlockReason/PriceClassification/AvailabilityClassification že obstajajo v
   kodi — Issue #4 §5 capability matrix lahko RAZŠIRI obstoječe, ne pa
   izumlja novo.
3. **Največje vrzeli po §2–§16 (vrstni red po vrednosti):**
   - **§3/§5/§6 booking+price resnica** — lifecycle Discovery→Handoff→
     External→Confirmed še ni formaliziran v DB (JourneyBooking/Booking
     obstajata, a brez lifecycle statusov); cenovni model ima
     klasifikacije, UI pa še ne izriša UNKNOWN povsod.
   - **§2 Trip enoten objekt** — podatki so razpršeni (SavedItinerary,
     go-trip v1/v2 localStorage, JourneyBooking, TripGuide); domain map
     obstoječega je predpogoj (NI novih modelov požeči).
   - **§9 opening hours** — closed_month/closed_weekday delujejo SAMO z
     datumom (K-3); manjkajo timezone/DST/prazniki/overnight in
     OPEN/CLOSED/UNKNOWN statusi v GO.
   - **§11 AI observability** — AIUsageLog obstaja; manjka strošek/token
     metering per provider + retry vidnost.
   - **§13 kolaboracija** — permissions (owner/editor/commenter/viewer)
     ne obstajajo (samo javni komentarji/glasovanja).
4. **Nič od tega ne blokira pilota** — pilot 10 ponudnikov lahko teče
   ZDAJ (PILOT-TEST-PROTOCOL v1.1), Issue #4 dela vzporedno.

## E. PREDLAGANI NASLEDNJI KORAK (implementacijski val 1)

Po §1 disciplini = najprej **najmanjša rešljiv, najvič vrednosti**:
1. **§3 rezervacijski lifecycle** (status polje + prehodi, brez lažnega
   confirmed) — odklene §5/§6/§8 UI resnico;
2. **§6 cenovni model UI** (UNKNOWN izris povsod, FROM_PRICE ločeno);
3. **§9 opening hours UNKNOWN** (timezone/DST statusi);
4. **§11 AIUsageLog metering**.
   Vsak korak: testi + pošten UI + 0 izgube funkcij.

---

## F. IMPLEMENTACIJSKI VAL 1 — ZAKLJUČEN (2026-09-24, v1.92.0)

> Po predlogu iz oddelka E. Metoda: meriti → popraviti → dokazati.
> **0 sprememb, ki bi izgubile funkcijo; 0 zmede dodane.**

| Sklop | Dostavljeno | Dokaz |
|---|---|---|
| **§3 lifecycle na AI časovnici** | Žeton »Brez rezervacije« → gumb »Rezerviraj pri ponudniku« → EXTERNAL zapis (POST 201, session-scoped) → vijolični »Zunanja rezervacija — pri ponudniku«; strežniška deterministična `/go/{provider}?product={id}` (viator/gyg) v validacijski verigi; sanitize polja ohrani pri shranjevanju | E2E: generacija z viator FIXED izbiro → klik → 201 + viator.com + žeton prevrnjen (ux-verify-issue4/timeline-external-chip.png) |
| **§6 cenovna resnica** | dayCostSummary (NaN/null ≠ €0): dnevna vsota + »N postankov z neznano ceno«, glava »~€X · vključuje N neznanih cen«, amber žeton »Cena ni preverjena«; product-card/modal »Cena neznana« pri virih z cenami; MY TRIP vrstica »cena neznana pri ponudniku« | E2E: »Dan 1 skupaj: 80 · 1 postanek z neznano ceno« + header kvalifikacija (timeline-booking-price-chips.png); 16+8 enotskih testov |
| **§9 statusi ur** | lib/opening-hours.ts — parser preproste OSM podmnožice (čez-noč, pavze, off, 24/7), nepodprto → iskren UNKNOWN; žeton ZDAJ ODPRTO/ZAPRTO/URA NEZNANA + podrobnost + SUROV niz ohranjen; GO Mode (naslednja + preostali) + journey-planner; DST-varna stenska ura (useSyncExternalStore, hidracijsko varno) | E2E: »ZDAJ ODPRTO · odprto do 17:00 · Mo-Fr 08:00-17:00; Sa 09:00-13:00; Su off« + »URA NEZNANA · zapleten zapis ur — preveri pri ponudniku« (go-mode-hours-chip.png) |
| **§11 AI metering** | AIUsageLog 0 → VSE površine (16 AI rut + vizija + TTS sinteze/LRU + priporočila cache + fallback/deterministic vrstice); rezultat verige nosi latencyMs/model/žetone; poskusi verige v metadata.attempts (retry vidnost); admin bralnik GET /api/admin/ai-usage + zavihek »AI poraba« | Živo: vrstica `search/z-ai-sdk` ms=1486 žetoni 1084/101 attempts=[openrouter:not-configured→z-ai-sdk:ok]; itinerary none→fallback vrstice; admin 401 brez gesla; 48 novih testov |

**Testi:** 2365/2365 (+48) · lint 0/0 · tsc 0 (src/) · 0 konzolnih napak v E2E.

**Naslednji val (predlog):** §2 Trip enoten objekt (domain map → odločitev) →
§8 real-time kontekst v GO → §13 kolaboracija permissions. Pilot 10 ponudnikov
ostaja vzporeden in neblokiran.

---

## G. IMPLEMENTACIJSKI VAL 2 — ZAKLJUČEN (2026-09-24, v1.93.0)

> Po predlogu iz oddelka F (§2 → §8 → §13). Ista disciplina: meriti →
> popraviti → dokazati. **0 sprememb, ki bi izgubile funkcijo.**

| Sklop | Dostavljeno | Dokaz |
|---|---|---|
| **§2 Trip enoten objekt** | Domain map najprej (docs/TRIP-DOMAIN-MAP.md — 8 modelov na shareId, 17 klientskih ključev, sodba: normalizacija ZAVRJENA); `GET /api/trip/[shareId]` agregator (načrt/vodnik/skupnost/rezervacije/verzija/vloga — sodelujoče samo lastniku); `dai:go-trip` v2 nosi `shareId` (identiteta načrta = varovalka: sprememba vsebine ugasne vezo) | Živo: `role:VIEWER` anonimno / `role:OWNER + collaborators[]` z žetonom; E2E: GO Mode »Odpri shranjeno pot« → /pot/{shareId} (go-mode-eta-live.png) |
| **§8 real-time kontekst** | Vozni časi potujejo z načrtom (legs → legFromPrev + route povzetek dneva z delno poštenostjo); ETA samo iz realnih vhodov (GPS+geo, hevristika labelirana) sicer izrecno NEZNANO; zamude/promet izrecno NEZNANO; nav handoff z `origin=`; v2 postanki brez ur → URA NEZNANA; §3 booking žetoni na GO | E2E z GPS: »PREDVIDEN PRIHOD ~14:23 (~60 km · ~65 min · ocena iz premočne razdalje ×1,3 …)« + nav URL `&origin=46.056900,14.505800`; brez GPS: »Prihod: neznano« + »Zamude … NEZNANO« (go-mode-eta-delay-route.png, go-mode-hours-nav-origin.png) |
| **§13 permissions** | trip-permissions.ts (OWNER/EDITOR/COMMENTER/VIEWER/NONE, ena točka resnice); TripCollaborator (PENDING→ACTIVE→REVOKED, žetonska vabila, e-poštna vez, idempotenca, meja 20); PATCH vsebine s CAS (contentVersion, 409 s strežnikovo verzijo); isPublic revokacija (404 = obstoj skrit; zaklep-varovalka za anonimne lastnike); communityTripGate mehka vrata (6 rut, javne = 0 spremembe); AuditLog 7 novih akcij | E2E z sejo: vabilo → sprejem → »Vabilo sprejeto — tvoja vloga: Komentator«; preimenovanje 200 (v0→v1→v2→v3) + 409 ob zaprti verziji; revoke → »dostop odvzet« + »Povabi znovo«; zasebna pot: anonimni 404 (stran+API), sodelujoči 200, anonimni komentar 403 (invite-accepted.png, owner-panel.png, owner-revoked.png) |

**Testi:** 2386/2386 (+21) · lint 0/0 · tsc 0 (src/) · 0 konzolnih napak v E2E ·
7 dokazov v ux-verify-issue4-val2/.

**Operativno:** additive migracije (schema + baseline SQL + idempotentna
zagonska) · dev .env dopolnjen z NEXTAUTH_SECRET/URL (getServerSession v
lokalnem devu brez njiju ni deloval — produkcija ima že od prej).

**Naslednji val (predlog):** §4 import rezervacij/dokumentov (ročni vnos +
PDF/slika parsing z DRAFT potrditvijo) → §7 transport resnica → §14 budget
ločeno od ocen. Pilot 10 ponudnikov ostaja vzporeden in neblokiran.
