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
| `planner_submitted` | oddaja obrazca / samodejna AI generacija (hero NLP) | vsaka oddaja | `days`, `interests` (število), `season`, `partyType`, `has_start_date`, `locale` | intent: kakšne načrte ljudje dejansko hočejo |
| `planner_result_rendered` | načrt uspešno prikazan v UI | vsak nov rezultat | `days`, `stops` (skupno postankov), `source` (`ai`/`fallback`), `locale` | uspešnost generacije; skupaj s `planner_submitted` → stopnja uspešnih generacij |
| `day_adjusted` | hitra akcija „Prilagodi ta dan" (deterministično ali AI) | vsak klik, ki vrne odgovor | `action`, `day`, `source`, `geo_status` (`pass`/`warn`/`still_failing`), `km_before`, `km_after` | P0: ali geo-popravki dejansko izboljšajo dan (km pred/po iz ISTE validacijske plasti kot prikaz) |
| `planner_refined` | vsak uspešen refine (hitra akcija ali prosti ukaz) | vsak uspešen refine | `via` (`quick_action`/`free_text`), `source`, `changes` (število učinkovitih sprememb), `action?`, `day?`, `geo_status` | iteracija: delež uporabnikov, ki načrt še spremenijo |
| `stop_replaced` / `stop_removed` | elementarna sprememba iz changes[] | vsaka sprememba | `action`, `day`, `destination` (+ `replacement` pri replace) | kateri popravki so najbolj iskani |
| `weather_alternative_used` | „Primerno za dež" dejansko zamenja postanek | vsaka uspešna dež-zamenjava | `day`, `via` | vrednost dež-alternativ (Test 2) |
| `map_opened` | uporabnik odpre zemljevid poti | vsako odprtje | `via` | razumevanje: ali ljudje načrt geografsko preverijo |
| `provider_detail_opened` | klik na partnerja/ponudnika v booking panelu | vsak klik | `provider` | monetizacijska izpostavljenost |
| `affiliate_clicked` | klik na affiliate povezavo | vsak klik | `provider` | monetizacija (12 % kanal) |
| `itinerary_saved` | uspešno „Shrani in deli" | vsako shranjevanje | `days`, `stops`, `source`, `locale` | konverzija zlate poti; skupaj s `planner_result_rendered` → save rate |
| `ingest_url_attempted` | uporabnik odda povezavo v „Začni s povezavo“ (F5.4) | vsak poskus | `host` (gostitelj, max 60 znakov — brez poti/query), `locale` | zanimanje za „Start Anywhere“ vnos; skupaj z `ingest_url_success` → stopnja uspešnosti prepoznavanja |
| `ingest_url_success` | strežnik prepozna ≥ 1 destinacijo s povezave | vsak uspešen ingest | `matches` (število zadetkov), `days` (predlog dni), `locale` | kakovost prepoznavanja; predlog dni vs. dejansko generiranje |
| `ingest_image_attempted` | uporabnik odda sliko v „Začni s sliko“ (F8) | vsak poskus | `locale` | zanimanje za slikovni vnos (MindTrip „share images“); skupaj z `ingest_image_success` → stopnja uspešnosti VLM prepoznavanja |
| `ingest_image_success` | strežnik prepozna ≥ 1 destinacijo s slike (VLM prebere imena, ujemanje deterministično) | vsak uspešen ingest | `matches` (število zadetkov), `days` (predlog dni), `locale` | kakovost VLM ekstrakcije; primerjava uspešnosti slika vs. povezava |
| `ingest_pins_attempted` | uporabnik odda shranjene točke v „Uvozi shranjene točke“ (F14) | vsak poskus | `locale` | zanimanje za uvoz Google Maps pinov (Mindtrip „Google Pins“); skupaj z `ingest_pins_success` → stopnja uspešnosti |
| `ingest_pins_success` | strežnik pripne ≥ 1 točko k destinaciji ( ime ali koordinate ≤ 25 km — 0 AI žetonov) | vsak uspešen ingest | `matches` (število zadetih destinacij), `pins` (skupaj točk), `format` (`geojson`/`kml`/`text`), `locale` | kakovost prepoznavanja po obliki vnosa (Takeout/KML/seznam) — vodi UX priorite |
| `ics_download` | klik „Koledar (.ics)“ — datoteka se dejansko ustvari | vsak prenos | `days`, `has_dates`, `locale` | vrednost koledarskega izvoza (F5.2); `has_dates` loči načrte z/s brez datuma odhoda |
| `pwa_install_prompted` | klik na gumb namestitve v navigaciji → sistemski namestitveni dialog (F5.7) | vsak klik | `locale` | zanimanje za namestitev PWA; skupaj s `pwa_install_accepted` → stopnja sprejema |
| `pwa_install_accepted` | uporabnik SPREJME namestitveni dialog | vsaka sprejeta namestitev | `locale` | namestitve PWA (offline načrti v žepu); delež = accepted / prompted |
| `packing_item_checked` | odkljuk predmeta na pametnem pakirnem seznamu (F6.1) | vsak odkljuk (le smer `true`) | `category`, `method` (`forecast`/`season`), `items` | angažma s seznamom; `method` pove, iz katere plasti (napoved vs sezona) uporabnik resno pakira |
| `budget_goal_set` | nastavitev/primerjava osebnega proračunskega cilja (F6.2) | vsaka potrditev cilja | `goal_eur`, `plan_total_eur`, `group_size` | proračunska angažma; razlika goal−plan pove cenovno občutljivost obiskovalcev |
| `guide_saved` | shranjen/urejen skupnostni vodnik na deljeni poti (F7) | vsako uspešno oddajanje (upsert) vodnika | `tips_count`, `has_verdict`, `day_count`, `lang`, `is_new` | avtorstvo skupnosti; `has_verdict` meri, koliko avtorjev piše korektivni »kaj bi storil drugače« (naš diferencator) |
| `plan_qa_asked` | zastavljeno vprašanje v „Vprašaj o načrtu“ (F9) | vsako poslano vprašanje (vnos ali žeton predloga) | `intent` (npr. `busiest`, `cost_total`, `day_plan`, `out_of_range`, `ai`, `unknown`, `error`), `source` (`computed`/`puter`/`z-ai-sdk`/`fallback`/`error`), `locale`, `via` (`input`/`chip`) | pogovorna angažma nad načrtom (MindTrip chat-first pariteta); `source=computed` delež pove, koliko vprašanj pokrijeta deterministični nameni BREZ AI žetonov; `intent` pove, kaj uporabnike zanima (vožnja, stroški, natrpanost …) |

