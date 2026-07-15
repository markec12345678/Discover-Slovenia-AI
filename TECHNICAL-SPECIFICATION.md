# Discover Slovenia AI — Technical Specification

> **Status:** DRAFT v1.0
> **Datum:** 2025-01-15
> **Avtor:** Engineering Team
> **Namen:** Konkretna implementacijska specifikacija ki sledi Product Blueprint v1.0
> **Pravilo:** Vsa koda mora slediti tej specifikaciji. Odstopanja zahtevajo ADR (Architecture Decision Record).

---

## 📑 Kazalo

1. [Arhitektura](#1-arhitektura)
2. [Database Schema](#2-database-schema)
3. [API Endpoints](#3-api-endpoints)
4. [TypeScript Tipi](#4-typescript-tipi)
5. [AI Servis](#5-ai-servis)
6. [Caching Strategija](#6-caching-strategija)
7. [Background Jobs & Cron](#7-background-jobs--cron)
8. [Webhooks](#8-webhooks)
9. [Auth & Permissions](#9-auth--permissions)
10. [Deployment Arhitektura](#10-deployment-arhitektura)
11. [Environment Variables](#11-environment-variables)
12. [File Structure](#12-file-structure)

---

## 1. Arhitektura

### 1.1 High-level arhitektura

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Homepage   │  │  AI Planner │  │  Chatbot    │             │
│  │  (RSC)      │  │  (Client)   │  │  (Client)   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Marketplace│  │  Map        │  │  Owner Dash │             │
│  │  (Client)   │  │  (Client)   │  │  (Client)   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL EDGE NETWORK                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Next.js 16 App Router                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │   │
│  │  │ RSC      │  │ API      │  │ Server   │             │   │
│  │  │ Pages    │  │ Routes   │  │ Actions  │             │   │
│  │  └──────────┘  └──────────┘  └──────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────┬──────────────┬──────────────┬──────────────┬───────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│  SQLite DB   │ │  AI API  │ │ External │ │  File System │
│  (Prisma)    │ │  (Puter) │ │  APIs    │ │  (data/)     │
│              │ │          │ │          │ │              │
│  - Listings  │ │  - GLM   │ │ - Stripe │ │  - Cache     │
│  - Products  │ │  - z-ai  │ │ - SMTP   │ │  - Leads     │
│  - Owners    │ │          │ │ - OSM    │ │  - Newsletter│
│  - Events    │ │          │ │ - Weather│ │              │
└──────────────┘ └──────────┘ └──────────┘ └──────────────┘
```

### 1.2 Tehnološki stack

| Plast | Tehnologija | Razlog |
|-------|------------|--------|
| **Framework** | Next.js 16 (App Router) | SSR + API routes + RSC |
| **Jezik** | TypeScript 5 | Type safety |
| **Styling** | Tailwind CSS 4 + shadcn/ui | Rapid UI development |
| **DB ORM** | Prisma 6 | Type-safe queries |
| **DB** | SQLite (dev) / Turso (prod) | Enostavno skaliranje |
| **Auth** | NextAuth.js v4 | Credentials provider |
| **AI** | z-ai-web-dev-sdk + Puter | GLM dostop |
| **Email** | Nodemailer | SMTP fleksibilnost |
| **Plačila** | Stripe | Subscriptions + checkout |
| **Maps** | Leaflet + OSM | Brezplačno, brez API ključa |
| **i18n** | next-intl | 4 jeziki |
| **State** | Zustand + TanStack Query | Client + server state |
| **Deploy** | Vercel | Edge CDN + auto-scale |

---

## 2. Database Schema

### 2.1 Trenutna schema (po popravkih)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url = env("DATABASE_URL")
}

// === UPORABNIKI ===

model Owner {
  id                   String   @id @default(cuid())
  email                String   @unique
  name                 String
  businessName         String
  businessType         String?
  location             String?
  passwordHash         String
  plan                 String   @default("free") // free | premium | enterprise
  role                 String   @default("provider") // provider | moderator | admin
  subscriptionStatus   String   @default("none") // none | trialing | active | past_due | canceled
  subscriptionEndsAt   DateTime?
  stripeCustomerId     String?
  stripeSubscriptionId String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  listings     Listing[]
  products     Product[]
  experiences  Experience[]

  @@index([email])
  @@index([plan])
  @@index([subscriptionStatus])
}

model User {
  // Za registrirane uporabnike (shranjevanje itinererjev)
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  passwordHash String
  preferences  String?  // JSON: { interests, budget, groupSize, ... }
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  itineraries  SavedItinerary[]

  @@index([email])
}

model SavedItinerary {
  id        String   @id @default(cuid())
  userId    String
  itinerary String   // JSON: Itinerary object
  formData  String   // JSON: PlannerInput
  name      String?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

// === LOKALCI ===

model Listing {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  description     String
  longDescription String?
  category        String   // hotel | restaurant | activity | shop | wellness | transport | bar
  destinationId   String?
  destinationName String?
  address         String
  phone           String?
  email           String?
  website         String?
  images          String   // JSON array
  plan            String   @default("free")
  featured        Boolean  @default(false)
  verified        Boolean  @default(false)
  rating          Float    @default(0)
  reviewCount     Int      @default(0)
  priceRange      String?  // € | €€ | €€€
  openingHours    String?
  specialties     String?  // JSON array
  ownerEmail      String?

  // Status sistem (NEW)
  status          String   @default("draft") // draft | pending | approved | published | rejected | expired | archived | deleted
  rejectionReason String?
  submittedAt     DateTime?
  approvedAt      DateTime?
  approvedBy      String?  // Admin ID

  // Statistika
  viewCount       Int      @default(0)
  clickCount      Int      @default(0)

  // Sponzorstvo (NEW - razširjeno)
  sponsored       Boolean  @default(false)
  sponsoredUntil  DateTime?
  sponsoredLevel  String?  // basic | premium | featured

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  ownerId         String?

  owner           Owner?   @relation(fields: [ownerId], references: [id], onDelete: SetNull)
  events          ListingEvent[]

  @@index([slug])
  @@index([category])
  @@index([destinationId])
  @@index([status])
  @@index([sponsored])
  @@index([plan])
}

model ListingEvent {
  id         String   @id @default(cuid())
  listingId  String
  type       String   // impression | click | ai_recommendation | lead | contact
  metadata   String?  // JSON: { source, userAgent, ... }
  createdAt  DateTime @default(now())

  listing    Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId])
  @@index([type])
  @@index([createdAt])
}

// === TRŽNICA ===

model Product {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  description     String
  longDescription String?
  category        String   // food | wine | honey | oil | craft | souvenir | other
  destinationId   String?
  destinationName String?
  price           Float
  compareAtPrice  Float?
  currency        String   @default("EUR")
  images          String   // JSON array
  stock           Int      @default(0)
  sku             String?
  weight          Float?

  // Atributi
  organic         Boolean  @default(false)
  handmade        Boolean  @default(false)
  local           Boolean  @default(true)
  vegan           Boolean  @default(false)

  // Trgovanje
  plan            String   @default("free")
  featured        Boolean  @default(false)
  verified        Boolean  @default(false)
  rating          Float    @default(0)
  reviewCount     Int      @default(0)

  // Shipping
  shippingFree    Boolean  @default(false)
  shipsEurope     Boolean  @default(true)
  shipsWorldwide  Boolean  @default(true)

  // Prodajalec
  sellerName      String
  sellerEmail     String?
  sellerPhone     String?
  sellerWebsite   String?

  // Status (NEW)
  status          String   @default("draft")

  // Statistika
  viewCount       Int      @default(0)
  saleCount       Int      @default(0)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  ownerId         String?

  owner           Owner?   @relation(fields: [ownerId], references: [id], onDelete: SetNull)

  @@index([slug])
  @@index([category])
  @@index([destinationId])
  @@index([status])
  @@index([featured])
}

model Experience {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  description     String
  longDescription String?
  category        String   // tour | workshop | tasting | outdoor | cultural | adventure | wellness
  destinationId   String?
  destinationName String?
  pricePerPerson  Float
  currency        String   @default("EUR")
  durationHours   Float
  minGroupSize    Int      @default(1)
  maxGroupSize    Int      @default(10)
  languages       String   // JSON array
  meetingPoint    String?
  address         String
  images          String   // JSON array

  // Ponudnik
  providerName    String
  providerEmail   String?
  providerPhone   String?
  providerWebsite String?

  // Trgovanje
  plan            String   @default("free")
  featured        Boolean  @default(false)
  verified        Boolean  @default(false)
  rating          Float    @default(0)
  reviewCount     Int      @default(0)
  familyFriendly  Boolean  @default(false)
  accessibility   String?

  // Status (NEW)
  status          String   @default("draft")

  // Statistika
  viewCount       Int      @default(0)
  bookingCount    Int      @default(0)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  ownerId         String?

  owner           Owner?   @relation(fields: [ownerId], references: [id], onDelete: SetNull)

  @@index([slug])
  @@index([category])
  @@index([destinationId])
  @@index([status])
  @@index([featured])
}

// === SPONZORSTVA (NEW) ===

model Sponsorship {
  id              String   @id @default(cuid())
  listingId       String
  ownerId         String
  level           String   // basic | premium | featured
  amount          Float    // EUR
  currency        String   @default("EUR")
  status          String   @default("created") // created | paid | active | expiring | expired | cancelled | archived
  stripePaymentId String?
  startsAt        DateTime
  endsAt          DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([listingId])
  @@index([ownerId])
  @@index([status])
  @@index([endsAt])
}

// === ANALITIKA (NEW) ===

model AnalyticsEvent {
  id        String   @id @default(cuid())
  type      String   // ai_itinerary | ai_chat | smart_search | affiliate_click | newsletter_signup
  userId    String?
  sessionId String?
  metadata  String   // JSON
  createdAt DateTime @default(now())

  @@index([type])
  @@index([createdAt])
  @@index([sessionId])
}

model AIUsageLog {
  id           String   @id @default(cuid())
  feature      String   // itinerary | chat | search | refine | recommend | poi | tag | insights | faq | translate
  source       String   // puter | z-ai-sdk | fallback | cache
  success      Boolean
  responseTime Int      // ms
  costEur      Float    @default(0)
  userId       String?
  sessionId    String?
  metadata     String?  // JSON
  createdAt    DateTime @default(now())

  @@index([feature])
  @@index([source])
  @@index([createdAt])
  @@index([success])
}
```

### 2.2 Migracije potrebne za v1.0

```sql
-- Migration: Add status system to listings
ALTER TABLE Listing ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE Listing ADD COLUMN rejection_reason TEXT;
ALTER TABLE Listing ADD COLUMN submitted_at DATETIME;
ALTER TABLE Listing ADD COLUMN approved_at DATETIME;
ALTER TABLE Listing ADD COLUMN approved_by TEXT;

-- Update existing listings to 'published' (so they remain visible)
UPDATE Listing SET status = 'published' WHERE status = 'draft';

-- Migration: Add sponsorship table
CREATE TABLE Sponsorship (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  level TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'EUR',
  status TEXT DEFAULT 'created',
  stripe_payment_id TEXT,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sponsorship_listing ON Sponsorship(listing_id);
CREATE INDEX idx_sponsorship_status ON Sponsorship(status);
CREATE INDEX idx_sponsorship_ends ON Sponsorship(ends_at);

-- Migration: Add analytics tables
CREATE TABLE AnalyticsEvent (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  metadata TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_analytics_type ON AnalyticsEvent(type);
CREATE INDEX idx_analytics_created ON AnalyticsEvent(created_at);

CREATE TABLE AIUsageLog (
  id TEXT PRIMARY KEY,
  feature TEXT NOT NULL,
  source TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  response_time INTEGER NOT NULL,
  cost_eur REAL DEFAULT 0,
  user_id TEXT,
  session_id TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_usage_feature ON AIUsageLog(feature);
CREATE INDEX idx_ai_usage_created ON AIUsageLog(created_at);

-- Migration: Add User and SavedItinerary tables
CREATE TABLE User (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  preferences TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE SavedItinerary (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  itinerary TEXT NOT NULL,
  form_data TEXT NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);
CREATE INDEX idx_saved_itinerary_user ON SavedItinerary(user_id);

-- Migration: Add owner role field
ALTER TABLE Owner ADD COLUMN role TEXT DEFAULT 'provider';
```

---

## 3. API Endpoints

### 3.1 Endpoint katalog

#### Public API (brez avtentikacije)

| Method | Path | Opis | Rate Limit |
|--------|------|------|-----------|
| GET | `/api/destinations` | Seznam destinacij | 100/min |
| GET | `/api/destinations/[slug]` | Detajl destinacije | 100/min |
| GET | `/api/listings` | Seznam lokalov (samo published) | 100/min |
| GET | `/api/listings/[slug]` | Detajl lokalca | 100/min |
| GET | `/api/products` | Seznam izdelkov | 100/min |
| GET | `/api/products/[slug]` | Detajl izdelka | 100/min |
| GET | `/api/experiences` | Seznam izkušenj | 100/min |
| GET | `/api/experiences/[slug]` | Detajl izkušnje | 100/min |
| GET | `/api/pois` | POI iz OpenStreetMap | 30/min |
| GET | `/api/pois/[id]` | POI detajl + Wikipedia | 30/min |
| GET | `/api/pois/describe` | AI opis POI | 20/min |
| GET | `/api/weather` | Vreme (Open-Meteo) | 60/min |
| GET | `/api/beta-status` | Status beta | 100/min |
| GET | `/api/ai-health` | AI health check | 10/min |

#### AI API (brez avt., z rate limit)

| Method | Path | Opis | Rate Limit |
|--------|------|------|-----------|
| POST | `/api/itinerary` | Generiraj AI itinerar | 10/hour/IP |
| POST | `/api/itinerary/refine` | Multi-turn refinement | 10/hour/IP |
| POST | `/api/chat` | AI chatbot | 20/hour/IP |
| POST | `/api/smart-search` | Naravnojezikovno iskanje | 30/hour/IP |
| GET | `/api/recommendations/products` | AI priporočila izdelkov | 60/hour/IP |
| GET | `/api/recommendations/experiences` | AI priporočila izkušenj | 60/hour/IP |
| GET | `/api/ai-insights` | AI vpogledi (admin/owner) | 10/hour |

#### Lead API

| Method | Path | Opis | Rate Limit |
|--------|------|------|-----------|
| POST | `/api/leads` | JoinUs lead form | 3/hour/IP |
| POST | `/api/newsletter/subscribe` | Newsletter signup | 3/hour/IP |
| POST | `/api/email-itinerary` | Pošlji itinerer na email | 5/hour/IP |

#### Owner API (avtentikacija: session)

| Method | Path | Opis | Permission |
|--------|------|------|-----------|
| POST | `/api/owner/register` | Registracija lastnika | Public |
| POST | `/api/owner/session` | Login | Public |
| GET | `/api/owner/session` | Trenutna seja | Authenticated |
| GET | `/api/owner/analytics` | Analitika lastnika | provider+ |
| POST | `/api/owner/auto-tag` | AI auto-tagging | provider+ |
| GET | `/api/owner/listings` | Seznam lastnikovih lokalov | provider+ |
| POST | `/api/owner/listings` | Ustvari lokal | provider+ |
| PUT | `/api/owner/listings/[id]` | Uredi lokal | provider+ (own) |
| DELETE | `/api/owner/listings/[id]` | Izbriši lokal | provider+ (own) |
| POST | `/api/owner/subscription` | Upgrade paketa | provider+ |
| GET | `/api/owner/subscription` | Status naročnine | provider+ |

#### Admin API (avtentikacija: x-admin-password)

| Method | Path | Opis | Permission |
|--------|------|------|-----------|
| GET | `/api/admin/leads` | Seznam leadov | admin |
| GET | `/api/admin/analytics` | Global analytics | admin |
| GET | `/api/admin/pending` | Pending approval seznam | admin/moderator |
| POST | `/api/admin/approve/[id]` | Odobri lokal | admin/moderator |
| POST | `/api/admin/reject/[id]` | Zavrni lokal | admin/moderator |
| POST | `/api/admin/feature/[id]` | Set featured | admin/moderator |
| GET | `/api/admin/sponsorships` | Seznam sponzorstev | admin |
| POST | `/api/admin/sponsorships` | Ustvari sponzorstvo | admin |
| PUT | `/api/admin/sponsorships/[id]` | Uredi sponzorstvo | admin |
| GET | `/api/admin/indexing` | SEO indexing status | admin |

#### Stripe Webhooks

| Method | Path | Opis |
|--------|------|------|
| POST | `/api/stripe/webhook` | Stripe webhook handler |
| POST | `/api/checkout` | Create checkout session |

#### Cron Jobs

| Method | Path | Opis | Auth |
|--------|------|------|------|
| GET | `/api/cron/weekly-alerts` | Tedenski email ownerjem | CRON_SECRET |
| GET | `/api/cron/sponsorship-expiry` | Preveri poteke sponzorstev | CRON_SECRET |
| GET | `/api/cron/beta-check` | Preveri beta status | CRON_SECRET |

### 3.2 API Response format

#### Uspeh
```typescript
{
  "data": T,           // glavni podatki
  "source": "ai" | "fallback" | "cache",  // za AI endpointe
  "cached": boolean,   // za cachane endpointe
  "timestamp": string  // ISO date
}
```

#### Napaka
```typescript
{
  "error": string,           // splošno sporočilo
  "code": string,            // "RATE_LIMITED" | "UNAUTHORIZED" | "NOT_FOUND" | "VALIDATION_ERROR"
  "details": object | null,  // dodatne informacije
  "retryAfter": number | null // sekunde (za rate limit)
}
```

---

## 4. TypeScript Tipi

### 4.1 Core tipi

```typescript
// src/lib/types.ts

// === UPORABNIKI ===

export type Role = "visitor" | "user" | "provider" | "premium" | "enterprise" | "moderator" | "admin" | "super_admin";

export type Plan = "free" | "premium" | "enterprise";

export type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

export interface Owner {
  id: string;
  email: string;
  name: string;
  businessName: string;
  plan: Plan;
  role: Role;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: Date | null;
}

// === STATUS SISTEM ===

export type ListingStatus =
  | "draft"
  | "pending"
  | "approved"
  | "published"
  | "rejected"
  | "expired"
  | "archived"
  | "deleted";

export type SponsorshipStatus =
  | "created"
  | "paid"
  | "active"
  | "expiring"
  | "expired"
  | "cancelled"
  | "archived";

export type SponsorshipLevel = "basic" | "premium" | "featured";

// === AI ===

export type AISource = "puter" | "z-ai-sdk" | "fallback" | "cache";

export type AIFeature =
  | "itinerary"
  | "chat"
  | "search"
  | "refine"
  | "recommend"
  | "poi"
  | "tag"
  | "insights"
  | "faq"
  | "translate";

export interface AICompletionResult {
  content: string;
  source: AISource;
  responseTimeMs: number;
  costEur: number;
}

// === ITINERER ===

export interface PlannerInput {
  budget: number;
  days: number;
  interests: string[];
  season: Season;
  groupSize: number;
}

export interface Itinerary {
  days: DayPlan[];
  total_budget: number;
  recommendations: string[];
  tips: string[];
  source: "ai" | "fallback";
}

export interface DayPlan {
  day: number;
  locations: LocationVisit[];
  weather: { condition: string; temp: number };
}

export interface LocationVisit {
  destination_id: string;
  destination_name: string;
  time_slot: string;
  duration: number;
  estimated_cost: number;
  notes?: string;
  // NEW: transparency
  recommendationType?: "organic" | "sponsored" | "affiliate";
  listingId?: string;
  listingSlug?: string;
  affiliateType?: "booking" | "viator" | "discovercars" | "skyscanner";
}

// === RANKING ===

export interface RankedItem {
  item: Listing | Product | Experience;
  relevanceScore: number;   // 0-1
  ratingScore: number;      // 0-1
  distanceScore: number;    // 0-1
  premiumBoost: number;     // 0.0 | 0.1
  totalScore: number;
  recommendationType: "organic" | "sponsored" | "affiliate";
}

// === ANALITIKA ===

export interface AnalyticsKPI {
  // Growth
  mau: number;
  aiItinerariesPerDay: number;
  aiChatsPerDay: number;
  smartSearchesPerDay: number;
  // Monetization
  mrr: number;
  premiumConversion: number;
  affiliateRevenue: number;
  churnRate: number;
  // AI
  aiSuccessRate: number;
  aiFallbackRate: number;
  avgAiResponseTime: number;
  aiCostPerRequest: number;
  // Trust
  avgListingRating: number;
  pendingApprovalTime: number;
  // Tech
  uptime: number;
  errorRate: number;
}
```

### 4.2 Permission tipi

```typescript
// src/lib/auth-guards.ts

export type Resource = "listing" | "product" | "experience" | "sponsorship" | "analytics" | "admin" | "user";
export type Action = "read" | "create" | "update" | "delete" | "approve" | "manage" | "*";
export type Scope = "own" | "all";

export interface Permission {
  resource: Resource;
  action: Action;
  scope: Scope;
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  visitor: [
    { resource: "listing", action: "read", scope: "all" },
    { resource: "product", action: "read", scope: "all" },
    { resource: "experience", action: "read", scope: "all" },
  ],
  user: [
    { resource: "listing", action: "read", scope: "all" },
    { resource: "product", action: "read", scope: "all" },
    { resource: "experience", action: "read", scope: "all" },
    { resource: "user", action: "manage", scope: "own" },
  ],
  provider: [
    { resource: "listing", action: "read", scope: "all" },
    { resource: "listing", action: "create", scope: "own" },
    { resource: "listing", action: "update", scope: "own" },
    { resource: "listing", action: "delete", scope: "own" },
    { resource: "product", action: "create", scope: "own" },
    { resource: "product", action: "update", scope: "own" },
    { resource: "experience", action: "create", scope: "own" },
    { resource: "experience", action: "update", scope: "own" },
    { resource: "analytics", action: "read", scope: "own" },
  ],
  premium: [
    // vse od provider +
    { resource: "analytics", action: "read", scope: "own" }, // napredne analytics
    { resource: "sponsorship", action: "create", scope: "own" },
  ],
  enterprise: [
    // vse od premium +
    { resource: "listing", action: "create", scope: "all" }, // API dostop
  ],
  moderator: [
    { resource: "listing", action: "read", scope: "all" },
    { resource: "listing", action: "update", scope: "all" },
    { resource: "listing", action: "approve", scope: "all" },
    { resource: "listing", action: "delete", scope: "all" },
  ],
  admin: [
    { resource: "*", action: "*", scope: "all" },
  ],
  super_admin: [
    { resource: "*", action: "*", scope: "all" },
  ],
};

export function canPerform(role: Role, perm: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.some(p =>
    (p.resource === perm.resource || p.resource === "*") &&
    (p.action === perm.action || p.action === "*") &&
    p.scope === perm.scope
  );
}
```

---

## 5. AI Servis

### 5.1 AI klient arhitektura

```typescript
// src/lib/ai-client.ts (posodobljen)

import OpenAI from "openai";
import { db } from "@/lib/db";
import type { AIFeature, AISource, AICompletionResult } from "@/lib/types";

// === KONFIGURACIJA ===

const AI_TIMEOUT_MS = 30_000;
const AI_RETRY_COUNT = 3;
const AI_RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

// === CACHING ===

interface CacheEntry<T> {
  data: T;
  source: AISource;
  cachedAt: number;
}

// === GLAVNA FUNKCIJA ===

export async function generateCompletion(
  messages: AIMessage[],
  options: {
    temperature?: number;
    jsonMode?: boolean;
    feature: AIFeature;        // za logging
    userId?: string;
    sessionId?: string;
    cacheKey?: string;         // za caching
    cacheTtlMs?: number;       // default: 24h
  }
): Promise<AICompletionResult | null> {
  const startTime = Date.now();
  const feature = options.feature;

  // 1. Preveri cache
  if (options.cacheKey) {
    const cached = await readCache(options.cacheKey, options.cacheTtlMs);
    if (cached) {
      await logAIUsage({
        feature,
        source: "cache",
        success: true,
        responseTime: Date.now() - startTime,
        costEur: 0,
        userId: options.userId,
        sessionId: options.sessionId,
      });
      return {
        content: cached.data,
        source: "cache",
        responseTimeMs: Date.now() - startTime,
        costEur: 0,
      };
    }
  }

  // 2. AI klic z fallback chain
  let result: AICompletionResult | null = null;

  // Poskus 1: Puter API
  result = await tryPuter(messages, options);
  if (!result) {
    // Poskus 2: z-ai-web-dev-sdk
    result = await tryZaiSdk(messages, options);
  }
  if (!result) {
    // Poskus 3: Fallback (caller naj uporabi lasten fallback)
    result = null;
  }

  // 3. Logging
  await logAIUsage({
    feature,
    source: result?.source || "fallback",
    success: result !== null,
    responseTime: Date.now() - startTime,
    costEur: result?.costEur || 0,
    userId: options.userId,
    sessionId: options.sessionId,
  });

  // 4. Shrani v cache
  if (result && options.cacheKey) {
    await writeCache(options.cacheKey, result.content, result.source);
  }

  return result;
}

// === PUTER API ===

async function tryPuter(
  messages: AIMessage[],
  options: { temperature?: number; jsonMode?: boolean }
): Promise<AICompletionResult | null> {
  const client = getPuterClient();
  if (!client) return null;

  for (let attempt = 0; attempt < AI_RETRY_COUNT; attempt++) {
    try {
      const completion = await withTimeout(
        client.chat.completions.create({
          model: process.env.PUTER_MODEL || "z-ai/glm-5.1",
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature: options.temperature ?? 0.7,
          ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        AI_TIMEOUT_MS
      );

      const content = completion.choices[0]?.message?.content?.trim();
      if (content) {
        return {
          content,
          source: "puter",
          responseTimeMs: 0, // set by caller
          costEur: estimateCost("puter", messages, content),
        };
      }
    } catch (error) {
      console.error(`[ai-client] Puter attempt ${attempt + 1} failed:`, error);
      if (attempt < AI_RETRY_COUNT - 1) {
        await sleep(AI_RETRY_DELAYS[attempt]);
      }
    }
  }

  return null;
}

// === Z-AI SDK (fallback) ===

async function tryZaiSdk(
  messages: AIMessage[],
  options: { temperature?: number }
): Promise<AICompletionResult | null> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      thinking: { type: "disabled" },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content) {
      return {
        content,
        source: "z-ai-sdk",
        responseTimeMs: 0,
        costEur: 0, // free tier
      };
    }
  } catch (error) {
    console.error("[ai-client] z-ai-sdk failed:", error);
  }

  return null;
}

// === HELPERS ===

function getPuterClient(): OpenAI | null {
  const token = process.env.PUTER_AUTH_TOKEN;
  const baseUrl = process.env.PUTER_BASE_URL || "https://api.puter.com/puterai/openai/v1/";

  if (!token || token === "YOUR_PUTER_AUTH_TOKEN") return null;

  return new OpenAI({ baseURL: baseUrl, apiKey: token });
}

function estimateCost(source: string, messages: AIMessage[], output: string): number {
  if (source === "puter") return 0; // free tier
  // GLM-4 pricing (if paid)
  const inputTokens = messages.reduce((sum, m) => sum + m.content.length / 4, 0);
  const outputTokens = output.length / 4;
  return (inputTokens * 0.00001 + outputTokens * 0.00003); // EUR
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === LOGGING ===

async function logAIUsage(params: {
  feature: AIFeature;
  source: AISource;
  success: boolean;
  responseTime: number;
  costEur: number;
  userId?: string;
  sessionId?: string;
}): Promise<void> {
  try {
    await db.aIUsageLog.create({
      data: {
        feature: params.feature,
        source: params.source,
        success: params.success,
        responseTime: params.responseTime,
        costEur: params.costEur,
        userId: params.userId,
        sessionId: params.sessionId,
        metadata: JSON.stringify({}),
      },
    });
  } catch (error) {
    console.error("[ai-client] logging failed:", error);
  }
}

// === CACHE ===

async function readCache(key: string, ttlMs?: number): Promise<CacheEntry<string> | null> {
  const ttl = ttlMs ?? 24 * 60 * 60 * 1000; // 24h default
  // Implementacija odvisna od cache sloja (filesystem, redis, memory)
  // ...
  return null;
}

async function writeCache(key: string, data: string, source: AISource): Promise<void> {
  // ...
}
```

### 5.2 AI Ranking algoritem

```typescript
// src/lib/ai-ranking.ts

import { db } from "@/lib/db";
import type { RankedItem, Listing } from "@/lib/types";

const RELEVANCE_WEIGHT = 0.60;
const RATING_WEIGHT = 0.20;
const DISTANCE_WEIGHT = 0.10;
const PREMIUM_WEIGHT = 0.10;
const MAX_PREMIUM_BOOST = 0.10;
const MIN_RATING_FOR_BOOST = 3.5;

export async function rankListings(
  query: string,
  context: { destinationId?: string; category?: string; interests?: string[] }
): Promise<RankedItem[]> {
  // 1. Pridobi vse published lokalce
  const listings = await db.listing.findMany({
    where: { status: "published" },
  });

  // 2. Izračunaj score za vsakega
  const ranked: RankedItem[] = listings.map(listing => {
    const relevanceScore = calculateRelevance(listing, query, context);
    const ratingScore = listing.rating / 5;
    const distanceScore = calculateDistance(listing, context);
    const premiumBoost = calculatePremiumBoost(listing);

    const totalScore =
      relevanceScore * RELEVANCE_WEIGHT +
      ratingScore * RATING_WEIGHT +
      distanceScore * DISTANCE_WEIGHT +
      premiumBoost * PREMIUM_WEIGHT;

    return {
      item: listing,
      relevanceScore,
      ratingScore,
      distanceScore,
      premiumBoost,
      totalScore,
      recommendationType: listing.sponsored && listing.sponsoredUntil > new Date()
        ? "sponsored"
        : "organic",
    };
  });

  // 3. Sortiraj po score
  return ranked.sort((a, b) => b.totalScore - a.totalScore);
}

function calculateRelevance(
  listing: Listing,
  query: string,
  context: { destinationId?: string; category?: string; interests?: string[] }
): number {
  let score = 0;

  // Ujemanje destinacije
  if (context.destinationId && listing.destinationId === context.destinationId) {
    score += 0.4;
  }

  // Ujemanje kategorije
  if (context.category && listing.category === context.category) {
    score += 0.3;
  }

  // Ujemanje interesov (v opisu)
  if (context.interests) {
    const desc = (listing.description + " " + (listing.longDescription || "")).toLowerCase();
    const matches = context.interests.filter(i => desc.includes(i.toLowerCase())).length;
    score += Math.min(matches * 0.1, 0.3);
  }

  return Math.min(score, 1);
}

function calculateDistance(
  listing: Listing,
  context: { destinationId?: string }
): number {
  // TODO: Implementiraj z geocoding
  // Zaenkrat: 1.0 če ista destinacija, 0.5 drugače
  if (context.destinationId && listing.destinationId === context.destinationId) {
    return 1.0;
  }
  return 0.5;
}

function calculatePremiumBoost(listing: Listing): number {
  // Rule 2: Max 10% boost
  // Rule 1: Ne boostaj slabih lokalov
  if (listing.rating < MIN_RATING_FOR_BOOST) return 0;

  if (listing.sponsored && listing.sponsoredUntil && listing.sponsoredUntil > new Date()) {
    return MAX_PREMIUM_BOOST;
  }

  if (listing.plan === "premium" || listing.plan === "enterprise") {
    return MAX_PREMIUM_BOOST;
  }

  return 0;
}
```

---

## 6. Caching Strategija

### 6.1 Cache sloji

| Sloj | Tehnologija | TTL | Namembnost |
|------|------------|-----|-----------|
| **L1: Memory** | Map v serverless | 5 min | Hitri cache za session |
| **L2: Filesystem** | `data/*.json` | 24h-90d | AI rezultati, POI opisi |
| **L3: Database** | Prisma | Permanent | Statistični podatki |
| **L4: CDN** | Vercel Edge | 1h-24h | Statične strani |

### 6.2 Cache datoteke

```
data/
├── ai-rec-cache.json          # AI priporočila (24h TTL)
├── poi-descriptions.json      # POI AI opisi (permanent)
├── seo-faq-cache.json         # SEO FAQ (90d TTL)
├── leads.json                 # JoinUs leadi
├── newsletter.json            # Newsletter subscriberji
└── analytics-cache.json       # Analitični cache (1h TTL)
```

### 6.3 Cache invalidation

```typescript
// src/lib/cache.ts

export async function invalidateCache(type: "recommendations" | "poi" | "faq", key?: string): Promise<void> {
  switch (type) {
    case "recommendations":
      if (key) {
        // Invalidiraj specifični ključ
        await removeCacheEntry("data/ai-rec-cache.json", key);
      } else {
        // Invalidiraj vse
        await fs.writeFile("data/ai-rec-cache.json", "{}");
      }
      break;
    case "poi":
      // POI cache je permanent — ne invalidiraj
      break;
    case "faq":
      // FAQ cache 90d — ne invalidiraj ročno
      break;
  }
}

// Ko se lokal posodobi → invalidiraj njegova priporočila
export async function onListingUpdated(listingId: string): Promise<void> {
  await invalidateCache("recommendations", `product:${listingId}`);
  await invalidateCache("recommendations", `experience:${listingId}`);
}
```

---

## 7. Background Jobs & Cron

### 7.1 Cron opravila

```typescript
// src/app/api/cron/weekly-alerts/route.ts
// Poganja se vsak ponedeljek ob 9:00
// - Pošlje tedenske statistike ownerjem
// - Preveri AI insights

// src/app/api/cron/sponsorship-expiry/route.ts
// Poganja se dnevno ob 00:00
// - Preveri sponzoriranja ki potečejo čez 7 dni
// - Pošlje email opomnike
// - Označi potekla sponzoriranja

// src/app/api/cron/beta-check/route.ts
// Poganja se dnevno ob 06:00
// - Preveri število aktivnih lokalov
// - Ob dosegu 30: sproži beta konverzijo
// - Pošlje email vsem ownerjem

// src/app/api/cron/analytics-aggregate/route.ts
// Poganja se vsako uro
// - Aggregira AnalyticsEvent v dnevne statuse
// - Čisti stare loge (>90 dni)
// - Posodablja KPI cache
```

### 7.2 Cron konfiguracija (Vercel)

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/weekly-alerts",
      "schedule": "0 9 * * 1"
    },
    {
      "path": "/api/cron/sponsorship-expiry",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/beta-check",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/analytics-aggregate",
      "schedule": "0 * * * *"
    }
  ]
}
```

### 7.3 Background queue (za AI intensive naloge)

```typescript
// src/lib/queue.ts
// Za AI naloge ki ne rabijo real-time (npr. AI insights generacija)

interface QueueJob {
  id: string;
  type: "ai-insights" | "email-send" | "cache-warm";
  payload: unknown;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
  processedAt?: Date;
}

// Implementacija: simple JSON file queue (za dev)
// Za produkcijo: Upstash QStash ali Vercel Queue
```

---

## 8. Webhooks

### 8.1 Stripe webhook

```typescript
// src/app/api/stripe/webhook/route.ts

import Stripe from "stripe";
import { db } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object);
      break;
    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object);
      break;
    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event.data.object);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object);
      break;
  }

  return new Response("OK", { status: 200 });
}

async function handleSubscriptionCreated(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;
  const owner = await db.owner.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!owner) return;

  const plan = sub.metadata.plan as "premium" | "enterprise";
  await db.owner.update({
    where: { id: owner.id },
    data: {
      plan,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: "active",
      subscriptionEndsAt: new Date(sub.current_period_end * 1000),
    },
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  await db.owner.update({
    where: { stripeSubscriptionId: sub.id },
    data: {
      plan: "free",
      subscriptionStatus: "canceled",
      subscriptionEndsAt: null,
    },
  });

  // Downgrade vseh lokalov
  await db.listing.updateMany({
    where: { ownerId: (await db.owner.findFirst({ where: { stripeSubscriptionId: sub.id } }))?.id },
    data: {
      sponsored: false,
      sponsoredUntil: null,
    },
  });
}
```

---

## 9. Auth & Permissions

### 9.1 NextAuth konfiguracija

```typescript
// src/lib/auth.ts

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const owner = await db.owner.findUnique({
          where: { email: credentials.email },
        });

        if (!owner) return null;

        const valid = await bcrypt.compare(credentials.password, owner.passwordHash);
        if (!valid) return null;

        return {
          id: owner.id,
          email: owner.email,
          name: owner.name,
          plan: owner.plan,
          role: owner.role,
          businessName: owner.businessName,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/owner/prijava",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.plan = (user as any).plan;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).plan = token.plan;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
```

### 9.2 Auth guard funkcije

```typescript
// src/lib/auth-guards.ts

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role, Permission } from "@/lib/types";

export async function getCurrentRole(): Promise<Role> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    // Preveri admin password
    const adminPassword = request.headers.get("x-admin-password");
    if (adminPassword === process.env.ADMIN_PASSWORD) {
      return "admin";
    }
    return "visitor";
  }

  const owner = await db.owner.findUnique({
    where: { email: session.user.email! },
    select: { plan: true, role: true },
  });

  if (owner?.role === "moderator") return "moderator";
  if (owner?.role === "admin") return "admin";

  if (owner?.plan === "premium") return "premium";
  if (owner?.plan === "enterprise") return "enterprise";

  return "provider";
}

export async function requirePermission(perm: Permission): Promise<boolean> {
  const role = await getCurrentRole();
  return canPerform(role, perm);
}

export async function requireOwner(resourceId: string, resource: "listing" | "product" | "experience"): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;

  const owner = await db.owner.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!owner) return false;

  const item = await (db[resource] as any).findUnique({
    where: { id: resourceId },
    select: { ownerId: true },
  });

  return item?.ownerId === owner.id;
}
```

---

## 10. Deployment Arhitektura

### 10.1 Vercel deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    VERCEL DEPLOYMENT                         │
└─────────────────────────────────────────────────────────────┘

  GitHub Repo (discoverslovenia.ai)
         │
         │ Push to main
         ▼
  ┌──────────────────┐
  │  Vercel Build    │
  │  - Next.js build │
  │  - Prisma generate│
  │  - Lint check    │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │  Vercel Deploy   │
  │  - Edge CDN      │
  │  - Serverless    │
  │  - Cron jobs     │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │  Production URL  │
  │  discoverslovenia│
  │  .ai             │
  └──────────────────┘

  External Services:
  - Turso (SQLite cloud) — DB
  - Puter API — AI
  - Stripe — Payments
  - SMTP — Email
  - Upstash Redis — Rate limiting (prod)
```

