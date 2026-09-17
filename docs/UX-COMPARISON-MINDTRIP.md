# UI/UX PRIMERJAVA — Mindtrip vs Discover Slovenia AI

> Datum: 17. 9. 2026 (revizija po uporabnikovem naročilu »analiziraj primerjaj ui
> ux mindtrip in discover slovenia nas program razlika kaj je boljse slabse«).
> Metoda: neposreden brskalniški ogled + 6 uradnih App Store screenshotov
> Mindtripove iOS aplikacije (različica 4. 9. 2026), VLM presoja (glm-4.5v)
> obeh UI-jev posnetek-po-posnetek + parne head-to-head presoje, 6 svežih
> spletnih iskanj in iTunes API. Naš UI: neposredni posnetki lokalnega
> strežnika (produkcijska koda 1.36.3) v praznem IN populiranem stanju.

## 0. Nujna aktualna ugotovitev (17. 9. 2026, ~09:00 CEST)

**Mindtripova SPLETNA aplikacija je trenutno NEDOSEGLJIVA.**

- `https://mindtrip.ai` in `https://www.mindtrip.ai` preusmerjata na
  `images.mindtrip.ai/heroku/construction.html` — Heroku »Under
  Construction« stran (»Sorry we missed you! Mindtrip is under
  construction. Please check back for exciting updates!«).
- Vse poddomene (`app.`, `blog.`, `press.`) ne odgovarjajo (DNS/ne-200).
- iOS aplikacija ŽIVI (zadnja posodobitev 4. 9. 2026, ocena 4,69/783),
  B2B DMO sporočila za javnost se nadaljujejo (South Dakota 8. 9. 2026) —
  gre za spletno infrastrukturno okvaro (slika CDN poddomena streže
  construction page — videti DNS/Heroku migracija), ne za propad podjetja.
- Google Play »Mindtrip AI : Travel Planner« (`com.travel.mindtrip`) je
  **klon neznanega razvijalca** (turška podvorna kopija z naročnino
  »Mindtrip AI Pro«) — NE uporabljati kot vir (znano že od prej).

**Posledica za nas:** okno priložnosti — njihovi (bivši) spletni uporabniki
iščejo alternativo, mi pa smo živi na obeh platformah. Analiza spodaj je
zato narejena na njihovi iOS aplikaciji (uradni screenshots, aktualna
različica) + neodvisnih recenzijah — pošteno zapisano, ker njihovega
spletnega UI-ja danes ni mogoče videti.

## 1. Vhodni material

| Vir | Datum | Kaj prikazuje |
|---|---|---|
| Mindtrip iOS App Store (`id6503107567`) — 6 uradnih screenshotov | 4. 9. 2026 | hero/onboarding, itinerary+booking hub, map discovery, AI chat osebek, POI na ruti, expert guides |
| aitravel.tools recenzija (4,5/5) | 2026 | split map+itinerary workspace, Start Anywhere, Louvre-zaprt-torek, cenovna odstopanja 20–30 % |
| monkeytravel.app recenzija | 27. 7. 2026 | »most complete free AI travel tool… in English«, login wall |
| travelanywhere.blog | 27. 8. 2026 | edini, ki zaključi plačano letalsko rezervacijo v klepetu |
| Naša aplikacija (1.36.3) — 8 posnetkov | 17. 9. 2026 | domov D/M, načrtovalec D/M + populiran (2 koti), zemljevid D, destinacije D |

## 2. Skupni verdikt (VLM parne presoje, povzeto pošteno)

| Dimenzija | Zmagovalec | Utemeljitev |
|---|---|---|
| Gostota podatkov v majhnem prostoru | **Mindtrip** | itinerer s sličicami + časi/razdalje + statusi (Check-in) v mobilnem viewportu brez nereda |
| Vizualna osebnost (»duša«) | **Mindtrip** | 3D elementi, ilustrirani AI osebek, pastelni čipi, ročni emoji — »funded startup« občutek |
| Populirano delovno površino | **izenačeno** | naš workspace (mapa+klepet zavihki, statusni trak, dnevni časovni trak, povezovalniki km/min, refine stranski trak) — VLM: »rivals Sygic Travel / Roadtrippers… legitimate high-fidelity SaaS product« |
| Zaupanje v podatke | **mi** | značke validacije, »zakaj priporočeno« z dejstvi, viri odpiralnih časov/cen — Mindtrip recenzije same priznavajo 20–30 % odstopanj cen |
| Prvi vtis (empty state) | **Mindtrip** | njihov prvi zaslon prikazuje POLEN izdelek; naš prazni načrtovalnik (desna polovica »itinerer se bo prikazal tukaj«) je VLM ocenil kot »embarrassingly empty« |
| Karta | **Mindtrip (marginalno)** | njihovi lebdeči čipi osebnosti (»Foodie traveler«) + bottom sheet; naša karta čista a utilitarna, z veliko belega prostora nad njo |
| Barvna disciplina | **Mindtrip** | dosleden pink/peach gradient sistem; naša živa »SaaS zelena« = čista, a generična |
| Tipografija | **izenačeno** | obe berljivi; njihova težja/odločnejša, naša umirjena/uredniška |
| Responsive + dosegljivost | **mi** | resnično enak izdelek 390→1920 (merjeno), 44px tap tarče, aria, SL/EN; njihov web danes sploh ni dosegljiv |
| Brez prijave do vrednosti | **mi** | celoten načrt do konca brez računa; Mindtrip ima login wall za shranjevanje (recenzije) |

