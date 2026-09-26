# TASK 8 / ISSUE #8 — FEATURE-LOSS REGRESSION MATRIX (v1.114.0 „Faza 3 — En načrtovalnik, umirjena stanja")

> **Pravilo:** NI nezadane vrstice za izgubo funkcije (issue §1: ZERO FEATURE LOSS).
> Metodologija: D8-A inventar (66 zmožnosti, `task8-d8a-ux-audit.md` §3) → po vsaki spremembi
> preverjeno s source-contract testi + brskalniško verifikacijo (D8-H).
> **Before** = dostopnost na v1.111.1 (HEAD `ac75070`) · **After** = v1.114.0 (Faza 1: v1.112.0 + Faza 2: v1.113.0 + Faza 3).

| Capability | Before (v1.111.1) | After (v1.114.0) | New access path | Verified | Evidence |
|---|---|---|---|---|---|
| AI planning (klepet + /nacrtuj) | P (nav CTA + hero + FAB) | NESPREMENJENO — /nacrtuj ostaja jedro; FAB kanonski 44px dodaj v vrsticah | P | testi + browser (planner strip na /nacrtuj) | `task8-d-add-to-trip-surfaces.test.ts` (chatbot), screenshot task8-planner-*.png |
| Deterministično načrtovanje | A (izbira motorja v obrazcu) | NESPREMENJENO | A | obstoječa suita | 3317 testov |
| SmartSearch | P (ikona v glavi) — SAMO navigacija (mrtvi konec) | NADGRADENO — vrstica rezultata dobi kanonski „Dodaj v mojo pot“ + vrstica še vedno odpre | P | source-contract | `task8-d-add-to-trip-surfaces.test.ts` §SmartSearch |
| Destinacije (38) | P (/destinacije + homepage) | NADGRADENO — modal + hub + things-to-do dobijo „Dodaj v mojo pot“; „Zgradi novo pot“ ostaja (napredna) | P | browser (Bled modal → store → toast) | screenshot task8-destination-hub.png, task8-moja-pot-view.png |
| POIs (zemljevid, 125k) | C (zemljevid, zoom-gate) | NESPREMENJENO sloj + supply write-through v zbirko | C | source-contract | `task8-d…test.ts` §supply |
| Zemljevid | P | NESPREMENJENO — ProductCard/Modal nadgrajena na kanonski gumb (isti mehanizem izbire + zbirka) | P | source-contract + tsc | `task8-d…test.ts` §product-card/modal |
| Dogodki | P (/dogodki) — EventCard BREZ akcije poti | NADGRADENO — EventCard dobi kanonski dodaj; planner dodaj (addedEvents) + write-through | P | source-contract | `task8-d…test.ts` §events-calendar, §itinerary-events |
| Vodiči + blog + AskLocal | P (/vodici) | NADGRADENO (F2-D) — vodič detail „Dodaj v mojo pot“ (kind: guide) + seznam vodnikov (22 kartic, overlay vzorec) + konzultacijske destinacije (kind: destination); „Načrtuj potovanje“/„Raziskuj {name}“/things-to-do CTA ostajajo | P | source-contract + browser | `task8-f2d-guides-consultation-add.test.ts` (32), screenshot task8-f2d-guide-add-mobile.png |
| Restavracije/lokali | C (/lokali, modal) | NADGRADENO — ListingModal + kartica dobita „Dodaj v mojo pot“ ( spletna stran + asistent ostajata) | C | source-contract | `task8-d…test.ts` §listings |
| Doživetja | P (/dozivetja + tržnica) | NADGRADENO — ExperienceModal dobi kanonski dodaj nad BookingSection; Rezerviraj termin NESPREMENJEN | P | source-contract | `task8-d…test.ts` §experience-modal |
| Namestitve | C (affiliate bloki + booking panel) | NESPREMENJENO (affiliate arhitektura) | C | obstoječa suita | — |
| Tržnica (izdelki+izkušnje) | P (/trznica) | NADGRADENO — wishlist vrstice dobijo „Dodaj v mojo pot“ (most P-CTA-2); košarica/rezerviraj nespremenjeno | P | source-contract | `task8-d…test.ts` §wishlist-sheet |
| Provider tokovi (owner) | A (/owner/dashboard, 8 zavihkov) | NESPREMENJENO | A | obstoječa suita (task33/34/35) | 3317 testov |
| Booking handoff (EXTERNAL) | C (gumbi na journey/go/shared) | NESPREMENJENO — besednjak resnice ohranjen | C | obstoječa suita | — |
| My Trip (/moja-potovanja) | P — lastni mini-header, brez navigacije | NADGRADENO — lupina (Navigation+Footer), NOVA zbirka „Moja pot“ zgoraj + „Nadaljuj načrtovanje“; vsi obstoječi oddelki (konzultacije, naročila, lokalna/strežniška potovanja) ostajajo | P | browser | screenshot task8-moja-pot-view.png |
| Urejanje načrta (reorder/move/dan/undo) | C (planner) | NESPREMENJENO | C | obstoječa suita (task35/task34/task5-t5d-planner-reorder) | — |
| Deljenje poti + sodelovanje | C (/pot/[shareId] — lastni header) | NADGRADENO — lupina dodana (print ostaja čist); timeline/kolaboracija/ankete/dokumenti/dnevnik/proračun NESPREMENJENI | C | source-contract (shell) | `task8-e-shell-tabbar.test.ts` |
| Go Mode (/na-poti) | C (meni + noga + gumbi) | NADGRADENO (F2-B, §24 „calm and focused“) — hero podnaslov pomirjen na 1 vrstico; GPS NADZOR (HOW) premaknjen pod NASLEDNJE (NEXT) — hierarhija NOW → NEXT → WHEN → HOW → CONTEXT; „Zaženi Na poti“ ostaja sekundarna v akcijski vrstici; VSA zmožnost (GPS/ETA/vreme/ure/dnevi/opravljanje/navigacija) nespremenjena | C | source-contract + browser | `task8-f2b-go-mode-calm.test.ts` (6), screenshot task8-f2b-go-mode-calm.png |
| Offline/PWA | H (ikoni v glavi) | NESPREMENJENO — SW/manifest/offline.html nedotaknjeni; tab vrstica jih ne zakriva | H | obstoječa suita (task73) | `task8-e…test.ts` (PwaHeaderIcons v navigaciji) |
| Vreme | C (modal/načrt/Go) | NESPREMENJENO | C | obstoječa suita | — |
| Odpiralni časi | C (modal/hub/stop-insights) | NESPREMENJENO | C | obstoječa suita | — |
| Usmerjanje/razdalje | C (zemljevid/načrt) | NESPREMENJENO | C | obstoječa suita | — |
| Start Anywhere (povezava/slika/PDF/pini) | H (pod-povezava hero + zavihki) | NESPREMENJENO dostop (H) — dostopnost izboljšana posredno (homepage hierarhija; faza 2: dvig) | H | source-contract | `task8-f…test.ts` (hero ohranjen) |
| Uvoz rezervacij (e-pošta/parser) | A (/pot/[shareId] zavihek) | NESPREMENJENO | A | obstoječa suita (task31) | — |
| Skupnost (poti skupnosti) | A (/nacrtuj dno + /pot) | NADGRADENO (F2-C, §26) — gumb „Shrani kot svojo kopijo“ na /pot/[shareId]: lasten shareId + lasten editToken (polovici ureljiva kopija) + dodatek v „Moja potovanja“; „Zaženi Na poti“/„Natisni/Prenesi PDF“/kolaboracija ostajajo | A | source-contract + browser (fork tok end-to-end) | `task8-f2c-trip-fork.test.ts` (21), screenshot task8-f2c-fork-button.png |
| Avdio/TTS (Poslušaj) | C (5. gumb akcijske vrstice) | PREMEŠČEN v meni „Več“ — ISTI handler + aria; pogoj audioScript ohranjen | C | source-contract | `task8-f…test.ts` §akcijska vrstica |
| Slovenščina | P | NESPREMENJENO + novi nizi SL (primitiva/pogled/trak) | P | testi + browser | `task8-my-trip-core.test.ts` (SL pariteta) |
| Angleščina | P (EN whitelist) | NESPREMENJENO + novi nizi EN; LanguageToggle odstranjen SAMO tam, kjer LanguageSwitcher pokriva isto dejanje (preverjeno) | P | source-contract | `task8-e…test.ts`, `task8-f…test.ts` (i18n pariteta) |
| SEO/GEO | P (kanonični URL-ji, sitemap, hreflang) | NESPREMENJENO — 0 sprememb poti; 308 preusmeritve ohranjene; strežnjaki server pages nespremenjeni (dodan samo klient chrome) | P | tsc + obstoječa SEO suita | `task8-e…test.ts` (generateMetadata nedotaknjen) |
| Zaupanje/provenanca | C (hub viri, statusne značke, /vir-podatkov) | NESPREMENJENO | C | obstoječa suita | — |
| PDF/ICS izvoz + e-pošta | C (akcijska vrstica) | PREMEŠČENO v meni „Več“ (isti handlerji) | C | source-contract | `task8-f…test.ts` §akcijska vrstica |
| Validator tujih načrtov + telemetrija | A (homepage sredina) | PREMEŠČENO v `<details>` (progressive disclosure — zaprto privzeto, ODPRENO z enim klikom) | A | source-contract + browser | `task8-f…test.ts` (PlanCheck v details) |

