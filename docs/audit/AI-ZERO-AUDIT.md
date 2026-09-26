# AI-ZERO-AUDIT — ZERO-AI / DETERMINISTIC-FIRST (Issue #9)

Datum: 2026-09-26 · Baseline: **v1.115.1 / 4298b1f** (main, clean, pushed) · Faza: Z9-A (read-only inventar) → Z9-B/C/D/E (implementacija)

> **Mandat lastnika (Issue #9):** čim manj AI — idealno NIČ runtime LLM odvisnosti v jedru izdelka.
> Arhitektura: REALNI PODATKI + DETERMINISTIČNA KODA + SDK + SKRIPTI + PRAVILA + PARSERSKI + BRERSKI API-ji.
> Breme dokaza je na ZADRŽANJU AI, ne na odstranitvi. Enaka zmožnost, manj AI, nič izgube funkcij.

---

## 1. CURRENT HEAD — izhodišče

- `git log` main: `4298b1f` (v1.115.1, Issue #7 produkcijska sprava), prej `4fcc380` (v1.115.0, Issue #8 Faza 4).
- Testi: 3671/3671 zeleni (Issue #7 zaključno stanje); `tsc` 0; lint 0.
- Sandbox `.env`: SAMO `DATABASE_URL` — **NI AI ključev** (razvoj že teče po zero-AI padcih).
- Paketa AI: `openai` ^6.46.0 (OpenAI-compat klient za OR/Gem/Puter noge), `z-ai-web-dev-sdk` ^0.0.18 (platformski SDK: text noga 4, VLM noga 2, TTS). Ostalo: `unpdf`/`pdf-lib` = deterministični PDF (0 AI).

## 2. POPOLN INVENTAR AI KLIČEV (current HEAD, dokazano z `rg`)

En hub `src/lib/ai-client.ts` (text: OpenRouter→Gemini→Puter→z-ai→`null`; vision: Gemini→z-ai→`null`) + `src/lib/tts-engine.ts` (z-ai TTS). 19 uvoznikov `ai-client` + 2 TTS ruti + health sonda:

| # | Površina | Pogoj za AI klic (current) | Deterministična alternativa (isti fajl/modul) | Odločitev (#9) |
|---|---|---|---|---|
| 1 | `api/itinerary` POST (`:801`) | **DEFAULT** za `engine:"auto"`/brez (70 s race) | `buildDeterministicPlanResponse` + `generateDeterministicItinerary` (naravna pot `engine:"deterministic"`) | **REMOVE AI** — deterministični motor postane kanonska EDINA pot |
| 2 | `api/itinerary/refine` (`:749`) | DEFAULT za prosti jezik (hitre akcije že 0-LLM) | `applyQuickAction` + validiran echo | **REPLACE** — deterministična ukazna gramatika (§7) za prosti jezik; AI stran |
| 3 | `api/itinerary/ask` (`:187`) | SAMO ko `answerPlanQuestion` vrne null | `answerPlanQuestion` + `buildUnknownAnswer` | **REMOVE AI** — computed-first postane edina; nepoznano → iskrena odklonitev |
| 4 | `api/itinerary/ingest-image` (`:132`) | VEDNO (VLM je edina pot za sliko) | `matchDestinationsInText` PO ekstrakciji (deterministično) | **KEEP AI OPTIONAL** — pravi vizualno-semantični problem; 502/422 pošteno |
| 5 | `api/chat` (`:329`) | **DEFAULT vsak request** (ni intent vrat; 25 s race) | `buildDomainFallbackAnswer` (10+ namenskih ujemanj, OSM/Open-Meteo/baza) — LE v catch | **REMOVE AI** — domenska plast postane PRIMARNA (intent vrata prej, 0 omrežja) |
| 6 | `api/smart-search` (`:178`) | **DEFAULT vsak query** (15 s race) | `fallbackSearch` (word-overlap) — LE v catch | **REPLACE** — polni deterministični iskalnik (normalizacija, aliasi, fuzzy, kategorije) |
| 7 | `api/ask-local` (`:257`) | **DEFAULT** (kvota 1/dan) | `buildFallbackAnswer` (top-3 realne vrstice baze) | **REMOVE AI** — baza postane primarni odgovor; kvota ostane (produkt/funnel) |
| 8 | `api/pois/describe` (`:173`) | ob cache miss | template ena-vrstica | **REPLACE** — deterministični graditelj opisa iz strukturiranih polj; odpravljen cache-source bug |
| 9 | `lib/ai-recommendations.ts` (`:698`,`:753`) | kadar >4 kandidatov (izbira 4 od 10) | SQL top-4 + `buildDeterministicWhy` | **REPLACE** — transparentno uteženo točkovanje (kategorija/regija/cena/ocena/…) |
| 10 | `api/ai-insights` (`:269`) | DEFAULT ob odprtju nadzorne plošče | `generateFallbackInsights` (pragova pravila) | **REPLACE** — deterministična analitika (trendi/stopnje); preimenovali v `/api/insights` |
| 11 | `api/owner/auto-tag` (`:119`) | eksplicitni gumb | `fallbackTag` (slovar ključnih besed) | **REPLACE** — polna taksonomija SL+EN slovarjev; human-in-the-loop ohranjen |
| 12 | `api/ai-story` (`:57`) | vsak modal (javna, brez avt.) | echo opisa | **REPLACE** — deterministična predloga iz strukturiranih polj; poštena oznaka vira |
| 13 | `api/admin/approve/[id]` (`:272`) | samodejno ob odobritvi; **piše v `Listing.specialties` BREZ review** | nič (tiha preskočitev) | **REMOVE AI** — enrichment izbrisan (edini ne-pregledani AI→DB zapis; §16/§24) |
| 14 | `api/translate` (`:85`) | nikoli iz aplikacije (dev orodje, 0 klicev) | echo originala | **REMOVE ROUTE** — mrtev razvojni pomočnik |
| 15 | `lib/seo-faq.ts` (`:98`) | SSR ob cache miss — **BLOKIRA izris** | `generateFallbackFaqs` (predloge) | **REPLACE** — graditelj FAQ iz realnih DESTINATIONS podatkov; 0 blokiranja; padec cache-strupenja (90 d) |
| 16 | `lib/consultation-engine.ts` (`:413`) | DEFAULT ob oddaji obrazca | `buildFallbackConsultation` (ocenjena izbira + 4-sekcijski načrt) | **REPLACE** — deterministični motor primarni |
| 17 | `api/journey/bookings/parse` text/PDF (`:227`,`:284`) | AI PRIMA (deterministični regex kot rezerva) | `parseReservationText` (27 znamk) + ICS parser + unpdf | **REMOVE AI** — deterministični parser PRIMA; neprepoznano → iskren 422 + ročni vnos |
| 18 | `api/journey/bookings/parse` slika (`:368`) | VLM edina pot | nič (502 pošteno + ročna forma) | **KEEP AI OPTIONAL** — vizualno-semantično (OCR iz slike = berljivo le z VLM); pošten 502 |
| 19 | `api/ai-health` (`:31`) | sonde 4 providerjev | — | **SIMPLIFY** — po redukciji na vision: sonda samo vision noge (Gemini/z-ai); avtentikacija CRON_SECRET ostane |
| 20 | TTS: `tts-engine.ts` + `/api/tts` + `/api/itinerary/tts` | ob LRU miss (z-ai SDK edini vir) | brskalniški `SpeechSynthesis` (že v chatbotu); naracijski skript 100 % determinističen | **REMOVE server TTS** — klientni browser TTS prepiše isti naracijski skript (§13); 0 strežniškega AI |

Strnjen pregled AI tekststovne verige: **16 od 20 površin izgubi AI** (REMOVE/REPLACE), **2 ostaneta kot IZOLIRANA OPCIJA** (vizija: ingest-image + bookings/parse slika), 1 se poenostavi (health), 1 se umakne v brskalnik (TTS).

## 3. STARO ↔ TRENUTNO spravo (T5-a1 revizija, v1.100.3 → v1.115.1)

| T5-a1 # | Površina | Status na current HEAD | Sprememba od T5 |
|---|---|---|---|
| 1 | itinerary AI generacija | ŠE PRESENT (default auto) | ni spremembe → Z9-B odstranitev |
| 2 | itinerary engine:deterministic | PRESENT (TASK 100) | — osnova za kanonizacijo |
| 3 | refine NL | PRESENT | — → ukazna gramatika |
| 4 | refine hitre akcije | ALREADY DETERMINISTIC (0 LLM, PRIMA) | — |
| 5 | plan Q&A | PRESENT (computed-first že) | — samo AI noga stran |
| 6 | URL ingest | ALREADY DETERMINISTIC | — |
| 7 | ingest-image VLM | STILL PRESENT (AI-REQUIRED za vizualno) | — ohranimo kot opcijsko |
| 8 | PDF ingest | ALREADY DETERMINISTIC (unpdf) | — |
| 9 | pins ingest | ALREADY DETERMINISTIC | — |
| 10 | bookings/parse | DELNO: text/PDF imata AI primo + deterministično rezervo (Issue #5 dodalo parser); slika VLM-only | rezerva obstaja → obrnemo vrstni red |
| 11 | smart-search | AI-default, keyword rezerva | — → deterministični motor |
| 12 | chat | AI-default, domenska rezerva | — → domenska plast PRIMA |
| 13 | ask-local | AI-default, baza rezerva | — → baza PRIMA |
| 14 | translate | AI-default, echo rezerva | 0 klicateljev → brišemo route |
| 15 | ai-insights | AI-default, pragovi rezerva | — → deterministična analitika |
| 16 | ai-story | AI-default, echo rezerva | — → predloga |
| 17 | pois/describe | AI ob miss + cache-source bug | bug potvrjen → popravimo z odstranitvijo AI |
| 18 | auto-tag | AI ob gumbu, slovar rezerva | — → slovar primarni |
| 19 | admin/approve enrichment | STILL PRESENT — tihi AI→DB zapis | edina ne-pregledana persistenca → BREZ |
| 20 | save | ALREADY DETERMINISTIC | — |
| 21 | ai-recommendations | AI izbira 4/10 + deterministicWhy | — → uteženo točkovanje |
| 22 | consultation | AI-default + polna rezerva | — → rezerva postane motor |
| 23 | seo-faq | AI ob miss, blokira SSR, 90-d strup | — → deterministični graditelj |
| 24 | TTS | z-ai SDK enojni vir | — → browser SpeechSynthesis |
| 25 | ai-health | sonde 4 providerjev | — → samo vision |

T5-a1 ugotovitve #1–#9 (vrzeli): #1 vision brez fallbacka (ostaja kot poštena opcijska odločitev), #2 TTS enojni vir (rešeno z brskalnikom), #3 neenotni hard capi (moot — AI gre stran), #4 seo-faq SSR blokada (rešeno), #5 pois/describe trajni cache (rešeno), #6 ask-local kvota (ostaja — produkt), #7 admin tagi brez review (rešeno z odstranitvijo), #8 zastarela izjava vira (popravimo vir-podatkov + i18n), #9 health AI signal (poenostavimo na vision).

## 4. MATRIKA ZAMENJAV (dokazni red)

| Zmožnost | Stara implementacija | Nova implementacija | Točke dokaza |
|---|---|---|---|
| Načrtovanje itinererja | LLM JSON → sanitize → validacija | `generateDeterministicItinerary` (kanon) + skupna obogatitvena veriga | task100 suite (128–404) ostane; novi source-contract testi |
| Prosti-jezikovni refine | LLM mutacija | `refine-command-parser` (grammar → typed ukaz → `applyQuickAction`-ekvivalentna mutacija) | fixture: ceneje/dodaj Bled/prestavi na soboto/… SL+EN |
| Q&A o načrtu | computed-first + LLM fraziranje | `answerPlanQuestion` (razširjeni nameni) + `buildUnknownAnswer` | plan-qa suite + novi |
| Klepet | LLM + domenska rezerva | domenski engine PRIMA (intent vrata; 0 AI omrežja) | chat-domain suite (adaptiran) |
| Pametno iskanje | LLM ranking + keyword rezerva | `deterministic-search` (normalizacija/aliasi/fuzzy/trigram/kategorije) | fixture: SL/EN/tipkarske napake/aliasi/večbesedne |
| Vprašaj lokalca | LLM grounded + baza rezerva | baza PRIMA (iste vrstice, uteženo) | ask-local testi (novi) |
| POI opis | LLM ena-vrstica + trajni cache | `buildPoiDescription` iz strukturiranih polj | fixture + cache vir "deterministic" |
| Priporočila tržnice | LLM izbira 4/10 | uteženo točkovanje + transparentni `why` | issue4-wave5 suite (deterministični del) |
| Vpogledi (admin/owner) | LLM povzetki | deterministična analitika (stopnje/trendi/pragovi) | novi fixture testi |
| Auto-tag | LLM klasifikacija | slovarji taksonomije (SL+EN; kuhinja/aktivnosti/geografija) | novi fixture testi |
| Zgodba lokalca | LLM storytelling | predloga iz realnih polj (opis/posebnosti) | novi fixture testi |
| SEO FAQ | LLM + 90-d cache (blokira SSR) | graditelj iz DESTINATIONS (dejavnosti/highlights/tagline) | novi fixture testi |
| Konzultacija | LLM načrt + rezerva | deterministični motor (ocenjena izbira, 4 sekcije) | adaptirani testi |
| Rezervacije text/PDF/email | LLM primo + regex rezerva | deterministični parser PRIMO (ICS→regex→unpdf) | issue5-t5d/issue6-d6b/task31 suite (adaptirani) |
| Naracija zvok | z-ai TTS WAV | browser `SpeechSynthesis` + isti naracijski skript | klientni contract testi |
| Slika → destinacije/rezervacija | VLM | **VLM (opcijsko, izolirano)** — edini ostanek | 502/422 poštenost ostaja |

## 5. OSTATKI OPCIJSKEGA AI (in zakaj jih ni mogoče razumno odstraniti)

1. **Vizualno-semantično razumevanje slik** (`ingest-image`, bookings/parse slika):
   - OCR bi prebral besedilo, NE pa prepoznal orientir na fotografiji; `tesseract.js` = WASM + traineddata (~10–20 MB) za robno korist, §28 prepoveduje zamenjavo AI s hujšo odvisnostjo.
   - Ostanek je OPCIJSKO: brez `GEMINI_API_KEY` in delujočega z-ai VLM → pošten 502 + ročna alternativa (URL/PDF/pins zavihki delujejo). Jedro deluje brez njega.
2. **z-ai-web-dev-sdk** (VLM rezerva v razvojnem sandboxu; brez poverilnic uporabnika). Po odstranitvi TTS je to edini z-ai klic — dinamični uvoz, samo v `ai-client.ts`.
3. **`GEMINI_API_KEY`** — edini opcijski env za AI (vizija). Ni zahtevan za nobeno jedro.

## 6. ODVISNOSTI / ENV

| Element | Odločitev |
|---|---|
| `openai` (npm) | **ODSTRANIMO** — Gemini vision gremo prek navadnega `fetch` (OpenAI-compat REST); `openai` je bil potreben le za OR/Gem/Puter tekst noge |
| `z-ai-web-dev-sdk` | **OHRANIMO** (samo opcijska VLM rezerva, strežniško, dinamično) |
| `OPENROUTER_API_KEY`/`_MODEL`/`_FALLBACK_MODEL`/`_BASE_URL` | **ODSTRANIMO** (.env.example, ai-smoke.yml, doctor.sh, setup-all.sh, openrouter-verify.sh [brisi], github-secret-*) |
| `PUTER_AUTH_TOKEN`/`_BASE_URL`/`_MODEL` | **ODSTRANIMO** |
| `GEMINI_API_KEY`/`_MODEL`/`_BASE_URL` | **OHRANIMO** (opcijsko — samo vizija) + poštena dokumentacija |
| `APP_URL` (OpenRouter atribucija) | odstranimo uporabo v ai-client |
| `AIUsageLog` (Prisma) | **OHRANIMO** (iskrena observabilnost: `source` sedaj `deterministic`/`fallback`/`cache`/vision providerji) |
| `data/seo-faq-cache.json` | deterministično regeneriranje → odstranimo ozirom prepišemo z virom "deterministic" |
| `data/ai-rec-cache.json` | obdobje 24 h za deterministične izračune (perf) — vir pošteno |
| `data/poi-descriptions.json` | samo deterministični zapisi, vir popravlj |

## 7. ARHITEKTURNA PRAVILA (source-contract, testno varovana — §34/§35)

1. Noben modul avtoritete (geo/routing/urniki/zaprtja/vreme/proračun/supply/rezervacije/persistenca/permissions) NE sme uvažati `ai-client`.
2. Jedrne rute (itinerary/refine/ask/chat/smart-search/ask-local/pois/insights/story/auto-tag/consultation/bookings-parse-text) NE smejo vsebovati `generateCompletion`.
3. `generateVisionCompletion` sme obstajati SAMO v `ai-client.ts` + ga smejo uvažati samo `ingest-image` + `bookings/parse` (slika).
4. `package.json` ne sme vsebovati `openai`.
5. `.env.example` ne sme vsebovati OPENROUTER/PUTER spremenljivk.
6. Deterministični rezultati se persistirajo/nocacheirajo SAMO pod iskrenim virom (`deterministic`), nikoli pod `ai`.
7. Hierarhija resnice: kanonična baza > deterministični izračun > preverjen zunanji vir > (opcijski) AI predlog — AI NIKOLI ne avtorizira.

## 8. UČINKOVITOST (Z9-E izmerjeno — 2026-09-26, dev strežnik, topli klici, 3 merjeni klici/pot; skript `scripts/tmp/perf-z9e.ts` + izpis `scripts/tmp/perf-z9e-output.txt`)

| Pot | AI prej (tek 25 s + omrežje, ko je bila živa) | Deterministično po | Omrežni klici po |
|---|---|---|---|
| planner | AI klic v verigi (sandbox 1–15 s) | **305–1110 ms** (supply → sestava → geo overitev; dev) | 0 AI |
| search | AI klic (sandbox 1–15 s) | **11–52 ms** (`source: deterministic`) | 0 AI |
| chat | AI race 25 s + fallback | **12–29 ms** (`source: database`) | 0 AI |
| refine | AI klic + fallback | **14–17 ms** (ukazni parser) | 0 AI |
| priporočila | AI klic | **~0,002 ms** (lib izračun, 1000×: točkovanje + razvrstitev + utemeljitev) | 0 AI |
| FAQ | AI klic (SSR blokira) | strani SSR **320–760 ms** celotna stran (vključno layout; FAQ graditelj v isti zahtevi, 0 ločenih klicev) | 0 AI |
| POI opis | AI klic | **51–55 ms** (nov, `deterministic`) / **12–32 ms** (cache) | 0 AI |
| vpogledi | AI klic | **~0,001 ms** (lib izračun, 1000×) | 0 AI |
| TTS naracija | 503 v produkciji (brez ključa) | **brskalnik** (window.speechSynthesis, 0 strežniških klicev, izgovor po koseh ≤ 960 znakov) | 0 AI |
| rezervacije parse | AI klic (besedilo) | **6–13 ms** (`via: text-parser`) | 0 AI |

> Opombe: (1) številke so IZDEVALSKI (Next dev, brez produkcijske optimizacije) —
> smiselne za primerjavo RELATIVNE cene (vse poti < 1,2 s tudi v dev, največ
> planner zaradi geo-overitve in supply poizvedb); produkcijske ≡ CI
> funkcionalne preveritve tečejo ob vsakem push-u. (2) "AI prej" stolpec
> opisuje nekdanjo verigo ob živem ponudniku; po #9 te poti NE obstajajo več
> (source-contract testi varujejo odsotnost). (3) Vizija (ingest-image /
> rezervacijski screenshot) ostaja OPCIJSKA in NI merjena tu — jedro je ne
> pokliče (brez GEMINI_API_KEY vrne null → iskren 502).

## 9. Natančnost (fixtures — izpolnjeno Z9-E)

Fixture suite-i Issue #9 (skupaj **119 testov / 415 asercij**, 4 datoteke):

- `issue9-groupa-zero-ai.test.ts` — iskalnik (18 fixture-ov: SL/EN, tipkarske napake, vzdevki→kategorije, diakritika, id≠slug, determinizem, limit, prazne/kratke/stopbesedne) + funkcijska smart-search/ask-local/pois/describe;
- `issue9-groupb-zero-ai.test.ts` — refine ukazni parser (sklanjatve, hitre akcije, zavrnitev smeti) + itinerary/ask/recommendations;
- `issue9-groupc-zero-ai.test.ts` — govorna/avdio plast (speechSynthesis izgovor po koseh, source-contract komponent) + bookings/parse realni formati (7 deterministicnih) + auto-tag taksonomija;
- `issue9-core-zero-ai.test.ts` — jedro (planner domena, seo-faq, insights, consultation) + globalni source-contract (nobena jedrna ruta ne vsebuje generateCompletion).

Prilagojeni obstoječi suite-i: chat-domain-fallback (16), hardening-itinerary-boundary, issue5-t5b-chat-hardcap (prepisano kot #9 source-contract), task89/91 avdio, fa-acceptance, issue4-wave4/5 …

## 10. TEST DOKAZI (Z9-E — 2026-09-26)

- `bun test`: **3740 prehodkov / 0 napak** (147 datotek; vključno 4 novimi suite-i #9, 119 testov) — z NIČ AI ključi v okolju.
- `tsc --noEmit`: **0 napak**. `eslint .`: **0 napak**.
- HTTP smoke na dev strežniku (0 AI ključev): planner/refine/chat/search/pois/parse/destinacija SSR — vsi 200 z iskrenimi viri (`database`/`deterministic`/`text-parser`/`cache`).
- agent-browser E2E (desktop + mobilni 390×844): glej `docs/audit/issue9-report-final.md` §E2E.
- Produkcija ≡ CI: `functional-smoke.sh --expect-version` + produkcijski monitor tečeta ob vsakem push-u (GitHub Actions).

---

## ZAPIS FAZ

- **Z9-A** (ta dokument): read-only inventar — 20 AI površin, sprava T5, matrika odločitev. ✅
- **Z9-B** ✅: odstranitev AI iz jedra (itinerary/refine/ask/chat/smart-search/ask-local/pois/recommendations/insights/tags/story/approve/translate/seo-faq/consultation/bookings-text). Poročilo skupine A: `issue9-report-a.md`; skupine B–D + jedro: `issue9-report-final.md`.
- **Z9-C** ✅: medij/glas — brskalniški TTS klient (speechSynthesis, izgovor PO KOSIH ≤ 960 znakov, 0 tihih rezov; strežniški TTS + tts-engine izbrisana); VLM ostaja izoliran (samo ai-client.ts, dinamični uvoz).
- **Z9-D** ✅: odvisnosti/env/infra čistka (`openai` paket stran; OPENROUTER/PUTER env odstranjeni; openrouter-verify.sh izbrisan; ai-smoke.yml → samo vision; mrtva TTS orodja [concatWavBuffers/narrationCacheKey/planAudioCacheKey] odstranjena).
- **Z9-E** ✅: ZERO-AI verifikacija — 3740 testov, tsc 0, lint 0, HTTP smoke, E2E, meritve §8. Poročilo: `issue9-report-final.md`.
