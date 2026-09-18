# TASK 47 — SUPPLY-AWARE AI: REAL SUPPLY → AI DECISION LAYER

**Datum:** 19. 9. 2026 · **Verzija:** 1.52.0 · **Status:** GREEN (dokumentiran živi dokazi spodaj)

---

## 1. ZAČETNI CHECKPOINT

- HEAD na začetku: `348595cf7edb228bf02c2493bbd41641678f2ec2` (= origin/main, Task 46 GREEN)
- Delovno drevo: čisto.
- Bazna vrata (preverjena živo pred spremembo, ne iz workloga): `bun test` 646/646 (40 336 expect), dev strežnik gor (`/api/health` 200).
- Supply stanje: OSM LIVE · KiwiTaxi LIVE (realen CSV dataset v pomnilniku) · Viator CONTRACT VERIFIED / NOT CONFIGURED · GetYourGuide CONTRACT VERIFIED / NOT CONFIGURED.

---

## 2. AUDIT DEJANSKEGA HEADA (§1 — pred spremembo kode)

Prebrani moduli (ne worklog — koda):

| Modul | Ugotovitev |
|---|---|
| `src/lib/supply/types.ts` | Kanonski `ProviderProduct` je provider-agnostic; **0** provider-specific polj (`gygPrice`, `viatorAvailability` … ne obstajajo). `PriceInfo` ima strukturirano `unit` (6 enot) + `fromPrice` + `note`. `availability.status` ima 4 izrecna statusa (`live_available` / `live_unavailable` / `unknown` / `not_supported`). `SelectionState` = `fixed` / `preferred` / `suggested` ŽE obstaja. |
| `src/lib/supply/search.ts` | `searchSupply()` — edini kanonski supply runner (adapterji izolirano `Promise.allSettled`, zoom gating, cat gating, dedupe, cap, rate limit). Server-side ekvivalent iskanja po viewportu. AI layer ga lahko pokliče BREZ poznavanja provider API-jev. |
| `src/lib/supply/registry.ts` | 4 aktivni adapterji (osm, kiwitaxi, viator, getyourguide). OSM registry `types` NE vsebuje `transfer`/`activity`/`tour` → pri poizvedbi s temi kategorijami je OSM **cat-gated** (0 klicev na Overpass). To pomeni: supply kontekst za AI po cats=[transfer,activity,tour] zažene SAMO komercialne adapterje (kiwitaxi 2 ms v pomnilniku; viator/gyg capability gate 1 ms) — brez dragega Overpass klica. |
| `src/lib/supply/adapter.ts` | Pogodba adapterja (timeout, abort, skipped, note). |
| `src/lib/supply/dedupe.ts` | Čez-vir dedupe (ni dotaknjen). |
| `providers/kiwitaxi/**` | REALen dataset: 1494 rut, cene €33–1620, `per_transfer` + `fromPrice:true` + note „objavljena cena, ni živi citat", `availability: not_supported`, `lastUpdated` = fetchedAt. |
| `providers/viator/**`, `providers/getyourguide/**` | Runtime capability gate: brez žetona → `[]` + note `not-configured` (0 klicev na vir, NI degraded, NI fake). |
| `src/app/api/itinerary/route.ts` | `applyFixedSelectedProducts()` je PRIVATNA funkcija v routi (vrstica ~1058) — prek `insertProductStop()` (dedupe po `destination_id`). AI prompt dobi `buildSelectedProductsContext()` (FIXED/PREFERRED/SUGGESTED pravila + tip semantika + formatirana cena/razpoložljivost). |
| `src/lib/supply/sanitize.ts` | `sanitizeSelectedProviderProducts()` — meja zaupanja klient → AI (provider whitelist, enumi, kapice, `bookingUrl` NAMENOMA odstranjen). `buildSelectedProductsContext()` — obstoječi AI kontekst IZKLJUČNO za uporabnikove izbire. |
| `src/lib/itinerary-sanitize.ts` | `sanitizeItinerary()` — shape guard AI JSON (clampi, kapice, koordinate). NE preverja supply referenc. |
| `src/lib/ai-context.ts` | `SYSTEM_DATA_GUARD` + `wrapProviderData()` — prompt injection obramba (obstoječa, se uporabi). |
| `src/lib/types.ts` | `LocationVisit.destination_id` za supply postanke JE `"{provider}:{providerProductId}"` (dokumentirano v stop-insert + applyFixed) — **to JE obstoječi ekvivalent `supplyRef`** (§16: novega polja NE smemo ustvariti). Chat-dodana OSM mesta uporabljajo `osm-node-…` (pomišljaj) — ločeno od supply dvopičja. |
| AI cache | **NE OBSTAJA** — `/api/itinerary` pokliče `generateCompletion()` neposredno vsakic (veriga OpenRouter → Gemini → Puter → z-ai → fallback). Ničesar ni treba popraviti;§21 zahteva le, da IF cache kdaj nastane, supply state postane del cache identitete → zagotovljeno z `supplyContextFingerprint()` (spodaj). |
| AIUsageLog | **NE OBSTAJA** (samo `analyticsEvent` za supply poizvedbe + `console.log`). §22 minimalna sledljivost = strukturirana log vrstica (brez novega sistema, brez skrivnosti). |

