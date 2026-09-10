# 🇸🇮 Discover Slovenia AI — AI Tourism Platform

> **AI-poganjana turistična platforma za Slovenijo** — AI načrtovalec potovanj, tržnica lokalnih izdelkov in izkušenj, B2B portali za ponudnike, interaktivni zemljevid, in provizijski poslovni model (kot Booking.com) z avtomatiziranim obračunom in plačilom računov.

[![CI](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-indigo?logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-teal?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 📋 Kazalo

- [Pregled](#pregled)
- [Ključne funkcionalnosti](#ključne-funkcionalnosti)
- [Tehnični stack](#tehnični-stack)
- [Arhitektura](#arhitektura)
- [Hitri začetek](#hitri-začetek)
- [AI funkcionalnosti](#ai-funkcionalnosti)
- [Poslovni model](#poslovni-model)
- [Provizijski obračun](#provizijski-obračun)
- [Partner Quality Score](#partner-quality-score)
- [Approval Workflow](#approval-workflow)
- [Cron opravila](#cron-opravila)
- [Namestitev](#namestitev)
- [Dokumentacija](#dokumentacija)
- [Konfiguracija](#konfiguracija)

---

## Pregled

**Discover Slovenia AI** je celovita AI-poganjana turistična platforma za Slovenijo. Združuje AI načrtovalec potovanj z multi-turn pogovorom, naravnojezikovno iskanje, interaktivni zemljevid s tisočimi POI, tržnico lokalnih izdelkov in izkušenj, ter B2B portale za ponudnike in administratorje.

Platforma rešuje **3 ključne probleme**:

1. **Za turiste** — AI generira personalizirane itinererje v sekundah, z brezplačnim načrtovanjem in direktnimi rezervacijami
2. **Za lokalne ponudnike** — self-service portal za promocijo z AI auto-tagging, Quality Score in analytics
3. **Za Slovenijo** — prva platforma ki povezuje AI + lokalno + državno-specifično s preverjeno partnersko mrežo

---

## Ključne funkcionalnosti

### 🤖 AI funkcionalnosti (9)

| Funkcija | Opis |
|----------|------|
| **AI Itinerer** | Generira dnevne načrte potovanj z GLM (Puter API), multi-turn refinement |
| **AI Chatbot** | Lebdeči asistent z dostopom do baze (destinacije, lokalci, izdelki, izkušnje) |
| **Naravno-jezikovno iskanje** | "miren vikend ob reki" → AI razume in vrne matching rezultate |
| **AI Priporočila** | GLM izbere 4 najbolj smiselne izdelke/izkušnje (24h cache) |
| **AI POI opisi** | Generira opise za POI iz OpenStreetMap (permanent cache) |
| **AI Auto-tagging** | Lastnik vnese opis → AI predlaga kategorijo + atribute + tagi |
| **AI Vpogledi** | Analiza statistike z actionable insights za owner/admin dashboard |
| **AI SEO FAQ** | Generira FAQ za Google rich snippets (90-dnevni cache) |
| **AI Prevajalec** | Prevaja UI nize v en/de/it za developerje |

### 🏪 Tržnica

- **25 lokalov** (hoteli, restavracije, aktivnosti) — vsi z VLM-verified slikami
- **28 izdelkov** (kulinarika, vino, med, olje, obrt, spominki)
- **28 izkušenj** (turi, degustacije, avanture, wellness)
- **8 zbirk** za navigacijo (zimski, poletni, romantični, družinski, itd.)
- Realne rezervacije izkušenj s potrditvenimi e-poštami in obnovljen nakupni proces tržnice

### 👥 Skupnost in Vprašaj lokalca

- **UGC recenzije in javna galerija** skupnosti (Faza 2)
- **"Vprašaj lokalca"** — grounded AI Q&A nad bazo lokalov, izdelkov in izkušenj
- **Plačljive konzultacije** (freemium B2C, Faza 3b-2) — zasebna povezava `/konzultacija/[token]`
- **Web push obvestila** (VAPID) + dnevni opomniki za shranjena potovanja (Faza 3b)
- **Dogodki v načrtih potovanj, AI pakirni seznam, glasovanje skupine, PDF izvoz** (Faza 1)

### 🗺️ Zemljevid

- 22 destinacijskih markerjev
- Tisoči POI iz OpenStreetMap (Overpass API)
- Wikipedia opisi + AI generirani opisi
- Kategorije: atrakcije, muzeji, restavracije, narava, razgledi

### 🏢 B2B portali

**Owner Dashboard (6 tabov):**
- Moji lokalci (CRUD + status + AI auto-tag)
- Izdelki (CRUD + AI auto-tag)
- Izkušnje (CRUD + AI auto-tag)
- Naročnina (Stripe + paketi)
- Statistika (views, clicks, AI priporočila, ROI, AI insights, vrednost AI kanala)
- **Provizije** (predogled tekočega meseca, izdaja računov, zgodovina, PDF, plačilo s kartico)

**Admin Dashboard (5 tabov):**
- Lokali (upravljanje + featured + approve/reject)
- Leadi (JoinUs forme)
- Statistika (MRR, churn, LTV, conversion)
- Analytics (AI usage, KPI dashboard)
- Indeksacija (SEO status)

### 🔒 Approval Workflow

```
DRAFT → PENDING → APPROVED → PUBLISHED → ARCHIVED
                 ↓
              REJECTED (z razlogom)
```

- Novi lokalci začnejo kot `draft`
- Lastnik odda v pregled → `pending`
- Admin odobri → `published` + AI auto-enrichment (SEO meta, ključne besede)
- Admin zavrne z 8 strukturiranimi razlogi
- AI uporablja SAMO `published` lokale

### ⭐ Partner Quality Score (0-100)

| Signal | Utež | Kaj meri |
|--------|------|---------|
| Profile completion | 30 | 13 polj z utežmi |
| Image quality | 15 | Število slik (0-5+) |
| Description quality | 15 | Kratek + dolgi opis |
| AI tags | 10 | Specialitete/tagi |
| Admin verification | 10 | verifiedByAdmin |
| Rating | 10 | Uporabniške ocene |
| Data freshness | 10 | Čas od zadnje posodobitve |

**Featured auto-qualification:** Premium + Q>90 + Verified → Featured

### 🎯 AI Ranking Engine

```
Filter (published only) → Score → Rank → Transparency
```

| Dimenzija | Utež |
|-----------|------|
| Relevance | 60% |
| Quality Score | 15% |
| Rating | 10% |
| Distance | 10% |
| Premium Boost | 5% (max) |

- Konfigurabilne uteži (env variables)
- Max 5% premium boost — ne preglasi relevance
- Rating < 3.5 → nobenega boost-a
- Transparency labels za vsako priporočilo

---

## Tehnični stack

| Plast | Tehnologija |
|-------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Jezik | TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Database | Prisma 6 + SQLite (dev) / Turso (prod) |
| Auth | NextAuth.js v4 |
| AI | GLM preko Puter API + z-ai-web-dev-sdk fallback |
| Maps | Leaflet + OpenStreetMap Overpass API |
| i18n | next-intl (sl/en/de/it) |
| Email | Nodemailer |
| Payments | Stripe (naročnine + enkratna plačila provizijskih računov; demo mode brez ključev) |
| Deploy | Vercel (javni demo, avtomatski deploy iz `main`) ali Docker Compose (produkcijska priporočena pot) |

---

## Arhitektura

```
Browser → Vercel Edge CDN → Next.js 16 (RSC + API Routes)
                                ├── SQLite/Turso (Prisma)
                                ├── Puter API (GLM AI)
                                ├── OpenStreetMap (POI)
                                ├── Open-Meteo (Weather)
                                ├── Stripe (Payments)
                                └── SMTP (Email)
```

**AI fallback chain:** Puter → z-ai-web-dev-sdk → rule-based (nikoli 500 error)

---

## Hitri začetek

```bash
# 1. Install dependencies
bun install

# 2. Setup environment
cp .env.example .env
# Edit .env (ADMIN_PASSWORD, NEXTAUTH_SECRET, DATABASE_URL)

# 3. Setup database
bun run db:push

# 4. (opcija) demo podatki za prvi vtis — partnerji, listingi, izkušnje,
#    izdelki, rezervacije in provizijski račun (idempotentno)
bun run db:seed:demo

# 5. Start dev server
bun run dev

# 6. Open http://localhost:3005
```

### Testni računi (demo seed)

| Vloga | Email | Geslo |
|-------|-------|-------|
| Owner — free partner, provizija 12 % | tina@demo.discoverslovenia.si | demo1234 |
| Owner — premium partner, provizija 0 % | marko@demo.discoverslovenia.si | demo1234 |
| Owner — admin (samo lokalni/demo seed) | admin@demo.discoverslovenia.si | admin-demo-2026 |
| Admin portal | — | ADMIN_PASSWORD env |

> Demo seed na javnem Vercel buildu NE ustvari super_admin računa
> (`SKIP_DEMO_ADMIN=1` — varen za javni predstavitev).

---

## Poslovni model

> **Pivot (Faza 3c):** primarni model je provizija — kot pri Booking.com.
> Turist plača polno ceno neposredno ponudniku; platforma obračuna provizijo
> **IZKLJUČNO za rezervacije iz AI kanala** (`Booking.source = "consultation"`).
> Rezervacije iz drugih kanalov so brez provizije.

### B2C (brezplačno)

Uporabnik nikoli ne plača:
- AI itinerer: brezplačen
- AI chatbot in "Vprašaj lokalca": brezplačna osnovna raven
- Naravno-jezikovno iskanje: brezplačno
- Plačljive konzultacije (freemium): nadgradnja za poglobljeno načrtovanje

### B2B (provizijski model — primarni)

| Partner | Provizija na AI-rezervacije | Naročnina |
|---------|---------------------------|-----------|
| Free | **12 %** | €0 |
| Premium | **0 %** | €149/mes |
| Enterprise | **0 %** | €499/mes |

- Znesek se izračuna strežno iz atribuiranih rezervacij (stopnja se zapiše kot snapshot ob izdaji)
- Samodejni mesečni obračun (cron) + e-poštni račun + PDF izpis
- **Plačilo s kartico** (Stripe Checkout) ali SEPA nakazilo
- Tedensko poročilo "Vrednost AI kanala" za partnerje (B2B flywheel)

### Beta

Vsi paketi brezplačni do 30 lokalov. Ob dosegu: 30-dnevni grace period, nato samodejni vklop monetizacije.

### Affiliate

- Booking.com (5% commission)
- DiscoverCars (70% commission)
- Viator (8% commission)
- Skyscanner (40% commission)

---

## Provizijski obračun

```
AI konzultacija → rezervacija (source=consultation) → atribucija izkušnji
   → mesečni cron (1. v mesecu) → CommissionInvoice (INV-YYYYMM-XXXXXX)
   → e-poštni račun + dashboard → plačilo (Stripe Checkout / SEPA)
   → status: issued → paid (stripePaymentId / paidAt) + potrdilo
```

| Komponenta | Tehnologija |
|------------|-------------|
| Izdaja (ročna + cron) | `src/lib/commissions.ts` (idempotentna, snapshot stopnje) |
| API | `/api/owner/commissions` (GET predogled, POST `generate`/`mark_paid`) |
| Samodejni obračun | cron `/api/cron/commission-invoices` (vsak 1. v mesecu) |
| PDF račun | `/api/owner/commissions/invoice-pdf` (pdf-lib, LiberationSans) |
| Kartično plačilo | `/api/owner/commissions/checkout` + Stripe webhook (Faza 5) |
| Audit | `COMMISSION_INVOICE_ISSUED` / `COMMISSION_INVOICE_PAID` sled |

---

## Cron opravila

| Urnik (UTC) | Končna točka | Opis |
|---|---|---|
| `0 6 * * *` | `/api/cron/daily-trip-push` | dnevni push opomniki potovanj |
| `0 7 * * *` | `/api/cron/recalculate-status` | preračun statusov |
| `0 8 * * 1` | `/api/cron/weekly-alerts` | tedensko B2B poročilo (vrednost AI kanala) |
| `0 8 1 * *` | `/api/cron/commission-invoices` | mesečni obračun provizij |
| `0 9 * * *` | `/api/cron/renewal-reminders` | opomniki obnov naročnin |

Vsak klic je Bearer zaščiten s `CRON_SECRET` (brez njega 401 — fail-closed).

---

## Namestitev

### Vercel (javni demo)

- Push na `main` sproži avtomatski deploy; produkcijska URL: `i-feel-slovenia.vercel.app`
- Build: `bun install` + `bun run build` (prisma generate je v buildu, postinstallu IN `next.config.ts`)
- **Demo baza (Faza 4e):** build ustvari SQLite bazo s demo podatki
  (`scripts/build-demo-db.sh`), `src/instrumentation.ts` jo ob zagonu skopira v
  `/tmp` in preusmeri `DATABASE_URL` — vse DB poti delujejo (branje + pisanje
  per-instanca). Pisanja (rezervacije, računi) se med instancami NE ohranjajo.
- Izklop demo baze: env `DSA_DISABLE_DEMO_DB=1` (ob preklopu na hosted Postgres)

### Docker Compose (produkcijska priporočena pot — Pot A)

```bash
cp .env.example .env.docker   # izpolni skrivnosti
docker compose up -d --build  # app + cron vsebnik, trajen volumen
docker compose run --rm migrate bun scripts/seed-demo.ts  # (opcija) demo podatki
```

Celoten postopek, odločitvena analiza (Vercel + hosted Postgres — Pot B) in
vsakodnevno vzdrževanje: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Dokumentacija

| Dokument | Vsebina |
|----------|---------|
| [PRODUCT-BLUEPRINT.md](PRODUCT-BLUEPRINT.md) | Strateški dokument (FROZEN v1.0) |
| [TECHNICAL-SPECIFICATION.md](TECHNICAL-SPECIFICATION.md) | Implementacijska specifikacija |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Produkcijska namestitev (Docker/Vercel/Postgres, odločitvena analiza) |
| [CHANGELOG.md](CHANGELOG.md) | Zgodovina verzij (Faze 0–5) |
| [docs/ADR.md](docs/ADR.md) | 15 Architecture Decision Records |
| [docs/RISK-REGISTER.md](docs/RISK-REGISTER.md) | 15 tveganj z mitigacijo |
| [docs/DATA-FLOW.md](docs/DATA-FLOW.md) | Tok podatkov skozi sistem |
| [docs/OBSERVABILITY-PLAN.md](docs/OBSERVABILITY-PLAN.md) | Monitoring in alerting |
| [docs/MIGRATION-STRATEGY.md](docs/MIGRATION-STRATEGY.md) | Varne DB migracije |
| [docs/SEED-STRATEGY.md](docs/SEED-STRATEGY.md) | Dev/demo/prod seed |
| [docs/FEATURE-FLAGS.md](docs/FEATURE-FLAGS.md) | Postopno vklop funkcij |
| [docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md) | Backup in recovery test |
| [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) | Varnostni pregled |
| [docs/ACCESSIBILITY-REVIEW.md](docs/ACCESSIBILITY-REVIEW.md) | WCAG 2.1 AA |
| [docs/INCIDENT-PLAYBOOK.md](docs/INCIDENT-PLAYBOOK.md) | Kaj narediti ko X odpove |
| [docs/VERSIONING.md](docs/VERSIONING.md) | Verzioniranje |

---

## Konfiguracija

### Environment variables

```bash
# Database — glej .env.example (file:../db/custom.db; na Vercelu prevzame
# instrumentation.ts demo bazo)
DATABASE_URL=file:../db/custom.db

# Auth
ADMIN_PASSWORD=CHANGE_ME_TO_RANDOM_32_CHAR_STRING
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3005

# Cron (OBVEZNO v produkciji — fail-closed 401 brez njega)
CRON_SECRET=GENERIRAJ_RANDOM_SECRET

# AI (Puter — free)
PUTER_AUTH_TOKEN=your-token
PUTER_BASE_URL=https://api.puter.com/puterai/openai/v1/
PUTER_MODEL=z-ai/glm-5.1

# Stripe (optional — demo mode brez ključev; nujno za kartično plačilo računov)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (optional — console.log fallback)
SMTP_HOST=localhost
SMTP_PORT=587

# Vercel demo baza — izklop (samo, če uporabljate hosted Postgres)
# DSA_DISABLE_DEMO_DB=1
```

### Ranking configuration (optional override)

```bash
RANKING_WEIGHTS='{"relevance":60,"quality":15,"rating":10,"distance":10,"premium":5}'
FEATURED_REQUIREMENTS='{"minPlan":"premium","minQualityScore":90,"requireAdminVerification":true}'
```

---

## License

MIT — see [LICENSE](LICENSE)
