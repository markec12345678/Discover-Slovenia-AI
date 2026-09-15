# Changelog

Vse pomembne spremembe projekta Discover Slovenia AI (prej I Feel Slovenia).

Format temelji na [Keep a Changelog](https://keepachangelog.com/slo/1.1.0/),
in projekt sledi [Semantic Versioning](https://semver.org/lang/sl/).

---

## [1.15.0] — 2026-09-16

### Dodano (1.15.0 — F11 SKUPINSKE ANKETE BREZ RAČUNOV + VERCEL ŽIVO)

> Zadnja nerešena točka iz naročila 1.14.0 ("NERESENO: F11 skupinske
> ankete — MindTrip vrzel #2") + uporabnik je priskrbel VERCEL_TOKEN:
> sklep 1.14.0 ("namestitev avtomatizirana do meje uporabnikovih žetonov")
> je postal zastarel — žetoni so zdaj na voljo, ključi so ŽIVO potisnjeni
> na Vercel. Vrzel #2 iz sekcije 10 COMPETITIVE-ANALYSIS je zaprta.

- **F11: Skupinske ankete na deljeni povezavi (`/pot/[shareId]`) — brez
  računov.** Poljubno vprašanje (2–200 znakov) + 2–6 možnosti; en glas na
  obiskovalca (anonimni clientId iz localStorage — ENAKA identiteta kot
  glasovanje za lokacije, všečki in komentarji); prestavitev glasu (zadnji
  klik velja — upsert na `unique([pollId, voterId])`); rezultati živi
  (odstotki + števci + progress fill, moj glas označen); avtor ankete
  (authorClientId — isti brskalnik) jo lahko zaključi (409 za kasnejše
  glasove), znova odpri ali izbriše (403 za ostale).
- **`prisma/schema.prisma` — 2 nova modela:** `TripPoll` (vprašanje,
  options kot JSON string, authorName opcijsko, authorClientId, closed) +
  `TripPollVote` (optionIdx; unique(pollId, voterId) = 1 glas; cascade
  delete z anketo). `db:push` izveden.
- **`src/app/api/poll/route.ts`** (GET/POST/PATCH/DELETE, rate-limit,
  validacija vseh mej, max 10 odprtih anket/trip) **+
  `src/app/api/poll/vote/route.ts`** (POST — upsert/prestavitev glasu,
  409 na zaključeni anketi). Kontrakt preizkušen s curl 12/12: create →
  vote → prestavi (total ostane 2) → 403 ne-avtor PATCH/DELETE → zaključi
  → 409 glas → znova odpri → izbriši (glasovi kaskadno pobrisani).
- **`src/components/trip-polls.tsx`** — TripPolls panel: obrazec z
  dinamičnimi možnostmi (dodaj/odstrani do 6), ime se zapomni (skupno s
  komentarji), optimistično glasovanje z revertom, slovenske oblike
  (ednina/dvojina/množina: "1 glas", "2 glasa", "5 glasov"), relativni
  čas s sanity capom. Integriran v `/pot/[shareId]/page.tsx` (RSC
  začetno stanje brez myVote — dopolni se na klientu z voterId; med
  TripGuide in TripSocial). Ne tiska se (print:hidden).
- **E2E v brskalniku (agent-browser) 10/10:** hidracija (717 fiberjev —
  odkrit in oboden agent-browser quirk: navigacija v isti seji v dev
  načinu pusti HMR runtime v čudnem stanju, svež brskalnik hidrira
  pravilno), ustvari anketo prek UI (+toast), glasuj (števec "1 glas"),
  prestavi glas, zaključi ("Zaključena" badge + onemogočene možnosti),
  znova odpri, glas preživi ponovni nalagalnik, izbriši (prazno stanje),
  390 px BREZ prekrivanja (VLM potrditev posnetka), 0 konzolnih napak.
- **VERCEL_TOKEN (uporabnikov) — zadnja "ročna" meja odstranjena.**
  `scripts/ops/vercel-env-set.sh` živo uporabljen: GEMINI_API_KEY +
  OPENROUTER_API_KEY potisnjena na projekt `i-feel-slovenia`
  (production + preview + development, encrypted); opuščena
  VITE_GEMINI_API_KEY (stari client-side pristop, omenjena le v komentarju
  ai-client.ts) izbrisana. ENV se uporabi ob naslednjem deployu — ta
  push ga sproži; health na produkciji naj preklopi iz `provider:"none"`
  na `provider:"openrouter"`.
- **Popavek skripte:** `vercel-env-set.sh` je preverjal VERCEL_TOKEN PREJ
  kot `load_env` (iz .env) — vrstni red obrnjen; VERCEL_PROJECT_ID/
  VERCEL_PROJECT_NAME dodana v `.env` (skripte zdaj delujejo brez argumentov).

### Varnost (1.15.0)

- `authorClientId` nikoli ne zapusti strežnika v DTO (samo `isAuthor`
  boolean); PATCH/DELETE zahtevata ujemanje clientId z avtorjem (403),
  glasovi se brišejo SAMO kaskadno z anketo; vsa polja validirana
  (regex/dolžine), rate-limit na vseh 5 končnih točkah.

---

## [1.14.0] — 2026-09-15

### Dodano (1.14.0 — OPENROUTER KOT PRIMARNI AI PROVIDER + OPS SUITE)

> Uporabnik je priskrbel še OpenRouter API ključ (free tier) kot REZERVO
> oz. primarnega: "eden openrouter naj bo primarni, ostala dva ko
> routeru zmanjka" — in zahteval čim več skript + žive teste. Odgovor:
> veriga OpenRouter → Gemini → Puter → z-ai z živo izbranimi :free
> modeli + 12-skriptna DevOps suite (`scripts/ops/`), ki avtomatizira
> VSE, kar se da avtomatizirati (GitHub secreti prek sealed boxa, živi
> CI klici, Vercel/Render env set z merge zaščito, doctor revizija).

- **`src/lib/ai-client.ts` — NOVA veriga OPENROUTER → GEMINI → PUTER →
  z-ai → fallback.** OpenRouter prek OpenAI-compat API (paket `openai`
  že odvisnost — 0 novih namestitev). Deluje iz VSAJ regije (razliko od
  Gemini API, ki iz sandboxa vrača 400 geo-blok / 429 kvoto) — RAZVOJNI
  SANDBOX SEDAJ IMA ŽIVO AI POT (dokazano: health `provider:
  "openrouter"` latencija ~20 s).
- **Živo izbrani :free modeli** (testirano 2026-09-15 z realnim
  itinererJSON pozivom): primarni `nex-agi/nex-n2.5-pro:free` (čist
  JSON + odlična slovenščina — "Dnevni pobeg na Bled", 436 žetonov),
  notranji fallback `nex-agi/nex-n2.5-mini:free`. Zavrnjeni po živih
  testih: `openrouter/free` auto-router (izbral content-safety
  klasifikator — nepredvidljivo), `google/gemma-4-*:free` (geo-blok —
  OR posreduje lokacijo odjemalca Google AI Studiu),
  `google/gemini-2.5-flash:free` (umaknjen, 404), `z-ai/glm-5.2:free`
  (provider error), `nemotron-3-super/ultra` (leaka razmišljanje v
  vsebino + overload). VISION na :free NEDELJUJE (vsi vision modeli →
  provider error) — F8 slikovni vnos ostaja na Gemini → z-ai verigi.
- **DNEVNA MEJA free tierja (~50 zahtev/dan brez kredita)** — živo
  odkrita med E2E testom (429 `free-models-per-day`): aplikacija se
  ravna NATANKO po uporabnikovi naročbi — "ostala dva, ko routeru
  zmanjka": veriga pošteno pade na Gemini (produkcija US/EU) ali z-ai
  (sandbox), končno determinističen fallback (E2E dokazano: fallback
  itinerer se izriše). Documented tudi izhod: $10 kredita odpre
  1000/dan.
- **Circuit breaker za OpenRouter** (3 napake → 5 min odmora, health
  resetira) + atribucijska glavi `HTTP-Referer`/`X-Title` (uradna OR
  priporočila). Health (`/api/ai-health`) zdaj poroča po VSEH štirih
  providerjih.
- **`scripts/ops/` — 12-skriptna DevOps suite** (+ README s tabelo,
  varnostjo in iskrenim "česa skripta ne more"): `lib.sh` (skupni
  helperji, maskiranje tajnosti), `openrouter-verify.sh` (4 živi testi),
  `gemini-verify.sh` (poštena interpretacija geo-bloka 400/429),
  `github-secret-set.sh` (libsodium sealed box — UPORABljENO za novi
  secret OPENROUTER_API_KEY), `github-secret-verify.sh`,
  `github-workflow-run.sh` (dispatch + poll + koraki jobov),
  `vercel-env-set.sh` (idempotenten upsert na 3 environmente),
  `render-env-set.sh` (MERGE ZAŠČITA — Render PUT nadomesti celoto,
  skripta prebere obstoječe in pošlje spojeno), `dev-health.sh`,
  `deploy-check.sh`, `doctor.sh` (8-plastna revizija),
  `setup-all.sh` (orkester).
- **`.github/workflows/ai-smoke.yml`** — nov job `openrouter` (key-info
  veljavnost, chat, jsonMode, sonda fallback mini) pred gemini jobom;
  429 `free-models-per-day` se obravnava POŠTENO (opozorilo — ključ je
  dokazano veljaven prek key-info 200 + živih dokazov, ne napaka).
- **Env/docs**: `.env` + `.env.example` (OPENROUTER sekcija z navodili
  za pridobitev/nastavitev + realne omejitve free tierja),
  `docs/DEPLOYMENT.md` (matrika: primarni OR / sekundarni GEMINI /
  terciarni PUTER), `SECURITY.md` (ključ nikoli v repu, maskiranje,
  sealed box), CHANGELOG.
- **E2E verifikacija**: generacija itinererja skozi celo verigo v
  brskalniku — po izčrpani dnevne kvote se iskreno izriše fallback
  itinerer (0 napak); `/api/ai-health` javi `openrouter` aktivega;
  OpenRouter full verify (4/4 testi) zelen iz sandboxa.
- **CI ai-smoke run #4 (2026-09-15, 15:31Z): ZELEN** — OpenRouter job:
  key-info 200 (free_tier=true), chat/jsonMode 429 dnevna meja →
  iskrena opozorila (korak NEODVISNO zelen); Gemini job: chat 200
  »SLOVENIJA-OK« (živi dokaz), jsonMode/vision 429 (RPM/kvota po
  današnjih testih) → retry po 20 s → opozorila. Popravljeni vzroki
  run #3: bash past `$10` → `$1` (unbound variable) in manjkajoči RPM
  premori med koraki (429 pri dveh klicih 200 ms narazen).

### Popravljeno

- Health ruta: skripte/README uporabljajo pravilen `/api/ai-health`.
- `plan-copilot.tsx`: vir AI odgovora razširjen z `"openrouter"`
  (badge enak kot ostali AI providerji — "AI · samo fraziranje dejstev").

---

## [1.13.0] — 2026-09-16

### Dodano (F10 — PRODUKCIJSKA AI PLAST: Gemini v verigi providerjev)

> Uporabnik je priskrbel brezplačni Google AI Studio ključ (velja do
> pridobitve uporabnikov) in zahteval profesionalno vgradnjo povsod —
> koda, GitHub, Vercel/Render env. Odgovor: enotna provider veriga v
> `src/lib/ai-client.ts`, ki jo sedaj deli VSAH 15+ AI poti projekta
> (generacija itinererja, refine, ask, chat, nasveti, prevodi, auto-tag,
> SEO FAQ, konzultacije …) + živi test ključa iz GitHub runnerja (US —
> podprta regija; sandbox razvoj je geo-blokiran, iskreno spodaj).

- **`src/lib/ai-client.ts` — veriga GEMINI → PUTER → z-ai-sdk → fallback**:
  Gemini prek OpenAI-compat končne točke
  (`generativelanguage.googleapis.com/v1beta/openai/`) — paket `openai`
  je ŽE odvisnost projekta, nič novega se ne namesti; isti vmesnik, isti
  tipi, podpira tudi `image_url` (vision). Privzeti model
  `gemini-3.6-flash` (Google 2026 je umaknil `gemini-2.5-flash` za nove
  uporabnike — odkrito z živim 404 odgovorom; preglasi se z
  `GEMINI_MODEL`).
- **CIRCUIT BREAKER** (Gemini): 3 zaporedne napake → 5 minut odmora —
  geo-blokirana/nedosegljiva regija NE obdavči vsakega klica z zamudo.
  Uspešen health check breaker pošteno RESETIRA (detektor okrevanja).
- **`generateVisionCompletion()`** (ista datoteka): vision veriga Gemini
  (image_url) → z-ai VLM. F8 slikovni vnos dobi PRODUKCIJSKO pot (prej:
  samo z-ai VLM, ki sandboxa zunaj ne obstaja).
- **`POST /api/itinerary/ingest-image`**: uporablja novo vision verigo;
  odgovor sedaj razkrije `via: "gemini" | "z-ai-sdk"` (kdo je bral sliko)
  — UI pokaže amber badge z providerjem (novega i18n ključa
  `planner.ingestImageMethodVia` SL+EN). Ujemanje destinacij ostaja
  DETERMINISTIČNO (nezadeto).
- **`GET /api/ai-health`**: pošteno poročilo PO PROVIDERJU (konfiguriran /
  živ klic / model / odzivni čas / kratek opis napake brez skrivnosti);
  `active` = prvi živ provider v verigi.
- **THINKING proračuni (naučeno iz živega testa)**: gemini-3.6-flash je
  thinking model — izhodni proračun se deli z notranjim razmišljanjem
  (izmerjeno: trivialen poziv = 154 thinking + 7 vidnih žetonov). Zato:
  tla 512 žetonov za Gemini klice v ai-client, `AI_MAX_TOKENS` v ask
  600 → 1024, vision ekstraktor 2048; `reasoning_effort: "low"` za
  mehanične naloge (health sonda, fraziranje v ask, ekstrakcija imen) —
  podprtost parametra živo preverjena.
- **PlanCopilot**: vir "gemini" dobi isti amber "AI · fraziranje dejstev"
  žeton kot puter/z-ai (širitev union tipa).
- **Env profesionalno (povsod)**: `.env` (lokalno, gitignored) +
  `.env.example` (dokumentirana sekcija GEMINI z navodili za Vercel/
  Render + varnostnim opozorilom o VITE_ legacy); **GitHub Actions
  secret `GEMINI_API_KEY`** nastavljen prek APIja (libsodium sealed box,
  nikoli v repozitoriju); **`.github/workflows/ai-smoke.yml`** — ročni
  (workflow_dispatch) živi test IZ GITHUB RUNNERJA: chat completion +
  vision image_url, natanko tisto, kar uporablja ai-client; `docs/
  DEPLOYMENT.md` matrika env posodobljena; `SECURITY.md` checklist
  posodobljen (naslednik legacy `VITE_GEMINI_API_KEY`).

### Iskrene omejitve (zapisano med verifikacijo)

- **ŽIVI test ključa IZ GITHUB RUNNERJA (US, Azure centralus): 4/4 ZELENO**
  (workflow „AI Provider Smoke Test“, zagon 2026-09-15): (1) chat completion
  HTTP 200, vsebina „SLOVENIJA-OK“, usage 16+7/177 (thinking 154);
  (2) jsonMode `response_format` HTTP 200 z veljavnim JSON — generacijske
  rute so na Geminiju VARNE; (3) vision `image_url` HTTP 200 — F8 slikovni
  vnos ima dokazano produkcijsko pot; (4) `reasoning_effort: "low"`
  PODPRT. Prvi zagon je odkril umik gemini-2.5-flash (404 za nove ključe)
  in thinking proračune (max_tokens 16 → prazna vsebina) — oba popravljena
  v istem sprintu (model 3.6 + tla 512).
- Sandbox egress (Hong Kong) je GEO-BLOKIRAN za Gemini API (veljavni
  modeli → HTTP 400 `User location is not supported`; ključ sam je
  VELJAVEN — avtentikacija uspe, seznam modelov pride skozi). Lokalna
  verifikacija zato dokazuje VERIGO in fallback: ai-health iskreno pokaže
  geo-napako, generacija pade na z-ai/determinizem (server log: „Gemini
  napaka: 400 → nadaljujemo na Puter/z-ai“ → fallback itinerer se izriše),
  ingest-image vrne iskren 502 (preverjeno v brskalniku, SL sporočilo).
- V tem sandbox oknu je bil z-ai VLM/chat še vedno 429 (rate limit
  celotnega okna, kot v F8/F9) — fallback poti so bile preverjene
  prek determinističnih plasti in živih brskalniških E2E.
- `gemini-2.5-flash` na novem ključu vrača 404 ("no longer available to
  new users") — zato je privzeti model 3.6; kdorkoli preglasi
  `GEMINI_MODEL` naj uporabi trenutno veljavno ime.

---

## [1.12.0] — 2026-09-16

### Dodano (F9 — POGOVOR Z NAČRTOM: vprašanja o načrtu, odgovori izračunani)

> Odgovor na MindTrip-ovo "chat-first" prednost (vrzel #9 iz sekcije 3
> konkurenčne analize — ⚖️ delno zaprta prek NLP hero + multi-turn
> refinerja; ta sprint doda manjkajočo Q&A plast). Sveža spletna
> raziskava v tem sandbox oknu NI bila mogoča (z-ai web_search 429 —
> ista storitev kot VLM prejšnje seje); analiza temelji na obstoječi
> dokumentirani raziskavi (6 poizvedb + 2 globoka branja, sekcija 1) —
> iskreno zapisano.

- **`src/lib/plan-facts.ts`** (čista funkcija): deterministični LIST
  DEJSTEV o načrtu — km/minute PO DNEVIH iz geo-validacije (ISTA plast
  kot prikaz), stroški vožnje iz `computeTripDriveCosts` (F5.3, AMZS/
  DARS), seštevki cen atrakcij, obsegi dni (vožnja + aktivnosti),
  najbolj natrpan / najlažji dan, opozorila o zaprtju (F5.5), metoda
  razdalj razkrita ("osrm" / "heuristic"). + tekstovni izpis lista za
  AI kontekst (`renderFactsSheet`).
- **`src/lib/plan-qa.ts`** (čista funkcija): ujemanje NAMENOV vprašanj
  (SL+EN, diakritika-neobčutljivo, vrstni red po specifičnosti; sklici
  na dneve: "dan 2", "2. dan", "zadnji dan", "day 3"): ~12 namenov —
  vožnja/km (skupaj + po dnevu), stroški (skupaj + na osebo + vožnja +
  primerjava s ciljem), najbolj natrpan dan, vreme (ocena načrta ALI
  živa napoved), posamezen dan, pakiranje (F6.1 z razlogi), opozorila
  izvedljivosti, postanki, družinska ustreznost (bestFor "družina"),
  pomoč, dan izven obsega (iskrena popravka: "načrt ima samo 3 dni —
  dneva 7 ni"). Slovenska DVOJINA pravilna ("2 postanka", "na 2 dni").
- **`POST /api/itinerary/ask`**: vrstni red obravnave — (1)
  DETERMINISTIČNO (namen → odgovor iz dejstev; deluje brez AI žetonov,
  kot hitre akcije; vir `computed`); (2) AI SAMO če namen ni prepoznan:
  vprašanje + list dejstev → LLM s STROGIM prizemljenim sistemskim
  navodilom (odgovarjaj IZKLJUČNO iz dejstev, če ni odgovora povej,
  ne predlagaj novih destinacij, max 4 povedi, razkrivaj meje); (3)
  iskren fallback ob nedosegljivem AI ("ne bom ugibal" + primeri
  vprašanj). Vremenski namen: živa Open-Meteo napoved, poravnana z
  datumi potovanja (samo znotraj ~16-dnevnega horizonta — sicer
  pošteno povedano). Rate limit 20/10 min; validacija (400 za
  manjkajoč itinerer / predolgo vprašanje).
- **UI `src/components/plan-copilot.tsx`**: kartica "Vprašaj o načrtu"
  nad refinerjem na /nacrtuj (in /en/nacrtuj) — mehurčki vprašanj/
  odgovorov, ŽETON VIRA pri vsakem odgovoru (emerald "izračunano" /
  amber "AI · samo fraziranje dejstev" / siv "brez ugibanja"), predlogi
  vprašanj kot žetoni (klik = vprašanje), input z Enter, `role="log"`
  + `aria-live="polite"`, `max-h-80` z drsenjem. POŠTENOSTNA MEHANIKA:
  zgodovina klepeta se POČISTI, ko se načrt spremeni (refine/nova
  generacija) — odgovori vedno veljajo za trenutni načrt (vidno
  preverjeno: hitra akcija "Manj vožnje" → spredaj so spet predlogi).
- **Razločitev vprašanje ≠ ukaz**: vprašanja odgovarja PlanCopilot,
  SPREMEMBE načrta še vedno ItineraryRefiner (ukazi) — dve plasti,
  jasno ločeni (MindTrip ju meša v enem chatu).
- **Analitika**: `plan_qa_asked` (`intent`, `source`, `locale`, `via`
  input/chip) — whitelist client + strežnik + docs/ANALYTICS-EVENTS.md;
  `source=computed` delež = pokritost determinističnih namenov brez
  AI žetonov.

### Popravljeno

- **Mešanje jezikov na EN straneh (isti razred buga kot nav.tagline v
  1.10.1)**: `formData` STATE v plannerju nima polja `language`
  (vstavi se šele ob generiranju fetch-u) → `POST /api/itinerary/ask`
  IN obstoječi `POST /api/itinerary/refine` sta na EN straneh poganjala
  SL poti (SL odgovori, SL prompti, SL validacijske opombe). Popravljen
  pri OBEH potrošnikih: fetch body vstavi `language` iz locale strani
  (itinerary-refiner.tsx, plan-copilot.tsx). Refine na EN straneh je
  imel ta bug od prej (nerazkrit, ker se je EN verifikacija prej
  osredotočala na prikaz, ne na refine pot) — zdaj odkrit in popravljen.

### Verifikacija (F9)

- tsc: 0 napak v src/; eslint: 0 napak (novi/posodobljeni fajli).
- Čista funkcija (17 vprašanj SL+EN): vsi nameni ujeta pravilno;
  "Kaj je na dan 7?" na 2-dnevnem načrtu → iskrena popravka
  "dneva 7 ni"; EN "What should I pack?" ujet (po popravku vzorca);
  nesmisel ("Kateri film je najboljši?") → null → AI pot.
- API (curl): SL deterministično (busiest), EN deterministično
  (cost_total), živa napoved (tripStartDate +4 dni: "Dan 1: delno
  oblačno, 19.6 °C · 18 % padavin" — resnični Open-Meteo), neznano
  vprašanje → AI 429 (sandbox) → iskren fallback 200, manjkajoč
  itinerer → 400.
- Browser E2E (agent-browser): SL /nacrtuj — generacija → kartica se
  izriše, žeton predloga "Kateri dan je najbolj natrpan?" → odgovor z
  žetonom "izračunano"; prosti vnos "Koliko km in ur vožnje imamo
  skupaj?" → "Celotna pot: ~285 km, ~5 h 15 min na 3 dnevi …" (ocena,
  haversine × 1.3 razkrito); nesmisel → žeton "brez ugibanja" + iskren
  odgovor; hitra akcija "Manj vožnje" → zgodovina se počisti (predlogi
  spet spredaj). EN /en/nacrtuj — pred popravkom so bili odgovori SL
  (bug!) → po popravku čisti EN ("The busiest day is day 3: 2 stops
  … 'Slower pace'"). 390 px: 0 horizontalnega preliva (docW=winW=390),
  kartica 358 px, klepet 324 px, 0 notranjih prelivov; 0 konzolnih
  napak.
- Iskrena omejitev: živi AI klic (pot 2) je v tem oknu stalno 429 —
  potrjena z ekvivalentnim curl testom do meje AI klica + iskrenim
  fallbackom (pot 3) v browserju; ponovna živa verifikacija AI poti
  priporočena, ko storitev spet sprejema (kot pri F8).

---

## [1.11.0] — 2026-09-15

### Dodano (F8 — ZAČNI SLIKO: fotografija/screenshot → destinacije → načrt)

> Odgovor na MindTrip "Start Anywhere" s slikami (App Store: "share images")
> — vrzel #1 iz sekcije 10 konkurenčne analize. F5.4 je pokril povezave
> (tekstovno, deterministično); F8 razširi isti vnos na fotografije in
> screenshot-e (Instagram post, okvir videa, infografika potovanja).

- **`POST /api/itinerary/ingest-image`** (strežniško, z-ai-web-dev-sdk
  NIKOLI na clientu): sprejme data URL (JPEG/PNG/WebP, do ~4,5 MB), pokliče
  VLM s STROGIM ekstraktorjem ("izpiši VSa imena krajev/orientirjev/vidno
  besedilo, po eno na vrstico, brez komentarjev; če nič → NONE"), nato pa
  VLM izpis poda ISTI deterministični matcher kot povezave
  (`matchDestinationsInText`) — AI torej LE PREBERE sliko, IZBIRA
  destinacij je deterministična. Brez zadetkov → 422 z iskrenim sporočilom
  (nič "podobnih" ne izmišljujemo); VLM nedosegljiv → 502 z nasvetom
  ("poskusi kasneje ali uporabi povezavo").
- **Varnost/zasebnost**: slika se obdela v pomnilniku in pozabi (nikamor
  se ne shranjuje); VLM znaki se ne vračajo v odgovoru (samo
  `method: "vlm"` + `vlmChars` za razkritje metode); rate limit 6/min na
  IP (nižji od 10/min pri povezavah — VLM dražji); timeout 45 s
  (Promise.race); validacija vrste/velikosti na strežniku (client je le
  prvi filter).
- **UI v načrtovalniku**: zavihka "Povezava | Slika" na vnosnem okvirju;
  slikovni način ponuja izbiro datoteke, drag & drop cono in PRILEPLJANJE
  iz odložišča (Ctrl/Cmd+V na okvirju — screenshot brez iskanja datoteke);
  predogled s paličko + ime datoteke + razkrita metoda; gumb "Prepoznaj";
  zadetki se pokažejo PRED generiranjem (isti chips prikaz kot pri
  povezavah) + amber badge metode "prepoznavanje slike: AI branje +
  deterministično ujemanje". Samodejna generacija po uspehu (en klik od
  slike do načrta).
- **Analitika**: `ingest_image_attempted` (locale), `ingest_image_success`
  (matches, days, locale) — whitelist client + strežnik +
  docs/ANALYTICS-EVENTS.md; primerjava uspešnosti slika vs. povezava.
- **SL + EN** (15 novih ključev `planner.ingestImage*`).

### Verifikacija (F8)

- tsc 0 napak v src/; eslint 0 napak.
- Route validacija: napačen format → 400; nepodprta vrsta (GIF) → 400.
- Pipeline (simuliran VLM izpis "Lake Bled/Bled/Bled Island/Plitvice/
  Split/Vintgar"): ujame bled x4 + vintgar x1; hrvaški Plitvice/Split
  pošteno NE ujeta (nista v našem nizu); interesi + dnevi izpeljani.
- UI (agent-browser, SL): zavihka se preklopita; upload datoteke →
  predogled z imenom + metodo; VLM 429 (sandbox rate limit) → iskrena
  napaka prikazana v UI, strežnik 502.
- Iskrena omejitev: VLM klic v tem sandbox oknu stalno 429 (rate limit
  storitve) — E2E uspešne poti (slika → zadetki → načrt) potrjena z
  simuliranim VLM izpisom na istem matcherju + UI tok do API klica;
  ponovna živa verifikacija priporočena ko storitev spet sprejema.

---

## [1.10.1] — 2026-09-15

### Popravljeno

- **Navigacijski tagline i18n**: podnaslov logotipa "AI potovanja" je bil
  hardcoded slovenščina — na EN straneh se je pokazal slovenski niz
  (mešanje jezikov, nasprotje P4-8 pravila "nikoli mešanja jezikov").
  Zdaj `nav.tagline` ključ v SL ("AI potovanja") in EN ("AI trips")
  sporočilih; navigacija ga bere prek `useTranslations("nav")`.

### Verifikacija (F6 — dokončana EN preveritev)

- **EN locale (prej prekinjena)**: /en/nacrtuj generiranje → obe F6 sekciji
  se izrišeta v angleščini ("What to pack" s kategorijami CLOTHING /
  FOR THE WEATHER / FOR ACTIVITIES / TECH / HEALTH & SUN / DOCUMENTS &
  MONEY, razlogi "Day 3: rain in forecast", "Day 2: Triglav (mountain)",
  "Day 3: Postojnska jama (cave)"; "Trip budget" z vrsticami Activities
  on the plan / Driving (fuel + vignette) / Plan total). Interakcije:
  stepper 2→3 osebe preračuna €347/3 = €116 na osebo; vnos cilja 400 € +
  Compare → "Plan fits — €53 under your budget of €400."; razkrivnost
  "How was this calculated — and what it does NOT include" se odpre z
  enakimi viri (AMZS/DARS) in izrecno vrstico o nočitev/hrani/nakupi.
- **390 px mobilni (iPhone 12 viewport)**: 0 horizontalnega preliva na
  strani (edini elementi čez rob so Leaflet ploščice — normalno obrezane
  znotraj vsebnika zemljevida); F6 sekciji 358 px široki, 0 notranjih
  prelivov; 0 napak v konzoli.
- SL regresija: tagline na `/` ostaja "AI potovanja" (preverjeno v DOM).
- tsc 0 napak v `src/` (prejšnje napake v `skills/` niso projektne).
- VLM preverjanje 390 px posnetkov v tem oknu NI uspelo (API 429
  rate-limit) — preverjeno z DOM prelivnimi sondami (natančnejše za
  prelivanje) + 0 konzolnih napak.

---

## [1.10.0] — 2026-09-15

### Dodano (F7 — SKUPNOSTNI VODNIKI: avtor poti zapiše izkušnjo, ne promocijo)

> Odgovor na MindTrip "community guides (realni avtorji, »Saved by 23«)" —
> roadmap item 5 (temelj: community-trips + lastništvo). Naš vodnik NI
> promocijska vsebina, temveč KOREKTIVNA: jedro je polje "kaj bi storil
> drugače" — popotni popravki načrta, ki jih NOBEN tekmec ne zbere
> (MindTrip-ovi vodniki so uredniško-reklamni). Izraz istega
> poštenostnega diferencatorja kot geo-validacija in odkrite metode.

- **Avtorstvo BREZ računa** (anonymous-first, enako kot glasovanje/komentarji):
  POST `/api/itinerary/save` ob shranjevanju izda TAJNI `editToken`
  (32 hex; v DB SAMO SHA-256 hash; plain žeton živi izključno v localStorage
  shranjevalnika). Prijavljeni lastnik (SavedItinerary.userId) lahko ureja
  tudi prek seje — pokrije stare pote; ANONIMNE stare pote (brez žetona)
  avtorstva NE morejo zahtevati (iskrena omejitev — žetona ni mogoče izdati
  počasi). Pot posameznika ne more "pograbiti" (E2E: napačen žeton → 403).
- **`model TripGuide`**: authorName (1–60), intro "zakaj ta pot" (2–500),
  verdict "kaj bi storil drugače" (0–500, jedro diferencatorja), tips ≤ 6
  (vsak {dan 1–14 | splošen, besedilo 2–280}), lang (sl | en).
  Upsert po shareId — ponovna oddaja = urejanje (E2E preverjeno:
  prefill + sprememba + `is_new: false` v analitiki).
- **`PUT /api/trip-guide`** (edini javni vstop): validacija ENAKA klientni
  (dolžine, dnevi, tipi), rate limit 20/h, hash primerjava žetona,
  session fallback za prijavljene lastnike. 404 za neobstoječo pot,
  403 za ne-lastnike, 400 za napačne formate (vse E2E).
- **`src/components/trip-guide.tsx`** na `/pot/[shareId]`: PRIKAZ vsem
  (badge Vodnik, avtor + relativni čas, intro, nasveti z dnevnimi značkami,
  verdikt v amber bloku — vse se natisne z načrtom) + AVTORSTVO samo
  lastniku (CTA "To pot si ustvaril ti — napiši vodnik" → obrazec z
  števci znakov, izbirnik dneva na nasvet, dodajanje/odstranjevanje vrstic).
  Ime avtorja si deli localStorage ključ s komentarji (konsistentna
  identiteta). SSR prikaz (RSC bere vodnik direktno — viden tudi brez JS).
- **Galerija skupnosti** (`/nacrtuj`): poti z vodnikom dobijo badge
  "Vodnik" (BookOpen) + PREDNOST v razvrstitvi znotraj okna zadnjih 24
  shranitev (staranja NE mešamo — galerija ostane "skupnost zdaj").
- **Analitika** `guide_saved`: tips_count, has_verdict (meri, koliko
  avtorjev piše korektivni verdikt — metrika diferencatorja), day_count,
  lang, is_new. Whitelist client + strežnik + docs.

### Popravljeno

- **`itinerary-quality.ts` hardening**: priročeni/shranjeni itinerarji brez
  polja `recommendations` (npr. ročno sestavljen JSON) niso več sesuli
  strani /pot (`TypeError: recommendations is not iterable` v BudgetPanel
  fallback poti) — obravnavamo kot prazen seznam.

### Verifikacija (F7)

- tsc 0 napak (naše datoteke), eslint 0; phase4-verify 13/13, pwa-test
  36/36 (brez regresij); 13 strani 200.
- E2E (agent-browser, DOM): shranjevanje → žeton v localStorage → CTA
  lastnika → obrazec → objava → prikaz vsem → SSR čez reload → urejanje
  (prefill + sprememba + is_new:false) → visitor brez urejanja → napačen
  žeton 403 → stara pot 403/ni CTA → neobstoječa 404 → proračun 400 →
  badge v galeriji + prednostni sort → analitika v DB (props potrjeni).
- VLM (glm-5v): prikaz vodnika 5/5 elementov (badge, avtor, intro, nasveti,
  amber verdikt) "no layout problems". Obrazec: VLM storitev je bila v tem
  oknu rate-limited (429) — obrazec preverjen z DOM sondami (vrednosti
  polj, prefill, oddaja, validacija) + 390px prelivni audit (0 notranjih
  prelivov, kartica 358 px).
- Omejitve (iskrene): /pot strani so SL-only (P4-8 whitelist — NE mešamo
  jezikov, DB vsebina je slovenska); vodnik ene poti = en avtor (žeton/
  seja), brez skupinskega urejanja; stari anonimni zapisi brez žetona
  vodnika ne morejo imeti.

---

## [1.9.0] — 2026-09-15

### Dodano (F6.1 — PAMETEN PAKIRNI SEZNAM: napoved + dejanski postanki → predmeti z razlogi)

> Odgovor na Stippl-ov jedro diferencatorja ("trip-integrated packing
> list"): naš seznam ne ugiba — gradi iz DVEH realnih virov, ki jih načrt
> že ima (dnevna napoved Open-Meteo priložena dnevom + tipi DEJANSKIH
> postankov iz baze destinacij), in vsak predmet nosi razlog ter razkrito
> metodo. Deluje za VSE načrte, tudi stare shranjene (ista čista funkcija
> na clientu — nič sprememb API).

- **`src/lib/packing-smart.ts`** (čista deterministička): dnevi z dežem →
  dežna jakna (razlog "Dan 3: dež v napovedi"); sneg → zimska oprema;
  temp razpon ≥ 12 °C → sloji; min ≤ 5 °C → termično perilo; vročina ≥
  25 °C → SPF 50. Postanki po tipu: jezero/obala/reka → kopalke ("Dan 1:
  Bled; Dan 2: Piran (voda na načrtu)"), soteska/gora → pohodniška
  obutev + flaša vode, jama → topla plast ("8–12 °C vse leto"), mesto →
  superge; interesi/tip skupine (družina → otroški pripomočki), dolžina
  (> 5 dni → power bank + pralni servis), vedno (gotovina, EU vtičnice,
  dokumenti). Iskrena METODA: "forecast" (napoved priložena načrtu) ali
  "season" (sezonska priporočila — odhod > 16 dni naprej ali brez datuma;
  detekcija po signaturi fallback vremena + horizon preverba) — razkrita
  v badge-u in opombi. Kategorije (obleka/vreme/aktivnost/tehnika/zdravje/
  dokumenti/otroci), količine ("× 4"), kap 18, dedup.
- **`src/components/packing-smart.tsx`**: kartica s kategorijkimi glavami
  (ikone), checkbox + label + količina + siva vrstica razloga, progress
  badge ("2/12 spakirano"), badge metode (emerald "iz dnevne napovedi" /
  amber "sezonska"), gumb "Počisti odkljukane". Odkljuki se PERSISTIRAJO
  (localStorage `dsa_packing_check` — podpis po ID-jih; nov seznam →
  reset) prek **`src/lib/ui-persist.ts`** (zunanja shramba +
  `useSyncExternalStore`: hidracijsko varno, strežniški snapshot prazen,
  referenčno stabilni snapshot-i). Nadomešča legacy PackingListSection na
  /nacrtuj in /pot/[shareId]; SL + EN.

### Dodano (F6.2 — PRORAČUNSKI PANEL: stroški načrta + razdelitev na osebo + osebni cilj)

> Odgovor na Stippl-ov budget planner + expense splitting — poštenejše:
> stroški so izračunani IZ DEJANSKEGA NAČRTA (seštevek cen atrakcij +
  gorivo + e-vinjeta iz F5.3) in odkrito povedano, česa ocena NE vključuje
> (nočitev/hrana — načrt teh postavk nima, zato ne ugibamo).

- **`src/components/budget-panel.tsx`**: vrstice "Atrakcije na načrtu /
  Vožnja (gorivo + vinjeta) / Skupaj (načrt)" (iz `ItineraryQuality` —
  ista čista funkcija kot API, deluje tudi za stare načrte brez quality),
  razdelitev na osebo s stepperjem 1–12 ("158 € / osebo"), osebni
  proračunski cilj (persistiran `dsa_budget_goal` prek ui-persist) s
  primerjalno vrstico ("Načrt je 15 € nad tvojim proračunom (300 €)" —
  amber/evil emerald) in zložljivo razkrivnostjo "Kako smo izračunali —
  in česar NE vključuje" (predpostavke, viri AMZS/DARS, izrecna vrstica
  o nočitev/hrani/nakupi). SL + EN; /nacrtuj + /pot/[shareId].

### Dodano (analitika F6)

- `packing_item_checked` (props: category, method, items) — angažma s
  seznamom + iz katere plasti (napoved vs sezona) uporabnik pakira.
- `budget_goal_set` (props: goal_eur, plan_total_eur, group_size) —
  cenovna občutljivost obiskovalcev.
- Whitelist (strežniška + klientska) + docs/ANALYTICS-EVENTS.md.

### Tekmeci 2026 (sveža raziskava — docs/COMPETITIVE-ANALYSIS-MINDTRIP.md)

- Mindtrip Flights (maj 2026, Sabre+PayPal) in Stays (jul 2026) —
  rezervacije v pogovoru; Laylo je kupil Expedia (jul 2026); Wanderlog
  Pro $39,99/let z unlimited AI; Stippl PRO €24,99 z budget/packing/
  expenses; Google Canvas (US). Naša F6 odgovora: pakirni seznam iz
  napovedi+postankov (nad Stippl-ovo generično listo) in proračun iz
  načrta z odkrito metodo.

### Verifikacija (F6)

- tsc 0 napak (naše datoteke), eslint 0 napak.
- E2E brskalnik: SL+EN generiranje → obe sekciji se izrišeta z razlogi
  iz napovedi ("Dan 3: dež v napovedi") in postankov ("Postojnska jama");
  kids-kit pri družini; odkljuki persistirani čez reload IN preklop
  jezika (stabilni ID-ji); goal primerjava + stepper 2→3 osebe (158 →
  105 €/osebo); analitika zapisana v DB (preverjeno z Prisma poizvedbo);
  390 px brez preliva; VLM potrditve treh screenshotov.
- Regresije: phase4-verify 13/13 ✓, pwa-test 36/36 ✓.

---

## [1.8.3] — 2026-09-15

### Dodano (F5.7 — PWA: načrti BREZ POVEZAVE, namestitev, offline zemljevid)

> Roadmap item 3 iz primerjalne analize MindTrip (PWA kot vmesni korak do
> mobilne app). Slovenija-specifičen argument: mobile signal v gorah
> (Triglav, Soča, Pohorje) je slab — "vzemi načrt s sabo" je RESNIČNA
> potreba, ne luksus. .ics izvoz (F5.2) je vzel načrt v koledar; PWA ga
> vzame v ŽEP — z zemljevidom poti.

- **`public/sw.js` (v2 — popolna prenova strategij):** štirje namenski
  cache-i (dai-shell-v2 / dai-plans-v1 / dai-tiles-v1 / dai-img-v1) z LRU
  limit-i (400/40/600/120) in brisanjem legacy discoverslovenia-v1 ob
  aktivaciji. Deljeni itinererji (JSON `/api/itinerary/shared/*`) dobijo
  network-first + offline fallback; `/pot/*` HTML se shranjuje v plans
  cache; OSM tile-i (zemljevid poti!) cache-first → zemljevid dela offline
  za že videna območja; navigacije offline padejo na `/offline.html`;
  ostali /api/*, /admin, /owner NIKOLI iz cache-a; RSC payload-i
  network-first (svež online, cache offline). DEV_MODE (?dev=1) ostaja
  passthrough — dev chunk-i imajo stabilne URL-je brez hash-a (zamrznilo
  bi jih in podrlo hidracijo).
- **`public/offline.html` (novo, samoizpolnitvena stran):** brez strežnika
  in brez zunanjih virov (inline CSS/SVG, dark mode, responzivno). Izpiše
  shranjene načrte iz localStorage ("dai:my-trips") + zadnji ne-shranjen
  načrt (načrtovalnik), Vsak načrt IZRISE v celoti (dnevi, postanki, časi,
  cene, nasveti) iz SW cache-a (?warm=1 URL). Dvojezično (NEXT_LOCALE
  cookie, SL privzeto). HTML-escape vseh dinamičnih vrednosti (XSS).
  Iskrena zavrnitev: načrt, ki ni bil odprt na napravi, to pove.
- **Ogrevanje predpomnilnika (»offline ready« takoj po shranjevanju):**
  `warmOfflinePlanCache()` (lib/itinerary-share.ts) — po uspešnem
  shranjevanju IN ob obisku /pot/* enkrat pridobi JSON v SW cache
  (fire-and-forget). `?warm=1` NE šteje ogleda (iskren views števec —
  API vrne saved.views brez incrementa).
- **`src/components/pwa/pwa-header-icons.tsx` (novo):** badge "Brez
  povezave" (viden SAMO offline — amber wifi-off, VLM preverjen) + toast
  ob prehodu offline/online + gumb za namestitev (beforeinstallprompt →
  prompt(); iOS Safari → Sheet z navodili "Dodaj na domači zaslon" —
  iPadOS 13+ detekcija vključena). React 19 idiomi: useSyncExternalStore
  za navigator.onLine/display-mode/UA (hidracijsko-varno), refs za
  first-run varovalko toast-a.
- **`src/components/pwa/pwa-update-toast.tsx` (novo):** toast "Nova
  različica aplikacije" z gumbom Osveži (SKIP_WAITING → enkraten reload,
  varovano pred zanko).
- **`sw-register.tsx`:** ob novi verziji SW razpošlje window dogodek
  "dai:sw-update" (toast komponenta znotraj providerjev ga ulovi).
- **`public/manifest.json`:** `id: "/"`, opis z offline obljubo,
  screenshots za Chrome "richer install UI" (wide 1280×720 +
  narrow 540×720, form_factor) — posneti iz živega UI (VLM preverjeni).
- **Analitika (2 nova dogodka, whitelist):** `pwa_install_prompted`,
  `pwa_install_accepted` (brez PII).
- **Testi: `scripts/pwa-test.ts` — 36/36 ✓** (SW strategije v mock okolju
  s lažnimi caches/fetch: network-first/cache-first/offline fallback/
  query-stripping/LRU purge/500-ne-cachira + pogodbe manifest/
  offline.html/sw.js). E2E sandbox: hidracija + zemljevid + toasti +
  badge preverjeni; produkcijski offline dokaz: Vercel (glej README
  odstopanja).

## [1.8.2] — 2026-09-15

### Dodano (F5.6 — cestni routing OSRM: realne razdalje, časi in geometrija)

> Roadmap item 2 iz primerjalne analize MindTrip (»ravne črte brez road
> routing«). Zapre tudi koreninski vzrok iz PILOT-VALIDATION-GATE (Test 3):
> hevristika haversine × 1,3 ÷ 55 km/h je lagala v OBEH smerih hkrati —
> izmerjeno na realnih poteh: ČAS na avtocestah pretiraval (LJ→Piran
> 133 min hevristika → 85 min realno; urniki, ki SO izvedljivi, so bili
> označeni kot nemogoči), KILOMETRI v gorah podcenjevali (Postojna→Črnomelj
> 105 km hevristika → 155 km realno; Bohinj→Triglav→Dravograd→Gradec dan
> je bil LAŽJE izgledal, kot je).

- **`src/lib/road-routing.ts` (čisto, client-varno):** tipi nog
  (LegRoute/LegRouteIndex/RoutingMethod), legKey, heuristicLeg (nazaj
  kompatibilen fallback), legIndexMethod, dayRouteGeometry (konatenacija
  geometrij nog v polyline dneva).
- **`src/lib/road-routing-server.ts` (strežniško):** OSRM klient — javni
  router.project-osrm.org (OpenStreetMap, profil driving), EN zahtevek na
  par točk, predpomnilnik TTL 24 h / 600 vnosov (matrika 22×21 ≈ 462 parov
  se napolni enkrat), timeout 2,5 s, sočasnost 4, stikalna varovalka
  (4 zaporedne napake → 10 min brez omrežja), VEDNO fail-open na hevristiko
  — nikoli izjema, nikoli zamuda čez proračun. Omrežna niansa peskovnika:
  undici global fetch (Happy Eyeballs) ETIMEDOUT-a na OSRM → zahtevek teče
  prek node:https z family:4 (dokazano deluje v Node in Bun).
- **Vse plasti pijejo iz indeksa nog (opcijski 3. parameter, nazaj
  kompatibilno):** geo-validation (pravila 1/3/4/5 zdaj na realnih km/min),
  itinerary-quality (drivingMinutes, driveCosts), trip-costs (km za
  gorivo/vinjeto), stop-insights (razdalje v razlagah postankov) — čiste
  funkcije ostanejo čiste (injektiran indeks; brez njega stara hevristika
  za client/stare načrte).
- **Razkritje metode (znamka poštenosti):** `geoValidation.method` +
  `quality.routingMethod` = osrm/heuristic/mixed; kartica kvalitete
  (»Seštevek realnih cestnih razdalj in časov vožnje … OSRM/OpenStreetMap«
  + km v razdelitvi goriva), geo panel (»REALNE CESTNE vrednosti …«),
  zemljevid (»Linije poteka po realnih cestah«) — SL+EN.
- **Zemljevid poti riše PRAVE CESTE:** `days[].routeGeometry`
  (poenostavljena OSRM geometrija, [lat,lng]) → TripMapPanel polna črta
  po cesti (črtkana premica samo še kot fallback brez geometrije);
  refine/quick-akcija preračuna geometrijo na novi strukturi (stara bi
  risala ceste, ki jih ni več).
- **Pred/po dokaz (`scripts/road-routing-before-after.ts`):** LJ→Piran
  LAŽNI schedule_gap WARN odstranjen (85 min realno v 2 h vrzeli);
  Postojna→Črnomelj prava nerazumljivost ODKRTA (155 km, +50 km, ki jih
  hevristika skrjevala) — nemogoči dnevi ostajajo odkriti 2/2.

### Validacija

- tsc 0, eslint 0; čisti testi 21/21 + živi OSRM 8/8
  (`scripts/road-routing-test.ts --live`: mock-injektirani fetcher,
  varovalka, predpomnilnik, mešani indeksi, geometrije);
- faza 4 regresija 9/9; E2E peskovnik: map 2 polylines 0 črtkanih (realne
  ceste), VLM potrditev (»lines follow actual road curves … no glitch«),
  razkritja živa v UI, 390 px 0 preliv, 0 konzolnih/page napak;
- API dokaz: geoValidation.method=osrm, quality.routingMethod=osrm,
  routeGeometry 77 točk dneva 1; AI haluciniran ID (`socca`) ostane
  pošteno ujet (missing_coords ERROR — varnostna mreža nad AI).

---

## [1.8.1] — 2026-09-15

### Dodano (F5.5 — odpiralni časi v validacijski plasti)

> MindTrip pariteta ( njihov citirani primer: »Louvre je zaprt ob torkih«)
> po naših pravilih poštenosti: SAMO preverjeni vnosi z uradnimi viri,
> vir je vedno v sporočilu, brez datuma odhoda NE trdimo ničesar.

- **Destination.opening ( opcijsko, 5 preverjenih vnosov):** Vintgarska
  soteska zaprta nov–mar ( vintgar.si — closureLevel=destination → ERROR);
  Ptujski grad zaprt ob ponedeljkih ( pmpo.si — mainAttraction → WARN);
  Postojnska jama / Kobariški muzej / Stari grad Celje odprti vsak dan
  ( uradni viri — opomba brez opozoril). Piranski pomorski muzej PRESKOČEN
  ( samo sekundarni vir — data honesty).
- **Geo-validacija pravili 9+10:** closed_month + closed_weekday — SAMO z
  znanim datumom odhoda; sporočilo vsebuje zapise in VIR; SL+EN.
- **Generiranje:** fallback deterministično izloči mesečno zaprte
  destinacije iz bazena ( preventiva — dokazano: december + preferred
  vintgar → izostane); AI dobi destContext vrstico z virom + izrecno
  pravilo; varnostna mreža = validator ( dokazano: AI je kljub pravilu
  razporedil Vintgar decembra → validator javil closed_month ERROR).
- **StopInsights:** vrstica »Odpiralni čas: … ( vir: X)« v praktičnih
  podatkih — samo obstoječi vnosi.
- **Dnevna značka:** pokaže se tudi pri km=0 z opozorilom ( poprejšnji
  km-pogoj skril »!« za en-postankovne dneve).

### Validacija

- tsc 0, eslint 0; čisti testi 9/9 ( december ERROR/brez datuma nič/avgust
  OK/ponedeljek WARN/torek OK/EN/Postojna vedno odprta/worst ravni);
- produkcija: fallback preventiva + Ptuj ponedeljek WARN s virom; UI dokaz
  prek ?odpri= ( shranjen zimski načrt → panel + značka »!« + praktični
  podatki z virom); 0 konzolnih napak; 390 px brez prelivov.

## [1.8.0] — 2026-09-15

### Dodano (FAZA 5 — primerjalni razvojni sprint po analizi vs MindTrip)

> Celotna analiza z viri: COMPETITIVE-ANALYSIS.md. Štiri vrzeli, odkrite z
> web-researchom neodvisnih recenzij (aitravel.tools, layla.ai tier list,
> voyaige.to, monkeytravel.app) + revizijo lastne kode, zaprte v enem sprintu.

- **F5.1 — Zemljevid poti NA strani načrtovalnika** (`trip-map-panel.tsx`):
  MindTrip-ova jedro prednost ( split map+itinerary workspace) prevedena na
  naš /nacrtuj — barvne polyline po dnevih, oštevilčeni markerji znotraj
  dneva, interaktivna legenda dni (vklop/izklop), dvosmerna sinhronizacija
  (klik markerja → scroll+highlight kartice postanka; gumb na kartici → pan
  zemljevida na marker). Prej je zemljevid živel le na /zemljevid in
  /pot/[shareId].
- **F5.2 — Koledarski izvoz .ics** (`lib/ics-export.ts`): vsak postanek →
  VEVENT (RFC 5545, escape + folding, SL/EN). Brez knjižnice in brez
  strežniškega klica (Blob download). Iskrena opomba ob načrtih brez datuma
  odhoda (datumi relativni — zapisano v dogodkih). Gumb v akcijski vrstici.
- **F5.3 — Stroški vožnje: gorivo + e-vinjeta** (`lib/trip-costs.ts`):
  DriveCosts v ItineraryQuality (ista čista funkcija na strežniku in
  clientu): km × 6,5 l/100 km × 1,60 €/l + slovenska e-vinjeta po dolžini
  potovanja (1 d 8,10 € / ≤10 d 12,80 € / ≤62 d 32,00 € / letna 106,80 € —
  AMZS/DARS). Vse predpostavke in viri razkriti v "Kako smo izračunali";
  vinjeta pogojna (le avtoceste); 0 km → brez vrstice (ne izmišljujemo).
- **F5.4 — "Začni s povezavo" (MindTrip "Start Anywhere")**:
  `POST /api/itinerary/ingest` + `lib/url-ingest.ts` + UI v obrazcu.
  DETERMINISTIČNO prepoznavanje destinacij s prilepljene povezave
  (YouTube/blog; SL+EN sinónimi, diakritika-neobčutljivo, word-boundway,
  naslov ×2) — deluje brez AI žetonov. Predlog {dni, interesi (iz bestFor,
  kanonični), preferredDestinations} → samodejna generacija; zadetki s
  številom omemb prikazani PRED generiranjem. Integracija:
  PlannerInput.preferredDestinations (sanitizirano; fallback pohitritev
  +2,5 — nad oceno, NE nad sezono/dežem; AI prompt vrstica). SSRF
  zaščita, timeout 8 s, max 1 MB, rate limit 10/min; 0 zadetkov → 422
  (nič izmišljevanja).
- **Analitika:** 3 novi dogodki (ingest_url_attempted, ingest_url_success,
  ics_download) — whitelist (klient+strežnik) in docs/ANALYTICS-EVENTS.md.
- **Dokumentacija:** COMPETITIVE-ANALYSIS.md (celotna analiza z viri,
  roadmap za odložene vrzeli: živi ceni, odpiralni časi, PWA, community).

### Popravljeno

- Vgnezden `<form>` v obrazcu načrtovalnika (ingest UI) → hidratacijska
  napaka; preoblikovano na div + onKeyDown Enter obravnava.

## [1.7.2] — 2026-09-15

### Popravljeno (TAG-ALIGN — neusklajenost oznak interesov, P1 po sledeh recenzije Faze 4)

> Vrzeli, odkrita med produkcijo 1.7.1: uporabnikova izbira "Hrana & vino" je
> bila na deterministični (produkcijski!) poti TIHO IGNORIRANA — NLP parser in
> onboarding sta potiskala ID `kulinarika`, fallback ocenjevalnik pa išče
> bestFor `hrana`. Dokaz: po popravku se vrstni red kandidatov spremeni iz
> čistega rating poreda (triglav/bled 0,5) na poverjen izbor
> (piran/ljubljana/kobarid 1,5/1,4).

- **Normalizacija interesov na strežniški meji:** nova deljena
  `normalizeInterests()` (src/lib/slovenia-data.ts) preslika zgodovinske
  sinonime (`kulinarika`, `gastronomija`) na kanonične vrednosti INTERESTS in
  odstrani duplikate. Pokličejo jo `POST /api/itinerary` (AI in fallback pot —
  tudi AI prompt dobi čistejši vnos) in `POST /api/itinerary/refine`
  (hitre akcije, npr. "Več hrane", ocenjujejo kandidate z istim bestFor
  ujemanjem). Aditivno: neznan ID ostane nespremenjen (ocenjevalnik ga varno
  prezre, AI pa ga lahko uporabi).
- **NLP parser (hero/kviz/demo) pošilja kanonične vrednosti:** "hrana", ne več
  "kulinarika" — žeton "Hrana & vino" se v obrazcu PRIŽGE (prej se ni) in
  izbira dejansko vpliva na izbor destinacij. Dedupe ("hrana in vino" je sprožil
  dva pogoja za isti interes).
- **Angleške ključne besede v NLP parserju:** EN je poln locale, hero pa
  sprejema angleške vpise — doslej so padli na privzete vrednosti. Zdaj:
  interesi (food/wine/dinner/nature/hike/adventure/family/culture/history…),
  dnevi ("3 days"), ure ("5 hours"), skupina ("2 people/adults"), tip poti
  (couple/friends/solo) in sezona (spring/summer/autumn|fall/winter/ski/june…).
- **Onboarding profil usklajen:** ID možnosti "Lokalna hrana" je zdaj `hrana`
  (kanonični); stari shranjeni profili z `kulinarika` se pri prikazu preslikajo
  (isti napis) — brez vidne spremembe za obstoječe uporabnike.
- **Revizijski pregled besednjaka:** vsi žetoni INTERESTS imajo ≥ 1 destinacijo
  z ujemajočim bestFor (8/8 ✓); preostali viri (kviz, demo scenariji) so bili
  že kanonični.

---

## [1.7.1] — 2026-09-15

### Popravljeno (P0/P1 po recenziji Faze 4 — "preveri")

> Recenzentova ključna ugotovitev: "deterministični fallback, ki spremeni dan,
> še ni isto kot validator, ki dokaže, da je novi dan izvedljiv." Ta različica
> zapira to vrzel: po vsaki spremembi se izvede POPOLN ponovni izračun in
> ponovna validacija celotnega itinerarja, odgovor pa nosi struktuirani dokaz.

- **P0.1 — validacijski dokaz vsakega refine odgovora:** `POST /api/itinerary/refine`
  (AI in deterministična pot) zdaj vrača `validation { scope, day, before, after,
  status, statusNote }` iz ISTE geo-validacijske plasti kot prikaz —
  before (km/worst/issues/errors) → mutation (`changes`) → after. Status:
  `pass` | `warn` | `still_failing`; če dan po spremembi še vedno ni realno
  izvedljiv, uporabnik to izve takoj v toastu (destructive) — ne samo
  "uspešen 200 in lep nov tekst". Analitika `day_adjusted` nosi `geo_status`,
  `km_before`, `km_after`.
- **P0.2 — popolna sinhronizacija po spremembi:** budget (`total_budget`) se
  po vsakem refine-u preračuna iz DEJANSKIH postankov (prej: AI JSON številka
  izračunana za staro strukturo); `events` in `crowdNotices` se preračunata na
  novi strukturi (prej: podedovani/izgubljeni); zastarela deljiva povezava se
  ob refine-u/dodajanju dogodka umakne — javna `/pot/[shareId]` je vedno
  identična urejeni različici (uporabnik znova shrani za svež link).
  Zemljevid je že bil čista funkcija stanja (store → routeCoords).
- **P0.3 — varovalke "cannot_safely_transform":** hitre akcije, ki računajo iz
  koordinat/tipov/oznak, se nad dnevom z neznanim destinacijskim ID-jem (AI
  halucinacija) NE izvedejo — vrnejo `changes[].kind = "cannot_transform"` z
  razlogom (`missing_destination_data` / `no_nearby_alternative` / `no_candidate`)
  in pošteno opombo, nič se ne ugiba. Zamenjave so GEO-ZAVEDNE: kandidat mora
  biti ≤ 80 km od najbližjega ostalega postanka dneva (prag poravnan z
  legKm.warn — zamenjava ne sme uvesti noge, ki bi jo validator sam označil;
  en postanek v dnevu → geo-pogoj nima smisla).
- **P1.1 — transparentnost razlag:** razdalje v "Zakaj ta postanek" so
  eksplicitno približek ("približno 42 km" / "~42 km") + opomba metode pod
  razlago ("izračun iz koordinat, cestni faktor 1,3 — ne navigacijski
  podatek"); oznake skupin navajajo vir ("primerno za družine (oznaka
  lokacije)").
- **P1.2 — analitika:** vsak dogodek nosi `eid` (clientEventId) s strežniško
  deduplikacijo (`type + eid` → drugi poskus vrne `deduped: true` brez nove
  vrstice; brez spremembe sheme); nova dokumentacija vseh 19 dogodkov z
  definicijami (kdaj, enkrat/večkrat, props, pomen, metrika):
  [docs/ANALYTICS-EVENTS.md](docs/ANALYTICS-EVENTS.md).
- **P1.3 — nevtralna semantika opustitve:** `user_abandoned_after_result` →
  `result_session_ended_without_action` (proxy signal, ne dokaz
  nezadovoljstva — dokumentirano podcenjevanje: mobilni pagehide, zemljevid
  v novem zavihku, izguba povezave).

---

## [1.7.0] — 2026-09-14

### Dodano (FAZA 4 — tri izboljšave po Pilot Validation Gate, uporabnikovo naročilo)

> Gate je potrdil stabilen osnovni tok (URL audit 733/733 × 4 kroge, mobilna
> zlata pot, owner tok). Razvojni cikel omejen na tri izboljšave + pilotna
> analitika. Načelo: podatkovno utemeljeno in pošteno — brez marketinških
> razlag, brez generičnega "Verified", brez izmišljenih statusov.
> Podrobnosti: [docs/PHASE-4-IMPROVEMENTS.md](docs/PHASE-4-IMPROVEMENTS.md).

- **»Zakaj je to priporočeno?«** — vsak postanek itinererja nosi kratko
  razlago, sestavljeno izključno iz dejstev (ugemani interesi, tip skupine,
  cestna razdalja do prejšnjega postanka z odkritim opozorilom pri >70 km,
  vremenska ustreznost, sezona; največ 4 dejstva; SL+EN). Čista funkcija
  `buildStopReasons` obogati obe poti generiranja in vsak refine; prikaz v
  plannerju in na deljeni povezavi. AI-haluciniran ID destinacije → brez
  razlage (ni podatkov = ni izmišljenega) + dogodek `invalid_location`.
- **»Prilagodi ta dan«** — šest hitrih akcij (Manj vožnje, Primerno za dež,
  Počasnejši tempo, Več narave, Več hrane, Za družino) na izbrani dan prek
  OBSTOJEČEGA `/api/itinerary/refine` (nova opcijska polja `action`+`day`).
  AI pot jih obdela kot naravnojezikovni ukaz; fallback pot jih izvede
  DETERMINISTIČNO (čiste transformacije nad datasetom destinacij — ni nov AI
  sistem) in deluje tudi brez AI žetona: nearest-neighbor preureditev dneva,
  odstranitev najbolj oddaljenega postanka pri >100 km, zamenjave zunanjih
  aktivnosti z notranjimi ipd. Vsaka sprememba poročana v `changes[]`.
  Refiner komponenta prevedena v EN (prej trdo slovenska).
- **»Preveri praktične podatke«** — zložljiv blok na vsakem postanku s SAMO
  obstoječimi podatki (trajanje, okvirna cena, sezona, vremenska ustreznost,
  vir + zadnja posodobitev dataseta) in opozorilom, da uporabnik pred obiskom
  preveri urnike in cene. Brez generičnega "Verified" znaka. Popravljena
  tudi noga deljene poti (prej utrjena trditev »vsi kraji preverjeni«).
- **Pilotna analitika** — 19 dogodkov zlate poti (`planner_started` →
  `planner_submitted` → `planner_result_rendered` → `day_adjusted` /
  `planner_refined` / `stop_replaced` / `stop_removed` /
  `weather_alternative_used` / `map_opened` / `provider_detail_opened` /
  `affiliate_clicked` → `itinerary_saved`; neuspehi: `planner_error`,
  `empty_result`, `invalid_location`, `unrealistic_day`, `save_failed`,
  `refine_failed`, `user_abandoned_after_result`). Nov endpoint
  `POST /api/analytics/event` s strežniško whitelist, rate limitom 60/min in
  zapisom v obstoječi model `AnalyticsEvent` (brez spremembe sheme); anonimni
  sessionId (UUID, localStorage), brez PII; opustitev rezultata se meri po
  45 s brez navezave ob zapuščanju strani (keepalive).
- **Validacija:** tsc 0, eslint 0; `scripts/phase4-verify.ts` 9/9 lokalno;
  vseh 6 akcij deterministično s siljenim fallbackom (103 km → 0 km dan,
  Triglav→Piran hrana, Slovenj Gradec→Postojnska jama družina); agent-browser
  390 px: razlage, praktični podatki, vsi čipi, klik akcije, 0 horizontalnega
  preliva.

---

## [1.6.0] — 2026-09-11

### Spremenjeno (FW3 — AI-first hierarhija UX refaktor, `0742a1a`)

> Strateška sprememba identitete: »velik turistični portal z AI funkcijo« →
> »AI travel product z ogromnim ekosistemom za njim«. Načelo: **ne zmanjšuj
> funkcionalnosti — zmanjšaj kognitivno obremenitev** (progresivno razkrivanje,
> uporabnikov predlog). Vrata: tsc 0, eslint 0, agent-browser E2E (intent chip →
> /nacrtuj → avto-generacija z razčlenjenimi interesi; vsi novi ruti 200;
> mobilni 390 px hierarhični meni, sticky footer, 0 horizontalnega scrolla;
> legacy hash preusmeritve; 0 konzolnih napak).

- **Homepage: 22 sekcij → 8 vsebinskih blokov** — hero AI concierge,
  »tvoj naslednji korak« (vračajoči uporabniki + demo scenariji), trust
  statistike, 6 priljubljenih destinacij (+ CTA na vseh 22), priljubljene AI
  poti, doživetja, hub »Razišči Slovenijo«, rezervacije. HTML se je med
  E2E skrčil z ~992 KB na ~447 KB.
- **Hero: 6 intent chipov** (miren vikend, romantika, družina, hrana & vino,
  avantura, brez gužve) + gumb »Sestavi mojo pot« — submit prenese željo na
  `/nacrtuj` prek sessionStorage; planner jo ob mountu prevzame in zgenerira
  itinerer (razčlenitev naravnega jezika v days/interese/severno/skupino).
- **Navigacija: 6 povezav → 4 glavne** (Destinacije, Doživetja, Zemljevid,
  Vodiči) + primarni CTA »Načrtuj z AI« + diskretni »Za ponudnike«; mobilni
  meni s sekundarno skupino (Dogodki, Lokali, Tržnica, Slovenia Pass, Moja
  potovanja); nov prop `solid` za strani brez fotografskega heroja.
- **9 novih strani** (ASCII poti — Next.js 16 ne poveže percent-encoded URL-jev
  z ne-ASCII mapami, ugotovljeno s testom): `/nacrtuj` (planner + kviz +
  skupnostne poti), `/destinacije` (22 + filtri + zbirke), `/dozivetja`
  (kategorije + izkušnje), `/dogodki`, `/zemljevid`, `/lokali`, `/vodici`
  (blog + vprašaj lokalca), `/trznica`, `/slovenia-pass`.
- **MarketplaceSection: prop `defaultTab`** — `/dozivetja` pine zavihek
  »Izkušnje« (SSR preverjeno `data-state="active"`).
- **DestinationsSection: featured način** — 6 kartic brez filtrov + CTA
  »Razišči vseh 22 destinacij«.
- **B2B ločeno od turista**: `JoinUs` + `PitchDeck` preseljena na
  `/za-ponudnike` (Navigation solid + popravljen podvojen naslov); turistov
  glavni tok jih ne vidi več.
- **LegacyHashRedirect**: varnostna mreža za podedovane `#anchor` povezave
  (stari e-maili, kazalniki, chat odgovori) — dekodiranje percent-encoded
  hasha, deluje ob mountu in ob `hashchange`; ohrani query parametre.
- **WishlistSheet cross-page**: namen se prenese prek sessionStorage na
  `/trznica` (enak vzorec kot heroQuery → `/nacrtuj`).
- **SEO**: sitemap — hash sekcije zamenjane za prave strani (11 novih URL-jev);
  SearchAction JSON-LD usmerjen na `/destinacije?q=`; footer povezane na
  absolutne poti; vsa notranja »/#načrtuj« sklica posodobljena (15 datotek:
  SSG destinacijske strani, moja-potovanja, shared-trip, chat fallbacki,
  e-mail predloga).
- **i18n**: novi ključi `nav.experiences/guides/marketplace/pass/trips` v
  vseh štirih jezikih; CTA »Načrtuj z AI«.

## [1.5.0] — 2026-09-11

### Dodano (FW2 — UX quick wins iz primerjalne analize Mindtrip.ai, `629da01`)

> Vzorci, ki so 2026 standard AI travel produktov. Vrata: tsc 0, eslint 0,
> agent-browser E2E (wishlist tok, chat persistenca čez reload, place cards,
> QR, lightbox, booking → Moja potovanja, sponsorship vrata, push/test) +
> mobilni 390 px brez horizontalnega scrolla.

- **Place cards v AI konzultacijah**: priporočeni partnerji (izkušnje/izdelki/lokalci)
  se v odgovoru konzultacije prikažejo kot vizualne kartice — server-side obogatitev
  iz `published` DB vsebine (slika, ocena, cena, CTA na things-to-do) z iskrenim
  besedilnim fallbackom za neujemajoča imena.
- **Persistenca AI chat zgodovine** (`dai:chat-history`, FIFO 40, defenzivno branje)
  + gumb »Počisti pogovor«.
- **Priljubljene (wishlist)**: srčki na karticah tržnice in modalih (`localStorage`,
  FIFO 60) + WishlistSheet v navigaciji z odpiranjem pripadajočega modal.
- **QR koda deljene poti**: inline preklop v vrstici Deli + print-only QR blok na
  `/pot/[shareId]` (ob tisku povezava nazaj na živo stran).
- **Sponzorstva v owner nadzorni plošči**: Moja sponzorstva + nakupni tok (demo:
  takojšnja aktivacija; Stripe: redirect). P3a-2 vrata `emailVerified` ostajajo
  aktivna — iskren 403 toast.
- **Celozaslonski lightbox galerije** (izkušnje + izdelki): tipkovnica, števec,
  thumbnail list, pravilna plastovitost nad modalom.
- **Moja naročila in rezervacije**: lokalno sledenje (`dai:my-orders` /
  `dai:my-bookings`, FIFO 50) + javni lookup API, prikaz v `/moja-potovanja`.

### Popravljeno (FW2)

- **Mrtvi gumb »Pošlji testno obvestilo« (404 v produkciji)**: nov `/api/push/test`
  (rate limit 5/h; endpoint mora obstajati v DB — ni poljubni relay; ključi iz DB;
  VAPID 503 iskreno) + `.gitignore` negacija — gol vzorec `test` bi izključil ruto
  iz deploya (verjetni vzrok izvirnega 404).

---

## [1.4.1] — 2026-09-11

### Varnost (FW1 — kritične najdbe auditov R2/R3, `08e8369`)

> E2E adversarial testi na Neonu (s cleanup skriptami): atribuirani unpaid booking
> NE vstopi v provizijsko osnovo; dedup 409 kljub porabljeni zalogi; agregirani
> payload 2×2 > 3 → 400; pretečeni cancel → 400; providerEmail tuji → 400;
> dvoumen lead → fail-closed. Skripte: `fix-wave1-backfill` + `fw1-test-setup/cleanup`.

- 🔴 **Commission inflation (R3)**: `Booking.paymentStatus` (unpaid|paid|refunded);
  provizijska osnova (lib/commissions + owner GET + invoice-pdf) šteje IZKLJUČNO
  plačane rezervacije — anonimni API obiskovalec ne more več ustvarjati provizijske
  obveznosti ponudniku. Seeded demo rezervacije so backfillane na `paid` (dashboard
  showcase ostane živ). Zgornja meja `bookingDate`: 18 mesecev.
- 🔴 **Marketplace stock (R2)**: checkout agregira količine po `productId`, atomarno
  pogojno dekrementira zalogo + `saleCount` v SERIALIZABLE transakciji s P2034
  retry — overselling nemogoč tudi ob sočasnosti; dedup naročil (isti kupec + ista
  košarika v 10 min → 409 s številko prvega naročila pred stock-checkom).
- 🟠 **providerEmail cross-tenant (R3)**: experience POST/PUT zahtevata
  `providerEmail === owner.email`; lastništvo rezervacij IZKLJUČNO prek
  `Experience.ownerId` (OR-veja odstranjena).
- 🟠 **Owner cancel = evazija provizije (R3)**: preklic POTRDJENE rezervacije samo
  PRED datumom izvedbe (po preteku samo `complete`); vsak prehod v AuditLog
  (`BOOKING_STATUS_CHANGED`).
- 🟠 **Public API leak (R3)**: javni odgovori (listings/experiences/products/
  collections + detajli) sanitizirani prek `lib/public-fields.ts` — `ownerEmail`,
  `ownerId`, `rejectionReason`, `approvedBy`, `submittedAt`, `approvedAt`,
  `draftNudge*`, `aiRecommendations` odstranjeni (števci social-proof ostajajo
  namerno javni).
- 🟠 **Re-moderacija poslovnih polj (R2)**: `contentChanged` zajema sedaj tudi
  ceno, trajanje, velikost skupine, meeting point, naslov in kontakt ponudnika.
- 🟠 **daily-trip-push unpublished (R3)**: filter `status:'published'` — javni push
  ne pošilje več pending/zavrnjenih izkušenj turistom.
- 🟠 **Lead routing fail-closed (R2)**: email lastniku SAMO ob nedvoumnem
  (normaliziran exact) ujemanju `businessName` z natanko enim ownerjem; 0 ali 2+
  zadetkov → brez samodejnega emaila (ročna obdelava).

---

## [1.4.0] — 2026-09-11

### Varnost (P7 — globoki audit + popravki P0–P2)

- **Upokojitev demo računov v produkciji (P0)**: `admin@demo` (super_admin) izbrisan;
  ana/marko/tina/luka imajo rotirana naključna gesla + razveljavljene seje. Vsa javno
  dokumentirana gesla na produkciji vračajo 401 (preverjeno). Seed fiksnih gesel samo
  lokalno SQLite z `DEV_FIXED_DEMO_PASSWORDS=1`.
- **`mark_paid` provizijskega računa (P0)**: lastnik ne more več označiti svoj račun
  za plačan brez dokaza o plačilu — 403, kadar Stripe ni v demo načinu.
- **`/api/checkout` (P1)**: fail-closed 501 v produkciji (prej: napačen
  `status="paid"` + lažen `stripeSessionId` tudi s pravimi ključi).
- **Stripe webhook (P1)**: dedup marker `ProcessedStripeEvent` se ob napaki obdelave
  umakne — Stripe retry znova obdela (prej: učinek plačila za vedno izgubljen).
- **Provizijska osnova (P1)**: preklicane rezervacije izključene
  (`confirmed`/`completed`); brisanje izkušnje z rezervacijami zavrnjeno (400).
- **Atribucija (P1)**: `source=consultation` samo, če je konzultacija dejansko
  priporočila to izkušnjo/ponudnika (ujemanje imen + vsebine odgovora).
- **AI stroškovna zloraba (P1)**: `/api/ai-health` rate limit 12/10 min;
  `/api/recommendations/*` rate limit 60/10 min + in-memory cache (FS cache na
  Vercelu read-only → prej AI klic na vsak javni GET).
- **Odstranjena osirotela javni ruti (P1)**: `/api/seo/faq` (neavtoriziran AI) in
  `/api/email/welcome` (neavtoriziran email relay).
- **P2 paket**: timing-safe `track-funnel`, validacija weather lat/lng,
  `payment_status="paid"` obvezen pri commission/sponsorship webhookih, sponsorship
  dup-check, idempotentna cron (renewal-reminders claim, commission-invoices P2002),
  login timing izenačen (dummy bcrypt), `[EMAIL DEMO]` redakcija URL-jev z žetoni v
  produkciji, `max_tokens` na AI klicih.

### Spremenjeno (P8 — responsive + atomarna booking deduplikacija)

- **Atomarna booking deduplikacija (P1)**: TOCTOU (`findFirst` → `create`) zamenjan
  s SERIALIZABLE transakcijo + retry na P2034 (PostgreSQL; SQLite lokalno privzeta
  raven). Sočasna duplikatna requesta ustvarita natanko ENO rezervacijo — E2E dokaz:
  200 + 409 z isto številko, 1 vrstica v DB; bookingCount se poveča enkrat; emaila
  se pošljeta samo na zmagovalni (200) poti — 409 pot se vrne prej pošiljanja.
- **`issueCommissionInvoice()` (P2)**: P2002 konflikt → vrne obstoječi račun
  (`duplicate`) namesto 500.
- **Responsive 390 px**: homepage 70,2k → 48,7k px (−30 %); dvostolpčni mobilni
  gridi (destinacije, tržnica, lokali, blog, zbirke), row-layout dogodkov,
  kompakcija kartic, beta-banner/footer odmiki za sticky CTA + chat FAB,
  `env(safe-area-inset-bottom)` na avtentikacijskih straneh. Desktop nespremenjen.

### Dokumentacija (P9 — code freeze)

- **README**: status CODE FREEZE READY + deploy runbook po rate-limit okni
  (Redeploy, brez praznega commita) + 16-točkovni produkcjski smoke checklist.
- **`requireOwnership()`**: admin/super_admin/moderator bypass dokumentiran v kodi
  (P7-B: 0 klicalcev → past za prihodnji razvoj, ne aktivna ranljivost).
- **`scripts/verify/production-smoke.sh`**: avtomatizirani del smoke checklista
  (markerji, anti-enumeracija, cron × 6 z napačnim/pravim secretom, commit status;
  opciono booking E2E z dokazom 409 dedup in newsletter).
- **`scripts/db/p9-smoke-cleanup.ts`**: idempotenten cleanup smoke zapisov.
- **Znane odložene postavke** (zavedno, pred javnim launchem): centralizirani rate
  limiting (per-instance zdaj), realni Stripe Checkout po pilotu, prompt-injection
  ovijanje na preostalih AI poteh.

---

## [1.3.0] — 2026-09-11

### Spremenjeno (Changed)

- **Newsletter → PostgreSQL (P6)**: prijave se shranjujejo v nov model
  `NewsletterSubscriber` (prej `data/newsletter.json` — na Vercelu efemeren,
  podatki so izginevali ob vsakem deployu). Pisalca (`/api/newsletter/subscribe`,
  `/api/email-itinerary`) in bralnik (`/api/admin/leads-dashboard`) so
  preseljeni na DB; `GET /api/newsletter/subscribe` je zdaj admin-zaščiten
  (`x-admin-password`; prej javno izpostavljeno število naročnikov).

### Dokumentacija (P6 — sinhronizacija repozitorija z realnostjo)

- **README**: odstranjena trditev »VLM-verified slikami« (92/105 slik je
  Unsplash), »prva platforma« → »med prvimi«, »najpoštenejši model na trgu«
  umaknjen; Database = Neon PostgreSQL v vseh sekcijah (stack, quickstart,
  env, arhitektura); namišljeni model `AbSubscription` zamenjan z realnim
  `NewsletterSubscriber` (25 modelov); demo računi z izrecnim opozorilom,
  da v pilotni bazi še obstajajo in da gesla rotiraj pred pravim pilotom;
  Docker sekcion označen kot zastarel (SQLite era).
- **.env.example**: `DATABASE_URL` privzeto PostgreSQL (Neon) namesto SQLite
  `file:` (ki pri `postgresql` shemi ne deluje); opozorilo o narekovajih za
  vrednosti z `&`.
- **CONTRIBUTING**: repo URL-ji (stare ime `i-feel-slovenia`) in kontaktni
  email posodobljeni; obljuba o neobstoječi »Contributors sekciji« umaknjena.
- **ADR-016** (nov): PostgreSQL/Neon za dev in produkcijo — nadomešča
  ADR-003 (SQLite/Turso), ki je označen kot nadomeščen.
- **TECHNICAL-SPECIFICATION / DATA-FLOW / SECURITY-REVIEW / SECURITY.md**:
  SQLite/Turso → Neon; rate-limit tabela zdaj odseva dejansko implementirane
  limite; plan limiti poplavljeni (free=1/premium=5/enterprise=∞ normalno;
  3/8 med beta).
- **OUTREACH-TOOLKIT**: »Min 3, VLM-verified« → »Min 1 (priporočamo 3+),
  lastniške fotografije«.
- **PRODUCT-BLUEPRINT**: dodan izrecen drift banner (zamrznjen v1.0 opisuje
  načrt, ne trenutnega stanja).
- **6 ops dokumentov** (BACKUP-RECOVERY, MIGRATION-STRATEGY, INCIDENT-PLAYBOOK,
  OBSERVABILITY-PLAN, SEED-STRATEGY, RISK-REGISTER): drift opozorila —
  sqlite3/Turso postopki so arhivski, produkcija je Neon.
- **GitHub About**: iz opisa repozitorija odstranjena trditev »VLM Verified«.

---

## [1.2.2] — 2026-09-11

### Popravljeno (Fixed) — P4-9 iskreni polish

- **Ocene samo ob pravih mnenjih**: prikaz ratingov pogojen na
  `reviewCount > 0` na 7 mestih (listings, modal, marketplace); iz JSON-LD
  (`aggregateRating` z izmišljenim številom mnenj) odstranjen; destinacijske
  ocene so izrecno označene kot **uredniške ocene**.
- **VLM badge odstranjen** s homepage in footera (trditev o »preverjenih
  slikah« ni držala — Unsplash v seedih); lažni social linki (`href="#"`)
  iz footera odstranjeni.
- **Žive številke**: `/za-ponudnike` prikazuje dejansko število lokalov iz
  baze (ne »25 partnerjev«); neobstoječa featureja (QR Karta, Quality
  Coach) zamenjana z realnima (Povpraševanja gostov, Atribucija
  rezervacij); paketi brez neizvedenih meja; »prva AI platforma« →
  »med prvimi«.
- **UX frikciji**: booking prikaz »čas po dogovoru« namesto »ob 00:00«
  (date-only serializacija) + mikrokopija; onboarding zahteva 1 (ne 3)
  fotografije — client in server usklajeno.
- **Higiena**: 12 neuporabljenih odvisnosti odstranjenih, 5 mrtvih API rut
  (−495 LOC), `tailwind.config.ts` (TW4 CSS-first) izbrisan.

---

## [1.2.1] — 2026-09-10

### Popravljeno (Fixed)

- **CI/CD (P4-7)**: Build job sedaj testira proti `postgres:16-alpine` service
  containerju. CI #65 je padel pri koraku "Prepare Prisma client & test DB" —
  `DATABASE_URL` je bil še SQLite (`file:./db/ci-test.db`), `schema.prisma`
  pa je od Faze 4f `postgresql` → Prisma zavrne `file:` URL. CI #66 zelen.
- **Mešanje jezikov na /de, /en, /it (P4-8)**: te strani so bile delno
  prevedene (navigacija/noga v tujem jeziku, vsebina hardcoded slovenščina).
  Javno je zdaj **samo slovenščina**: stari URL-ji se trajno (308) preusmerijo
  na slovensko pot (`src/proxy.ts`), hreflang alternati so umaknjeni
  (`src/components/seo.tsx`), jezikovni preklopnik se skrije
  (`src/components/language-switcher.tsx`). Infrastruktura (next-intl,
  sporočila, preklopnik) ostaja — ko bodo celoviti prevodi (roadmap C5), se
  jeziki dodajo nazaj v `src/i18n/routing.ts`.

### Spremenjeno (Changed)

- **Iskrena komunikacija (P4-8)**: odstranjene demo/marketing številke brez
  izmerjene podlage — »12.000+ obiskovalcev/mes«, »32 % konverzija v kontakt«,
  »+18 % rast mesečno«, »5.2★ povprečna ocena«, »50+ lokalov« — iz
  `pitch-deck.tsx` in `join-us.tsx`. Namesto izmišljenih pričevanj (Ana K.,
  Marko P., Tina R.) se zdaj oddaja razdelek **Naša obljuba**: samo mnenja z
  dokazano rezervacijo, transparentna provizija (0 % / 12 %), znak
  »Preverjen partner« kot eksplicitna odločitev ekipe.

### Dokumentacija (Docs)

- **SECURITY.md**: revizijski pregled 2026-09-10 — vsi commiti (main +
  master) brez skrivnosti (neodvisno potrjeno čiščenje iz v1.1.0);
  `PUTER_AUTH_TOKEN` ni nastavljen v Vercel env (preverjeno prek APIja) —
  ob ponovni aktivaciji Puter AI generiraj NOV žeton; nov checklist: odstrani
  neuporabljeni legacy `VITE_GEMINI_API_KEY` iz Vercel env. Razdelek "Podatki"
  posodobljen (Neon PostgreSQL, leadi v DB od P4-2).
- **docs/DEPLOYMENT.md**: sinhroniziran s trenutno arhitekturo — Pot B
  (Vercel + Neon) označena kot IZVEDENA, demo SQLite mehanizem (Faza 4e) kot
  zgodovinski/izklopljen, Pot A (Docker) opozorilo o neskladju s postgres
  shemo (zahteva postgres service ali reverz providerja pred uporabo).
- **README.md**: i18n status (javno samo sl), CI opis (postgres service
  container), odstranjena zastarela trditev o demo SQLite bazi na Vercelu.

---

## [1.1.0] — 2026-09-08

### Varnost (Security)

- **PII zaščita**: `/api/orders/[n]` in `/api/bookings/[n]` zahtevata `?email=` ujemanje s kupcem/gostom (prej popolnoma odprta, ugibljivi ID-ji) → 401/404
- **Strežniška validacija cen**: `/api/bookings` prebere ceno, ime izkušnje in kontakt ponudnika iz baze (prej je lahko client rezerviral za €0 s ponarejenim ponudnikom)
- **Rate limiting** (in-memory drseče okno, per-IP) na 16+ javnih poteh: AI endpointi (chat, itinerary, refine, smart-search, translate, ai-story, poi-describe), e-pošta (itinerary, welcome), newsletter, leads, checkout, bookings in admin/verify (brute-force zaščita, 429 po 10 poizkusih)
- **Cron avtentikacija**: vsi 3 cron endpointi zahtevajo CRON_SECRET (Bearer) ali admin geslo — timing-safe primerjava, fail-closed v produkciji
- **owner/auto-tag** zahteva NextAuth sejo (prej odprt AI endpoint)
- **JSON-LD XSS**: `safeJsonLd()` escapira `</script>` v vseh structured-data izpisih
- **E-poštna HTML injekcija**: vsi uporabniški vnosi v e-poštnih predlogah escapani (`escapeHtml`)
- **Varnostni headerji**: CSP, HSTS, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy
- **Timing-safe primerjave** za admin geslo in cron avtentikacijo
- **Čiščenje git zgodovine** (git filter-repo): `.env` (PUTER_AUTH_TOKEN, admin geslo), `db/`, `agent-ctx/`, `tool-results/`, `upload/`, `worklog.md`, `data/newsletter.json`, `aimojalandingpage/` in sandbox ostanki odstranjeni iz VSEH commitov; veja `main` zaščitena proti force-push in brisanju
- **Nove skrivnosti**: NEXTAUTH_SECRET, CRON_SECRET, novo ADMIN_PASSWORD (lokalni `.env`, nikoli v repu) — UPORABNIK MORA ROTIRATI PUTER_AUTH_TOKEN

### Popravljeno (Fixed)

- **sendEmail() hrošč**: admin approve/reject sta klicala e-pošto s pozicijskimi argumenti — sporočila o odobritvi/zavrnitvi nikoli niso bila poslana; popravljen objektni klic
- **trip-timeline crash**: `dayCost is not defined` — runtime napaka ob vsakem generiranem itinererju
- **PageView model manjkal** v Prisma schemi — track-funnel, track-pageview, admin/leads-dashboard in admin/indexing so se sesuli s 500
- **Vseh 53 TypeScript napak odpravljenih** (`tsc --noEmit` → 0 napak); `typescript.ignoreBuildErrors` odstranjen
- **CI workflow pokvarjen** (`branches: ain, develop]`) — CI nikoli ni tekel; popravljen trigger + dodana priprava Prisma klienta/testne baze; prvi zeleni zagon
- **`/api/itinerary/bookings`**: vrne samo objavljene vsebine (prej draft/pending lokalci z kontakti javno vidni)
- **Nerodljive številke** rezervacij/naročil (prava entropija namesto predvidljivih zaporedij)

### Spremenjeno (Changed)

- Repozitorij: github.com/markec12345678/Discover-Slovenia-AI (prej i-feel-slovenia) — 12 tem, zaščitena veja `main`, README CI status značka
- next.config.ts: polno tipiziran build (brez ignoreBuildErrors)

### Odstranjeno (Removed)

- **3.355 vrstic mrtve kode** — 10 neuporabljenih komponent: booking-modal, cart-drawer, checkout-modal, intl-provider, newsletter-capture, qr-partner-card, quality-coach, recommendation-card, recommendation-reasons, wow/trip-timeline
- Z.ai sandbox ostanki: Caddyfile, .zscripts/, examples/websocket, mini-services/

---

## [1.2.0] — 2026-09-10

### Dodano

#### Poslovni model — pivot na provizijo (kot Booking.com)

- **Faza 3c — pivot "ponudniki plačajo"**: turist plača polno ceno neposredno ponudniku;
  platforma obračuna provizijo IZKLJUČNO za rezervacije iz AI kanala
  (`Booking.source = "consultation"`). Rezervacije od drugod ostanejo brez provizije
- **Faza 3d — B2B sinteza**: owner analytics "vrednost AI kanala" (prikazi,
  priporočila, klikovne stopnje) + prenovljena stran `/za-ponudnike`
- **Faza 3e — tedensko poročilo "Vrednost AI kanala"** (cron `weekly-alerts`, B2B flywheel)

#### Provizijski obračun (Faza 4a–4c)

- **4a — provizijski model**: `CommissionInvoice` (idempotentna izdaja na
  koledarski mesec, snapshot stopnje), `/api/owner/commissions` (GET predogled +
  zgodovina, POST `generate` / `mark_paid`), nov zavihek **Provizije** v owner
  dashboardu (KPI, predogled tekočega meseca, zgodovina računov)
- **4b — samodejni mesečni obračun**: cron `/api/cron/commission-invoices`
  (vsak 1. v mesecu, `vercel.json`), e-poštni račun lastniku, deljena logika v
  `src/lib/commissions.ts` (12 % free partnerji / 0 % premium+enterprise)
- **4c — PDF izpis provizijskega računa**: `/api/owner/commissions/invoice-pdf`
  (pdf-lib, vključeni LiberationSans fonti — šumniki delujejo) + realistični
  demo seed (`scripts/seed-demo.ts`: 4 partnerji, 10 listingov, 10 izkušenj,
  6 izdelkov, 5 rezervacij)

#### Faza 5 — kartično plačilo provizijskih računov

- `/api/owner/commissions/checkout` — Stripe Checkout (enkratno plačilo, EUR,
  znesek strežno preverjen iz računa; demo način brez ključev vrne 503 z razlago)
- Webhook `checkout.session.completed` razširjen z `type=commission_invoice`:
  idempotentno označi račun kot plačan (`paidAt`, `stripePaymentId`), audit log,
  potrdilo o plačilu po e-pošti
- Owner dashboard: gumb **"Plačaj s kartico"** (viden samo, kadar Stripe ni v
  demo načinu) + obdelava povratka s Stripa (`?commission=success|cancelled`)

#### Vsebina in engagement (Faza 0–2)

- Faza 0: povezan obstoječi engagement loop, odstranjen lažni UX
- Faza 1: dogodki v načrtih potovanj, AI pakirni seznam, glasovanje skupine,
  PDF izvoz itinererja
- Faza 2: UGC recenzije in javna galerija skupnosti; **"Vprašaj lokalca"**
  (grounded AI Q&A nad bazo lokalov); web push obvestila (VAPID)
- Realne rezervacije izkušenj + potrditvene e-pošte; obnovljen nakupni proces
  tržnice

#### Monetizacija in retencija (Faza 3a–3b)

- Faza 3a: konverzijska pot na 322 SEO straneh + affiliate monetizacija
  (Booking.com, DiscoverCars, Viator, Skyscanner)
- Faza 3b: dnevni push opomniki za shranjena potovanja (cron `daily-trip-push`)
- Faza 3b-2: plačljive konzultacije "Vprašaj lokalca" (freemium B2C) + e-poštna
  dostava s privatno povezavo (`/konzultacija/[token]`)

#### Infrastruktura (Faza 4d–4e)

- **4d — produkcijska namestitev**: Docker + Compose (app + ločen cron vsebnik,
  imenovan volumen, `docker/crontab.template`), `docs/DEPLOYMENT.md`
  (odločitvena analiza Pot A/B), `src/proxy.ts` z varovalko proti neskončni
  standalone zanki (Next.js 16 rewrite loop — 4763 povratnih povezav na 1
  zahtevo prej), `src/lib/sponsorships.ts`
- **4e — Vercel demo runtime DB**: build-time demo SQLite baza
  (`scripts/build-demo-db.sh`: `prisma db push` + seed BREZ super_admin računa —
  varen za javni demo), `src/instrumentation.ts` ob zagonu kopira bazo v
  zapisljivi `/tmp` in preusmeri `DATABASE_URL` (samo na Vercelu, samo za
  `file:` pote, izklop z `DSA_DISABLE_DEMO_DB=1`), `outputFileTracingIncludes`
  vključi `db/` v serverless bundle — vse DB poti (npr. `/api/products`) na
  Vercelu zdaj delujejo; pisanje je per-instanca (demo omejitev, dokumentirano)

### Popravljeno

- **Vercel build padci (30/30 od 15. 7. 2026)**: `prisma generate` zdaj v build
  skripti, `postinstall` hooku IN `next.config.ts` (Vercel poganja lastni build —
  prej klient ni bil generiran → `Module not found: .prisma/client/index-browser`)
- Vercel projekt: `installCommand: bun install` (prej `npm install` → exit 1)
- Vercel-varna build skripta — pogojno kopiranje standalone
  (`scripts/copy-standalone.sh`)
- Podvojen React key v ExperienceModal (BookingSection + ReviewSection)
- webpack dev mode + eksplicitna vrata v dev skripti (OOM stabilnost)

### Spremenjeno

- B2B monetizacija: provizija 12 % na AI-prinesene rezervacije je ZDAJ primarni
  model za free partnerje; Premium (149 €/mes) / Enterprise (499 €/mes)
  naročnina = 0 % provizije + rangirni boost
- `CommissionInvoice` nov atribut `stripePaymentId` (Stripe PaymentIntent za
  uskladitev kartičnih plačil; null = ročno/SEPA)

---

## [1.0.0] — 2026-07-15

### Dodano (Added)

- **AI načrtovalec potovanj** z 3-nivojskim fallback-om (Puter GLM → z-ai-web-dev-sdk → pravila)
- **22 destinacij** v 9 slovenskih regijah z naprednimi filtri (regija, interes, tip, cena, ocena)
- **Interaktivni zemljevid** (Leaflet) z 22 destinacijskimi markerji + POI layer (OpenStreetMap + Wikipedia)
- **Tržnica izdelkov** — 28 slovenskih izdelkov (med, vino, olje, sir, klobase, craft)
- **Tržnica izkušenj** — 28 izkušenj (rafting, kulinarične ture, pohodi, degustacije, wellness)
- **Listings (B2B)** — 25 lokalov (hoteli, restavracije, aktivnosti, transport)
- **Booking panel** — 4 tabi (Nastanitev, Aktivnosti, Hrana, Transport) po vsakem dnevu itinererja
- **Koledar dogodkov** — 30 realnih slovenskih festivalov skozi vse leto
- **Blog** — 16 člankov o slovenskih znamenitostih z markdown vsebino
- **8 zbirk** (Zimski, Poletni, Romantični, Družinski, Kulinarika, Avantura, Eko, Luxury)
- **Owner portal** — registracija, prijava (NextAuth), dashboard z 5 tabi (Lokalci, Izdelki, Izkušnje, Naročnina, Statistika)
- **Admin portal** — geslo-zaščiten dashboard z 3 tabi (Lokali, Leadi, Statistika)
- **Pavšalni oglasni model** — Osnovni (€0), Premium (€149/mes), Enterprise (€499/mes)
- **Beta model** — vse brezplačno do 30 lokalov, samodejni vklop monetizacije
- **Sponzorirana AI priporočila** — premium/enterprise lokalci omenjeni v AI itinererjih
- **Email avtomatizacija** — 5 dvojezičnih (SL/EN) templates (welcome, payment, renewal, lead, admin)
- **Owner Analytics** — KPI (views, clicks, leads, konverzija), ROI izračun, top 5, 30-dnevni trend
- **Multi-language (i18n)** — 4 jeziki (sl/en/de/it) z next-intl
- **SEO** — dinamični metadata, JSON-LD structured data, sitemap.xml (322 URL-jev), robots.txt
- **PWA** — manifest.json, service worker z offline fallback, ikone
- **Pitch deck** — za privabljanje novih ponudnikov z 4 benefiti, 4-koračnim procesom, 3 pričevanji
- **AI priporočila** ("Morda vam je všeč") v product in experience modalih
- **Stripe Subscriptions** — demo mode (production-ready z realnimi ključi)
- **Cron job** za 7-dnevne renewal opomnike
- **Affiliate sistem** — Booking.com, DiscoverCars, Viator, Skyscanner, WorldNomads
- **Redirect model** — uporabnik gre direktno na ponudnikovo stran (ne pobiramo plačil)

### Tehnologije (Technologies)

- Next.js 16 (App Router, Turbopack)
- TypeScript 5.9 (strict mode)
- Tailwind CSS 4 + shadcn/ui (New York)
- Prisma 6 + SQLite
- NextAuth.js v4 (Credentials provider, bcrypt hashing)
- z-ai-web-dev-sdk (GLM) za AI
- Leaflet + OpenStreetMap Overpass API
- next-intl v4 (4 jeziki)
- Nodemailer (email)
- Stripe (plačila)
- Zustand + TanStack React Query (state management)
- Framer Motion (animacije)

### Varnost (Security)

- bcryptjs za hashiranje gesel (10 rund)
- Ownership preverba na vseh B2B API-jih
- GDPR privolitev pri registraciji
- Admin geslo preko env spremenljivke
- `.env` in `data/leads.json` v `.gitignore`

### Infrastruktura (Infrastructure)

- GitHub Actions CI/CD (lint + type check + build)
- GitHub repo: https://github.com/markec12345678/Discover-Slovenia-AI
- README.md (18.7KB temeljita dokumentacija)
- SECURITY.md (varnostna politika)
- LICENSE (MIT)
- CONTRIBUTING.md (prispevni vodič)
- .env.example (konfiguracijska predloga)

---

## Lega

- `Dodano` — nove funkcionalnosti
- `Spremenjeno` — spremembe obstoječih funkcionalnosti
- `Odstranjeno` — odstranjene funkcionalnosti
- `Popravljeno` — popravki napak
- `Varnost` — varnostne popravke
