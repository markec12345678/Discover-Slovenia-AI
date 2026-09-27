# UI/UX BENCHMARK — najboljše travel platforme 2026 vs Discover Slovenia AI

> **Datum:** 27. 9. 2026 · **Audirana verzija:** `c87ffd3` (v1.120.2)
> **Naročilo:** »analiziraj najboljše travel platforme, kako imajo narejene
> vmesnike, in primerjaj z našo, da ne izgubimo nič funkcij — kako izboljšati
> UI/UX maksimalno.«
> **Metoda:** 10 svežih web iskanj (2026 viri: travelaidaily, aiagentstore,
> nomavue, techshark, App Store …) + obstoječe interne analize
> (UX-COMPARISON-MINDTRIP 17. 9., COMPETITIVE-ANALYSIS-MINDTRIP §24,
> FEATURE-MATRIX v1.4 — ~100 zmožnosti) + audit lastne kode
> (page.tsx, itinerary-planner, trip-timeline, wishlist-trip-bridge,
> chat-mini-map, planner-reorder) + browser E2E (desktop 1280 + mobilni 390,
> današnji posnetki `ux-verify-sync-120/`).
> **PRAVILO:** **ZERO FEATURE LOSS.** HIDE ≠ DELETE. Vsak predlog mora
> ohraniti vseh ~100 zmožnosti iz FEATURE-MATRIX.

---

## 0. Izvršni povzetek

1. **Funkcijsko smo v vrhu kategorije.** Od ~12 vzorcev, ki jih delijo
   najboljši (§3), jih **8–9 že imamo** — mnoge v izvedbi, ki je konkurenti
   nimajo (provenance, 0-AI core, offline Go mode, brez računa, validator
   TUJIH načrtov). Vrzeli so **3 strukturne** (cross-day drag, real-time
   prisotnost, email-forward kanal) in **~6 polirnih**.
2. **Največji ROI:** cross-day drag & drop postankov (G1) — imamo že
   within-day motor (M7 kanon), razširitev je naravna; iskreni social-proof
   signali (G4); „najboljši dnevi" iz vremena (G7).
3. **Kaj NE kopiramo:** dark patterns (urgency/scarcity), „For you"
   sledenje, login wall, izmišljene cene/ocene, klepet-checkout brez
   pregleda (§7). Naša diferenciacija je **iskrenost** — vsak prevzeti vzorec
   mora biti pošten po naše.

---

## 1. Teren 2026 — teardowni platform

### 1.1 Mindtrip (najbližji AI rival; iOS 4,69★/783)

| Kaj počnejo najbolje | Vzorec | Past (izogib) |
|---|---|---|
| **Klepet NAD zemljevidom** — chat UI plast čez interaktivno mapo, vizualne kartice, drag-and-drop itinerer (agentic comparison: »highly user-friendly … chat-based interface layered on top of an interactive map«) | split workspace | persistent map = desktop rešitev |
| **Q2 2026: Sabre + PayPal agentic commerce** — klepet → plačilo (conversational commerce at scale) | klepet-checkout | 20–30 % cenovnih odstopanj (recenzije), »Louvre zaprt torek« pasti |
| **Osebnost:** ilustriran AI osebek, 3D elementi, pastelni čipi, bottom nav + črni FAB | duša | login wall za shranjevanje |

**Naš odgovor danes:** mini-map ZNOTRAJ klepeta + „Povečaj" fullscreen
(1.41.0), „+" na vsakem kraju AI odgovora → postanek (1.42.0 — zanka
pogovor→dejanje ZAPRTA), duša hero (1.39.0), booking 3 dotikalne točke
(1.40.0). **Manjka:** persistent resizable split na desktopu (G5).

### 1.2 Layla AI (zmagovalna booking logistika — travelaidaily 2026)

- Najboljša pri **strukturiranem itinererju + zaključku rezervacije** —
  edini, ki zaključi plačano letalsko rezervacijo direktno v klepetu.
