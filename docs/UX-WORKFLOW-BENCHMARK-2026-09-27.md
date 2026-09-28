# WORKFLOW BENCHMARK 2026 — Alma, Mindtrip, Stardrift & teren vs Discover Slovenia AI

> **Datum:** 27. 9. 2026 (2. audit dneva) · **Audirana verzija:** `4c2074e` (v1.124.0 —
> z implementiranimi G1–G9 iz [UX-BENCHMARK-2026-09-27.md](UX-BENCHMARK-2026-09-27.md),
> produkcijsko potrjenimi)
> **Naročilo:** »analiziraj še najboljše platforme — Mindtrip, Alma in ostale
> najboljše — kako imajo vmesnike IN WORKFLOWE, primerjaj, analiziraj, kaj se
> lahko izboljšamo.«
> **Fokus tega audita:** prvi audit je gledal **vmesnike (UI vzorce)**; ta
> gleda **celotne workflowe** (end-to-end poti uporabnika) + **nove igralce**
> (Alma — prej nepokrita, Stardrift) + **svež Mindtrip Q3/Q4 2026 stanje**.
> **PRAVILO:** **ZERO FEATURE LOSS** (obstaja naprej).

---

## 0. Izvršni povzetek — 3 ključne ugotovitve

1. **ODKRITA NEPOSREDNA NACIONALNA KONKURRENTKA: Alma (STB, slovenia.info).**
   Virtualna potovalna svetovalka Slovenske turistične organizacije (od maja
   2024, razvila Creatim na platformi Scoutbuddy, OpenAI). **70.000+ vprašanj
   v 10 mesecih 2025** (avgust sam: ~12.000), zadovoljstvo **88 → 91 %**,
   7 jezikov, Awards: Websi 2024 srebro, **Travel Tech Project of the Year
   2025** (Game Changer Ljubljana), ITB Berlin 2026. **Najbolj dejavni
   uporabniki: ITALIJANSKO in NEMŠKO govoreči** — jezikovna vrzel, ki je pri
   nas NAJVEČJA (mi: SL/EN samo).
2. **Mindtrip je med auditi dodal 4 nove workflowe** (Events, Google Pins
   import, Collections, skupinski klepet z @Mindtrip) — od teh imamo 2 že
   pokriti (ingest pins ✓, events-during-trip ✓), 2 pa sta novi vrzeli
   (W2 klepet z @AI v poti, W3 kolekcije).
3. **Kjer smo ŽE pred terenom:** provenance/plast resnice (nikomur), offline
   Go mode z GPS (Wanderlog nima), TTS »Preberi na glas« že živ (Alma voice
   guide je ŠE ROADMAP), skupnostni načrti ✓ (= Mindtrip Inspiration),
   ICS izvoz ✓ (= Stardrift calendar sync), zaščita pred klepet-checkoutom
   (naša načelna odločitev, Mindtrip Sabre+PayPal počne).

**Nova vrzelna lestvica (ne prekriva se z zaprtim G1–G9):**

| ID | Vrzel | Resnost |
|---|---|---|
| **W1** | Jeziki IT + DE (Almini največji uporabniki) — mi samo SL/EN | 🔴 kritična |
| **W2** | Skupinski klepet z @AI znotraj poti (Mindtrip) | 🟠 visoka |
| **W3** | Kolekcije priljubljenih (tematske, sodelovalne »someday« sezname — Mindtrip) | 🟠 srednja |
| **W4** | Sezonska vsebina domače strani (STB portal) | 🟡 nizka |
| **W5** | Accessibility: visok kontrast + reading mode (STB portal ima) | 🟡 nizka |
| **W6** | Dogodki kot discovery površina z vstopnicami (Mindtrip Events — delno) | 🟡 nizka |
| **W7** | Voice vodič v Go mode (Alma roadmap; mi imamo TTS danes v klepetu) | 🟢 prihodnost |
| **W8** | Razpršitev v manj znane regije kot AI načelo (Alma strateško; »Brez gužve« čip imamo) | 🟢 polir |

---

## 1. Teren — teardowni (workflow fokus)

### 1.1 ALMA — virtualna svetovalka STB (slovenia.info) 🇸🇮 *neposredna konkurrentka*

> Viri: GlobeNewswire press release STB (16. 12. 2025), slovenia.info
> (poslovna stran + portal), Creatim blog (nagrajeni razvijalec),
> travelmedia.in.