## Neuspehi in opustitvi

| Dogodek | Kdaj se sproži | Enkrat / večkrat | Obvezni props | Pomen / metrika |
|---|---|---|---|---|
| `planner_error` | HTTP ≠ 200 ali napaka omrežja/parsiranja pri generaciji | vsaka napaka | `status?`, `stage` (`response`/`network_or_parse`) | zanesljivost generacije |
| `empty_result` | API vrne 200, a 0 postankov | vsak prazen rezultat | `days` | lažni uspeh (prikaz brez vsebine) |
| `invalid_location` | postanek z ID-jem izven dataseta (AI halucinacija) | vsak neveljaven postanek | `day`, `destination_id` | kakovost AI izbire; podpira geo pravilo `missing_coords` |
| `unrealistic_day` | geo-validacija vrne ERROR za dan | vsak ERROR (warn NE šteje) | `day`, `rule` (npr. `leg_distance`), `km`, `source` | P0: delež nerealističnih dni po pravilih — ISTA plast kot prikaz |
| `save_failed` | shranjevanje na strežnik ne uspe | vsaka napaka | `locale` | zanesljivost shranjevanja |
| `refine_failed` | AI refine ne uspe (opozorilo + izvirni načrt) ALI akcija zavrnjena (`cannot_transform`) | vsak neuspeh/zavrnitev | `via`, `action?`, `day?`, `reason?` (npr. `missing_destination_data`, `no_nearby_alternative`) | P0.3: kadar varna transformacija ni mogoča — merjeno ločeno od uspehov |
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
