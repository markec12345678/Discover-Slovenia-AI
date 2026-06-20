# 🇸🇮 I Feel Slovenia — AI Tourism Platform

> **AI-poganjana turistična platforma za Slovenijo** — destinacije, tržnica lokalnih izdelkov in izkušenj, B2B portali za ponudnike, interaktivni zemljevid s tisočimi POI, in pavšalni oglasni model.

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-indigo?logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-teal?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 📋 Kazalo

- [Pregled](#pregled)
- [Ključne funkcionalnosti](#ključne-funkcionalnosti)
- [Tehnični stack](#tehnični-stack)
- [Arhitektura](#arhitektura)
- [Hitri začetek](#hitri-začetek)
- [Struktura projekta](#struktura-projekta)
- [API dokumentacija](#api-dokumentacija)
- [B2B portali](#b2b-portali)
- [Monetizacijski model](#monetizacijski-model)
- [Konfiguracija](#konfiguracija)
- [Deploy](#deploy)
- [Unikatnost](#unikatnost)

---

## Pregled

**I Feel Slovenia** je celovita AI-poganjana turistična platforma za Slovenijo. Združuje AI načrtovalec potovanj, interaktivni zemljevid s tisočimi točkami interesa (POI), tržnico lokalnih izdelkov in izkušenj, ter B2B portale za ponudnike in administratorje.

Platforma rešuje **3 ključne probleme**:

1. **Za turiste** — AI generira personalizirane itinererje v sekundah, povezane z direktnimi rezervacijami
2. **Za lokalne ponudnike** — self-service portal za promocijo njihovih storitev in izdelkov
3. **Za Slovenijo** — prva platforma ki povezuje AI + lokalno + državno-specifično

---

## Ključne funkcionalnosti

### 🤖 AI načrtovalec potovanj
- Generira večdnevne itinererje glede na proračun, interese, sezono in skupino
- **Sponzorirana priporočila** — premium ponudniki se samodejno omenjajo v AI predlogih
- Pametni fallback — če AI odpove, generira deterministični itinerer iz statičnih podatkov
- **Booking panel** — po vsakem dnevu 4 kategorije rezervacij (Nastanitev, Aktivnosti, Hrana, Transport)

### 🗺️ Interaktivni zemljevid
- **22 destinacij** v 9 regijah z custom emoji markerji
- **Tisoči POI** iz OpenStreetMap (Overpass API) z Wikipedia opisi
- AI route polyline — prikaz predlagane poti na zemljevidu
- Toggle za POI layer z 8 kategorijami (atrakcije, muzeji, restavracije, itd.)

### 🛒 Tržnica (Marketplace)
- **Izdelki** — med, vino, olje, sir, klobase, craft izdelki (28+)
- **Izkušnje** — rafting, kulinarične ture, pohodi, degustacije, wellness (28+)
- **Redirect model** — uporabnik gre direktno na ponudnikovo stran (ne pobiramo plačil)
- AI priporočila "Morda vam je všeč" za upsell/cross-sell

### 🏢 Listings (B2B lokalci)
- Hoteli, restavracije, aktivnosti, transport (26+)
- Plan-aware styling: Free (siva), Premium (zelena bordura), Enterprise (debel rob)
- Featured badge, verified badge, sponzorirana AI priporočila

### 📅 Content sekcije
- **Dogodki** — 12+ realnih slovenskih festivalov skozi vse leto
- **Blog** — 6+ člankov z markdown vsebino (SEO)
- **Zbirke** — 8 kuriranih kategorij (Zimski, Poletni, Romantični, Družinski, itd.)
- **Pitch deck** — za privabljanje novih ponudnikov

### 🔐 B2B portali
- **Owner portal** — registracija, prijava, dashboard z 5 tabi
- **Admin portal** — geslo-zaščiten dashboard z 3 tabi
- **NextAuth** z bcrypt hashing
- Plan limiti (beta: free=3, premium=10, enterprise=∞)

### 🌍 Multi-language (i18n)
- 4 jeziki: Slovenščina (default), Angleščina, Nemščina, Italijanščina
- URL routing: `/` (sl), `/en`, `/de`, `/it`
- Language switcher z zastavicami

### 📧 Email avtomatizacija
- 5 dvojezičnih (SL/EN) templates: welcome, payment, renewal, lead notification, admin alert
- Nodemailer z demo fallback (console.log)
- Cron job za 7-dnevne renewal opomnike

### 📊 Owner Analytics
- KPI kartice: ogledi, kliki, leadi, konverzija %
- ROI izračun: "ROI pozitiven" če ≥3 leadi
- Top 5 oglasov po ogledih
- 30-dnevni trend

### 🔍 SEO + PWA
- Dynamic metadata za vsako destinacijo
- Structured data (JSON-LD: WebSite, Organization)
- Sitemap.xml (31 URLs), robots.txt
- PWA: manifest.json, service worker, offline fallback
- Open Graph + Twitter Cards

### 🚀 Beta model
- Vsi paketi BREZPLAČNI do 30 aktivnih lokalov
- Beta banner s števcem do monetizacije
- Po 30 lokalih: samodejni vklop pavšalnih cen

---

## Tehnični stack

| Kategorija | Tehnologija |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Jezik** | TypeScript 5.9 |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York) |
| **Baza** | Prisma 6 + SQLite |
| **Auth** | NextAuth.js v4 (Credentials provider) |
| **AI** | z-ai-web-dev-sdk (GLM) |
| **Zemljevid** | Leaflet + OpenStreetMap + Overpass API |
| **i18n** | next-intl v4 |
| **Email** | Nodemailer |
| **Plačila** | Stripe (demo mode, production-ready) |
| **State** | Zustand + TanStack React Query |
| **Markdown** | react-markdown |
| **IKone** | Lucide React |
| **Animacije** | Framer Motion + tw-animate-css |

---

## Arhitektura

```
┌─────────────────────────────────────────────────────┐
│                    JAVNA STRAN (/)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │   Hero   │ │  Stats   │ │Zbirke    │ │Destinac.│ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │AI Planner│ │ Zemljevid│ │ Listings │ │Tržnica  │ │
│  │+Booking  │ │ + POI    │ │ (B2B)    │ │Products │ │
│  └──────────┘ └──────────┘ └──────────┘ │+Experien│ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ └─────────┘ │
│  │ Dogodki  │ │  Blog    │ │Affiliate │ │JoinUs   │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐                                      │
│  │Pitch Deck│                                      │
│  └──────────┘                                      │
└─────────────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│B2B PORTALI  │ │  API LAYER  │ │  PODATKI    │
│             │ │             │ │             │
│/admin       │ │/api/destin. │ │Prisma+SQLite│
│/owner/prijava│ │/api/itinerar│ │             │
│/owner/dashb.│ │/api/listings│ │Owner        │
│             │ │/api/products│ │Listing      │
│3-5 tabov    │ │/api/experien│ │Product      │
│             │ │/api/pois    │ │Experience   │
│             │ │/api/leads   │ │             │
│             │ │/api/stripe  │ │             │
│             │ │/api/email   │ │             │
└─────────────┘ └─────────────┘ └─────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  AI ENGINE  │ │  ZEMLJEVID  │ │  EXTERNAL   │
│             │ │             │ │             │
│z-ai-web-dev │ │Leaflet+OSM  │ │Open-Meteo   │
│-sdk (GLM)   │ │             │ │(vreme)      │
│             │ │Overpass API │ │             │
│Sponsored    │ │(POI)        │ │Wikidata     │
│prioritiz.   │ │             │ │(Wikipedia)  │
│             │ │Wikipedia    │ │             │
│Fallback     │ │REST API     │ │Stripe       │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## Hitri začetek

### Predpogoji

- [Node.js](https://nodejs.org/) 20+ ali [Bun](https://bun.sh/) 1.3+
- [Git](https://git-scm.com/)

### Namestitev

```bash
# Kloniraj repozitorij
git clone https://github.com/markec12345678/i-feel-slovenia.git
cd i-feel-slovenia

# Namesti odvisnosti
bun install
# ali: npm install

# Ustvari .env datoteko
cp .env.example .env
# Uredi .env s svojimi vrednostmi

# Inicializiraj bazo
bun run db:push

# Seedaj bazo z začetnimi podatki
bunx tsx prisma/seed.ts

# Zaženi razvojni strežnik
bun run dev
```

Aplikacija bo na voljo na `http://localhost:3000`.

### Testni podatki

| Vloga | URL | Geslo |
|---|---|---|
| Admin | `/admin` | `***ODSTRANJENO***` |
| Owner | `/owner/prijava` | Registriraj se |

---

## Struktura projekta

```
i-feel-slovenia/
├── prisma/
│   ├── schema.prisma          # Owner, Listing, Product, Experience modeli
│   └── seed.ts                # Seed skripta (listings, products, experiences)
├── public/
│   ├── manifest.json          # PWA manifest
│   └── sw.js                  # Service worker
├── src/
│   ├── app/
│   │   ├── admin/             # Admin dashboard
│   │   ├── api/               # API routes (14+)
│   │   │   ├── destinations/
│   │   │   ├── itinerary/
│   │   │   ├── listings/
│   │   │   ├── products/
│   │   │   ├── experiences/
│   │   │   ├── pois/
│   │   │   ├── weather/
│   │   │   ├── leads/
│   │   │   ├── beta-status/
│   │   │   ├── owner/
│   │   │   ├── admin/
│   │   │   ├── stripe/
│   │   │   └── auth/
│   │   ├── owner/             # Owner portal (prijava, dashboard)
│   │   ├── sitemap.ts         # Dinamični sitemap
│   │   ├── robots.ts          # Robots.txt
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Homepage (vse sekcije)
│   │   └── globals.css        # Slovenska tema
│   ├── components/
│   │   ├── sections/          # Glavne sekcije (18+)
│   │   ├── ui/                # shadcn/ui komponente
│   │   ├── theme-provider.tsx
│   │   ├── session-provider.tsx
│   │   └── beta-banner.tsx
│   ├── hooks/
│   │   └── use-toast.ts
│   └── lib/
│       ├── types.ts           # Centralni tipi
│       ├── slovenia-data.ts   # 22 destinacij (single source of truth)
│       ├── affiliate.ts       # Affiliate link generatorji
│       ├── beta.ts            # Beta status logika
│       ├── auth.ts            # NextAuth config
│       ├── db.ts              # Prisma client
│       ├── email.ts           # Nodemailer config
│       ├── email-templates.ts # 5 email templates
│       ├── pricing.ts         # 3 cenovni paketi
│       └── store.ts           # Zustand (AI route state)
├── .env                       # Environment spremenljivke
├── next.config.ts             # Next.js config (images, etc.)
├── package.json
└── tsconfig.json
```

---

## API dokumentacija

### Javni API-ji

| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/destinations` | GET | Vse destinacije (filtri: region, featured) |
| `/api/destinations/[slug]` | GET | Posamezna destinacija |
| `/api/itinerary` | POST | Generiraj AI itinerer (body: PlannerInput) |
| `/api/itinerary/bookings` | POST | Pridobi booking opcije za destinacije |
| `/api/weather` | GET | Vreme za koordinate (Open-Meteo) |
| `/api/listings` | GET | Vsi lokalci (filtri: category, destinationId, sort) |
| `/api/listings/[slug]` | GET | Posamezni lokal |
| `/api/products` | GET | Vsi izdelki (filtri: category, destinationId, sort) |
| `/api/products/[slug]` | GET | Posamezni izdelek |
| `/api/experiences` | GET | Vse izkušnje (filtri: category, destinationId, sort) |
| `/api/experiences/[slug]` | GET | Posamezna izkušnja |
| `/api/pois` | GET | POI-ji iz OpenStreetMap (filtri: category, limit) |
| `/api/pois/[id]` | GET | Podrobnosti POI + Wikipedia opis |
| `/api/beta-status` | GET | Status beta obdobja |
| `/api/leads` | POST | Shrani lead iz JoinUs forme |

### B2B API-ji (auth required)

| Endpoint | Metoda | Opis |
|---|---|---|
| `/api/owner/register` | POST | Registracija lastnika |
| `/api/owner/listings` | GET/POST | Lastnikovi lokalci |
| `/api/owner/listings/[id]` | GET/PUT/DELETE | Upravljanje posameznega lokalca |
| `/api/admin/verify` | POST | Admin login |
| `/api/admin/listings` | GET/POST | Admin CRUD lokalov |
| `/api/admin/leads` | GET/PUT | Admin leads management |
| `/api/stripe/checkout` | POST | Stripe checkout (demo mode) |

---

## B2B portali

### Admin portal (`/admin`)

**Geslo:** `***ODSTRANJENO***` (iz env `ADMIN_PASSWORD`)

3 tabi:
1. **Lokali** — CRUD vseh listings z iskanjem
2. **Leadi** — pregled in upravljanje leadov iz JoinUs forme
3. **Statistika** — KPI (skupno, premium, leads, views), top 5, bar chart

### Owner portal (`/owner/prijava` → `/owner/dashboard`)

**Registracija:** brezplačna, z GDPR privolitvijo

5 tabov:
1. **Moji lokalci** — CRUD lastnih listings (plan limit: free=3, premium=10, enterprise=∞)
2. **Izdelki** — CRUD izdelkov v tržnici
3. **Izkušnje** — CRUD izkušenj v tržnici
4. **Naročnina** — pregled plana, nadgradnja (Stripe)
5. **Statistika** — KPI (views, clicks, leads, konverzija, ROI)

---

## Monetizacijski model

### Pavšalni oglasni model (ne provizija!)

Platforma ne pobira plačil od uporabnikov. Namesto tega lokalni ponudniki plačujejo **fiksno mesečno naročnino** za prisotnost na platformi.

| Paket | Cena/mes | Kaj dobi |
|---|---|---|
| **Osnovni** | €0 | 3 oglase, osnovni prikaz |
| **Premium** | €149 | 10 oglasov, featured, AI priporočila, polna statistika |
| **Enterprise** | €499 | Neomejeno, lastna mini-stran, API dostop |

### Beta model

Med beta obdobjem (do 30 aktivnih lokalov) so **vsi paketi brezplačni**. Ko dosežemo 30 lokalov, se monetizacija samodejno vklopi. Beta uporabniki obdržijo ugodnosti 6 mesecev.

### Dodatni prihodki

- **Affiliate provizije** — Booking.com (5%), DiscoverCars (70%), Viator (8%), Skyscanner (40%)
- **Sponzorirana AI priporočila** — premium/enterprise ponudniki se omenjajo v AI itinererjih

---

## Konfiguracija

### Environment spremenljivke (`.env`)

```env
# Baza
DATABASE_URL=file:./db/custom.db

# Admin
ADMIN_PASSWORD=***ODSTRANJENO***
ADMIN_EMAIL=admin@ifeelslovenia.si

# NextAuth
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000

# Stripe (demo mode — zamenjaj za production)
STRIPE_SECRET_KEY=sk_test_demo_placeholder
STRIPE_PUBLISHABLE_KEY=pk_test_demo_placeholder
STRIPE_WEBHOOK_SECRET=whsec_demo_placeholder

# SMTP (demo mode — console.log)
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_SECURE=false
SMTP_FROM=noreply@ifeelslovenia.si
```

### Production konfiguracija

Za production zamenjaj:

1. **Stripe** — pravi `sk_live_*` ključi
2. **SMTP** — pravi SMTP strežnik (npr. SendGrid, Mailgun)
3. **DATABASE_URL** — PostgreSQL ali MySQL (ne SQLite)
4. **NEXTAUTH_SECRET** — močan naključni string
5. **ADMIN_PASSWORD** — močno geslo

---

## Deploy

### Vercel (priporočeno)

```bash
# Namesti Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment za production

- `DATABASE_URL` → PostgreSQL (Supabase, Neon, PlanetScale)
- `STRIPE_SECRET_KEY` → pravi Stripe ključ
- `SMTP_HOST` → SendGrid/Mailgun/etc.
- `NEXTAUTH_URL` → produkcijski URL

---

## Unikatnost

### Zakaj je ta platforma svetovna inovacija?

| Funkcija | AI Plannerji (Mindtrip) | Državne platforme (slovenia.info) | Marketplace (Airbnb) | **I Feel Slovenia** |
|---|---|---|---|---|
| AI načrtovalec | ✅ | ❌ | ❌ | ✅ |
| Lokalni ponudniki | ❌ | ✅ (statično) | ✅ | ✅ (dinamično) |
| Specifična država | ❌ | ✅ | ❌ | ✅ |
| B2B self-service | ❌ | ❌ | ✅ | ✅ |
| Pavšalni model | ❌ | ❌ | ❌ (provizija) | ✅ |
| POI iz OSM + Wikipedia | ❌ | ❌ | ❌ | ✅ |
| AI sponzorirana priporočila | ❌ | ❌ | ❌ | ✅ |
| Beta brezplačno | ❌ | ❌ | ❌ | ✅ |
| 4 jeziki | ❌ | ✅ | ✅ | ✅ |
| PWA | ❌ | ❌ | ✅ | ✅ |

**Nihče na svetu nima te kombinacije.**

---

## 📈 Roadmap

- [x] AI itinerer z booking panel
- [x] Interaktivni zemljevid s POI
- [x] Tržnica (izdelki + izkušnje)
- [x] B2B portali (admin + owner)
- [x] Pavšalni oglasni model
- [x] Beta model (brezplačno do 30 lokalov)
- [x] SEO + PWA + i18n
- [x] Email avtomatizacija
- [x] Owner analytics z ROI
- [ ] Več seed data (50+ listings, 50+ products)
- [ ] Mobilna aplikacija (React Native)
- [ ] Advanced AI (multi-turn conversation)
- [ ] Real-time availability (partner API integrations)
- [ ] Multi-country expansion (Hrvaška, Italija, Avstrija)

---

## 📄 Licenca

MIT License — glej [LICENSE](LICENSE) za podrobnosti.

---

## 🤝 Prispevanje

Prispevki so dobrodošli! Prosim odprite issue ali pull request.

---

## 📧 Kontakt

- **GitHub:** [markec12345678](https://github.com/markec12345678)
- **Email:** admin@ifeelslovenia.si

---

**Narejeno z ❤️ v Sloveniji** 🇸🇮
