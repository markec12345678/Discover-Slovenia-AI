# ISSUE #9 — ZERO-AI / DETERMINISTIC-FIRST · SKUPINA A (POROČILO)

Datum: 2026-09-26 · Task ID: **4-a** · Baseline: **v1.115.1 / 4298b1f** (main) · Faza: **Z9-B (skupina A)**

Obseg (samo skupina A): `/api/chat`, `/api/smart-search`, `/api/ask-local`, `/api/pois/describe` + pripadajoči lib/komponente/testi. Ostale površine (itinerary/refine/ask = skupina B; medij/glas + bookings-text = skupina C; insights/story/auto-tag/translate/TTS/approve/seo-faq/consultation = skupine B–D) so v skupnem delovnem drevesu, a IZVEN tega poročila.

**Rezultat: 4 od 4 rut skupine A ima 0 runtime LLM klicev.** `import ... from "@/lib/ai-client"` je v celoti odstranjen iz vseh štirih rut (dokazano z `rg` — edini preostali uvozniki so izven skupine A: itinerary/ask/refine/ingest-image/ai-health/ai-recommendations/bookings-parse[samo vision]).

---

## 1. Spremembe po datotekah

### 1.1 `src/app/api/chat/route.ts` — domenska plast PRIMA (−497 vrstic AI verige)
- AI race (Promise.race 25 s + `throw "Prazen odgovor AI"` + catch → fallback) **ODSTRANJEN** — brez tekov, brez meta AI omrežja.
- Po validaciji + rate limitu (20/10 min, nespremenjeno) + gradnji konteksta ruta **neposredno pokliče `buildDomainAnswer`** (preimenovali smo `buildDomainFallbackAnswer`).
- Kontekst-gradnja ostaja CELA: featured top-10 (listing/product/experience, vsi s `.catch(() => [])`), STO uzemljenje (`buildStoGrounding` + `maybeRefreshStoIndex` fire-and-forget), geo namig (`detectGeoIntent`) + OSM obogatitev (`fetchOverpassNearby`), enricher callback za vrstice destinacije iz baze.
- Odgovor je oblikovno združljiv: `{ message, source: "database", sources, places, timestamp }` — `sources` = STO citati samo kadar je uzemljenje aktivno, `places` kot prej (T1 pin + OSM kraji za mini zemljevid).
- Jezik (`language: "en"`) ostaja — EN odgovori iz domenske plasti.

### 1.2 `src/lib/chat-domain-fallback.ts` → domenski odgovor (PRIMARNI)
- `buildDomainFallbackAnswer` → **`buildDomainAnswer`** (posodobljen tudi uvoz na ruti in v testih).
- **ODSTRANJENA predpona "AI trenutno ni dosegljiv — odgovor je sestavljen iz naših realnih podatkov."** — AI ni več pričakovana, vsaka omemba AI v odgovoru bi bila napačna (test ① to varuje).
- Vsi namenski veji ostajajo: destinacija (vreme/restavracije/aktivnosti/nastanitev/cene/prevozi), greeting, restaurant, weather, price, itinerary, journey, booking/MyTrip, availability, activity, accommodation + iskrena odklonitev z top-3 destinacijami.
- Čistost ostaja: modul NE uvaža db/ai-client — popolnoma unit-testljiv (enricher/weather injectable).
- Popravek iskrenosti: sporočilo ob nedosegljivi napovedi ne omenja več "AI načrtovalec"/"AI planner" (načrtovalnik je determinističen); odstranjena podvojena vrstica v glavi komentarja.

### 1.3 `src/components/chatbot.tsx` — ena sama poštena značka
- `ChatResponse.source`: `"puter" | "z-ai-sdk" | "fallback"` → **`"database"`**.
- Značka v glavi: ena sama (`Database` ikona + `t("badgeDatabase")`) — emerald "AI" / amber "fallback" razlika odstranjena; `t("badgeAI")`/`t("badgeFallback")` se ne uporabljata več (ključi v i18n JSON ostajajo — lastnik jih lahko počisti; glej §3).
- `offlineFallback` pot ob omrežni napaki + 30 s klientni AbortController (`CHAT_FETCH_TIMEOUT_MS = 30_000`) **OSTAJATA** (omrežna varovalka, ne AI mehanizem).
- Zastareli GLM/Puter komentarji: odstranjeni (grep dokaz: 0 zadetkov za `puter|z-ai|GLM`). Počiščeni tudi zavajujoči "AI odgovor/AI-ju" komentarji (lazy Leaflet, ChatMessage, quick prompts, geo oddelek, T2 viri "podatek → odgovor → vir → dejanje").

