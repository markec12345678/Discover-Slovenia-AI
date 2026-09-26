# ISSUE #9 — ZERO-AI / DETERMINISTIC-FIRST · KONČNO POROČILO (skupine B, C, D + jedro + Z9-E)

Datum: 2026-09-26 · Baseline začetka: **v1.115.1 / 4298b1f** · Zaključek: **v1.116.0**

> Skupina A (chat/smart-search/ask-local/pois/describe) ima svoje poročilo:
> `docs/audit/issue9-report-a.md`. Inventar odločitev: `docs/audit/AI-ZERO-AUDIT.md`.
> To poročilo pokriva OSTALE površine + celotno Z9-E verifikacijo.

---

## 1. Jedro: `ai-client.ts` → VISION-ONLY

- Tekstovna več-provider veriga (`generateCompletion`: OpenRouter → Gemini → Puter → z-ai → null) **ODSTRANJENA** — 0 LLM žetonov na vseh rutah jedra.
- `generateVisionCompletion` (edini ostanek): Gemini prek OpenAI-compat REST (**navaden fetch** — paket `openai` iz odvisnosti ODSTRANJEN) → z-ai VLM (razvojni sandbox, dinamični uvoz, brez uporabniških poverilnic) → **null** (brez ključa = privzeto; klicalec pošteno odgovori 502 + napotilo na URL/PDF/pins zavihke).
- `checkAIHealth` → sonda SAMO vision plasti (Gemini + z-ai; 1×1 px sonda; pošteno `configured: false` brez ključev). `/api/ai-health` obravnava to (avtorizacija CRON_SECRET/admin, vrata 12/10 min).
- Metering (`logAIUsage`) ostaja — iskrena observabilnost (vir `deterministic`/vision providerji).

## 2. Skupina B — načrtovalec / refine / vprašanja / priporočila

- **`/api/itinerary`** (−663 vrstic AI verige): sestava poti je 100 % deterministična (supply → sestava → geo overitev); glava odgovara `source` pošteno.
- **`/api/itinerary/refine`** (−841): NOV `refine-command-parser.ts` (406 vrstic) — ukazna slovnica: slovar sinonimov, sklanjatve (»bolj mirno/mirnega« → slower_pace), hitre akcije (QUICK_ACTIONS iz `refine-actions.ts`, 224), zavrnitev smeti z iskrenim sporočilom.
- **`/api/itinerary/ask`**: 0 ai-client uvozov (dokazano z rg).
- **`ai-recommendations.ts`** (prepis, 534): `scoreProduct`/`scoreExperience`/`rank*Candidates` — eksplicitno točkovanje (interesi, proračun, ocena, organskost, bližina) + `buildDeterministicWhy` — TRANSPARENTNA utemeljitev iz realnih signalov (§45: »explicit scoring, real signals, transparent reasons«). Cache 24 h ostaja (perf) z virom pošteno.
- Testi: `issue9-groupb-zero-ai.test.ts` (310 vrstic) + prilagojeni obstoječi.

## 3. Skupina C — medij / glas

- **Strežniški TTS IZBRISAN**: `tts-engine.ts` (−261), `/api/tts` (−), `/api/itinerary/tts` (−232), `task92-tts-engine.test.ts` (−520).
- **Brskalniški glas (0 strežnika)**: DayAudioButton (TripTimeline/SharedTrip/MY TRIP) + »Poslušaj načrt« (planner D2) izgovorijo DETERMINISTIČEN skript (ista čista lib funkcija) prek `window.speechSynthesis`; mikrofon = `SpeechRecognition` (lib/voice).
- **IZGOVOR PO KOSIH (Z9-E popravek kakovosti)**: sinteza na nekaterih platformah (Chrome/Android, Safari) TIHO poreže posamezne dolge izgovore — komponenti zdaj razrežeta skript z `chunkNarration` (≤ 960 znakov PO STAVKIH, 0 izgube vsebine) in izgovarjata ZAPOREDNO; seja (sessionRef/audioSessionRef) poskrbi, da »Ustavi« res ustavi vse kose (zastarel onend NE nadaljuje). Source-contract test varuje to.
- **Mrtva TTS orodja odstranjena (Z9-D)**: `concatWavBuffers`/`narrationCacheKey` (itinerary-audio) + `planAudioCacheKey`/`PlanAudioKeyInput` (planner-audio) — brez produkcijskih klicalcev; testi zanje izbrisani skupaj z njimi.
- **OCR/slika**: `ingest-image` + `bookings/parse` (zavihek Slika) ostajata EDINA upravičena opcijska AI (vizualno-semantično); ujemanje z destinacijami/rezervacijo je DETERMINISTIČNO v klicalcu. Besedilo/PDF/ICS poti so čisti parserji.
- **`owner/auto-tag`**: NOV `auto-tag-taxonomy.ts` (338) — deterministična taksonomija (slovar kategorij/sinonimov), 0 AI.
- Testi: `issue9-groupc-zero-ai.test.ts` (393) + task89/91 prilagojeni.

