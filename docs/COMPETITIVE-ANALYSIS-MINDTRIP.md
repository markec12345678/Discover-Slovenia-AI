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
| 7 | Community layer ( avtorji vodnikov, »Shranjeno pri 23«) | MindTrip hybrid AI + social | ⏸ **Roadmap** ( potrebuje uporabnike; imamo community-trips temelj) |
| 8 | Mobilna aplikacija ( iOS/Android) | Mindtrip app, Layla app | 🟡 **Delno zaprto v F5.7** ( PWA: namestitev na domači zaslon Chrome/Android/iOS, offline načrti + zemljevid; native app še vedno roadmap —dokumentirano odloženo) |
| 9 | Chat ni »itinerary copilot« ( ločena Q&A + refiner) | MindTrip = chat-first načrtovanje | ⚖️ **Delno zaprto že prej** ( NLP hero + refiner več-turn); chat-first preoblikovanje bi pomenilo redesign zlate poti → meritve naj odločijo |
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
5. **Community vodniki** ( temelj: community-trips + ownerji).

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
