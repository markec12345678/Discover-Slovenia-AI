# LIVE TRIP NAVIGATOR — arhitektura (Issue #21, 1.159.0 + 1.160.0 + 1.161.0)

> **Discover ne samo načrtuje potovanje. Ob »Začni pot« postane živi sopotnik:
> ve, kje si, kateri cilj je naslednji, vodi te do njja, zazna prihod in
> vodi naprej — ob doslednem ločevanju GPS resnice od rezervacijskega statusa.**

Dokument odgovarja na 10 ARHITEKTURNIH VOPRAŠANJ iz Issue #21 §23 in je
**vir resnice za travel plast**. Spremembe zahtevajo osvežitev tega dokumenta
+ testov (`issue21-travel-state.test.ts`, `issue21-go-travel.test.ts`).

---

## 1. ARHITEKTURNE ODLOČITVE (§23)

### ① Kateri je kanonični model cilja?

**`TripEntry` (`src/lib/journey/trip-view.ts`) ostaja kanonični navigacijski
model cilja** — enaka oblika že živi v My Trip, Go Mode, shared prikazu in
potrditvenem dokumentu. Identiteta postanka za napredek je `TripEntry.key`:

- **AI itinerer (V2):** `itin-d{dan}-{destinacija}` — **VSEBINSKI ključ**
  (1.159.0; prej pozicijski `itin-d{dan}-i{indeks}-{dest}` — vsak vstavek je
  razveljavil napredek dneva). Ponovitev iste destinacije v dnevu → priponka
  `-2/-3`. Stari zapisi z pozicijskimi ključi ostanejo veljavni (ključi živijo
  znotraj shranjenega `view` v `dai:go-trip`).
- **/potovanje (V1):** `provider:providerProductId` (id produkta).

Globja resolucija kraja čez vire (FSQ/OSM/own) ostaja na supply plasti
(`ProviderProduct.id`) — navigator NE vpeljuje novega enotnega ID-ja (kanon
`provider:productId` + T1 `destination_id` že preživeta celoten tok).

### ② Kje živi trenutni GPS?

**V React stanju hooka `useGeolocation` — pomnilnik seje, 0 persistenc.**
Isto kot prej: položaj NE gre nikamor na strežnik (edini izstopi: `origin`
parameter zunanjim navigacijskim aplikacijam prek `go-nav.ts` — ne naš API).

### ③ Kje živi active stop?

**Nikjer persistiran — čisto izpeljan ob vsakem renderju** iz
`buildGoView(trip, now, position, done, {skipped, arrivalContext})`:
`next` = prvi ne-opravljeni in ne-preskočeni vnos aktivnega dneva PO VRSTNEM
REDU NAČRTA (determinizem §5 — GPS NE prerazporeja vrstnega reda).

### ④ Kdo določa next stop?

**Deterministični `pickActiveDay` + vrstni red načrta** (go-view.ts, od 1.64.0).
0 AI, 0 hevistik bližine — uporabnikov načrt je avtoriteta. Ročni nadzor:
`dayOverride` (dnevni switcher), **PRESKOČI (novo 1.159.0)** — izrecna
uporabnikova izbira, ločena od opravitve; OBNOVI vrne postanek v tok.

**1.160.0:** poleg `next` pogled nosi še **`nextAfter`** (postanek po
trenutnem — »NASLEDNJE PO TEM« na hero kartici, §10/§12) in **`line`**
(projekcija celotnega dneva po vrstnem redu načrta z živimi stanji —
shema dneva; `day-line.ts` + GoDayLine komponenta). Oba sta projekciji
ISTIH podatkov (0 novih virov resnice), delujeta offline.

### ⑤ Kdo določa arrival?

**`classifyArrival` (čista funkcija, `src/lib/journey/travel-state.ts`)** iz:
GPS fiksacije + geo cilja + prejšnjega konteksta (hystereza) + ure.

| Parameter | Vrednost | Razlaga |
|---|---|---|
| `arriveBaseM` | 60 m | osnovni prag prihoda (tipičen POI/parkirišče) |
| `arriveRadiusM` | `clamp(60, accuracyM+10, 150)` | natančna fiksacija širi prag, strop 150 m |
| `nearM` | 300 m | »Približuješ se — X m« |
| `hysteresisM` | 75 m | izstop iz arrived šele čez prag+75 m (šum ne utripa) |
| `minStableMs` | 8 000 ms | prihod mora vzdržati, preden je IZPISLJIV |
| `STALE_POSITION_MS` | 60 000 ms | zastarela fiksacija se izrecno označi |

