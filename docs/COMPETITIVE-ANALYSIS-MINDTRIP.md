# COMPETITIVE-ANALYSIS — Discover Slovenia AI vs MindTrip in vodilni AI trip plannerji

> Faza 5 ( primerjalna razvojna sprint). Metoda: spletna raziskava
> (6 poizvedb, 2 poglobljeni branji neodvisnih recenzij) + poštena
> inventorizacija lastnih zmožnosti ( Explore revizija kode) + vrzeli,
> razvite v istem sprintu. Viri in datumi so zapisani pri vsaki trditvi.

## 1. Viri ( kaj smo prebrali)

| Vir | Tip | Ključna ugotovitev |
|---|---|---|
| mindtrip.ai ( domača stran, okt 2026) | primarni | »Start chatting«; personalizacija; vizualni načrti s fotografijami/kartami |
| aitravel.tools — Mindtrip Review ( 4.5/5, mar–maj 2026) | neodvisni test | Split map+itinerary workspace; »Start Anywhere« ( YouTube/TikTok → itinerer); real-world omejitve ( Louvre zaprt torek); proračun s cestninami/gorivom; hotelske cene na karti; community vodniki ( realni avtorji, »Saved by 23«); Iskreno prizadetih 20–30 % odstopanj na cenah atrakcij; Fast Company »Most Innovative 2025« |
| layla.ai — The Tier List ( jun 2026) | primerjava | Layla = najmočnejši vse-v-enem za REZERVACIJSKI izkušnjo ( živi cene, leti/hoteli v pogovoru); Mindtrip = najboljši za in-chat letalske rezervacije; Wonderplan = najboljši brezplačni brez-prijave |
| voyaige.to — 10 AI plannerjev ( mar 2026) | primerjava | Wanderlog vleče vsebine iz potovalnih blogov; MindTrip gradi lastno community |
| monkeytravel.app — 7 plannerjev ( mar 2026) | primerjava | Gemini ni namensko orodje; karte + sodelovanje = MindTrip prednosti |
| AMZS / DARS ( uradni ceniki, okt 2026) | primarni | e-vinjeta do 3,5 t: 1-dnevna 8,10 € · 10-dnevna 12,80 € · dvomesečna 32,00 € · letna 106,80 €; NMB-95 ~1,60 €/l |

## 2. Kje SMO vodilni ( unikatno — noben preizkušeni konkurent tega nima)

| Naša zmožnost | Dokaz | Zakaj konkurenti tega nimajo |
|---|---|---|
| **Geo-validacija z before/after dokazom** | `src/lib/geo-validation.ts` ( 8 pravil) + `RefineValidation` blok v odgovoru refine ( km/worst/issues pred in po) | MindTrip/Layla izpisujeta urnike iz AI »zaupanja vredno«; če je dan neizvedljiv, uporabnik izve šele na poti |
| **Deterministični refine z varovalkami** | `refine-actions.ts`: `cannot_safely_transform` zavrne spremembo, ko so podatki nezadostni ( »ničesar nisem spremenil«) | Konkurenti slepo izvedejo vsak ukaz |
| **Data honesty kot znamka** | »Prazno ≠ izmišljeno« ( stop-insights); opozorila o metodi ( haversine × 1,3) povsod | MindTrip cenilne ocene odstopajo 20–30 % ( priznano v recenziji); pri nas je vsaka številka razložena |
| **Lokalna tržnica v načrtu** | BookingPanel z realnimi slovenskimi ponudniki ( 12 % kanal) | Layla/MindTrip rezervirajo globalne agregatorje ( Expedia/Hotels.com) |

## 3. Vrzeli, ki smo jih našli ( pred Fazo 5) — in status

| # | Vrzel ( dokaz iz kode) | MindTrip/layla ekvivalent | Odločitev |
|---|---|---|---|
| 1 | Zemljevid NI na `/nacrtuj` ( živi le na `/zemljevid` + `/pot/[shareId]`; legend dni neinteraktivna; brez sinhronizacije marker↔kartica) | Split map+itinerary workspace = njihova jedro prednost | ✅ **F5.1 implementirano** ( spodaj) |
| 2 | »Start Anywhere« ni obstajal ( nič URL/YouTube vnosa v kodi) | Prilepi povezavo do videa → lokacije → itinerer ( unikaten feature) | ✅ **F5.4 implementirano** ( deterministično!) |
| 3 | ICS/koledarski izvoz ni obstajal ( print le na share strani; pdf-lib samo za račune lastnikov) | »Vzemi načrt s sabo« ( app/tisk) | ✅ **F5.2 implementirano** |
| 4 | Budget = samo vnosev atrakcij ( `recomputeTotalBudget` = seštevek `estimated_cost`) — brez goriva/vinjet | Stroškovna razčlenitev vožnje ( cestnine, poraba) | ✅ **F5.3 implementirano** ( gorivo + slovenska e-vinjeta, viri razkriti) |
| 5 | Odpiralni časi destinacij niso obstajali ( namerna data honesty odločitev) | MindTrip upošteva dneve zaprtja ( Louvre/torek) | ✅ **F5.5 implementirano** ( 5 preverjenih vnosov z viri + pravili closed_month/closed_weekday; ostalih 17 po potrebi) |
| 6 | Živi cene + rezervacije hotelov/poletov | Layla ( živi cene) / Mindtrip ( Expedia + v-chat letalske karte) | ⏸ **Roadmap** ( zahteva partner API ključe; sandbox/preprod nima pogojev; naša tržnica je lokalni monopol) |
| 7 | Community layer ( avtorji vodnikov, »Shranjeno pri 23«) | MindTrip hybrid AI + social | ✅ **F7 ( 1.10.0)**: avtor = lastnik poti brez računa ( editToken), korektivni vodnik z »kaj bi storil drugače« — sekcija 11 |
| 8 | Mobilna aplikacija ( iOS/Android) | Mindtrip app, Layla app | 🟡 **Delno zaprto v F5.7** ( PWA: namestitev na domači zaslon Chrome/Android/iOS, offline načrti + zemljevid; native app še vedno roadmap —dokumentirano odloženo) |
| 9 | Chat ni »itinerary copilot« ( ločena Q&A + refiner) | MindTrip = chat-first načrtovanje | ✅ **F9 ( 1.12.0)**: „Vprašaj o načrtu“ — vprašanja o načrtu odgovarja NAJPREJ deterministično (~12 namenov, SL+EN, iste čiste funkcije kot prikaz), neznana pa AI IZ LISTA DEJSTEV (strogo prizemljeno); iskren fallback ne ugiba; zgodovina se čisti ob spremembi načrta — sekcija 13 |
| 10 | Ravne črte med točkami ( nižje) brez road routing | MindTrip približno enako ( ocene) | ✅ **F5.6 implementirano** ( OSRM realne razdalje/časi/geometrija; hevristika je pretiravala čas na avtocestah in podcenjevala km v gorah — izmerjeno; zemljevid zdaj riše prave ceste; diskutabilnost odločena zMeritvami) |

## 4. Kaj je Faza 5 dostavila ( 7 funkcij, vse na isti poštenosti)

### F5.1 — Zemljevid poti NA strani načrtovalnika ( `trip-map-panel.tsx`)
- Kompaktni Leaflet panel v rezultatnem stolpcu `/nacrtuj`: barvne
  polyline po dnevih, oštevilčeni markerji ZNOTRAJ dneva ( usklajeno s
  karticami dni), skupni ~km v naslovu ( isti vir kot geo-validacija).
- **Interaktivna legenda dni**: žetoni »Vsi dnevi«/»Dan N« skrijejo in
  prikažejo posamezne dneve ( preverjeno: 5 → 3 → 5 markerjev).
- **Dvosmerna sinhronizacija** ( MindTrip workspace feel): klik markerja →
  smooth scroll na kartico postanka + highlight obroba; gumb ›Prikaži na
  zemljevidu‹ na vsaki kartici postanka → map pan + tooltip + pulz.
- EN/SL naslovi in namigi ( `planner.mapPanel` namespace).

