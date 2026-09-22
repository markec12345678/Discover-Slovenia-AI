# RAZISKOVALNI NABOR #2 — Mindtrip analiza (agent, 2026-09-16)

> Namen: uporabnik je naredil lastno raziskavo (nabor #1 = `AGENTS.md` +
> `docs/AI/ITINERARY-PLANNER-UI-DIRECTION.md`). Ta dokument je NEODVISNA
> agentova raziskava istega vira (Mindtrip) iz svežih spletnih podatkov,
> da imava dva nabora in se skupaj odločiva. Ne ponavlja stare analize
> iz `docs/COMPETITIVE-ANALYSIS-MINDTRIP.md` (Faza 5, mar 2026) — le
> dopolni s prostorskim/UX kotom in novimi funkcijami Mindtripa.

## 1. Metoda in viri

- 7 spletnih iskanj (z-ai web_search) + 3 poglobljena branja strani
  (z-ai page_reader): mindtrip.ai domača stran (brano 2026-09-16),
  aitravel.tools recenzija (objavljeno 2026-03-13), poskusi branj
  searchspot/stardrift/monkeytravel (2 od 3 vrnili 404 na ugibanih URL-jih —
  uporabljeni samo iskalni izsevki z datumi).
- Vsaka trditev v nadaljevanju ima vir v oklepaju. Datum = datum objave vira.

## 2. Mindtripov interakcijski model (workflow) — danes

Zgolj UX veriga, kot jo opisujejo primarni vir + recenzije:

1. **»Start chatting« je PRIMARNI CTA** domače strani (mindtrip.ai,
   2026-09-16). Pogovor ni pomožna kartica — nosi celoten vnos:
   prednosti, »pet peeves«, osebne preference → personalizacija.
2. **Vizualni odgovori med pogovorom**: karte lokacij s fotografijami,
   ocenami, zemljevidom; »Favorite« gumb → doda v načrt (mindtrip.ai).
3. **Delovna površina načrta**: zemljevid + kartice aktivnosti + opombe
   v eni zaslonki; vožnje med lokacijami izpisane neposredno
   (»3 h do Bayeux, 1,5 h do Mont Saint-Michela«) (aitravel.tools,
   2026-03-13).
4. **Dan razdeljen na segmente Morning / Afternoon / Evening**
   (aitravel.tools, 2026-03-13) — ne samo vrstica postankov.
5. **Refine skozi pogovor** — »refinement feels natural rather than
   form-filling« (monkeytravel.app, 2026-03-25).
6. **Skupina**: povabilo prijateljev → skupinski klebet V okviru poti,
   komentarji/všečki v realnem času, @Mindtrip omemba → predlogi, ki
   »usklajajo vibe vseh« (mindtrip.ai, 2026-09-16; stardrift.ai,
   2026-07-21: »real-time co-editing«).
7. **Start Anywhere® (registrirana znamka!)**: povezava, fotografija,
   screenshot ALI PDF → seznam lokacij + nasveti iz vsebine → načrt
   (mindtrip.ai; The Rundown University 2026-09-07: razume tudi nasvete
   iz Instagram Reels; techcrunch 2024-07-31: izvorno iz povezav).

## 3. Inventar funkcij Mindtrip (stanje: domača stran, 2026-09-16)

