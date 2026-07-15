# Data Flow Document

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Dokumentacija toka podatkov skozi sistem — od uporabnika do baze in nazaj
> **Pravilo:** Vsak podatkovni tok mora biti dokumentiran z vir, destinacijo in formatom

---

## 📑 Kazalo

1. [Visitor Data Flow](#1-visitor-data-flow)
2. [Provider Data Flow](#2-provider-data-flow)
3. [Admin Data Flow](#3-admin-data-flow)
4. [AI Data Flow](#4-ai-data-flow)
5. [Payment Data Flow](#5-payment-data-flow)
6. [External API Data Flow](#6-external-api-data-flow)
7. [Data Storage Map](#7-data-storage-map)
8. [PII Data Map](#8-pii-data-map)

---

## 1. Visitor Data Flow

### 1.1 Homepage visit

```
┌──────────┐         ┌──────────┐         ┌──────────┐         ┌──────────┐
│  Browser │ ──HTTP──▶│  Vercel  │ ──RSC──▶│  Next.js │ ──SQL──▶│  SQLite  │
│  (User)  │         │  Edge    │         │  Server  │         │  / Turso │
└──────────┘         └──────────┘         └──────────┘         └──────────┘
                           │                    │
                           │                    │ reads:
                           │                    │ - DESTINATIONS (static)
                           │                    │ - Listings (published)
                           │                    │ - Products (published)
                           │                    │ - Experiences (published)
                           │                    │
                           ▼                    ▼
                    ┌──────────────────────────────┐
                    │  HTML Response (RSC payload) │
                    │  - Homepage z 12 sekcijami   │
                    │  - Initial data embedded     │
                    └──────────────────────────────┘
```

**Podatki ki tečejo:**
- **Browser → Vercel**: HTTP request (IP, User-Agent, cookies)
- **Vercel → Next.js**: Forwarded request
- **Next.js → DB**: SELECT * FROM Listing WHERE status='published'
- **Next.js → Browser**: HTML + RSC payload + JSON data

### 1.2 AI Itinerary generation

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Browser │ ──▶│  Vercel  │ ──▶│ /api/    │ ──▶│  Cache   │
│  (User)  │    │  Edge    │    │ itinerary│    │  Check   │
└──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                     │
                                              ┌──────┴──────┐
                                              │             │
                                           hit │          miss
                                              │             │
                                              ▼             ▼
                                        ┌─────────┐  ┌──────────┐
                                        │ RETURN  │  │ DB Query │
                                        │ cached  │  │ sponsored│
                                        └─────────┘  └────┬─────┘
                                                          │
                                                          ▼
                                                   ┌──────────────┐
                                                   │ AI Client    │
                                                   │ (Puter GLM)  │
                                                   └──────┬───────┘
                                                          │
                                              ┌───────────┼───────────┐
                                              │           │           │
                                           uspeh       timeout     napaka
                                              │           │           │
                                              ▼           ▼           ▼
                                        ┌─────────┐  ┌─────────┐  ┌─────────┐
                                        │ Cache + │  │ Fallback│  │ Fallback│
                                        │ Return  │  │ z-ai-sdk│  │rule-based│
                                        └─────────┘  └─────────┘  └─────────┘
                                                          │
                                                          ▼
                                                   ┌──────────────┐
                                                   │ Log to       │
                                                   │ AIUsageLog   │
                                                   └──────────────┘
```

**Podatki ki tečejo:**
1. **Browser → API**: `{ budget, days, interests, season, groupSize }` (PlannerInput)
2. **API → DB**: SELECT sponsored listings
3. **API → Cache**: Preveri `ai-rec-cache.json` (key: itinerary hash)
4. **API → Puter**: System + user prompt (3500 input tokens)
5. **Puter → API**: JSON itinerary (1500 output tokens)
6. **API → Cache**: Shrani rezultat (24h TTL)
7. **API → DB**: INSERT INTO AIUsageLog (feature, source, responseTime, cost)
8. **API → Browser**: Itinerary JSON + source badge

### 1.3 Multi-turn refinement

```
Browser ──▶ /api/itinerary/refine ──▶ AI Client ──▶ Puter GLM
                                          │
                                          │ receives:
                                          │ - trenutni itinerar
                                          │ - ukaz ("dodaj pohode")
                                          │ - zgodovina ukazov
                                          │
                                          ▼
                                     Posodobljen itinerar
                                          │
                                          ▼
                                     Browser (updated UI)
```

### 1.4 AI Chatbot

```
Browser ──▶ /api/chat ──▶ DB (listings/products/experiences)
                          │
                          ▼
                    Build context (10 top items per category)
                          │
                          ▼
                    AI Client (Puter GLM)
                          │
                          ▼
                    Chat response + source badge
                          │
                          ▼
                    Browser (chat UI)
```

### 1.5 Smart Search

```
Browser ──▶ /api/smart-search ──▶ DB (15 candidates per category)
                                   │
                                   ▼
                             AI Client (Puter GLM)
                                   │
                                   │ prompt:
                                   │ - 15 listings
                                   │ - 15 products
                                   │ - 15 experiences
                                   │ - user query
                                   │
                                   ▼
                             JSON { destinations, listings, products, experiences }
                                   │
                                   ▼
                             Browser (search results UI)
```

### 1.6 Listing click + view tracking

```
Browser ──▶ Listing card click
              │
              ▼
        /api/listings/[slug] ──▶ DB (SELECT listing)
              │                      │
              │                      ▼
              │                  INCREMENT viewCount
              │                      │
              │                      ▼
              │                  INSERT ListingEvent (type: 'impression')
              │
              ▼
        Listing detail modal
              │
              ▼ (user clicks website/phone)
        /api/track-funnel ──▶ INSERT ListingEvent (type: 'click')
```

---

## 2. Provider Data Flow

### 2.1 Registration

```
Browser ──▶ /api/owner/register ──▶ Validate input
                                       │
                                       ▼
                                 Hash password (bcrypt)
                                       │
                                       ▼
                                 DB INSERT Owner
                                       │
                                       ▼
                                 Send welcome email (SMTP)
                                       │
                                       ▼
                                 Create NextAuth session
                                       │
                                       ▼
                                 Browser (redirect to dashboard)
```

### 2.2 Create listing

```
Browser ──▶ Owner Dashboard
              │
              ▼ (fill form)
        /api/owner/listings (POST)
              │
              ▼
        Validate (Zod schema)
              │
              ▼
        AI Auto-tag (optional) ──▶ /api/owner/auto-tag ──▶ Puter GLM
              │                                              │
              │                                              ▼
              │                                        { category, attributes, tags }
              │                                              │
              ▼                                              ▼
        DB INSERT Listing (status: 'draft')
              │
              ▼ (owner clicks "Oddaj")
        UPDATE Listing SET status='pending', submittedAt=NOW()
              │
              ▼
        Send email to admin (new pending)
              │
              ▼
        Browser (show "Pending approval" message)
```

### 2.3 Admin approval

```
Admin Dashboard ──▶ /api/admin/pending ──▶ DB SELECT WHERE status='pending'
                                                │
                                                ▼
                                          Admin reviews
                                                │
                                    ┌───────────┼───────────┐
                                    │           │           │
                                 approve     reject       edit
                                    │           │           │
                                    ▼           ▼           ▼
                          UPDATE to      UPDATE to    UPDATE fields
                          'approved'     'rejected'   + status='pending'
                                    │           │
                                    ▼           ▼
                          Send email    Send email
                          (approved)    (rejected + reason)
```

### 2.4 Upgrade to Premium

```
Owner Dashboard ──▶ "Nadgradi na Premium" ──▶ /api/checkout (POST)
                                                   │
                                                   ▼
                                             Stripe API (create checkout session)
                                                   │
                                                   ▼
                                             Browser redirect to Stripe Checkout
                                                   │
                                                   ▼ (user pays)
                                             Stripe ──▶ /api/stripe/webhook
                                                            │
                                                            ▼
                                                      Verify signature
                                                            │
                                                            ▼
                                                      UPDATE Owner SET plan='premium',
                                                        subscriptionStatus='active',
                                                        subscriptionEndsAt=...
                                                            │
                                                            ▼
                                                      Send email (payment confirmed)
                                                            │
                                                            ▼
                                                      Browser (success page)
```

---

## 3. Admin Data Flow

### 3.1 Admin dashboard

```
Admin ──▶ /admin (x-admin-password header)
            │
            ▼
      Validate ADMIN_PASSWORD
            │
            ▼
      DB SELECT (aggregate queries)
      - COUNT listings
      - COUNT pending
      - SUM MRR
      - COUNT AI usage
            │
            ▼
      /api/ai-insights?type=admin ──▶ AI Client ──▶ Insights JSON
            │
            ▼
      Admin Dashboard UI
```

### 3.2 Sponsorship management

```
Admin ──▶ /api/admin/sponsorships
            │
            ▼
      DB SELECT Sponsorship WHERE status='active'
            │
            ▼
      Admin Sponsorships Tab
            │
            ▼ (admin extends/cancels)
      UPDATE Sponsorship SET endsAt=... / status='cancelled'
            │
            ▼
      UPDATE Listing SET sponsored=true/false, sponsoredUntil=...
```

---

## 4. AI Data Flow

### 4.1 AI Request pipeline (detailed)

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI REQUEST PIPELINE                       │
└─────────────────────────────────────────────────────────────────┘

  1. INCOMING REQUEST
     ┌─────────────────────────────────────────────────────┐
     │ POST /api/itinerary                                  │
     │ Body: { budget: 500, days: 3, interests: [...] }    │
     │ Headers: IP, User-Agent, Cookie (session)           │
     └────────────────────┬────────────────────────────────┘
                          │
                          ▼
  2. RATE LIMIT CHECK
     ┌─────────────────────────────────────────────────────┐
     │ Memory Map: { IP: count, lastReset }                │
     │ Limit: 10/hour/IP                                   │
     │ If exceeded → 429 + Retry-After                     │
     └────────────────────┬────────────────────────────────┘
                          │
                          ▼
  3. INPUT VALIDATION (Zod)
     ┌─────────────────────────────────────────────────────┐
     │ Validate PlannerInput schema                        │
     │ - budget: number > 0                                │
     │ - days: 1-14                                        │
     │ - interests: array, min 1                           │
     │ - season: 'spring'|'summer'|'autumn'|'winter'      │
     │ - groupSize: 1-20                                   │
     │ If invalid → 400 + error details                    │
     └────────────────────┬────────────────────────────────┘
                          │
                          ▼
  4. CACHE CHECK
     ┌─────────────────────────────────────────────────────┐
     │ Cache key: hash(input + sponsoredContext)           │
     │ Read from: data/ai-rec-cache.json (24h TTL)        │
     │ If hit → return cached (source: 'cache')            │
     └────────────────────┬────────────────────────────────┘
                          │ (miss)
                          ▼
  5. DB QUERY (sponsored listings)
     ┌─────────────────────────────────────────────────────┐
     │ SELECT * FROM Listing                               │
     │ WHERE sponsored=true AND sponsoredUntil > NOW()    │
     │ AND status='published'                              │
     │ LIMIT 20                                            │
     └────────────────────┬────────────────────────────────┘
                          │
                          ▼
  6. CONTEXT BUILDING
     ┌─────────────────────────────────────────────────────┐
     │ Build system prompt:                                │
     │ - Role: "Slovenski vodič"                           │
     │ - Destinations: 22 from slovenia-data.ts            │
     │ - Sponsored: from DB                                │
     │ - Rules: include sponsored, JSON format             │
     │                                                     │
     │ Build user prompt:                                  │
     │ - Input parameters                                  │
     │ - Sponsored context                                 │
     │ - JSON format specification                         │
     └────────────────────┬────────────────────────────────┘
                          │
                          ▼
  7. AI CALL (Puter GLM)
     ┌─────────────────────────────────────────────────────┐
     │ OpenAI-compatible API call                          │
     │ - model: z-ai/glm-5.1                               │
     │ - messages: [system, user]                          │
     │ - temperature: 0.7                                  │
     │ - response_format: { type: 'json_object' }          │
     │ - timeout: 30s                                      │
     │ - retries: 3 (1s, 2s, 4s backoff)                   │
     └────────────────────┬────────────────────────────────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
           uspeh       timeout     napaka
              │           │           │
              ▼           ▼           ▼
  8a. PARSE JSON   8b. FALLBACK   8c. FALLBACK
     ┌─────────┐    ┌─────────┐    ┌─────────┐
     │ Extract │    │ z-ai-sdk│    │ rule-   │
     │ JSON    │    │ retry   │    │ based   │
     │ from    │    │         │    │         │
     │ response│    │         │    │         │
     └────┬────┘    └────┬────┘    └────┬────┘
          │              │              │
          ▼              ▼              ▼
  9. CACHE WRITE (if AI succeeded)
     ┌─────────────────────────────────────────────────────┐
     │ Write to: data/ai-rec-cache.json                    │
     │ Key: hash(input)                                    │
     │ Value: { content, source, cachedAt }                │
     │ TTL: 24h                                            │
     └────────────────────┬────────────────────────────────┘
                          │
                          ▼
  10. LOGGING
      ┌────────────────────────────────────────────────────┐
      │ INSERT INTO AIUsageLog (                           │
      │   feature: 'itinerary',                            │
      │   source: 'puter' | 'z-ai-sdk' | 'fallback',      │
      │   success: true | false,                           │
      │   responseTime: ms,                                │
      │   costEur: 0,                                      │
      │   userId: null,                                    │
      │   sessionId: '...',                                │
      │ )                                                  │
      └────────────────────┬───────────────────────────────┘
                           │
                           ▼
  11. RESPONSE
      ┌─────────────────────────────────────────────────────┐
      │ 200 OK                                              │
      │ Body: Itinerary JSON                                │
      │   - days: [...]                                     │
      │   - total_budget                                    │
      │   - recommendations                                 │
      │   - source: 'ai' | 'fallback'                       │
      │   - recommendationType per location                 │
      └─────────────────────────────────────────────────────┘
```

### 4.2 AI Ranking data flow

```
User Query
    │
    ▼
Ranking Engine (src/lib/ai-ranking.ts)
    │
    ├──▶ DB: SELECT published listings
    │
    ├──▶ Calculate relevance (query match)
    │    - destination match (0.4)
    │    - category match (0.3)
    │    - interest match (0.3)
    │
    ├──▶ Calculate rating (rating / 5)
    │
    ├──▶ Calculate distance (geo proximity)
    │
    ├──▶ Calculate premium boost
    │    - sponsored? → 0.10
    │    - plan = premium/enterprise? → 0.10
    │    - rating < 3.5? → 0.00
    │
    ├──▶ Total score = 0.6×rel + 0.2×rate + 0.1×dist + 0.1×prem
    │
    ├──▶ Sort by score (desc)
    │
    ├──▶ Mark recommendationType:
    │    - sponsored → "sponsored"
    │    - else → "organic"
    │
    └──▶ Return ranked list
```

---

## 5. Payment Data Flow

### 5.1 Stripe Checkout flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Owner   │ ──▶│  /api/   │ ──▶│  Stripe  │ ──▶│  Stripe  │
│  Browser │    │ checkout │    │   API    │    │ Checkout │
└──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                     │
                                            ┌────────┴────────┐
                                            │                 │
                                         success          cancel
                                            │                 │
                                            ▼                 ▼
                                     ┌─────────────┐  ┌─────────────┐
                                     │ Stripe      │  │ Redirect    │
                                     │ Webhook     │  │ to dashboard│
                                     │ /api/stripe │  │ (no change) │
                                     │ /webhook    │  └─────────────┘
                                     └──────┬──────┘
                                            │
                                            ▼
                                     Verify signature
                                            │
                                            ▼
                                     UPDATE Owner
                                     - plan = 'premium'
                                     - subscriptionStatus = 'active'
                                     - subscriptionEndsAt = ...
                                     - stripeCustomerId
                                     - stripeSubscriptionId
                                            │
                                            ▼
                                     Send email (welcome premium)
                                            │
                                            ▼
                                     UPDATE Listings
                                     - sponsored = true (if sponsorship)
                                     - sponsoredUntil = +30 days
```

### 5.2 Subscription lifecycle

```
FREE ──▶ checkout ──▶ TRIALING (14d) ──▶ ACTIVE ──▶ monthly renewal
                                              │
                                              ├──▶ payment fails ──▶ PAST_DUE (3d grace)
                                              │                          │
                                              │                     ┌────┴────┐
                                              │                     │         │
                                              │                  pays      doesn't
                                              │                     │         │
                                              │                     ▼         ▼
                                              │                  ACTIVE   DOWNGRADE
                                              │                            → FREE
                                              │
                                              └──▶ cancel ──▶ CANCELED (ends at period end)
                                                                   │
                                                                   ▼
                                                              FREE
```

---

## 6. External API Data Flow

### 6.1 OpenStreetMap (POI)

```
Browser ──▶ /api/pois?category=museum ──▶ Overpass API (overpass-api.de)
                                              │
                                              │ Query: node[tourism=museum](bbox)
                                              │
                                              ▼
                                         JSON response (elements)
                                              │
                                              ▼
                                         Parse + categorize
                                              │
                                              ▼
                                         Return to browser
                                              │
                                              ▼ (user clicks POI)
                                         /api/pois/[id] ──▶ Wikipedia API
                                              │                  │
                                              │                  ▼
                                              │             Extract + image
                                              │                  │
                                              ▼                  ▼
                                         If no Wikipedia extract:
                                              │
                                              ▼
                                         /api/pois/describe ──▶ AI (GLM)
                                              │                    │
                                              ▼                    ▼
                                         Cache to data/poi-descriptions.json
                                              │
                                              ▼
                                         Return description
```

### 6.2 Weather (Open-Meteo)

```
Browser ──▶ /api/weather?lat=46.36&lng=14.11
              │
              ▼
         Open-Meteo API (api.open-meteo.com)
              │
              │ Query: current_weather, daily forecast
              │
              ▼
         JSON response
              │
              ▼
         Return to browser (itinerary weather widget)
```

### 6.3 Affiliate links

```
Browser (itinerary result)
    │
    ▼ (user clicks "Booking.com")
┌──────────────────────────────────┐
│ Affiliate link generation:       │
│ https://booking.com/?aid=123456  │
│ &utm_source=discoverslovenia     │
│ &ss=bled                          │
└──────────────┬───────────────────┘
               │
               ▼
         /api/track-funnel (POST)
         - type: 'affiliate_click'
         - provider: 'booking'
         - destination: 'bled'
               │
               ▼
         INSERT AnalyticsEvent
               │
               ▼
         Browser redirect to Booking.com
         (rel="sponsored nofollow")
```

---

## 7. Data Storage Map

### 7.1 Kje se shranjujejo podatki

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA STORAGE MAP                          │
└─────────────────────────────────────────────────────────────┘

  ┌─────────────────────┐
  │  SQLite / Turso DB  │
  │  (prisma)           │
  │                     │
  │  - Owner            │
  │  - User             │
  │  - Listing          │
  │  - Product          │
  │  - Experience       │
  │  - Sponsorship      │
  │  - ListingEvent     │
  │  - AnalyticsEvent   │
  │  - AIUsageLog       │
  │  - SavedItinerary   │
  └─────────────────────┘

  ┌─────────────────────┐
  │  File System        │
  │  (data/)            │
  │                     │
  │  - ai-rec-cache.json│ (24h TTL)
  │  - poi-descriptions │ (permanent)
  │  - seo-faq-cache    │ (90d TTL)
  │  - leads.json       │ (lead storage)
  │  - newsletter.json  │ (subscriber storage)
  └─────────────────────┘

  ┌─────────────────────┐
  │  Static Code        │
  │  (src/lib/)         │
  │                     │
  │  - slovenia-data.ts │ (22 destinacij)
  │  - blog-data.ts     │ (16 člankov)
  │  - events-data.ts   │ (30 dogodkov)
  │  - collections.ts   │ (8 zbirk)
  │  - affiliate.ts     │ (affiliate config)
  └─────────────────────┘

  ┌─────────────────────┐
  │  External Services  │
  │                     │
  │  - Stripe           │ (payments, subscriptions)
  │  - Puter API        │ (AI responses)
  │  - SMTP             │ (email sending)
  │  - Overpass API     │ (POI data)
  │  - Open-Meteo       │ (weather)
  │  - Wikipedia API    │ (POI descriptions)
  └─────────────────────┘

  ┌─────────────────────┐
  │  CDN / Browser      │
  │                     │
  │  - Images (sfile)   │ (81 listing/product images)
  │  - Static assets    │ (JS, CSS, fonts)
  │  - Service worker   │ (offline cache)
  │  - LocalStorage     │ (cart, theme)
  └─────────────────────┘
```

### 7.2 Data retention policy

| Podatek | Kje | Retention | Brisanje |
|---------|-----|-----------|----------|
| Owner account | DB | Dokler ni izbrisan | Na zahtevo (GDPR) |
| Listing data | DB | Dokler status != 'deleted' | Soft delete → 90 dni → hard delete |
| AnalyticsEvent | DB | 90 dni | Avtomatsko (cron) |
| AIUsageLog | DB | 90 dni | Avtomatsko (cron) |
| AI cache | Filesystem | 24h | Avtomatsko (TTL) |
| POI cache | Filesystem | Permanent | Ročno |
| FAQ cache | Filesystem | 90 dni | Avtomatsko (TTL) |
| Leads | Filesystem | 365 dni | Na zahtevo |
| Newsletter | Filesystem | Dokler ne unsubscribe | Na zahtevo |
| Server logs | Vercel | 30 dni | Vercel auto |

---

## 8. PII Data Map

### 8.1 Osebni podatki ki jih obdelujemo

| Podatek | Vir | Namembnost | Legal basis | Retention |
|---------|-----|-----------|-------------|-----------|
| **Email** (owner) | Registracija | Komunikacija, login | Contract | Dokler aktiven |
| **Ime** (owner) | Registracija | Osebna komunikacija | Contract | Dokler aktiven |
| **Ime podjetja** | Registracija | Profil lokalca | Contract | Dokler aktiven |
| **Geslo** (hashed) | Registracija | Avtentikacija | Contract | Dokler aktiven |
| **Email** (newsletter) | Prijava | Marketing | Consent | Do unsubscribe |
| **Email** (lead) | JoinUs form | Kontaktiranje | Consent | 365 dni |
| **Telefon** (lead) | JoinUs form | Kontaktiranje | Consent | 365 dni |
| **IP naslov** | Auto | Rate limiting, security | Legitimate interest | 30 dni (logs) |
| **Session ID** | Auto | Analytics | Legitimate interest | 90 dni |
| **Browser/OS** | Auto | Compatibility | Legitimate interest | 30 dni (logs) |

### 8.2 GDPR rights implementation

| Pravica | Implementacija |
|---------|---------------|
| **Dostop** (Art. 15) | API: `GET /api/user/data` — izvoz vseh podatkov |
| **Popravek** (Art. 16) | Owner dashboard: edit profile |
| **Brisanje** (Art. 17) | API: `DELETE /api/user` — soft delete → 30 dni → hard delete |
| **Omejitev** (Art. 18) | API: `POST /api/user/restrict` — zamrzni procesiranje |
| **Prenos** (Art. 20) | API: `GET /api/user/export` — JSON izvoz vseh podatkov |
| **Prigovor** (Art. 21) | Email: privacy@discoverslovenia.ai |
| **Avtomatizirane odločitve** (Art. 22) | AI ranking je bfil v ADR-007 (transparenten) |

---

**Konec Data Flow Document.**