### F5.2 — Koledarski izvoz `.ics` ( `lib/ics-export.ts`)
- Vsak postanek → VEVENT ( DTSTART/DTEND iz time_slot, SUMMARY
  »Dan N · Ime«, opis z razlago + oceno; RFC 5545 escape + folding 75
  oktetov). Brez knjižnice — čista funkcija ( string → string).
- Gumb »Koledar (.ics)« v akcijski vrstici ( ob e-pošti) + toast
  z iskreno opombo, če načrt nima datuma odhoda ( datumi relativni —
  zapisano V dogodkih samih).
- Nižji strošek: 0 strežniških klicev ( Blob download v brskalniku).

### F5.3 — Stroški vožnje: gorivo + e-vinjeta ( `lib/trip-costs.ts`)
- `DriveCosts` v `ItineraryQuality` ( izračun na strežniku IN clientu —
  ista čista funkcija): km poti ( haversine × 1,3, zaokroženo na 5) ×
  6,5 l/100 km × 1,60 €/l + vinjeta po dolžini ( 1 d → 8,10 € /
  ≤10 d → 12,80 € / ≤62 d → 32,00 € / več → 106,80 €).
- Prikaz v kartici kvalitete: »Gorivo + avtocestna vinjeta ≈ 27 €
  ( gorivo 14 € + 10-dnevna vinjeta 12,8 €)«, SL/EN.
- **Transparentnost**: v »Kako smo izračunali?« so vse predpostavke in
  viri ( AMZS/DARS/gov.si) + izrecna opomba, da vinjeta velja LE ob
  avtocestah ( obcestne alternative brezplačne) + napotek na
  evinjeta.dars.si pred nakupom.
- Ločeno od vnosev atrakcij ( mešanje bi zavajalo); 0 km → brez vrstice.

### F5.4 — »Začni s povezavo« — naš Start Anywhere ( `lib/url-ingest.ts` + `POST /api/itinerary/ingest`)
- Uporabnik prilepi YouTube/TikTok/blog povezavo → strežnik pridobi HTML
  ( timeout 8 s, max 1 MB, SSRF zaščita: blokirani zasebni/imenski dosegi),
  izlušči besedilo in **deterministično** ( nič AI žetonov → deluje tudi
  na produkciji brez AI ključev) prepozna naše destinacije: 22 ID-jev ×
  sinónimi ( SL+EN, diakritika-neobčutljivo, word-boundary — »socca«
  NE ujame »Soča«; naslov strani šteje dvojno).
- Odgovor: zadetki s številom omemb ( prikazani uporabniku PRED
  generiranjem — preverljivost) + predlog { dnevi ( regex), interesi
  ( iz bestFor zadetih, preslikano v kanonične INTERESTS),
  preferredDestinations }.
- Integracija z generiranjem: `PlannerInput.preferredDestinations`
  ( sanitizirano na meji — samo znani ID-ji, max 8): fallback
  ocenjevalnik + 2,5 pohitritev ( dominira nad oceno, NE nad sezono/
  dežem), AI prompt pa dobi izrecno vrstico. A/B dokaz: kultura →
  [ljubljana, bled, piran, vintgar] vs + preferred [bled, soca,
  kobarid] → [bled, vintgar, bohinj, kobarid, soca].
- Zmerno iskreni zavreki: 0 zadetkov → 422 z jasnim sporočilom ( nič
  izmišljevanja »podobnih« lokacij); rate limit 10/min.
- Analitika: `ingest_url_attempted` / `ingest_url_success` ( docs/ANALYTICS-EVENTS.md).

## 5. Meritve uspeha ( novo dodano)

- `ingest_url_success / ingest_url_attempted` → stopnja uspešnosti
  prepoznavanja ( cilj: > 60 % na realnih virih).
- `ics_download / planner_result_rendered` → delež »vzemi s sabo«.
- `pwa_install_accepted / pwa_install_prompted` → stopnja sprejema
  namestitve PWA ( F5.7; cilj: > 30 % na Android/Chrome).
- Prihodnje ( po zlati poti podatkov): delež marker-klikov na zemljevidu
  ( sedaj sinhronizirani, ne sledeni ločeno — potencialna F6).

### F5.7 — PWA: načrti brez povezave ( `public/sw.js` v2 + `public/offline.html` + `src/components/pwa/*`)
- **Štirje namenski cache-i z LRU limit-i** ( shell 400 / plans 40 / tiles
  600 / img 120) + brisanje legacy discoverslovenia-v1 ob aktivaciji.
- **Offline načrt = dve plasti**: ( 1) `/pot/*` HTML + deljeni JSON v
  dai-plans-v1 ( network-first, offline fallback) — obisk deljene
  povezave naredi načrt offline-dostopen; ( 2) offline.html — izris
  NAČRTOV IZ LOCALSTORAGE + SW CACHE BREZ strežnika ( dnevi, postanki,
  časi, cene, nasveti), dvojezično ( NEXT_LOCALE), samoizpolnitveno
  ( 0 zunanjih virov), HTML-escape vseh vrednosti ( XSS).
- **Ogrevanje takoj po shranjevanju** ( `warmOfflinePlanCache`): nov
  načrt je offline-ready v trenutku shranjevanja; `?warm=1` NE šteje
  ogleda ( iskren views števec — API vrne saved.views brez incrementa).
- **Offline ZEMLJEVID poti**: OSM tile-i cache-first — za območja, ki
  jih je uporabnik že odpral ( Triglav/Soča — slab signal v gorah).
- **UX plast**: badge „Brez povezave“ ( samo offline, VLM preverjen),
  toast-i ob prehodu offline/online, gumb za namestitev ( Chrome/
  Android prompt + iOS Sheet navodila — iPadOS 13+ detekcija), toast
  „Nova različica“ z gumbom Osveži ( enkraten reload, varovano pred
  zanko).