## POPRAVLJENE NAPAKE (izboljšanje, ne izguba)

- **HARD 404**: povezava `/načrtuj` (šumnik) na 38×5 predgeneriranih straneh → `/nacrtuj` (D8-A §9.1).
- **28px dotik tarča** v klepetu (size-7) → kanonska 44px primitiva.
- **17/38 strani brez navigacije** → enotna lupina (Navigation + Footer) na vseh javnih straneh.
- **5 konkurenčnih primarnih CTA** v akcijski vrstici → 2 primarni + meni Več.

## SLEPE UVICE ZAPRTE (D8-A §9 → vse z kanonskim dodajanjem)

SmartSearch vrstice · EventCard · ListingModal/kartica · hub/things-to-do destinacij · ExperienceModal · wishlist (most v pot) · klepet (44px) · journey-planner izbire · supply (write-through).

## NAMERNO ODLADNJENO v fazo 4 (dokumentirano, ne izgubljeno)

EN razširitev SL-only površin (F3-E — F3-B je pripravil ~12 "Nalagam" uhodov z L-patternom; vsaka površina individualno vrata) · popolna absorpcija /potovanje v /nacrtuj (Option B — odložena na podatke lijaka, 38-a §1 MERGE OPTIONS).

## FAZA 2 DODANE ZMOŽNOSTI (vse NADGRADENE, brez izgube)