### 10.2 Environment setup

| Environment | Namembnost | URL |
|-------------|-----------|-----|
| Development | Lokalni razvoj | localhost:3000 |
| Preview | Vercel preview deploy | *.vercel.app |
| Production | Live | discoverslovenia.ai |

### 10.3 Build proces

```bash
# 1. Install dependencies
bun install

# 2. Generate Prisma client
bun run prisma generate

# 3. Run migrations
bun run prisma migrate deploy

# 4. Build
bun run build

# 5. Lint check
bun run lint

# 6. Deploy (Vercel auto na push)
```

---

## 11. Environment Variables

```bash
# .env.example

# === DATABASE ===
DATABASE_URL="file:./db/custom.db"  # dev
# DATABASE_URL="libsql://..."  # prod (Turso)

# === AUTH ===
NEXTAUTH_SECRET="generiraj-random-secret"
NEXTAUTH_URL="http://localhost:3000"  # dev
# NEXTAUTH_URL="https://discoverslovenia.ai"  # prod
ADMIN_PASSWORD="discoverslovenia2025"  # zamenjaj v prod!
SUPER_ADMIN_SECRET="generiraj-random-secret"

# === AI ===
PUTER_AUTH_TOKEN="your-puter-token"
PUTER_BASE_URL="https://api.puter.com/puterai/openai/v1/"
PUTER_MODEL="z-ai/glm-5.1"

# === STRIPE ===
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PREMIUM_PRICE_ID="price_..."
STRIPE_ENTERPRISE_PRICE_ID="price_..."

# === EMAIL ===
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="noreply@discoverslovenia.ai"
SMTP_PASS="your-app-password"
SMTP_FROM="Discover Slovenia AI <noreply@discoverslovenia.ai>"
ADMIN_EMAIL="admin@discoverslovenia.ai"

# === EXTERNAL APIs ===
# (vsi brez API ključa — brezplačni)

# === REDIS (prod) ===
# UPSTASH_REDIS_URL="redis://..."  # za rate limiting

# === CRON ===
CRON_SECRET="generiraj-random-secret"

# === ANALYTICS ===
# SENTRY_DSN="https://..."  # error tracking
# NEXT_PUBLIC_GA_ID="G-..."  # Google Analytics
```