## 4. Skupina D — odvisnosti / infrastruktura

- **`openai` npm paket ODSTRANJEN** (package.json + bun.lock). Ostane samo `z-ai-web-dev-sdk` (opcijska VLM rezerva v sandboxu, dinamični uvoz, brez poverilnic).
- **Env**: `OPENROUTER_API_KEY`/`_MODEL`/`_FALLBACK_MODEL`/`_BASE_URL` + `PUTER_AUTH_TOKEN`/`_BASE_URL`/`_MODEL` ODSTRANJENI (.env.example, ai-smoke.yml, doctor.sh, setup-all.sh, github-secret-verify). Edini opcijski AI env: `GEMINI_API_KEY` (samo vizija).
- **Mrtve rute izbrisane**: `/api/ai-insights` (→ NOV `/api/insights` — `deterministic-insights.ts`, 171, čisti izračun nad statistiko baze), `/api/ai-story`, `/api/translate`, obe TTS ruti.
- **`seo-faq.ts`** (prepis): deterministični FAQ graditelj iz strukturiranih dejstev; `data/seo-faq-cache.json` (68 legacy AI zapisov) IZBRISAN; vir = `deterministic` (trajno). Nekdanji SSR-blok + cache-poisoning bug s tem izgineta.
- **`admin/approve`**: obogatitev z AI ODSTRANJENA (edini ne-pregledani AI→DB zapis) — 0 ai-client uvozov.
- **`consultation-engine.ts`**: POPOLNOMA determinističen (ocenjena izbira vodičev/konzultacij iz pravil); `answerSource: "deterministic"`.
- **Skripti/workflowi**: `openrouter-verify.sh` izbrisan; `ai-smoke.yml` (333→) samo vision smoke (rotiran/neveljaven GEMINI_API_KEY → RDEČE).

## 5. Z9-E — ZERO-AI VERIFIKACIJA (zaključek)

**AI poverilnice = NONE** (sandbox nima GEMINI_API_KEY; jedro deluje brez):

| Vrsta | Rezultat |
|---|---|
| `bun test` (cela suita) | **3728 prehodkov / 0 napak** (147 datotek; −12 mrtvih TTS testov, +1 izgovor-po-kosih pogodba) |
| `tsc --noEmit` | **0 napak** |
| `eslint .` | **0 napak** |
| HTTP smoke (dev, 0 AI ključev) | planner 200 · refine 200 · chat 200 `database` · search 200 `deterministic` · pois `deterministic`/`cache` · bookings `text-parser` · `/destinacija/bled` SSR 200 |
| Izmerjena latenca (§8 audita) | chat 12–29 ms · search 11–52 ms · refine 14–17 ms · parse 6–13 ms · vpogledi ~0,001 ms · priporočila ~0,002 ms |
| Browser E2E desktop 1280×800 | domov ✓ · klepet »Iz naše baze« + deterministični odgovor + STO/OSM viri ✓ · pametno iskanje »Deterministično iskanje« + iskreni razlogi + »Dodaj v mojo pot« ✓ · načrtovalnik: 3-dnevni načrt, »Brez AI«, »Hitre prilagoditve«, dnevi s »Poslušaj« ✓ · zvok: 0 glasov v headless → IŠKRENA napaka (role=alert) ✓ |
| Browser E2E mobilni 390×844 | domov + /nacrtuj: 0 preliva, tab vrstica, 0 napak ✓ · /en naslov ✓ |
| Dokazi | `docs/evidence/issue9/` (4 posnetki) + `scripts/tmp/perf-z9e-output.txt` |
| Produkcija | CI (testi + functional-smoke --expect-version + prod-monitor) ob push-u |