**Kaj je Alma:**
- AI pomočnica **integrirana v narodni turistični portal slovenia.info** —
  »vedno na voljo v **spodnjem levem kotu**« (chat widget) + **povezana s
  portalnim iskalnikom** (»Search AI Alma« v glavni navigaciji).
- Tehnologija: **OpenAI** + namenski podatkovni model (STB baza + **50–60
  kuriranih slovenskih turističnih spletnih strani/API**), **urna
  sinhronizacija podatkov**, GDPR enkripcija.
- **Vmesnik = klepet + priporočilnik vsebine** (»interface that combines a
  chat assistant and a content recommender — alongside the conversation,
  users receive personalised content and offer suggestions«).
- Persona: poimenovana po **popotnici in pisateljici Almi M. Karlin** —
  pripovedna identiteta, ne generični bot.
- Številke: **7 jezikov** (slo/eng/deu/ita/fra/rus/esp+chn), 24/7, stotine
  sočasnih uporabnikov; 2025 (10 m): **70.000+ vprašanj**; avgust sam
  ~12.000; **88 % → 91 %** pozitivnih ocen odgovorov. Jezikovno: največ
  slo, ita, eng, deu.
- Vrsta vprašanj: **večdnevni itinererji**, družinski izleti, pohodi/kolesarjenje,
  kulinarične izkušnje/festivali, **transport/vinjete/parkiranje** (praktična
  logistika!).

**Njeni workflow klicaji (kaj uporabnik počne pri njej):**
1. Pride na slovenia.info (katerikoli članek) → Alma v kotu → vpraša v
   svojem jeziku → dobí osebni odgovor + **vsebinske kartice ponudb ob
   pogovoru** → (konec — Alma ne načrtuje ZA uporabnika v shranljivem
   itinererju; svetuje).
2. Portal sam nosi: **selekter jezikov (7)**, temne/hč/kontrastne/bralne
   načine, sezonske kampanje (»Creating the perfect autumn day. MY WAY.«),
  zeleno naravnanost (Slovenia Green scheme), zbirke priljubljenih
   (portal-level »Favourites«).

**Alma ROADMAP (najavljeni workflowi):**
- **»Admin Alma«** — destinacije same obogotijo asistentko z lokalnimi
  vsebinami + vpogled v vrzeli informacij (B2B2C vstopna točka).
- **Real-time VOICE vodič** — spremlja popotnika na poti, zgodbe/vrhunci
  ob pravem trenutku.
- Razpršitev obiskovalcev v **manj obiskane regije** + trajnostna mobilnost.

**Naš odgovor danes:** naš AI klepet je bistveno DEJAVNEJŠI kot orodje za
načrtovanje (dodaja postanke v pot 1.42, mini-map, rezervacijski most G6,
split mapa G5) — Alma je svetovalka, mi smo načrtovalnik. **Vrzeli:**
jeziki (W1), vsebinske kartice ob pogovoru (imamo delno — GeoPlaces
seznam; kartice ponudb v odgovoru bi bile nadgradnja), sezonska vsebina
(W4), accessibility (W5), urna svežina (naša AS-OF plast je enakovredna —
provedance celo močnejša).

### 1.2 MINDTRIP (najbližji AI rival — sveže stanje Q3/Q4 2026)

> Viri: mindtrip.ai (domača stran, danes), Sabre+PayPal objave (feb–mar
> 2026), felloai/tripprof/yanvara/aiagentstore primerjave 2026.

**Sveži workflowi (novo odkriti glede prejšnjega audita):**