---

## 12. File Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (public)/                 # Javne strani
│   │   ├── page.tsx              # Homepage
│   │   ├── destinacija/[slug]/   # Destinacije
│   │   └── ...
│   ├── owner/                    # Provider dashboard
│   │   ├── dashboard/
│   │   └── prijava/
│   ├── admin/                    # Admin dashboard
│   ├── api/                      # API routes
│   │   ├── itinerary/
│   │   ├── chat/
│   │   ├── smart-search/
│   │   ├── owner/
│   │   ├── admin/
│   │   ├── stripe/
│   │   └── cron/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                       # shadcn/ui komponente
│   ├── sections/                 # Glavne sekcije
│   ├── owner/                    # Provider komponente
│   ├── admin/                    # Admin komponente
│   └── ...
├── lib/
│   ├── ai-client.ts              # AI servis
│   ├── ai-ranking.ts             # AI ranking algoritem
│   ├── ai-recommendations.ts     # AI priporočila
│   ├── auth.ts                   # NextAuth config
│   ├── auth-guards.ts            # Permission sistem
│   ├── cache.ts                  # Cache helperji
│   ├── db.ts                     # Prisma client
│   ├── email.ts                  # Email servis
│   ├── email-templates.ts        # Email predloge
│   ├── seo.ts                    # SEO helperji
│   ├── seo-faq.ts                # AI FAQ generator
│   ├── slovenia-data.ts          # Statini podatki
│   ├── types.ts                  # TypeScript tipi
│   └── ...
├── i18n/
│   └── messages/                 # prevodi (sl/en/de/it)
├── prisma/
│   ├── schema.prisma
│   ├── seed-listings.ts
│   └── seed-expand.ts
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── ...
└── scripts/                      # Utility skripte
    ├── fix-listings-data.ts
    ├── verify-listing-images.ts
    └── ...
