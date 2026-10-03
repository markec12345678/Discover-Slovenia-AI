# ANALYTICS-EVENTS — definicije dogodkov pilotne analitike načrtovalca

> Vir resnice: `src/lib/planner-analytics.ts` (klient) + `POST /api/analytics/event`
> (strežnik, `src/app/api/analytics/event/route.ts`). Zapis: `AnalyticsEvent`
> (`type = "planner_<ime>"`, `sessionId`, `metadata = { props, path, eid }`).

## Načela (P1-2, recenzija)

- **Brez PII.** `sessionId` je naključeni UUID v `localStorage` — nikoli v URL,
  ni povezan z e-pošto, računom ali IP-logi. `props` so izključno primitivi iz
  produktnega konteksta (števila, ID-ji destinacij, oznake dejanj). Celoten AI
  odgovor, vpisi uporabnika (hero NLP poizvedba) in imena otrok se NE zapisujejo.
- **Strežniška whitelist.** Klient ne more zapisati poljubnega tipa dogodka
  (400 za neveljavno ime). Props: max 12 ključev, vrednosti max 120 znakov,
  objekti/null se tiho izpustijo.
- **Idempotenca (eid).** Vsak izstreli dogodek nosi `clientEventId` (UUID).
  Strežnik pred zapisom preveri `type + eid` — podvojeni poskus (keepalive
  retry, počasno omrežje) vrne `{ success: true, deduped: true }` BREZ nove
  vrstice. Klient ima dodatne enkratne varovalke (glej spodaj).
- **Proxy signali so označeni.** `result_session_ended_without_action` NE
  pomeni nezadovoljstvo (glej definicijo).

## Revizija whitelist 1.132.0 (W3 backfill)

Revizija ob W3 je odkrila, da je bila strežniška `VALID_EVENTS` lista zadnjič
v celoti osvežena pri 1.118.0 — **18 novejših dogodkov** klientnega union-a
je manjkalo (`chat_group_ai_asked`, `chat_group_place_added`,
`chat_ask_cta_clicked`, `chat_map_pinned/unpinned`, `day_added/removed`,
`stop_reordered/moved_to_day`, `plan_update_*`, `ingest_completed`,
`itinerary_undo`, `save_inplace_fallback`, `refine_cancelled/timeout`,
`go_mode_started`). Njihovi fire-and-forget POST-i so tiho dobivali 400 —
vrstic v DB ni bilo (W2/W9 meritve so bile podcenjene). Vsi so dodani
nazaj; regresijski test (`w3-collections.test.ts`) od zdaj preverja, da je
vsak član `PlannerEventName` union-a prisoten v strežniški whitelisti —
past se ne more tiho ponoviti.

## Zlata pot (v tem vrstnem redu)