### Odkrite VRZELI (Task 47 jih zapira)

1. **AI vidi SAMO uporabnikove izbire** (≤ 20) — ne kanonske ponudbe. Veriga REAL SUPPLY → ProviderProduct → SUPPLY CONTEXT → AI ne obstaja. → §3/§10: `fetchAiSupplyContext()` prek obstoječega `searchSupply()`.
2. **NI strežniške revalidacije AI supply referenc.** Če AI izpljune postanek `getyourguide:12345` (haluciniran ID), `sanitizeItinerary` ga prenese NEPREVERJENEGA do uporabnika. → §17: `revalidateSupplyStops()`.
3. **Cena/razpoložljivost AI supply postanka sta pod nadzorom AI besedila** (notes), ne supply sloja. → §5/§6: deterministični REBIND na kanonsko vrednost.
4. `applyFixedSelectedProducts` je privatna v routi → §11 testna matrika zahteva izvoz v lib (vedenje identično, samo lokacija).

### Potrjene NESPREMENJENOSTI (kar Task 47 NE sme dotakniti)

- `ProviderProduct` kanonski model — NESPREMENJEN (0 novih polj).
- `searchSupply()` runner — uporabljen, ne spremenjen.
- `insertProductStop()` — source of truth za vstavljanje (dedupe po `destination_id`).
- `sanitizeSelectedProviderProducts()` / `buildSelectedProductsContext()` — obstoječa pot uporabniških izbir ostaja.
- Providerji: NI novega (Tiqets/Booking/Travelpayouts NE).
- `/api/supply/search`, `/go/*`, map UI — nedotaknjeni.

---

## 3. ARHITEKTURA (implementirana)

```
REAL SUPPLY (OSM live / KiwiTaxi CSV dataset / Viator+GYG capability gate)
  ↓ obstoječi adapterji (kanonska preslikava)
ProviderProduct (KANONSKI — nespremenjen)
  ↓ §3: toAiSupplyProduct() — VARNA PROJEKCIJA (serializacija za AI;
  │   bookingUrl/sourceUrl IZPUŠČENA iz prompta; izbira selectionState)
  ↓ §10: fetchAiSupplyContext() → searchSupply({bbox: SI iz DESTINATIONS,
  │   zoom 10, cats: [transfer, activity, tour], pax, locale})
  │   → OSM cat-gated (0 klicev), kiwitaxi živi, viator/gyg iskreno prazni
SUPPLY CONTEXT (AiSupplyProduct[] + uporabnikove izbire)
  ↓ §4/§5/§6/§14: buildAiSupplyContext() — strukturiran blok:
  │   [FIXED]/[PREFERRED]/[SUGGESTED] + cena z enoto + fromPrice +
  │   availability status + prioritETNA LESTVICA + tip semantika
AI (generateCompletion — obstoječa veriga)
  ↓ JSON izhod
sanitizeItinerary()            — §17 schema validacija (obstoječa)
  ↓
revalidateSupplyStops()        — §17/§7/§12 supply revalidacija:
  │   neznan provider:id → DROP (nikoli silent); znan → REBIND
  │   (title, cena, koordinate, notes z enoto/virom/iskreno
  │   razpoložljivostjo) iz supply sloja
  ↓
applyFixedSelectedProducts()   — §11 FIXED invariant (ekstrahiran v lib)
  ↓
obstoječa obogatitev (vreme, dogodki, kvaliteta, GEO validacija, noge)
  ↓
FINAL ITINERARY (dokazljiva provenienca: destination_id = provider:id,
   notes = „od €X (enota) · vir: Y · razpoložljivost: Z")
```