```

---

## 📅 Implementacijski načrt

### Faza 1: Database migracije (1 dan)
- [ ] Dodaj `status` polje v Listing/Product/Experience
- [ ] Ustvari `Sponsorship` tabelo
- [ ] Ustvari `AnalyticsEvent` in `AIUsageLog` tabele
- [ ] Ustvari `User` in `SavedItinerary` tabele
- [ ] Posodobi `Owner` z `role` poljem
- [ ] Migriraj obstoječe lokalce na `status: "published"`

### Faza 2: Auth & Permissions (1 dan)
- [ ] Implementiraj `auth-guards.ts` z `canPerform()`
- [ ] Posodobi vse API route z permission checki
- [ ] Testiraj vse role

### Faza 3: AI Ranking (1 dan)
- [ ] Implementiraj `ai-ranking.ts`
- [ ] Posodobi `/api/itinerary` z ranking algoritmom
- [ ] Dodaj transparency labels v AI rezultate
- [ ] Testiraj uteži (60/20/10/10)

### Faza 4: Admin Approval (2 dneva)
- [ ] Admin "Pending Approval" tab
- [ ] Approve/Reject API
- [ ] Owner status prikaz
- [ ] Email obvestila

### Faza 5: Sponsorship (2 dneva)
- [ ] Sponsorship tabela in API
- [ ] Stripe checkout za sponzorstvo
- [ ] Admin sponsorships management
- [ ] Owner "Promovej lokal" sekcija

### Faza 6: Transparency UI (1 dan)
- [ ] Sponzorirano badge v itinerar UI
- [ ] Affiliate badge v booking panel
- [ ] Homepage CTAs (3 opcije)
- [ ] Trust workflow implementacija

### Faza 7: Testing (2 dneva)
- [ ] End-to-end test vseh workflowov
- [ ] Performance test
- [ ] Security audit
- [ ] Lighthouse audit

### Faza 8: Deploy (1 dan)
- [ ] Vercel deploy
- [ ] Custom domena
- [ ] Environment setup
- [ ] Production test

**Skupaj: ~11 dni**

---

**Konec dokumenta.**

Ta Technical Specification je implementacijski vodnik. Vsa koda mora slediti tej specifikaciji. Spremembe zahtevajo ADR (Architecture Decision Record).
