# DATA-LAYERS-RAG — Uradni viri (STO/slovenia.info) v Discover Slovenia

> Status: arhitekturna odločitev (Task 27 spec). Raziskava izvedena 18. 9. 2026.
> Naročnikov predlog: 3-plastna arhitektura (lokalni viri / slovenia.info / naši
> podatki) → enoten preverjen podatkovni sloj → AI planer → zemljevid →
> konkretna dejanja. Ta dokument potrjuje smer, popravlja organizacijo in
> definira izvedbo.

## 1. Raziskava: kaj STO (slovenia.info) DEJANSKO ponuja

Preverjeno živo (curl + analiza, 18. 9. 2026):

| Vir | Dostop | Vsebina | Uporabnost |
|---|---|---|---|
| `https://www.slovenia.info/llms.txt` | javen, brez pogojev | indeks jezikovnih različic | vstopna točka |
| `sto-llms-sl.txt` (16 KB) | javen | **56 uradnih kuriranih povezav** v 8 sekcijah (Aktivne počitnice, Terme, V naravi, Gastronomija, Regije in mesta, Top 10 znamenitosti, Načrtujte potovanje …) z enovrstičnimi opisi | ⭐⭐⭐ jedro T2 |
| `sto-llms-en.txt` (17 KB) | javen | enako v EN | ⭐⭐⭐ |
| `sto-llms-stories-en.txt` (169 KB) | javen | ~600 uredniških zgodb (pohodi, varnost v gorah, Juliana Trail …) z opisi | ⭐⭐ kontekst/inspiracija |
| `sto-llms-stories-de.txt` | javen | zgodbe v DE | ⭐ za kasneje |
| sitemap.xml → 7 jezikovnih .gz | javen | popoln inventar URL-jev | ⭐ discover-backlog |
| **Javni API za vsebino/POI** | ❌ ne obstaja | strani so brez JSON-LD; brez razvijalskega API-ja za bazo doživetij | — |
| **NiST** (tourism intelligence) | javen portal | statistika prihodov/nočitev (real-time) | ⭐ verodostojne številke, ne planiranje |
| **Alma** (STO AI vodič) | lastni izdelek STO | njihova AI pomočnica — **ne moremo je ponovno uporabiti** | konkurenčna referenca |

**Ključna ugotovitev:** STO je *sam* objavil llms.txt z izrecno namenov
(»Official structured tourism content from Slovenia.info **for AI
assistants**, search engines, and large language models«). To pomeni:

1. pravna/etična podlaga je čista (vsebina je objavljjena ZA strovno
   porabo s strani AI orodij, kot smo mi),
2. STO želi, da AI orodja njihovo vsebino uporabljajo (njihova AI
   strategija — glej thinkdigital.travel analizo o +9 % organskega
   prometa),
3. nujni pogoji: **vidna atribucija** (»Vir: I feel Slovenia / STO« z
   povezavo) in **brez predstavljanja, da nas je STO odobril**.

## 2. Uporabnikov predlog → izboljšana organizacija

Uporabnikov model (3 plasti po *izvoru*): lokalni viri / slovenia.info /
naši podatki. Težava: »lokalni viri« in »naši podatki« se prekrivata, izvor
sam po sebi pa ni tisto, kar uporabnika zanima.

**Izboljšani model: 3 plasti po ZAUPANJU (»trust tiers«)** — ker je naša
blagovna znamka *iskrenost in preverljivost* (UX-COMPARISON §4.2), in ker
se trust direktno preslika v UI značke:

| Plast | Kaj vsebuje | Značka v UI | Odgovornost |
|---|---|---|---|
| **T1 — Naši podatki** | slovenia-data (22 destinacij), POI opisi, praktični podatki (ure, cene z viri), listings, OSRM razdalje | 🏠 *Preverjeno* | mi stojimo za podatkom; ažurnost je naša dolžnost |
| **T2 — Uradni viri** | STO llms.txt (SL+EN), zgodbe, izbrane strani | 🏛 *Uradni vir — I feel Slovenia (STO)* + povezava | STO je avtor; mi samo prenesemo in datiramo |
| **T3 — Splet v živo** | sproženo po potrebi (vreme, aktualni dogodki) | 🌐 *Preveri pred obiskom* | vedno označeno kot nepreverjeno |

Veriga, ki jo gradi ta model (točno uporabnikova želja):

