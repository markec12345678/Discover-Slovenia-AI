# TRAVEL GUARDIAN — DYNAMIC TRIP INTELLIGENCE (Issue #22)

> Operativni digitalni sopotnik na `/na-poti`: Discover med potovanjem razume
> **stanje celotnega dne** — časovno tveganje, proste časovne luknje, konflikte
> in obnovo poti. Zgrajen NA kanoničnem Live Trip Navigatorju (#21), brez
> podvajanja modelov. **Vse jedro je deterministično** — AI ni vir resnice
> (issue §3).

- **Verzija:** 1.162.0 (issue #22)
- **Stanje:** IMPLEMENTED + VERIFIED (produkcijski dokazi: glej
  `docs/evidence/issue22/` in `docs/TRAVEL-GUARDIAN-STATUS.md`)
- **Baza:** #21 Live Trip Navigator (1.159.0–1.161.1) — travel state, arrival
  detection, geo pogodba, persistanca, Go Mode UX

---

## 1. ARHITEKTURA — nova ČISTA plast na #21 (brez podvajanja)

```
                    ┌──────────────────────────────────────────────────┐
  #21 kanon  ──────►│ buildGoView(trip, now, GPS, done, skipped)       │
  (nespremenjen)    │   → next / remaining / line / done / skipped     │
                    └────────────────────┬─────────────────────────────┘
                                         │ GoView (isti pogled kot zaslon)
         ┌───────────────────────────────┼───────────────────────────────┐
         ▼                               ▼                               ▼
┌─────────────────┐          ┌───────────────────┐          ┌──────────────────┐
│ time-reserve.ts │──rezerva─►│ conflict-detect.ts│─konflikt─►│ trip-health.ts   │
│ §5 ETA+rezerva  │          │ §6 10 vrst        │          │ §4 buildGuardian │
└─────────────────┘          └───────────────────┘          └────────┬─────────┘
                                                                     │ snapshot
                              ┌──────────────────────────────────────┼───────────────┐
                              ▼                                      ▼               ▼
                     ┌──────────────────┐               ┌──────────────────┐ ┌──────────────┐
                     │ recovery.ts §7/8 │               │ day-start.ts §13│ │ free-time.ts │
                     │ RECOVERY MODE    │               │ ZAČNI DAN       │ │ §9–11 okno + │
                     └──────────────────┘               └──────────────────┘ │ nearby vrata │
                                                                             └──────────────┘
```

**Vsi moduli so čisti** (0 omrežja, 0 db, 0 localStorage, 0 AI; `now` je
vedno parameter — isti vhodi → isti izhodi). Guardian ničesar ne persistira:
slika dneva se preračuna iz (pot + progress + ura + GPS) — kanon #21 §9.

### Zakaj ne vzporeden model?
Issue §1: "Issue #21 je temelj in ga NE podvajaj." Guardian bere ISTEME
projekcije, ki jih vidi zaslon (`GoView` + `StopGeo` + `legFromPrev` +
`openingStatusAt` + `bookingRows`), in iz njih izpeljuje stanje. Edina nova
persistenca je **dodajanje nearby kandidata** (§9) — in sicer SAMO v v2
zapise (AI itinerer) prek obstoječe `saveItineraryGoTrip`; v1 (kanonična
pot iz /potovanje) ostaja nedotaknjena (iskrena zavrnitev z opombo).

### Pot podatkov enega izračuna (primer: časovna rezerva)
```
GPS fiksacija (use-geolocation #21) ─┐
StopGeo (resolve-stop-geo #21 §4)   ─┼─► evaluateTimeReserve() ─► {status, eta, reserveMin, quality}
time.start (TripEntry — SAMO realni vir) ─┘         │
                                                    ▼
                       hevristika (road-routing.heuristicLeg — kanon Go Mode)
```

---

## 2. KANONIČNE ODLOČITVE (ADR)

| # | Odločitev | Utemeljitev |
|---|---|---|
| 1 | **Rezerva samo za fixed termine** (`time.start`) | Raziskava §25/4: podpiramo SAMO realne čase virov; flexible postanki (večina!) nimajo rezerve — ne izmišljujemo check-in oken/time range |
| 2 | **ETA = hevristika** (premica ×1,3 / 55 km/h, `round5`) | Isti kanon kot Go Mode etaInfo; OSRM od žive pozicije NI kanon (produkcija: adapter odstopa). Vedno ESTIMATED — nikoli VERIFIED |
| 3 | **ON_TRACK samo z dokazom** | §4: "Ne uporabljaj pozitivnega statusa samo zato, ker ni zaznan problem." Fixed + brez GPS → UNKNOWN; flexible + brez geo → UNKNOWN |
| 4 | **BLOCKED = preklicana rezervacija na naslednjem postanku** | Edini primer, kjer nadaljevanje zahteva ZUNANJI pogoj (ponudnikov poseg) |
| 5 | **Prekrivanje terminov samo z dokazom trajanja** | Brez `durationMin`/`time.end` ne trdimo OVERLAP (iskrenost; lažni alarm bi bil slabša izkušnja kot tišina) |
| 6 | **Free-time varnostna rezerva = 15 min + 10 % okna** | §10: nikoli ne porabimo celotne luknje; konfigurabilno (`DEFAULT_FREE_TIME_CONFIG`) |
| 7 | **Nearby celotna ZANKA ≤ okno** | Vožnja tja + obisk + vožnja do termina — matematično zagotovljeno, da predlog ne povzroči zamude (§9) |
| 8 | **Nearby samo v2 zapisi** | v1 kanonična pot (selectedIds) se ne mutira s POI-ji, ki niso produkti te poti |
| 9 | **Guardian ne piše rezervacij** | §20 + #21 §3: CANCELLED samo vpliva na prikaz; akcije so Navigiraj/Preskoči/Preuredi/Odpri — vse obstoječi mehanizmi |
| 10 | **`now` je parameter** | Determinizem + testabilnost (kanon #21 travel-state) |

---

## 3. OFFLINE MATRIKA ZMOŽNOSTI (§17 — dejanska implementacija)

| Funkcija | Internet | GPS | Deluje offline? | Dokaz (koda) |
|---|---|---|---|---|
| Ogled shranjene poti + shema dneva | ✗ | ✗ | **DA** | `dai:go-trip` (go-persist) |
| GPS pozicija + natančnost + stale | ✗ | ✓ | **DA** | use-geolocation (#21; od 1.172.0 #24 Sklop 10 prilagodljiva natančnost: daleč > 2 km varčni način, ob postanku polni — geofence prihodi varni) |
| Razdalja/smer (haversine) | ✗ | ✓ | **DA** | go-view `toCard` |
| Arrival detekcija | ✗ | ✓ | **DA** | travel-state (#21) |
| **Guardian: stanje dneva (🟢/🟠/🔴/⚪)** | ✗ | delno | **DA** (brez GPS: UNKNOWN iskreno) | trip-health.ts |
| **Guardian: rezerva/ETA** | ✗ | ✓ | **DA** (hevristika je čista) | time-reserve.ts |
| **Guardian: konflikti** | ✗ | delno | **DA** (opening parser je čist) | conflict-detect.ts |
| **Guardian: recovery** | ✗ | ✗ | **DA** | recovery.ts |
| **ZAČNI DAN povzetek** | ✗ | ✗ | **DA** | day-start.ts |
| **Free-time okno** | ✗ | ✓ | **DA** | free-time.ts |
| **Free-time nearby predlogi** | ✓ | ✓ | **NE** → iskrena opomba | `/api/map/pins` |
| External navigacijski handoff | ✗ | ✗ | `geo:` DA / web NE | go-nav (#21) |
| Vreme pri naslednjem postanku | ✓ | ✗ | NE → opomba | /api/weather (task 65) |
| Rezervacijska prekrivka (bookingRows) | ✓ | ✗ | NE → načrtovani statusi | /api/journey/bookings |
| OSRM vozne noge (načrtovane) | glej #21 | ✗ | v zapisu DA | legFromPrev (persisted) |

**Kaj deluje SAMO ob odprti strani (§16):** ves živi Guardian (ura 30 s tick,
GPS watch, ocene, wake lock). Background execution / push obvestila NE
obstajajo — mobilni brskalniki jih za PWA v zavihku ne omogočajo brez
service workerja + dovoljenj; issue §16 to izrecno prepoveduje brez
lifecycle modela → **dokumentirana meja, ne tiha luknja**.

---

## 4. DATA QUALITY LEGENDA (§18 — verified ≠ estimated po teži)

| Razred | Pomen | Primeri |
|---|---|---|
| `VERIFIED` | preverjeno od konca do konca | own geo, OSRM noga, booking vrstica, prisotnost (arrived) |
| `ESTIMATED` | ocena — izrecno labelirana | hevristika vožnje, approximate geo (fsq/osm) |
| `UNKNOWN` | ni mogoče izračunati | rezerva brez GPS, flexible termin |
| `STALE` | obstaja, a zastarelo | GPS fiksacija > 60 s (kanon STALE_POSITION_MS) |
| `MISSING` | vir ni podal | geo brez koordinat, rezervacija brez vrstice |

Pomožne: `geoQualityOf`, `positionQualityOf`, `routeQualityOf`,
`bookingQualityOf` (time-reserve.ts); legenda `QUALITY_LABELS`.
Vsak Guardian izpis nosi NAJŠIBKEJŠI veljavni člen (iskrenost).

---

## 5. ZASEBNOST IN VARNOST (§19/§20 — revizija 1.162.0)

- **GPS pozicija ostaja lokalna.** Guardian je čista projekcija v pomnilniku
  seje; 0 nove persistance (edini novi zapis = javni PODATKI vira dodanega
  nearby postanka — naslov/geo vira, ne uporabnikova lokacija).
- **Nearby iskanje nosi GROBO posplošitev**: bbox ~5 km okoli pozicije
  (zaokroženo), brez identitete, brez seje v poizvedbi
  (`/api/map/pins?bbox&zoom&cats`). Nič ostrejše od tega ne gre ven.
- **0 analitičnih klicev iz Go Mode/Guardian modulov** (revizija `rg`:
  planner-analytics vsebuje samo ID seje — brez lat/lng/position; Go Mode
  edini fetchi so weather (geo POSTANKA), bookings (provider:productId),
  map pins (bbox)).
- **Klient ne določa rezervacijskih stanj** (§20): Guardian bere
  JourneyBooking vrstice SAMO za prikaz; `CANCELLED` pride iz strežniške
  vrstice, nikoli iz klienta.
- **Rezervacija ≠ travel** (invarianta #21): Guardian izpisi in testi
  (frozen-rows test) dokazujejo, da ocene nikoli ne pišejo statusov.

---

## 6. UX VHODNE TOČKE (§30.L — FEATURE → ENTRY → ACTION → RESULT)

| Zmogljivost | Vstopna točka | Dejanje | Rezultat |
|---|---|---|---|
| Travel Guardian (stanje dneva) | `/na-poti` — banner OB GLAVI (prvi pogled) | beri 🟢/🟠/🔴/⚪ + eno vrstico dejstev | uporabnik ve, ali je na varni poti |
| Opozorilo + akcije | `/na-poti` — kartica ob 🟠/🔴 | Navigiraj / Preskoči / Preuredi / Odpri rezervacijo | ena odločitev naenkrat (§21), brez iskanja |
| RECOVERY MODE | zložljiv del kartice 🟠/🔴 | razširi (kaj se je spremenilo / kaj velja / naslednji izvedljivi) | nadaljevanje brez rebuilda načrta |
| ZAČNI DAN | `/na-poti` jutro (danes, <11:00, 0 opravljenih, GPS izklop) | povzetek dneva → [ZAČNI DAN] | GPS vklop (na dejanje) + skok na naslednji cilj |
| PROST ČAS | `/na-poti` ko okno dejansko obstaja | [Znamenitosti][Hrana][Kava][Sprehod] | max 4 varni kandidati + [V mojo pot] (v2) — od 1.171.0 (#24 Sklop 9, TripIt Nearby) vstavek SREDI dneva (pred naslednji postanek), sicer konec dneva |
| NADALJUJ NA POTI | `/moja-potovanja` — kartica poti | Nadaljuj na poti | pot prenos na napravo → `/na-poti` |
| Zlata pot (end-to-end) | `/nacrtuj` → Načrtuj → shrani | Začni pot (obstoječe #21/K-7) | živi tok z Guardian slojem |

**Anti-pattern preverjen (§30.M):** nobena funkcija ne zahteva poznavanja
URL-ja, tehničnega imena ("Trip Health Engine" se nikjer ne izpiše) ali
iskanja po menijih — banner je prvi element po glavi strani.

---

## 7. TESTI (viri)

- `src/lib/__tests__/issue22-guardian-core.test.ts` — rezerva, konflikti,
  health, invariante (32 testov)
- `src/lib/__tests__/issue22-guardian-recovery.test.ts` — recovery, day
  start, data quality (17 testov)
- `src/lib/__tests__/issue22-guardian-free-time.test.ts` — okno, nearby
  vrata, bbox (15 testov)
- `src/lib/__tests__/issue22-guardian-ux.test.ts` — source contract UX +
  go-edit + vstopne točke (17 testov)
- Obstoječih 4.608 testov ostaja ZELENIH (zero feature loss — dokaz).

---

## 8. MEJE (iskrene)

- **0 API_BOOKING ponudnikov** (zunanja konfiguracija #20) → rezervacijski
  kontekst večinoma EXTERNAL/brez vrstic; CANCELLED pot iz strežniške
  vrstice, ko nastane.
- **Nearby predlogi potrebujejo signal** (map pins so strežniški) — offline
  je iskrena opomba, načrt in časovnica delujejo naprej.
- **ETA je vedno hevristika** (prometa nimamo) — izrecno labelirana;
  OSRM noge veljajo SAMO med načrtovanimi postanki (legFromPrev).
- **Background notifications ne obstajajo** (§16) — vse živi ocene delujejo
  ob odprti strani; wake lock (#21) drži zaslon prižgan med vožnjo.
