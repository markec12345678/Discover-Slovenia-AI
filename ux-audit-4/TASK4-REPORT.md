# TASK 4 — REAL USER UX VALIDATION — KONČNO POROČILO (AUDIT, 0 SPREMEMB KODE)

> **Datum:** 2026-09-24 · **Revizija:** živi produkciji Render (primarna) + Vercel (sekundarna), verzija **1.90.0** (Issue #3, `d51407b`)
> **Metoda:** browser automation (agent-browser, sveže seje = nov uporabnik) + VLM 5-sekundni testi + direktni API sondi + samo-branje kode. **NI bilo spremenjene kode. NI commita. NI PR.**
> **Dokazila:** 40+ screenshotov v `ux-audit-4/`, API odgovori JSON, mrežni logi, izčrpan a11y inventar.

---

## A. PRODUCTION REALITY

| Površina | Status | Verzija | Opomba |
|---|---|---|---|
| Render `i-feel-slovenia.onrender.com` | 200, živ | 1.90.0 | primarna; cold-start ~3,4 s |
| Vercel `i-feel-slovenia.vercel.app` | 200, živ | 1.90.0 | ista izdaja; parity potrjen (H1, navigacija 5 + Moja potovanja, Start Anywhere vrstica, zdravje) |

**Živa resnica produktov (izmerjeno danes):**

| Zmožnost | Meritev | Rezultat |
|---|---|---|
| Generiranje itinererja (`/api/itinerary`) | 3 sonde | **41–76 s** (vedno `source:"fallback"` = AI timeout → deterministični motor; trda meja 70 s v ruti deluje) |
| Klepetalnik (`/api/chat`) | 2 sondi | **8,7 s** (200, `source:"openrouter"` — AI DEJANSKO dela) |
| Prosti refine (`/api/itinerary/refine`) | 3 sonde + browser | **262 s** (1-dnevni minimalni payload), **~8–11 min** (celoten 3-dnevni načrt v brskalniku) — konča 200 |
| Pametno iskanje (`/api/smart-search`) | 4 sonde | **35 s** (uspeh, `source:"ai"`) do **>60–400 s brez odgovora** (3 od 4 sond HTTP 000) |
| Vreme (`/api/weather`) | obe površini | **Render: `{"error":"Vreme trenutno ni na voljo"}` — Open-Meteo NI dosegljiv. Vercel: realno (`megla 6°`)** |
| OSRM razdalje | API + zemljevid | deluje (method `osrm`, realne ceste) |

**Ključna ugotovitev A:** OpenRouter (free tier) je edini delujoči AI provider; njegova čakalna vrsta povzroča 35 s → 10+ min latenco. Generiranje ima trdo mejo (70 s) in pade v deterministični rezervo; **refine in smart-search trde meje NIMATA** (glej K-4, K-5).

---

## B. GOLDEN PATH — HOME → AI INPUT → GENERATE → PLAN → MAP → ITINERARY → REFINE → SAVE → MY TRIP → GO MODE

Sveža seja (nov uporabnik, piškotki/storage izbrisani), Render, 1440×900.

| Korak | Cilj uporabnika | Vidni primarni CTA | Naslednja akcija očitna? | Zmeda | Dodatni kliki |
|---|---|---|---|---|---|
| HOME | razumeti produkt | vnosna kartica hero + **»Sestavi mojo pot«** (disabled do vnosa) | DA | nizka (glej C) | 0 |
| AI INPUT | povedati željo | isti gumb | DA | nič — prenos deluje (sessionStorage → samodejna generacija) | 0 |
| GENERATE | dobiti načrt | »AI razmišlja…« + **Prekliči** + faze (supply→compose→verify) + števec | DA | trajanje 41–76 s obljubi »navadno 15–40 s« (~2×) | 0 |
| PLAN | videti načrt | delovna površina (naslov, zaupanja vrstica, AI vrstica, ploščice) | DA | 2 enakovredni kontrolni skupini (K-8, K-9) | 0 |
| MAP | videti pot | Leaflet + žetoni dni + zoom | DA | nič (napis OSRM pošten) | 0 |
| ITINERARY | prebrati dneve | kartice dni (JUTRO/POPOLDAN/VEČER, časi, cene, »Zakaj ta postanek«) | DA | nič | 0 |
| REFINE | cenejši načrt | čip **»Ceneje«** (y≈999 — POD zgibom, zahteva scroll) | DELNO | **spinner 8–11 min, brez timeouta/preklica/napredka** (K-4); obseg (dan vs celotna pot) neoznačen (K-8) | 1 + scroll |
| SAVE | shraniti | **»Shrani itinerer in ustvari deljivo povezavo«** | DA | nič — toast + deljiva povezava (potrjeno: `/pot/fb4162e781`) | 1 |
| MY TRIP | najti shranjeno | navigacija **»Moja potovanja«** | DELNO | **gost → preusmeritev na /prijava** (K-6); načrt je dejansko dostopen prek /nacrtuj (localStorage) in deljive povezave | 1 |
| GO MODE | navigacija na poti | /na-poti → **»Ni aktivnega potovanja«** + CTA »Sestavi potovanje« | NE | **Go Mode NE pozna AI itinererja** — pričakuje potovanje, zgrajeno na /potovanje; deljena stran nima NIC povezave do /na-poti (K-7) | 2+ |

**Sodba B:** Pot HOME→…→SAVE deluje brez zastojev za gosta (razen trajanja generacije/refine). Kontinuiteta se prelomi pri **MY TRIP (login zid)** in **GO MODE ( ločen koncept potovanja)** — zadnja člena verige nista povezana z AI načrtom.

---

## C. FIRST-TIME USER FINDINGS (TEST A — 5 sekund, Render, 1440×900, VLM)

1. **Kaj je ta produkt?** ✓ »AI-powered travel concierge/trip planner for Slovenia« — pravilno razume.
2. **Kaj stran želi, da naredim?** ✓ »Vpiši željo in klikni Sestavi mojo pot.«
3. **Kam bi kliknil?** ✓ v centralni vnosni prostor.
4. **Razlika Explore/Plan/My Trip/Go?** DELNO — nav ima 5 jasih povezav (Destinacije, Doživetja, Zemljevid, Vodiči, Moja potovanja) + gumb »Načrtuj z AI«; PLAN in EXPLORE sta razločljiva, MY TRIP viden; **GO Mode ni v nobeni navigaciji** (samo noga) → nov uporabnik GO ne more videti v 5 s.
5. **Vidim, kako začnem?** ✓ DA (velik naslov → vnos → gumb).
6. **Konkurenčni poudarki (šteto):** ~16 interaktivnih elementov v viewportu; dominanten CTA = 1; konkurirata »Načrtuj z AI« (bela tipka zgoraj desno) in zelena beta pasica (»Pridruži se«) spodaj.
7. **Kompleksnost viewporta:** srednje-nizka (3–4 sklopji: glava, hero/akcija, trust plast, pasica). **Celotna stran: ~10 sekcij, ~50+ interaktivnih elementov** (namerna odločitev Issue #3 — KEEP; nad zgibom je doživetje OSREDOTOČENO).

---

## D. NAVIGATION FINDINGS

- **Desktop (1280/1440):** 5-stopenjska navigacija + »Moja potovanja« kot 5. člen ✓ (popravek Issue #3 19b uresničen). 8 util ikon (namestitev, košarica, priljubljene, AI iskanje, tema, jezik, Za ponudnike, Načrtuj z AI). Brez prelivanja. Navigacija je še vedno »AI travel product«, ne portal.
- **Mobilni meni:** Destinacije, Doživetja, Zemljevid, Vodiči, Moja potovanja, Dogodki, Lokali, Tržnica, Slovenia Pass, Za ponudnike + CTA. **»Na poti« (Go Mode) NI v mobilnem meniju** — dosegljiv samo skozi nogo (K-12).
- **Podvojitve pojmov (pošteno, a obstoječe):** 3 podobna imena (Moja potovanja / Potovanje / MOJA POT panel) — po Issue #3 matriki KEEPalne; vsaka ima svojo pot.
- **4 AI pogovorne površine** (klepetalnik FAB, AI iskanje, PlanCopilot »Vprašaj«, Vprašaj lokalca) — vse dosegljive, vsaka z drugo nalogo.
- **15+ površin vodi na /nacrtuj** (hero čipi, demo kartice, pregen, kviz, sticky CTA, noga…) — namerni konverzijski lijak, KEEP.

---

## E. MOBILE FINDINGS (390 px + 430 px)

| Preverjanje | 390 | 430 |
|---|---|---|
| Horizontalni overflow | NE (scrollW=390) | NE (scrollW=430) |
| Dominanten CTA nad zgibom | DA — »Sestavi pot« | DA |
| Vnos + gumb brez scrolla | DA | DA |
| Čipi želja vidni | DA (tudi z mikrokopijo »1 klik«) | DA |
| Start Anywhere vrstica | prisotna (»Imaš že svoje vire?…«) | prisotna |
| Hamburger meni | DA (»Odpri meni«) | DA |
| Generacija na mobilnem | deluje (izmerjeno 76 s) | — |
| AI kontrolna vrstica | uporabna, a **stisnjena** (VLM: ozki presledki med čipi, elipse s krajenimi besedami) | uporabna |
| Zemljevid | viden; zoom tipki **majhni** za dotik | viden |
| Kartice dni | DA (segmenti, časi, cene) | DA |
| Booking panel | dosegljiv (»Rezerviraj 6«, »Vstopnice«) | DA |
| Shrani | DA (1 klik) | DA |
| My Trip (gost) | preusmeritev na prijavo | enako |
| Go Mode | prazno stanje + CTA | enako |
| Sticky elementi | 5 (glava, pasica, …) brez prekrivanja vsebine | OK |

**Mobilna zmeda:** vrstni red na mobilnem je NASLOV → **AI kontrole → zemljevid → šele dnevi** — uporabnik vidi »Kaj naj spremenim na tvoji poti?« PREDEN vidi, kaj pot sploh je (K-13).

---

## F. DESKTOP FINDINGS (1280 px + 1440 px)

- Navigacijska gostota: primerna (5 + 8 + 2 CTA); My Trip viden ✓; brez prelivanja pri obeh širinah.
- Zemljevid + itinerer + desni rail (zavihka »Spremeni načrt« / »Vprašaj«) sovpresent ✓.
- AI kontrolna vrstica (novost Issue #3) je nad zemljevidom, a **pod zgibom** (y≈999 pri 900 px) — potreben scroll.
- Booking plošče z dnevi + gumb »Rezerviraj nastanitev, izkušnje in transport — 12 ponudb« ✓.
- Sekundarne funkcionalnosti (community, kviz, primerjava, noga) ohranjene.
- **Sodba:** desktop deluje kot preprost AI travel produkt (navigacija), homepage ostaja dolga (10 sekcij) po zasnovi KEEP — portalni občutek se začne šele pod zgibom.

---

## G. FEATURE REACHABILITY — Issue #3 MATRIKA PONOVNO PREVERJENA (»CAN USER STILL REACH IT?«)

Živo preverjene (browser, obe površini): AI načrtovalec ✓ · deterministični motor (avto-fallback, značka »Predlog«) ✓ · Start Anywhere 4 zavihki + sidro `#start-kjerkoli` ✓ · kviz ✓ · AI refinement (čipi + rail) ✓ · 6 hitrih akcij ✓ · PlanCopilot (zavihek Vprašaj) ✓ · zemljevid (OSRM) ✓ · vreme (znaki dni — a glej H) ✓ · odpiralni časi (glej H) ✓ · geo-validacija (Preverba izvedljivosti, podrobnosti) ✓ · postanki ob poti / kosilo ✓ · BookingPanel po dnevu ✓ · /potovanje ✓ · Go Mode /na-poti (prazno stanje, dosegljiv) ✓ · shrani in deli (deljiva povezava javno dostopna) ✓ · /moja-potovanja (dosegljiv, login zid za gosta) ✓ · e-pošta/.ics/TTS gumbi ✓ · klepetalnik FAB (API 8,7 s) ✓ · AI iskanje (dialog, počasno) ✓ · vprašaj lokalca (/vodici) ✓ · destinacije 38 + modal + »Dodaj v mojo pot« ✓ · /zemljevid ✓ · dogodki ✓ · lokali ✓ · tržnica ✓ · košarica ✓ · wishlist list ✓ · affiliate hub 10 partnerjev (pošteni napis »odpre partnersko povezavo«) ✓ · skupnost (glasovanja na deljeni strani, skupnost načrtuje) ✓ · PlanCheck ✓ · PWA (gumb za namestitev, sw.js 200, offline.html 200) ✓ · SL/EN ✓ · tema ✓ · Slovenia Pass ✓ · primerjava ✓ · /za-ponudnike ✓ · /admin (zid admin gesla) ✓ · 404 (nova prijazna stran) ✓

**ZERO FEATURE LOSS: POTRJENA.** Vseh ~100 zmožnosti iz matrike je ostalo dosegljivih. **NIC ni bilo izgubljeno.** Vendar: 3 zmožnosti so dosegljive, a **dejansko nedelujoče/upočasnjene za uporabnika** (refine ~4–11 min; smart-search 35 s–10 min; vreme na Renderu izmišljeno) in 2 zmožnosti nista povezani z zlatim tokom (My Trip za gosta, Go Mode za AI načrt) — to so UX-resnice, ne izguba funkcij.

---

## H. TRUST FINDINGS — PlannerTrustLine (živi primer: 3-dnevni načrt, Render)

Prikazane trditve: `Pot: 1 težav · Razdalje izračunane · Odprto ob tvojem času · Vreme preverjeno`

| Trditev | Podprta z dejanskimi podatki? | Dokaz |
|---|---|---|
| »Pot: 1 težav« (⚠) | **DA — pošteno** | geoValidation error je realen: »Dan 3: Novo mesto → Slovenj Gradec: 165 km v enem kosu« + »165 km vožnje v enem dnevu (udoben okvir ~150 km)«; ploščica »Izvedljivost: 1 kritičnih« rdeče |
| »Razdalje izračunane« | **DA** | API: `geoValidation.method:"osrm"`; napis pod zemljevidom citira OSRM/O SM; hevristična varianta ima pošteno drugačen napis (»ocenjene (približek)«) |
| »Odprto ob tvojem času« | **NE — prekršek pravila §4 Issue #3** | Privzeti tok NE zahteva datuma; pravili closed_month/closed_weekday se izvedeta SAMO z znanim datumom (`if (dayMonth !== null)`); brez datuma closedCount=0 → ✓ se izriše, čeprav plast **ni bila izvedena** |
| »Vreme preverjeno« | **NE na Renderu — prekršek pravila §4** | Render /api/weather: error; itinerer vsebuje hardcoded sezonsko oceno (`sončno 22°`, `src/lib/deterministic-itinerary.ts:303`); realna napoved danes: nevhta 18°/megla 6°. Trust vrstica jo prikaže kot preverjeno, ker `days.some(d=>d.weather)` ne loči realne napovede od sezonske ocene (fallback po neuspehu Open-Meteo obdrži isti tvar polja). Na Vercelu je vreme REALNO (»delno oblačno 6°« / »plohe 8°«) — divergenca površin |

**Sodba H:** 2 od 4 trditev sta dokazljivi, 2 nista. Pravilo »NE PRIKAZUJ ✓ brez dejanske plasti« je v teh dveh primerih prekršeno.

---

## I. BOOKING TRUTH

- Planner BookingPanel: Booking.com **»Partner«** + gumb **»Iskanje«** → `/go/hotels?dest=…` → preusmeritev na PRAVO iskanje Booking.com (preverjeno v brskalniku) ✓
- GetYourGuide/Tiqets vnosi: značka »Partner«, gumbi »Iskanje«/»Vstopnice« — affiliate semantika jasna ✓
- Lokalni listing (npr. »Kmečka delavnica — sir in skuta, 3h, €35/osebo, ★4.9«) + »Pošlji povpraševanje« — lastni marketplace, poštena cena/osebo ✓
- Homepage affiliate hub: vsak napis vsebuje »odpre partnersko povezavo« ✓
- **NIKJER vtisa »rezervirano«** ob kliku na affiliate partnerja (gumbi so »Iskanje«/»Vstopnice«/»Povpraševanje«, nikoli »Rezervirano«) ✓
- Prazna baza hotelov: »V bazi še ni hotelov za Triglav. Rezervirajte prek Booking.com zgoraj.« — iskreno + naslednji korak ✓
- Cene: »Skupaj ~€270« iz znanih postankov; budgetValidation ločuje within/uncertain ✓. (Opomba: po refine »Ceneje« se skupna vrednost spremenila €270→€20 — drastično, a dosledno prikazano.)
- **Sodba I:** semantika rezervacij je RESNIČNA. Ni lažnega občutka rezervacije.

---

## J. DEAD-END AUDIT

| Scenarij | Stanje | Naslednji korak? | Sodba |
|---|---|---|---|
| Prazna baza (hoteli za Triglav) | »V bazi še ni hotelov…rezervirajte prek Booking.com zgoraj« | DA | ✓ |
| Neveljaven uvoz (povezava) | »Povezave ni bilo mogoče prebrati.« inline | DA (poskusi znova) | ✓ |
| 404 | prijazna stran + 2 CTA (»Nazaj na začetek«, »Načrtuj potovanje«) | DA | ✓ |
| Go Mode brez potovanja | »Ni aktivnega potovanja« + CTA | DA, a vodi v DRUG koncept (K-7) | ⚠ |
| My Trips (gost) | preusmeritev na prijavo z razlago + Nazaj | DA (račun) | ⚠ (K-6) |
| AI odpoved | deterministična rezerva, značka »Predlog«, iskreno | DA | ✓ |
| Dolga generacija | štever + faze + Prekliči + 90 s timeout | DA | ✓ |
| **Refine visi** | spinner brez konca (8–11 min, brez timeouta/preklica) | **NE — brez izhoda** | ✗ (K-4) |
| **Smart search počasen** | dialog brez odziva 35 s–10 min | NE (brez napake/timeout sporočila) | ✗ (K-5) |
| Offline hard reload | brskalnikova napaka (SW potrebuje toplo predpomnilnik; offline.html + sw.js obstajata, 200) | delno | ⚠ (LOW) |

---

## K. REQUIRED CHANGES (urejeno po resnosti; NIČ od tega NI bilo spremenjeno — čaka na UX FIX PASS)

> Resnosti: **BLOCKER** = uporabnik ne more nadaljevati · **HIGH** = lahko nadaljuje, a verjetna zmeda/napaka · **MEDIUM** = nepotrebna kompleksnost · **LOW** = poliranje.

### K-1 · HIGH — Vreme na Renderu je izmišljeno (»sončno 22°«), realno je megla/nevhta
- **Problem:** itinererji na primarni površini prikazujejo hardcoded sezonsko oceno; uporabnik se oblаči/pakuje po njej.
- **Dokaz:** Render `/api/weather` → error; API odgovori vsebujejo `sončno 22°` za vse dneve; realna Open-Meteo napoved (Bled, danes): nevhta 18°/megla; Vercel vrne realno (megla 6°).
- **Lokacija:** strežniški izhod Render (omrežni izhod do api.open-meteo.com) + `enrichWithRealWeather`.
- **Vpliv:** materialno napačne odločitve uporabnika (oblačila, načrti za pohode) + vrzel zaupanja med površinama.
- **Rešitev:** diagnosticirati omrežni izhod na Render (DNS/egress/proxy), podaljšati/ponoviti timeout, ali — glej K-2 — NE prikazati vremena/✓, ko plasti ni.
- **FE/BE:** BE (infra + route).

### K-2 · HIGH — »Vreme preverjeno ✓« se izriše nad nez preverjenim vremenom
- **Problem:** TrustLine ne loči realne napovede od sezonske ocene (isti tvar polja).
- **Dokaz:** živi Render načrt (zgoraj) + `planner-trust-line.tsx:144` (`days.some(d=>d.weather)`) + `deterministic-itinerary.ts:303` (hardcoded).
- **Vpliv:** neposreden prekršek neizpodkupne rule Issue #3 §4 (»NE PRIKAZUJ ✓«).
- **Rešitev:** ob neuspehu Open-Meteo OZNAČITI vreme kot oceno (npr. `weather.estimated:true`) in izpustiti »Vreme preverjeno« (ali prikazati »Vreme: sezonska ocena«).
- **FE/BE:** BE (route: enriched marker) + FE (pogoj v TrustLine).

### K-3 · HIGH — »Odprto ob tvojem času ✓« brez datuma (plast se ni izvedla)
- **Problem:** brez startDate (privzeti tok) validacija odpiralnih časov ne more teči; ✓ se vseeno izriše.
- **Dokaz:** `geo-validation.ts:415` (`if (dayMonth !== null)`) + `planner-trust-line.tsx` (closedCount=0 → ✓).
- **Rešitev:** ✓ izrisati SAMO, če je bil datum znan (prenesti flag `openingHoursChecked` iz validacije v TrustLine).
- **FE/BE:** BE (flag) + FE (pogoj).

### K-4 · HIGH — Refine čipi: 4–11 minut spinnerja, brez timeouta/preklica/napredka
- **Problem:** prosti refine (»Ceneje«, »Bolj aktivno«, »Bolj mirno«, prosti ukaz) čaka na OpenRouter free vrsto brez trde meje; klient nima AbortController/timeout.
- **Dokaz:** browser 8–11 min do 200 (načrt se SPREMENI — €270→€20, source AI); API sonda 262 s; `planner-ai-controls.tsx:201` (fetch brez signal); nasprotje: generacija ima aiHardCap 70 s + Prekliči + faze (dokumentirano v `itinerary/route.ts:780-800`: »SDK abort tam očitno NI sprožil«).
- **Vpliv:** uporabnik misli, da je aplikacija zmrznila; opusti refinement (jedro PLAN izkušnje).
- **Rešitev:** (a) enaka Promise.race trda meja v refine ruti (npr. 45–70 s) s padcem v echo/deterministično pot; (b) AbortController + gumb Prekliči + štever v PlannerAiControls/ItineraryRefiner.
- **FE/BE:** BE (hard cap) + FE (abort/UX).

### K-5 · HIGH — AI iskanje: 35 s – 10 min, brez vidnega timeouta
- **Problem:** debounced iskanje (600 ms) pričakuje hitre odgovore; AI sonde: 35 s (uspeh) do >400 s (3/4 sond brez odgovora v 60 s).
- **Dokaz:** sonde na obeh površinah (HTTP 000); uspešna sonda 35,1 s `source:"ai"`; dialog brez napake/izčka sporočila.
- **Rešitev:** trda meja + padec na lokalno (SQL LIKE/keyword) iskanje po_DESTINATIONS/listings (podatki so že v kontekstu!) + loading/timeout stanje v dialogu.
- **FE/BE:** BE (fallback iskanje brez AI) + FE (stanja).

### K-6 · HIGH — MY TRIP za gosta = login zid v zlatem toku
- **Problem:** gost shranjuje načrt (deljiva povezava + localStorage), klik na »Moja potovanja« pa ga vrže na prijavo brez predhodnega sporočila, da je račun potreven.
- **Dokaz:** gp seja: shrani → klik nav → `/prijava`; /moja-potovanja vedno preusmeri gosta.
- **Vpliv:** prelom zlate poti točno pri »Moja potovanja«; uporabnik ne ve, da je načrt dejansko še dostopen (na /nacrtuj ali prek povezave).
- **Rešitev:** (a) gostu prikazati LOKALNA potovanja (dai:my-trips) na /moja-potovanja z nadaljnjo ponudbo računa (sinhronizacija), ali (b) ob shranitvi jasno sporočiti »Povezavo shrani — Moja potovanja zahtevajo račun«.
- **FE/BE:** FE (+ obstoječi API).

### K-7 · HIGH — GO Mode ni povezan z AI itinererjem
- **Problem:** /na-poti pričakuje potovanje iz /potovanje; AI načrt (pravkar shranjen) ni premostitev — deljena stran nima 0 povezav na /na-poti ali /potovanje.
- **Dokaz:** /na-poti po shranitvi → »Ni aktivnega potovanja«; a11y inventar deljene strani: 0 povezav.
- **Vpliv:** GO člen modela DISCOVER→PLAN→BOOK→GO je dosegljiv (noga), a NE s trenutnim AI načrtom — uporabnik mora potovanje zgraditi znova.
- **Rešitev:** gumb »Zaženi Na poti« na /nacrtuj (akcijska vrstica) + na /pot/[shareId], ki itinerer pretvori v dai:go-trip strukturo (postanki/dnevi že obstajajo).
- **FE/BE:** FE (transformacija + gumb).

### K-8 · MEDIUM — Obseg AI čipov (dan vs celotna pot) ni označen
- **Dokaz:** VLM: »chips do not visually indicate which day they affect… no text explaining scope«; a11y imena sicer nosijo »— Dan 1«, a vidno ne.
- **Rešitev:** skupinska oznaka »Za dan 1:« nad 6 čipi in »Za celotno pot:« nad Ceneje/Bolj aktivno/Bolj mirno.
- **FE/BE:** FE.

### K-9 · MEDIUM — Dvojna kontrolna skupina (delovna vrstica + rail) — 26 kontrol
- **Dokaz:** a11y inventar: 6 čipov + vnos POJAVITA SE DVAKRAT (PlannerAiControls + rail »Spremeni načrt«).
- **Rešitev:** po HIDE ≠ DELETE lahko rail zavihek ostane, a sekundarni čipi v njemu so odveč, ko je primarna vrstica vidna (prikaži v railu samo zgodovino/PlanCopilot).
- **FE/BE:** FE.

### K-10 · MEDIUM — »Dodaj v mojo pot« ne doda, ampak zamenja načrt
- **Dokaz:** klik na Bled modal → sessionStorage heroQuery »3-dnevno potovanje z destinacijo Bled…« → nova generacija (zagnana v testu); brez potrditve.
- **Rešitev:** bodisi »Dodaj Bled k trenutnemu načrtu« (refine add) bodisi preimenovati v »Zgradi nov načrt okoli Bleda«.
- **FE/BE:** FE ( obstoječi refine endpoint).

### K-11 · MEDIUM — Refine čip pod zgibom; mobilni vrstni red: kontrole pred dnevi
- **Dokaz:** y≈999 pri 900 px viewportu; mobilni VLM: dnevi niso vidni pred scrollom, AI vrstica je.
- **Rešitev:** skrol/anchor na delovno površino po generaciji; na mobilnem vrstni red naslov → dnevi → zemljevid → kontrole.
- **FE/BE:** FE.

### K-12 · MEDIUM — Go Mode vidljivost: samo noga (mobilni meni ga nima)
- **Rešitev:** dodati »Na poti« v mobilni meni (1 vrstica).
- **FE/BE:** FE.

### K-13 · MEDIUM — Generacija 41–76 s obljubi »navadno 15–40 s«
- **Rešitev:** posodobiti mikrocopy na realno obljubo (»do ~90 s«) ali pospešiti AI prvo nogo.
- **FE/BE:** FE (kopija).

### K-14 · MEDIUM — »Vstopnice« gumb odpre zavihek Nastanitev
- **Dokaz:** klik na »Vstopnice« (Bohinj) → plošča prikaže zavihek Nastanitev (Booking.com + Penzion…).
- **Rešitev:** ciljati zavihek Aktivnosti/Tiqets pri kliku z zapisom »vstopnice«.
- **FE/BE:** FE.

### K-15 · MEDIUM — Podrobnosti »1 težav« so skrite za zložkom + scrollom
- **Rešitev:** trust vrstica naj bo klikabilna (razklop »Podrobnosti izračunov« on click).
- **FE/BE:** FE.

### K-16 · LOW — Offline hard reload pokaže brskalnikovo napako (SW toplo-predpomnilnik odvisen); zoom tipki na zemljevidu majhni na 390 px; beta pasica konkurira hero CTA.

---

## ZAKLJUČEK

**ZERO FEATURE LOSS — POTRJENA.** Issue #3 je ohranil vseh ~100 zmožnosti in jih naredil bolj dosegljive (Moja potovanja v desktop navigaciji, Start Anywhere vrstica, trust vrstica, AI kontrolna vrstica, 404 stran, sidro).

**ZERO CONFUSION — ŠE NE DOKAZANA.** Glavni CTA je razumljen (TEST A ✓), zlata pot HOME→SAVE je povezana in poštena, booking semantika je resnična — a:
1. **štirje HIGH resnostni resni problemi** (K-1–K-5) delujejo NA živi produkciji in zlomijo obljubo enostavnosti: napačno vreme + dve lažni ✓ trditvi, obe AI funkciji počasnje 35 s–11 min brez izhoda;
2. **zadnja člena zlate poti** (MY TRIP gost, GO MODE povezava) sta prelomljena.

**Status: AUDIT ONLY — 0 sprememb kode. Naslednja faza po pregledu: UX FIX PASS (predlagani vrstni red: K-2, K-3 (hitra, FE/BE majhna), K-4, K-5 (trde meje), K-6, K-7 (premostitvi), nato MEDIUM).**

*Dokazila: `ux-audit-4/` (40+ screenshotov + JSON sonde + API odgovori). Vsi časi so žive meritve 2026-09-24.*