- **Naš odgovor:** rezervacijski lifecycle na časovnici (1.92.0 §3), uvoz
  rezervacij iz dokumenta (1.94.0 §4), transport resnica (§7). **Manjka:**
  most klepet→rezervacija (G6 — v naši izvedbi: klepet doda postanek, gumb
  „Rezerviraj ta postanek" pa odpre BookingPanel, NE klepet-checkout).

### 1.3 Wanderlog (»vse na enem mestu«, free, App Store)

| Kaj počnejo najbolje | Naš odgovor danes |
|---|---|
| **Drag-and-drop itinerer** (med dnevi!) | M7: drag/puščice ZNOTRAJ dneva (Issue #5/T5-D) — **manjka cross-day (G1)** |
| **Sodelovanje s prijatelji: skupni budget v realnem času** | TripCollaborator 5 vlog + skupni budget 5 vedric (1.93–1.94) — CAS, ne prisotnost (**G2**) |
| **Email-forward import rezervacij** (pošlji potrdilo → auto-itinerer) | ingest povezava/slika/PDF/točke + bookings/parse (1.94) — **manjka email kanal (G3)** |
| **Zemljevid mest + offline** | /zemljevid (FSQ 125k pinov) + offline Go mode — imamo |
| „Plan entire trips in one place" | naš DISCOVER→PLAN→BOOK→GO model (Issue #3) — imamo, enako jasno |

### 1.4 Google Maps / Travel (referenčna vzorca — že prevzeti)

Issue #12 (F12-1..4) je že prevzel Google vzorce: **iskanje nad zemljevidom**
(`Kaj iščeš?` + debounce + dropdown), **primarne kategorije** (5 razumljivih
skupin + expander „Več"), **bottom sheet popup na mobilnem** (popup-pane
reparent — kritična leaflet past rešena), **zoom bottomright**, **layers
ikona demotion** (ProviderPanel). Naša razlika ostaja: **barve pinov po
poreklu** (zeleni Preverjeno/jantarni OSM) — „zemljevid, ki prizna vir".

### 1.5 Sygic Travel + TripIt Pro (ročna kontrola)

- Sygic: tweakanje časov/stroškov/postankov ročno → **imamo** (M7 puščice
  + termin-permutacije + intentLocked §21).
- TripIt: email→auto-organizacija → glej G3.

### 1.6 GetYourGuide / Headout (marketplace UX)

- „Effortless booking" kataloga izkušenj, lokalni favoriti, **social proof**
  (ocene + števci mnenj na karticah, »N booked«).
- **Naš odgovor:** tržnica z zaključkom v modalu + košarica + affiliate
  hub; ocene/mnenja obstajajo (reviews API), a **signali niso na karticah
  kataloga (G4)** — priložnost za ISEKREN social proof (samo realni števci).

### 1.7 Booking.com / Trip.com (mega-OTA — PROTIprimer)

Cross-sell leti/hoteli/vlaki/tours po 200+ državah — a z **dark patterns**
(lažni urgency „samo še 2 sobi!", scarcity countdown). **NE kopiramo** —
naš brand je iskrenost; naš „Rezerviraj" je pošteno „N ponudb" (1.40.0).

### 1.8 Roadtrippers (ruta-specifično)

Načrtovanje OB ruti (stops along the way) → **imamo**
(PlannerLegSuggestions + MealStop + OSRM povezovalniki s km/min).

---

## 2. Katalog vzorcev najboljših (P1–P12) in naš verdikt

| # | Vzorec | Kdo najbolje | Mi (1.120.2) | Verdikt |
|---|---|---|---|---|
| P1 | Progressive disclosure (zloženo, razkrij po potrebi) | Google | PlanCheck/Telemetrija v `<details>`, ingest zavihki, refine rail | ✅ imamo |
| P2 | Map-first discovery + iskanje nad mapo | Google, Mindtrip | Issue #12 F12-1..4 (celoten val) | ✅ imamo (celovito) |
| P3 | Drag-and-drop itinerer | Wanderlog, Mindtrip | M7 within-day + puščice + termin-permutacije + intentLocked | 🟡 **G1 cross-day** |
| P4 | Realnočasovno sodelovanje + prisotnost | Wanderlog | CAS + 5 vlog + revizije/undo + ankete/dnevnik — brez prisotnosti | 🟡 **G2** |
| P5 | Booking prvorazredni državljan | Layla, GYG | 3 dotikalne točke (trak/glava dneva/čip) + lifecycle + cenovna resnica | ✅ imamo |
| P6 | Uvoz rezervacij (email/dokument) | TripIt, Wanderlog | PDF/slika/povezava/točke + parse (VLM/LLM) + DRAFT varovala | 🟡 **G3 email kanal** |
| P7 | Social proof na karticah | GYG, Mindtrip | uredniške ★ + kvalifikator „uredniška" — signali mnenj niso na karticah | 🟡 **G4 iskreni signali** |
| P8 | Osebnost/duša vizuala | Mindtrip | 1.39.0 topel hero + mikro-vrstica zaupanja + compact meta pas | ✅ delno (zadostno) |
| P9 | Prazna stanja, ki prodajajo | vsi | 1.37.0 demo itinerer v ozadju + wish čipi | ✅ imamo |
| P10 | Offline-first | Wanderlog, Sygic | Go mode + PWA + offline.html V2 + dnevi offline | ✅ imamo (močneje — GPS) |
| P11 | Iskrene cene/provenance | (skoraj nihče) | SOURCE plasti: vir vsebine, svežina, AS-OF, capability matrika, značke porekla pinov | ✅ **UNIKAT — pred vsemi** |
| P12 | Speed + micro-interakcije | Google | Reveal, generation stages, undo čip — drag brez animacije duše | 🟢 G9 polir |

---

## 3. VRZELI (dokazano, prioritizirano)

| ID | Vrzel | Resnost | Dokaz |
|---|---|---|---|
| **G1** | **Cross-day drag & drop postankov** — Mindtrip/Wanderlog vlečejo med dnevi; mi imamo samo within-day (dragOver varovala `dragging?.day !== day.day → return`, itinerary-planner.tsx r. 4734) | 🔴 visoka | koda + platforme |
| **G4** | **Iskreni social-proof signali na karticah** — mnenja/ocene ŽIVijo v modalih; kartice kataloga nimajo števcev (GYG ima) | 🟠 srednja | koda |
| **G7** | **„Najboljši dnevi" odločitveni pogled** — vreme po dnevu imamo; uporabnik ne vidi, KATERI datum je optimalen (Kayak/Hopper date-picker vzorec) | 🟠 srednja | koda |
| **G5** | **Persistent resizable split map ob klepetu (desktop)** — mini-map + fullscreen imamo; Mindtripova stalna mapa ob klepetu za večdnevno raziskovanje | 🟡 nizka | UX-COMPARISON §6 |
| **G3** | **Email-forward kanal uvoza** — parser (bookings/parse) obstaja; vstopna točka „pošlji potrdilo na tvoj naslov" manjka (TripIt vzorec) | 🟡 nizka | koda |
| **G6** | **Most klepet→rezervacija** — klepet doda postanek; gumb „Rezerviraj ta postanek" bi odprl BookingPanel (NE klepet-checkout — glej §7) | 🟡 nizka | koda |
| **G2** | **Prisotnost pri sodelovanju** — „uredi v živo" indikator (Wanderlog real-time); CAS rešuje konflikte, prisotnost pa ne | 🟢 polir | koda |
| **G9** | **Drag ghost/snap animacije** — dnd deluje functional, brez vizualne duše | 🟢 polir | koda |

---

## 4. NAČRT — maksimalna izboljšava z ZERO FEATURE LOSS

> Vsaka točka: **vzorec → stanje pri nas → implementacijska nota → varovalo.**

### Val P0 (najvišji ROI, nizko tveganje)

**P0-1 · Cross-day drag & drop (G1)** — *vzorec: Wanderlog/Mindtrip.*
- Stanje: M7 within-day (termin-permutacije, intentLocked potuje, OSRM
  invalidacija, `stop_reordered` telemetrija).
- Nota: razširitev `applyStopReorder` → `moveStopAcrossDays(itinerary,
  fromDay, fromIdx, toDay, toIdx)` v planner-reorder.ts (čista funkcija,
  bun-testabilna): array-move čez dneve + termin v ciljnem dnevu ZA
  zadnjim postankom (isti kanon kot chat-add 1.42.0) + enaka invalidacija
  obeh dni (routeGeometry/quality/geoValidation/legs) + telemetrija
  `stop_reordered {crossDay: true}`. DragOver dovoli drop na drug dan
  (odstrani varovalo r. 4734, dodaj highlight ciljnega dneva).
- **Varovalo:** puščice ↑/↓ in NL „prestavi na dan 2" OSTANEJO (dotik +
  tipkovnica + AI — trije vhodi); intentLocked potuje (§21 kanon);
  unfreezable dnevi niso nov pojem.

**P0-2 · Iskreni social-proof signali na karticah (G4)** — *vzorec: GYG.*
- Stanje: reviews API + ocene v modalih; kartice kataloga brez signalov.
- Nota: na karticah izkušenj/izdelkov prikaži **SAMO realne števce**, ki
  že obstajajo v DB: „★ 4,8 (23 mnenj)" iz agregata reviews; skupnostne
  poti: „14 potovanj skupnosti". PRAZNO → NIČ (nikoli „0 mnenj" na novo);
  NIKOLI izmišljeni števci/naročeni avatarji (razlika od Mindtripa).
- **Varovalo:** uredniška ★ ostane z kvalifikatorjem „uredniška" (1.99.0);
  novi signal = novo polje iz REALNE poizvedbe, ne copy.

**P0-3 · „Najboljši dnevi" v datumskem polju (G7)** — *vzorec: Kayak
date-picker, Hopper.*
- Stanje: vreme po dnevu se vnaša ob generaciji; uporabnik ne vidi
  optimuma pred izbiro datumov.
- Nota: ob izbiri datuma v načrtovalniku mini pas „Vreme ob tvojem času:
  sončno 22° ☀ · dež 14° 🌧" (Open-Meteo mock za ±7 dni okoli izbire) +
  čip „Najboljši dan za ogled: sob" kjer imamo weather-utils tip (Bled
  exterior). ISEKRENO: napoved >7 dni = jasno označena negotovost.