### 1.4 `src/lib/deterministic-search.ts` — NOV ČIST iskalnik (0 omrežja/DB/AI)
- `normalize(s)`: lowercase + SL diakritično zlaganje (č→c, š→s, ž→z, ć→c, đ→d + NFD odstranitev ostre/grave/karon).
- `tokenize`: ≥ 2 znaka, SL stopbesede (v, na, za, je, in, kaj, kje, kako, do, iz, pri, ob, z, s) + EN (in, at, for, the, a, to, of, near, what, where).
- Sinonimni slovar → kanonske kategorije: food/wine/hiking/culture/wellness/water/ski/accommodation/nature/family (SL+EN, razširjeno smiselno — degustacija, vinoteka, planina, slap, jama …).
- Destinacijski vzdevki: `DESTINATIONS` iz `@/lib/slovenia-data` + ročni nepravilni pridevniki (blejski/ljubljanski/bohinjski/piranski/postojnska …).
- Tipkarska toleranca: predponsko ujemanje (≥ 3 znaki, pokriva sklanjatve "bledu"→"bled", "muzeji"→"muzej") + Levenshtein fuzzy. **Opomba (začasno strožje od naloge):** fuzzy zahteva ≥ 5 znakov, isto prvo črko, |Δdolžina| ≤ 1 in razdaljo ≤ 2 (≤ 1 za 5–7 znakov) — tri varovalke proti lažnim zadetkom ("piran" ↛ "Tirana", "pojesti" ↛ "poleti"). Zahtevani fixture "ljubljna"→"ljubljana" (razdalja 1) deluje (test 5).
- Točkovanje: uteži polj ime ×3 / tagline ×2 / opis ×1 / kategorija ×2, ×utež zadetka (exact 1 / prefix 0.8 / fuzzy 0.6), + exact/prefix dodatek na imenu destinacije, + kanonska kategorija ×2. Razvrščanje deterministično: score desc → rating desc → ime asc.
- Izvoz `deterministicSearch(query, datasets, limit)` vrača isto per-kategorijo obliko kot prejšnja pot rute (destinations: id/slug/name/tagline/reason; listings/products/experiences: id/name/category/reason) — prazna/kratka/samo-stopbesedna poizvedba → prazni seznami (iskreno).

### 1.5 `src/app/api/smart-search/route.ts` — deterministični iskalnik PRIMA
- ai-client uvoz + AI race + `throw` odstranjeni; ruta **vedno** pokliče `deterministicSearch` nad ISTEMI vrsticami baze, ki jih že pridobiva (destinacije so statični uredniški podatki).
- Odgovor: `{ ...mreže, summary, source: "deterministic" }`; povzetek je iskren strežniški SL niz ("Rezultati determinističnega iskanja po ključnih besedah, vzdevkih in kategorijah …"), brez omembe AI; 0 zadetkov → prazne mreže + iskren povzetek s predlogom.
- **Slug pogodba iz issue5-t5b ostaja pripeta:** `slug: destSlugById.get(d.id) ?? d.id` (4 od 38 destinacij ima id ≠ slug).
- Rate limit (30/10 min), CAP 300 znakov, limit 1–5, metering (`logAIUsage` z virom "deterministic") — vse ostaja. Komentar "0 Promise.race" preimenovan v "0 tekmovanja z AI verigo", da ostane močan source-contract `not.toContain("Promise.race")` (enoten z chat ruto).

### 1.6 `src/components/smart-search.tsx`
- `SearchResult.source`: `"ai" | "fallback"` → **`"deterministic"`**.
- Značka: ena sama nevtralna ("Deterministično iskanje" / "Deterministic search", inline SL/EN po vzorcu datoteke `L.*`) — AI/fallback razlika odstranjena. Navigacijska pogodba (T5-B/H1: vse štiri skupine navigirajo, slug prednosten) nespremenjena.

### 1.7 `src/app/api/ask-local/route.ts` — baza PRIMA
- ai-client uvoz + AI veja odstranjena; `buildFallbackAnswer` → **`buildDatabaseAnswer`** (primarna in edina pot).
- `answerSource` = **`"database"`** (persistiran + vrnjen). Starejše vrstice v bazi nosijo "ai"/"fallback" — UI znese vse tri (glej 1.8).
- Dnevna kvota (1/dan na obiskovalca, piškotek ask_visitor + IP rate limit 10/h) **nespremenjena**; B2B flywheel (premium-aware razvrščanje, recommendedPartners, Listing.aiRecommendations + ListingEvent tracking) nespremenjen; validacija (10–500 znakov, imena destinacij, avtor) nespremenjena.

