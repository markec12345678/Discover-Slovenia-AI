# FEATURE MATRIX — UX REDESIGN "ONE SIMPLE EXPERIENCE" (Issue #3)

> Status: **v1.3 — posodobljeno 2026-09-24 (v1.93.0, ISSUE #4 val 2: §2/§8/§13). Audit v1.0: HEAD `8ff87e8`.**
> Vir: revizija 5-A/5-B/5-C/5-D (worklog) — 38 strani, 48 API skupin, 121 lastnih komponent.
> PRAVILO: **ZERO FEATURE LOSS.** HIDE ≠ DELETE. Ob dvomu → KEEP.
> Model ciljne izkušnje: **DISCOVER → PLAN → BOOK → GO** (uporabnik ne razume arhitekture).

## 1. MATRIKA ZMOŽNOSTI (vse obstoječe — nič se ne briše)

| Zmožnost | Trenutna lokacija | Backend/API | Trenutni UX | Nova UX lokacija | Vidnost | Delete |
|---|---|---|---|---|---|---|
| AI načrtovalec (želeni vnos) | / hero + /nacrtuj (NL primarni) | POST /api/itinerary (auto) | primarna | DISCOVER→PLAN | VISIBLE | NE |
| Deterministični motor (Brez AI) | /nacrtuj engine toggle (napredno) | isti endpoint (engine=deterministic) | zloženo | PLAN (napredno) | CONTEXTUAL | NE |
| Start Anywhere: povezava/slika/PDF/točke | /nacrtuj ingest zavihki (4) | /api/itinerary/ingest[-image/-pdf/-pins] | sekundarni blok | DISCOVER (sekundarna vrstica) + PLAN | CONTEXTUAL | NE |
| Kviz potovalnega stila | /nacrtuj#kviz | klientki (3 koraki → želja) | spodaj | PLAN (spodaj) | CONTEXTUAL | NE |
| AI refinement (free-text) | /nacrtuj desni stolpec "Spremeni načrt" | POST /api/itinerary/refine | zavihek v railu | PLAN — AI KONTROLNA VRSTICA nad dnevom (vidna takoj) + rail | VISIBLE | NE |
| Hitre akcije (6 determinističnih) | znotraj ItineraryRefiner | isti refine endpoint (action+day) | zloženo v rail | PLAN — AI kontrolna vrstica (čipi) + rail | VISIBLE | NE |
| Vprašaj o načrtu (PlanCopilot) | rail zavihek "Vprašaj" | POST /api/itinerary/ask | zavihek | PLAN rail (ostane) | CONTEXTUAL | NE |
| Zemljevid poti (OSRM, barve dni) | /nacrtuj TripMapPanel + /zemljevid + /pot | leaflet + OSRM | delovna površina | PLAN (osrednji objekt) | VISIBLE | NE |
| Vreme (Open-Meteo, po dnevu) | dnevne kartice badge | /api/weather (generacija vnese) | kontekstualno | PLAN dnevni + GO | CONTEXTUAL | NE |
| Odpiralni časi (validacija + STATUS) | geoValidation issues + GeoValidationPanel + OpeningHoursStatus | F5.5 pravila closed_month/weekday + lib/opening-hours.ts (parser OSM podmnožice) | zloženo v "Podrobnosti" | PLAN trust vrstica ✓/⚠ + GO žeton ZDAJ ODPRTO/ZAPRTO/URA NEZNANA (1.92.0 §9) | CONTEXTUAL | NE |
| Geo-validacija poti | PlannerStatusStrip + panel | geoValidation (80/150 km) | ploščice + zloženo | PLAN trust vrstica + ploščice | CONTEXTUAL | NE |
| Optimizacija zaporedja (2-opt) | gumb v dnevu | klient | kontekstualno | PLAN dan | CONTEXTUAL | NE |
| Postanek ob poti / kosilo | PlannerLegSuggestions/MealStop | /api/itinerary/stops-along-way | kontekstualno | PLAN dan | CONTEXTUAL | NE |
| Rezervacija (kontekstualna) | BookingPanel po dnevu + /go/* | /api/supply + /go/[provider] | dnevni paneli | PLAN/BOOK kontekstualno | CONTEXTUAL | NE |
| Journey /potovanje (7 kategorij) | /potovanje (NI v navigaciji!) | /api/journey/* | pokopana stran | PLAN sekundarna (footer + povezave) | CONTEXTUAL | NE |
| Go Mode /na-poti (offline, GPS) | /na-poti — od 1.91.0 (K-12) tudi v MOBILNEM meniju; most »Zaženi Na poti« z /nacrtuj in /pot/[shareId] (K-7) | 100 % klient (dai:go-trip, v2 tudi itinerary) | prej pokopana stran | GO — footer + mobilni meni + most iz AI načrta | CONTEXTUAL | NE |
| Go Mode real-time kontekst (1.93.0 §8) | /na-poti hero kartica + vrstica poti dneva | itinerary.legs potujejo z načrtom (legFromPrev + route povzetek) | ETA ~HH:MM (ocena, samo z GPS) / izrecno neznano; zamude NEZNANO; vozni časi z virom OSRM/ocena; nav handoff z origin= | GO | CONTEXTUAL | NE |
| Shrani in deli | /nacrtuj akcijska vrstica | POST /api/itinerary/save (shareId+editToken) | spodaj | PLAN akcije | VISIBLE | NE |
| Deljena pot /pot/[shareId] | javna stran + skupnost | GET shared | ločena stran | MY TRIP (javni pogled) | VISIBLE | NE |
| Moja potovanja | /moja-potovanja (samo mobilni meni!) | /api/user/trips | namenjena stran | MY TRIP — navigacija tudi na desktopu | VISIBLE | NE |
| E-pošta / .ics / poslušaj (TTS) | akcijska vrstica | /api/email-itinerary, .ics klient, /api/itinerary/tts | vrstica spodaj | PLAN akcije (ostane) | CONTEXTUAL | NE |
| Zvočni klepet (STT/TTS brez ključa) | Chatbot FAB (13 strani) | /api/chat | plavajoči | GLOBAL (ostane) | CONTEXTUAL | NE |
| Klepet domenski fallback | isto | chat-domain-fallback | badge | isto | CONTEXTUAL | NE |
| Smart iskanje | header ikona | /api/smart-search | dialog | GLOBAL header | CONTEXTUAL | NE |
| Vprašaj lokalca / konzultacija | /vodici + /konzultacija/[token] | /api/ask-local, /api/consultations | stran + dialog | EXPLORE/vodici | CONTEXTUAL | NE |
| Destinacije (38) + kolekcije | /destinacije + modal | /api/destinations | katalog | DISCOVER/EXPLORE | VISIBLE | NE |
| Zemljevid odkrivanja (sloji, POI) | /zemljevid | /api/supply/search (zoom-gated) | stran | EXPLORE | VISIBLE | NE |
| Dogodki | /dogodki + dodaj v pot | statični nabor + CustomEvent | stran | EXPLORE | CONTEXTUAL | NE |
| Lokali (B2B imenik) | /lokali | /api/listings | stran | EXPLORE | VISIBLE | NE |
| Tržnica (izdelki/izkušnje) | /trznica + /dozivetja | /api/products, /api/experiences | stran | EXPLORE/BOOK | VISIBLE | NE |
| Košarica / checkout (demo/501) | drawer + checkout | /api/checkout, /api/stripe | drawer | BOOK (ostane) | CONTEXTUAL | NE |
| Rezervacija izkušnje | ExperienceModal | /api/bookings (DSA_DEMO_PAYMENTS) | modal | BOOK kontekstualno | CONTEXTUAL | NE |
| Povpraševanje po lokalu | ListingModal BookingAssistant | /api/listing-inquiry | modal | BOOK kontekstualno | CONTEXTUAL | NE |
| Affiliate hub (10 partnerjev) | homepage sekicja + /go/* | /go/[provider] (fail-closed, monetized flag) | sekcija | DISCOVER spodaj (Rezerviraj) | CONTEXTUAL | NE |
| Rezervacijski lifecycle na AI časovnici (1.92.0 §3) | trip-timeline postanki z /go izdelkom | POST /api/journey/bookings (EXTERNAL, idempotentno) + GET prekrivka | žeton Brez rezervacije → Zunanja rezervacija | PLAN (časovnica) — ISTA semantika kot MOJA POT/GO | CONTEXTUAL | NE |
| Cenovna resnica časovnice (1.92.0 §6) | trip-timeline + cost-truth.ts | supply validacija NaN sentinel | dnevna vsota + N z neznano ceno + žeton na postanku | PLAN (časovnica + glava ~€ kvalificirana) | CONTEXTUAL | NE |
| AI metering (1.92.0 §11) | ai-client/ai-usage.ts + admin zavihek | AIUsageLog (VSE AI površine + fallback/cache) | admin agregati 7/30 dni + retry vidnost | PLATFORMA (admin) | CONTEXTUAL | NE |
| Trip enoten objekt (1.93.0 §2) | GET /api/trip/[shareId] (agregator: načrt+vodnik+skupnost+rezervacije+verzija+vloga) + dai:go-trip v2 shareId | SavedItinerary + 8 modelov na shareId (0 novih težkih) | Go Mode povezan s shranjeno potjo (Odpri shranjeno pot) | PLATFORMA (stanje poti) | CONTEXTUAL | NE |
| Sodelovanje z dovoljenji (1.93.0 §13) | /pot/[shareId] plošča (lastnik/urednik) + ?invite= trak | TripCollaborator (PENDING/ACTIVE/REVOKED) + trip-permissions.ts (5 vlog) + PATCH vsebine s CAS | povabi/odvzemi/spremeni vlogo + javna↔zasebna povezava + preimenovanje (409 konflikt) | MY TRIP (skupnostno) | CONTEXTUAL | NE |
| Skupnost: glasanje/komentarji/všečki/ankete/dnevnik | /pot/[shareId] | /api/trip-vote, trip-likes, trip-comments, poll, diary | deljena stran | MY TRIP javni pogled | CONTEXTUAL | NE |
| Skupnost: odkrivanje poti | CommunityTrips na /nacrtuj | RSC | spodaj | PLAN spodaj | CONTEXTUAL | NE |
| Mnenja (reviews) | product/experience modal | /api/reviews | modal | EXPLORE modal | CONTEXTUAL | NE |
| AI story / poslovni vpogledi | listing modal / admin+owner | /api/ai-story, /api/ai-insights | kontekst | ADVANCED | CONTEXTUAL | NE |
| PlanCheck validator tujih načrtov | homepage | /api/plan-check | sekcija | DISCOVER spodaj | CONTEXTUAL | NE |
| PWA/offline (sw, offline.html, push) | global | sw.js | samodejno | GLOBAL (ozadje) | AUTOMATIC | NE |
| Večjezičnost SL/EN | celoten produkt | next-intl | preklopnik | GLOBAL header | CONTEXTUAL | NE |
| Temna/svetla tema | global | next-themes | ikona | GLOBAL header | CONTEXTUAL | NE |
| Priljubljene (wishlist) | header sheet | localStorage | sheet | GLOBAL header | CONTEXTUAL | NE |
| Slovenia Pass (gamifikacija) | /slovenia-pass | klient | stran | EXPLORE | CONTEXTUAL | NE |
| SEO nabor (16 destinacijskih podstrani, vodiči) | /destinacija/* | RSC | podstrani | EXPLORE/SEO | CONTEXTUAL | NE |
| B2B lijak /owner/* | /za-ponudnike → dashboard | /api/owner/* (15) | ločen tok | ADVANCED (Za ponudnike) | CONTEXTUAL | NE |
| Admin plošča | /admin | /api/admin/* (10) | ločen tok | ADVANCED | CONTEXTUAL | NE |
| Primerjava načrtovalcev | /primerjava | statična | stran | EXPLORE/SEO | CONTEXTUAL | NE |

**Skupaj: ~100 zmožnosti → po redesignu ~100 zmožnosti.** Spreminja se SAMO vidnost/trenutek prikaza.

## 2. NAJDBE REVIZIJE (točke 17–20) → ukrepi redesigna

| # | Ugotovitev | Ukrep (ZERO LOSS) |
|---|---|---|
| 17a | 15+ površin vodi na /nacrtuj (hero čipi, demo, pregen, kviz, sticky CTA, footer …) | KEEP — to je konverzijski lijak (namerno); ne zapiramo vrat |
| 17b | 4 površine AI pogovora (Chatbot, SmartSearch, PlanCopilot, AskLocal) | KEEP vse — različne naloge (vsebinsko), ni duplikata logike |
| 17c | MarketplaceSection 2× (/trznica + /dozivetja) | KEEP — ponovna uporaba komponente (ni duplikat) |
| 18a | Kognitivna gostota /nacrtuj (4 ingest zavihki + 8 polj + 2 rail zavihka) | ŽE delno progresivno; + AI kontrolna vrstica dvigne refinement na primarni nivo |
| 18b | Homepage ~10 sekcij | KEEP vse (FW3 progresivno že) — vrstni red ostane |
| 19a | **/potovanje in /na-poti NISTA v nobeni navigaciji** | POPRAVEK: footer "Na poti" + /potovanje povezava iz footera (vidnost, ne logika) |
| 19b | Moja potovanja samo v mobilnem meniju | POPRAVEK: desktop navigacija dobi "Moja potovanja" |
| 19c | 3 podobna imena (moja-potovanja / potovanje / MOJA POT panel) | KEEP stanja (različni pojmi); pošteno ločene poti |
| 20a | Zaprto v railu: 6 hitrih akcij refinementa | POPRAVEK: čipi vidni TAKOJ v delovni površini (AI = kontrolna plast) |
| 20b | Trust komunikacija razpršena (ploščice + paneli) | DODATEK: enostavna ✓ vrstica zaupanja ob rezultatu (iskrena: ✓ samo, če dejansko preverjeno; ⚠ če opozorila) |
| 20c | Start Anywhere ni na homepageu | DODATEK: sekundarna vrstica pod hero vnosom → /nacrtuj#start-kjerkoli |

## 3. SPREMEMBE (vse FRONTEND vidikovne — 0 sprememb backend/API)

1. `docs/FEATURE-MATRIX.md` (ta dokument).
2. Navigacija: desktop dobi 5. povezavo "Moja potovanja".
3. Footer: v kolono Načrtuj dodan "Na poti (Go Mode)" → /na-poti (dostop do pokopane zmožnosti).
4. Hero: +2 primera čipa (Morje+mori, Narava in hrana — iz Issue seznama) + sekundarna vrstica "Začni od drugje" (Start Anywhere) → /nacrtuj#start-kjerkoli.
5. Načrtovalnik: sidro id="start-kjerkoli" na ingest bloku.
6. NOVO `planner-ai-controls.tsx`: kompaktna AI kontrolna vrstica v delovni površini (izbira dneva + 6 determinističnih čipov + 3 prosto-besedilne čipe Ceneje/Bolj aktivno/Bolj mirno + vnos) — KLICATA ISTI /api/itinerary/refine endpoint (enaka obremenitev kot rail); rail s polno izkušnjo (zgodovina …) OSTANE.
7. NOVO `planner-trust-line.tsx`: iskrena ✓ vrstica (Pot preverjena/Razdalje izračunane/Vreme preverjeno/Odprto ob tvojem času) iz obstoječih podatkov geoValidation/weather.
8. `src/app/not-found.tsx`: blagova 404 stran (E2E "no unexpected 404s").
9. i18n: novi ključi sl+en (pariteta ostane).

**Izrecno NI dela:** backend, API, baza, provider adapterji, booking arhitektura, drugi načrtovalnik/druga mapa/drugi viri podatkov.