| Dogodek | Kdaj se sproži | Enkrat / večkrat | Obvezni props | Pomen / metrika |
|---|---|---|---|---|
| `session_locale` (1.139.0, W1 KPI; 1.144.0 W12 +fr/es) | prvi prikaz katerekoli strani v danem locale-u (root layout, `SessionLocaleKpi`) | 1× na (seja, locale) par — največ 6/sejo; preklop srednje-seje šteje v oba jezika | `locale` (`sl`/`en`/`it`/`de`/`fr`/`es`) | W1 KPI (benchmark §6): delež sej v it/de (W1) + fr/es (W12) locale — brez tega je jezik merljiv šele v `planner_started` (samo seje, ki začnejo načrtovati); skupaj s `planner_started{locale}` → jezikovni konverzijski lijak (KPI vrstica 2) |
| `shell_nav_clicked` (1.152.0, Issue #16 F5) | klik na vstop lupine ODKRIJ \| ZEMLJEVID \| MOJA POT \| POJDI \| VEČ (MobileTabBar zavihek, desktop header povezava/sprožilec Več, vnosa Sheet/dropdown menijev) | vsak klik | `tab` (`explore`/`map`/`my_trip`/`go`/`more`), `surface` (`tabbar`/`header`/`sheet`/`dropdown`); `items` (samo my_trip — velikost zbirke ob kliku), `label` (samo sheet/dropdown vnosi ravni-2 — href, stabilen across locale) | **analitika lupine** (Issue #16): ali preoblikovana IA F1–F4 (5-zavihek lupina + Več progressive disclosure) dejansko živi — katere vstopne točke dobivajo promet, ali MOJA POT hub (prej 1 klik v meniju) in POJDI (prej pokopan v nogi) sadita, ali kdo odpira „Več“ in KATERO vsebino ravni-2 išče (upravičenje progressive disclosure); `items` meri „zbirka → hub“ prehode; skupaj s `planner_started` → lijak lupina → načrtovanje |
| `planner_started` | prva interakcija z obrazcem načrtovalca (vpis ali oddaja) | 1× na življenjsko dobo komponente (ref varovalka) | `locale` | zavedanje: delež obiskovalcev, ki začnejo načrtovati |
| `planner_submitted` | oddaja obrazca / samodejna AI generacija (hero NLP) | vsaka oddaja | `days`, `interests` (število), `season`, `partyType`, `has_start_date`, `regeneration` (0|1 — obstoječi načrt v spominu, TASK 80), `locale` | intent: kakšne načrte ljudje dejansko hočejo; delež regeneracij |
| `planner_result_rendered` | načrt uspešno prikazan v UI | vsak nov rezultat | `days`, `stops` (skupno postankov), `source` (`ai`/`fallback`), `locale` | uspešnost generacije; skupaj s `planner_submitted` → stopnja uspešnih generacij |
| `day_adjusted` | hitra akcija „Prilagodi ta dan" (deterministično ali AI) | vsak klik, ki vrne odgovor | `action`, `day`, `source`, `geo_status` (`pass`/`warn`/`still_failing`), `km_before`, `km_after` | P0: ali geo-popravki dejansko izboljšajo dan (km pred/po iz ISTE validacijske plasti kot prikaz) |
| `planner_refined` | vsak uspešen refine (hitra akcija ali prosti ukaz) | vsak uspešen refine | `via` (`quick_action`/`free_text`), `source`, `changes` (število učinkovitih sprememb), `action?`, `day?`, `geo_status` | iteracija: delež uporabnikov, ki načrt še spremenijo |
| `stop_replaced` / `stop_removed` | elementarna sprememba iz changes[] | vsaka sprememba | `action`, `day`, `destination` (+ `replacement` pri replace) | kateri popravki so najbolj iskani |
| `weather_alternative_used` | „Primerno za dež" dejansko zamenja postanek | vsaka uspešna dež-zamenjava | `day`, `via` | vrednost dež-alternativ (Test 2) |
| `map_opened` | uporabnik odpre zemljevid poti | vsako odprtje | `via` | razumevanje: ali ljudje načrt geografsko preverijo |
| `provider_detail_opened` | klik na partnerja/ponudnika v booking panelu | vsak klik | `provider` | monetizacijska izpostavljenost |
| `affiliate_clicked` | klik na affiliate povezavo | vsak klik | `provider` | monetizacija (12 % kanal) |
| `marketplace_stop_cta` (1.117.0, Issue #11 D1) | klik čipa „Na tržnici od €X“ na kartici postanka načrta (realne cene lastnih izkušenj destinacije) | vsak klik | `destination`, `count`, `from_price` | notranji prehod načrt → tržnica (D1): ali realne cene premaknejo uporabnika proti rezervaciji; komplement `affiliate_clicked`/`booking_cta_clicked` (zunanji handoffi) — ta je prvi korak NOTRANJEGA 12 % kanala |
| `itinerary_saved` | uspešno „Shrani in deli" | vsako shranjevanje | `days`, `stops`, `source`, `locale` | konverzija zlate poti; skupaj s `planner_result_rendered` → save rate |
| `ingest_url_attempted` | uporabnik odda povezavo v „Začni s povezavo“ (F5.4) | vsak poskus | `host` (gostitelj, max 60 znakov — brez poti/query), `locale` | zanimanje za „Start Anywhere“ vnos; skupaj z `ingest_url_success` → stopnja uspešnosti prepoznavanja |
| `ingest_url_success` | strežnik prepozna ≥ 1 destinacijo s povezave | vsak uspešen ingest | `matches` (število zadetkov), `days` (predlog dni), `locale` | kakovost prepoznavanja; predlog dni vs. dejansko generiranje |
| `ingest_image_attempted` | uporabnik odda sliko v „Začni s sliko“ (F8) | vsak poskus | `locale` | zanimanje za slikovni vnos (MindTrip „share images“); skupaj z `ingest_image_success` → stopnja uspešnosti VLM prepoznavanja |
| `ingest_image_success` | strežnik prepozna ≥ 1 destinacijo s slike (VLM prebere imena, ujemanje deterministično) | vsak uspešen ingest | `matches` (število zadetkov), `days` (predlog dni), `locale` | kakovost VLM ekstrakcije; primerjava uspešnosti slika vs. povezava |
| `ingest_pins_attempted` | uporabnik odda shranjene točke v „Uvozi shranjene točke“ (F14) | vsak poskus | `locale` | zanimanje za uvoz Google Maps pinov (Mindtrip „Google Pins“); skupaj z `ingest_pins_success` → stopnja uspešnosti |
| `ingest_pins_success` | strežnik pripne ≥ 1 točko k destinaciji ( ime ali koordinate ≤ 25 km — 0 AI žetonov) | vsak uspešen ingest | `matches` (število zadetih destinacij), `pins` (skupaj točk), `format` (`geojson`/`kml`/`text`), `locale` | kakovost prepoznavanja po obliki vnosa (Takeout/KML/seznam) — vodi UX priorite |
| `ingest_completed` | uspešno zaključen uvoz vira (TASK 8 / F3-C, issue #8 §25) | vsak uspešen ingest (dopolnilo `ingest_*_success`) | `mode` (`link`/`image`/`pdf`/`pins`), `session_count` (števec na sejo, sessionStorage `dsa_planner_ingest_count`) | „imports per session by entry point“ — merjenje dviga dostopov (noga/Sheet/USP vrstica → #start-kjerkoli) |
| `ics_download` | klik „Koledar (.ics)“ — datoteka se dejansko ustvari | vsak prenos | `days`, `has_dates`, `locale` | vrednost koledarskega izvoza (F5.2); `has_dates` loči načrte z/s brez datuma odhoda |
| `pwa_install_prompted` | klik na gumb namestitve v navigaciji → sistemski namestitveni dialog (F5.7) | vsak klik | `locale` | zanimanje za namestitev PWA; skupaj s `pwa_install_accepted` → stopnja sprejema |
| `pwa_install_accepted` | uporabnik SPREJME namestitveni dialog | vsaka sprejeta namestitev | `locale` | namestitve PWA (offline načrti v žepu); delež = accepted / prompted |
| `packing_item_checked` | odkljuk predmeta na pametnem pakirnem seznamu (F6.1) | vsak odkljuk (le smer `true`) | `category`, `method` (`forecast`/`season`), `items` | angažma s seznamom; `method` pove, iz katere plasti (napoved vs sezona) uporabnik resno pakira |
| `budget_goal_set` | nastavitev/primerjava osebnega proračunskega cilja (F6.2) | vsaka potrditev cilja | `goal_eur`, `plan_total_eur`, `group_size` | proračunska angažma; razlika goal−plan pove cenovno občutljivost obiskovalcev |
| `budget_vehicle_changed` (1.166.0, Issue #24 Sklop 4) | izbor vrste vozila za oceno stroškov vožnje (bencin/dizel/hibrid/EV — Roadtrippers vzorec) | vsak klik na drugo vrsto vozila (ponovni klik iste ne meri) | `vehicle`, `km`, `fuel_eur` | doseg goriva po vozilu; distribucija `vehicle` pove, kaj obiskovalci dejansko vozijo; `fuel_eur` takoj pokaže razliko med profili (EV ± pas elektrike je razkrit v UI) |
| `budget_travelers_changed` (1.167.0, Issue #24 Sklop 5) | sprememba števila potnikov za pošteno delitev stroškov (Wanderlog vzorec: vožnja se deli, vstopnine so že na osebo) | vsak klik na drugo število potnikov (ponovni klik istega ne meri) | `travelers`, `drive_per_person_eur`, `total_per_person_eur` | doseg delitve stroškov; `drive_per_person_eur` pokaže vrednost souporabe avta; porazdelitev `travelers` pove tipično velikost skupin obiskovalcev |
| `nearby_stop_added` (1.171.0, Issue #24 Sklop 9) | nearby kandidat dodan v pot s prostega časa (TripIt Nearby vzorec: sredi dneva pred naslednjim postankom, ne na konec dneva) | vsak uspešen dodajanje (v2 zapis) | `position` (`mid`/`end`) | delež `mid` pove, koliko dodajanj dejansko zapolni trenutno okno (namen skl. 9) in koliko konča na koncu dneva (dan brez naslednjega postanka); brez PII — ime/geo kandidata NE gresta ven |
| `gps_power_mode_changed` (1.172.0, Issue #24 Sklop 10) | preklop prilagodljive GPS natančnosti med odprtim zajemanjem (Polarsteps baterija: `balanced` daleč od postanka → mrežni približki; `high` znotraj 2 km → geofence varnost) | samo ob DEJANSKEM preklopu načina, ko je watch odprt (status active/requesting) | `mode` (`high`/`balanced`) | delež časa v `balanced` oceni dejanski prihranek baterije; pogostost preklopov pove tipičen ritem dneva (vožnja med cilji); brez PII — razdalja (izpeljana iz lokacije) NE gre ven |
| `guide_saved` | shranjen/urejen skupnostni vodnik na deljeni poti (F7) | vsako uspešno oddajanje (upsert) vodnika | `tips_count`, `has_verdict`, `day_count`, `lang`, `is_new` | avtorstvo skupnosti; `has_verdict` meri, koliko avtorjev piše korektivni »kaj bi storil drugače« (naš diferencator) |
| `plan_qa_asked` | zastavljeno vprašanje v „Vprašaj o načrtu“ (F9) | vsako poslano vprašanje (vnos ali žeton predloga) | `intent` (npr. `busiest`, `cost_total`, `day_plan`, `out_of_range`, `ai`, `unknown`, `error`), `source` (`computed`/`puter`/`z-ai-sdk`/`fallback`/`error`), `locale`, `via` (`input`/`chip`) | pogovorna angažma nad načrtom (MindTrip chat-first pariteta); `source=computed` delež pove, koliko vprašanj pokrijeta deterministični nameni BREZ AI žetonov; `intent` pove, kaj uporabnike zanima (vožnja, stroški, natrpanost …) |
| `plan_check_submitted` | oddaja besedila v „Preveri svoj načrt“ (F13) | vsak poskus | `chars`, `lang` | zanimanje za preverjanje TUJIH načrtov (ChatGPT/Mindtrip/Layla izvozi); skupaj z `plan_check_completed` → stopnja uspešnosti |
| `plan_check_completed` | strežnik vrne poročilo (200) ali pošteno zavrnitev (422) v klientu | vsak odgovor | `worst` (`error`/`warn`/`ok`/`unknown`) | kakovost preverjenih načrtov; NE meša se z javnim števcem (ta pije iz strežniškega `planner_plan_check_reported`) |
| `day_optimized` | klik gumba „Optimalno zaporedje“ na kartici dneva (F16) | vsaka preureditev | `day`, `stops`, `saved_km`, `before`, `after`, `locale` | vrednost deterministične 2-opt plasti nad lastnimi dnevi (0 AI žetonov); `saved_km` = prihranek ocene km |
| `chat_geo_answered` (1.41) | AI klepet odgovori z ≥ 1 krajem na mini zemljevidu | vsak geo odgovor | `osm_count`, `t1_count`, `t2_count` (1.44), `cat_counts` (1.46 — npr. `"food:7,drinks:2,market:3,destination:1,source:1"`) | doseg „generative spatial“ odgovorov (kje je hrana/pijača/tržnica) po plasti porekla; `t2_count` = citani uradni viri STO, izrisani kot turkizni pini (zemljevid odseva odgovor — samo dejansko citirani viri) |
| `chat_geo_filtered` (1.46) | preklop kategorije v čipih geo odgovora (klepet ali fullscreen overlay) | vsak preklop | `category`, `enabled` (0/1), `surface` (`chat`/`overlay`) | ali so multi-select filtri kategorij (Mindtrip vzorec, naša izvedba) sploh uporabni — če jih nihče ne preklopi, jih odstranimo; `surface` loči filtriranje ob branju (klepet) od raziskovanja (velik zemljevid) |
| `map_poi_filtered` (1.47) | preklop kategorije v POI čipih na `/zemljevid` (brskalni zemljevid) | vsak preklop | `category` (8 kategorij, npr. `restaurant`/`hotel`/`shop`), `enabled` (0/1), `surface` (`map`) | komplement `chat_geo_filtered` za brskalni zemljevid: ali multi-select čipi pomagajo tudi izven klepeta; katere kategorije uporabniki iščejo (hrana/nastanitve so bile do 1.47 skrite pred UI-jem — njihov delež = vrednost razkritja) |
| `map_search_submitted` (1.118.0, Issue #12 F12-1) | oddana poizvedba v iskanje na zemljevidu („Kaj iščeš?“ nad zemljevidom, debounce 600 ms) | vsaka oddana poizvedba | `locale`, `total` (skupaj zadetkov), `query_len` (dolžina niza — BREZ besedila, PII disciplina) | doseg map-first iskanja; skupaj z `map_search_result_selected` → stopnja uspešnosti; `total=0` delež pove kakovost preslikave naravnega jezika na bazo |
| `map_search_result_selected` (1.118.0, Issue #12 F12-1) | klik zadetka v rezultatih iskanja na zemljevidu (fly-to na zemljevidu) | vsak klik | `kind` (`destination`/`listing`/`experience`/`product`), `has_geo` (0/1) | prehod iskanje → zemljevid (jedro Issue #12: „ko iščem, vidim rezultate na zemljevidu“); `has_geo=0` delež pove, koliko zadetkov je iskreno brez lokacije |
| `chat_place_added` (1.42) | klik „+“ na kraju v AI klepetu, ki ga doda v načrt | vsak uspešen dodatek (tudi consume iz sessionStorage) | `provenance` (`t1`/`osm`), `category`, `day?`, `stashed?` (=1, če je čakal na prvi načrt), `locale` | zaključek zanke „pogovor → dejanje“ (Mindtripov „+“); `stashed` delež pove, koliko uporabnikov išče kraje PRED ustvarjanjem načrta |
| `chat_place_removed` (1.43) | klik „Odstrani“ na kartici postanka, dodanega iz klepeta | vsak uspešen en-klik odstranitev | `provenance` (`t1`/`osm`), `day`, `locale` | komplement `chat_place_added`: razmerje doda/odstrani pove, kako dobro AI priporoča kraje (visok odstotek odstranitev = slaba priporočila); samo klepet postanki — AI generirani gredo skozi `stop_removed` (refine pot) |
| `itinerary_audio_play` (1.80; 1.81 `surface=mytrip`) | uspešen začetek predvajanja **zvočnega povzetka dneva** (TASK 89/91, gumb „Poslušaj“/„Listen“ v glavi dneva) | vsak uspešen začetek (napake se NE štejejo) | `day`, `lang` (`sl`/`en`), `surface` (`planner`/`shared`/`mytrip`), `bytes` (velikost zvoka) | doseg TTS zmožnosti (vrzel do Mindtripa — audio itinerar); `surface=shared` pove, ali poslušajo tudi obiskovalci deljenih povezav (prijatelji brez računa); `surface=mytrip` (1.81) ali poslušajo POTNIKI svoj potrjen načrt med potovanjem; `bytes` posredna dolžina poslušanja |
| `day_export_gmaps` (1.141.0 W11-A; 1.143.0 `surface=shared`) | klik **„Google Maps“ pilule** v glavi dneva — izvoz VESGA dneva kot navigacijska povezava (`maps/dir/?api=1…`, brezplačni protejip Wanderlog Pro $39.99/leto) | vsak klik | `day`, `stops`, `skipped` (postanki brez koordinat), `truncated` (Google 9-waypoint strop), `surface` (`planner`/`shared`) | doseg „Dan v žepu“ (W11-A); `surface=shared` (W11-C) pove, ali izvoz uporabljajo tudi obiskovalci deljenih povezav/embedov (prijatelji, blog bralci — brez računa); `truncated` delež kaže, kdaj bi bilo vredno razbiti dolge dneve |

| `wishlist_collection_used` (1.132.0, Issue #15 W3) | uporabnik je preklopil list „Priljubljene“ v razdelke **Po destinaciji** ali **Po temi** (kolekcije „someday“ — Mindtripov vzorec, po našem kanonu) | vsak preklop v ne-„Vse“ pogled („Vse“ = obstoječa izkušnja, brez dogodka) | `view` (`destination`/`theme`), `groups` (št. razdelkov), `items` | doseg kolekcij nad ploščnim seznamom; delež sej z ≥ 1 preklopom pove, ali razdelki dejansko pomagajo organizirati shranjeno — brez tega bi razdelke odstravili (isti test kot `chat_geo_filtered` za čipe) |
| `wishlist_collection_planned` (1.132.0, Issue #15 W3) | klik **„Načrtuj“** na razdelku zbirke (vnosi razdelka → zbirka „Moja pot“ + handoff na /nacrtuj; razrešena destinacija sproži `dai:my-trip-prefill`) | vsak klik | `view` (`destination`/`theme`), `items`, `has_destination` (0/1) | most **zbirka → načrt** („someday“ → konkreten načrt prek obstoječega handoff kanona — NO silent AI, razpored sestavi uporabnik); skupaj z `wishlist_collection_used` → delež zbirk, ki prerastejo v načrtovanje |
| `trip_embed_copied` (1.140.0, Issue #15 benchmark dodatek D/7) | kopiranje **iframe snippet-a** za vdelavo javne poti na tujo stran/blog („Vdelaj na svojo stran ali blog“ v sekciji deljenja; SAMO javne pote — zasebne ne ponujamo) | vsak USPEŠEN copy (padec obeh mehanizmov se NE šteje — lažnega dogodka ne pišemo) | `path` (auto — `/pot/{shareId}` pove, KATERA pot se vdeluje) | interes za blog-embed vzorec (Roam Aroundov „Embed on your site“ brez zavrnjene token ekonomije); skupaj s `page_view` na `/pot/embed/*` → koliko kopiranih snippet-ov dejansko prinese embed ogled |

## Strežniški dogodki (piše jih IZKLJUČNO strežnik — klient jih NE more oddati)

Ti dogodki NISO v klientni whitelisti (`VALID_EVENTS`) namerno —
zapisuje jih strežnik direktno v `AnalyticsEvent` ob dogodku, ki se
zanesljivo zgodi na strežniku (fail-open: napaka pisanja ne vrže
glavne odpovedi). Eid/oddedup ni potreben — en zapis na zahtevo.

| Dogodek | Kje se zapiše | Kdaj | Props (metadata) | Pomen |
|---|---|---|---|---|
| `planner_plan_check_reported` | `POST /api/plan-check` (F17) | ob USPEŠNO izračunanem poročilu (200; 422 se NE šteje) | `lang`, `days`, `stops`, `issuesTotal`, `issuesError`, `issuesWarn`, `rules` (števci po `GeoRuleId`), `duplicates`, `zigzagDays`, `zigzagSavedKm`, `worst`, `method` — SAMO števke, BREZ besedila načrta/PII | vir JAVNE telemetrije validatorja (`GET /api/plan-check/stats`, sekcija „Koliko napak ujame naš preverjevalnik“); strežniško štetje = imun na izgubljene klientske klice |

## Neuspehi in opustitvi

| Dogodek | Kdaj se sproži | Enkrat / večkrat | Obvezni props | Pomen / metrika |
|---|---|---|---|---|
| `planner_error` | HTTP ≠ 200 ali napaka omrežja/parsiranja pri generaciji | vsaka napaka | `status?`, `stage` (`response`/`network_or_parse`/`timeout` — TASK 77 odmor > 90 s), `elapsed?` | zanesljivost generacije |
| `empty_result` | API vrne 200, a 0 postankov | vsak prazen rezultat | `days` | lažni uspeh (prikaz brez vsebine) |
| `invalid_location` | postanek z ID-jem izven dataseta (AI halucinacija) | vsak neveljaven postanek | `day`, `destination_id` | kakovost AI izbire; podpira geo pravilo `missing_coords` |
| `unrealistic_day` | geo-validacija vrne ERROR za dan | vsak ERROR (warn NE šteje) | `day`, `rule` (npr. `leg_distance`), `km`, `source` | P0: delež nerealističnih dni po pravilih — ISTA plast kot prikaz |
| `save_failed` | shranjevanje na strežnik ne uspe | vsaka napaka | `locale` | zanesljivost shranjevanja |
| `refine_failed` | AI refine ne uspe (opozorilo + izvirni načrt) ALI akcija zavrnjena (`cannot_transform`) | vsak neuspeh/zavrnitev | `via`, `action?`, `day?`, `reason?` (npr. `missing_destination_data`, `no_nearby_alternative`) | P0.3: kadar varna transformacija ni mogoča — merjeno ločeno od uspehov |
| `planner_cancelled` | uporabnik klikne **Prekliči** med generiranjem (TASK 77) | vsak preklic | `elapsed` (s) | **NAMERNA izbira, ne napaka** — meri nedopustne čakalne dobe; prej je obešena zahtevka uporabnika ujela v skeletu do osvežitve strani (izguba obrazca) |
| `result_session_ended_without_action` | rezultat prikazan, pagehide/unmount po ≥ 45 s BREZ zaznanega refine/shranjevanja | 1× na prikaz rezultata (sessionStorage en-shot + strežniški eid dedup) | `seconds_viewed`, `days`, `source` | **PROXY signal** (P1-3): „rezultat prikazan, naslednji sledeni dogodek ni bil zaznan v merjenem oknu". NE dokaz nezadovoljstva — znano podcenjevanje: mobilni brskalniki lahko izpustijo `pagehide`, zemljevid v novem zavihku se ne sledi, izguba povezave izgleda kot konec. Metrika: branje časa (`seconds_viewed`) ob nizki konverziji. |
| `guidance_shown` (1.163.0, Issue #23) | vodena kartica/trak se izriše z novo stanjem (first-run kartica, trak na domov/hub, COMPLETED kartica v Go Mode) | 1× na (seja, stanje, površina) — ref guard preprečuje ponavljanje | `state` (`NEW_USER`/`DISCOVERING`/`TRIP_BUILDING`/`TRIP_READY`/`BOOKING_PENDING`/`TRIP_STARTED`/`NAVIGATING`/`ARRIVED`/`FREE_TIME`/`NEEDS_ATTENTION`/`BLOCKED`/`RECOVERY`/`COMPLETED`/`UNKNOWN`), `surface` (`home`/`hub`/`planner`/`go`) | ISSUE #23 §35: doseg vodene plasti po stanjih — katera stanja uporabniki dejansko srečajo (brez PII: samo ključi stanj, NIKOLI imena postankov/koordinate) |
| `guidance_action_clicked` (1.163.0, Issue #23) | klik primarne ali sekundarne akcije vodene kartice | vsak klik | `state`, `surface`, `action` (`discover`/`plan`/`book`/`start_trip`/`go_mode`/`navigate`/`complete_stop`/`free_time`/`recovery`/`new_trip`/`open_trips`/`ask_discover`) | konverzija vodene plasti: ali „naslednji korak“ dejansno vodi (skupaj z `guidance_shown` → CTR po stanju) |
| `guidance_dismissed` (1.163.0, Issue #23) | uporabnik zapre (ne-kritično) vodeno kartico | vsako zaprtje | `state`, `surface` | meri nadležnost po stanju — visok delež dismissal = sporočilo ni uporabno (kritična stanja NISO dismissible, §40.20) |
| `guidance_completed` (1.163.0, Issue #23) | vodena plast zazna prehod stanja med sejo (npr. zbirka → načrt → zagon) | vsak zaznani prehod | `state` (novo stanje), `surface` | progresija zlate poti (§37): koliko sej dejansko prečka stanja brez izgube |
| `first_run_started` (1.163.0, Issue #23) | prvi klik nameri na first-run kartici (vključno „Ne vem — pokaži mi“) | 1× na prvi klik | `intent` (`plan`/`discover`/`find`/`help`/`dont_know`) | ISSUE #23 §6: kateri nameni prevladajo pri prvem stiku — „dont_know“ delež pove, koliko uporabnikov potrebuje vodeno izkušnjo |
| `first_run_completed` (1.163.0, Issue #23) | vodena pot („Ne vem“) doseže TRIP_STARTED | 1× na vodeno pot (ob čiščenju zastavice `dai:guided-tour`) | (brez props) | END-TO-END dokaz zlate poti §18: NE VEM → DISCOVER → ADD → PLAN → START brez vračanja v menije |
| `intent_selected` (1.163.0, Issue #23) | izbiera namena s first-run kartice (podatek `intent` je v `first_run_started`; ta dogodek šteje tudi ponovne izbire v seji) | vsaka izbira namena | `intent` | frekvenca namenov (ne samo prvi klik) — podpira §5 intent vocabulary |
| `next_step_completed` (1.163.0, Issue #23) | uporabnik je prek vodene akcije dejansko zaključil korak verige (npr. klik „Načrtuj potovanje“ iz add-toastr → prihod na /nacrtuj) | vsak zaključek koraka | `state`, `surface`, `action` | dopolnjuje `guidance_action_clicked` z dejanskim REZULTATOM akcije (ne samo klikom) |

## Kako se metrike računajo

- **Save rate** = `itinerary_saved` / `planner_result_rendered` (na `sessionId`).
- **Stopnja uspešnih generacij** = `planner_result_rendered` / `planner_submitted`.
- **Iteracija** = delež `sessionId`-jev z ≥ 1 `planner_refined` med tistimi z `planner_result_rendered`.
- **Geo zdravje** = `unrealistic_day` na `planner_result_rendered` (po `rule`) + `day_adjusted.geo_status` (`km_after < km_before` in `geo_status ≠ still_failing` = uspešen popravek).
- **Zavrnjene akcije** = `refine_failed` z `reason` (P0.3 varovalke) — pričakovano nizko; rast pomeni slabe podatke, ne slabe uporabnike.

## Zasebnost — kaj se NE zapisuje

- vpisana poizvedba (hero NLP), celoten AI odgovor, celoten itinerer;
- e-pošta, ime, račun, IP (session je anonimni UUID, brez povezave);
- otroci/osebni podatki iz prostih ukazov refine (zapisuje se le `via`/`action`).
