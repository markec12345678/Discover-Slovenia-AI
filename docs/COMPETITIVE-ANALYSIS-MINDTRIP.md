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
| 3 | Potni dnevnik/spomini ( Stippl travel reel, photobook) | ⏸ Zavestno odloženo — vsebinska smer, ne jedro načrtovanja |
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
