# 🇸🇮 Discover Slovenia AI — AI Tourism Platform

> **AI-poganjana turistična platforma za Slovenijo** — AI načrtovalec potovanj, tržnica lokalnih izdelkov in izkušenj, B2B portali za ponudnike, interaktivni zemljevid in pošten provizijski model: **0 % na direktnih rezervacijah, 12 % izključno na AI kanalu**.

[![CI](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql)](https://neon.tech/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**Produkcija (primarna):** <https://i-feel-slovenia.onrender.com> (Render, avtomatski deploy iz `main`) · **Sekundarna:** <https://i-feel-slovenia.vercel.app> (Vercel, rate-limit okna — glej runbook)

**Status faz:** P0 ✅ → P1 ✅ → P2 ✅ → P3 ✅ (varnostni auditi) → P4 ✅ (pilotni polish) → P5 ✅ (priprava deploya) → P6 ✅ (sinhronizacija dokumentov) → P7 ✅ (varnostni audit + popravki P0–P2) → P8 ✅ (responsive 390 px + atomarna booking deduplikacija) → P9 ✅ (code freeze + deploy runbook/smoke orodja) → R2/R3 auditi ✅ → FW1 ✅ (kritični audit popravki) → FW2 ✅ (UX quick wins — Mindtrip Tier 1) → FW3 ✅ (AI-first hierarhija UX refaktor) → **MONET ✅ (monetizacijska mreža — 10 partnerjev fail-closed, affiliate + GEO/SEO paket + mobilni UX pass)** — pilot-ready; produkcijo preveri dinamično (smoke skripta, točka 8)

> 🧊 **CODE FREEZE (P9, 2026-09-11):** razvoj za pilot je zaključen — do konca pilota NOVIH funkcij ni (samo popravki napak iz realne uporabe).
>
> - **Odstopanji od zamrznitve (odobrena):** **FW1** `08e8369` — kritični popravki auditov R2/R3 (varnost = dovoljena kategorija pod freeze); **FW2** `629da01` — 8 UX quick wins iz primerjalne analize [Mindtrip.ai](https://mindtrip.ai/); **FW3** `0742a1a` — AI-first hierarhija UX refaktor (progresivno razkrivanje; homepage 22 → 8 blokov, 9 novih strani, CTA »Načrtuj z AI« povsod); **MONET valovi (2026-09-12, uporabnikovo izrecno naročilo — priprava monetizacije):** `d76a772` + `ea4c94a` — monetizacijska mreža 10 partnerjev (hoteli/Booking, izleti/GetYourGuide+Viator, avti/DiscoverCars, leti/Skyscanner, eSIM/Airalo, transferji/Kiwitaxi, transport/Omio, vstopnice/Tiqets, zavarovanje/WN+SafetyWing) — **fail-closed: brez ID-jev se kartice sploh ne izrišejo** (affiliate suite 55/55); **GEO paket** `239e6ce`…`37a6451` — llms.txt/llms-full.txt, RSS 2.0, eksplicitna AI-crawler dovoljenja v robots.txt, IndexNow (326 URL), host-zavedni metadata (og:image/canonical/JSON-LD na dejanskem gostitelju) — 6 indeksacijskih blokad odstranjenih (nevidno za uporabnike, 20 GEO smoke točk); **Mobilni UX pass** `84fdd7e` — 44px tap tarče (2026 standard), razbremenjen mobilni header, berljivejši hero, 2-stolpčna mobilna noga (VLM revizija pred/po).
> - **Koda:** `main` = `84fdd7e`. CI ✅ (Build + Lint/TypeCheck). Kateri commit je v produkciji, preveriš s smoke skripto (točka 8).
> - **Produkcija:** stanje preveri dinamično — `bash scripts/verify/production-smoke.sh` (P8/FW2 markerji, anti-enumeracija, cron fail-closed ×6, Vercel commit status). ⚠️ Deploy `8f419eb` (FW2) je bil 2026-09-11 zavrnjen — kvota `api-deployments-free-per-day` 100/100; reset po API **2026-09-12 17:54 UTC (19:54 CEST)**, rolling okno se lahko sprosti prej; glej [runbook spodaj](#deploy-po-rate-limit-okni-p9).
> - **Po deployu obvezno:** [produkcjski smoke](#produkcjski-smoke-p9--po-deployu) — `bash scripts/verify/production-smoke.sh` (varni GET preverki + markerji) + ročni brskalniški tokovi + funkcionalni pregled mobilnih tokov na 390 px.
> - **Zavedno odloženo (pred javnim launchem, NI pilot blocker):** rate limiting je per-instance → pred javnim prometom centralizirani limiter (npr. Upstash); `requireOwnership()` admin bypass dokumentiran v kodi (0 klicalcev — past za prihodnji razvoj, ne ranljivost); realni Stripe Checkout za rezervacije šele po poslovni odločitvi po pilotu (zdaj namerno fail-closed 501 v produkciji).

---

## 📋 Kazalo

- [Pregled](#pregled)
- [Ključne funkcionalnosti](#ključne-funkcionalnosti)
- [Varnostne plasti (P3)](#varnostne-plasti-p3)
- [Tehnični stack](#tehnični-stack)
- [Arhitektura](#arhitektura)
- [Hitri začetek](#hitri-začetek)
- [Poslovni model](#poslovni-model)
- [Provizijski obračun](#provizijski-obračun)
- [Approval in overitveni workflow](#approval-in-overitveni-workflow)
- [Partner Quality Score](#partner-quality-score)
- [Cron opravila](#cron-opravila)
- [Namestitev](#namestitev)
- [Dokumentacija](#dokumentacija)
- [Konfiguracija](#konfiguracija)

---

## Pregled

**Discover Slovenia AI** je celovita AI-poganjana turistična platforma za Slovenijo. Združuje AI načrtovalca potovanj z multi-turn pogovorom, naravnojezikovno iskanje, interaktivni zemljevid s tisočimi POI, tržnico lokalnih izdelkov in izkušenj, B2C račune popotnikov z deljenimi potovanji ter B2B portale za ponudnike in administratorje.

Platforma rešuje **3 ključne probleme**:

1. **Za turiste** — AI generira personalizirane itinererje v sekundah, brezplačno načrtovanje, direktni in AI-kanal rezervaciji
2. **Za lokalne ponudnike** — self-service portal z onboarding čarovnikom, 0 % provizije na direktnih rezervacijah (glej [konkurenčno analizo](docs/COMPETITIVE-ANALYSIS.md))
3. **Za Slovenijo** — med prvimi platformami, ki povezujejo AI + lokalno + državno-specifično s preverjeno partnersko mrežo

---

## Ključne funkcionalnosti

### 🤖 AI funkcionalnosti

| Funkcija | Opis |
|----------|------|
| **AI Itinerer** | Generira dnevne načrte potovanj (GLM prek Puter API), multi-turn izboljšave |
| **AI Chatbot** | Lebdeči asistent z dostopom do baze (destinacije, lokalci, izdelki, izkušnje) |
| **Naravno-jezikovno iskanje** | "miren vikend ob reki" → AI razume in vrne rezultate |
| **AI Priporočila** | Model izbere 4 najbolj smiselne izdelke/izkušnje (24h cache) |
| **AI POI opisi** | Generira opise za POI iz OpenStreetMap (trajni cache) |
| **AI Auto-tagging** | Lastnik vnese opis → AI predlaga kategorijo + atribute + tagi |
| **AI Vpogledi** | Analiza statistike z actionable insights za owner/admin dashboard |
| **AI SEO FAQ** | Generira FAQ za Google rich snippets (90-dnevni cache) |
| **AI Konzultacije** | Freemium globoke konzultacije z atribucijo rezervacij (30 dni); priporočeni partnerji kot vizualne place cards (slika, ocena, cena, CTA) |

**AI fallback veriga:** Puter → z-ai-web-dev-sdk → rule-based (nikoli 500). AI uporablja **izključno `published`** vsebine, podatki ponudnikov so zajeti v injection-safe ovojnico (`SYSTEM_DATA_GUARD`).

### 🧭 B2C plast (Faza P1–P2)

- **Računi popotnikov** (email verifikacija + reset gesla z razveljavitvijo sej)
- **Moja potovanja** — shranjevanje, dnevni push opomniki, PDF izvoz, pakirni seznam + **moja naročila/rezervacije** (lokalno sledenje + javni lookup)
- **Priljubljene (wishlist)** — srčki na karticah tržnice in modalih, localStorage, hitri dostop iz navigacije
- **Persistenca AI chata** — zgodovina pogovora preživi refresh (lokalno, FIFO 40, gumb »Počisti pogovor«)
- **Socialna plast** — javna galerija deljenih potovanj, glasovanje, komentarji, všečki, **QR koda deljene poti** (naslovni vnos → QR + tisk)
- **30-dnevna atribucija** — konzultacija → rezervacija (strežniško overjena)
- **A/B testiranje naročnine** z anonimno analitiko

### 🏪 Tržnica

- **Lokalni partnerji** (hoteli, restavracije, aktivnosti) s strežniško moderiranimi profili
- **Izdelki** (kulinarika, vino, med, olje, obrt, spominki)
- **Izkušnje** (turi, degustacije, avanture, wellness) z realnimi rezervacijami
- **Zbirke** za navigacijo (zimske, poletne, romantične, družinske, …)
- Celozaslonski lightbox galerij (izkušnje/izdelki: tipkovnica, števec, thumbnail list)
- Nakupni proces tržnice + košarica + Stripe checkout

### 🗺️ Zemljevid

- 22 destinacijskih markerjev, Leaflet + OpenStreetMap
- Tisoči POI (Overpass API) + Wikipedia in AI opisi
- Vremenska napoved (Open-Meteo) v načrtu potovanj

### 🏢 B2B portali

**Owner Dashboard:**
- **Onboarding čarovnik** (5 korakov; minimalna zahteva je 1 profilna fotografija, več je priporočeno)
- Moji lokalci / Izdelki / Izkušnje (CRUD + AI auto-tag + status moderacije)
- Rezervacije (strežniško validirane, zaključek, prihodek)
- Naročnina (Stripe + paketi, vrata: email verifikacija)
- **Sponzorstva** (Moja sponzorstva + nakupni tok; demo: takojšnja aktivacija, Stripe: redirect)
- Statistika (views, clicks, AI priporočila, ROI, vrednost AI kanala)
- **Provizije** (predogled meseca, izdaja računov, PDF, kartično plačilo)

**Admin Dashboard:**
- **Moderacijska vrsta** — lokalci, izdelki in izkušnje v eni pending seznamu z oznako tipa
- Overitev "Preverjen partner" — eksplicitna admin odločitev (approve znak NE podeli)
- Leadi (homepage B2B prijave — shranjeni v PostgreSQL)
- Statistika / Analytics (MRR, churn, LTV, AI usage) / Indeksacija (SEO)

### 👥 Skupnost

- **"Vprašaj lokalca"** — grounded AI Q&A nad bazo (javna vprašanja = social proof + SEO)
- **UGC recenzije in javna galerija** skupnosti
- Web push obvestila (VAPID) + dnevni opomniki

---

## Varnostne plasti (P3)

Trije neodvisni auditi (auth/authz, booking/Stripe, AI/data) → utrjevanje v 49 datotekah:

| Plast | Mehanizem |
|-------|-----------|
| **Seje** | Razveljavitveni `tokenVersion` ob resetu gesla (stara seja umre v ≤ 60 s) |
| **IDOR/BOLA** | 20/20 lastniških dostopov blokiranih (živo testirano) |
| **Moderacija** | VSE vsebine skozi pending → approve/reject; **re-moderacija** ob spremembi published vsebine |
| **Booking integriteta** | Cena/meje/dedup strežniško; duplikat 409; 48-bit številke rezervacij |
| **Stripe webhook** | Podpis + `ProcessedStripeEvent` dedup (replay-safe) + amount/payment_status verifikacija |
| **Prompt injection** | Podatki ponudnikov v ovojnici, navodila sistemu izven konteksta |
| **Admin** | Timing-safe primerjava gesla na vseh rutah, rate limit |
| **Javne rute** | Izključno `published` vsebine (pending ≠ javen) |
| **Rate limiting** | Prijava, registracija, track, verify, A/B eventi |

---

## Tehnični stack

| Plast | Tehnologija |
|-------|------------|
| Framework | Next.js 16 (App Router, RSC + API Routes) |
| Jezik | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) + Framer Motion |
| Database | Prisma 6 + PostgreSQL — **Neon** (produkcija in razvoj; Docker alternativa: SQLite v volumenu) |
| Auth | NextAuth.js v4 (credentials, JWT seje, tokenVersion invalidacija) |
| AI | GLM prek Puter API + z-ai-web-dev-sdk fallback |
| Maps | Leaflet + OpenStreetMap Overpass API |
| i18n | next-intl — javno **samo sl** (celoviti prevodi = roadmap C5); infrastruktura pripravljena |
| Email | Nodemailer (demo fallback: console.log) |
| Payments | Stripe (naročnine + provizijski računi; demo mode brez ključev) |
| Deploy | Render (primarni) + Vercel (sekundarni) — avtomatski deploy iz `main` |

---

## Arhitektura

```
Browser → Vercel Edge CDN → Next.js 16 (RSC + API Routes)
                                ├── Neon PostgreSQL (Prisma, pooler)
                                ├── Puter API (GLM AI)
                                ├── OpenStreetMap (POI)
                                ├── Open-Meteo (Weather)
                                ├── Stripe (Payments + webhooks)
                                └── SMTP (Email)
```

**Podatkovni model (25 modelov):** User, Owner, SavedItinerary, TripVote, TripComment, TripLike, Listing, ListingEvent, Product, Experience, Review, Order, Booking, Sponsorship, PageView, AnalyticsEvent, AIUsageLog, AuditLog, LocalQuestion, ProcessedStripeEvent, Consultation, PushSubscription, CommissionInvoice, Lead, NewsletterSubscriber.

---

## Hitri začetek

```bash
# 1. Namesti odvisnosti
bun install

# 2. Nastavi okolje
cp .env.example .env
# Uredi .env — OBVEZNO: DATABASE_URL (PostgreSQL, npr. brezplačni Neon),
# ADMIN_PASSWORD, NEXTAUTH_SECRET (shema je postgresql — SQLite URL ne deluje)

# 3. Postavi bazo (prisma db push + generate)
bun run db:push

# 4. (opcija) demo podatki — partnerji, listingi, izkušnje,
#    izdelki, rezervacije in provizijski račun (idempotentno)
bun run db:seed:demo

# 5. Zaženi dev strežnik
bun run dev

# 6. Odpri http://localhost:3000
```

### Testni računi (demo seed — SAMO lokalna SQLite)

| Vloga | Email | Geslo |
|-------|-------|-------|
| Owner — free partner, provizija 12 % | tina@demo.discoverslovenia.si | demo1234 |
| Owner — premium partner, provizija 0 % | marko@demo.discoverslovenia.si | demo1234 |

Fiksni gesli veljata **izključno** ob lokalu seedu SQLite z `DEV_FIXED_DEMO_PASSWORDS=1` (privzeto seed ustvari naključna gesla; proti remote/postgres bazi se gesla NE izpišejo).

Admin dostop do portala `/admin` poteka prek `ADMIN_PASSWORD` env (ne prek NextAuth računa).

> ⚠️ **Status demo računov (P7-A, 2026-09-11):**
> - Demo seed se na Vercelu NE izvede (build skripta se izklopi pri postgresql shemi).
> - V produkcijski bazi (Neon) so bili demo računi **upokojeni**: `admin@demo` (super_admin) je **izbrisan**; ana/marko/tina/luka imajo **rotirana naključna gesla** + razveljavljene seje. Vsa nekaj javno dokumentirana gesla (`demo1234`, `admin-demo-2026`) na produkciji **ne delujejo več** (preverjeno: 401).
> - Vsebina (lokalci, izdelki, izkušnje) ostaja vidna — upokojeni računi so inertni lastniki demo vsebine, ki je jasno označena (žive številke se prikazujejo dinamično iz baze, `/za-ponudnike`).

---

## Poslovni model

> **Primarni model:** provizija — kot pri Booking.com, a poštenejše.
> Turist plača polno ceno neposredno ponudniku; platforma obračuna provizijo
> **IZKLJUČNO za rezervacije iz AI kanala** (`Booking.source = "consultation"`).
> **Direktne rezervacije so brez provizije** (0 %) — ključna konkurenčna prednost.

### B2C (brezplačno)

Uporabnik nikoli ne plača: AI itinerer, chatbot, "Vprašaj lokalca", iskanje.
Plačljive so le globoke konzultacije (freemium nadgradnja).

### B2B (provizijski model — primarni)

| Partner | Provizija na AI-rezervacije | Naročnina |
|---------|---------------------------|-----------|
| Free | **12 %** | €0 |
| Premium | **0 %** | €149/mes |
| Enterprise | **0 %** | €499/mes |

- Znesek strežniško izračunan iz atribuiranih rezervacij (snapshot stopnje ob izdaji)
- Samodejni mesečni obračun (cron) + e-poštni račun + PDF + kartično plačilo
- Tedensko poročilo "Vrednost AI kanala"

### Beta

Vsi paketi brezplačni do 30 lokalov, nato 30-dnevni grace period.

### Affiliate

Booking.com, DiscoverCars, Viator, Skyscanner.

---

## Provizijski obračun

```
AI konzultacija → rezervacija (source=consultation) → atribucija izkušnji
   → mesečni cron (1. v mesecu) → CommissionInvoice (INV-YYYYMM-XXXXXX)
   → e-poštni račun + dashboard → plačilo (Stripe Checkout / SEPA)
   → status: issued → paid + potrdilo
```

| Komponenta | Tehnologija |
|------------|-------------|
| Izdaja (ročna + cron) | `src/lib/commissions.ts` (idempotentna, snapshot stopnje) |
| API | `/api/owner/commissions` (GET predogled, POST `generate`/`mark_paid`) |
| Samodejni obračun | cron `/api/cron/commission-invoices` (1. v mesecu) |
| PDF račun | `/api/owner/commissions/invoice-pdf` (pdf-lib) |
| Kartično plačilo | `/api/owner/commissions/checkout` + Stripe webhook (dedup + amount check) |
| Audit | `COMMISSION_INVOICE_ISSUED` / `COMMISSION_INVOICE_PAID` |

---

## Approval in overitveni workflow

```
DRAFT → PENDING → APPROVED → PUBLISHED → ARCHIVED
                 ↓
              REJECTED (s strukturiranim razlogom)
```

- Novi lokalci/izdelki/izkušnje začnejo kot `draft` → lastnik odda → `pending` → admin odobri → `published`
- **Re-moderacija:** sprememba objavljene vsebine → nazaj v `pending` (javno skrito do ponovne odobritve)
- AI in javne rute uporabljajo SAMO `published` vsebine

### Znak "Preverjen partner"

Eksplicitna, ločena admin odločitev — **odobritev (approve) znaka NE podeli**.
Admin ga podeli/odvzame z gumbom Overi (BadgeCheck) v Lokali tabu, z audit sledjo
(`LISTING_VERIFIED` / `LISTING_UNVERIFIED`). Znak pomeni: "podatke je preverila ekipa platforme".

### Lead obrazec (B2B lijak)

Homepage prijava ponudnika → model `Lead` (PostgreSQL) → admin Leadi tab
(statusi: nov → kontaktiran → zaključen).

---

## Partner Quality Score (0–100)

| Signal | Utež | Kaj meri |
|--------|------|---------|
| Profile completion | 30 | 13 polj z utežmi |
| Image quality | 15 | Število slik (0–5+) |
| Description quality | 15 | Kratek + dolgi opis |
| AI tags | 10 | Specialitete/tagi |
| Admin verification | 10 | verifiedByAdmin |
| Rating | 10 | Uporabniške ocene |
| Data freshness | 10 | Čas od zadnje posodobitve |

**Featured auto-qualification:** Premium + Q>90 + Verified → Featured.

**AI Ranking Engine:** Relevance 60 % / Quality 15 % / Rating 10 % / Distance 10 % / Premium boost max 5 % — konfigurabilno prek env, transparency labels ob vsakem priporočilu.

---

## Cron opravila

| Urnik (UTC) | Končna točka | Opis |
|---|---|---|
| `0 6 * * *` | `/api/cron/daily-trip-push` | dnevni push opomniki potovanj |
| `0 7 * * *` | `/api/cron/recalculate-status` | preračun statusov |
| `0 8 1 * *` | `/api/cron/commission-invoices` | mesečni obračun provizij |
| `0 8 * * 1` | `/api/cron/weekly-alerts` | tedensko B2B poročilo |
| `0 9 * * *` | `/api/cron/renewal-reminders` | opomniki obnov naročnin |
| `0 10 * * *` | `/api/cron/draft-reminders` | nudge osnutkov (optimistična ključavnica) |

Vsak klic je Bearer zaščiten s `CRON_SECRET` (brez njega 401 — fail-closed).

---

## Namestitev

### Render (primarna produkcija) + Vercel (sekundarna)

- **Render:** push na `main` sproži avtomatski deploy → `i-feel-slovenia.onrender.com` (~4 min, Docker). Primarni produkcijski URL od 2026-09-12 (MONET valovi).
- **Vercel:** push na `main` sproži avtomatski deploy → `i-feel-slovenia.vercel.app` (Hobby kvota deploymentov — glej runbook spodaj)
- Build: `bun install` + `bun run build` (prisma generate v postinstall)
- **Baza: Neon PostgreSQL** (pooler, `connection_limit=1`) — `DATABASE_URL` env
- CI (GitHub Actions): Lint & Type Check + Build proti `postgres:16-alpine` service containerju (P4-7)
- Zastarel demo-SQLITE mehanizem (Faza 4e) se samodejno izklopi pri postgresql shemi — glej docs/DEPLOYMENT.md razdelek 6
- Cron: `vercel.json` (Vercel Cron kliče 6 GET rut — secret prek `Authorization: Bearer <CRON_SECRET>`)

#### Deploy po rate-limit okni (P9)

Hobby račun ima dnevno kvoto deploymentov — `api-deployments-free-per-day` (100 na rolling 24 h). Ko je kvota porabljena, Vercel zavrne ustvarjanje deploymenta: commit status na GitHubu → *failure* (URL vsebuje `upgradeToPro=build-rate-limit`), prek API `payment_required`. Zavrnjen poskus **ne** ustvari deployment objekta (nič ne stane, varno za ponovne poskuse).

**Dogodek 2026-09-11 17:50 UTC (push FW2 `8f419eb`):** kvota 100/100, 0 ostaja. API navaja reset **2026-09-12 17:54:28 UTC (19:54:28 CEST)**; ker je okno rolling in je bil zadnji visible deployment ustvarjen 2026-09-10 20:41 UTC, se kvota lahko sprosti tudi prej — preverjaj z brezplačnim poskusom (točka 1).

1. Počakaj konec okna; preverjaj z zavrnjenim poskusom: `POST /v13/deployments` (zavrnitev = brezplačna, nič ne ustvari; odgovor vsebuje točen `limit.reset`).
2. **Pot A (brez praznega commita):** API deployment iz Git vira: `POST https://api.vercel.com/v13/deployments` s telesom `{"name":"i-feel-slovenia","gitSource":{"type":"github","repoId":<repoId>,"ref":"main"},"target":"production"}` (enakovredno dashboard »Deploy«; zgradi trenutni `main` HEAD).
3. **Pot B:** push kakršnega koli commita na `main` (Git integracija samodejno sproži nov deployment).
4. ⚠️ **NE** izberi »Redeploy« na starem (npr. `d2e371c`) deploymentu — namestil bi STARO kodo; rate-limited zavrnitev namreč ne pusti deployment objekta za redeploy.
5. Preveri uspeh: GitHub commit status (kontekst »Vercel« = ✓ success na zadnjem SHA) **ali** `bash scripts/verify/production-smoke.sh` (točka 8 skripte).

#### Produkcjski smoke (P9 — po deployu)

Avtomatizirani del (varen, brez DB pisanja):

```bash
bash scripts/verify/production-smoke.sh
# opciono (PIŠE v DB — počisti s scripts/db/p9-smoke-cleanup.ts):
SMOKE_BOOKING=1 SMOKE_NEWSLETTER=1 CRON_SECRET=<pravi> bash scripts/verify/production-smoke.sh
```

Celoten checklist (16 točk):

| # | Točka | Kako |
|---|-------|------|
| 1 | homepage | skripta (200 + P8 responsive markerji) |
| 2 | destinacija/detail | skripta (`/destinacija/bled/things-to-do`) |
| 3 | marketplace | skripta (`/za-ponudnike`, `/api/experiences` published-only) |
| 4 | experience detail | ročno (kartica izkušnje na homepage) |
| 5 | booking od začetka do konca | ročno UI **ali** `SMOKE_BOOKING=1` (ustvari + 409 dedup dokaz) |
| 6 | booking lookup | skripta (anti-enumeracija 404) + ročno z pravo številko |
| 7 | login/logout | ročno |
| 8 | owner login | ročno |
| 9 | owner CRUD osnovnega zapisa | ročno (draft → submit) |
| 10 | newsletter | `SMOKE_NEWSLETTER=1` ali ročno |
| 11 | consultation → recommendation → atribucija | ročno (preveri `source=consultation`) |
| 12 | admin authentication | ročno (`/admin` + `ADMIN_PASSWORD`) |
| 13 | 6 cron endpointov z napačnim/pravilnim secretom | skripta (napačen = 401 ×6; pravi = `CRON_SECRET=…`, idempotentno) |
| 14 | AI endpointi + rate limit | skripta (`/api/ai-health` 200; `SMOKE_RATE_LIMIT=1` za 429 — glej opombo o per-instance) |
| 15 | mobilni 390 px | ročno — **funkcionalno**, ne le vizualno |
| 16 | production kaže zadnji `main` | skripta (GitHub Vercel commit status + markerji) |

> Če je vse zeleno → **zamrznjeni repozitorij za pilot**.

### Docker Compose (alternativa — ZASTARELO)

> ⚠️ Docker pot (Pot A) je bila zasnovana v SQLite eri — shema je od Faze 4f `postgresql`, zato SQLite volumen v teh skriptah ne ustreza več. Primarna podprta pot je **Vercel + Neon** (zgoraj); Docker pot osveži ob potrebi po lastnem Postgres vsebniku.

```bash
cp .env.example .env.docker   # izpolni skrivnosti (PostgreSQL URL!)
docker compose up -d --build  # app + cron vsebnik
```

Celoten postopek in odločitvena analiza: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Dokumentacija

| Dokument | Vsebina |
|----------|---------|
| [PRODUCT-BLUEPRINT.md](PRODUCT-BLUEPRINT.md) | Strateški dokument (FROZEN v1.0) |
| [TECHNICAL-SPECIFICATION.md](TECHNICAL-SPECIFICATION.md) | Implementacijska specifikacija |
| [docs/PILOT-TEST-PROTOCOL.md](docs/PILOT-TEST-PROTOCOL.md) | **Pilot protokol — 10 realnih ponudnikov (go/no-go, checklist)** |
| [docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md) | **Konkurenčna analiza (GYG/Viator/Withlocals/Kimkim/Bókun/Layla)** |
| [docs/OUTREACH-TOOLKIT.md](docs/OUTREACH-TOOLKIT.md) | Snovanje/pristopni e-maili za partnerje |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Produkcijska namestitev |
| [CHANGELOG.md](CHANGELOG.md) | Zgodovina verzij |
| [docs/ADR.md](docs/ADR.md) | Architecture Decision Records |
| [docs/RISK-REGISTER.md](docs/RISK-REGISTER.md) | Tveganja z mitigacijo |
| [docs/DATA-FLOW.md](docs/DATA-FLOW.md) | Tok podatkov |
| [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) | Varnostni pregled |
| [docs/ACCESSIBILITY-REVIEW.md](docs/ACCESSIBILITY-REVIEW.md) | WCAG 2.1 AA |
| [docs/OBSERVABILITY-PLAN.md](docs/OBSERVABILITY-PLAN.md) | Monitoring in alerting |
| [docs/MIGRATION-STRATEGY.md](docs/MIGRATION-STRATEGY.md) | Varne DB migracije |
| [docs/SEED-STRATEGY.md](docs/SEED-STRATEGY.md) | Dev/demo/prod seed |
| [docs/FEATURE-FLAGS.md](docs/FEATURE-FLAGS.md) | Postopni vklop funkcij |
| [docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md) | Backup in recovery |
| [docs/INCIDENT-PLAYBOOK.md](docs/INCIDENT-PLAYBOOK.md) | Kaj narediti ko X odpove |
| [docs/VERSIONING.md](docs/VERSIONING.md) | Verzioniranje |

---

## Konfiguracija

### Environment variables

```bash
# Database — PostgreSQL (shema je postgresql; SQLite URL NE deluje)
# Brezplačna možnost: https://neon.tech → npr.:
DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1
# (Vrednost s & mora biti v .env v narekovajih, če jo Source-aš v bash!)

# Auth
ADMIN_PASSWORD=CHANGE_ME_TO_RANDOM_32_CHAR_STRING
ADMIN_EMAIL=admin@discoverslovenia.ai
NEXTAUTH_SECRET=GENERIRAJ_RANDOM_SECRET
NEXTAUTH_URL=http://localhost:3000

# Cron (OBVEZNO v produkciji — fail-closed 401 brez njega)
CRON_SECRET=GENERIRAJ_RANDOM_SECRET

# AI (Puter — free tier)
PUTER_AUTH_TOKEN=your-token
PUTER_BASE_URL=https://api.puter.com/puterai/openai/v1/
PUTER_MODEL=z-ai/glm-5.1

# Stripe (optional — demo mode brez ključev)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# Email (optional — console.log fallback)
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_FROM=Discover Slovenia AI <noreply@discoverslovenia.ai>

# Web push (optional)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com

# Ranking override (optional)
# RANKING_WEIGHTS='{"relevance":60,"quality":15,"rating":10,"distance":10,"premium":5}'
# FEATURED_REQUIREMENTS='{"minPlan":"premium","minQualityScore":90,"requireAdminVerification":true}'
```

---

## License

MIT — see [LICENSE](LICENSE)