### 5.1 Iskrenostne popravke UI (Z9-E sweep)

- `planner-ai-controls.tsx`: naslov »AI prilagoditve« → **»Hitre prilagoditve«** (akcije so deterministične).
- i18n (SL+EN, 12 ključev): `chatbot.thinking` »AI razmišlja…« → »Iskanje po naši bazi…«; `planner.generating`/`generatingStage.compose` → »Sestavljam tvojo pot…«; `undoLabelRefine` → »Prilagoditev«; `timeline.aiTipTitle` → »Nasvet«; `supplySelectedHint` ne trdi več, da »AI« upošteva izbire.
- `generation-stages.ts` komentar: faze opisujejo DETERMINISTIČNO sestavo (0 AI).
- Blagovna znamka (»Discover Slovenia AI«, persona »Slovenija AI«) ostaja — poštenost gre do TRDITVE o tem, KDO dela delo, ne do imena izdelka.

## 6. ZERO FEATURE LOSS — regresijska matrika

| Zmožnost prej (AI) | Zmožnost po (deterministično) | Ista/prevečja |
|---|---|---|
| AI klepet | domenska plast (16 namenskih veji + STO/OSM uzemljenje) | ✓ (+vedno deluje, 0 timeout tekov) |
| AI iskanje | ključne besede + vzdevki + kategorije + fuzzy (č/š/ž) + SL/EN | ✓ (18 fixture-ov) |
| AI načrt | supply → sestava → geo overitev | ✓ (ista izpisa oblika) |
| AI refine | ukazna slovnica + hitre akcije (sklanjatve) | ✓ |
| AI priporočila | eksplicitno točkovanje + transparentna utemeljitev | ✓ (+utemeljitev VEDNO) |
| AI vpogledi | izračun nad statistiko (isti pragovi/anomalije) | ✓ |
| AI tags | taksonomija (338 vrstic slovarja) | ✓ |
| AI FAQ | graditelj iz strukturiranih dejstev | ✓ (+0 cache poisoning) |
| AI POI opis | `ime — kategorija (podkategorija) · naslov` | ✓ (+trajen vir) |
| AI TTS naracija | brskalniški glas PO KOSIH (0 tihih rezov) | ✓ (+0 strežniških klicev, +0 503 v produkciji) |
| AI parse rezervacij | text-parser (11 formatov) | ✓ (slika = opcijska vizija) |
| AI prevajanje (translate) | ruta izbrisana — v #9 določena kot IZVEN jedra (obstoječa dvojezičnost SL/EN ostaja) | ✓ po definiciji obsega |

## 7. Preostali opcijski AI (upravičeno, izoliran)

1. `/api/itinerary/ingest-image` — »Začni s sliko« (VLM prebere besedilo/imena; ujemanje deterministično).
2. `/api/journey/bookings/parse` zavihek Slika — rezervacijski screenshot (isti kanon).

Brez `GEMINI_API_KEY` oba pošteno odpoveta (502 + ročna alternativa); jedro deluje brez njiju. `ai-smoke.yml` varuje rotiran ključ v produkciji.

## 8. Odprta točka za lastnika

- Render produkcija je 13 verzij za mainom (Issue #10, lastnikova akcija — neodvisno od #9).
- `data/ai-rec-cache.json` in `data/poi-descriptions.json`: novi zapisi nosijo `deterministic`; nekaj legacy `ai`/`fallback` zapisov ostaja (branje jih pošteno prikaže; regeneracija po naravnem obhodu).