| Workflow | Kako deluje | Mi (1.124.0) |
|---|---|---|
| **Events** (🎉 novost) | »kaj se dogaja v bližini po tvoji vibraciji — koncerti, komedija, kmečki marketi« + **vstopnice** | 🟡 imamo Dogodki-moja-pot (datumsko/lokacijsko ujemanje ItineraryEventsSection + »Dodaj v mojo pot«) — manjka discovery brskanje + vstopnični CTA (W6) |
| **Google Pins import** | shranjene točke Google Maps → tematska kolekcija → načrt | ✅ imamo (ingest »Točke« zavihek — Google pins paste) |
| **Collections** | priljubljeno razvrščeno po destinaciji/temi/vibes; **povabi prijatelje k sodelovanju** na »someday« izletih | 🟡 wishlist-sheet je PLOŠČEN seznam (W3) |
| **Skupinski klepet z @Mindtrip** | povabi ekipo → skupinski chat ZNOTRAJ poti → **@Mindtrip omeni AI** → predlogi, ki »uskladijo vibe vseh« | 🟡 imamo CAS+ankete+prisotnost (G2), brez klepeta (W2) |
| **Receipts** | naloži potrdilo ALI **posreduj na receipts@mindtrip.ai** | ✅ G3 env-vstop ŽE pripravljen (zaggera ob nastavitvi lastnika) — Mindtrip potrdi vrednost tega kanala |
| **Inspiration page** | brskaj popularne itinererje drugih uporabnikov → dodaj njihove postanke | ✅ »Skupnost načrtuje« (isti vzorec) |
| **Start Anywhere ®** | deli vsebino (Reels/foto/screenshot/PDF) → seznam/itinerer v sekundah | ✅ ingest povezava/slika/PDF/točke |
| **Agentic checkout** (Sabre+PayPal Q2) | opiši pot → **plačilo znotraj klepeta** | ❌ ZAVRNJENO (naše načelo: rezervacija VEDNO skozi panel s pregledom — glej §5) |
| Preferenčno učenje | »več kot deli, bolj osebeni« — kopiči preference iz klepeta | 🟡 kviz »Kakšen popotnik si?« + obrazec; brez kopičenja čez seje (načrtno — glej §5) |

### 1.3 STARDRIFT (nova igralka — YC + Bain Capital)

- Pozicioniranje: »free AI travel planner — chat-based trip research for
  flights, hotels, and activities«; **»best for preference learning and
  calendar sync«** (felloai 2026).
- Bistvo workflowa: klepet-raziskava → izbor → **sinhronizacija v koledar**.
- **Mi:** ICS izvoz (F5.2 — Apple/Google/Outlook) ✅ enakovredno;
  preference glej §5 (ne sledimo).

### 1.4 WANDERLOG (delta od prejšnjega audita — brez večjih premikov)

Ostaja referenca za: real-time sodelovanje + skupni budget (imamo — CAS +
5 vedric), email-forward (imamo G3 pripravljen), drag-drop čez dneve
(imamo G1), offline (imamo — močneje, GPS).

### 1.5 STB portal (slovenia.info) kot DMO referenca vmesnika

- **7 jezikov**, visok kontrast, reading mode, dark mode — accessibility
  orodja, ki jih kot »national-grade« portal nosijo.
- **Sezonska hero kampanja** (»Creating the perfect autumn day. MY WAY.«) —
  vsebina diha z letnim časom.
- Zeleno okviranje (Slovenia Green) + razpršitev obiskovalcev kot
  državna strategija.

---

## 2. WORKFLOW primerjava — naše zlati poti vs teren

| Workflow (end-to-end) | Najboljši na terenu | Mi (1.124.0) | Verdikt |
|---|---|---|---|
| **Discovery/inspiracija** | Mindtrip Inspiration; STB sezonske kampanje | »Skupnost načrtuje« + kviz + intent čipi (tudi »Brez gužve« = crowd diffusion!) | ✅ enakovredno; manjka sezonskost (W4) |
| **Začetek od vsebine (Start Anywhere)** | Mindtrip (Reels/foto/PDF/pins) | ingest 4 kanali + wishlist most | ✅ imamo |
| **AI svetovanje v jeziku uporabnika** | **Alma (7 jezikov; IT/DE najbolj dejavni!)** | SL/EN | 🔴 **W1** |
| **Pogovor → dejanje (postanek/rezervacija)** | Mindtrip (agentic); Layla (checkout) | »+« dodaj postanek, G6 most v panel, G5 split mapa | ✅ naša POŠTENA izvedba (panel, ne checkout) |
| **Načrtovanje/urejanje** | Wanderlog/Mindtrip drag | M7 + G1 cross-day + G9 duša + puščice + NL | ✅ vrh |
| **Sodelovanje** | Mindtrip skupinski klepet z @AI | CAS + 5 vlog + revizije + ankete + G2 prisotnost — brez klepeta | 🟠 **W2** |
| »Someday« načrtovanje | Mindtrip Collections | wishlist ploščen | 🟠 **W3** |
| **Rezervacija** | Layla/Mindtrip checkout v klepetu | 3 dotikalne točke + lifecycle + cenovna resnica | ✅ (načelna razlika — iskreno) |
| **Uvoz potrdil** | Wanderlog/Mindtrip email-forward | parse + G3 naslov (env-gated) | ✅ pripravljeno |
| **Koledar** | Stardrift calendar sync | ICS izvoz | ✅ |
| **Na poti (Go)** | Sygic/Wanderlog offline; **Alma voice (roadmap)** | Go mode GPS + offline + PWA; **TTS že živ v klepetu** | ✅ danes; W7 = naravna nadgradnja |
| **Resnica/zaupanje** | (skoraj nihče) | provenance plasti + AS-OF + poreklo pinov | ✅ **UNIKAT** |
| **Accessibility** | STB portal (kontrast/branje) | dark mode + reduced-motion + ARIA | 🟡 **W5** |