| Funkcija | Naš status | Vir |
|---|---|---|
| Chat-first načrtovanje | ⚠️ delno (hero NL na /, obrazec na /načrtuj) | mindtrip.ai |
| Zemljevid + kartice v eni površini | ⚠️ delno (karta pod 3 karticami analize) | aitravel.tools |
| Cene hotelov NA karti (popup, žive cene) | ❌ | aitravel.tools |
| Vožnje med postanki na karticah | ❌ (samo agregat km/dan) | aitravel.tools |
| Morning/Afternoon/Evening segmenti | ❌ (tekstovni time_slot) | aitravel.tools |
| Start Anywhere: povezava | ✅ F5.4 (deterministično) | mindtrip.ai |
| Start Anywhere: slika/screenshot | ✅ F8 (VLM) | mindtrip.ai |
| Start Anywhere: **PDF** | ✅ D3 (1.23.0, verificirano+E2E+testi v 1.83.1 — unpdf, 0 AI) | mindtrip.ai |
| Google Pins uvoz | ✅ F14 (1.18.0) — Mindtrip ima kot »NEW« 2026 | mindtrip.ai |
| Events (koncerti/sejmi, »fits your vibe«) | ✅ ItineraryEventsSection | mindtrip.ai (NEW, nov 2025) |
| Skupinski klebet v realnem času + @AI | ❌ (async: ankete F11 + dnevnik F12) | mindtrip.ai |
| Collections (»someday« zbirke po temi) | ❌ (wishlist srčki so 1-dimenzionalni) | mindtrip.ai (NEW) |
| Receipts (posredovana potrdila → organizacija) | ❌ (za pilota brez računov neustrezno) | mindtrip.ai, stardrift 2026-08-25 |
| **Audio predvajanje itinerarja** | ❌ (TTS priložnost!) | aitravel.tools |
| Skupna povezava + QR | ✅ | aitravel.tools |
| iOS aplikacija | ✅ PWA (F5.7) | mindtrip.ai |
| Rezervacije: hoteli (Expedia/Hotels.com/Agoda žive cene) | ⚠️ affiliate mreža brez živih cen | aitravel.tools |
| Rezervacije: leta v klebetu | ❌ (ni naš trg — notranje potovanje) | travelanywhere.blog 2026-08-27 |
| Vstopnice neposredno | ❌ pri njih tudi (samo povezave) | aitravel.tools |
| Creators (plačilo avtorjem vodnikov) | ✅ ekvivalent: lokalna tržnica (12 % kanal) | mindtrip.ai |
| Inspiration stran (priljubljeni itinerarji) | ✅ skupnostna galerija deljenih poti | mindtrip.ai |
| Magic camera (fotografija → informacija) | ⚠️ F8 pokriva načrtovalno pot | PRNewswire 2025-06-25 |

## 4. Kaj uporabniki hvalijo (z viri)

- Hitrost: popoln 6-dnevni načrt v sekundah, razdeljen na segmente dneva
  (aitravel.tools).
- Kontekstna pamet: izognil se Louvru ob torku (zaprt) BEZ poziva; plime
  pri Mont Saint-Michelu; zapomnil si 7-letnika → deževne alternative zatežene
  nanj (aitravel.tools).
- Start Anywhere = »killer feature«, edinstvena med konkurenti
  (aitravel.tools; monkeytravel.app).
- Skupinsko načrtovanje v realnem času — »most other tools are built
  primarily solo« (monkeytravel.app 2026-03-25).
- Zemljevid odličen; navigacija med klebetom in funkcijami enostavna
  (App Store ocene; searchspot 2026-05-02: »map-led, inspiration-rich,
  collaborative planning«).
- Skupnost z REALNIMI avtorji (»Saved by 23«) → E-E-A-T prednost
  (aitravel.tools).

## 5. Kje Mindtrip šibi — NAŠE priložnosti (z viri)

1. **Cene so ocene, odstopanje 20–30 %** (Disneyland: €80–110 namesto
   €61; pošteno označeno kot »estimate«) (aitravel.tools, 2026-03-13).
   → Mi: proračun iz OSRM km + razkriti viri (AMZS/DARS), 0 čarovnije.
2. **NE validira odpiralnih časov/koordinat**: »venue information is
   AI-generated and should be verified — opening hours and prices«
   (monkeytravel.app, 2026-03-25); travelsmart.global se pozicionira
   RAVNO s tem (»Mindtrip doesn't validate venue info; we validate every
   venue against Google Places«). → Validacija kot diferenciator je v
   vzponu — a nihče nema javne telemetrije (naša F17) niti validatorja
   TUJIH načrtov (naš F13, napadalni kot: »prilepi načrt iz Mindtripa«).
3. **Včasih netočno + »clunky filtering logic«** (jotform.com,
   2026-07-28). → Determinizem naše fallback plasti.
4. **Ni vozniške optimizacije z dokazom** — naše F16 2-opt s pragom 5 km/5 %
   javno izračuna prihranek. (Neposreden vir za njihovo odsotnost ne obstaja —
   sklep po pregledu funkcij v virih; opaženo odkrito.)
