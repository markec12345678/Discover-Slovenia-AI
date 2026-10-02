# UI/UX & WORKFLOW BENCHMARK — ROUND 2 (2026-10-02)

## Issue #24 — analiziraj najboljše in izboljšaj Discover brez izgube funkcionalnosti

> **Datum:** 2. 10. 2026 · **Audirana verzija:** `19b5755` (v1.163.4), živa na Render + Vercel
> **Naročilo:** issue #24 — *»Ta issue je najprej ANALIZA, ne avtomatski redesign.«*
> **Metoda — 3 vzporedna tira:**
> **A — INSPETKCIJA HEAD-A:** inventura 40 poti, navigacije, tokov A–H, državnih modelov, komponent, praznih/nalagalnih/stanj napak, PWA/offline, i18n/a11y (vsaka trditev s potjo datoteke).
> **B — KONKURENČNA RAZISKAVA:** 27 svežih spletnih iskanj (2025/2026 viri) × 6 produktov: Wanderlog, TripIt, Sygic (→ Tripomatic), Roadtrippers, **Komoot (NOV — nikoli prej benchmarkiran)**, **Polarsteps (NOV — nikoli prej benchmarkiran)**. Vsaka trditev z virom (URL). *Fact → Evidence → Interpretation → Recommendation.*
> **C — PRODUKCIJSKI AUDIT (v živo, Render 1.163.4):** 7 širin (320/390/430/1280/1440 + potrditev hidracije) × 7 glavnih zaslonov + zlati potni interakciji; **0 horizontalnega prelivanja povsod, 0 napak strani, 0 konzolnih napak**; posnetki v `docs/evidence/issue24/`.
> **Kontekst — TO JE DRUGA RUNDA:** prva runda benchmarkov je že implementirana in produkcijsko verificirana — #12 (F12 map-first Google vzorci), #13 (G1–G9, vse živo od 1.124.0: cross-day drag, split mapa, social proof, najboljši dnevi, most klepet→rezervacija …), #15 (W1–W10, 10 platform: jeziki, skupinski klepet z @AI, kolekcije, a11y …), #16 (F1–F5 lupina enega potovanja), #19 (A–G premium prezentacija), #21 (Live Trip Navigator), #22 (Travel Guardian), #23 (Guided Experience). Ta dokument NE ponavlja — preverja sveže stanje in dodaja 2 nova produkta.
> **PRAVILO (nespremenljivo):** **ZERO FEATURE LOSS. HIDE ≠ DELETE. LESS CONFUSION, NOT LESS CAPABILITY.**

---

## 0. Izvršni povzetek