---

## 3. VRZELI W1–W8 (dokazano, prioritizirano)

| ID | Vrzel | Resnost | Dokaz |
|---|---|---|---|
| **W1** | **Jeziki IT + DE** — Alma: največ vprašanj ravno v IT/DE; slovenski turizem ima IT/DE kot top source trge. Mi: samo SL/EN (1775 nizov × 47 namespace) | 🔴 kritična | Alma statistika (STB/Creatim) + lastna koda |
| **W2** | **Skupinski klepet z @AI v poti** — Mindtripovo najmočnejše sodelovalno orodje: skupinski chat ZNOTRAJ poti, @AI uskladi predloge »za vse vibe«. Mi: CAS/ankete/prisotnost, klepeta ni | 🟠 visoka | mindtrip.ai + koda (trip-collaboration brez chat) |
| **W3** | **Kolekcije priljubljenih** — tematske/sodelovalne »someday« sezname (destinacija/tema/vibe) + povabi prijatelje. Mi: wishlist-sheet ploščen (425 vrstic, 0 teme) | 🟠 srednja | mindtrip.ai + koda |
| **W4** | **Sezonska vsebina domače strani** — STB: »Perfect autumn day« hero; turizem je hiper-sezonski. Mi: statičen hero (0 sezon. omemb v page.tsx) | 🟡 nizka | slovenia.info + koda |
| **W5** | **Visok kontrast + reading mode** — STB portal kot nacionalni standard accessibility. Mi: dark mode + reduced-motion + ARIA, brez kontrastnega/bralnega načina | 🟡 nizka | slovenia.info |
| **W6** | **Dogodki kot discovery + vstopnice** — Mindtrip Events brskalna površina »po vibraciji« z vstopnicami. Mi: Dogodki so (lepo!) vezani na datum poti — manjka prosto brskanje + CTA | 🟡 nizka | mindtrip.ai + itinerary-events |
| **W7** | **Voice vodič v Go mode** — Alma roadmap (zgodbe ob pravem trenutku na poti). Mi: TTS že v klepetu (speechSynthesis §7) — naravna razširitev na Go mode | 🟢 prihodnost | Creatim/STB + koda |
| **W8** | **Razpršitev kot AI načelo** — Alma strateško usmerja v manj znane regije. Mi: »Brez gužve« intent čip obstaja; utrditi v AI odgovorih | 🟢 polir | slovenia.info + naši čipi |

---

## 4. NAČRT (valovi, ZERO FEATURE LOSS)

### Val V0 — odločitev lastnika: **W1 jeziki IT + DE** 🔴
- **Zakaj prvi:** Alma dokazuje, da so IT/DE govoreči NAJDEJAVNEJŠI vprašalci
  za Slovenijo. Naša platforma je SL/EN — največji naslovni trg je zunaj
  naše vrstice.
- **Nota:** i18n infrastruktura je disciplinirana (1775 nizov, 47 ns,
  task71 paritetni testi) → dodajanje `it.json`/`de.json` + locale routing
  + TTS/locale-aware formati + meni jezikovne selekcije (3→5). VEČJE
  delo (prevodi) = odločitev + vir lastnika (strošek prevajanja, lahko
  AI-podprto s človeško revizijo — naš provenance pristop zahteva
  označbo strojnega prevoda dokler ni revidiran).
- **Varovalo:** SL ostane primarni; paritetni testi se razširijo na 4
  jezike; nikoli delno prevedena stran (fallback EN z indikatorjem).