```
T1+T2+T3 ──► enoten preverjen podatkovni sloj (RAG)
                │
                ▼
        AI planer (uzemljeni odgovori s citati)
                │
                ▼
        zemljevid (T2 vir ↔ geoločeno na naše POI/destinacije)
                │
                ▼
        konkretna dejanja (»Dodaj v načrt«, »Odpri uradno stran«)
```

## 3. Pipeline (ekstrakcija → indeksiranje → odgovor)

### 3.1 Ekstrakcija (ingest)
- Skript `scripts/ingest-sto.ts` (ročno/tedensko): pridobi vse javne
  llms.txt datoteke → razčleni markdown povezave → normaliziraj v
  zapise `{url, title, description, section, lang, provider:"sto"}`
  → zapiši `data/sto-sources.json` **verzioniran v git** (diff videm,
  kaj se je pri STO spremenilo — uredniška kontrola, ne slepo).
- Brez bulk-scrapanja strani: llms.txt + stories indeksa sta dovolj za
  T2 kontekst; poglobitev posamezne strani po potrebi (web-reader).

### 3.2 Indeksiranje (retrieval)
- `src/lib/rag/retrieve.ts`: **leksično iskanje** (normalizacija
  diakritikov čšž, SL+EN stop-besede, uteži: naslov×3 + opis×1 +
  sekcija×2, jezikovna prednost). Brez vektorske baze — pri ~700
  zapisih je BM25-lite determinističen, testljiv, brez stroškov in
  deluje povsod (sandbox/Vercel/Render). Iskrena izbira za našo
  skalo; vektorski emdeddingi so premik, če/-ko indeks zraste čez
  ~10k zapisov.

### 3.3 Uzemljenje (grounding)
- `buildGroundedContext(query, locale)`: top-k T2 zapisov formatiranih
  kot oštevilčen kontekst z citatnimi oznakami [1][2] → vpleten v
  sistemsko sporočilo AI planerja (skupaj z obstoječo
  prompt-injection obrambo iz ai-context.ts — T2 vsebina gre skozi
  wrapProviderData).
- Odgovor nosi **citirane vire**: značke »Vir: I feel Slovenia (STO)«
  s povezavo do izvorne strani.

### 3.4 Geopovezava → zemljevid → dejanja
- Ujemanje T2 naslovov z našimi destinacijami/POI (normalizirano
  vsebovanje niza, npr. STO »Bled« → naša destinacija Bled):
  - zadetek → povezava na /destinacije/[slug] (karta) + »Dodaj v
    načrt« (konkretno dejanje),
  - brez zadetka → samo uradna povezava (še vedno dejanje, brez karte).

## 4. Etika in meje

- ✅ llms.txt je objavljen za AI porabo (namen STO) — uporaba dovoljena
- ✅ vsaka uporabavidno atributivna (značka + link)
- ✅ kazni brez caching strani: indeksiramo samo metapodatke
  (naslov/opis/povezava), ne polne vsebine strani
- ❌ nikoli ne trdimo »v sodelovanju s STO« ali »odobreno s strani STO«
- ❌ ne zrcalimo Alme (njihova AI pomočnica) in ne naštejemo njihovih
  partnerjev kot naših

## 5. Izvedbeni obseg (Task 27)

1. `scripts/ingest-sto.ts` + `data/sto-sources.json` (seed prvič)
2. `src/lib/rag/` — retrieve.ts (iskanje) + ground.ts (kontekst) +
   types.ts; geopovezava na slovenia-data
3. `/api/ai/sources` — GET `?q=` (iskanje po T2, javno, za debag in
   transparentnost) — brez admin POST v MVP (re-ingest je git-tok)
4. Uzemljenje AI planerja: plan-copilot/chatbot kontekst dobi top-k T2
   virov, kadar je vprašanje vsebinsko (ne navigacijsko)
5. UI: značke virov v odgovorih; STO vnos na /vir-podatkov (T2 skupina);
   dataSources i18n fragmenti
6. Dokumentacija: ta dokument + CHANGELOG

## 6. Kasnejše razširitve (izven obsega)

- stories-de + it/fr (ko povpraševanje upraviči)
- tedenski cron re-ingest z diff poročilom
- NiST številke v validator-telemetrijo (javna statistika prihodov)
- vektorski embeddingi (če indeks zraste)