### 1.8 `src/components/sections/ask-local.tsx`
- AnswerCard: nova veja `answerSource === "database"` → značka **"Odgovor izključno iz naše baze"** (Database ikona); AMBER veja ostaja SAMO za legacy `"fallback"` vrstice ("Brez povezave z AI — izključno iz baze"); "Grounded AI" veja ostaja SAMO za legacy `"ai"` vrstice (poštena zgodovina javnih odgovorov).
- RecentQuestion: "database" + legacy "fallback" → diskretna "iz baze" oznaka.
- Iskrenostne popravke UI kopije: glava sekcije "AI lokalna znanja" → **"Lokalna znanja"**; FreeLimitCard "ker vsak odgovor piše AI, ki bere našo bazo" → "ker vsak odgovor sestavimo previdno iz naše baze realnih podatkov" (prejšnje besedilo je po #9 bilo dejansko napačno).

### 1.9 `src/app/api/pois/describe/route.ts` — deterministični graditelj opisa
- ai-client uvoz + AI klic odstranjena; opis gradi `buildPoiDescription`: `` `${name} — ${categoryLabel}${subcategory ? ` (${subcategory})` : ""}${address ? ` · ${address}` : ""}` `` (kategorije → SL oznake; neznana → iskrena rezerva "zanimivost").
- Cache mehanizem (perf) **OSTAJA**, vsak NOVI zapis pa nosi `source: "deterministic"` — **trajen popravek bug-a L199** (prej so se tudi fallback zapisi označili "ai"). Odgovor: `{ description, source: cached ? "cache" : "deterministic", cached }`.
- Rate limit (60/10 min), 32 KB telesna kap, id regex `[A-Za-z0-9-]{1,64}`, kapiranje name/subcategory/address, admin GET statistika (šteje legacy "ai"/"fallback" pošteno) — vse ostaja.

### 1.10 Testi (4 datoteke)
- **`chat-domain-fallback.test.ts`** (adaptiran): uvoz preimenovan v `buildDomainAnswer`; predpona-iskrenosti asercije ODSTRANJENE (namesto njih: odgovor NE SME trditi udeležbe AI — "AI trenutno ni dosegljiv"/"AI is currently unavailable"/"sem AI"); vsi no-guessing/testi namenov ostanejo (16 testov).
- **`issue5-t5b-chat-hardcap.test.ts`** (prepisana v source-contract #9): ruta NE vsebuje ai-client/generateCompletion/Promise.race, POKLIČE `buildDomainAnswer`, vrača `source: "database"`; kontekst (STO/OSM/DB) ostaja; klientni 30 s abort + ena database značka; funkcionalno: global fetch odbija VSE → 200 s source "database".
- **`issue5-t5b-smartsearch-nav.test.ts`** (adaptirana): slug/nav pogodba (T5-B/H1) ostaja; pričakovanja vira posodobljena na "deterministic" (vključno `slug: destSlugById.get(d.id) ?? d.id`).
- **`issue9-groupa-zero-ai.test.ts`** (NOV, 41 testov): (a) vse 4 rute brez ai-client/generateCompletion/Promise.race + iskreni viri + UI značke; (b) 18 fixture-ov iskalnika (SL/EN/tipkarske/vzdevki→kategorije/večbesedne/destinacije/diakritika/id≠slug/prazne-kratke-stopbesedne/determinizem/limit/oblika) + funkcionalna smart-search (fetch odbija vse → 200 "deterministic", kanonski slug); (c) ask-local DB-gated funkcionalno (3 realne testne vrstice → 201, top-3 v odgovoru z "•", answerSource "database", kvota 1/dan, partnerji, čiščenje vrstic); (d) pois/describe funkcionalno z backup/restore cache datoteke (nov POI → "deterministic"; drugi klic → "cache"; ZAPIS v cacheju nosi "deterministic"; neznana kategorija → "zanimivost"; slab id → 400; GET brez admina → 401).

---

## 2. Testni rezultati

```
$ bun test src/lib/__tests__/chat-domain-fallback.test.ts \
            src/lib/__tests__/issue5-t5b-chat-hardcap.test.ts \
            src/lib/__tests__/issue5-t5b-smartsearch-nav.test.ts \
            src/lib/__tests__/issue9-groupa-zero-ai.test.ts
 90 pass / 0 fail / 350 expect() calls / Ran 90 tests across 4 files. [472ms]

$ bun test src/lib/__tests__/issue9-groupa-zero-ai.test.ts
 41 pass / 0 fail / 156 expect() calls

$ bun test   (CELA SUITA)
 3693 pass / 0 fail / 60270 expect() calls / Ran 3693 tests across 145 files. [17.14s]
```

- `eslint` na datotekah skupine A: **0 napak**. (1 obstoječa napaka `react-hooks/set-state-in-effect` v `src/components/itinerary-audio.tsx` — SKUPINA C datoteka, izven mojega obsega; sporočam skupini C/lastniku.)
- `tsc --noEmit`: **0 napak v src/**; 19 napak izključno v `.next/` generiranih tipih (stale artefakti dev strežnika, ki se sklicujejo na ODSTRANJENE rute ai-insights/ai-story/translate/tts — delo skupin B–D; regenerirajo se ob naslednjem zagonu/buildu) + `.next/types` auto-tag `suggestTags` izvoz (skupina C, izven obsega).
- Runtime smoke: dev strežnik teče, `GET / 200` (dev.log čist); API poti so funkcionalno pokrite z bun testi (direkten klic route handlerjev s popolnoma odbijajočim omrežjem).
- `data/poi-descriptions.json`: test ga varuje z byte-identičnim backup/restore — **0 sledi v repo datoteki** (git diff čist).

---

## 3. Potrebni i18n ključi (i18n JSON-i so zaščitni — NI urejano)

> **NUJNO za lastnika:** dokler ključ ni dodan, next-intl izpiše MISSING_MESSAGE na znački v glavi klepeta (chatbot). To je pričakovano stanje po navodilu naloge (ključi se referencirajo v komponentah in poročajo).

| JSON pot | SL vrednost | EN vrednost |
|---|---|---|
| `src/i18n/messages/sl.json` → `chatbot.badgeDatabase` | `Iz naše baze` | — |
| `src/i18n/messages/en.json` → `chatbot.badgeDatabase` | — | `From our database` |

- Referenca v kodi: `src/components/chatbot.tsx` → `useTranslations("chatbot")` + `t("badgeDatabase")` (izrisano ob `ChatResponse.source === "database"` pogodbi).
- Odveč (lahko odstrani lastnik po dodaji): `chatbot.badgeAI`, `chatbot.badgeFallback` — 0 referenc v komponentah (varovano s testom).
- `askLocal.badgeDatabase` (SL `Odgovor izključno iz naše baze` / EN `Answer from our database only`): sekcija ask-local.tsx je **popolnoma hardkodirana SL brez next-intl priključitve** (ves besedilni slovar datoteke je inline) — niz je zato inline po konvenciji datoteke, ključ pa zgoraj zapisan za PRIhodnjo i18n selitev sekcije.
- smart-search značka je inline dvojezična po obstoječem vzorcu datoteke (`L.badge`: SL "Deterministično iskanje" / EN "Deterministic search") — nov i18n ključ NI potreben.

---

## 4. Nepričakovano / opažanja

1. **Delo v skupnem drevesu:** velik del sprememb skupine A je bilo že v delovnem drevesu (nedokončana prejšnja seja); dokončal sem verifikacijo vsote zahtev, iskrenostne popravke kopije (AI lokalna znanja / "piše AI" / "AI načrtovalec" / zastareli komentarji), popravil podvopljeno vrstico v glavi lib-a, preimenoval komentar smart-search (močan source-contract) in napisal MANJKAJOČO datoteko `issue9-groupa-zero-ai.test.ts` + to poročilo.
2. **`data/poi-descriptions.json` vsebuje 5 LEGACY zapisov z `source: "ai"`** (pred #9). Niso moj obseg (Z9-D jih deterministično regenerira); admin GET statistika jih šteje pošteno, vsak novi zapis pa je "deterministic" (trajno).
3. **Fuzzy toleranca je namenjeno strožja** od gole naloge "Levenshtein ≤ 2 za ≥ 5 znakov" (isto prva črka + |Δlen| ≤ 1; ≤ 2 samo za ≥ 8 znakov) — preprečuje lažne zadetke; vsi zahtevani fixture-i delujejo.
4. **Škofja Loka ni v DESTINATIONS** (38 destinacij) — za diakritični fixture sem uporabil Portorož/Plitvička jezera/Črnomelj.
5. **ask-local funkcionalni test je DB-gated** (pošten skip brez baze, vzorec task28) — v sandboxu baza deluje, test je zelen; create/cleanup vrstic (listing/listingEvent/localQuestion) je best-effort v afterAll.
6. **`/api/ai-health` še vedno uvaža ai-client** (skupina D — poenostavitev na vision nogo). itinerary/ask/refine/route + ai-recommendations še čakajo skupino B.
7. Dev strežnik ni dosegljiv iz agent shell-a (sandbox omrežna omejitev) — runtime dokaz pokrivajo direktni route-handler testi + dev.log health (`GET / 200`).

---

## 5. Preostanek za druge skupine (iz objektiva A)

- Skupina B: itinerary/ask + refine + itinerary/route + ai-recommendations še vsebujejo `generateCompletion`.
- Skupina C: `itinerary-audio.tsx` ima 1 lint napako (`react-hooks/set-state-in-effect`).
- Skupina D: `.next/` stale tipi (19 napak) se regenerirajo; `data/poi-descriptions.json` legacy "ai" zapisi za deterministično regeneracijo.
- Lastnik: dodati `chatbot.badgeDatabase` (SL+EN, §3) — edini blokirajoči korak za prikaz značke.