- **Mehanika zaupanja**: 500 se NE cachira; ostali /api/*, /admin,
  /owner NIKOLI iz cache-a; DEV_MODE (?dev=1) passthrough — dev chunk-i
  brez hash-a bi se zamrznili in podrla hidracija; RSC network-first
  ( svež online, cache offline). Manifest: id + screenshots ( wide/narrow
  form_factor) za Chrome „richer install UI“.

## 6. Roadmap ( odkrito zapisano, po vplivu)

1. ~~**Odpiralni časi/dnevi**~~ ✅ **IZVEDENO v F5.5 (1.8.1)** — 5 preverjenih
   vnosov z uradnimi viri ( vintgar.si, postojnska-jama.eu, kobariski-muzej.si,
   visitcelje.eu, pmpo.si); geo-validacija pravili closed_month/closed_weekday
   ( samo z znanim datumom; vir v sporočilu); fallback preventiva + AI pravilo
   + validator kot varnostna mreža. Preostanek ( ostalih 17 destinacij):
   po potrebi po isti metodi — uradni vir + potrditev.
2. ~~**Cestni routing ( OSRM/Directions)**~~ ✅ **ZAPRTO v F5.6 ( 1.8.2)** —
   realna geometrija poti namesto ravnih črt; km/minute v VSEH plasteh
   ( kvaliteta, geo, stroški, razlage) + zemljevid po pravih cestah;
   odkrito tudi: hevristika je lagala v OBEH smerih ( avtoceste −48 min,
   gore +50 km na dnevu) — primerjalna prednost, ne samo pariteta.
3. ~~**PWA ( offline načrt)**~~ ✅ **ZAPRTO v F5.7 ( 1.8.3)** — namestitev
   na domači zaslon ( manifest id + screenshots za Chrome „richer install
   UI“), SW v2 s štirimi namenskimi cache-i, offline.html z izrisom
   shranjenih načrtov BREZ strežnika, offline zemljevid poti ( OSM tile-i
   cache-first), ogrevanje predpomnilnika ob shranjevanju/obisku,
   badge + toast-i za povezavo, iOS navodila za namestitev, 36/36 testov
   strategij. Slovenija-argument: signal v gorah je slab — offline je
   RESNIČNA potreba ( MindTrip/Layla imata app, a NE offline načrtov
   te vrste).
4. **Živi ceni partnerjev** ( ko pridejo ključi) — največja komercialna
   vrzel vs Layla/Mindtrip.
5. ~~**Community vodniki**~~ ✅ **IZVEDENO v F7 ( 1.10.0)** — avtorski
   vodnik na deljeni poti BREZ računa (tajni editToken iz shranjevanja,
   SHA-256 v DB, localStorage lastnika), jedro = "kaj bi storil drugače"
   ( korektivni, ne promocijski — MindTrip-ovi vodniki so uredniško-
   reklamni); nasveti vezani na dneve, verdikt v amber bloku, badge +
   prednost v galeriji skupnosti; analitika has_verdict meri diferencator.

## 7. Sklep — kje se nahajamo

**Vodilni v poštenosti in dokazljivosti** ( geo-validacija, refine dokazi,
data honesty) — to je naš diferencator, ki ga ne more kopirati API ključ.
**Do Faze 5 zaostajali v vizualnem workspace-u in »vzemi s sabo« tokov —
te vrzeli smo zaprli** ( zemljevid na plannerju, .ics, Start Anywhere,
stroški vožnje). **F5.5–F5.7 so dodale še tri plasti istega diferencatorja**:
odpiralni časi v validaciji, REALNE ceste ( OSRM — natančnostna prednost
nad MindTrip-ovimi ocenami) in offline načrti v žepu ( PWA — vrzel, ki
jo MindTrip/Layla pokrivata z native app, a BREZ offline načrtov te
vrste: naša offline.html izriše shranjene načrte BREZ strežnika, z
offline zemljevidom poti). **Strateško zaostajanje** ostaja v rezervacijah
živih cen ( partner API) in native app — odloženo zavestno, s pisano
utemeljitvijo. Naslednja največja zmaga po mnenju analize: **živi ceni
partnerjev** ( item 4 roadmap — čakamo ključe) ali **community vodniki**
( item 5 — temelj obstaja).

---

# Faza 6 ( september 2026) — sveža raziskava + odgovora

> Metoda: 6 spletnih poizvedb ( z-ai web_search, okt/sept 2026), globje
> branje monkeytravel.app primerjave ( 7 orodij, posodobljeno 7. sept 2026)
> in stippl.io »Stippl vs Wanderlog« ( posodobljeno 4. sept 2026).

## 8. Kaj se je premaknilo pri tekmecih (pomlad–jesen 2026)

| Tekmec | Sprememba (vir, datum) | Pomen zame |
|---|---|---|
| **Mindtrip Flights** | Lanciran maj 2026 — »prva all-in-one agentic AI letalska rezervacija« ( Sabre + PayPal partnerstvo; monkeytravel, 7. 9. 2026) | Rezervacijska vrzel se JE poglobila — a zahteva GDS partnerstvo, ne AI kakovost |
| **Mindtrip Stays** | Julij 2026 — pogovorno iskanje hotelov namesto filtrnih plošč ( isti vir) | Enako — booking-first design ( njihova šibkost: »flow vodi v rezervacijo«) |
| **Layla → Expedia** | Expedia Group je KUPIL Laylo ( 31. julij 2026; isti vir) | Neodvisnost je redka lastnost — naša 12 % lokalna provizija je zdaj še bolj razločna |
| **Wanderlog Pro** | $39,99/let; free tier kapira AI na ~5 sporočil načrt ( preverjeno feb 2026) | Naš AI je BREZ kapljivega limita — cenovna prednost |
| **Stippl PRO** | €24,99/let — AI itinerer + **budget planner, expense splitting, packing list** ( stippl.io, 4. 9. 2026) | NJEGOV jedro diferencatorja = proračun + pakiranje → F6.1/F6.2 odgovora spodaj |
| **Google Canvas** | Day-by-day planner v AI Mode ( US, širjenje 2026; isti vir) | Neposreden tekmac za strukturo — a brez skupine/deljenja |
| **ChatGPT ( Expedia/Booking appsi)** | Žive cene v pogovoru — a SAMO izven EU/UK/CH ( monkeytravel) | EU je zaščiteno — naša evropska pozicija |

**Skupni smeri 2026:** ( 1) rezervacije v pogovoru ( Mindtrip), ( 2) all-in-one
upravljanje potovanja — proračun/pakiranje/stroški ( Stippl), ( 3) kolaboracija
( Wanderlog neomejeno brezplačno). **Naša pozicija:** edini specializiran
 Slovenija produkt z dokazljivo geografijo + poštenimi podatki.

## 9. F6 odgovora ( zgrajeno v tem sprintu)

### F6.1 — Pameten pakirni seznam ( src/lib/packing-smart.ts + komponenta)

**Stippl-ova packing list je "trip-specific"; naša je DOKAZLJIVA:**

- vsak predmet ima RAZLOG iz konkretnega dneva/stopa: »Dan 3: dež v
  napovedi« ( dežna jakna), »Dan 1: Bled; Dan 2: Piran ( voda na načrtu)«
  ( kopalke), »Dan 3: Postojnska jama« ( topla plast — v jamah 8–12 °C
  vse leto)
- metoda RAZKRITA: badge »iz dnevne napovedi« ( emerald) ali »sezonska«
  ( amber) + opomba, kdaj napoved ne obstaja ( odhod > 16 dni) —
  konkurenti ne razkrivajo NIKOLI
- deluje za VSE stare shranjene načrte ( čista funkcija na clientu, nič
  API sprememb) — Stippl zahteva svojo app
- odkljuki persistirani čez reload in preklop jezika ( stabilni ID-ji,
  `useSyncExternalStore` — hidracijsko varno)

### F6.2 — Proračunski panel ( src/components/budget-panel.tsx)

**Stippl-ov budget planner upravlja vnose uporabnika; naš IZRAČUNA iz
načrta in prizna meje:**

- vrstice iz REALNIH podatkov: seštevek cen atrakcij na načrtu + gorivo +
  e-vinjeta ( F5.3), skupaj, razdelitev na osebo ( stepper 1–12)
- osebni proračunski cilj ( persistiran) → »Načrt je 15 € nad tvojim
  proračunom« ali »izide« — podobno Stippl-ovemu tracking, a brez vnosa
  stroškov na terenu ( namerno: naš načrt nima teh podatkov in NE ugibamo)
- zložljivo »Kako smo izračunali — in česar NE vključuje«: predpostavke,
  viri ( AMZS/DARS) in IZRECNO nočitev/hrana/nakupi niso v oceni —
  iskrenost kot znamka, konkurenti te vrstice nimajo

**Meritve ( analitika):** `packing_item_checked` ( category, method, items)
in `budget_goal_set` ( goal_eur, plan_total_eur, group_size) — docs/ANALYTICS-EVENTS.md.

**Verifikacija F6 ( doključena 1.10.1):** EN preveritev na /en/nacrtuj
( obe sekciji v angleščini, razlogi "Day 3: rain in forecast" /
"Day 3: Postojnska jama (cave)", stepper €347/3 = €116, Compare
"Plan fits — €53 under your budget of €400", razkrivnost EN z AMZS/DARS);
390 px — 0 prelivov ( obe sekciji 358 px), 0 konzolnih napak. Ob tem
popravljen mešani jezik v navigaciji ( hardcoded tagline "AI potovanja"
na EN straneh → `nav.tagline` = "AI trips"). /pot/* ostaja SL-only
( jezikovna whitelist — DB vsebina je slovenska, ne mešamo).

## 10. Ostale najdene vrzeli ( odločitve)

| # | Vrzel | Odločitev |
|---|---|---|
| 1 | Mindtrip Start Anywhere zdaj sprejema SLIKE ( App Store, »share images«) | ✅ **F8 implementirano ( 1.11.0)** — zavihek »Slika« na /nacrtuj: upload/drag&drop/paste (Ctrl+V) → VLM STROGI ekstraktor prebere imena → ISTI deterministični matcher kot povezave poveže z našimi 22 destinacijami; metoda razkrita ( amber badge), slika se pozabi ( pomnilnik), 422 brez zadetkov / 502 VLM nedosegljiv — iskreno. Glej sekcijo 12. |
| 2 | Skupinsko glasovanje ( MonkeyTravel »voting«, WePlanify pollsi) | ✅ **F11 implementirano ( 1.15.0)** — ankete BREZ računov na deljeni povezavi (/pot/[shareId]): poljubno vprašanje + 2–6 možnosti, en glas na obiskovalca (anonimni clientId), prestavitev glasu, avtor ankete (isti brskalnik — brez računov) jo zaključi ali izbriše. Glej sekcijo 16. |
| 3 | Potni dnevnik/spomini ( Stippl travel reel, photobook) | ✅ **F12 implementirano ( 1.16.0)** — TEKSTOVNI potni dnevnik BREZ računov na deljeni povezavi (/pot/[shareId]): spomin na dan iz načrta + kraj + ocena 1–5; natisnjena stran = naš "photobook"; ZAVESTNO brez fotografij (zasebnost + stroški). Glej sekcijo 17. |
| 4 | živi ceni partnerjev | ⏸ Roadmap item 4 ( čakamo ključe) — Mindtrip Flights/Stays pomenita, da se ta vrzel povečuje, a zahteva GDS partnerstvo |
| 5 | Gmail/Maps uvoz rezervacij ( Wanderlog) | ⏸ Odloženo — zasebnostno občutljivo, ni v naši smeri |

**Sklep F6:** zaprli sva največjo funkcionalno vrzel do Stippla ( pakiranje
+ proračun) na naš način — z razlogi, viri in razkritimi metodami. Naš
vodilni diferencator ( poštenost) je zdaj izražen še v teh dveh plasteh.

---

# F7 ( september 2026) — skupnostni vodniki

> Roadmap item 5 ( "temelj: community-trips + ownerji") — izveden kot
> naslednja zmaga po F6, ker item 4 ( živi ceni) še čaka partnerske ključe.

## 11. F7 odgovor na MindTrip "community guides"

| MindTrip vodniki | Naš odgovor ( F7, 1.10.0) |
|---|---|
| Realni avtorji, »Saved by 23« | Avtor = LASTNIK poti ( tajni editToken iz shranjevanja, SHA-256 v DB — brez računa, anonymous-first kot glasovanje/komentarji) |
| Uredniško-reklamna vsebina ( "best of") | KOREKTIVNA vsebina: "kaj bi storil drugače" — popotni popravki načrta, ki jih noben tekmec ne zbere |
| Vodnik kot ločena stran | Vodnik ŽIVI na deljenem načrtu ( kontekst poti + nasveti vezani na dneve "Dan 1: …"), tiska se z načrtom |
| Avtorji potrebujejo račun/profil | Avtor izpolni vodnik na svoji povezavi ( isti brskalnik) — nič novega za naučiti |
| Razkrivanje po "Saved by" | Galerija skupnosti: badge "Vodnik" + prednost v oknu zadnjih 24 ( ne mešamo staranja) |

**Iskrene omejitve ( zapisane v CHANGELOG):** /pot strani so SL-only
( P4-8 jezikovna whitelist); stari anonimni zapisi ( pred F7) vodnika ne
morejo imeti — žetona ni mogoče izdati počasi; vodnik = en avtor na pot.

**Sklep F7:** MindTrip-ova "hybrid AI + social" prednost ( vrzel #7 iz
Faze 5) je sedaj delno zaprta — na naš način: brez računov, s korektivno
( ne promocijsko) vsebino in z analitiko, ki meri, koliko avtorjev
zapiše verdikt ( `has_verdict` — metrika, koliko skupnost izraža naš
poštenostni diferencator).

---

# F8 (september 2026) — Start Anywhere s slikami

> Vrzel #1 iz sekcije 10: MindTrip "Start Anywhere" sprejema slike (App
> Store: "share images"). F5.4 je pokril povezave; F8 zapre slikovno pot.

## 12. F8 odgovor na MindTrip "share images"

| MindTrip slikovni vnos | Naš odgovor (F8, 1.11.0) |
|---|---|
| Slika → destinacije (nediferencirano) | Slika → VLM STROGI ekstraktor izpiše imena (brez komentarja; "NONE" če nič) → ISTI deterministični matcher kot povezave izbere iz naših 22 destinacij — AI LE PREBRE, ne IZBIRA |
| Metoda nerazkrita | Amber badge: "prepoznavanje slike: AI branje + deterministično ujemanje"; `method: "vlm"` v odgovoru |
| Brez ústreznih zadetkov? | Iskren 422 ("nisem prepoznal nobene slovenske destinacije") — NE izmišljujemo "podobnih" (preverjeno: Plitvice/Split na sliki NE ujeta, ker nista v našem nizu) |
| Zasebnost slike | Slika se obdela v pomnilniku in POZABI (nikamor shranjena); VLM znaki se ne vračajo |
| Vnos | Upload + drag&drop + PRILEPLJANJE iz odložišča (Ctrl/Cmd+V na okvirju — screenshot brez iskanja datoteke) |
| Merjenje | `ingest_image_attempted` / `ingest_image_success` — stopnja uspešnosti + primerjava slika vs. povezava |

**Iskrene omejitve (zapisane v CHANGELOG):** VLM storitev je lahko
nedosegljiva (502 z nasvetom "poskusi kasneje ali uporabi povezavo") —
povezave ostanejo vedno delujoče (deterministične, brez AI); v tem
sandbox oknu je bila živa VLM verifikacija rate-limited (429), uspešna
pot pa potrjena z enakovrednim simuliranim VLM izpisom na istem
matcherju.

**Sklep F8:** vrzel #1 zaprta na naš način — AI za branje, determinizem
za odločanje, iskrenost za omejitve. "Start Anywhere" zdaj sprejema
povezave IN slike; obe poti končata v istem preverljivem ujemanju.

---

# F9 (september 2026) — Pogovor z načrtom

> Vrzel #9 iz sekcije 3: MindTrip je "chat-first" (pogovor Z načrtom),
> naša NLP hero + multi-turn refinersta pokrila generacijo in SPREMEMBE,
> manjkala pa je Q&A plast (vprašanja O načrtu). Sveža spletna
> raziskava v tem sandbox oknu ni bila mogoča (web_search 429 — ista
> storitev kot VLM prejšnje seje); ocena MindTrip-ovega jedra temelji na
> dokumentirani raziskavi iz sekcije 8 ("Start chatting", vizualni
> načrti, real-world omejitve) — iskreno zapisano.

## 13. F9 odgovor na MindTrip "chat-first"

| MindTrip chat | Naš odgovor (F9, 1.12.0) |
|---|---|
| Klepet kot edini vmesnik (vprašanja IN ukazi skupaj) | DVE jasno ločeni plasti: "Vprašaj o načrtu" (Q&A) + "Prilagodi itinerer" (ukazi) — vprašanje ≠ ukaz; uporabnik vedno ve, kaj se bo spremenilo |
| Odgovori "zaupanja vredni" | ŽETON VIRA pri vsakem odgovoru: "izračunano" (deterministično, brez AI) / "AI · samo fraziranje dejstev" / "brez ugibanja" (iskren zavrnitev) |
| AI izumlja številke | Številke PRIHAJAJO iz istih čistih funkcij kot prikaz (geo-validacija km, stroški AMZS/DARS, obsegi dni); AI dobi LIST DEJSTEV s strogim navodilom "odgovarjaj IZKLJUČNO iz dejstev" |
| Deluje samo z AI | ~12 namenov deluje BREZ AI žetonov (kot hitre akcije): vožnja/km, stroški, najbolj natrpan dan, posamezen dan, vreme, pakiranje, opozorila, postanki, družina, pomoč |
| Vreme iz klepeta | Živa Open-Meteo napoved PORAVNANA z datumi potovanja (samo znotraj ~16 dni — sicer pošteno "ocene načrta, ne živa napoved") |
| Zastareli odgovori po spremembi | Zgodovina klepeta se POČISTI ob spremembi načrta — odgovori vedno veljajo za trenutni načrt |
| Ne preverja dneva vprašanja | "Kaj je na dan 7?" na 3-dnevnem načrtu → iskrena popravka ("dneva 7 ni"), ne izmišljen dan |

**Bonus odkritje med verifikacijo:** latentni mešani-jezikovni bug
(isti razred kot nav.tagline iz 1.10.1) — `formData` state v plannerju
nima polja `language`, zato sta ask IN obstoječi refine na EN straneh
poganjala SL poti. Odkrit z browser E2E (EN odgovori so prišli v
slovenščini), popravljen pri obeh potrošnikih.

**Merjenje:** `plan_qa_asked` (intent, source, locale, via) —
`source=computed` delež pove, koliko vprašanj pokrijeta deterministični
nameni brez AI; `intent` razkrije, kaj uporabnike res zanima.

**Sklep F9:** vrzel #9 zaprta na naš način — pogovor, v katerem AI LE
sfrazi, determinizem računa, vsak odgovor nosi vir, neznano pa se
iskreno zavrne. MindTrip-ova "chat-first" prednost je zdaj pariteta;
naša razlika ostaja: dokazljivost vs. zaupanje.

---

# F10 (september 2026) — produkcjska AI plast (Gemini)

> Ni nova funkcija vrzeli, temveč INFRASTRUKTURA, ki jo ves obstoječi
> AI sloj (F5.4 ujemanje povezav, F8 slikovni vnos, F9 fraziranje,
> generacija, refine, nasveti, prevodi) sedaj deli v produkciji —
> doslej je bila edina zunanja AI pot z-ai-web-dev-sdk (razvojni
> sandbox) in nikoli konfiguriran Puter. Uporabnik je priskrbel
> brezplačni Google AI Studio ključ (velja do pridobitve uporabnikov).

## 14. F10 — veriga providerjev kot odgovor na "kakšen AI je pod kapoto"

| Vprašanje konkurenta | Naš odgovor (F10, 1.13.0) |
|---|---|
| MindTrip: lastni AI sklad (nedokumentiran) | VERIGA, ne čarovnija: Gemini → Puter → z-ai-sdk → deterministični fallback; enoten vmesnik v `ai-client.ts`, ki ga deli 15+ poti |
| Odpoved AI = mrtvi izdelek | Circuit breaker (3 napake → 5 min odmora) + pošten fallback; ai-health razkrije stanje PO providerju |
| Slikovni vnos vezan na eno storitev | F8 vision pot ima zdaj Geminija (image_url) in z-ai VLM — v odgovoru razkrit `via` |
| "Zaupaj nam" | Privzeti model javen (`gemini-3.6-flash`), odkrita odločitev (2.5-flash umaknjen za nove ključe — živi 404), skrivnost nikoli v repozitoriju |

**Iskrena omejitve:** sandbox egress (HK) je geo-blokiran za Gemini
API (400 `User location is not supported`) — a živi test IZ GITHUB
RUNNERJA (US, Azure centralus, 2026-09-15) je **4/4 ZELEN**: chat
completion (200, „SLOVENIJA-OK"), jsonMode response_format (200,
veljaven JSON — generacijske rute varne), vision image_url (200 — F8
produkcijska pot), reasoning_effort podprt. Ob tem odkrito zapisana
izkušnja: gemini-2.5-flash je umaknjen za nove ključe (404) → privzeti
model gemini-3.6-flash; thinking modeli delijo izhodni proračun z
razmišljanjem (154 od 177 žetonov na trivialnem pozivu) → tla 512
žetonov v ai-client. Na Vercel/Render se nastavi `GEMINI_API_KEY` kot
strežniški env (navodila v .env.example / DEPLOYMENT.md).
**Sklep F10:** diferenciator "dokazljivost" se razširi na plast, ki jo
konkurenti skrivajo — tudi pod kapoto je videti, kaj se dogaja.

---

# 1.14.0 (september 2026) — OpenRouter kot primarni + ops avtomatizacija

## 15. OpenRouter primarni: "kaj se zgodi, ko zmanjka kvote" — odgovor ŽE OB NAMESTITVI

| Vprašanje konkurenta | Naš odgovor (1.14.0) |
|---|---|
| MindTrip: plačljiva infrastruktura, uporabnik ne vidi meja | VERIGA 4 providerjev: OpenRouter (free) → Gemini (free) → Puter → z-ai → determinističen fallback. "Ko routeru zmanjka" (dnevna meja ~50/dan) prevzame Gemini/z-ai — NATANKO uporabniška naročba |
| AI odpoved v razvoju = blokiran tim | OpenRouter deluje iz VSAJ regije (ni Google geo-bloka) — razvojni sandbox ima ŽIVO AI pot (health: `provider: openrouter`) |
| Deployment "zaupaj in upaj" | 12-skriptna ops suite (`scripts/ops/`): živi testi ključev, GitHub secreti prek sealed boxa, dispatch CI + čakanje rezultata, Vercel/Render env set z MERGE zaščito, 8-plastni doctor |
| Katere modele uporabljate in zakaj | JAVNO dnevnik živih testov: `nex-agi/nex-n2.5-pro:free` izbran po realnem itinererJSON pozivu ("Dnevni pobeg na Bled", čista slovenščina, 436 žetonov); zavrnjeni IN Z RAZLOGOM: openrouter/free (izbral content-safety klasifikator), gemma-4:free (geo-blok posredovan), glm-5.2:free (provider error), nemotron (leaka razmišljanje) |

**Iskrena odkritja (živo, 2026-09-15):**
- OpenRouter :free vision modeli NEDELJUJEJO (vsi provider error) — F8
  slikovni vnos ostaja na Gemini (produkcija) + z-ai VLM (sandbox).
- DNEVNA MEJA free tierja je REALNA: ~50 zahtev/dan brez kredita
  (429 `free-models-per-day`); E2E test je dokazal, da aplikacija takrat
  pošteno pade po verigi do determinističnega fallbacka (itinerer se
  izriše, 0 napak). Izhod ob rasti: $10 kredita → 1000/dan.
- Google za geo-blokirane regije kdaj vrača 429 "kvota" namesto 400
  "location" — gemini-verify.sh obe varianti obravnava pošteno
  (ključ veljaven, regija/kvota blokirana, CI je avtoriteta).
- PyNaCl sealed box recept za GitHub secret-e ima past
  (`base64.b64encoder` ne obstaja) — popravljeno in uporabljeno
  ŽIVE za nastavitev OPENROUTER_API_KEY.

**Sklep 1.14.0:** "Poštenost kot znamka" se razširi na OPERACIJE —
namestitev, testiranje in vzdrževanje AI plasti sta avtomatizirani do
meje, ki jo postavljajo samo uporabnikovi žetoni (Vercel/Render), vse
drugo pa poganja en ukaz (`scripts/ops/setup-all.sh`).

---

# F11 ( september 2026) — skupinske ankete brez računov

> Vrzel #2 iz sekcije 10, zaprta kot zadnja zmaga 1.15.0. Obenem je
> uporabnik priskrbel VERCEL_TOKEN — zadnja "ročna" meja iz sklepa 1.14.0
> ("samo uporabnikovi žetoni") je odstranjena: GEMINI_API_KEY +
> OPENROUTER_API_KEY sta živi potisnjena na Vercel ( production + preview +
> development), opuščena VITE_GEMINI_API_KEY pa izbrisana.

## 16. F11 odgovor na MindTrip/WePlanify "voting"

| MindTrip / WePlanify pollsi | Naš odgovor ( F11, 1.15.0) |
|---|---|
| Glasovanje zahteva račun/Google prijavo | ANKETA BREZ RAČUNOV na deljeni povezavi — isti anonimni clientId ( localStorage) kot glasovanje za lokacije, všečki in komentarji: en obiskovalec = ena identiteta povsod |
| Fiksne vrste anket ( datumi, hoteli) | POLJUBNO vprašanje ( 2–200 znakov) + 2–6 možnosti — "Kateri dan odpotujemo?", "Hotel ali apartma?", "Kremšnita v Bledu ali v Ljubljani?" |
| Glas se ne more spremeniti | PRESTAVITEV glasu: zadnji klik velja ( upsert na unique[ pollId, voterId]) — skupina lahko presuša mnenje, števci se pravilno preštejejo |
| Zapiranje anket samo moderatorju | Avtor = ustvarjalčev brskalnik ( authorClientId, enak anonimni pristop kot editToken pri F7 vodnikih): zaključi/znova odpri/izbriše SAMO on ( 403 drugače) |
| Rezultati skriti do konca | REZULTATI VIDNI ŽIVE: odstotki + števci + progress fill na vsaki možnosti, moj glas označen ( kljukica) |

**Iskrene omejitve ( zapisane v CHANGELOG):**
- En glas na OBISKOVALCA ne na OSEBO — kdor pobriše localStorage, glasuje
  znova ( enako velja za všečke/komentarje; nadzor stroškov plačanih API-jev
  tega ne upravičuje).
- Rate-limit: 20 novih anket/h na IP, 60 glasov/h — za resne zlorabe bo
  treba Turnstile ( enako izhodišče kot pri komentarjih).
- Max 10 ODPRTIH anket na potovanje ( zaprte ne štejejo) — meja proti smeti.
- /pot strani ostajajo SL-only ( P4-8) — ankete so v slovenščini, enako
  kot vodniki in komentarji na deljeni povezavi.

**Sklep F11:** vrzel #2 je zaprta BREZ žrtvovanja anonimnega pristopa —
razliko od MindTripa se skupina odloča brez prijave, z živimi rezultati
in s poštenimi mejami. E2E v brskalniku ( 10/10): ustvari anketo, glasuj,
prestavi glas, zaključi ( možnosti se zaklenejo), znova odpri, glas
preživi ponovni nalagalnik ( localStorage → strežnik), izbriši; 390 px
brez prekrivanja ( VLM potrditev).

---

# F12 ( september 2026) — potni dnevnik brez računov

> Vrzel #3: Stippl promovira "travel reel / photobook" ( foto-video
> spomini). Prej "zavestno odloženo — vsebinska smer" ( sekcija 10).
> Zdaj izvedeno NAŠ način: zaključek socialne plasti deljene povezave.

## 17. F12 odgovor na Stippl "travel reel / photobook"

| Stippl travel reel / photobook | Naš odgovor ( F12, 1.16.0) |
|---|---|
| Foto/video spomini — upload v oblak | TEKSTOVNI dnevnik: spomin = dan iz načrta + kraj + ocena 1–5 + besedilo ( 2–2000). ZAVESTNO brez fotografij — zasebnost ( upload pomeni zasebne fotografije v naši bazi) + ni stroškov shrambe; razlog zapisan v UI |
| Zahteva račun ( Stippl login) | BREZ RAČUNOV na deljeni povezavi — isti anonimni clientId ( localStorage) kot ostale socialne funkcije: en obiskovalec = ena identiteta povsod |
| Photobook = plačljivi izdelek | Natisnjena stran = naš "photobook": dnevnik se NATISNE ( print:hidden samo na obrazec/kontrole), PDF že obstaja ( gumb Natisni + QR kode FW2-A) |
| Spomini ločeni od načrta | Vsak spomin je POVEZAN z dnevom načrta ( izbirnik "Dan N — destinacije", skupine po dnevih) — dnevnik raste iz itinererja, ne vzporedno z njim |
| Urejanje odvisno od naročnine | Avtor vpisa ( isti brskalnik) ureja/briše BREZ omejitev; "Urejeno" opomba ob spremenjenih spominih |

**Iskrene omejitve ( zapisane v CHANGELOG):**
- Max 200 vpisov na potovanje, max 20 na avtorja — meja proti smeti na
  javni strani ( 429 nadmejno).
- Brez slik pomeni tudi brez VLM opisovanja fotografij — zavestna
  žrtev: video/foto reel je Stipplov diferenciator, naš je poštenost.
- Rate-limit: 20 novih vpisov/h, 30 urejanj/brisanj/h na IP.
- /pot strani ostajajo SL-only ( P4-8) — dnevnik je v slovenščini,
  enako kot vodniki, ankete in komentarji.

**Sklep F12:** vrzel #3 je zaprta brez žrtvovanja zasebnosti — razliko
od Stippla se spomini pišejo brez prijave in brez nalaganja fotografij,
natisnjena stran pa je naš brezplačni "photobook". E2E v brskalniku
( polni cikel): odpri obrazec → izberi dan → izpolni ( kraj, zvezdice,
besedilo, ime) → oddaj → uredi → izbriši; 390 px brez prekrivanja;
API kontrakt 13/13 ( vključno 403 za tuje vpise, 400/404 validacije).

---

# F13 raziskovalna runda ( oktober 2026) — Mindtrip, forumi, nove ideje

> Naročilo uporabnika: »raziskuj o Mindtrip in ostalih najboljših na
> svetu, beri forume, developerske forume, turistične forume, da dobiš
> ideje«. Metoda: 13 spletnih iskanj + 14 poglobljenih branj ( 2 Reddit
> niti s komentarji, 2 Hacker News niti s polnim drevesom komentarjev,
> 6 člankov MonkeyEatingMango vključno z njihovo merjeno študijo,
> Travel Anywhere študija halucinacij, blog kazala za odkrivanje virov;
> HN iskan prek Algolia API). Reddit po 3. strani blokira ( "network
> security") — iskreno zapisano; ključni niti sta bili prebrani pred
> blokado.

## 18. Viri ( kaj smo prebrali v tej rundi)

| Vir | Tip | Ključna ugotovitev |
|---|---|---|
| r/AI_travel_tips — »Tried Layla, Mindtrip, Odessia and Fortrip« ( 27d) | forum | Layla: izplača cel načrt v 10 s BREZ vprašanja o tempu; Mindtrip: najlepši, skupinski komentarji+glasovanje, a NIKOLI ne opomni na smiselnost vrstnega reda mest; Fortrip: ujel vrstni red → 200 $ prihranka ( hotelove cene po dnevih) |
| isti thread, komentarji | forum | »AI itinerarji so preveč generični… manjka človeški dotik: kaj je precenjeno, kdaj obiskat, skrite točke, napake za izogniti«; »bivši vodnik: AI planner ni potreba — zgradil sem itinerary CHECK orodje« |
| HN — Show HN: Ikuyo ( 301 točk, 98 komentarjev, avg 2026) | dev forum | »20 nas v skupini, vsak ima mnenje, nihče noče odločati«; »vse kar zahteva račun od soputnikov je trda prodaja«; »ne delaj počasne kot Wanderlog — moral sem naredit Android app ker njihova ni optimizirana«; strah pred dark pattern plačilom; logistika-zabava mode toggle ideja |
| HN — »Travel planning: the most common bad startup idea« ( 236 točk, 164 komentarjev) | dev forum | »dobra skupinska programska oprema potrebuje GLASOVANJE«; »najboljši travel planner je Gmail — potrditve same priredo v koledar«; »agregacija iskanj nameščanj + komentarji več strani — plačal bi za to«; sanjarjenje = off-label uporaba ( pogostejša od pravih potovanj) |
| MonkeyEatingMango — »43 % AI-dnevnikov nosi napako: 356-potna študija« ( 8. 9. 2026, posod. 14. 9.) | merjena študija | 2 735 dni: 22,7 % zaprto ob uri, 16,6 % obisk čez zapiralni čas, 0,5 % trajno zaprto ( Tjapukai 2021, Wajima 2024), 5,1 % duplikati ( dan 9+ = 21,1 %; večmestno 45,2 %), 9,5 % cik-cak dan ( median +3,4 km; najslabše +40 km); skupaj 43,2 % dni s vsaj eno napako; 81 checkov pred izdajo; »neozdravljivo označimo, ne skrijemo« |
| MonkeyEatingMango — »Mindtrip Review 2026: Features, Price, Login Wall« ( 16. 8. 2026) | neodvisni test | Mindtrip PRED vsem zahteva Google/Apple račun — CENITVEK pa tudi ( preverjeno avg 2026); monetizacija usmerja v rezervacije ( oblikuje priporočila); Reddit citat: »lepše karte, a kupiš sam — nihče ti ne pomaga, če gre kaj narobe« |
| MonkeyEatingMango — »Best AI Travel Planners 2026: 10 Tools Ranked« ( 16. 8., posod. 31. 8. 2026) | primerjava | Layla ~$49/let ( pregled zastonj), Wanderlog $39,99/let, Tripsy $59/let, iplan.ai $4–10/mes, ChatGPT $20/mes, MEM $4,99 enkratni izvoz; »AI ocene stroškov odstopajo 20–30 %; splošni chatboti izmišljujejo lokale« |
| MonkeyEatingMango — »Best Travel Itinerary Apps 2026: Generated, Built, or Assembled« ( 17. 8. 2026) | taksonomija | TRI vrste izdelkov: generator ( MEM), platno za gradnjo ( Wanderlog), sestavljalnik rezervacij ( TripIt $49/let Pro); »noben od treh ne počne vseh treh del dobro« |
| MonkeyEatingMango — »Best Road Trip Planner Apps 2026« ( 17. 8. 2026) | primerjava | Roadtrippers: zastonj = 3 postanke/1 pot, plačano $35,99–59,99/let; road-trip potrebuje: PREVERJENE čase etap, izleti z dejanskim odstopanjem km, načrtovana postanka za hrano pred dolgimi etapami |
| Travel Anywhere — »Does ChatGPT Make Up Hotels?« ( 27. 8. 2026) | študija virlov | Tow Center ( 3. 2025): napake citiranja Perplexity 37 %, ChatGPT Search 67 %, Grok 3 94 %; primer Weldborough Hot Springs ( 1. 2026, CNN/ABC): AI izmišljen izvir → lastnik gostilne 5 klicev/dan za navodila; JCB ( 1. 2026): »izmišljene odpiralne ure/restavracije« = značilne GenAI napake; »vsak AI hotel ime je LEAD ( namig), ne rezervacija, dokler ga ne potrdita dve platformi« |
| BBC — »The perils of letting AI plan your next trip« ( 29. 9. 2025, prek iskanja) | raziskava | 37 % uporabnikov AI: premalo informacij; ~33 %: netočnosti |
| CNET — »Mindtrip's AI Flight Agent« ( 6. 5. 2026) | novice | Agentic letalski agent za »zapletene scenarije« ( multi-city, fleksibilni datumi) — Sabre + PayPal |
| stardrift.ai — »Travel Apps That Pull Existing Bookings« ( 25. 8. 2026, prek iskanja) | primerjava | »Mindtrip nima povezave z nabiralnikom — vsaka rezervacija ročna«; »načrti ostanejo ne-zavezujoči: imena brez datumov« |

## 19. Kaj številke 2026 povedo — in kje smo GLEDE na njih

**Ugotovitev #1: naš diferenciator je postal GLAVNA industrijska
zgodba leta 2026.** MonkeyEatingMango ( nov tekmec, spodaj) je zgradil
celoten marketing okrog telemetrije napak: »43 % dni nosi napako«,
»81 checkov pred izdajo«, »neozdravljive napake označimo, ne
skrijemo«, »pokaži delo, vključno s tem, kje šepa«. To je NATANKO
naša »Prazno ≠ izmišljeno« filozofija — a oni so jo OBJAVILI kot
študijo z merjenimi številkami, mi pa smo jo izrazili v funkcijah
( geo-validacija, refine dokazi), ne v javni telemetriji.

| Napaka iz študije ( MEM, 9/2026) | Naš status |
|---|---|
| Zaprto ob uri ( 22,7 % dni) | ✅ imamo pravila closed_month/closed_weekday za 5 ključnih destinacij + preventivni fallback + varnostna mreža ( F5.5) |
| Obisk čez zapiralni čas | ✅ geo-validacija preverja obsege dni ( F5) |
| Trajno zaprte točke | ✅ naših 22 destinacij je ročno vzdržanih ( vir-podatkov stran); tujih POI ne izmišljujemo |
| Duplikati ( dan 9+ 21,1 %) | 🟡 naš ranker ne ponavlja znotraj načrta ( enkraten izbor destinacij) — a nimamo eksplicitnega duplikat-checka za uvožene/tuje načrte |
| Cik-cak dan ( 9,5 %) | ✅ OSRM realne ceste + geo-validacija km/worst ( F5.6) — a nimamo gumba »preuredi dan optimalno« |
| Sončni vzhod ob poldnevu | 🟡 plan-QA pokriva delno ( urniki časovnih okvirjev) |

**Ugotovitev #2: halucinacije so zdaj KVANTIFICIRANE v javnosti.**
Tow Center 37/67/94 %, BBC 37 %/33 %, JCB »izmišljene odpiralne ure«,
Weldborough primer z imenom in priimkom. To ni več »nekateri pravijo«
— to so citirane številke. Naša stran /vir-podatkov lahko te številke
citira ( z viri) kot utemeljitev, ZAKAJ računamo deterministično.

**Ugotovitev #3: Mindtripova šibkost ni več samo »flow vodi v
rezervacijo« — dodali se sta login wall ( tudi za CENIK!) in
»nikogaršnja hrbtenica« ob kupovanju.** Njegova prednost ostaja
zapiranje zanke rezervacij ( Sabre/PayPal leta, Stays pogovorno) in
skupinsko sodelovanje ( skupni klepet + glasovanje za hotele — naša
F11 ankete so pariteta, brez računov).

**Ugotovitev #4: cene naročnin 2026.** Layla ~$49, Wanderlog $39,99,
Tripsy $59, Roadtrippers $35,99–59,99, Stippl €24,99, ChatGPT $20/mes.
Mi: brezplačno z 12 % lokalno provizijo — cenovna prednost ostaja, a
konkurent MEM zaganja »$4,99 enkrat za izvoz« mikro-monetizacijo
( nov vzorec, spremljaj).

## 20. Nova konkurenca: MonkeyEatingMango ( filozofski dvojnik)

Prvi tekmec, ki govori NAŠ jezik: brez prijave, generator ( ne klepet),
iskrene omejitve, telemetrija napak kot marketing, lokalna valuta,
otroške starosti za tempo. 2 757+ načrtov, 171 držav, 1 188 mest
( 9/2026). **Kjer mi ostajamo pred njimi:**

| MonkeyEatingMango | Discover Slovenia AI |
|---|---|
| Splošen ( 171 držav, enak glob) | Slovenija 22 destinacij z ročno preverjenimi odpiralnimi časi + viri |
| Brez skupine ( ni sodelovanja, ne glasovanja) | F11 ankete + F7 vodniki + F12 dnevnik BREZ računov na deljeni povezavi |
| Ni offline | PWA z offline načrti IN offline zemljevidom poti |
| Ni lokalne tržnice | BookingPanel z realnimi slovenskimi ponudniki ( 12 %) |
| Validator šele po generaciji | Geo-validacija PRED/PO z dokazom + refine varovalke |
| $4,99 izvoz | .ics + PDF + tisk zastonj |

**Kaj od njih vzamemo ( iskreno):** objavljeno študijo napak kot vzorec
komunikacije; otroke/starosti kot vprašanje tempa; »detour z
dejanskim odstopanjem km« pri road-trip priporočilih.

## 21. Ugotovitve s forumov ( Reddit + HN) — bolečine uporabnikov

1. **Skupinska odločiteljska paraliza** ( Reddit ×2, HN ×3): »20 nas v
   skupini, vsak ima mnenje, nihče noče odločati«; »težava je
   dogovoriti SKUPINO o terminu in lokaciji, ne narediti načrta«;
   »dobra skupinska programska oprema potrebuje glasovanje«. → F11 je
   PRAVILNA stava; odprta možnost: glasovanje O ZAČETKU ( termin/kraj)
   še PRED generacijo načrta.
2. **Pace/tempo ni vprašanje, je pritožba** ( Reddit ×2, r/SlowTravelEurope):
   Layla »izpljunila 12-dnevni načrt v 10 s, ne da bi vprašala, če
   bi raje manj mest počasneje«; počasna potovanja = lastna skupnost.
   → v planner manjka eksplicitno vprašanje tempa ( hitro/umerjeno/počasi).
3. **Vrstni red mest/dneva NIKDAR ni preverjen** ( Reddit, MEM študija):
   Mindtrip »ni nikoli podvomil o vrstnem redu«; cik-cak je 8–10 dni
   na 100 dni NEODVISNO od dolžine. → imamo OSRM+validacijo; manjka
   en klik »optimalno zaporedje dneva« ( 2-opt na 3–6 postankov).
4. **Sanjarjenje = pogostejša od potovanj** ( HN): »ljudje uporabljajo
   travel planner kot beg iz vsakdanjika — pogosteje kot potujejo«.
   → naši SEO vodniči/destinacijske strani že služijo temu; lahko
   merimo ( analitika: ogledi destinacij brez generacije).
5. **Ne zaupaj, dokler ne vidiš vzorca** ( HN ×4): strah pred dark
   pattern plačilom, pred login wallom, pred »recaptcha podivjal«.
   → naše brez-račun načrtovalnik + jasne cene je pravilno; ohrani.
6. **Agregacija rezervacij/iskanj** ( HN ×3, stardrift): »plačal bi za
   orodje, ki zbiera iskanja namestitev + komentarji več strani«;
   Gmail = najboljši planner ( potrditve same). → vrzel #5 ostaja
   odložena ( zasebnost), iskreno zapisano.
7. **Wanderlog POČASNOST** ( HN): »literally had to create an Android
   app because their app isn't optimized«. → naša hitrost ( čiste
   funkcije, nobenih težkih odvisnosti) je konkurenčna prednost;
   varujmo jo.
8. **Road-trip plast** ( MEM članek): preverjeni časi etap ✅ ( OSRM),
   detour z km odstopanja 🟡 ( imamo stops-along-way API — manjka
   prikaz »+X km izven poti«), načrtovani postanki za hrano pred
   etapami > 2 h 🟡.

## 22. Idejni backlog F13+ ( prioritiziran po vplivu/strošku)

| # | Ideja | Zakaj ( vir) | Strošek | Odločitev |
|---|---|---|---|---|
| 1 | **»Preveri svoj načrt«** — uporabnik prilepi/naloži KATERIKOLI načrt ( ChatGPT/Mindtrip/Layla izvoz, ali naš) → deterministični validator vrne poročilo ( razdalje/realnost, duplikati, odpiralni časi za naših 22, cik-cak dnevi, stroški vožnje) z ŽETONI virov | Reddit: »če že poznaš mesta, rabiš nekoga, ki preveri vrstni red/datume«; HN: bivši vodik zgradil CHECK orodje; MEM: 81 checkov = marketing. Vsa logika ŽE obstaja ( geo-validacija, plan-QA, url-ingest parser, OSRM) | nizek ( API + UI; 0 AI žetonov) | 🟢 glavni kandidat F13 |
| 2 | **Javna telemetrija validatorja** — stran »Koliko napak ujame naš preverjevalnik« z našimi realnimi številkami + citati javnih študij ( Tow 37/67/94 %, BBC 37/33 %, MEM 43,2 %) z viri | MEM je naredil to za 356 potovanj in postal referenca; mi imamo lastne QA dnevnike ( geo-validacija issues pred/po) | nizek ( statičen vsebina + analitika štetja) | 🟢 spremljava F13 |
| 3 | **Vprašanje tempa v plannerju** — hitro/umerjeno/počasi ( + otroci/starosti?) vpliva na št. postankov/dan | Reddit ×2 ( Layla 10 s brez vprašanja; r/SlowTravelEurope) | zelo nizek ( 1 vprašanje + parameter v rankerju) | 🟢 lahka zmaga |
| 4 | **»Optimalno zaporedje dneva«** — en gumb na dnevu: 2-opt preureditev postankov ( deterministično, prikaz prihranka km/min pred/po) | MEM: cik-cak = 8–10/100 dni, »najmanjša napaka, ki obstaja« ( 3 točke v napačnem redu) | nizek ( čista funkcija + prikaz) | 🟢 kandidat |
| 5 | **Detour prikaz km** — pri »Postanki na poti« dodaj »+X km izven rute« na vsak predlog | MEM road-trip članek: »suggestion needs the actual extra distance attached« | nizek ( OSRM že povezan) | 🟡 naslednji sprint |
| 6 | **Postanki za hrano na dolgih etapah** — če etapa > 2 h, predlagaj kosilo ( iz naših POI/lokalov) pred najdaljšo etapo dneva | MEM: »realize 6 hours in that lunch should've happened two hours ago« | srednji | 🟡 |
| 7 | **Glasovanje PRED načrtom** ( termin/kraj) v toku shranjevanja osnutka | HN: odločitve SKUPINE so težava #1 | srednji ( nov UI tok) | 🟡 čaka povpraševanje |
| 8 | Import rezervacij ( TripIt-style) | HN ×3; stardrift: Mindtrip nima povezave z nabiralnikom | visok + zasebnost | ⏸ ostaja odloženo ( vrzel #5) |

**Sklep F13 raziskave:** forumi potrdijo obe naši stavi — ( 1) skupina
BREZ računov je pravi bolečinski primanjkljaj ( F11 je zadetek v
srce), ( 2) poštenost/dokazljivost je postala merljiva industrijska
valuta ( MEM študija, Tow Center, BBC). Kje zaostajamo po forumih:
tempo vprašanje, optimalni vrstni red dneva, detour km — vse tri so
deterministične in poceni. Največja NOVA priložnost: »Preveri svoj
načrt« ( check orodje za tuje izvoze) — samo poštenje, 0 AI stroškov,
direktna reklama našega diferenciatorja uporabnikom, ki so že drugje
dobili svoj načrt.
## 23. F13 odgovor na backlog idejo #1: "Preveri svoj načrt" ( 1.17.0)

> Backlog ( sekcija 22) je bil jasen: 🟢 glavni kandidat F13 = CHECK
> orodje za tuje izvoze, 0 AI žetonov, "direktna reklama našega
> diferenciatorja uporabnikom, ki so že drugje dobili svoj načrt".
> Dostavljeno v 1.17.0 — v enem sprintu na isti debeli infrastrukturi,
> ki poganja naš generator.

**Kaj je dostavljeno:**

| Backlog obljuba | Izvedba |
|---|---|
| Uporabnik prilepi/naloži KATERIKOLI načrt | Sekcija na glavni strani ( SL+EN, brez računa, demo z namernimi napakami) |
| Deterministični validator | Parser ( dnevi SL+EN, vrstni red omembe, termini, začetni datum, tolerance slovenskih končnic) → obstoječa geo-validacija + OSRM realne ceste |
| Razdalje/realnost | km/dan, zaporedne noge, obseg dneva ( samo vožnja — trajanj ne izluščimo, iskreno zapisano) |
| Duplikati | znotraj dneva ( obstoječe pravilo) + **NOVO prek dnevov** ( MEM 5,1 % dni) |
| Odpiralni časi za naših 22 | closed_month/closed_weekday SAMO z znanim datumom ( "Ptuj ob ponedeljkih" — demo to sproži) |
| Cik-cak dnevi | **NOVO: optimalna preureditev** ( izčrpno ≤7 postankov, sicer 2-opt; predlog samo pri ≥ 20 km IN ≥ 12 % prihranka) |
| Stroški vožnje | gorivo + e-vinjeta ( F5.3, enake predpostavke razkrite v UI) |
| ŽETONI virov | MEM 43,2 % ( 356 poti), BBC 37 %/33 %, Tow Center 37–94 %, naša /vir-podatkov — vsi s povezavo v poročilu |

**Zakaj je to pomembneje od "še ene funkcije":** to je prvi dotik
uporabnika, ki NI naš uporabnik — oseba z gotovim ChatGPT/Mindtrip
načrtom, ki išče nekoga, ki ji reče, ali drži voda. Forumi ( sekcija 21)
so pokazali točno ta primanjkljaj. Vsako poročilo konča z žetoni virov
in izjavo o omejitvah ( "preverimo samo naših 22; ostalih ne ugibamo") —
diferenciator, ki ga MEM prodaja kot marketing, mi izdamo kot orodje.

**Kaj namerno NI v F13 ( ostaja v backlogu):** uvoz rezervacij ( vrzel
#5, zasebnost), glasovanje PRED načrtom (#7), postanki za hrano (#6),
detour km na predloge (#5) — naslednji kandidati po prioritetah sekcije
22 so #2 javna telemetrija validatorja in #3 vprašanje tempa.