- **Strežniška refleksija zbirke „Moja pot“** (F2-A): Prisma UserTripItem + /api/my-trip (GET/POST union-merge/DELETE) + startup migracija + diff-sync gonilev (MyTripAccountSync v Navigation) + prijava sync (oba tokova) + pull na /moja-potovanja → zbirka je VEZANA na račun (cross-device, Google Maps „Want to go“ vzorec). Gost ostaja čisto lokalno. 27 testov (`task8-f2a-my-trip-sync.test.ts`).
- **Fork skupnostne/deljene poti** (F2-C): glej vrstico „Skupnost“.
- **Go Mode pomiritev** (F2-B): glej vrstico „Go Mode“.
- **Vodiči/konzultacije dodaj** (F2-D): glej vrstico „Vodiči + blog + AskLocal“.

## FAZA 3 DODANE ZMOŽNOSTI (vse NADGRADENE, brez izgube)

- **EN NAČRTOVALNIK (F3-A, §43 NO PARALLEL APP — Option A+C; B odložen na podatke)**: /potovanje je okvirjen kot korak ponudnikov/logistike ENEGA načrtovalnika — vrstica odnosa v heroju + povezava „Odpri AI načrtovalnik" (prva vsebinska povezava /potovanje → /nacrtuj), tiha vrstica v glavi obrazca; /nacrtuj dobi vedno vidno tiho povezavo „Celotno potovanje" (ob supply čipih — obojesmerno mostovje); /potovanje dodan v mobilni Sheet „Več" (prej NOBENA navigacijska pot — samo noga); noga „Načrtuj celo potovanje" preoblikovana v „Celotno potovanje — ponudniki"; predlogi destinacij „Iz moje poti" (čipi nad obrazcem /potovanje, klik = VIDNA izbira, ne tihi prefill).
- **DRIFT A/B POPRAVLJENA (F3-A — §40 ena življenjska doba)**: zbirka „Moja pot" je resnica ogledala izbir na /potovanje — novo iskanje REHIDRIRA izbire (re-search iste relacije jih obdrži; brskalniško dokazano), odstranitev iz zbirke (npr. drug zavihek) jih POŠTENO odstrani tudi na karticah (živi reconcile prek dai:my-trip-changed + cross-tab); dogodki ostajajo session-only (D8-D meja). Čista funkcija `src/lib/journey/selection-mirror.ts` + 6 domenskih testov.
- **DRUŽINA STANJ (F3-B, §31/§32/§33 — P-STATE-2 ZAPRT)**: NOVA `src/components/states/` (LoadingState role=status aria-live, EmptyState ikona+naslov+opis+CTA ≥44px BREZ lastnih nizov, ErrorState role=alert truth ambery/destruktivni + retry) — zlati standard planner statusne vrstice kot slovnica. Prevzem: /potovanje iskanje+kategorije (skeleti namesto nenadne zamenjave + ErrorState z retry), moja-potovanja, tržnica, lokali, shared-trip map, wishlist prazno stanje (CTA → /trznica), events-calendar, destinacije, owner; 6/7 lokalnih EmptyState klonov poenotenih; ~12 „Nalagam" uhodov → L-pattern SL/EN (priprava na F3-E EN).
- **START ANYWHERE DVIG (F3-C, §25 — NIKOLI hero)**: „Začni s svojimi viri →" VEDNO vidna v glavi obrazca /nacrtuj (tudi zložena — planner-summary-bar prop) + hashchange poslušalec (istostranske hash povezave delujejo); noga „Začni kjerkoli (povezava, slika, PDF)"; mobilni Sheet „Začni kjerkoli"; USP vrstica strani (enak besednjak kot hero); merilni hook ingest_completed po načinu (link/image/pins/pdf) v planner-analytics.
- **WISHLIST MOST (F3-D, zbirka-sloj BREZ tihega razporejanja)**: čista lib `src/lib/wishlist-trip-bridge.ts` (identiteta IDENTIČNA wishlist-sheet — dedup deluje) + `useWishlist` hook; „Iz priljubljenih" trak v MyTripView (destinacijski čipi ×števec, „Uporabi v načrtu" → isti dai:my-trip-prefill dogodek + quick-add vseh vnoso v zbirko + iskren toast z dejanjem Načrtuj); PlannerMyTripStrip „Uporabi v načrtu" vključuje DESTINACIJE iz priljubljenih (dedup, toast omenja); nerazlovljiva destinacija → iskrena povezava /trznica.

| Faza 3 vrstica | Before (v1.113.0) | After (v1.114.0) |
|---|---|---|
| /potovanje dostop | C (SAMO noga + Go Mode prazno stanje) | NADGRADENO — Sheet „Več" + vrstica odnosa + prefill čipi |
| /potovanje↔/nacrtuj most | enosmerno (handoff gumb) | NADGRADENO — obojesmerno (companion link + flow note) |
| Izbire /potovanje | izgubljene ob novem iskanju/reloadu | NADGRADENO — ogledalo zbirke (DRIFT A/B zaprta) |
| Loading/empty/error | 7 klonov EmptyState + mešani spinners | NADGRADENO — ena družina stanj, 10 površin |
| Start Anywhere | H (hero vrstica + zavihki planner) | NADGRADENO — 4 nova dostopna mesta + merjenje |
| Wishlist → pot | ročni dodaj na vrsticah | NADGRADENO — most (trak + prefill združitev) |

---
**Sklep:** 0 vrstic izgube funkcije. 31/31 zmožnost potrjena + 6 novih Faza 3 vrstic (testi 3501 + brskalniški dokazi D8-H/F2/F3 + screenshots).