1. **Pariteta ali prednost v ~27 od 29 pregledanih vzorčnih področij.** Po treh
   implementacijskih rundah (#12/#13/#15/#16/#19/#21–23) Discover pokriva praktično
   vse močne vzorce šestih benchmarkiranih produktov — večino v izvedbi, ki je
   konkurenti nimajo (iskrenost/provenance, offline Go Mode z GPS prihodi,
   brez-prijave gost tok, Guardian day-of, kanonski »Dodaj v mojo pot« na 17
   površinah). Sveža produkcijska preverba: **0 prelivanja na vseh širinah
   320–1440, 0 napak, hidracija in zlata pot delujeta.**
2. **P0 v kodi: NI najdene.** Nobena ugotovitev neposredno moti glavni workflow.
   **P0 operativno (odločitev lastnika, ne koda):** Render free-tier hladen
   zagon (~30–60 s prvi obisk, 3× izmerjeno danes) ubija prvi vtis novemu
   obiskovalcu — priporočilo: primarno domeno preusmeriti na Vercel (že nameščeno,
   brez hladnih zagonskih časov) ali Render plačani nivo. *Ne šteje kot zadosten
   dokaz samo opis — izmerjeno v živo: 3× zaporedni timeout 25–60 s, nato 200.*
3. **Ozke vrzeli (P2):** (a) `TripSocial` — skupinski klepet poti je SL-only,
   medtem ko so Diary/Polls/Presence dvojezični (L vzorec `{sl,en}`) —
   najvidnejša površina za mednarodnega obiskovalca brez EN; (b) GuidanceStrip
   je montiran samo na domači strani — `guide-engine` pozna tipe površin
   `planner`/`go`, a niso izkoriščeni; (c) README statusna vrstica na dnu
   zaostala (1.157.0 → 1.163.4; popravljeno v tem commitu).
4. **P3 backlog (INVESTIGATE — po §17 brez novega motorja):** strošek goriva po
   vrsti vozila (deterministična formula nad obstoječim strošek-ploščico),
   način hoja/vožnja za natančnejši ETA Guardian-a, »zemljevid mojih potovanj«
   (Polarsteps profilni globus — ponovna uporaba /zemljevid infrastrukture),
   delitev stroškov med popotniki, prilagodljiva GPS natančnost (baterija),
   vstopni e-poštni kanal (odvisen od infrastrukture, kot #20 zunanje).
5. **Kaj NE kopiramo (§7 zavezano, osveženo):** vsi predhodni protiprimeri
   ostajajo + novi iz tira B: omejevanje števila postankov (Roadtrippers
   waypoint-paywall — recenzentsko dokazano žge uporabnike), samodejno
   sledenje brez izrecnega namena (Polarsteps pasivni tracking je čista
   izkušnja, a pri nas zasebnost-first: Go Mode GPS je VEDNO izrecen),
   OT/real-time urejanje po vzoru Google Docs (NO NEW ENGINE — CAS je iskrena
   rešitev konfliktov), native turn-by-turn (oddaja zunanjim navigacijam je
   pravilna arhitektura).

**Sklep za lastnika (issue §19):** raziskava in načrt sta končana; implementacijska
faza je MAJHNA in natančna — 2× P2 + README (README že v tem commitu), ostalo
po odobritvi. **Priporočen obseg implementacijske faze:** TripSocial L-vzorec
(sl/en) + GuidanceStrip na /nacrtuj (površina `planner`) — oboje nizko tvegano,
navzkrižno z ZERO FEATURE LOSS. Odločitev o primarni domeni (P0 operativno) je
neodvisna in takoj izvedljiva.

---

## 1. Metodologija in dokazi (tir C — produkcija, 2026-10-02 ~15:00 UTC)

| Zaslon | 320×800 | 390×844 | 430×932 | 1280×800 | 1440×900 | Napake |
|---|---|---|---|---|---|---|
| `/` domov | ✅ 0 preliv | ✅ 0 preliv | ✅ 0 preliv | ✅ 0 preliv | ✅ 0 preliv | 0 page / 0 console |
| `/destinacije` | ✅ | ✅ | — | — | — | 0 |
| `/nacrtuj` | ✅ | ✅ | ✅ | ✅ | ✅ | 0 |
| `/moja-potovanja` | ✅ | ✅ | — | ✅ | ✅ | 0 |
| `/na-poti` | ✅ | ✅ | ✅ | ✅ | — | 0 |
| `/zemljevid` | ✅ | ✅ | — | ✅ | ✅ | 0 |
| `/destinacija/bled` | — | ✅ | — | — | — | 0 |

**Interakcije (v živo):** hidracija potrjena (žela → CTA omogočen);
`Dodaj v mojo pot` na /destinacija/bled → stanje `V moji poti` + števec `1`
na spodnji navigaciji (write-through OBE plasti); mobilni list »Več« — 15
povezav + jezik/tema/a11y + CTA, vse tarče ≥44 px; Go Mode prazno stanje —
naslov + dvojni CTA (»Sestavi potovanje« / »Načrtuj z AI«) — prazno stanje
KAŽE naslednje dejanje.

**Izkušnja prvega obiska (PRODUCTION REALITY §15):** Render free tier — 3×
zaporedni timeout (25/40/60 s) pred odzivom po ~20 min nedejavnosti; po
bujenju vse poti 200 in 0 napak. Vercel odgovarja sekundno. Hladen zagon NI
napaka aplikacije — a za novega obiskovalca je nevidni ~45 s čakanja na prvi
vtis največja realna UX ovira danes (glej P0 operativno).

---

## 2. A. KONKURENČNA UI/UX MATRIKA (tir B — 6 produktov, viri iz 27 iskanj)

| Produkt | Najboljši UX princip | Problem, ki ga rešuje | Kje je uporabljen | Vir |
|---|---|---|---|---|
| **Wanderlog** | Map+list sinhroniziran dvojni platen; dnevi barvno kodirani z izbiro dni (3-plastni gumb) | prostorsko + časovno razmišljanje hkrati | glavni zaslon načrta | wanderlog.com/blog/faq; help.wanderlog.com (5159751100443) |
| | Workflow »zbiranje → razporejanje« z drag & drop; Select all; Optimize route na dan (≤15 mest, izbira start/end) | ločevanje faze raziskovanja od urnika; kognitivna obremenitev vrstnega reda | Itinerary zavihek | help.wanderlog.com (13545624787867); wanderlog.com/trip-planner-ai |
| | Google-Docs kolaboracija z dovoljenji edit/view; budget + delitev stroškov | skupinsko načrtovanje brez sporočil | celoten dokument | play.google.com (com.wanderlog.android); wanderlog.com/tp/159995 |
| **TripIt** | ingestija prek plans@tripit.com / Inbox Sync | rezervacije raztresene po e-pošti; nič tipkanja | po rezervaciji | tripit.com/web/free/how-it-works; community.concur.com (82105) |
| | kronološka master časovnica po dnevih | vse pri roki brez iskanja | osrednji zaslon potovanja | going.com/guides/tripit-review |
| | Map View: pin na plan + carousel podrobnosti | prostorska predstava razdalj | preklop znotraj potovanja | help.tripit.com (103000063298) |
| | Nearby Places na zaslonu podrobnosti plana | »kaj je v bližini MOJEGA plana« | dan potovanja | help.tripit.com (103000063343) |
| | Day-of opozorila, »kdaj moraš oditi«, alternative | stres motenj med potovanjem | aktivna faza (Pro) | tripit.com/web/pro |
| **Sygic / Tripomatic** | itinerar samodejno na zemljevidu; 24 M POI | načrtovanje je prostorsko dejanje | osrednji zemljevid | sygic.com/travel; sygic.com/press (24M) |
| | offline-first mape na napravi | roaming/ni signala | celoten produkt | sygic.com/what-is/offline-maps |
| | samodejni preklop hoja↔vožnja >25 km/h; web planner → app prenos | nemoten prehod med načini in napravami | aktivna navigacija | sygic.com/blog/2016 (novi dizajn); sygic.com/blog/2018 (web planner) |
| **Roadtrippers** | odkrivanje v koridorju poti (»within a set distance from your route«) + filtriranje | pot JE destinacija; »kaj je OB POTI« | takoj po vnosu poti | roadtrippers.com/fuel-estimator; whistleout.com (review) |
| | itinerar kot waypointi po dnevih s km/časom na dan + MED postanki | uravnoteženje dnevne vožnje | faza načrtovanja | reddit.com/r/roadtrip (1pdem8k) |
| | fuel estimator po vrsti vozila | strošek odločitveni faktor | znotraj načrta | roadtrippers.com/fuel-estimator |
| | kurirani trip guides za hladen zagon | prazen začetek največja ovira | onboarding/inspiracija | apps.apple.com (id944060491) |
| **Komoot** (NOV) | podlage + barvna težavnost po športu (modra/rdeča/črna) na segmentih | »je TA pot primerna zame?« | načrtovalnik + podrobnosti | komoot.com/tour-characteristics; komoot.com/help/routeplanner |
| | direktna manipulacija: vlečenje črte + waypoint obvozi | lokalno znanje > algoritem | spletni načrtovalnik | komoot.com/help/routeplanner |
| | skupnostni Highlights NA mapi | odkrivanje razgledov med načrtovanjem | osrednji zemljevid | support.komoot.com (10194639751450) |
| | turn-by-turn glas + offline (tudi na uri) | v gorah ni signala; telefon v žepu | aktivna faza | apps.apple.com (id447374873) |
| | 2025 redesign: »bring hidden functions to the UI surface« | uporabnostna študija → vidnost | celoten produkt | medium.com/design-bootcamp (d044dbc90077) |
| **Polarsteps** (NOV) | pasivno sledenje (<4 % baterije/dan) + samodejni Travel Book | dnevnik brez truda; čustven zaključek | celotno potovanje + po njem | polarsteps.com; support.polarsteps.com (24005113311634) |
| | offline dodajanje spominov | tujina/letalski način | aktivno potovanje | apps.apple.com (id947925763) |
| | 2025/26 širitev v načrtovalca (transport, potrdila, AI itinerer, desktop) | en app za cel cikel | faza pred potovanjem | news.polarsteps.com/releases/planning-update-2025 |
| | deljenje poti v živo s prijatelji | bližnji sledijo varno brez sporočil | aktivno potovanje | apps.apple.com/ca (id947925763) |
| | profil z zemljevidom VSEH potovanj + globus | dolgoročna čustvena vez | profil / inspiracija | apps.apple.com (id947925763) reviews |

**Skupni imenovalec (močni signali — koliko od 6):** zemljevid kot osrednji
platen **6/6** · day-by-day itinerar **6/6** · kolaboracija/deljenje **5/6** ·
avtomatika vnosa (AI/e-pošta) **5/6** · offline **4–5/6** · številski podatki
v načrtu **4/6** · freemium Pro sloj **5/6**.

---

## 3. B. DISCOVER GAP MATRIKA (področja iz issue §4 — sveže preverjeno v HEAD 1.163.4)

| Površina | Current (dokaz) | Benchmark insight | Vrzel? | Priložnost |
|---|---|---|---|---|
| Home | 13 blokov v hierarhiji D8-F (hero+čipi, first-run, GuidanceStrip, destinacije, priljubljene AI poti, demo) | Polarsteps globus; STB sezonskost (W4) | **ni** — onboarding močnejši od vseh 6 (brez login zida) | KEEP |
| Discover | /destinacije filtri + hub; SmartSearch NL z Dodaj na vrsticah; klepet na vseh straneh | Google map-first (F12 že prevzeto); Komoot Highlights | **ni** — FSQ 125k pinov = Highlights ekvivalent, gostejše | KEEP |
| Search | Pametno iskanje nad zemljevidom (F12), debounce, dropdown | Google | **ni** | KEEP |
| Destination | modal + stran: »V bližini« sekcija (regija) + lokali v bližini (B2B listings) — `destinacija/[slug]/page.tsx:204,628` | TripIt Nearby Places | **ni** (pokrito na 2 nivojih) | KEEP |
| Add to My Trip | kanonski `add-to-trip-button.tsx` 3 velikosti, 17 površin, slovnica stanj | vsi | **ni** — unikat v kategoriji | KEEP |
| My Trip hub | MyTripView zbirka + chain-progress 5 korakov + gost/prijavljen | Mindtrip Collections (W3 — izboljšano: razdelki po destinaciji/temi) | **ni** | KEEP |
| Planner | 6072 vrstic: obrazec, ingest (slika/PDF/Maps/točke), kviz, TripMapPanel F5.1 (zemljevid poti + km/dan legenda + fokus s kartice postanka), cross-day drag (G1), `optimizeDayOrder` s toastom prihranka km + telemetrijo `day_optimized` (`itinerary-planner.tsx:1476–1525`), PlannerStatusStrip 4 ploščice, stop-leg »~X km · ~Y min«, BookingPanel, vremenski pas 7 dni (G7) | Wanderlog drag+optimize; Roadtrippers km/dan; Sygic mapa | **ni** — vsi 4 vzorci implementirani | KEEP |
| Map | /zemljevid 38 destinacij + FSQ + OSM + transferji + write-through Dodaj (F3) | 6/6 zemljevid-first | **ni** | KEEP |
| Route | OSRM povezovalniki, PlannerLegSuggestions OB nogi + MealStop | Roadtrippers koridor | **ni** | KEEP |
| Booking | 3 poti (affiliate 9 partnerjev / lastni checkout / rezervacije z AI-parse DRAFT) | Layla klepet-checkout (zavrnjeno §7) | **ni** — iskrenejše od Layla | KEEP |
| Start Trip | 3 vhodi: planner »Zaženi«, hub »Nadaljuj«, jutranji ZAČNI DAN (prod-17/18/19) | TripIt day-of opozorila | **ni** — Guardian-jutro unikat | KEEP |
| Go Mode | NASLEDNJE kartica, živa ura, ETA iskreno, samodejna progresija, NAVIGIRAJ oddaja + fail-closed, ✓/PRESKOČI, TTS GoAudioButton (W7) | Sygic/Komoot aktivni zasloni | **ni** — edini z iskrenim Guardian + offline GPS prihodi | KEEP |
| Active Stop | arrival UX geofence+hystereza+8 s; »Približuješ se X m« | nihče izmed 6 nima | **prednost** | KEEP |
| Arrival | »✓ Prišel si« + GPS≠rezervacija hint | — | **prednost** | KEEP |
| Recovery | GuardianConflictCard: FACTS→RAZLOG→POSLEDICA + recovery foldout (5 sprožilcev) | TripIt alternative | **ni** — iskreneje | KEEP |
| Nearby (prosti čas) | detectFreeTimeWindow ≥30 min + kandidati ≤ okno (zamuda NI mogoča) | TripIt Nearby | **ni** | KEEP |
| Offline | sw.js (SHELL/PLANS/tiles) + offline.html bere dai:go-trip + PWA + wake lock | Sygic offline-first | **ni** — enakovredno, GPS prihodi močneje | KEEP |
| Sharing | /pot/[shareId]: kolaboracija 5 vlog CAS, prisotnost (G2), ankte, dnevnik, **TripSocial skupinski klepet z @AI (W2, 1.131.0)**, rezervacije, budget, dokumenti, PrintQR, embed | Wanderlog Docs-kolaboracija | **delno** — TripSocial SL-only (diary/polls/presence so {sl,en}) | **P2 IMPROVE** |
| Guidance | first-run kartica + vodena pot + GuidanceStrip domov + ChainProgress hub + toast akcije; guide-engine 14 stanj pozna `planner`/`go` površine | vsi — nihče tako izčistno | **delno** — strip samo na domov (`page.tsx:208`); `planner`/`go` neizkoriščeni | **P2 IMPROVE** |
| Onboarding | first-run 4 poti + »Ne vem — pokaži mi« + demo scenariji | Roadtrippers guides; Polarsteps onboarding | **ni** — demo itinerer v ozadju (P9) močneje | KEEP |
| Empty states | EmptyState vedno z CTA ≥44 px; Go Mode dvojni CTA; hub gost/prijavljen | vsi | **ni** | KEEP |
| Loading | skeletoni role=status + aria-live; generiranje s števcem + Prekliči | vsi | **ni** | KEEP |
| Error states | ErrorState role=alert; save napaka inline+toast; /pot error boundary; 404 z 2 CTA | vsi | **ni** | KEEP |
| Trip memory | TripComplete povzetek + TripDiary + zgodovina hub + PrintQR/embed/.ics | Polarsteps Travel Book | **delno** — samodejna PDF knjiga NE (monetizacijski produkt — DO NOT COPY; print obstaja) | INVESTIGATE (lahek PDF povzetek) |
| Mobile navigation | bottom bar ODKRIJ\|ZEMLJEVID\|MOJA POT(+badge)\|POJDI\|VEČ, safe-area, 44 px, aria-current | 4-5 zavihkov vsi | **ni** | KEEP |
| Desktop navigation | scroll-glass sticky + Več dropdown (progressive disclosure #16) + CTA | Komoot 2025 »hidden to surface« | **ni** | KEEP |
| i18n | 6 lokalov; SL privzet; EN jedro; IT/DE/FR/ES omejeno + mt-notice | Alma 7 jezikov (W1 delno rešeno) | **delno** — Go Mode SL/EN (it/de dedijo EN); TripSocial SL-only | P2 (TripSocial) / P3 (široma Go Mode) |
| Budžet | TripBudgetCard na /pot; strošek ploščica planner | Wanderlog delitev stroškov | **delno** — split med popotniki manjka | P3 INVESTIGATE |
| Zemljevid vseh potovanj | hub kartice (seznam) | Polarsteps profilni globus | **da** — čustvena vez zgodovine | P3 NEW FEATURE CANDIDATE (nad /zemljevid) |
| Strošek goriva po vozilu | strošek ploščica (splošno) | Roadtrippers fuel estimator | **delno** | P3 INVESTIGATE (deterministična formula) |
| Način hoja/vožnja ETA | kanon ×1,3 ÷ 55 km/h | Sygic auto preklop | **delno** — ena formula za vse | P3 INVESTIGATE (per-leg mode → ETA) |
| Sledenje v živo | prisotnost urejanja (G2), NE lokacija | Polarsteps live share | **zavestno NE** — zasebnost-first (§12); če kdaj: izrecni opt-in | DO NOT COPY (za zdaj) |

---

## 4. C. WORKFLOW MATRIKA (tokovi A–H iz issue §5 — koraki in trenje)

| Tok | Korakov (dejavno) | Kje uporabnik lahko izgubi kontekst | Benchmark vpogled | Priložnost |
|---|---|---|---|---|
| **A — Nov uporabnik** | Home → čip/žela → generiraj → Shrani → Zaženi (~5–6 klikov) | **nič** — first-run kartica + GuidanceStrip vodi; toast »Zaženi Na poti« po shranitvi | Roadtrippers guides (imamo demo + priljubljene AI poti) | KEEP |
| **B — Načrtovanje** | Discover → Dodaj (17 površin) → hub → Nadaljuj načrtovanje (prefill) → generiraj → urejaj (drag/puščice/optimize/refine/revizije) → Shrani | regeneracija zamegli stari načrt (ostane viden) — dobro | Wanderlog zbiranje→razporejanje (imamo oboje) | KEEP |
| **C — Booking** | BookingPanel kartice → /go/[provider] (9 partnerjev, iskreni EXTERNAL) ALI košarica → CheckoutModal 2 koraka → povratni banner → Moja naročila; rezervacije poti: ročno/AI-parse → DRAFT → potrditev | EXTERNAL nikoli »potrjeno« — iskreno; PaymentReturnBanner po povratku | Layla klepet-checkout (zavrnjeno) | KEEP |
| **D — Začetek** | 3 vhodi (planner/hub/jutranji ZAČNI DAN z GPS) | jutranji cikel produkcijsko dokazan prod-17/18/19 | TripIt »when to leave« (imanj GAURDIAN jutro) | KEEP |
| **E — Aktivna pot** | NASLEDNJE → NAVIGIRAJ (oddaja) → prihod (geofence) → ✓ → samodejna progresija; PRESKOČI ghost | samodejna progresija brez vračanja v planer — boljše od vseh 6 | Sygic aktivni zaslon | KEEP |
| **F — Problem** | Guardian 🟠/🔴 → FACTS→RAZLOG→POSLEDICA → akcije → recovery foldout (kaj se je spremenilo/kaj ostaja/naslednji izvedljivi) | Guardian nikoli ne piše rezervacij (zaklenjeno) | TripIt alternative (imamo iskreneje) | KEEP |
| **G — Prosti čas** | okno ≥30 min → kategorije → kandidati ≤ okno → DODAJ (go-edit v2) | zamuda NI mogoča (varnostna rezerva) | TripIt Nearby (imamo v kontekstu dneva) | delno P3: nearby dodajanje samo konec dneva/v2 |
| **H — Zaključek** | zadnji postanek → TripComplete povzetek + 3 CTA → zgodovina hub + TripDiary | dan z nadaljnjimi dnevi OSTANE iskren noEntryLeft | Polarsteps memory (imamo dnevnik; brez fizične knjige) | P3 INVESTIGATE PDF povzetek |

---

## 5. D. PRIORITY MAP (issue §14 — user value / vpliv / kompleksnost / tveganje)

### P0 — osnovna UX težava, ki neposredno moti glavni workflow

- **[OPERATIVNO — odločitev lastnika, NI koda]** Hladen zagon Render free tier
  (~30–60 s, 3× izmerjeno). User value: visok (prvi vtis novega obiskovalca);
  vpliv na glavni tok: neposreden; kompleksnost: minimalna (preusmeritev
  primarne domene na Vercel ALI Render plačani nivo); tveganje: nič (obe
  namestitvi že živita 1.163.4).

### P1 — velika izboljšava glavnega uporabniškega toka

- **NI NAJDENE.** Po treh implementacijskih rundah glavni tokovi (A–H) dosegajo
  ali presegajo benchmark. Iskrena ugotovitev te analize: ni P1 vrzeli v kodi.
  *(Pazljivo: to ni »vse je perfekt« — P2/P3 spodaj so konkretne, a ne blokirajo
  glavnega toka.)*

### P2 — vidna izboljšava kakovosti in profesionalnosti

1. **TripSocial dvojezičnost ({sl,en} L-vzorec).** User value: srednja–visoka
   za mednarodne obiskovalce (SI·HR·ME·AL regija!); vpliv: površina deljene
   poti, najvidnejša za goste iz tujine; kompleksnost: nizka (vzorec že
   vzpostavljen v TripDiary/TripPolls/TripPresence — `trip-diary.tsx:39`);
   tveganje regresije: nizko (samo slovnica); mobile impact: nevtralno;
   performance: 0; privacy: 0; kompatibilnost: polna (dodatek ključev).
2. **GuidanceStrip na /nacrtuj (površina `planner`).** User value: srednja
   (vodstvo na najbolj »gosto« površini); vpliv: načrtovanje (tok B);
   kompleksnost: nizka — `guide-engine.ts` že pozna tip površine (neizkoriščen);
   tveganje: nizko (dodaten trak, nič ne odstranimo); kompatibilnost: vzorec
   traku že obstaja na domov (`page.tsx:208`).
3. **README statusna vrstica** (1.157.0 → aktualna) — **že popravljeno v tem
   commitu** (dokumentacijska konsistentnost, 0 tveganja).

### P3 — napredna možnost za kasnejšo fazo (INVESTIGATE — vse po §17 brez novega motorja)

| Kandidat | Vzorec | Kompleksnost | Varovalo |
|---|---|---|---|
| Strošek goriva po vrsti vozila | Roadtrippers | nizka (formula nad obstoječo ploščico) | iskrena negotovost cene goriva |
| Način hoja/vožnja na nogi → ETA | Sygic 25 km/h | nizka–srednja | fail-closed ostaja; ETA brez GPS ostaja NEZNANO |
| Zemljevid mojih potovanj (profil) | Polarsteps globus | srednja (nad /zemljevid infra) | gosti = samo lokalna potovanja, iskreno |
| Delitev stroškov med popotniki | Wanderlog | srednja (podatkovni model) | TripBudgetCard ostane vir |
| Prilagodljiva GPS natančnost (baterija) | Polarsteps <4 %/dan | srednja | NE sme zlomiti geofence prihodov (8 s stabilnost) |
| Vstopni e-poštni kanal (inbound) | TripIt plans@ | odvisen od infra (kot #20 zunanje) | parser obstaja; DRAFT semantika |
| Nearby dodajanje sredi dneva (ne samo konec) | TripIt Nearby | srednja (go-edit razširitev) | varnostna rezerva ostane |
| PDF povzetek poti (»travel book lite«) | Polarsteps | srednja (print CSS obstaja) | nič izmišljenih vsebin; čisto iz podatkov |

---

## 6. E. KEEP / IMPROVE / RESTRUCTURE / INVESTIGATE / DO NOT COPY (issue §13)

### KEEP (potrjeno sveže — ne spreminjati)
Provenance/iskrenost P11 (unikat v kategoriji) · offline Go Mode z GPS prihodi
(nihče izmed 6) · gost tok brez prijave (vsih 6 ima login zid) · Guardian
day-of jutro · arrival UX (geofence+8 s) · recovery foldout · kanonski
Dodaj gumb (17 površin) · planner: F5.1 mapa + cross-day drag + Optimiziraj dan
+ statusni strip 4 ploščice + leg km/min + G7 vremenski pas · koridor OB nogi
(LegSuggestions+MealStop) · kolaboracija CAS 5 vlog + prisotnost + @AI klepet ·
kolekcije po destinaciji/temi (W3) · a11y (kontrast+branje, STB standard) ·
prazna/nalagalna/stanja napak z naslednjim dejanjem · PWA + offline.html ·
SmartSearch NL · demo itinerer v ozadju (P9) · 0 prelivanja 320–1440 (izmerjeno).

### IMPROVE (funkcija obstaja, UX izboljšljiv)
1. TripSocial → L vzorec {sl,en} (P2)
2. GuidanceStrip → /nacrtuj, površina `planner` (P2)
3. Go Mode i18n za it/de/fr/es (trenutno dedijo EN — pošteno, a popolnjivo) (P3)

### RESTRUCTURE (funkcija dobra, placement neoptimalen)
- Ni novih ugotovitev te runde (prejšnje restrukture #16 so rešile lupino;
  današnja preverba navigacije: 5-zavihkna mobilna + Več dropdown = vzorec
  6/6 konkurentov).

### INVESTIGATE (zanimivo, potrebuje raziskavo)
Vseh 8 vrstic P3 tabele zgoraj + live location sharing (izrecni opt-in,
zasebnost-first design, šele po uporabniški povratni informaciji).

### DO NOT COPY (zavezano)
Stari protiprimeri (urgency/scarcity, »For you« sledenje, login zid, izmišljeni
social proof, klepet-checkout, izmišljene cene) + NOVI iz Round 2:
1. **Roadtrippers waypoint-paywall** (omejevanje postankov) — recenzentsko
   dokazano najbolj žgoče trenje produkta; naš načrt do 14 dni brez omejitev.
2. **Polarsteps pasivno sledenje po privzetem** — čista izkušnja, a pri nas
   vrednota zasebnosti: GPS v Go Mode je VEDNO izrecen uporabnikov akt.
3. **Google-Docs OT real-time urejanje** — NO NEW ENGINE: CAS je iskrena
   rešitev (konflikt se pokaže, ne přepiše).
4. **Native turn-by-turn** — oddaja zunanjim navigacijam (NAVIGIRAJ geo: URI +
   fail-closed) je pravilna arhitektura; Guardian + ETA je naš sloj nad tem.

### NEW FEATURE CANDIDATE
- »Zemljevid mojih potovanj« (P3) — edini kandidat z jasno uporabniško vrednostjo,
  ki ga prejšnje runde niso pokrile (Polarsteps 6.6 profilni globus).

---

## 7. Meritve uspeha (KPI — obstoječa telemetrija)

- `day_optimized` (obstaja) — adopcija Optimiziraj dan (Wanderlog ekvivalent).
- `stop_reordered {crossDay: true}` (obstaja) — adopcija cross-day vlečenja.
- `shell_nav_clicked` (obstaja, 4 površine) — zdravje lupine.
- `mytrip_prefill` viri (obstajajo) — most zbirka → načrtovalec.
- Po implementaciji P2: delež EN sej na /pot/[shareId] z odprtim klepetom
  (TripSocial) + delež sej /nacrtuj z interakcijo traku (GuidanceStrip).
- P0 operativno: p50/p95 čas prvega bajta hladnega obiska (Render vs Vercel).

## 8. Zaključek — zlata načela Round 2

> **DON'T COPY THE PRODUCT. UNDERSTAND THE BEST EXPERIENCE — THEN MAKE DISCOVER BETTER.**

Tri runde in 13 sprintov pozneje ta benchmark ugotavlja: Discover **NI več
lovilec** — je referenca v svoji niši (iskrenost + offline + brez-prijave +
Guardian). Preostali katalog izboljšav je kratek in natančen (2× P2 + P0
operativna odločitev + P3 backlog po odobritvi). Priporočeni implementacijski
sklop naslednje faze: **TripSocial {sl,en} + GuidanceStrip /nacrtuj** —
skupaj <1 dan dela, 0 tveganja za funkcionalnost, popolnoma v duhu
LESS CONFUSION, NOT LESS CAPABILITY.