### Val V1 (visoka vrednost) — **W2 + W3**
- **W2 skupinski klepet z @AI:** mini-service razširitev (trip-presence
  ŽE teče na 3003 — ista infrastruktura!) → soba `trip:{shareId}` dobi
  chat backlog (memory, N zadnjih) + klient TripChat panel na /pot;
  »@ai« omenjen v sporočilu → klic obstoječega chat API z kontekstom
  poti (dnevi/postanki/skupni budget) → AI predlog kot sporočilo v nit.
  *Varovalo:* CAS ostaja resnica za mutacije; AI samo predlaga (gumb
  »Dodaj v pot« ob predlogu — isti kanon kot klepet »+«).
- **W3 kolekcije:** wishlist-sheet → razdelki po temi (obstoječi intent
  čipi kot semenske teme) + po destinaciji; share kolekcije = obstoječi
  share kanon. *Varovalo:* ploščen seznam ostane kot »Vse«; dodajanje v
  kolekcijo iz povsod (obstoječi wishlist CTA) se ne spremeni.

### Val V2 (polir) — **W4 + W5 + W6 + W8**
- **W4 sezonska:** hero pas dinamiziran po mesecu (4 vsebinske različice
  SL/EN, brez nove infrastrukture — statične mape po mesecu). *Varovalo:*
  H1 vprašanje ostane; čip »Brez gužve« ostane.
- **W5 accessibility:** `visok-kontrast` (CSS filter/variante) + reading
  mode (typografski zoom) v obstoječi ThemeToggle sosednji. *Varovalo:*
  respects prefers-contrast/... media queries.
- **W6 events discovery:** obstoječo Dogodke sekcijo na /nacrtuj dopolni
  »Kaj se dogaja izven tvojih datumov« brskalni pas + vstopnični CTA
  (ista G6 pot — affiliate/partner). *Varovalo:* datumsko ujemanje
  ostane primarno.
- **W8 razpršitev:** AI sistemski namig (SYS prompt dopolnitev) naj v
  odgovorih pri gužvi predlaga alternativne regije — BREZ spreminjanja
  izbire uporabnika. *Varovalo:* nikoli skrito preusmerjanje.

### W7 (prihodnost, po Go mode združevanju)
- Voice vodič: TTS ✓ danes v klepetu → Go mode »preberi postanek« /
  »kaj je v bližini« gumb (speechSynthesis + geolokacija). Odvisno od
  Alma časa-izdaje (njihov roadmap = naš poligon).

---

## 5. Kaj NE kopiramo (zavezano, posodobljeno)

1. **Agentic klepet-checkout** (Mindtrip Sabre+PayPal) — rezervacija VEDNO
   skozi panel s pregledom pogojev (naša temeljna iskrenost).
2. **Preferenčno kopičenje/»For you« sledenje** (Mindtrip/Stardrift
   »preference learning«) — zavrnjeno 1.46.0; preference živijo v
   seji/kvizu, ne v profilu.
3. **Login wall** — načrt brez računa ostaja diferenciator.
4. **Izmišljeni social proof** — samo števci iz DB (G4 kanon).
5. **Urgency/scarcity** — nikoli.
6. **Creator monetizacija** (Mindtrip Creators) — ni naš model (naši lokalni
   ponudniki so naš »creator« ekosistem — Partner portal).

---

## 6. Meritve (KPI)

- **W1:** delež sej v it/de locale (analytics obstoječi event imenik —
  jezikovni event dodati); konverzija it/de sej → generiran načrt.
- **W2:** `trip_chat_message` + `trip_chat_ai_mention` (nova telemetrija,
  whitelist po kanonu); delež poti z ≥3 sodelujočimi v klepetu.
- **W3:** `wishlist_collection_used`; delež wishlist dodajanj v konkretno
  kolekcijo.
- **W4:** sezonski CTA klik (obstoječi hero pas).
- Splošni: BOOK konverzija (obstoječa), skupnostni delež (obstoječ).

---

## 7. Zaključek

Teren se je od jutranjega audita premaknil na dva načina: (1) odkrita je
**neposredna nacionalna konkurentka Alma**, ki dokazuje, da je povprašanje
po AI svetovanju o Sloveniji najmočnejje ravno v **IT/DE jezikih** — in da
DMO-grade platforme nosijo accessibility + sezonskost kot standard; (2)
**Mindtrip je workflow-prenos na sodelovanje** (klepet z @AI, kolekcije)
in vsebinski discovery (Events). Naša pozicija ostaja močna tam, kjer smo
bili izbrani: **iskrenost + provenance + offline + brez računa** — in danes
dokazano (G1–G9) tudi v načrtovalni strojni sobi.