Velika območja (narodni parki): prag je fiksen in **iskreno dokumentiran** —
ne izmišljujemo obsegov objektov. **GPS prihod NIKOLI ne pomeni, da je
rezervacija potrjena** (dve ločeni resnici §3).

### ⑥ Kako sta ločena reservation state in travel state?

**TRAVEL state (`TravelStatus`) je NOVA, čista plast** (`travel-state.ts`):
`upcoming | active | navigating | near_destination | arrived | completed |
skipped`. Izključno iz travel vhodov (done/skip mape + klasifikacija prihoda)
— modul NE uvaža rezervacijskih modulov (testno zaklenjeno).

**Reservation state ostaja `JourneyBooking` (14 statusov, strežniško
avtoriteten, fail-closed)** — nedotaknjen. Go Mode zdaj rezervacijski kontekst
**BRA** (prekrivka `GET /api/journey/bookings?products=…&sessionKey=…` — isti
kanal kot MOJA POT) in ga prikaže kot žeton; **nikoli ne piše rezervacij**
(piše le obstoječi EXTERNAL handoff ob kliku na ponudnika).

### ⑦ Kaj se zgodi offline?

Prihod je **lokalni izračun** — deluje brez signala. Celotna obstoječa
offline matrika (SW PLANS cache, `offline.html`, glas brez omrežja) ostaja.
Vreme/rezervacijska prekrivka potrebujeta signal (iskren padec — načrt dela
naprej). Glej §3 spodaj.

### ⑧ Kaj ostane na napravi? (zasebnost §16)

| Podatek | Kje | Življenjska doba |
|---|---|---|
| GPS položaj | React stanje hooka | seja (izklop GPS/refresh počisti) |
| Kontekst prihoda (`ArrivalContext`) | `useRef` v GoMode | seja (0 disk) |
| Načrt (`dai:go-trip`) | localStorage | do zaključka poti |
| Opravljeni (`dai:go-progress`) | localStorage | do zaključka poti |
| Preskočeni (`dai:go-skipped`) | localStorage | do zaključka poti |