---

## 4. SUPPLY CONTEXT (§3 — minimalna projekcija)

`AiSupplyProduct` (novo, `src/lib/supply/ai-context.ts`) NI razširitev
`ProviderProduct` — je varna serializacijska projekcija za AI prompt:

```ts
type AiSupplyProduct = {
  provider: ProviderSlug;
  providerProductId: string;
  type: ProductType;
  title: string;
  description?: string;          // skrajšan (≤ 240 znakov)
  location?: { lat?; lng?; geoPrecision?; address? };
  price?: PriceInfo;             // KANONSKA struktura (enota + fromPrice)
  availability?: { status: AvailabilityStatus };
  rating?: number;
  reviewCount?: number;
  bookingMode: BookingMode;
  selectionState: SelectionState;
};
```

- Manjkajoč podatek ostane MANJKAJOČ (undefined) — AI vidi `-`, ne izmišljuje.
- `bookingUrl` / `sourceUrl` / `image` / `license` NISO del projekcije (površina
  za injekcijo ostaja zaprta — isti vzorec kot `sanitizeSelectedProviderProducts`).
- Kap: `MAX_AI_SUPPLY_PRODUCTS = 12` (determinističen izbor — vrstni red
  kanonskega iskanja, ki je že determinističen).

---

## 5. AI INVARIANTE (§4–§9, §14)

V promptu (obstoječa bloka + nov supply blok) so IZRECNA pravila (SL+EN):

1. **FIXED** → MORA biti vključen NATANKO tak (isti provider + id); NE zamenja,
   NE podvoji, NE spremeni providerja/ID-ja. (obstoječe pravilo, nepogrešljivo)
2. **PREFERRED** → vključi, kadar ustreza; zavrneš samo zaradi REALNEGA
   konflikta (čas/lokacija/datum/trajanje/uporabnikova omejitev) + razlog v notes.
3. **SUGGESTED** → uporabiš ali zavrneš.
4. **Cena je STRUCTURED**: `per_transfer` ≠ `per_person` — „€51 per transfer"
   NIKOLI ne sme postati „€51 na osebo"; `fromPrice:true` = spodnja meja
   („od"), NIKOLI potrjena cena.
5. **Razpoložljivost je ločena od cene**: `unknown` → ne trdi „na voljo za
   tvoj datum"; `not_supported` → vir nima koncepta; SAMO `live_available`
   sme biti izražen kot razpoložljivost.
6. **Provider ID je IMMUTABLE**: AI generira SAMO itinerary semantiko
   (dan/ura/trajanje/notes); `provider`/`providerProductId`/`bookingUrl` prihajajo
   IZKLJUČNO iz supply sloja; destination_id supply postanka = `{provider}:{id}`
   TOČNO kot podan.
7. **AI ne pozna providerjev**: nikakršnega `if provider === "kiwitaxi"` — AI vidi
   kanonske produkte; provider-specific logika živi v adapterjih. (Vbod v pravilo:
   supply blok navaja provider LE kot identifikator/atribucijo.)
8. **Prioritetna lestvica (§14)**: VARNOST/HARDA uporabnikova omejitev >
   FIXED > DATUM/ČAS/LOKACIJA > PREFERRED > SUGGESTED > AI kreativnost.
   Supply priporočilo NIKOLI ne povozi uporabnikove trde zahteve
   (proračun/tempo/destinacije/datumi ostanejo nad supply kontekstom).

---

## 6. PRICE SEMANTICS (§5)

- Kanonska `PriceInfo` se prenaša NEPREVERJENO-projektirano (amount/currency/unit/fromPrice/note).
- `buildAiSupplyContext()` izpiše ceno vedno kot `od €51 (per transfer)` /
   `from €51 (per transfer)` — enota + „od" skupaj (isti vzorec kot obstoječi
   `buildSelectedProductsContext`).
