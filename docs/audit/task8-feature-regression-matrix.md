# TASK 8 / ISSUE #8 — FEATURE-LOSS REGRESSION MATRIX (v1.112.0 „The Spine")

> **Pravilo:** NI nezadane vrstice za izgubo funkcije (issue §1: ZERO FEATURE LOSS).
> Metodologija: D8-A inventar (66 zmožnosti, `task8-d8a-ux-audit.md` §3) → po vsaki spremembi
> preverjeno s source-contract testi + brskalniško verifikacijo (D8-H).
> **Before** = dostopnost na v1.111.1 (HEAD `ac75070`) · **After** = v1.112.0.

| Capability | Before (v1.111.1) | After (v1.112.0) | New access path | Verified | Evidence |
|---|---|---|---|---|---|
| AI planning (klepet + /nacrtuj) | P (nav CTA + hero + FAB) | NESPREMENJENO — /nacrtuj ostaja jedro; FAB kanonski 44px dodaj v vrsticah | P | testi + browser (planner strip na /nacrtuj) | `task8-d-add-to-trip-surfaces.test.ts` (chatbot), screenshot task8-planner-*.png |
| Deterministično načrtovanje | A (izbira motorja v obrazcu) | NESPREMENJENO | A | obstoječa suita | 3317 testov |
| SmartSearch | P (ikona v glavi) — SAMO navigacija (mrtvi konec) | NADGRADENO — vrstica rezultata dobi kanonski „Dodaj v mojo pot“ + vrstica še vedno odpre | P | source-contract | `task8-d-add-to-trip-surfaces.test.ts` §SmartSearch |
| Destinacije (38) | P (/destinacije + homepage) | NADGRADENO — modal + hub + things-to-do dobijo „Dodaj v mojo pot“; „Zgradi novo pot“ ostaja (napredna) | P | browser (Bled modal → store → toast) | screenshot task8-destination-hub.png, task8-moja-pot-view.png |
| POIs (zemljevid, 125k) | C (zemljevid, zoom-gate) | NESPREMENJENO sloj + supply write-through v zbirko | C | source-contract | `task8-d…test.ts` §supply |
| Zemljevid | P | NESPREMENJENO — ProductCard/Modal nadgrajena na kanonski gumb (isti mehanizem izbire + zbirka) | P | source-contract + tsc | `task8-d…test.ts` §product-card/modal |
| Dogodki | P (/dogodki) — EventCard BREZ akcije poti | NADGRADENO — EventCard dobi kanonski dodaj; planner dodaj (addedEvents) + write-through | P | source-contract | `task8-d…test.ts` §events-calendar, §itinerary-events |
| Vodiči + blog + AskLocal | P (/vodici) | NESPREMENJENO (faza 2: dodaj na blog/konzultacije) | P | obstoječa suita | `task8-f…test.ts` (blog ohranjen na homepage) |
| Restavracije/lokali | C (/lokali, modal) | NADGRADENO — ListingModal + kartica dobita „Dodaj v mojo pot“ ( spletna stran + asistent ostajata) | C | source-contract | `task8-d…test.ts` §listings |
| Doživetja | P (/dozivetja + tržnica) | NADGRADENO — ExperienceModal dobi kanonski dodaj nad BookingSection; Rezerviraj termin NESPREMENJEN | P | source-contract | `task8-d…test.ts` §experience-modal |
| Namestitve | C (affiliate bloki + booking panel) | NESPREMENJENO (affiliate arhitektura) | C | obstoječa suita | — |
| Tržnica (izdelki+izkušnje) | P (/trznica) | NADGRADENO — wishlist vrstice dobijo „Dodaj v mojo pot“ (most P-CTA-2); košarica/rezerviraj nespremenjeno | P | source-contract | `task8-d…test.ts` §wishlist-sheet |
| Provider tokovi (owner) | A (/owner/dashboard, 8 zavihkov) | NESPREMENJENO | A | obstoječa suita (task33/34/35) | 3317 testov |
| Booking handoff (EXTERNAL) | C (gumbi na journey/go/shared) | NESPREMENJENO — besednjak resnice ohranjen | C | obstoječa suita | — |
| My Trip (/moja-potovanja) | P — lastni mini-header, brez navigacije | NADGRADENO — lupina (Navigation+Footer), NOVA zbirka „Moja pot“ zgoraj + „Nadaljuj načrtovanje“; vsi obstoječi oddelki (konzultacije, naročila, lokalna/strežniška potovanja) ostajajo | P | browser | screenshot task8-moja-pot-view.png |
| Urejanje načrta (reorder/move/dan/undo) | C (planner) | NESPREMENJENO | C | obstoječa suita (task35/task34/task5-t5d-planner-reorder) | — |
| Deljenje poti + sodelovanje | C (/pot/[shareId] — lastni header) | NADGRADENO — lupina dodana (print ostaja čist); timeline/kolaboracija/ankete/dokumenti/dnevnik/proračun NESPREMENJENI | C | source-contract (shell) | `task8-e-shell-tabbar.test.ts` |
| Go Mode (/na-poti) | C (meni + noga + gumbi) | NESPREMENJENO tok (D8-F globoka pomiritev = faza 2); „Zaženi Na poti“ ostaja sekundarna v akcijski vrstici | C | source-contract | `task8-f…test.ts` (goModeButton) |
| Offline/PWA | H (ikoni v glavi) | NESPREMENJENO — SW/manifest/offline.html nedotaknjeni; tab vrstica jih ne zakriva | H | obstoječa suita (task73) | `task8-e…test.ts` (PwaHeaderIcons v navigaciji) |
| Vreme | C (modal/načrt/Go) | NESPREMENJENO | C | obstoječa suita | — |
| Odpiralni časi | C (modal/hub/stop-insights) | NESPREMENJENO | C | obstoječa suita | — |
| Usmerjanje/razdalje | C (zemljevid/načrt) | NESPREMENJENO | C | obstoječa suita | — |
| Start Anywhere (povezava/slika/PDF/pini) | H (pod-povezava hero + zavihki) | NESPREMENJENO dostop (H) — dostopnost izboljšana posredno (homepage hierarhija; faza 2: dvig) | H | source-contract | `task8-f…test.ts` (hero ohranjen) |
| Uvoz rezervacij (e-pošta/parser) | A (/pot/[shareId] zavihek) | NESPREMENJENO | A | obstoječa suita (task31) | — |
| Skupnost (poti skupnosti) | A (/nacrtuj dno + /pot) | NESPREMENJENO (fork = faza 2) | A | obstoječa suita | — |
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

## NAMERNO ODLADNJENO v fazo 2 (dokumentirano, ne izgubljeno)

Blog/konzultacijski dodaj · fork skupnostne poti v planner · /potovanje↔/nacrtuj združitev · Go Mode vizualna pomiritev · EN razširitev SL-only površin · strežniška refleksija zbirke My trip (claim ob prijavi).

---
**Sklep:** 0 vrstic izgube funkcije. 31/31 zmožnost potrjena (testi 3317 + brskalniški dokazi D8-H + screenshots).