**0 sledi lokacije na disku ali strežniku.** Analitika ne dobi koordinat
(števci/enumi — kanon od #20).

### ⑨ Kako se Go Mode obnovi po refresh/reopen?

Kot doslej: načrt + done + skipped se hidratrijo iz localStorage; ura se
zaganja; **GPS ostaja izklopljen (zasebnost po zasnovi — uporabnik ga ročno
vklopi)**. Novo: klasifikacija prihoda se po refreshu **iskreno začne od
nič** (kontekst hystereze živi samo v seji — ni lažnega "stabilnega prihoda"
iz prejšnje seje).

### ⑩ Kako se prepreči divergenca My Trip in Go Mode?

Go snapshot ostane **NAMEREN posnetek** (offline/zasebnost — arhitektura iz
issue #4). Povezava: `dai:go-trip` (V2) + `shareId` → nazaj na `/pot/{shareId}`.
Novo 1.159.0: **stabilni vsebinski ključi** omogočajo, da napredek
(done/skipped) **preživi ponovni zagon z urejenim načrtom** (prej je vsak
vstavek/postavitev razveljavila opravitve dneva — največja tiha vrzel).
Večnapravnost ostaja zunanjega obsega (precedens za kasneje: `UserTripItem`
union-merge).

---

## 2. NAPAKE (§18 — CURRENT → EXPECTED → UI → TEST)

| # | Način | Pričakovano vedenje | Test |
|---|---|---|---|
| 1 | GPS denied | status denied + navodilo; načrt dela | source-contract ⑥/2 |
| 2 | GPS unsupported | status unavailable | hook (nespremenjeno) |
| 3 | GPS timeout/error | **1× samodejna ponovitev (4 s)**, nato error + gumb | geolocation ①–④ |
| 4 | GPS nizka natančnost | prag prihoda se razširi (strop 150 m); ±m prikazan | travel 2-②③ |
| 5 | GPS zastarel (>60 s) | **izrecna opomba »zadnja fiksacija pred X min«** | go-travel 1-⑦ |
| 6 | Uporabnik zunaj trase | razdalja/smer kažejo dejansko stanje (premica) | travel 3 |
| 7 | Cilj brez koordinat | razdalja/prihod/navigation gumb NI (fail-closed) | travel 1, go-nav |
| 8 | Invalid koordinate | klasifikacija unknown (0,0 sentinel, ±meje) | travel 1-②③④ |
| 9–11 | Booking manjka/pending/cancelled | žetona NI ali dejanski status iz vrstice | go-mode ⑤ |
| 12 | Zunanja navigacija neuporabna | geo:/Maps handoff obstoji (platformna meja) | task67 |
| 13 | Brez omrežja | načrt/prihod/glas delujejo; vreme iskren padec | task73 |
| 14 | Route provider neuporabljen | hevristika ×1,3/55 razkrita kot ocena | obstoječe |
| 15 | Ročni preskok | §5: PRESKOČI + razdelek + OBNOVI | go-travel 2 |
| 16 | Vrnitev na prejšnji | OBNOVI iz done razdelka | obstoječe |
| 17 | Refresh/reopen | hidratacija; GPS ročno; klasifikacija na novo | ⑨ zgoraj |
| 18 | Suspenzija zavihka | watchPosition se nadaljuje ob povratku | platformno |
| 19 | Sprememba dneva | pickActiveDay valja ob ticku ure (30 s) | task64 |
| 20 | Sprememba shared poti | snapshot ostane (posnetek po zasnovi); nazaj = svež prikaz | ⑩ zgoraj |

---

## 3. OFFLINE MATRIKA (§15 — dejanska koda)

| Zmožnost | Internet | GPS |
|---|---|---|
| Načrt/dnevi/postanki (localStorage) | ✗ | ✗ |
| **Zaznavanje prihoda (novo)** | ✗ | ✓ |
| Razdalja/smer (haversine, lokalno) | ✗ | ✓ |
| Opravi/preskoči/obnovi | ✗ | ✗ |
| Glasovni vodnik (browser TTS) | ✗ | ✗ |
| Navigacijski handoff (geo:/Maps) | ✗ | opt |
| Vreme pri postanku | ✓ | ✗ |
| Rezervacijska prekrivka | ✓ | ✗ |
| Zemljevid ploščice | videna območja | ✗ |

---

## 4. DOSEŽKI IN MEJE (§24/§27 — iskrenost)

### IMPLEMENTIRANO (1.159.0)
- kanonični travel state model (7 stanj) — čista plast, 0 AI/omrežja/db
- arrival detection: geofence (accuracy-aware) + hystereza + min. stabilnost
- geo contract: veljavnost cilja (±meje, null-island), fail-closed
- GPS: 1× auto-retry (prehodne napake), izrecna zastarelost, očiščeni timerji
- preskok v rokah uporabnika + Obnovi (ločeno od opravitve)
- samodejna napredovanja: po opravitvi/preskoku naslednji cilj zasede kartico
- rezervacijska prekrivka (SAMO branje) na naslednjem/ostalih postankih
- stabilni vsebinski ključi (napredek preživi preureditev načrta)
- glasovne fraze prihoda (deterministično, SL+EN)

### IMPLEMENTIRANO (1.160.0 — dnevni pregled)
- **SHEMA DNEVA** (GoDayLine + `go-view.line`): cel dan po vrstnem redu načrta
  z živimi stanji (✓ opravljeno / preskočeno / trenutni cilj + razdalja /
  prišel si) — projekcija istih podatkov, deluje OFFLINE (odgovor na
  Wanderlogovo glavno prednost, brez paywalla in brez tile-ov)
- **ZEMLJEVID DNEVA** (`buildDayMapUrl`): cel dan kot POT z vmesnimi točkami
  (uradni Maps URL API; GPS izhodišče, fail-closed po postanku, strop 10,
  0 besedila v URL — injekcijsko varno)
- **»NASLEDNJE PO TEM«** (`go-view.nextAfter`): postanek po trenutnem na hero
  kartici (§10/§12 — uporabnik se NE vrača v planer)
- popravljeni tipovni napaki fixture-a iz 1.159.0 (issue21-go-travel.test)
- konkurenčna analiza: `docs/COMPETITIVE-ANALYSIS-TRIP-NAVIGATOR.md`

### PREVERJENO (1.160.0)
- 22 novih testov (task102-day-line: URL fail-closed semantika, strop 10,
  injekcijska varnost, vrstni red/stanja sheme, stabilen arrival, nextAfter)
- tsc 0 napak; lint 0; celotna regresija 4566 pass (bazna 4544 + 22)

### PREVERJENO (1.159.0)
- 81 novih testov (vedenjski + source-contract); regresija obstoječih paketov
  (task64/w7/wave4/task73/t5d/wave2/calm) 152/152 zelenih

### IMPLEMENTIRANO (1.161.0 — geo pogodba + iskrenost + wake lock)
- **GEO DATA CONTRACT (§4):** `resolve-stop-geo.ts` — ENA kanonska geo
  resolucija postanka: `GeoPrecision = exact | approximate | missing |
  invalid` (exact = SAMO lastna tržnica; approximate = zunanji viri,
  poimenovani; dokaz #20: 0/20 zunanjih s preverjenimi koordinatami) +
  naslov/vir/ID vira. `isNavigableGeo()` = fail-closed pogoj za cilj.
  VSE kartice Go Mode nosijo `geo` projekcijo → §19 divergenca nemogoča.
- **ISKRENA GEO OZNAKA NA CILJU (§18-7/8):** »Preverjena lokacija« /
  »Približna lokacija (vir: fsq)« / izrecna opomba, kadar navigacija NI
  mogoča (prej: tiha odsotnost gumba NAVIGIRAJ).
- **STALE-ARRIVAL GUARD (§18-5):** zastarela fiksacija (> 60 s) NE more
  več sprožiti near/arrived — travel iskreno pade na `active`; razdalja/
  smer ostanejo na karticah, a OZNAČENE zastarele; guard zmaga nad
  histerezo (prejšnji arrived kontekst se pobriše v null).
- **RAZRED NATANČNOSTI (§6):** `accuracyClassOf` — high ≤ 50 m /
  medium ≤ 200 m / low > 200 m (null, kadar vir ni podal); Go Mode ga
  pokaže ob ±X m. Skladno s stropom praga prihoda (low NE razširi).
- **SCREEN WAKE LOCK (konkurenčna delta D1):** `use-wake-lock.ts` —
  zaslon ostaja prižgan DOKLER je GPS watch aktiven; sprostitev ob
  izklopu/unmount; ponovni poskus ob vrnitvi zavihka (W3C semantika);
  brez podpore nič ne obljavimo (prikaz samo dejanskega `held`).
  Odgovor na dokumentirano zunanjo mejo 1.159.0 (zaslon ugasne →
  watchPosition se ustavi) — vodilči te težave niso rešili.
- **KONSISTENČNI TEST (§24-F3):** `issue21-consistency.test.ts` — isti
  vnos skozi vse projicije + persistenca roundtrip: identiteta identična.

### PREVERJENO (1.161.0)
- 42 novih testov (issue21-stop-geo 15, issue21-wake-lock 10,
  issue21-consistency 6, razširitve ⑦/⑦b/⑨ + 5b) — regresija 4608 pass,
  tsc 0, lint 0; edini fail ostaja znana sandbox DB odvisnost (issue7-g11 ④)
- LOKALNI E2E dokazi: `docs/evidence/issue21/` (6 PNG + README) — prazno
  stanje → geo znacke (exact/approximate/missing VSE tri) → GPS prihod
  (simuliran vtič — sandbox zavrne dovoljenje, pošteno dokumentirano) →
  samodejna progresija → brez-lokacije opomba → mobilni 390 px; 0 napak
  v konzoli (agent-browser, `next dev -p 3100`)

### ZUNANJE MEJE (iskreno)
- turn-by-turn ostaja pri zunanjih aplikacijah (geo:/Maps handoff — AGENTS.md §13)
- ETA ostaja hevristika premica ×1,3/55 km/h (živi OSRM od pozicije NI uveden —
  etika javnega strežnika; promet izrecno NEZNANO)
- native Live Activities/Dynamic Island (zaklenjen zaslon iOS) — meja
  SPLETNE aplikacije: wake lock (1.161.0) pokriva splošen primer;
  nativen prikaz na zaklenjenem zaslonu zahteva domačo aplikacijo
- multi-device napredek (sinhronizacija done/skipped) — precedens UserTripItem
- produkcijski dokaz pravega GPS toka zahteva mobilno napravo (sandbox nima GPS)

### SLEDI (za #22 Travel Guardian)
- `TravelStatus` + `ArrivalContext` sta pripravljeni vhodi za TRIP HEALTH
  (npr. ON TRACK / NEEDS ATTENTION iz rezerve prihoda vs. termin rezervacije)
- rezervacijska prekrivka v Go Mode je pripravljena za prikaz terminov
