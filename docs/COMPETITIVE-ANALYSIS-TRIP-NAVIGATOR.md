# KONKURENČNA ANALIZA — TRIP NAVIGATOR OS (1.160.0)

> **Vprašanje:** kaj imajo najboljši trip plannerji na spletu — in kako
> Discover naredi BOLJŠE od najboljših?
>
> Vir: web research 2026-10-01 (iskanja: primerjave trip aplikacij 2025/2026,
> recenzije, Reddit_threadi o bolečih točkah). Dopolnjuje obstoječi
> `COMPETITIVE-ANALYSIS.md` (tržnica/provizije: GYG, Viator, Withlocals …) —
> TA dokument pokriva **popotnikovo perspektivo: načrtovanje + živo vodenje**.
>
> Kontekst kode: 1.158.1 (pred #21) → 1.159.0 (jedro LIVE TRIP NAVIGATOR) →
> **1.160.0** (ta analiza + dnevni pregled). vsi trditve o Discoverju so
> preverjene v kodi, ne marketinške.

---

## 1. KDO SO NAJBOLJŠI IN ZAKAJ (njihove najmočnejše prednosti)

| Aplikacija | Njihova glavna prednost (zaradi česar jih uporabljajo) | Model |
|---|---|---|
| **Wanderlog** | 1) vizualni zemljevid poti — postanke urejaš z vlečenjem po dnevih; 2) sodelovanje skupine v realnem času; 3) zbiranje idej z razširitvami | freemium; **offline = PLAČLAN Pro** |
| **TripIt** | samodejna agregacija rezervacij iz e-pošte (forward potrdil → itinerer); real-time letalski alarmi | freemium (Pro 49 $/leto) |
| **Sygic Travel / GPS** | najboljše **offline zemljevide** (celotni paketi držav), 3D, hitrostne kamere | premium naročnina |
| **Roadtrippers** | cestna potovanja: načrtovanje rute **z zanimivimi postanki vzdolž** | freemium (Plus) |
| **Komoot** | hoja/kolesarjenje: offline rute, površine, težavnost, skupnost | freemium (regije) |
| **Polarsteps** | samodejno **sledenje poti** (continuous GPS logging) + popotniški dnevnik | zastonj (knjige spominkov) |
| **Google Maps** (naslednik Trips) | univerzalni seznam „shranjeno", navigacija | zastonj (plačaš s podatki) |
| **GetYourGuide / Viator** (SI trg) | največja izbira vodenih izletov po Sloveniji (Postojna, Bled, Soča) | provizija 20–35 % |

## 2. NJIHOVE ŠIBKOSTI (dokumentirane boleče točke uporabnikov)

1. **„Vseeno končam na Google Maps"** (Reddit r/travel, r/travelplanning) —
   planerji odlično načrtujejo, a med POTJO ne vodijo: ni naslednjega cilja,
   ni prihoda, ni napredka. Planer in navigacija sta DVE aplikaciji.