5. **Zahtevajo račun za sodelovanje** → naša skupinska plast (ankete,
   dnevnik) je brez računov.

## 6. Sklep za UI smer — primerjava naborov

### 6.1 Kje nabor #1 (uporabnikova smer) POTRJEN z naborom #2

| Uporabnikova točka | Moja potrditev (vir) |
|---|---|
| A: rezultat = delovna površina (ne kup kartic) | »activity cards, notes and map in one workspace« (aitravel.tools) |
| B: dempcija obrazca, NL prioriteta | »Start chatting« = primarni CTA (mindtrip.ai); »natural rather than form-filling« (monkeytravel.app) |
| C: vizualne stop kartice | fotografije povsod, kartice lokacij (mindtrip.ai, aitravel.tools) |
| D: premik med postanki (🚗 km · min) | vožnje med lokacijami izpisane na karticah (aitravel.tools) |
| E: promocija F16 prihranka | transparentnost razdalj cenjena (aitravel.tools) |
| F: pogovor pritrjen na pot | klebet nosi celoten workflow (mindtrip.ai) |
| G: mobilno najprej | App Store pohvale navigacije |

**Smer nabora #1 je skladna z vsemi svežimi viri. Ni nasprotij.**

### 6.2 Kar nabor #2 DODAJA nad naborom #1 (novo iz moje raziskave)

1. **Segmentacija dneva Jutro / Popoldan / Večer** — vizualna grupa
   time_slot-ov (vir: aitravel.tools). Poceni vizualna sprememba našega
   obstoječega time_slot polja. NE spreminja podatkovne plasti.
2. **Audio predvajanje načrta** (»Poslušaj svoj načrt«) — nihče na trgu
   nima slovenskega audio itinerarja; TTS je lokalno na voljo. Novo.
3. **PDF uvoz v Start Anywhere plast** — Mindtrip sprejme PDF; naš F8
   pokriva sliko/screenshot, F5.4 povezavo, F14 pins. PDF ekstrakcija
   besedila je majhen dodatek na obstoječi ingest tok.
4. **Zavrnitve z utemeljitvijo** (enako kot v naboru #1 »ne dodajaj«,
   a z novimi dokazi): cene hotelov NA karti (zahtevalo žive cene —
   tvegana obljuba), receipts (brez računov), skupinski klebet v realnem
   času (websocket infrastruktura; naša async plast pokriva jedro brez
   nje — opcijsko prihodnja faza).

### 6.3 Skupen sklep (predlog odločitve)

Nabora se ne izključujeta — nabor #2 potrjuje smer #1 in dodaja 3
poceni zmage (segmenti dneva, audio, PDF) ter 3 zavrnitve z dokazi.

## 7. Odločitve za uporabnika (checklist)

- [ ] **D1:** Faza 1–5 predloga UI (nabor #1) + segmentacija dneva
      Jutro/Popoldan/Večer (dodatek nabora #2) — skupaj ena sprint.
- [ ] **D2:** Audio »Poslušaj svoj načrt« (TTS, slovenščina) — ločena
      majhna funkcija pred ali po UI sprintu.
- [x] **D3:** PDF uvoz (razširitev obstoječega ingest zavihka) — majhna.
      OPRAVljENO: implementirano v 1.23.0 (unpdf besedilna plast → isti
      deterministični matcher, 0 AI); 2026-09-24 (1.83.1, TASK 95) E2E
      verificirano (PDF → PREPOZNANO 5 destinacij → samodejni 5-dnevni
      načrt, 0 napak, 0 preliva), dodanih 26 testov (cevovod + pogodbe),
      vse poštene napake verificirane (422 skeniran / 422 ni zadetkov /
      400 ne-PDF / 400 napačna magija / 413 prevelik / 405 GET).
      Dokaz: docs/screenshots/task95-pdf-ingest-plan.png.
      OPOMBA: vrstica inventarja zgoraj je bila do 1.83.1 ❌ — doc drift
      (analiza ni zajela obstoječe implementacije); popravljena.
- [ ] **D4:** Izrecno odloženo: cene na karti, receipts, real-time klebet
      (dokumentirano z utemeljitvami v tem naboru).