**Največja odločitev za lastnika: W1 (IT/DE jeziki).** Vse ostalo je
izvedbeno znotraj obstoječih vzorcev.

---

---

# DODATEK — 2026-09-27/28 (večerni delta): pokritost 10/10 + teren se je premaknil

> **Sprožilec:** nadaljevanje naročila ("odlicno nadaljuj") — dopolnitev
> prekinjene vzporedne raziskave (zastale slike 19-a). Celotna raziskava
> zdaj pokriva **10 platform**: Alma, Mindtrip, Stardrift, Wanderlog
> (jutranji audit) + Wonderplan, Trip Planner AI (raziskava 19-b,
> `research/wonderplan-tripplanner.md`) + **Layla, Roam Around, Google
> Gemini/AI Mode** (dodatek 20, `research/layla-gemini-roamaround-mindtrip.md`).
> Metoda: VLM analiza zastalih slik + živa curl preverba vsake trditve +
> 10 iskanj.

## A. Teren se je premaknil (živo preverjeno)

1. **MINDTRIP JE ČRN.** `mindtrip.ai` (tudi `/login`, `api.`, `app.`) →
   302 → `images.mindtrip.ai/heroku/construction.html` — »Under
   Construction. Please check back for exciting updates!« Celoten urad
   (marketing + aplikacija + API) je temen, brez ene novinarske omembe,
   medtem ko ga recenzije od 22.–23. 9. 2026 še vedno navajajo med
   vrhunska orodja. `/heroku/` pot = signal selitve infrastrukture.
   **Posledice:** (a) zanesljivost je jarek — naša disciplina uptime +
   provenance plasti je *demonstriran* diferenciator; (b) odprto je
   časovno okno akvizicije (W10); (c) jutranji §1.2 opisuje žive funkcije,
   ki jih zvečera ni več — delta preverbe so stalna nujnost.
2. **Layla → Expedia veriga.** Layla AI GmbH (Berlin) je prevzela Roam
   Around (PhocusWire); Expedia Group je 31. 7. 2026 prevzela Laylo.
   `layla.ai` = bot-zid (429/Vercel checkpoint); `itslayla.com` (nekdanja
   tržna domena) je zdaj **nepovezana Shopify modna trgovina**. Klepet-prvi
   polni lijak (ideja → itinerer → rezervacija) z Expedia inventarjem —
   naša G5/G6 ostajata iskrena protuteža; ničesar novega za kopiranje.
3. **Roam Around teče kot legacy** (`roamaround.app`, živ): tekstovni
   itinererji brez zemljevida, Google login zid, **token ekonomija** z
   deljenjem-z-dobičkom (»Share and earn 3 free tokens«) in WordPress
   embedom. Zabeleženo pod »ne kopiramo (zaenkrat)«.
4. **Google komoditizira generični AI itinerer.** Časovnica uradnih objav:
   AI Mode Canvas itinererji (17. 11. 2025) → vodila za promptanje poti
   (14. 1. 2026) → »7 načinov« (17. 4. 2026) → Gemini itinererji, ki
   »žonglirajo obstoječe načrte« (6. 8. 2026) + Gems. **Prosti
   privzeti konkurent** — vertikalna globina (podatki, provenance,
   offline GPS, skupnost, lastna ponudba) je edini anti-komoditizacijski
   sklad. To *potrjuje* strategijo, ne odpira UI vrzeli.

## B. Stanje W1 (posodobitev)

