# T5-a1 — Revizija AI-odvisnosti (v1.100.3, a854404)

Datum: 2026-09-25 · Agent: Explore (T5-a1) · Obseg: celoten `src/` (strežniško + klientno), read-only.

## Znano izhodišče

Testi 2745/2745, lint 0, `tsc` čist (2 predhodni napaki v `skills/`, izven `src/`). Produkcija Render health ok v1.100.3, Vercel alive v1.100.3, HEAD a854404. Issue #4 (VAL 1–8 + 5 hotfixov) je zaprt; Issue #5 „COMPLETE PRODUCT FUNCTIONALITY / DETERMINISTIC SDK + SCRIPTS FIRST" je odprt — ta revizija je njena Faza 3. Osrednje vprašanje: **ali jedro izdelka deluje z NIČ AI ključi, kje se kaj tiho pokvari in kje so padci pošteni.**

Centralna arhitektura (en hub, nikjer drugje direktnih SDK klicev — dokaz: `rg 'chat.completions.create|audio.tts.create|createVision'` zadene SAMO `ai-client.ts` + `tts-engine.ts`):

- **`src/lib/ai-client.ts`** — veriga `generateCompletion` (vrstica 348): OpenRouter → Gemini → Puter → z-ai-web-dev-sdk → **`null`** (vrstica 633). Klicatelj MORA imeti lasten fallback. Circuit breaker na OpenRouter/Gemini (3 napake → 5 min). Skupni proračun verige `TOTAL_CHAIN_BUDGET_MS = 150_000` (vrstica 310), `MIN_LEG_MS = 8_000`; vsaka noga `maxRetries: 0`, timeout vezan na preostanek.
- **`generateVisionCompletion`** (vrstica 648): Gemini (image_url) → z-ai VLM → `null`. OpenRouter v vision ni ( živo testirano — ne deluje).
- **`checkAIHealth`** (vrstica 825) — 4 vzporedne sonde; dosegljivo le prek `/api/ai-health` (CRON_SECRET/admin, vrstica 21–23) — javni health past (REVIZIJA #8) je zaprta.
- **`src/lib/tts-engine.ts`** — TTS gre IZKLJUČNO prek `zai.audio.tts.create` (vrstica 163; SDK „brez uporabniških poverilnic"); LRU 32 MB, pravi timeout 30 s/klic (`withTimeout`, vrstica 185), tipizirane napake `timeout | unavailable | invalid_wav`.
- Env (`.env.example` + `ai-client.ts`): `OPENROUTER_API_KEY` (+ `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODEL`, `OPENROUTER_BASE_URL`), `GEMINI_API_KEY` (+ `GEMINI_MODEL`, `GEMINI_BASE_URL`), `PUTER_AUTH_TOKEN` (+ `PUTER_MODEL`, `PUTER_BASE_URL`); z-ai noga BREZ env. Vsi strežniški (nikoli `NEXT_PUBLIC_`). **Brez ključa**: `getOpenRouterClient`/`getGeminiClient`/`getPuterClient` vrnejo `null` (vrstice 166, 229, 287) → veriga vrne `null` (z-ai noga v produkciji verjetno odpove v `ZAI.create()` → ujeta → `null`). `instrumentation.ts` korak `config:secrets` (vrstice 47–75) preverja SAMO `CRON_SECRET`/`NEXTAUTH_SECRET` placeholdere — AI ključi NISO validirani ob zagonu (skladno z „brez ključa = fallback" dizajnom; detektor je `ai-health`, cron-gated).

## Popoln inventar AI klicev

19 klicev `generateCompletion`/`generateVisionCompletion` v 17 datotekah + TTS jedro (2 ruti) + health sonda. Razred: **A** = mora biti deterministično, **B** = mora imeti deterministični fallback, **C** = AI izboljšava (po spec Issue #5).

| # | Datoteka:vrstica | Operacija | Providerji | Env | Vedenje brez ključa | Timeout/JSON varnost | Persistenca | Vloga | Razred | Dokaz |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `api/itinerary/route.ts:801` | JSON itinerer (generacija) | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → throw „Prazen odgovor AI" (835) → catch → **deterministični motor** `buildDeterministicPlanResponse("fallback")` (1059) | hard cap 70 s `Promise.race` (798–832); `timeoutMs` 65 s, `totalBudgetMs` 70 s (825); `sanitizeItinerary` (848); prazni dnevi = neuspeh (905) | ne (save je ločena ruta, glej #20) | avtoriteta (postanki/urnik) z validacijskimi plastmi | B | route.ts:1053–1073 |
| 2 | `api/itinerary/route.ts:541` | ISTA ruta, `engine:"deterministic"` | NOČ (0 LLM) | — | naravna pot, `source:"deterministic"` | čist modul (0 ure/omrežje) | ne | avtoriteta | B/A | route.ts:541–558, `deterministic-itinerary.ts:167` |
| 3 | `api/itinerary/refine/route.ts:749` | NL refine itinererja | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → throw (768) → **echo originala** (strežniško validiran) + `warning` „AI posodobitev ni uspela" (1071) | hard cap 60 s (746–765); `sanitizeItinerary` (779); supply revalidacija + `reinsertFixedFrom:"current"` (817–825) | ne (klientjni store) | avtoriteta nad postanki | B | route.ts:960–1074 |
| 4 | `api/itinerary/refine/route.ts:377` | hitre akcije (6 čipov) | NOČ (0 LLM) | — | `applyQuickAction` PRIMA — deterministično pred LLM | čista transformacija + ista validacijska plast (392) | ne | avtoriteta | A | route.ts:367–519 |
| 5 | `api/itinerary/ask/route.ts:187` | Q&A o načrtu (fraziranje dejstev) | OR→Gem→Put→z-ai | OR/Gem/Puter | deterministična pot PRIMA (`answerPlanQuestion`, 116); AI le za neprepoznane namene; fallback = iskren „ne morem odgovoriti, ne bom ugibal" (214) | `maxTokens` 1024, `reasoningEffort:"low"`; brez hard cap (privzeti 150 s budget) | ne | svetovalna | B/C | route.ts:107–146, 209–218 |
| 6 | `api/itinerary/ingest/route.ts:277` | URL ingest (Start Anywhere) | NOČ — `matchDestinationsInText` | — | popolnoma deterministično (fetch 8 s, SSRF varovalke) | 0 AI; 422 ob 0 zadetkih | ne | svetovalna (predlog vnosa) | A | route.ts:277–299 |
| 7 | `api/itinerary/ingest-image/route.ts:132` | VLM ekstrakcija imen s slike | **Gem→z-ai VLM** (OR ne podpira vision) | Gem | `null` → **502** „AI storitev trenutno ni dosegljiva" (138–149); ujemanje ostaja deterministično (159) | 45 s VLM timeout (ai-client:741); strog ekstraktor prompt (54–66) | ne (slika v pomnilniku) | svetovalna | B (fallback MANJKA) | route.ts:138–149 |
| 8 | `api/itinerary/ingest-pdf/route.ts:109` | PDF ingest | NOČ — unpdf | — | popolnoma deterministično; skeniran PDF → 426 → 422 z nasvetom „Slika" (124–134) | 0 AI; meji 60 strani/6 MB | ne | svetovalna | A | route.ts:99–148 |
| 9 | `api/itinerary/ingest-pins/route.ts:57` | Google pins ingest | NOČ — `ingestPins` | — | popolnoma deterministično (ime/koordinate ≤ 25 km) | 0 AI | ne | svetovalna | A | route.ts:57–88 |
| 10 | `api/journey/bookings/parse/route.ts:127,180,212` | rezervacije: slika (VLM) / PDF+besedilo (LLM) ekstrakcija | Gem→z-ai VLM / OR→Gem→Put→z-ai | Gem/OR/Puter | `null` → **502** „vnesi rezervacijo ročno" (132–140, 193–201, 225–233); `persisted:false` — zapis ZAHTIJE uporabnikovo potrditev v `/import` | 45 s vision; `normalizeParsedReservation` striže/kapira/validira ceno — AI izhod ni zaupan (komentar 21–29) | ne (stateless) | svetovalna (DRAFT do potrditve) | B (fallback MANJKA, ročna forma je alternativa) | route.ts:19–37, 252–254 |
| 11 | `api/smart-search/route.ts:169` | NL iskanje po platformi | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → **keyword fallback** `fallbackSearch` (224), `source:"fallback"`, iskren summary (288) | hard cap 15 s (166–184); ID-ji filtrirani proti DB ID-jem (195–212) — halucinirani ID-ji odpadejo | ne | svetovalna | C | route.ts:220–291 |
| 12 | `api/chat/route.ts:314` | klepetalnik „Slovenija AI" | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → **`buildDomainFallbackAnswer`** — deterministična domenska plast iz REALNIH podatkov (baza+OSM+Open-Meteo), `source:"fallback"` | **BREZ hard cap** — privzeti 150 s budget verige; klientni fetch brez AbortController (chatbot.tsx:931) | ne | svetovalna | C | route.ts:382–464 |
| 13 | `api/ask-local/route.ts:257` | „Vprašaj lokalca" grounded Q&A | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → `buildFallbackAnswer` iz ISTEGA konteksta baze (271–279), `answerSource:"fallback"` | brez hard cap (150 s) | **DA**: `LocalQuestion` (answer, answerSource, recommendedPartners) — javni social proof, iskreno označen; `recommendedPartners` ekstrahiran LE iz konteksta (286) | svetovalna (persistirana) | C | route.ts:271–310 |
| 14 | `api/translate/route.ts:85` | prevodi UI nizov (dev orodje) | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → vrne ORIGINAL kot „prevod", `source:"fallback"` (118–131) | `jsonMode`; brez hard cap | ne | svetovalna (dev) | C | route.ts:118–131 |
| 15 | `api/ai-insights/route.ts:269` | admin/owner poslovni vpogledi | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → `generateFallbackInsights` — deterministična pravila nad statistiko (300–309) | `jsonMode`; validacija tipov/enumov (283–291); brez hard cap | ne | svetovalna | C | route.ts:300–377 |
| 16 | `api/ai-story/route.ts:57` | zgodba lokalca (owner) | OR→Gem→Put→z-ai | OR/Gem/Puter | `null`/slab JSON → echo opisa (79–84) | kapiranje izpisa (69–75) | ne | svetovalna | C | route.ts:79–84 |
| 17 | `api/pois/describe/route.ts:173` | 1-vrstični opis POI | OR→Gem→Put→z-ai | OR/Gem/Puter | prazen izhod → „`{name} — {category} v Sloveniji.`" (194–197) — **in se fallback ZAPIŠE v trajni file cache** (201–207) | kap 150 znakov (190) | DA: `data/poi-descriptions.json` (trajno, brez TTL) | svetovalna | C | route.ts:186–233 |
| 18 | `api/owner/auto-tag/route.ts:119` | predlog kategorije/tagov | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → `fallbackTag` keyword matching (170–176) | validacija proti enumom (136–157) — neveljavno → privzeto | ne (samo predlog UI) | svetovalna | C | route.ts:170–243 |
| 19 | `api/admin/approve/[id]/route.ts:272` | enrichment ob odobritvi (SEO tagi) | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → tiho preskoči (280) — odobritev NI odvisna | `jsonMode`; tagi striženi, dedupe, kap 15 | **DA**: `Listing.specialties` (AI tagi merge, 297–305) — brez admin review | svetovalna (v iskalne tage) | C | route.ts:253–308 |
| 20 | `api/itinerary/save/route.ts:79,119` | persistenca načrta | NOČ (validacija) | — | n/a | `sanitizeItinerary` + `revalidateSavedItinerarySupply` PRED pisanjem | DA: `SavedItinerary` | avtoriteta (kanonično sanitizirano) | A | save/route.ts:79–119 |
| 21 | `lib/ai-recommendations.ts:698,753` | kuracija priporočil tržnice (4 od 10) | OR→Gem→Put→z-ai | OR/Gem/Puter | `null`/slab JSON → SQL top-4 + `deterministicWhy` (725–734, 780–789), `whySource:"deterministic"` | `containsInventedClaims()` filter — why vrstica samo iz podatkov prompta; cache 24 h (memory+file) | DA: `data/ai-rec-cache.json` (24 h) | svetovalna | C (z B-grade fallbackom) | ai-recommendations.ts:725–789 |
| 22 | `lib/consultation-engine.ts:413` | plačljiva konzultacija | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → `buildFallbackConsultation` izključno iz baze (427–430) | brez hard cap | **DA**: `Consultation.answer` + `answerSource` | svetovalna (persistirana) | C | consultation-engine.ts:409–431 |
| 23 | `lib/seo-faq.ts:98` | FAQ za SEO strani | OR→Gem→Put→z-ai | OR/Gem/Puter | `null` → generične FAQ (139–147) — **in se zapišejo v 90-dnevni cache** | `jsonMode`; kap 4×150/300 znakov | DA: `data/seo-faq-cache.json` (90 dni) | svetovalna (SEO) | C | seo-faq.ts:135–148; klic iz SSR: `destinacija/[slug]/things-to-do/page.tsx:136` |
| 24 | `lib/tts-engine.ts:163` (ruti `/api/tts`, `/api/itinerary/tts`) | TTS zvok (dan / cel načrt) | **SAMO z-ai SDK** | — (platformski) | SDK odpoved → tipizirana napaka → **503/502** iskreno (tts/route.ts:164; itinerary/tts:196–226) — ni drugega vira, ni fallback zvoka | pravi timeout 30 s/klic (185–196); RIFF validacija (`invalid_wav`) | ne (pomnilniški LRU 32 MB, no-store) | svetovalna | C (nepreverjeno v produkciji) | tts-engine.ts:220–261 |
| 25 | `api/ai-health/route.ts:31` | health sonde 4 providerjev | vsi | vsi | poroča `active:"none"` → `status:"down"` | 12/10 min rate limit + cron/admin avtorizacija | ne (AIUsageLog reset breakerja) | observabilnost | — | ai-health/route.ts:20–43 |

Klientne površine (vse prek zgoraj naštetih API-jev, 0 direktnih LLM klicev v brskalniku — dokaz: edini `z-ai-web-dev-sdk` uvoz v klientnem grafu ne obstaja; TTS/LLM uvozi so samo v strežniških libih): `chatbot.tsx` (FAB widget, ob napaki `offlineFallback` sporočilo — chatbot.tsx:984–991), `plan-copilot.tsx` (opcijska kartica, toast ob napaki — 201–215), `smart-search.tsx` (dialog), `ask-local.tsx`, `ai-story.tsx` + `owner/auto-tag-button.tsx` (owner pano), `supply/product-modal.tsx` (lazy POI opis), `itinerary-audio.tsx` + planner D2 gumb (TTS), `admin-dashboard.tsx` (AIUsageLog agregati + ai-insights), `hero-quick-input.tsx` (prosto besedilo → **deterministični** `parseQueryToPlannerInput`, itinerary-planner.tsx:318–387 — 0 AI). Glasovni klepet = Web Speech API brskalnika (0 strežniškega AI).

**Razredi A — jedro:** razdalje/urniki (OSRM noge + `repairScheduleGaps`), geo urejanje (`geo-order`, `route-order`, `markItineraryIntentLocked`), zaprtja (`deterministic-itinerary.ts:207–248`, `opening-hours.ts`), vreme (`enrichWithRealWeather` — Open-Meteo prepiše AI izhod ali `weatherEstimated:true`, route.ts:1093–1166), aritmetika proračuna (`recomputeTotalBudget` + `computeBudgetValidation` — AI `total_budget` se IGNORIRA in preračuna, route.ts:950–964), DB mutacije (save sanitizira), permissions (`auth-guards`), validacija (`itinerary-sanitize`, `supply/*`), rezervacijski lifecycle (parse je stateless, zapis zahteva potrditev), revizije (`trip-revisions-migration`) — **noben AI klic teh ne dotika** (dokaz: `generateCompletion` se ne pojavlja v nobeni od teh datotek).

## Zlati sledi (golden traces)

### Sled 1 — `POST /api/itinerary` z VSAKIM AI env odstranjenim → **DETERMINISTIC OK**

1. `route.ts:189` rate limit → validacija vnosa (196–304; `days`/`season`/`budget`/`groupSize` enumi in range).
2. `route.ts:395–412` vzporedno: ranking (preskočen za `engine:"deterministic"`), `fetchAnchorForecasts` (Open-Meteo, nikoli ne vrže), `fetchAiSupplyContext` (nikoli ne vrže).
3. `route.ts:435` `verifySelectedProducts` — klientova izbira overjena proti KT datasetu.
4. **Razcep**: `engine === "deterministic"` → `route.ts:541` takoj `buildDeterministicPlanResponse(…, "deterministic")` — 0 žetonov, 0 promptov (dokaz koment. 532–539).
5. `engine === "auto"` (privzeto, klient: itinerary-planner.tsx:1328) → `route.ts:801` `generateCompletion` z `timeoutMs:65s, totalBudgetMs:70s` + zunanji `Promise.race` 70 s (798–832). Brez ključev: OpenRouter/Gemini/Puter `not-configured` (ai-client:418/496/549), z-ai noga pod `MIN_LEG_MS` ali SDK napaka → **vrne `null` v milisekundah** (ali najkasneje po z-ai timeoutu) → `route.ts:835` `throw "Prazen odgovor AI"` → `catch` (1053) → `buildDeterministicPlanResponse(…, "fallback")`.
6. `buildDeterministicPlanResponse` (1186–1400): `generateDeterministicItinerary` (1221) → `enrichWithRealWeather` → `validateItinerarySupply` (FIXED izbire vstavljene) → `buildLegRouteIndex` (OSRM) → `repairScheduleGaps` → kvaliteta/geo-validacija/razlage/geometrija → `logAIUsage(source:"fallback")` → 200 z `source:"fallback"`.

**Verdikt: DETERMINISTIC OK.** Uporabnik Z VEDNO dobi uporaben načrt (source pošteno razkrit). Časovnica: brez ključev ~trenutek (vsi `not-configured`, z-ai hitro odpove); z obešajočim providerjem ≤ 70 s + ~2–5 s gradnje < 90 s klientni abort (itinerary-planner.tsx:1344–1358, TASK 77).

### Sled 2 — `POST /api/itinerary/refine` → **FALLBACK EXISTS (poštena degradacija, ne tiho)**

1. Hitra akcija (`action` + `day`): `route.ts:377` `applyQuickAction` — **deterministično PRIMA, catch veja zanjo nedosegljiva** (dokaz koment. 963–966). 0 LLM.
2. Prosti jezik: `route.ts:749` AI veriga, hard cap 60 s (746). Brez ključev → `null` → throw (768) → catch (960): `validateItinerarySupply(current)` (TASK 50 §10 — klientov načrt gre skozi ISTO integritetno plast: fabricated cene popravljeni/odstranjeni), `repairScheduleGaps`, sveža geo/budget validacija → **vrne originalni načrt** + `warning: "AI posodobitev ni uspela — prikazan je originalni itinerer."` (1071–1073) + `source:"fallback"`.

**Verdikt: FALLBACK EXISTS.** Ukaz se NE izvede (pošteno sporočeno); načrt ostane intact. Opomba: to je degradacija, ne enakovredna zamenjava — edina „izvedba" ukaza brez AI so hitre akcije.

### Sled 3 — Start Anywhere (4 vnosi) → mešano

| Vnos | Pot | Brez ključa | Verdikt |
|---|---|---|---|
| **Besedilo** (hero „Kaj želiš doživeti?") | sessionStorage `heroQuery` → `parseQueryToPlannerInput` (itinerary-planner.tsx:318) → `/api/itinerary` | ključne besede SL+EN → interesi/dni/skupina/sezona/tempo — 0 AI | **DETERMINISTIC OK** |
| **URL** | `/api/itinerary/ingest` → fetch (8 s, SSRF) → `htmlToText` → `matchDestinationsInText` (url-ingest.ts) | 0 AI; 0 zadetkov → iskren 422 | **DETERMINISTIC OK** |
| **PDF** | `/api/itinerary/ingest-pdf` → unpdf `extractText` → isto ujemanje | 0 AI; skeniran PDF → 422 z nasvetom zavihek Slika | **DETERMINISTIC OK** |
| **Slika/screenshot** | `/api/itinerary/ingest-image` → `generateVisionCompletion` (Gem→z-ai) → `matchDestinationsInText` | vision `null` → **502** (route.ts:138–149); ujemanje s sliko ni mogoče brez VLM | **HARD DEPENDENCY** (iskrena napaka; ostali zavihki delujejo) |

Pins (Google Takeout/KML/besedilni seznam): `/api/itinerary/ingest-pins` → `ingestPins` — 0 AI, **DETERMINISTIC OK**.

### Sled 4 — `/api/smart-search` in `/api/chat` (chatbot) → **FALLBACK EXISTS** (z latenco opombo)

- **smart-search**: DB kontekst (top 15/kategorijo) → AI (hard cap **15 s**, route.ts:166) → validacija ID-jev (195–212). Brez ključev → `fallbackSearch` keyword iskanje (230) z iskrenim summary-jem „AI razumevanje trenutno ni odgovorilo" (288). Odgovor pride VEDNO (< ~16 s).
- **chat**: kontekst iz baze + STO grounding (leksični RAG) + OSM kraji → AI (route.ts:314, **brez hard cap** — privzeti 150 s budget). Brez ključev → `buildDomainFallbackAnswer` (396) — odgovor iz realnih vrstic baze/OSM/vremena, pošteno „AI trenutno ni dosegljiv". Klient ob napaki strežnika pokaže `offlineFallback` (chatbot.tsx:984).
- **CHAT ODGOVOR (AI ali fallback) NI pogoj za prikaz NIČESAR** — widget je FAB gumb; jedro strani se izriše brez njega.

### Sled 5 — klientne komponente → **DETERMINISTIC OK (vse AI površine so opcijske)**

Nobena komponenta ne zahteva AI odgovora za izris jedra: planner forma, zemljevid, destinacije, tržnica, MY TRIP, bookings — vsi berejo deterministične podatke. AI površine: chatbot (FAB), plan-copilot (kartica v plannerju — izrisana je, a prazna s predlogi vprašanj, brez omare), smart-search (dialog), TTS gumbi (ob napaki iskrena opomba, gumb onemogočen), ai-story/auto-tag (owner panoji), POI opis (lazy, fallback ena vrstica). `hero-quick-input` je 0-AI. Demo praznega stanja plannerja je Statičen DEMO_PREVIEW (itinerary-planner.tsx:400–414) — ne AI.

### Sled 6 — `src/lib/deterministic-itinerary.ts` → **DETERMINISTIC OK (produkcijska pot, NE samo testi)**

Pokritost motorja (`generateDeterministicItinerary`, vrstica 167–494): izbor destinacij (sezonski filter, mesečna F5.5 + tedenska §10 zaprtja z fail-closed izločitvijo, ocena interesov + `preferredDestinations` pohitritev +2,5, `partyType` pohostnitev, budget-aware izbor z dnevnim obnovljivim proračunom, deževna logika → indoor tipi), geografsko urejanje okoli FIXED sidrov (`orderAroundAnchors`, TASK 51), drive-aware sloti (`nextSlot`, TASK 50), tempo (`PACE_FALLBACK`), cene/notes/jezik (SL/EN), priporočila/tips. **Invociran v produkciji**: naravna pot route.ts:1220–1229 (`engine:"deterministic"`) in fallback pot route.ts:1059→1220 (vsak AI padec). Testna čistost (0 uvozov ai-client/SDK, 0 ure/omrežja) je varovana v `task100-deterministic-engine.test.ts:411`.

## Fail-open analiza

| Klic (datoteka) | Provider obeša (timeout) | Garbage JSON | Halucinirani podatki | Doseže DB/zemljevid? |
|---|---|---|---|---|
| itinerary:801 | ≤ 70 s (race) → fallback motor | `JSON.parse` throw → fallback; `sanitizeItinerary` clampa; prazni dnevi → fallback (905) | supply refi: `revalidateSupplyStops` ODSTRANI neznane (858–864); cene → kanon (Task 48/49); vreme → Open-Meteo prepiše ali `weatherEstimated`; budget → preračun; urnik → repair ali ERROR flag | ja, a SAMO prek save (sanitize+revalidate); zemljevid risa kanonične koordinate |
| refine:749 | ≤ 60 s → echo originala | throw → echo; sanitize; FIXED reinsert | isto + `reinsertFixedFrom:"current"` — AI ne more zbrisat FIXED | ne (klientni store; save spet sanitizira) |
| smart-search:169 | ≤ 15 s → keyword | throw → keyword fallback | ID filtriran proti DB — halucinirani ID-ji padli | ne |
| chat:314 | **do ~150 s** → domenska plast | throw → domenska plast | citati [n] → `citedIdx` filter 1..hits.length (338–342) — izven range pade; imena → pins SAMO iz `matchDestinationsInText`/OSM | ne |
| ask-local:257 | do ~150 s → fallback iz baze | n/a (prost tekst) | `recommendedPartners` ekstrakcija SAMO iz konteksta (286) | **ja — LocalQuestion (javno)**, a grounded + `answerSource` |
| bookings/parse:127/180/212 | vision 45 s → 502 | `normalizeParsedReservation` striže/kapira; `needsConfirmation` (156) | polja izven dokumenta ostanejo null (prompt pravila) | **NE — `persisted:false`, zapis šele prek `/import` po potrditvi** |
| ingest-image:132 | 45 s → 502 | n/a (ekstraktor imen) | ujemanje `matchDestinationsInText` — izmišljena imena se NE ujemajo → 422 | ne |
| ai-recommendations:698/753 | do ~150 s → SQL top-4 | `parseSelection` vrne null → fallback | `containsInventedClaims()` zavrne why z izmišljenimi polji; izbor ID-jev validiran | cache file (24 h, fallback tudi — ok) |
| seo-faq:98 | do ~150 s → generične FAQ | throw → fallback FAQ | FAQ vsebina je splošna, kapirana | **ja — 90-dnevni file cache (tudi fallback!)** |
| pois/describe:173 | do ~150 s → ena vrstica | prazno → fallback string | ime/kategorija iz prompta, kap 150 | **ja — trajni file cache (tudi fallback, brez TTL)** |
| admin/approve:272 | do ~150 s → tiho preskoči | throw → brez enrichmenta | **tagi (prosti nizi) se zapišejo v `Listing.specialties` brez review** | **ja** |
| TTS (tts-engine) | 30 s/klic → 502/503 | `invalid_wav` → 502 | n/a (vhod je strežniško zgrajen skript) | ne |

Sklep fail-open: **nobena halucinirana številka ne postane kanon** (cene/urniki/vreme/proračun imajo strežniške avtoritete). Prosti tekst AI (chat, ask-local, konsultacije, story, FAQ, POI opisi, admin tagi) je edina persistirana AI vsebina — vsa razen admin tagov je grounded in pošteno označena.

## Ugotovljene vrzeli

1. **[MEDIUM] Vision poti brez determinističnega fallbacka** — `ingest-image/route.ts:138–149` in `journey/bookings/parse/route.ts:132–233`: brez GEMINI_API_KEY (in brez delujočega z-ai VLM v produkciji) javna funkcija „Začni s sliko" VEDNO 502, parse rezervacij (tudi PDF-besedilo in prilepljeno besedilo!) VEDNO 502. Napake so iskrene, a je funkcionalnost mrtva. Zakaj šteje: Issue #5 zahteva B z realnim fallbackom; za bookings/parse bi šel napisati deterministični parser pogostih potrdil (regex za Booking.com/GetYourGuide/Viator/Viator številke, zneski, datumi) z `needsConfirmation:true` kot zadnja plast.
2. **[MEDIUM] TTS enojni vir (z-ai SDK) brez verige in brez fallbacka** — `tts-engine.ts:163`: edini AI klic v projektu, ki nima OR/Gem/Puter alternativ; produkcijska zanesljivost `ZAI.create()` izven z.ai sandboxa je nedokazana. Odpoved → 502/503 (iskreno, D2/TASK 89 gumb se pošteno onesposobi). Zakaj šteje: „Poslušaj svoj načrt" je marketinško izpostavljena funkcija; priporočilo — bodisi dodati OpenAI-compat TTS nogo bodisi v dokumentaciji razglasiti TTS kot sandbox-only.
3. **[MEDIUM] Neenotne trde meje AI faze na 11 od 19 klicev** — hard cap imajo SAMO itinerary (70 s), refine (60 s), smart-search (15 s) (K-4/K-5). Brez: chat (route.ts:314), ask-local (257), translate (85), ai-insights (269), ai-story (57), pois/describe (173), owner/auto-tag (119), admin/approve (272), ai-recommendations (698/753), consultation-engine (413), seo-faq (98) — vsi tečejo na privzetem `TOTAL_CHAIN_BUDGET_MS` 150 s, klientni chatbot fetch pa NIMA AbortControllerja (chatbot.tsx:931). Živ dokaz iz K-4/K-5 (2026-09-24: refine 262 s, search >400 s) se lahko ponovi na chatu. Zakaj šteje: uporabnik klepetalnika lahko čaka ~2,5 min pred fallbackom.
4. **[LOW] seo-faq AI klic znotraj SSR rendera** — `destinacija/[slug]/things-to-do/page.tsx:136` ob cache miss (prvi obisk / 90 dni potek / nova destinacija) blokira izris strani do 150 s in z doomed chain poskusom brez ključev; fallback FAQ se nato zapiše v 90-dnevni cache (seo-faq.ts:139–147) — degradirana vsebina se potem servira 3 mesece. Svetujem stale-while-revalidate ali build-time generacijo.
5. **[LOW] pois/describe trajno cachira fallback vsebino** — route.ts:216–233: „`{name} — {category} v Sloveniji.`" se zapiše v `data/poi-descriptions.json` brez TTL; po dodatvi ključev ostane izrodek, dokler se cache ne pobriše ročno.
6. **[LOW] Dnevna kvota ask-local se porabi tudi ob fallbacku** — route.ts:204–219 + 296: `usedToday` šteje VSE `LocalQuestion` vrstice; obiskovalec brez AI dobi en „prosti" odgovor — ki je fallback — in je za danes izčrpan. Iskrenost bi zahtevala, da fallback ne požre kvote (ali vsaj UI to pove).
7. **[LOW] admin/approve zapisuje AI tage brez review** — route.ts:297–305: `aiTags`/`keywords` merge v `Listing.specialties` (kap 15) direktno iz AI JSON; haluciniran tag se tiho persistira. Majhna površina (iskalni tagi), a je edini ne-reviewed AI→DB zapis.
8. **[LOW] Zastarela javna izjava o viru AI** — `i18n/messages/sl.json:832` + `en.json:832` („AI načrtovalec uporablja z-ai-web-dev-sdk") in `vir-podatkov/page.tsx:71`: veriga je od 1.14.0 OpenRouter→Gemini→Puter→z-ai. Potrošniška stran „kako deluje" laže o primarnem viru (docs poštenost je sicer blagovna znamka projekta).
9. **[INFO] `config:secrets` ne preverja AI ključev** — instrumentation.ts:47–75 preverja samo CRON/NEXTAUTH placeholderje. Skladno z dizajnom (brez ključa = pošten fallback), detektor je cron-gated `/api/ai-health` — a na RENDERU brez ključev NI nobenega signala v `/api/health`, da je produkt v degradiranem načinu. Svetujem informativen (ne-fail) korak `config:ai-keys` z detail seznamom konfiguriranih providerjev.

Ni najdenih BLOCKER-jev.

## Sklepi

**Jedro izdelka Z brez AI ključi DELUJE.** To ni reklama — sled 1 dokazuje: `/api/itinerary` z odstranjenimi OR/Gem/Puter env vrne popoln, obogaten, validiran načrt (`source:"fallback"`), ker `generateCompletion` vrača `null` in vsak klicatelj ima lasten deterministični nadomestek. Hitre akcije refina, plan Q&A nameni, hero besedilni parser, URL/PDF/pins ingest, celoten Class A sloj (razdalje, urniki, zaprtja, vreme, proračuni, supply resnica, save/rezervacije/revizije) so 0-žetonni po konstrukciji in to je testno varovano (`task100-deterministic-engine.test.ts:411`, `fa-acceptance-fixes.test.ts:138`).

**Kaj se POKVARI brez ključev (iskreno, ne tiho):** slika-ingest (502), parse rezervacij iz dokumentov (502 — ročna forma ostane), TTS (502/503 — odvisen od z-ai SDK, ki v produkciji ni dokazan), prosta-jezikovni refine (original + opozorilo), NL razumevanje iskanja (keyword iskanje), klepet (domenska plast iz realnih podatkov). Vse je razkrito z `source:"fallback"` / `via` / `answerSource` — tihega pokvarjenosti (silent breakage) na teh poteh ni.

**Kje so RES laži (pri vsaj enem ključu oz. vedno):** AI vreme v JSON se prepiše (dobro); AI `total_budget` se preračuna (dobro); AI prosti tekst (chat/ask-local/story/FAQ/POI/tagi) je brez številske revalidacije — a je svetovalne narave in (razen admin tagov) grounded. Perzistentna slabost: fallback vsebina se cachira (seo-faq 90 dni, poi-descriptions trajno) — „degradirano" se pretvarja, da je „končno".

**Prioritete za Issue #5 Fazo 3 naprej:** (1) deterministični parser rezervacij kot B-fallback; (2) hard cap ~15–30 s na preostalih 11 klicev (kopiraj K-5 vzorec `Promise.race`); (3) odločitev o TTS viru v produkciji; (4) cache revizija: fallback zapisi naj nosijo TTL/oznako za rebuild; (5) informativen health korak o AI ključih.