2. **Wanderlog: zaviranje z veliko postanki + napihnjen UI** („lags and is
   kind of clunky") in **offline za denar** — ključna funkcija za tuje
   države je za plačniškim zidcem.
3. **TripIt: ni vizualen, ni zemljevid, ni vodenje** — je mapa rezervacij,
   ne sopotnik.
4. **Sygic: težki prenosi celih držav** + naročnina — presežek za 3-dnevno
   pot po Sloveniji.
5. **Polarsteps: sledenje = zasebnostno nasprotje** — neprekinjena GPS
   zgodovina je njihov podatkovni model (dnevnik), ne možnost, ki bi jo
   uporabnik izklopil.
6. **AI planerji (Layla, Mindtrip …): izmišljeni detajli** — „good at putting
   together an itinerary, but they miss the little details that can make or
   break a trip" (Reddit) — izmišljene ure/razpoložljivosti, hinavska
   priporočila.
7. **Vsi skupaj:** rezervacija pri ponudniku in „opravil sem" sta zmešnjaj —
   nihče ne ločuje „sem fizično prišel" od „rezervacija je potrjena".

## 3. KJE JE DISCOVER ZDAJ (poštena samoocena, 1.160.0)

### Kaj Discover IMA (in najboljši nimajo — naše prednosti)

| # | Zmogljivost | Kdo še ima to | Naša razlika |
|---|---|---|---|
| 1 | **Živi sopotnik: NASLEDNJI cilj → Približuješ se (razdalja+smer) → ✓ Prišel si → samodejno NASLEDNJE PO TEM** | **NIHČE** iz pregledanih | GPS arrival z histerezo + točnostnim pragom (travel-state.ts); ločitev GPS prihoda od rezervacije (§3) |
| 2 | **Iskrenost kot arhitektura** (fail-closed): brez koordinat = ni navigacije; premica = „v zraku"; prihod NE potrjuje rezervacije | nihče (vsi barvajo stanja) | celoten honesty kanon (production-matrix, booking EXTERNAL ≠ CONFIRMED) |
| 3 | **Zasebnost GPS brez kompromisov**: položaj živi SAMO v pomnilniku seje, 0 zgodovine, 0 strežnik | Polarseve nasprotje | zasnovna odločitev #16, ne nastavitev |
| 4 | **Jedro dela BREZ OMREŽJA brez plačila**: shranjena pot, GPS, razdalje, prihod, shema dneva, glasovni vodnik | Sygic (za denar), Wanderlog (za denar) | PWA + localStorage jedro; zemljevid je izrecno zunanji handoff |
| 5 | **Deterministični engine** (0 AI za travel stanja, 0 AI za glasovni vodnik) | AI planerji = črne škatle | isti vhodi → vedno isti izhod; testirljivo (4.566+ testov) |
| 6 | **Rezervacijska resnica**: lastna tržnica (12 %) + EXTERNAL handoff — status iz dejanske vrstice, nikoli ročno dvignjen | nihče | booking.ts stanjski stroj s prepovedanimi prehodi |
| 7 | **Napredek preživi preureditev načrta** (vsebinski ključi `itin-d{dan}-{dest}`) | nihče (pozicijski propad) | 1.159.0 §19 |

### Kje je Discover IZENAČIL najboljše (1.160.0 — ta izdaja)

| Zmogljivost najboljših | Naš ekvivalent | Zakaj enako ali boljše |
|---|---|---|
| Wanderlog: vizualni pregled dneva | **SHEMA DNEVA** (GoDayLine): cel dan na en pogled — vrstni red, stanja (✓/preskočen/trenutni/prihodnji), razdalja do trenutnega | deluje OFFLINE (Wanderlog Pro plačljiv); shematska = odgovor na „kaj je naslednje", ne zemljepis |
| Wanderlog/Maps: karta poti | **»Odpri dan v zemljevidu«** — cel dan kot POT z vmesnimi točkami (uradni Maps URL API, GPS izhodišče) | ne prenesemo tile-a; uporabnikovo izbrana aplikacija vodi (isti handoff kanon kot NAVIGIRAJ) |
| §10 hierarhija ZDAJ/NAVIGIRAJ/PRIŠEL SI/NASLEDNJE PO TEM | **nextAfter** na hero kartici: „Nato: 🍽 Restavracija X · 19:30 · 12 km" | uporabnik se ne vrača v planer (§12) |
| TripIt: rezervacijski kontekst | rezervacijska prekrivka na postanku (SAMO BRANJE, isti GET kot Moja pot) | + EXTERNAL ločeno od CONFIRMED (iskrenost) |
| Sygic: offline | PWA + offline.html + localStorage jedro | brez 500 MB map |
| Vreme pri postanku | Open-Meteo (živo, brez ključa) | postanek brez geo → vremena NI (fail-closed) |

### Kje najboljše ŠE vedno vodijo (iskreno, z načrtom)

| Vrzel | Zakaj je pri njih | Naš status / načrt |
|---|---|---|
| Sodelovalno načrtovanje v realnem času | Wanderlog core | shared pot `/pot/[shareId]` obstaja (20 s polling); polni CRDT = večji projekt, ni blokator |
| Samodejni uvoz rezervacij iz e-pošte | TripIt core | nezaželeno (e-poštni dostop = zasebnostno tveganje); ročni vnos + EXTERNAL handoff pokrijeta potrebo |
| Zemljevid z vlečenjem postankov | Wanderlog | /nacrtuj ima AI + planner; drag-drop = naknadni projekt |
| Turn-by-turn navigacija | Google/Waze/Sygic | **NAMERNO NE** — izrecni zunanji handoff (geo: URI izbirnik aplikacij; AGENTS.md: no proprietary navigation engine) |
| Zvezdna izbira dejavnosti (GYG/Viator SI) | nihče sam ne zmore | issue #20: 4 PRODUCTION_ACTIVE ponudniki; rast odvisna od zunanjih ključev (Viator API) |

## 4. ZAKO JE DISCOVER „BOLJŠI OD NAJBOLJŠIH" — sinteza

Najboljši so vsak odlični na ENI osi (Wanderlog: vizualno načrtovanje;
TripIt: rezervacije; Sygic: offline karte; Polarsteps: dnevnik). Nihče ni
**operativni sopotnik med samo potjo** — vsi priznajo, da uporabnik med
potovanjem »konča na Google Maps«.

Discoverova teza (issue #21 §KONČNI CILJ): od trenutka »Začni pot« do
zadnjega postanka vodi ENA aplikacija, ki:

1. **ve, kje si** (GPS, sejno, zasebno),
2. **ve, kaj je naslednje** (deterministično iz kanonične Moje poti),
3. **te pripelje tja** (NAVIGIRAJ handoff + zemljevid celotnega dneva),
4. **pošteno zazna prihod** (histereza + točnost; nikoli lažni „prišel si"),
5. **loči prihod od rezervacije** (dve resnici — največja hinavščina trga),
6. **samodejno pokaže naslednje** (brez vračanja v planer),
7. **in vse deluje brez omrežja in brez naročnine.**

To ni seštevek funkcij — je drugačen pogovor s potnikom: »povej mi, kje
sem in kam zdaj«, ne »urejaj si seznam«.

## 5. DOKAZI (koda → test → produkcija)

| Trditev zgoraj | Dokaz v kodi | Test |
|---|---|---|
| Arrival z histerezo | `travel-state.ts` classifyArrival (clamp 60–150 m + histereza 75 m + stabilnost 8 s) | issue21-travel-state.test.ts |
| GPS ≠ rezervacija | resolveTravelStatus ne pozna booking statusov (tipovno ločeno) | issue21-travel-state §3 |
| Zasebnost GPS | use-geolocation.ts (pomnilnik seje), go-persist (zavije GoPosition) | task64 persist tests |
| Shema dneva | day-line.ts + go-view `line` projekcija | **task102-day-line.test.ts (22 testov)** |
| Zemljevid dneva | buildDayMapUrl (Maps URL API, fail-closed po postanku, strop 10) | task102 ①–⑩ |
| NASLEDNJE PO TEM | go-view `nextAfter` | task102 (4 testa) |
| Offline jedro | PWA (sw.js, offline.html) + localStorage `dai:go-*` | obstoječi task64 |
| Zero feature loss | vsi prejšnji testi ostajajo zeleni | **4566 pass** (bazna linija 4544 + 22 novih) |

Production evidence (resnična naprava + GPS) → načrtovano po deployu 1.160.0;
zunanji blockerji ostajajo eksplicitno označeni (issue #21 §21 kanon).

---

*Metodologija: spletna iskanja (z-ai web_search) po vzorcih „best trip
itinerary app 2025/2026“, „<app> features review pros cons“, „trip planner
app missing features reddit“ + branje izvodov; 12 poizvedb, 8+ virov na
aplikacijo. Popotniška os, 2026-10-01.*