## 3. Kje je Mindtrip boljši (priznano odprtokrno)

1. **Osebnost izdelka.** Ilustrirani AI osebek, 3D hrana lebdeča nad karto,
   pastelni osebnostni čipi — njihov UI čuti »toplo«, naš čisti/suh.
   VLM: naša luknja ni struktura, ampak »lacks soul and visual confidence«.
2. **Gostota brez nereda.** Itinerary kartice stisnejo sličico+metadata+
   status v ~340 px širine; mi to dosežemo šele v ~640 px kartici dneva.
3. **Bottom nav + FAB vzorci** — pravi native iOS občutek (Home/Chat/
   Bookings/Search/Profile + »Ask AI« črni FAB). Mi smo web-first (pravilno
   za našo strategijo PWA, a na iOSu videti manj »app«).
4. **Social proof v samem UI:** avatarji lokalnih strokovnjakov, »Mentioned
   by«, »Saved by 23«, zvezdice/cene na karticah. Naše kartice so
   uredniško čiste brez socialnih signalov (ker UGC nismo — a cold-start
   uporabnik tega ne ve).
5. **Transakcijska globina v UI:** Flights/Hotels kategorije s statusi
   (Check-in) — rezervacijski tok je prvorazredni državljan UI-ja. Pri nas
   je rezervacija (12 % tržnica) globoko v modalu izkušnje.
6. **Prazni prostor zna izkoristiti:** vsak njihov marketing screenshot
   pokaže_poln_izdelek; naš prvi ogled načrtovalnika je prazen.

## 4. Kje smo MI boljši

1. **Delovna površina z generiranim načrtom** (VLM na populiranem stanju):
   split mapa+klepet, statusni trak (km/čas/stroški/validacija), jutro/
   popoldan/večer segmenti, povezovalniki z PRAVIMI cestnimi km/min (OSRM),
   stranski refine trak — »legitimate, high-fidelity SaaS product«. To je
   jedro izdelka in je na ravni kategorije.
2. **Iskrenost kot UI princip:** značke geo-validacije (!/⚠ z razlogi),
   »Zakaj je priporočeno?« iz dejstev, viri pri odpiralnih časih/cenah,
   opozorilo »preveri pred obiskom«. Noben preizkušen konkurent (niti
   Mindtrip) nega te plasti — recenzije Mindtripa same dokumentirajo
   20–30 % cenovnih odstopanj in »Louvre je zaprt torek« pasti.
3. **Dostop do vrednosti:** načrt od praznega do shranjenega BREZ računa
   (anonimna identiteta), deljenje z anketami/dnevnikom brez prijav.
   Mindtrip zahteva Google/Apple račun za shranjevanje/sinhronizacijo.
4. **Web + dosegljivost:** SL/EN, 390–1920 px brez preliva (merjeno), aria,
   44px tarče, PWA offline. Njihov web je danes pod construction.
5. **Uredniška fotografija:** hero in kartice destinaciz/doživetij so
   VLM-audited fotografije (58/69 zamenjanih v IMG-FIX/MKT-IMG) — njihovi
   screenshots so pretežno UI brez destinacijske fotografije.

## 5. Naše konkretne šibkosti (VLM + lastna revizija, prioritizirano)

| # | Ugotovitev | Resnost | Predlog |
|---|---|---|---|
| 1 | **Prazni state načrtovalnika** — desna polovica prazna, VLM: »suggests the app is broken« | 🔴 visoka (prvi vtis) | demo itinerer v ozadju (zamegljen, klikabilen »Poskusi ta primer«) — imamo že demo scenarije, a niso vidni v praznem stanju |
| 2 | **Toast prekriva vsebino** (z-index/positioning ob generiranju) | 🟡 srednja | premakniti toast višje/stran od timeline |
| 3 | **Kartice postankov besedilno težke** (»Zakulji ta postanek«, praktični nasveti vedno razprti) | 🟡 srednja | collapse-by-default (kot pri practical podatkih F4.3) |
| 4 | **Zemljevid hub:** veliko belega nad karto, generični gumbi | 🟢 nizka | statistika/povzetek nad karto ali polj višje |
| 5 | **Barvna identiteta:** živozelena = »generic SaaS« (VLM) | 🟢 nizka | odločitev lastnika — emerald globlji ton bi ohranil identiteto, a to je okus |
| 6 | **FAB prekriva dnevni bar pri 320 px** (znano iz pilot audita) | 🟢 nizka | premik FAB ob scrollu |