- **Varovalo:** obstoječa vremenska kartica dneva ostaja; to je SAMO
  odločitveni pomočnik pred generacijo.

### Val P1 (strukturne)

**P1-1 · Persistent resizable split map ob klepetu (G5)** — desktop `lg+`:
mini-map dobi „pripenjalni" gumb ( pushing v desno polovico klepeta,
sirina 320–480px, vlečljiva); mobilni ostane compact + fullscreen.
*Varovalo:* fullscreen „Povečaj" ostane; mini-map compact default.

**P1-2 · Email-forward vstopna točka (G3)** — v ingest zavihku „Dokument"
dodaj četrti kanal „E-pošta": prikaži naslov `plan@…` (ko bo lastnik
nastavil inbound) + „prilepi potrdilo iz e-pošte" textarea → obstoječi
`bookings/parse` (stateless). *Varovalo:* brez IMAP strežnika v repo;
parse DRAFT semantika ostaja.

**P1-3 · Most klepet→rezervacija (G6)** — v klepetu, kadar AI odgovor
vsebuje rezervabilni kraj (kanon 1.42.0 dodajanje), poleg „+" gumb
„Rezerviraj" → odpre BookingPanel kontekstualno (ISTA pot kot čip
„Vstopnice"). *Varovalo:* NIKOLI klepet-checkout (Layla vzorec plačila v
klepetu zavrnjen — uporabnik pri nas VEDNO vidi panel s pregledom).