- `revalidateSupplyStops()` REBINDA `estimated_cost` na `Math.round(price.amount)`
   (0, ko cene ni — nikoli izmišljena) in notes na deterministično kanonsko
   obliko z enoto — AI številka NIKOLI ne preživi v supply postanku.

## 7. AVAILABILITY SEMANTICS (§6, §15)

- Projekcija prenese SAMO status (checkedAt/nota ostajata v supply sloju).
- Prompt pravila: `unknown` = negotovost ostaja; `not_supported` = ni koncepta;
   `live_*` = preverjeno.
- `revalidateSupplyStops()` notes vedno nosijo ISKRENO oznako:
  - `unknown` → „razpoložljivost: ni preverjena" / „availability: not verified"
  - `not_supported` → „razpoložljivost: preveri pri ponudniku" / „availability: confirm with the provider"
  - `live_available` → „razpoložljivost: živo potrjena" / „availability: live-confirmed"
  - `live_unavailable` → „razpoložljivost: živo NI na voljo" / „availability: live-unavailable"
- Prepovedani izrazi v AI notes za nepreverjene produkte („available for your
  date", „na voljo za tvoj datum") — testirano negativno (§24 testi).

## 8. FIXED SEMANTICS (§11)

- `applyFixedSelectedProducts()` ekstrahiran iz route v `src/lib/supply/apply-fixed.ts`
  (VEDENJE IDENTIČNO — isti `insertProductStop`, isti filter; samo lokacija za
  testnost). Ostaja source of truth.
- Invariant: FIXED supply product → NATANČNO ENA itinerary predstavitev
  (dedupe po `destination_id === "{provider}:{id}"` v `insertProductStop`,
  dedupe po `provider:id` v `sanitizeSelectedProviderProducts`).
- Testna matrika §11 (spodaj) dokazuje: isti dvakrat → 1; isti provider+id → 1;
   isti id z drugim naslovom → 1 (ključ je id, ne naslov); dva providerja z
   istim naslovom → 2; dva providerja z istimi koordinatami → 2.

## 9. SERVER-SIDE REVALIDATION (§7, §12, §17)

`src/lib/supply/itinerary-supply-validation.ts` — čista funkcija:

```
AI JSON → sanitizeItinerary (schema) → revalidateSupplyStops →
applyFixedSelectedProducts → enrich (vreme/kvaliteta/GEO) → final
```

`revalidateSupplyStops(itinerary, knownSupply, lang)`:

- Indeks znanega supplyja = uporabnikove izbire (sanitizirane) ∪ strežniški
  supply kontekst (kanonski).