> **STANJE IMPLEMENTACIJE (1.37.0, 17. 9. 2026): VSEH 6 POPRAVKOV JE
> IZVEDENIH.** Uporabnik je po predstavitvi poročila odobril nadaljevanje
> (»odlično nadaljuj«); implementacija + verifikacija (tsc/lint čisto,
> browser E2E, SSR i18n preverbe, VLM re-presoja: prazno stanje 8/10,
> »embarrassingly empty« razrešeno) je dokumentirana v CHANGELOG 1.37.0.
> Podrobnosti po točkah: CHANGELOG razdelek 1.37.0.

## 6. Strateški sklep

- **Funkcijsko smo na nivoju ali pred njimi** (validacija, realne ceste,
  offline, brez računov, SL/EN, lokalna tržnica) — to potrjuje obstoječa
  COMPETITIVE-ANALYSIS (§2, §24–25) in se v UI/UX analizi ni spremenilo.
- **Vizualno je vrzel »duša/gostota/osebnost«, ne struktura.** Populiran
  workspace je po VLM na ravni komercialnih izdelkov; kar manjka je
  toplota, osebnost in gostejši prvi vtis. To so izzivi dizajna, ne
  arhitekture — popravljivi z nizkim naporom (#1–#3 zgoraj).
- **Njihov web padec (17. 9. 2026) je okno:** če želimo uloviti iskalce
  alternativ, hitri popravki #1 (prazni state) in #2 (toast) imata
  najvišji ROI — prvi vtis je tam, kjer VLM vidi našo največjo luknjo.

> **STANJE OKNA (1.38.0, isti dan):** okno je izkoriščeno s stranjem
> `/primerjava` (SL+EN) — iskrena primerjava specialista z generalisti,
> cilja dolg rep ("ai trip planner no signup", "mindtrip alternative
> slovenia") brez frontalnega napada. Outreach play (kanali, varovala,
> merjenje, izstopni pogoj): OUTREACH-TOOLKIT §8. Ko se njihov web
> pobere, se outreach umakne; stran ostane kot evergreen vsebina.

> **STANJE OPCIJE 2 (1.39.0, 18. 9. 2026):** vizualna duša je
> implementirana — topel hero (jantarni sončnodnevni žar v prekrivki),
> mikro-vrstica zaupanja pod iskalnim poljem (Brez računa · preverjeno ·
> posodobljeno), compact metapodatkovni pas v karticah destinacij
> (★ocena · budget · trajanje v eni vrstici) in iskrena vrstica svežine
> s povezavo na /vir-podatkov. VLM re-presoja: hero 8/10 duša ("toplo,
> vabljivo — zlata ura"), kartice 8/10 gostota. Hkrati je v isti izdaji
> zrasla T2 podatkovna plast (uradni viri STO — glej
> docs/DATA-LAYERS-RAG.md), ki "dušo" podpira z substanco: AI odgovori
> citirajo uradne vire z značkami in geopovezavami.

> **STANJE OPCIJE 3 (1.40.0, 18. 9. 2026):** transakcijska globina je
> implementirana — rezervacija je zdaj prvorazredni državljan
> načrtovalnika s TRI dotikalnimi točkami: (1) vrstica "Rezerviraj" v
> statusnem traku (vidna takoj po generiranju, s številom ponudb),
> (2) gumb "Rezerviraj N" v glavi vsake dnevne kartice, (3) čip
> "Vstopnice" na karticah postankov z rezervabilnimi ponudbami. Vse
> tri vodijo na obstoječi BookingPanel (lokalni ponudniki + affiliate).
> Telemetrija booking_cta_clicked meri, kdaj v poti uporabniki želijo
> dejanje. VLM: 9/10 "prvorazredna akcija". S tem so VSE tri opcije iz
> te primerjave izkoriščene (1.38 okno, 1.39 duša, 1.40 transakcije).

## 7. Arhiv materiala

- Screenshoti: `/tmp/ux-audit/` (mt-shot-1..6 = Mindtrip iOS uradno,
  ds-*.png = naše strani, vlm-*.json = VLM presoje) — sessijski artefakti.
- Prejšnje analize: `docs/COMPETITIVE-ANALYSIS-MINDTRIP.md` (funkcijska
  primerjava, §24 »Kaj Mindtrip ima DANES« ostaja referenca).
