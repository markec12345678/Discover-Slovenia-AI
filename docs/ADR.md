# Architecture Decision Records (ADR)

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Dokumentacija ključnih arhitekturnih odločitev z kontekstom in alternativami
> **Pravilo:** Vsaka ADR je immutabilna enkrat sprejeta. Spremembe zahtevajo novo ADR ki referencira staro.

---

## 📑 Kazalo ADR-jev

| ID | Naslov | Status | Datum |
|----|--------|--------|-------|
| [ADR-001](#adr-001--nextjs-16-app-router) | Next.js 16 App Router | ✅ Sprejet | 2025-01-15 |
| [ADR-002](#adr-002--prisma-orm) | Prisma ORM | ✅ Sprejet | 2025-01-15 |
| [ADR-003](#adr-003--sqlite-za-dev-turso-za-produkcijo) | SQLite (dev) / Turso (prod) | ✅ Sprejet | 2025-01-15 |
| [ADR-004](#adr-004--vercel-za-deployment) | Vercel za deployment | ✅ Sprejet | 2025-01-15 |
| [ADR-005](#adr-005--glm-preko-puter-api-kot-primarni-ai) | GLM preko Puter API kot primarni AI | ✅ Sprejet | 2025-01-15 |
| [ADR-006](#adr-006--ai-fallback-chain-puter--z-ai-sdk--rule-based) | AI fallback chain (Puter → z-ai-sdk → rule-based) | ✅ Sprejet | 2025-01-15 |
| [ADR-007](#adr-007--ai-ranking-z-utežmi-60201010) | AI ranking z utežmi 60/20/10/10 | ✅ Sprejet | 2025-01-15 |
| [ADR-008](#adr-008--sponsored-boost-max-10) | Sponsored boost max 10% | ✅ Sprejet | 2025-01-15 |
| [ADR-009](#adr-009--affiliate-model-redirect-ne-payment-processing) | Affiliate model (redirect, ne payment processing) | ✅ Sprejet | 2025-01-15 |
| [ADR-010](#adr-010--admin-approval-required-za-vse-lokalce) | Admin approval required za vse lokalce | ✅ Sprejet | 2025-01-15 |
| [ADR-011](#adr-011--cache-first-ai-strategija) | Cache-first AI strategija | ✅ Sprejet | 2025-01-15 |
| [ADR-012](#adr-012--free-b2c--paid-b2b-monetizacija) | Free B2C + paid B2B monetizacija | ✅ Sprejet | 2025-01-15 |
| [ADR-013](#adr-013--pavšalni-oglas-ne-provizija) | Pavšalni oglas, ne provizija | ✅ Sprejet | 2025-01-15 |
| [ADR-014](#adr-014--beta-do-30-lokalov-brezplačno) | Beta do 30 lokalov brezplačno | ✅ Sprejet | 2025-01-15 |
| [ADR-015](#adr-015--transparency-first--jasno-označevanje-oglasov) | Transparency-first: jasno označevanje oglasov | ✅ Sprejet | 2025-01-15 |

---

## ADR-001 — Next.js 16 App Router

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Platforma potrebuje framework ki podpira:
- Server-side rendering (SEO ključen za turistično platformo)
- API routes (backend v enem projektu)
- Static generation (322 landing pages)
- Image optimization (81 slik)
- i18n (4 jeziki)
- Edge deployment (hitri globalni dostop)

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Next.js 16** | RSC, App Router, Vercel integracija, najboljši DX | Learning curve za RSC |
| Nuxt 3 (Vue) | Odličen DX, auto-imports | Manjša skupnost, manj Vercel integracije |
| SvelteKit | Najhitreši bundle, enostaven | Majhna skupnost, manj library-jev |
| Remix | Odličen za forms, web standards | Manj popularen, manj job candidates |
| Astro | Najboljši za statične strani | Slab za dinamične aplikacije |

### Odločitev

**Next.js 16 z App Router** ker:
1. RSC omogoča SEO + interaktivnost brez hydration overhead
2. API routes v istem projektu = en deploy
3. Vercel integracija = zero-config deploy + Edge CDN
4. Največja skupnost = največ library-jev in rešitev
5. App Router je prihodnost Next.js (Pages Router je deprecated)

### Posledice

- ✅ Hitri SEO z RSC
- ✅ En projekt za frontend + backend
- ✅ Vercel auto-deploy iz GitHub
- ⚠️ Learning curve za ekipo (RSC, server components)
- ⚠️ Nekatere library-je še ne podpirajo RSC popolnoma

---

## ADR-002 — Prisma ORM

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Potrebujemo ORM ki:
- Type-safe queries (TypeScript project)
- Migrations sistem
- Podpora za SQLite (dev) in PostgreSQL/Turso (prod)
- Enostavna schema definicija
- Query optimization

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Prisma** | Type-safe, odličen DX, schema-first | Večji bundle, cold start |
| Drizzle | Lahkotnejši, SQL-first | Manj features, manj dokumentacije |
| TypeORM | Zrel, decorators | Težek, slab DX, bugi |
| Raw SQL z pg | Največja kontrola | Brez type safety, ročno vse |
| Kysely | Type-safe SQL builder | Manj popularen, manj tooling |

### Odločitev

**Prisma 6** ker:
1. Type-safe queries preprečujejo runtime napake
2. Schema-first pristop = single source of truth
3. Migrations sistem vgrajen
4. Prisma Studio za debugiranje
5. Odlična dokumentacija in skupnost
6. Podpira SQLite in PostgreSQL/Turso

### Posledice

- ✅ Type safety preko celotnega stack-a
- ✅ Enostavne migracije
- ⚠️ Cold start na serverless (mitigirano z connection pooling)
- ⚠️ Večji bundle size (~200KB)
- ⚠️ Nekatere kompleksne query-je je težko izraziti

---

## ADR-003 — SQLite za dev, Turso za produkcijo

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Potrebujemo databaso ki:
- Enostavna za lokalni razvoj (brez setup)
- Skalabilna za produkcijo
- Podprta s Prisma
- Nizka cena na začetku
- Podpira replikacijo za globalni dostop

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **SQLite (dev) + Turso (prod)** | Brezplačen dev, libSQL protocol, edge replicacija | Manj znana, omejene funkcije |
| PostgreSQL (supabase) | Zrel, polno funkcij, dobra dokumentacija | Cold start, dražji pri skaliranju |
| MongoDB Atlas | NoSQL fleksibilnost | Slab za relacijske podatke |
| PlanetScale (MySQL) | Odlična skalabilnost | Dražji, branch-based migrations |
| Supabase (Postgres) | Brezplačen tier, auth included | Vendor lock-in |

### Odločitev

**SQLite za dev + Turso za produkcijo** ker:
1. Dev: datoteka `db/custom.db` — brez setup
2. Turso: libSQL (SQLite compatible) — enaka schema
3. Turso edge replicacija — hitri globalni dostop
4. Turso brezplačni tier: 500 DB, 1B read rows/mes
5. Prisma podpira oba brez sprememb
6. Enostavno switchanje med dev in prod

### Posledice

- ✅ Zero-setup dev environment
- ✅ Enaka schema v dev in prod
- ✅ Edge replicacija za hitre query-je globalno
- ⚠️ Turso je manj znan (mitigirano z backup strategijo)
- ⚠️ Nekatere SQLite omejitve (npr. concurrent writes)
- ⚠️ Migracija na PostgreSQL možna kasneje (Prisma to omogoča)

---

## ADR-004 — Vercel za deployment

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Potrebujemo hosting ki:
- Auto-deploy iz GitHub
- Edge CDN za globalni dostop
- Serverless funkcije za API
- Preview deploy-je za PR-je
- Cron jobs support
- Integracija z Next.js

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Vercel** | Next.js creator, zero-config, Edge CDN | Dražji pri skaliranju, vendor lock-in |
| Netlify | Dober za statične strani | Slab za Next.js App Router |
| Railway | Enostaven, fleksibilen | Manj CDN funkcij |
| Fly.io | Edge runtime, globalni | Več setup |
| Self-hosted (VPS) | Najnižja cena, polna kontrola | Več vzdrževanja |

### Odločitev

**Vercel** ker:
1. Next.js creator = najboljša integracija
2. Zero-config deploy iz GitHub
3. Edge CDN vgrajen (hitri globalni dostop)
4. Preview deploy-ji za vsak PR
5. Cron jobs support (za weekly alerts, sponsorship expiry)
6. Brezplačni tier zadosten za začetek (100GB bandwidth, 1000 builds)

### Posledice

- ✅ Zero-config CI/CD
- ✅ Preview environment za vsak PR
- ✅ Edge CDN za hitre load times
- ⚠️ Vendor lock-in (mitigirano z Next.js portabilnostjo)
- ⚠️ Pri 100K+ MAU postane dražji (~$20-100/mes)
- ⚠️ Serverless cold starts (mitigirano z caching)

---

## ADR-005 — GLM preko Puter API kot primarni AI

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Potrebujemo AI model za:
- Generiranje itinererjev (JSON output)
- Chatbot pogovore
- Naravnojezikovno iskanje
- AI priporočila
- FAQ generiranje
- Prevajanje

Ključni kriteriji:
- Cena (bootstrapped startup)
- Kvaliteta (turistična vsebina)
- Latency (uporabniška izkušnja)
- API dostopnost

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **GLM preko Puter (brezplačni)** | Brezplačen, OpenAI-compatible, dobra kvaliteta | Rate limits, odvisen od Puter |
| OpenAI GPT-4 | Najboljša kvaliteta, široko podprt | Dražji ($0.03/1K tokens) |
| Anthropic Claude | Odličen za reasoning | Dražji, manj integracij |
| Gemini (Google) | Multimodal, brezplačni tier | Manj prilagodljiv |
| Lokalni model (Llama 3) | Brezplačen, privacy | Zahteva GPU, slabša kvaliteta |
| Mistral AI | Odprt, dober free tier | Manj znan |

### Odločitev

**GLM (z-ai/glm-5.1) preko Puter API** kot primarni AI ker:
1. **Brezplačen** — Puter omogoča brezplačni dostop do GLM
2. **OpenAI-compatible API** — enostavna integracija z `openai` npm package
3. **Dobra kvaliteta** — GLM je konkurenčen GPT-3.5
4. **JSON mode** — podpira structured output
5. **Slovenščina** — dobra podpora za slovenski jezik
6. **z-ai-web-dev-sdk fallback** — če Puter odpove, SDK prevzame

### Posledice

- ✅ €0 AI stroškov na začetku
- ✅ OpenAI-compatible = enostavna zamenjava kasneje
- ⚠️ Odvisnost od Puter (mitigirano z fallback chain)
- ⚠️ Rate limits pri skaliranju (mitigirano z caching)
- ⚠️ Manj znana kot OpenAI (mitigirano z dobro dokumentacijo)

### Kdaj preklopiti?

- Ko dnevni AI stroški presežejo €50 (Puter rate limit)
- Takrat: zamenjaj na direct GLM API ali OpenAI GPT-4o-mini (cenejši)

---

## ADR-006 — AI fallback chain (Puter → z-ai-sdk → rule-based)

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

AI klici lahko odpovejo zaradi:
- Puter API izpada
- Rate limit presežen
- Timeout (30s)
- Neveljaven JSON odgovor

Vsaka AI funkcija mora vedno vrniti rezultat — nikoli 500 error.

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **3-tier fallback (Puter → SDK → rule-based)** | Največja zanesljivost | Kompleksnejša implementacija |
| 2-tier (Puter → SDK) | Enostavnejša | Brez rule-based fallback-a |
| Samo Puter + error toast | Najenostavnejša | Slaba uporabniška izkušnja |
| Retry-only (3x Puter) | Enostavna | Vedno isti provider |

### Odločitev

**3-tier fallback chain:**

```
1. Puter API (primarni)
   ↓ napaka/timeout
2. z-ai-web-dev-sdk (backup)
   ↓ napaka/timeout
3. Rule-based fallback (deterministični)
   ↓ vedno uspe
4. Return result (source: "fallback")
```

**Pravila:**
- 3 retry-ji z exponential backoff (1s, 2s, 4s) za Puter
- 1 poskus za SDK (brez retry)
- Rule-based vedno uspe (deterministični odgovori)
- Source badge v UI: `AI` | `fallback`
- Logging vseh fallback-ov v `AIUsageLog`

### Posledice

- ✅ 100% uptime za AI funkcije (vedno vrne rezultat)
- ✅ Uporabnik nikoli ne vidi error-ja
- ⚠️ Fallback odgovori so manj kakovostni
- ⚠️ Kompleksnejša koda (3 poti)
- ⚠️ Težje debugirati (kateri tier je odgovoril?)

---

## ADR-007 — AI ranking z utežmi 60/20/10/10

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

AI mora priporočati lokalce v itinererjih. Kako uravnotežiti:
- Relevantnost za uporabnikov query
- Kvaliteto lokalca (rating)
- Geografsko bližino
- Plačilo (sponsored boost)

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **60/20/10/10 (Relevance dominant)** | Kvaliteta > plačilo | Manj incentive za premium |
| 40/20/10/30 (Premium dominant) | Več incentive za plačilo | Slab UX, "pay-to-win" |
| 50/25/15/10 | Bolj uravnoteženo | Kompleksneje |
| Brez uteži (AI odloči) | Fleksibilno | Nepredvidljivo, nepošteno |
| Čisto organsko (brez boost) | Najbolj pošteno | Ni monetizacijskega incentive |

### Odločitev

**60/20/10/10 uteži:**
```
Score = Relevance × 0.60    (ujemanje z uporabnikovim queryjem)
      + Rating × 0.20        (ocena lokalca / 5)
      + Distance × 0.10      (bližina drugim lokacijam)
      + Premium × 0.10       (sponsored boost)
```

**Zakaj te uteži?**
1. **Relevance 60%** — uporabnik dobi kar išče (UX > monetizacija)
2. **Rating 20%** — kakovost lokalca je pomembna
3. **Distance 10%** — logistično smiselno (ne priporočaj Bleda za Ljubljano)
4. **Premium 10%** — sponsored pomaga, a ne preglasi kvalitete

### Posledice

- ✅ Uporabnik dobi relevantne priporočile (ne "pay-to-win")
- ✅ Premium ima incentive (10% boost je opazen)
- ✅ Predvidljiv algoritem
- ⚠️ Premium providerji morda pričakujejo večji boost
- ⚠️ Relevance je težko izračunati (hevcno)

### Test case

```
Hotel A (premium, rating 4.0, relevance 0.5):
  0.5×0.6 + 0.8×0.2 + 0.9×0.1 + 0.1×0.1 = 0.30+0.16+0.09+0.01 = 0.56

Hotel B (free, rating 4.9, relevance 0.9):
  0.9×0.6 + 0.98×0.2 + 0.9×0.1 + 0.0×0.1 = 0.54+0.196+0.09+0 = 0.826

→ Hotel B (free, boljši) zmaga nad Hotel A (premium, slabši)
→ Pravilo 1 izpolnjeno: AI ne priporoča slabega samo ker plača
```

---

## ADR-008 — Sponsored boost max 10%

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Premium in Enterprise providerji plačajo za večjo vidljivost. Koliko boost-a naj dobijo?

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Max 10%** | Pošteno, ne preglasi relevance | Manj incentive za premium |
| Max 20% | Več incentive | "Pay-to-win" občutek |
| Max 30% | Največji incentive | Zelo nepošteno |
| Brez limita | Največji incentive | Zlorabe, slaba izkušnja |
| Pozicijski (vedno 1.) | Jasno | Vedno isti ponudniki |

### Odločitev

**Sponsored boost max 10%** (glej ADR-007).

**Dodatna pravila:**
- Rating < 3.5 → nobenega boost-a (slabi lokalci ne morejo "kupiti" vidljivosti)
- Max 1 sponzorirani na dan v itinererju (ne preplavi)
- Vedno + vsaj 1 organski rezultat (uporabnik vidi alternativo)

### Posledice

- ✅ Poštena konkurenca
- ✅ Uporabnik ni preplavljen z oglasi
- ✅ Premium ima opazen benefit (10% je dovolj)
- ⚠️ Nekateri providerji bodo hoteli več (komunikacija potrebna)
- ⚠️ Težje prodati Enterprise paket (samo 10% razlika)

---

## ADR-009 — Affiliate model (redirect, ne payment processing)

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Kako monetizirati rezervacije? Processirati plačila ali preusmerjati na partnerje?

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Affiliate redirect** | Brez tveganja, pasivni prihodek | Nizka marža (5-40%) |
| Payment processing | Višja marža | PCI compliance, support, chargebacks |
| White-label booking | Polna kontrola | Ogromno razvoja, vzdrževanja |
| Brez monetizacije booking-a | Enostavno | Brez prihodka |

### Odločitev

**Affiliate redirect model** — uporabnik klikne "Rezerviraj" in gre na Booking.com/Viator/DiscoverCars.

**Partnerji:**
- Booking.com (5% commission)
- DiscoverCars (70% commission — najvišja)
- Viator (8% commission)
- Skyscanner (40% commission)

### Posledice

- ✅ Brez PCI compliance
- ✅ Brez chargeback tveganja
- ✅ Brez customer support za rezervacije
- ✅ Pasivni prihodek
- ⚠️ Nizka marža (5-8% za Booking/Viator)
- ⚠️ Uporabnik zapusti platformo
- ⚠️ Odvisnost od affiliate programov

---

## ADR-010 — Admin approval required za vse lokalce

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Ali naj lahko providerji takoj objavijo lokalce ali naj čakajo na odobritev?

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Admin approval required** | Quality control, anti-spam | Počasnejša objava |
| Samo-publikacija | Hitro, enostavno | Spam, napačni podatki |
| Samo-publikacija + report sistem | Hitro + community moderation | Spam možen pred report |
| AI pre-screening + admin | Hitro + quality | Kompleksno |

### Odločitev

**Admin approval required** za vse lokalce.

**Status sistem:**
```
Draft → Pending → Approved → Published → Archived
                ↓
             Rejected (z razlogom)
```

**SLA:** Approval v 24-48 urah.

### Posledice

- ✅ Quality control (pravilni podatki, slike, kontakti)
- ✅ Anti-spam (neprimerna vsebina ne gre v živo)
- ✅ Trust (uporabnik ve da so lokalci preverjeni)
- ⚠️ Počasnejša objava (provider čaka)
- ⚠️ Admin bottleneck (potrebno število moderatorjev)
- ⚠️ SLA obveza (24-48h)

---

## ADR-011 — Cache-first AI strategija

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

AI klici so dragi (čas + denar). Kako zmanjšati stroške in latency?

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Cache-first (24h+)** | Najnižji stroški, hitri | Morda zastareli podatki |
| Cache z kratkim TTL (1h) | Bolj sveže | Še vedno AI klici |
| Brez cache-a | Vedno sveže | Najdražje, najpočasneje |
| Predictive cache (pre-generiraj) | Hitri, nizka latency | Zapleteno, waste |

### Odločitev

**Cache-first strategija z različnimi TTL-ji:**

| Cache | TTL | Namembnost |
|-------|-----|-----------|
| AI priporočila | 24h | Product/experience priporočila |
| POI opisi | Permanent | Enkrat generirano, nikoli ne spreminja |
| SEO FAQ | 90 dni | Stabilna vsebina |
| AI insights | 7 dni | Tedenska osvežitev |

### Posledice

- ✅ 60-95% manj AI klicev
- ✅ Hitri response (cache hit = ms, ne s)
- ✅ Nizki stroški
- ⚠️ Morda zastareli priporočila (mitigirano z 24h TTL)
- ⚠️ Cache invalidation complexity (ko se lokal posodobi)
- ⚠️ Disk prostor za cache datoteke

---

## ADR-012 — Free B2C + paid B2B monetizacija

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Kdo plača za platformo? Uporabniki ali ponudniki?

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Free B2C + paid B2B** | Največji reach, uporabniki brezplačno | Težje prodati B2B |
| Freemium B2C (premium uporabniki) | Dodaten prihodek | Manj uporabnikov |
| Oglasni B2C (display ads) | Pasivni prihodek | Slab UX, nizka marža |
| Subscription B2C | Ponavljajoči prihodek | Najmanj uporabnikov |
| Transaction fee (provizija) | Sledi uspehu | Kompleksno, nizka marža |

### Odločitev

**Free B2C + paid B2B:**
- Uporabniki: vedno brezplačno (AI, iskanje, itinererji)
- Ponudniki: free (1 lokal) / premium €149/mes / enterprise €499/mes
- Affiliate: pasivni prihodek od Booking/Viator

### Posledice

- ✅ Največji reach (uporabniki brezplačno)
- ✅ Dva vira prihodka (B2B + affiliate)
- ✅ Uporabnik nikoli ne plača = raste organically
- ⚠️ Težje prodati B2B (potreben outreach)
- ⚠️ Free uporabniki = strošek brez direktnega prihodka
- ⚠️ Affiliate odvisen od partnerjev

---

## ADR-013 — Pavšalni oglas, ne provizija

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Kako zaračunati B2B? Pavšalni oglas ali provizija na rezervacije?

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Pavšalni oglas (€149/499 mes)** | Predvidljiv prihodek, enostavno | Brez incentive za večjo promocijo |
| Provizija (5-10% na rezervacijo) | Sledi uspehu, nizka barrier | Nepredvidljivo, težko slediti |
| Hibrid (pavšal + provizija) | Najboljše oboje | Kompleksno |
| Pay-per-click | Sledi prometu | Nepredvidljivo za provider |

### Odločitev

**Pavšalni oglas** (ne provizija) ker:
1. Predvidljiv prihodek (MRR)
2. Enostavno za provider (ve koliko ga stane)
3. Brez potrebe po booking sistemu
4. Brez chargeback tveganja
5. Affiliate model pokrije "provizijo" posebej

### Posledice

- ✅ Predvidljiv MRR
- ✅ Enostavna pricing
- ✅ Brez transakcijskega tveganja
- ⚠️ Brez incentive za aktivno promocijo (mitigirano z AI boost)
- ⚠️ Visoka barrier ($149/mes je veliko za male lokalce)

---

## ADR-014 — Beta do 30 lokalov brezplačno

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Kdaj začeti zaračunavati? Takoj ali po nekem mejniku?

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Beta do 30 lokalov** | Incentive za early adopters, network effect | Brez prihodka na začetku |
| Takoj plačljivo | Prihodek od prvega dne | Manj providerjev |
| Brezplačno 3 mesece | Časovno omejeno | Nekateri odidejo po 3 mesecih |
| Freemium za vedno (1 lokal free) | Največji reach | Brez monetizacije za male |

### Odločitev

**Beta brezplačno do 30 lokalov**, potem samodejni vklop monetizacije.

**Pravila:**
- Vsi paketi brezplačni med beto
- Ob dosegu 30: email vsem ownerjem
- 30-dnevni grace period
- Po tem: Free (1 lokal) ali plačilo

### Posledice

- ✅ Incentive za early adopters
- ✅ Network effect (več lokalov = več uporabnikov)
- ✅ Jasen mejnik za monetizacijo
- ⚠️ Brez prihodka v beta fazi (1-3 mesece)
- ⚠️ Nekateri providerji odidejo ob preklopu

---

## ADR-015 — Transparency-first: jasno označevanje oglasov

**Status:** ✅ Sprejet
**Datum:** 2025-01-15

### Kontekst

Ali naj uporabnik ve katera priporočila so plačana?

### Alternatives

| Opcija | Prednosti | Slabosti |
|--------|-----------|---------|
| **Transparency-first (označeno)** | Trust, legal compliance | Manj "učinkovito" za oglase |
| Skrito (ne označeno) | Več klikov | Nepošteno, nezakonito (FTC/EU) |
| Delno označeno (samo affiliate) | Kompro-mis | Zmeda |
| "Native advertising" (subtilno) | Boljši UX | Sivá cona, tveganje |

### Odločitev

**Transparency-first** — vsa plačana priporočila jasno označena:

| Tip | Badge | Kdaj |
|-----|-------|------|
| Organsko | (brez) | Brezplačno, relevantno |
| Sponzorirano | ⭐ Sponzorirano | Premium/Enterprise provider |
| Affiliate | 🔗 Partnerska povezava | Booking/Viator/DiscoverCars |
| Featured | ⭐ Featured | Uredniško poudarjeno |

### Posledice

- ✅ Trust (uporabnik ve kaj je oglas)
- ✅ Legal compliance (FTC, EU GDPR)
- ✅ Boljši UX (uporabnik lahko ignorira oglase)
- ⚠️ Manj klikov na sponzorirano (vendar bolj kakovostni)
- ⚠️ Providerji morda ne želijo "badge" (komunikacija)

---

## 📝 Kako dodati novo ADR

1. Kopiraj template spodaj
2. Dodeli naslednji ID (ADR-016, ADR-017, ...)
3. Izpolni vse sekcije
4. Dodaj v kazalo zgoraj
5. Commit z message: `docs(adr): ADR-0XX - [title]`

### ADR Template

```markdown
## ADR-0XX — [Title]

**Status:** 🟡 Predlagan | ✅ Sprejet | ❌ Zavrnjen | 🔄 Nadomešča ADR-0YY
**Datum:** YYYY-MM-DD

### Kontekst
[Zakaj je ta odločitev potrebna? Kakšen problem rešujemo?]

### Alternatives
[Seznam opcij z prednostmi in slabostmi]

### Odločitev
[Katero opcijo smo izbrali in zakaj?]

### Posledice
[Kakšne so posledice? Prednosti in slabosti?]
```

---

**Konec ADR dokumenta.**