- Vsak postanek, katerega `destination_id` ustreza `{provider}:{id}` z znanim
  provider slugom:
  - **NI v indeksu** → haluciniran ID/provider → postanek ODSTRANJEN
    (vrne se `dropped[]` z razlogom `unknown-supply-ref` — NIKOLI silent;
    poročilo gre v log/telemetrijo). NE ustvari se fallback produkt.
  - **JE v indeksu** → REBIND na kanonske vrednosti: `destination_name`
    (kanonski title), `estimated_cost` (kanonska cena ali 0), `lat/lng`
    (kanonske koordinate), `category: "supply"`, `notes` (deterministično:
    opis ≤ 120 + „od €X (enota)" + vir + iskrena razpoložljivost).
- Postanki T1 (bled …), chat-dodana OSM mesta (`osm-node-…`) in vsi ostali
  formati ostanejo NEDOTIKNJENI (validator se sproži SAMO na supply vzorcu).
- Malformed supplyRef (prazen id, `:` brez providerja, provider ki ni v
  registru) → NI supply referenca → splošna sanitize pot ( obstoječa).

## 10. SUPPLY SEARCH ZA AI (§10)

- `fetchAiSupplyContext({pax, date, locale})` pokliče **obstoječi**
  `searchSupply()` (edini supply engine; NI drugega):
  - bbox = izpeljan IZ `DESTINATIONS` koordinat (naš enkratni vir resnice —
    min/max lat/lng slovenskih destinacij), zoom 10, `cats: ["transfer","activity","tour"]`.
  - OSM je cat-gated (njegovi tipi ne vključujejo teh kategorij) → 0 klicev
    na Overpass; kiwitaxi živi (2 ms, v pomnilniku); viator/gyg capability
    gate (1 ms, iskreno prazno brez žetona).
- Odpoved supply iskanja NIKOLI ne podre generacije itinererja (try/catch →
  prazen kontekst — isto graceful-degradation načelo kot ranking engine).
- AI layer nikoli ne pokliče provider API-ja direktno (edini odhodni klici so
  v adapterjih, ki so edini, ki poznajo pogodbe).

## 11. REAL SUPPLY INJECTION (§8, §19)

- KiwiTaxi: LIVE — realen dataset (data/kiwitaxi-routes.json, 1494 rut) →
  kanonski produkti → supply kontekst → AI → validirani itinerer (živi E2E §25).
- Viator / GetYourGuide: brez žetona → `not-configured`, 0 produktov, 0 klicev
  (iskren test §18-E dokazuje „no fake product").
- TESTNI FIXTURE-i so SAMO v unit testih (vbrizgani adapterji);
  produkcjska/runtime pot dobi SAMO realne adapterje (defaultAdapters()).

## 12. CACHE IDENTITY (§21)

- Obstoječega AI predpomnilnika NI (audit) → nič za popraviti.
- `supplyContextFingerprint(context)` — determinističen SHA-podoben
  (FNV-1a) prstni odtis kanonskega supply konteksta (provider, id, cena,
  enota, fromPrice, availability, selectionState, geo) — DOKUMENTIRANA
  komponenta cache identitete, če se AI cache kdaj uvede: enaka izbira
  (A) ≠ druga izbira (B) → različen odtis (test §18). Skrivnosti se
  NIKOLI ne viejo v odtis ( vhod so projekcije brez URL-jev/žetonov).

## 13. OBSERVABILITY (§22)

- Brez novega sistema: strukturirana `console.log` vrstica ob generaciji:
  `[itinerary] supply-aware: context=N providers=kiwitaxi(+n) fixed=M rebound=K dropped=L`
  (+ ista števila v obstoječi telemetrijska vrstica ne — minimalno).
- NE shranjujemo: žetonov, celotnih provider payloadov, PII. (Klientova
  obstoječa `planner_plan_check_reported` analitika ostaja nedotaknjena.)

## 14. SECURITY (§12-D)

- Provider whitelist: `isProviderSlug` (register) na VSAKI meji (klient → AI,
  AI izhod → revalidacija).
- `bookingUrl`/`sourceUrl`/URLji NIKOLI v AI promptu (projekcija jih izpusti;
   test: kontekst ne vsebuje `http`).
- Haluciniran provider/id → DROP + poročilo (nikoli silent, nikoli fallback).
- Malformed supplyRef → obstoječa sanitize pot.
- Provider injection (provider `"; DROP…"`) → whitelist zavrne.
- Fake price → rebind na kanonsko; fake availability → notes regenerirane
  iskreno; fake booking URL → ni površine (polje ne obstaja v LocationVisit).

## 15. AI OUTPUT SCHEMA (§16)

- Obstaječi ekvivalent `supplyRef` = `LocationVisit.destination_id`
  (`"{provider}:{providerProductId}"`) + `category: "supply"` — dokazano v
  obstoječi kodi (stop-insert.ts, apply-fixed.ts, subset testov 44/45/46).
- **NOVO polje NI dodano** (spec: „Če ga že vsebuje, NE ustvarjaj drugega").

---

## 16. TESTI (§18 — matrika, `bun test`)

Nove datoteke:
- `src/lib/__tests__/task47-supply-context.test.ts` — projekcija, kontekst,
  prstni odtis, LIVE kanonsko iskanje (KiwiTaxi realen, Viator/GYG prazna),
  izolacija.
- `src/lib/__tests__/task47-supply-validation.test.ts` — revalidacija
  (drop/rebind/cena/razpoložljivost/security).
- `src/lib/__tests__/task47-fixed-invariants.test.ts` — §11 matrika.

A. FIXED: 1 FIXED · duplikat FIXED · 2 providerja · 3 providerja · isti id
   drug naslov · isti naslov 2 providerja · iste koordinate 2 providerja.
B. PRICE: total / per_person / per_transfer / per_night / fromPrice
   (vsaka enota izpiše + rebind) + „od" nikoli izpade.
C. AVAILABILITY: live_available / live_unavailable / unknown / not_supported
   (status ohranjen v notes; negotovost ohranjena; §15 dvojni test).
D. SECURITY: neznan provider · neznan product ID · malformed supplyRef ·
   provider injection · fake cena (rebind) · fake availability (notes
   regenerirane) · fake booking URL (ni površine — kontekst brez URL-jev).
E. MULTI-PROVIDER: OSM izbira + KiwiTaxi LIVE + Viator (prazen) + GYG
   (prazen) v enem kontekstu; not-configured ostane prazen (0 izmišljenih);
   GYG/Viator okvara → KiwiTaxi živi (regresija izolacije); FINGERPRINT
   identiteta (A ≠ B).

Končna vrata: `bun test` **745/745** (+99), `eslint` 0, `tsc --noEmit` 0 napak v src.

## 17. ŽIVI E2E (§25) — izveden 19. 9. 2026

**API pot (zlati tok, REAL supply → AI → validacija):**
- `GET /api/supply/search` (bbox LJU, z12, cats=transfer): 48 realnih KiwiTaxi
  transferjev; `kiwitaxi:409` „Ljubljana → Ljubljana Airport" od €51 per_transfer;
  osm/viator/gyg cat-gated (0 klicev), degraded=[].
- `POST /api/itinerary` (3 dni, FIXED `kiwitaxi:409` €51, SL): HTTP 200/13,9 s,
  source=ai → `kiwitaxi:409` NATANČNO 1× (dan 2), estimated_cost **51**
  (kanonski), notes: **„cena: od 51 € (per transfer) · Dodano z zemljevida
  ponudbe · vir: KiwiTaxi Partner Data API (CSV) · razpoložljivost: preveri
  pri ponudniku"** — popolna iskrena veriga (cena z enoto + provenanca +
  razpoložljivost NIKOLI potrjena).
- EN pot (`language=en`, FIXED `kiwitaxi:16400` €258): HTTP 200/11,6 s →
  1× postanek, notes: **„price: from €258 (per transfer) · Added from the
  supply map · source: KiwiTaxi Partner Data API (CSV) · availability:
  confirm with the provider"**.
- Observability (§22, dev.log): `[itinerary] supply-aware: context=48
  (capped 12) providers=kiwitaxi degraded=- fixed=1` +
  `[itinerary] AI uspešno (source: z-ai-sdk; supply rebound=0 dropped=0)` —
  supply kontekst (48 realnih produktov, kap 12) je DEJANSKO šel v AI prompt.
- Halucinacije v živih klicih: 0 (AI ni izmišljeval supply sklicev; drop/rebind
  pot je pripravljena in števec živ — dokazana z 99 unit testi).

**Brskalniška pot (agent-browser):**
- SL `/zemljevid`: Pokaži POI → čip Transferji (iskren zoom-gating namig
  „Približajte zemljevid (z ≥ 10)", 0 izdelkov) → zoom +3 (Leaflet kontrola)
  → **Transferji48** + 3 gruče → gruča → marker „Bled → Ljubljana" → popup →
  Podrobnosti → ProductModal: naslov, „na prevoz", „objavljena cena, ni živi
  citat", badge Objavljeni podatki, vir → **Dodaj med izbrane** →
  sessionStorage `dai:supply-selection`: strukturiran FIXED item
  (kiwitaxi/476, per_transfer, fromPrice, not_supported).
- `/nacrtuj` s 3 FIXED izbirami: banner „Izbrani produkti (3) · AI bo izbrane
  izdelke upošteval kot obvezne (ne jih zamenja s podobnimi)" → Generiraj
  itinerer → AI načrt z VSEMI tremi transferji NATANČNO 1× vsak, z iskrenimi
  notes (3× „vir: KiwiTaxi Partner Data API (CSV)", 3× „Dodano z zemljevida
  ponudbe", „od €77 (per transfer) … razpoložljivost: preveri pri ponudniku").
- EN `/en/zemljevid`: Show POI → Transfers → zoom → **Transfers48** + 3 gruče →
  gruča → marker „Bled → Zagreb" → Details → modal: „from €X per transfer",
  „published price, not a live quote", badge Published data → Add to selection →
  sessionStorage FIXED (kiwitaxi/16400, note v EN).
- Mobilni: 390 px (planner z načrtom) = **0 px** horizontalnega preliva;
  375 px = **0 px** preliva; svež reload = 0 napak strani/konzole.

## 18. REGRESIJA (§20)

- OSM GREEN (lokalni fuzzy dedupe intakten — obstoječi testi).
- KiwiTaxi GREEN (48 transferjev v vseh pogledih; LIVE v AI kontekstu).
- Viator GREEN (not-configured iskren; okvarjen adapter ne odstrani KiwiTaxi).
- GetYourGuide GREEN (not-configured iskren; okvarjen adapter ne odstrani KiwiTaxi).
- GYG okvara → KiwiTaxi živi · Viator okvara → KiwiTaxi živi · KiwiTaxi
  okvara → GYG/Viator ostane izolirana (novi testi v task47-supply-context).

## 19. ZAKLJUČEK AUDITA §1 — odkrite in popravljenе VRZELI med implementacijo

1. **E2E odkrita vrzel**: FIXED-vstavljeni postanki (insertProductStop pot) niso
   nosili vrstice razpoložljivosti — §6/§13 zahteva iskrenost za VSE supply
   postanke. POPRAVLJENO: skupni listni modul `availability-note.ts` (client-varen,
   brez vlečenja supply engineja v klienta) uporabljajo `stop-insert.ts` IN
   `itinerary-supply-validation.ts` (enkraten vir besedila, 0 drifa).
2. **ODVOJENA semantika razpoložljivosti**: obstoječa Task 44 meja
   (sanitize izbir TIHO izpusti `not_supported` — dokumentirano) ostaja;
   iskrena vrstica se izpelje iz `bookingMode` (odsotno + komercialno =
   „preveri pri ponudniku"; lokalni info_only = brez vrstice). Nic
   provider-specific logike (bookingMode je kanonsko polje).
3. **PRAZEN known supply NI izstop** revalidacije: vsak supply sklic je tedaj
   neizproven → drop (zahteva §17: nikoli silent accept).

## 20. KNOWN LIMITATIONS

- Supply kontekst pokriva `transfer`/`activity`/`tour` kategorije (komercialna
  ponudba); OSM lokalne POI točke NISO v AI supply kontekstu (pokrije jih T1
  destinacijski dataset v `destContext`) — zavestna odločitev (pošteno do
  token proračuna prompta + 0 Overpass klicev).
- `estimated_cost` REBIND uporabi `price.amount` BREZ množenja s pax/eno
  enoto — enota ostaja izrecno v notes ( „od €51 (na prevoz)") — pretvorba
  „koliko stane za 3 osebe" je presentation concern ( Obstoječa semantika
  insertProductStop — nespremenjena).
- AI cache ne obstaja → fingerprint je dokumentiranaprihodnja identiteta (ni
  runtime obnašanja, ki bi se lahko pokvarilo).

## 21. FOLLOW-UP (§23 — NE rešeno v tem tasku)

1. **Viator API ključ** (self-serve registracija pri lastniku) → živi inventar
   brez spremembe kode (aktivacijska knjiga TASK-45-AUDIT.md §7).
2. **GetYourGuide API žeton** (partner manager) → isto (TASK-46 §22/§36).
3. **Refine pot**: `/api/itinerary/refine` ne revalidira supply referenc
   (obstoječa znana vrzel iz TASK-42 AUDIT #2 — refine dela na obstoječem
   načrtu; priporočilo: podati knownSupply tudi tam + revalidacija).
4. **PREFERRED iz UI**: danes klient pošilja izključno FIXED iz modalov
   ( „Dodaj med izbrane"); PREFERRED/SUGGESTED pot klienta še ne obstaja —
   semantika je strežniško pripravljena in testirana.

---

## 22. KONČNA FORMULA (§27)

| Zahteva | Status |
|---|---|
| NO FAKE SUPPLY | ✓ (LIVE dataset / capability gate; fixture SAMO v testih) |
| NO FAKE PRICE | ✓ (rebind na kanonsko; manjkajoča → 0) |
| NO FAKE AVAILABILITY | ✓ (notes regenerirane iz statusa; negotovost ohranjena) |
| NO PROVIDER HALLUCINATION | ✓ (whitelist + drop neznanega) |
| NO ID HALLUCINATION | ✓ (indeks znanih; drop neznanega) |
| NO FIXED REPLACEMENT | ✓ (applyFixed + prompt pravila + testi) |
| NO DUPLICATION | ✓ (dedupe provider:id / destination_id) |
| NO PROVIDER-SPECIFIC AI LOGIC | ✓ (AI vidi kanonske proj.; 0 `if provider===` v AI plasti) |

---

## 23. KONČNO POROČILO

```
COMMIT SHA:        (glej spodaj po commitu)
BRANCH:            main
ORIGIN/MAIN:       pushan (glej spodaj)

TESTS:             745/745 (646 obstoječih + 99 novih; 0 regresij)
LINT:              eslint 0 (0 errors, 0 warnings)
TSC:               bunx tsc --noEmit 0 napak v src
                   (3 predhodne napake IZVEN src: skills/×2 +
                   tailwind.config.ts — nedotaknjene, izven obsega)

SUPPLY PROVIDERS:
  OSM:            LIVE (cat-gated pri AI kategorijah — 0 klicev, pošteno)
  KIWITAXI:       LIVE (realen CSV dataset → 48 produktov → AI kontekst)
  VIATOR:         CONTRACT VERIFIED / NOT CONFIGURED (iskren gate, 0 fake)
  GETYOURGUIDE:   CONTRACT VERIFIED / NOT CONFIGURED (iskren gate, 0 fake)

AI SUPPLY CONTEXT:
  FIXED:          uporabnikove izbire (immutable, dedupe, applyFixed)
  PREFERRED:      semantika v promptu + validacija (testirana)
  SUGGESTED:      strežni kanonski kontekst (48→12 kap, prompt pravila)

PRICE INTEGRITY:      ✓ rebind na kanonsko; enota vedno v notes; fromPrice ≠ confirmed
AVAILABILITY INTEGRITY: ✓ unknown ostane unknown; not_supported = preveri pri ponudniku; live_* izrecna
PROVIDER-ID INTEGRITY:  ✓ destination_id = provider:id immutable; drop neznanega
CACHE INTEGRITY:       ✓ ni AI cache-a; supplyContextFingerprint je dokumentirana identiteta

E2E:
  SL:            ✓ (zemljevid → modal → Add → planner → AI → 3 FIXED 1×)
  EN:            ✓ (EN modal + EN AI pot: from €258 per transfer)
  390px:         ✓ 0 px preliva
  375px:         ✓ 0 px preliva

RED:    0
YELLOW: 4 (follow-up spodaj)
FOLLOW-UP: Viator ključ, GYG žeton, refine revalidacija, PREFERRED UI pot
```

**Končna formula (§27) — DOKAZANA:**

ProviderProduct → kanonski supply kontekst (AiSupplyProduct projekcija) → AI →
validated itinerary — z NO FAKE SUPPLY / NO FAKE PRICE / NO FAKE AVAILABILITY /
NO PROVIDER HALLUCINATION / NO ID HALLUCINATION / NO FIXED REPLACEMENT /
NO DUPLICATION / NO PROVIDER-SPECIFIC AI LOGIC.
