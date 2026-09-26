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

## Zlata pot (v tem vrstnem redu)

| Dogodek | Kdaj se sproži | Enkrat / večkrat | Obvezni props | Pomen / metrika |
|---|---|---|---|---|
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
| `guide_saved` | shranjen/urejen skupnostni vodnik na deljeni poti (F7) | vsako uspešno oddajanje (upsert) vodnika | `tips_count`, `has_verdict`, `day_count`, `lang`, `is_new` | avtorstvo skupnosti; `has_verdict` meri, koliko avtorjev piše korektivni »kaj bi storil drugače« (naš diferencator) |
| `plan_qa_asked` | zastavljeno vprašanje v „Vprašaj o načrtu“ (F9) | vsako poslano vprašanje (vnos ali žeton predloga) | `intent` (npr. `busiest`, `cost_total`, `day_plan`, `out_of_range`, `ai`, `unknown`, `error`), `source` (`computed`/`puter`/`z-ai-sdk`/`fallback`/`error`), `locale`, `via` (`input`/`chip`) | pogovorna angažma nad načrtom (MindTrip chat-first pariteta); `source=computed` delež pove, koliko vprašanj pokrijeta deterministični nameni BREZ AI žetonov; `intent` pove, kaj uporabnike zanima (vožnja, stroški, natrpanost …) |
| `plan_check_submitted` | oddaja besedila v „Preveri svoj načrt“ (F13) | vsak poskus | `chars`, `lang` | zanimanje za preverjanje TUJIH načrtov (ChatGPT/Mindtrip/Layla izvozi); skupaj z `plan_check_completed` → stopnja uspešnosti |
| `plan_check_completed` | strežnik vrne poročilo (200) ali pošteno zavrnitev (422) v klientu | vsak odgovor | `worst` (`error`/`warn`/`ok`/`unknown`) | kakovost preverjenih načrtov; NE meša se z javnim števcem (ta pije iz strežniškega `planner_plan_check_reported`) |
| `day_optimized` | klik gumba „Optimalno zaporedje“ na kartici dneva (F16) | vsaka preureditev | `day`, `stops`, `saved_km`, `before`, `after`, `locale` | vrednost deterministične 2-opt plasti nad lastnimi dnevi (0 AI žetonov); `saved_km` = prihranek ocene km |
| `chat_geo_answered` (1.41) | AI klepet odgovori z ≥ 1 krajem na mini zemljevidu | vsak geo odgovor | `osm_count`, `t1_count`, `t2_count` (1.44), `cat_counts` (1.46 — npr. `"food:7,drinks:2,market:3,destination:1,source:1"`) | doseg „generative spatial“ odgovorov (kje je hrana/pijača/tržnica) po plasti porekla; `t2_count` = citani uradni viri STO, izrisani kot turkizni pini (zemljevid odseva odgovor — samo dejansko citirani viri) |
| `chat_geo_filtered` (1.46) | preklop kategorije v čipih geo odgovora (klepet ali fullscreen overlay) | vsak preklop | `category`, `enabled` (0/1), `surface` (`chat`/`overlay`) | ali so multi-select filtri kategorij (Mindtrip vzorec, naša izvedba) sploh uporabni — če jih nihče ne preklopi, jih odstranimo; `surface` loči filtriranje ob branju (klepet) od raziskovanja (velik zemljevid) |
| `map_poi_filtered` (1.47) | preklop kategorije v POI čipih na `/zemljevid` (brskalni zemljevid) | vsak preklop | `category` (8 kategorij, npr. `restaurant`/`hotel`/`shop`), `enabled` (0/1), `surface` (`map`) | komplement `chat_geo_filtered` za brskalni zemljevid: ali multi-select čipi pomagajo tudi izven klepeta; katere kategorije uporabniki iščejo (hrana/nastanitve so bile do 1.47 skrite pred UI-jem — njihov delež = vrednost razkritja) |
| `chat_place_added` (1.42) | klik „+“ na kraju v AI klepetu, ki ga doda v načrt | vsak uspešen dodatek (tudi consume iz sessionStorage) | `provenance` (`t1`/`osm`), `category`, `day?`, `stashed?` (=1, če je čakal na prvi načrt), `locale` | zaključek zanke „pogovor → dejanje“ (Mindtripov „+“); `stashed` delež pove, koliko uporabnikov išče kraje PRED ustvarjanjem načrta |
| `chat_place_removed` (1.43) | klik „Odstrani“ na kartici postanka, dodanega iz klepeta | vsak uspešen en-klik odstranitev | `provenance` (`t1`/`osm`), `day`, `locale` | komplement `chat_place_added`: razmerje doda/odstrani pove, kako dobro AI priporoča kraje (visok odstotek odstranitev = slaba priporočila); samo klepet postanki — AI generirani gredo skozi `stop_removed` (refine pot) |
| `itinerary_audio_play` (1.80; 1.81 `surface=mytrip`) | uspešen začetek predvajanja **zvočnega povzetka dneva** (TASK 89/91, gumb „Poslušaj“/„Listen“ v glavi dneva) | vsak uspešen začetek (napake se NE štejejo) | `day`, `lang` (`sl`/`en`), `surface` (`planner`/`shared`/`mytrip`), `bytes` (velikost zvoka) | doseg TTS zmožnosti (vrzel do Mindtripa — audio itinerar); `surface=shared` pove, ali poslušajo tudi obiskovalci deljenih povezav (prijatelji brez računa); `surface=mytrip` (1.81) ali poslušajo POTNIKI svoj potrjen načrt med potovanjem; `bytes` posredna dolžina poslušanja |

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