**W1 (IT/DE) se izvaja** — po odobritvi lastnika: 1.126.0 (faza 1),
1.127.0 (faza 2a: /destinacija/* + /zemljevid, 570 strani/jezik),
1.128.0 (faza 2b-1: planner pogon 4-jezičen + UI 100 %) — **vse v
produkciji**. Ostanki: faza 2b-2 (plan-qa/packing-smart/refine+parser,
odprtje /it/nacrtuj + /de/nacrtuj) — Issue #15.

## C. Nove vrzeli (W9–W10) — dokazano, prioritizirano

| ID | Vrzel | Resnost | Dokaz |
|---|---|---|---|
| **W9** | **Kontekstualni deep-link vsebina → klepet** — Trip Planner AIjev najmočnejši akvizicijski vzorec: vsak vodniški razdelek ponudi klepet z *vnaprej-izpolnjenim, namenu-skaldnim* vprašanjem (`layla.ai/chat?ask=…`). Mi: Chatbot živi na 12+ površinah, a **/destinacija/* (38 × 5 pod-poti) klepeta nima** in pre-fill mehanizma ni nikjer (rg: 0 zadetkov initialPrompt/searchParams v klepetu) | 🟠 srednja | tripplanner.ai/paris (19-b) + naša koda |
| **W10** | **Časovno okno akvizicije: »Mindtrip alternativa«** — mindtrip.ai je črn (živo preverjeno), recenzije ga še navajajo, iskanja alternativ pristanejo NA construction page. Iskrena vsebina (blog primerjava: deterministic engine, provenance, offline Go, /pot skupnost) | 🟡 nizka (časovno občutljiva — okno se zapre, ko se Mindtrip vrne) | curl 302 → construction.html + recenzijski zamik |

**W9 oblika (zero feature loss):** obstoječi Chatbot dobi neobvezen
`initialQuestion` prop (odpre se s pred-izpolnjenim, UREDNIM vprašanjem —
uporabnik lahko popravi/izbriše pred pošiljanjem). Vstopne točke: guide
razdelki »kje spati« (persona vprašanja), best-time pas, things-to-do
prazna stanja, /destinacija hero pas »Vprašaj AI o {destinacija}«.
*Varovalo:* klepet brez pre-filla ostaja nespremenjen povsod; nobeno
vprašanje se ne pošlje samodejno; G5/G6 poti nespremenjene.

## D. Kaj NE kopiramo (dodatek)

7. **Roam Aroundovo deljenje-z-dobičkom** (»Share and earn 3 free
   tokens«) — usmerjeno napotništvo zaenkrat zavrnjeno: kompleksnost
   (token knjigovodstvo, goljufijska površina) + nasprotuje našemu
   brezpogojnemu skupnostnemu deljenju (/pot). ~~Embed vzorec za bloge
   ostaja odprt za prihodnje (nizka prioriteta).~~ **Embed vzorec je
   ZAPRT z 1.140.0 (D7):** javna pot na /pot/[shareId] ponudi čist
   iframe snippet (»Vdelaj na svojo stran ali blog«) → živ prikaz na
   /pot/embed/[shareId] (brez lupine/urejalnih ploskev, atribucijski
   pas, CSP frame-ancestors * SAMO za to pot — vse ostalo ostaja XFO
   DENY); telemetrija trip_embed_copied + page_view /pot/embed/*.
   Token ekonomija ostaja ZAVRNJENA.

## E. Posodobljena lestvica (celotna, 10/10 platform)

| Vrzel | Resnost | Stanje |
|---|---|---|
| W1 jeziki IT/DE | 🔴 | **v izvedbi** (1.128.0 v produkciji; 2b-2 ostanka) |
| W2 skupinski klepet @AI | 🟠 | odprto |
| W3 kolekcije »someday« | 🟠 | odprto (obstoječe »zbirke« = kurirane VSEBINSKE, ne uporabniške wishlist) |
| W9 vsebina → klepet pre-fill | 🟠 | **novo** |
| W4 sezonska domača | 🟡 | odprto |
| W5 kontrast/branje | 🟡 | odprto |
| W6 events discovery | 🟡 | odprto |
| W10 Mindtrip-alternativa okno | 🟡 | **novo, časovno občutljivo** |
| W7 voice v Go | 🟢 | prihodnost |
| W8 razpršitev v AI | 🟢 | polir |

**Kategorija po popolni pokritosti:** pol se utrjuje med *klepet-prvi
lijaki z OTA denarjem* (Layla←Expedia; Mindtrip←Sabre/PayPal, zdaj črna)
in *prostimi privzetimi* (Google AI Mode/Gemini). Ostali so login-zidani
generatorji kvizov (Wonderplan), SEO lijaki (tripplanner.ai) ali legacy
token posestvi (Roam Around). **Nihče v kategoriji ne združuje: načrti
brez računa + deterministični motor + provenance plasti + offline GPS Go
+ lastna ponudba tržnice + skupnostni načrti.** W-list + W9/W10 je
celotna, iskrena razdalja do terena.