### Val P2 (polir)

**P2-1 · Drag ghost + snap animacija (G9)** — `dragging` postanek dobi
`opacity-60 rotate-2` ghost + ciljni slot `ring-primary` + drop snap
150 ms ease. *Varovalo:* `prefers-reduced-motion` → brez animacij.

**P2-2 · Prisotnost pri sodelovanju (G2)** — websocket mini-service
(`mini-services/trip-presence`, isti vzorec kot chat demo) → „✍ ureja
Anja…" indikator na /pot. *Varovalo:* brez prisotnosti vse deluje
(CAS ostaja resnica); indikator čisto kozmetičen.

**P2-3 · Mobilna bottom-nav aproksimacija** — obstoječi sticky-mobile-cta
razširiti v 4-slotno vrstico (Načrtuj · Zemljevid · Moja potovanja ·
Priljubljene) na mobilnem, pod 44px tap tarčami. *Varovalo:* FAB klepeta
se dvigne nad vrstico; PWA strategija ostaja.

---

## 5. Kaj NE kopiramo (protiprimeri — zavezano)

1. **Urgency/scarcity** (Booking „samo 2 sobi!") — nasprotno našemu
   brandu iskrenosti.
2. **„For you" sledenje** (Mindtrip) — zavrnjeno že 1.46.0 (ne sledimo).
3. **Login wall** za vrednost — naš načrt od praznega do shranjenega BREZ
   računa ostane (diferenciator).
4. **Izmišljeni social proof** (naročeni avatarji/„Saved by 23" brez
   realnosti) — samo števci iz DB.
5. **Klepet-checkout brez pregleda** (Layla) — rezervacija VEDNO skozi
   panel s pregledom pogojev.
6. **Cene „od €X" izInvariantnih virov** — od-cena SAMO iz realnih
   podatkov (D1 kanon 1.117.0).

---

## 6. Meritve uspeha (KPI — obstoječa telemetrija + 3 novi flagi)

- `stop_reordered` (obstaja) → nov `crossDay: true` flag — delež cross-day
  vlečenj = adopcija P0-1.
- `map_search_result_selected` (obstaja) → meri P2 map-first adopcijo.
- wishlist→plan: `mytrip_prefill` vir (obstaja) + nov `wishlist_to_plan`
  klik na „Uporabi v načrtu" (F3-D most).
- klepet→booking most (P1-3): `chat_booking_cta` (nov, whitelist + docs).
- KPI: delež generiranih načrtov z ≥1 rezervacijo (booking_cta_clicked →
  booking_completed) — celotna BOOK konverzija.

---

## 7. Zaključek

Terenu 2026 vladata **Google vzorci odkrivanja** (ki smo jih že prevzeli
celovito v Issue #12) in **agentic klepet** (Mindtrip/Layla — klepet kot
plat nad zemljevidom; naša zanka pogovor→dejanje je zaprta od 1.42.0, z
protiprimerom klepet-checkouta). **Wanderlog diktira sodelovanje** — nas
CAS+vlogi+revizije pokriva, manjka le prisotnost. Naša **unikatna prednost
ostaja iskrenost** (provenance P11 — noben konkurent nima) — vsak novi
vzorec jo mora krepiti, ne razredčiti.

**Odločitev za lastnika:** P0-1/2/3 so nizko-tvegane, visoko-vredne in
pripravljene za implementacijski issue. P1/P2 po odobritvi.
