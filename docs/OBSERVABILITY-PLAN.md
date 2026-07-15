# Observability Plan

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Definicija kaj spremljamo, kako in zakaj — od razvoja do produkcije
> **Pravilo:** Če metrike ni v tem dokumentu, se ne spremlja. Če se ne spremlja, ne moremo izboljšati.

---

## 📑 Kazalo

1. [Monitoring Stack](#1-monitoring-stack)
2. [Metrics Katalog](#2-metrics-katalog)
3. [Alerting](#3-alerting)
4. [Logging](#4-logging)
5. [Dashboards](#5-dashboards)
6. [Incident Response](#6-incident-response)

---

## 1. Monitoring Stack

### 1.1 Arhitektura monitoringa

```
┌─────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK                           │
└─────────────────────────────────────────────────────────────────┘

  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │ Application │     │   Vercel    │     │  External   │
  │  (Next.js)  │     │   (hosting) │     │  Services   │
  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
         │                   │                   │
         │ logs              │ metrics           │ webhooks
         │                   │                   │
         ▼                   ▼                   ▼
  ┌──────────────────────────────────────────────────────────┐
  │                    COLLECTION LAYER                      │
  │                                                          │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
  │  │ Sentry   │  │ Vercel   │  │ Custom   │  │ Stripe  │ │
  │  │ (errors) │  │ Analytics│  │ DB logs  │  │ Dashboard│ │
  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
  └──────────────────────────┬───────────────────────────────┘
                             │
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │                   VISUALIZATION LAYER                    │
  │                                                          │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
  │  │ Vercel   │  │ Sentry   │  │ Admin    │  │ Custom  │ │
  │  │ Dashboard│  │ Dashboard│  │ Dashboard│  │ KPI API │ │
  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
  └──────────────────────────┬───────────────────────────────┘
                             │
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │                     ALERTING LAYER                       │
  │                                                          │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
  │  │ Email    │  │ Slack    │  │ SMS      │  │ Discord │ │
  │  │ Alerts   │  │ Webhook  │  │ (Twilio) │  │ (opt)   │ │
  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
  └──────────────────────────────────────────────────────────┘
```

### 1.2 Orodja

| Orodje | Namembnost | Tier | Cena |
|--------|-----------|------|------|
| **Vercel Analytics** | Traffic, Web Vitals, audience | Free | €0 |
| **Sentry** | Error tracking, performance | Developer (free) | €0 (5K errors/mes) |
| **UptimeRobot** | Uptime monitoring | Free | €0 (50 monitors) |
| **Custom DB logging** | AI usage, analytics | Internal | €0 |
| **Stripe Dashboard** | Payment metrics | Included | €0 |
| **Google Search Console** | SEO performance | Free | €0 |
| **Slack** (optional) | Alert notifications | Free | €0 |

**Skupni strošek monitoringa: €0/mes** (začetna faza)

---

## 2. Metrics Katalog

### 2.1 Business Metrics

#### Visitor Metrics

| Metrika | Kaj meri | Vir | Frekvenca | Alert threshold |
|---------|---------|-----|-----------|-----------------|
| **MAU** (Monthly Active Users) | Unikatni uporabniki/mes | Vercel Analytics | Dnevno | < 1000 (po 3 mesecih) |
| **DAU** (Daily Active Users) | Unikatni uporabniki/dan | Vercel Analytics | Dnevno | < 50 (po 1 mesecu) |
| **Page views** | Skupni ogledi strani | Vercel Analytics | Dnevno | — |
| **Bounce rate** | % enostranskih obiskov | Vercel Analytics | Tedensko | > 70% |
| **Avg session duration** | Povprečen čas na strani | Vercel Analytics | Tedensko | < 2 min |
| **Repeat visitor rate** | % povratnikov | Vercel Analytics | Mesečno | < 20% |

#### AI Usage Metrics

| Metrika | Kaj meri | Vir | Frekvenca | Alert threshold |
|---------|---------|-----|-----------|-----------------|
| **AI itineraries/day** | Generirani itinererji/dan | AIUsageLog | Dnevno | < 10 (po 1 mesecu) |
| **AI chats/day** | Chat sporočila/dan | AIUsageLog | Dnevno | — |
| **Smart searches/day** | Iskanja/dan | AIUsageLog | Dnevno | — |
| **Multi-turn refinements** | Refinementi na itinerar | AIUsageLog | Tedensko | — |
| **AI success rate** | AI responses/total | AIUsageLog | Dnevno | < 90% |
| **AI fallback rate** | Fallback/total | AIUsageLog | Dnevno | > 15% |
| **Avg AI response time** | Povprečen čas odgovora | AIUsageLog | Dnevno | > 30s |
| **AI cost/day** | Skupni AI strošek/dan | AIUsageLog | Dnevno | > €10 |
| **Cache hit rate** | Cache hits/total AI requests | AIUsageLog | Dnevno | < 50% |

#### Conversion Metrics

| Metrika | Kaj meri | Vir | Frekvenca | Alert threshold |
|---------|---------|-----|-----------|-----------------|
| **Newsletter signup rate** | Signups/visitors | Newsletter API | Tedensko | < 2% |
| **Lead conversion rate** | Leads/visitors | Leads API | Tedensko | < 1% |
| **Click-through rate (CTR)** | Kliki/prikazi | ListingEvent | Tedensko | < 5% |
| **Affiliate click rate** | Affiliate kliki/itinererji | AnalyticsEvent | Tedensko | < 10% |

### 2.2 Provider Metrics

| Metrika | Kaj meri | Vir | Frekvenca | Alert threshold |
|---------|---------|-----|-----------|-----------------|
| **Total providers** | Št. registriranih ownerjev | DB | Dnevno | — |
| **Active providers** | Owner s PUBLISHED lokalom | DB | Dnevno | — |
| **Pending approvals** | Lokalci s status='pending' | DB | Dnevno | > 10 (SLA) |
| **Approval time** | avg(approved - submitted) | DB | Dnevno | > 48h |
| **Rejection rate** | Rejected/Submitted | DB | Tedensko | > 20% |
| **Provider churn** | Cancelled/Active | DB | Mesečno | > 5% |
| **Avg listings/provider** | Listings/Owners | DB | Mesečno | — |
| **Listing views avg** | Σ views / Σ listings | ListingEvent | Tedensko | — |
| **Listing clicks avg** | Σ clicks / Σ listings | ListingEvent | Tedensko | — |
| **AI recommendations/listing** | Σ ai_recs / Σ listings | ListingEvent | Tedensko | — |

### 2.3 Monetization Metrics

| Metrika | Kaj meri | Vir | Frekvenca | Alert threshold |
|---------|---------|-----|-----------|-----------------|
| **MRR** | Monthly recurring revenue | Stripe + DB | Dnevno | — |
| **ARR** | Annual recurring revenue | Stripe + DB | Mesečno | — |
| **Premium count** | Št. premium providerjev | DB | Dnevno | — |
| **Enterprise count** | Št. enterprise providerjev | DB | Dnevno | — |
| **Premium conversion rate** | Premium/Total providers | DB | Mesečno | < 10% |
| **Enterprise conversion rate** | Enterprise/Total | DB | Mesečno | < 3% |
| **Churn rate** | Cancelled/Active | Stripe | Mesečno | > 5% |
| **LTV** | Lifetime value | Stripe | Četrtletno | — |
| **Affiliate revenue** | Σ commissions | Affiliate dashboards | Mesečno | — |
| **Active sponsorships** | Št. aktivnih sponzorstev | DB | Dnevno | — |

### 2.4 Technical Metrics

#### API Performance

| Metrika | Kaj meri | Vir | Frekvenca | Alert threshold |
|---------|---------|-----|-----------|-----------------|
| **API response time (p50)** | Median response time | Custom logging | Dnevno | > 200ms |
| **API response time (p95)** | 95th percentile | Custom logging | Dnevno | > 500ms |
| **API response time (p99)** | 99th percentile | Custom logging | Dnevno | > 2s |
| **Error rate (5xx)** | Server errors/total | Vercel | Dnevno | > 0.5% |
| **Error rate (4xx)** | Client errors/total | Vercel | Dnevno | > 5% |
| **Requests/min** | Peak load | Vercel | Dnevno | — |

#### Specific endpoints

| Endpoint | Metric | Threshold |
|----------|--------|-----------|
| `/api/itinerary` | p95 response time | < 30s (AI) |
| `/api/chat` | p95 response time | < 15s (AI) |
| `/api/smart-search` | p95 response time | < 20s (AI) |
| `/api/listings` | p95 response time | < 200ms |
| `/api/destinations` | p95 response time | < 100ms |
| `/api/pois` | p95 response time | < 5s (OSM) |

#### Database Performance

| Metrika | Kaj meri | Vir | Frekvenca | Alert threshold |
|---------|---------|-----|-----------|-----------------|
| **DB query time (p95)** | 95th percentile query time | Prisma logging | Dnevno | > 100ms |
| **DB connection count** | Aktivne povezave | Turso dashboard | Dnevno | > 50 |
| **DB size** | Velikost baze | Turso dashboard | Tedensko | > 500MB |
| **Slow queries** | Query > 500ms | Prisma logging | Dnevno | > 10/dan |

#### External Services

| Service | Metric | Threshold |
|---------|--------|-----------|
| **Puter API** | Success rate | > 90% |
| **Puter API** | Response time | < 30s |
| **Stripe API** | Success rate | > 99% |
| **Stripe webhook** | Delivery delay | < 60s |
| **Overpass API** | Success rate | > 95% |
| **Open-Meteo** | Success rate | > 95% |
| **Wikipedia API** | Success rate | > 95% |
| **SMTP** | Delivery rate | > 98% |
| **SMTP** | Send time | < 10s |

#### Web Vitals (Core)

| Metrika | Kaj meri | Threshold | Alert |
|---------|---------|-----------|-------|
| **LCP** (Largest Contentful Paint) | Čas do glavne vsebine | < 2.5s | > 4s |
| **FID** (First Input Delay) | Čas do prve interakcije | < 100ms | > 300ms |
| **CLS** (Cumulative Layout Shift) | Vizualna stabilnost | < 0.1 | > 0.25 |
| **FCP** (First Contentful Paint) | Čas do prve vsebine | < 1.8s | > 3s |
| **TTFB** (Time to First Byte) | Čas do prvega byta | < 800ms | > 1.8s |
| **INP** (Interaction to Next Paint) | Interaktivnost | < 200ms | > 500ms |

### 2.5 SEO Metrics

| Metrika | Kaj meri | Vir | Frekvenca |
|---------|---------|-----|-----------|
| **Indexed pages** | Št. indeksiranih strani | Google Search Console | Tedensko |
| **Impressions** | Prikan v iskalniku | GSC | Tedensko |
| **Clicks** | Kliki iz iskalnika | GSC | Tedensko |
| **Avg position** | Povprečen položaj | GSC | Tedensko |
| **CTR** (search) | Kliki/prikazi | GSC | Tedensko |
| **Backlinks** | Št. backlinkov | GSC / Ahrefs | Mesečno |

---

## 3. Alerting

### 3.1 Alert nivoji

| Nivo | Kaj pomeni | Obvestilo | Response time |
|------|-----------|-----------|---------------|
| 🔴 **Critical** | Sistem ne dela | Email + SMS | < 15 min |
| 🟡 **Warning** | Možen problem | Email | < 1 ura |
| 🟢 **Info** | Informacija | Log only | Naslednji dan |

### 3.2 Alert pravila

#### 🔴 Critical Alerts

| Alert | Trigger | Akcija |
|-------|---------|--------|
| **Sistem ne dela** | UptimeRobot: 3 zaporedne neuspehe (1 min) | Email + SMS |
| **AI popoln izpad** | AI fallback rate > 50% v 1 uri | Email |
| **DB nedosegljiva** | DB query success < 80% v 5 min | Email + SMS |
| **Stripe webhook ne dela** | Noben webhook v 24h (pri aktivnih sub.) | Email |
| **Error rate > 5%** | 5xx errors > 5% v 15 min | Email |
| **Varnostni incident** | Sum SQL injection / XSS | Email + SMS |

#### 🟡 Warning Alerts

| Alert | Trigger | Akcija |
|-------|---------|--------|
| **AI fallback rate > 15%** | Fallback/total > 15% v 1 uri | Email |
| **AI response time > 30s** | p95 > 30s v 1 uri | Email |
| **Cache hit rate < 50%** | Cache hits/total < 50% v 24h | Email |
| **Pending approvals > 10** | Čakajočih lokalov > 10 | Email (daily) |
| **Approval time > 48h** | avg approval > 48h | Email |
| **DB size > 400MB** | DB approaching limit | Email |
| **Slow queries > 10/dan** | Query-ji > 500ms | Email |
| **Newsletter bounce rate > 5%** | Bounces/sent > 5% | Email |
| **Affiliate clicks drop 50%** | Clicks < 50% of 7-day avg | Email |

#### 🟢 Info Alerts (log only)

| Alert | Trigger | Log |
|-------|---------|-----|
| **Daily AI cost > €5** | Skupni AI strošek/dan > €5 | DB log |
| **New provider registered** | Nov owner | DB log |
| **Listing published** | Status → published | DB log |
| **Premium upgrade** | Owner → premium | DB log + email |
| **Sponsorship created** | Nov sponsorship | DB log |

### 3.3 Alert implementacija

```typescript
// src/lib/alerts.ts

interface Alert {
  level: "critical" | "warning" | "info";
  title: string;
  message: string;
  trigger: string;
  timestamp: Date;
}

export async function sendAlert(alert: Alert): Promise<void> {
  // 1. Log to DB
  await db.alertLog.create({ data: alert });

  // 2. Send email (for warning+)
  if (alert.level !== "info") {
    await sendEmail({
      to: process.env.ADMIN_EMAIL!,
      subject: `[${alert.level.toUpperCase()}] ${alert.title}`,
      body: alert.message,
    });
  }

  // 3. Send SMS (for critical only)
  if (alert.level === "critical") {
    await sendSMS(process.env.ADMIN_PHONE!, alert.message);
  }

  // 4. Slack webhook (optional)
  if (process.env.SLACK_WEBHOOK_URL) {
    await sendSlackAlert(alert);
  }
}
```

---

## 4. Logging

### 4.1 Log nivoji

| Nivo | Kdaj uporabiti | Primer |
|------|---------------|--------|
| **ERROR** | Napake ki zaustavijo funkcionalnost | AI fallback, DB napaka |
| **WARN** | Možni problemi, a sistem deluje | Cache miss, slow query |
| **INFO** | Pomembni dogodki | Nov owner, payment, approval |
| **DEBUG** | Razvojni podatki | API request/response, cache hit/miss |

### 4.2 Log struktura

```typescript
// Structured logging format
interface LogEntry {
  timestamp: string;        // ISO 8601
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  message: string;
  context: {
    endpoint?: string;
    userId?: string;
    sessionId?: string;
    ip?: string;
    userAgent?: string;
    duration?: number;      // ms
    error?: {
      code: string;
      stack?: string;
    };
    metadata?: Record<string, unknown>;
  };
}
```

### 4.3 Kaj logiramo

#### Application logs (console.log/error)

```typescript
// AI klici
console.log("[ai-client] Puter call", { feature, duration, source });
console.error("[ai-client] Puter failed", { error, attempt });

// API endpointi
console.log("[api/itinerary] Request", { input, ip });
console.error("[api/itinerary] Error", { error, input });

// DB operacije
console.error("[db] Query failed", { query, error });

// Stripe webhooki
console.log("[stripe] Webhook received", { type, id });
console.error("[stripe] Webhook signature invalid");
```

#### DB logs (strukturirani)

| Tabela | Kaj logira |
|--------|-----------|
| **AIUsageLog** | AI klici (feature, source, success, time, cost) |
| **ListingEvent** | Listing interakcije (view, click, ai_rec, lead) |
| **AnalyticsEvent** | User behavior (affiliate_click, newsletter, search) |
| **AlertLog** | Alert-i ki so se sprožili |

### 4.4 Log retention

| Tip log-a | Kje | Retention |
|-----------|-----|-----------|
| Console logs | Vercel | 30 dni |
| AIUsageLog | DB | 90 dni |
| ListingEvent | DB | 365 dni |
| AnalyticsEvent | DB | 90 dni |
| AlertLog | DB | 365 dni |
| Sentry errors | Sentry | 30 dni (free tier) |

---

## 5. Dashboards

### 5.1 Admin Dashboard — Monitoring tabs

#### Tab 1: Overview (daily health)
```
┌─────────────────────────────────────────────────────────────┐
│  OVERVIEW — Danas                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🟢 Sistem: Operativno    Uptime: 99.9%    Error rate: 0.2%│
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  234     │ │ 45       │ │ €127     │ │ 89%      │      │
│  │ visitors │ │ AI itin. │ │ revenue  │ │ AI succ. │      │
│  │ +12%     │ │ +5       │ │ +€23     │ │ -2%      │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  ⚠️ 3 pending approvals (SLA: 24h)                         │
│  ⚠️ AI fallback rate: 12% (threshold: 15%)                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Tab 2: AI Performance
```
┌─────────────────────────────────────────────────────────────┐
│  AI PERFORMANCE — Zadnjih 7 dni                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AI calls by feature:                                       │
│  ┌─────────────────────────────────────────────┐            │
│  │ itinerary  ████████████████████ 245         │            │
│  │ chat       ██████████ 156                   │            │
│  │ search     ███████ 98                       │            │
│  │ refine     ████ 67                         │            │
│  │ recommend  ████████████████████ 312         │            │
│  └─────────────────────────────────────────────┘            │
│                                                             │
│  Source distribution:                                       │
│  Puter: 87% | z-ai-sdk: 8% | fallback: 5%                  │
│                                                             │
│  Avg response time:                                         │
│  itinerary: 28s | chat: 4s | search: 14s                   │
│                                                             │
│  Cache hit rate: 67%                                        │
│  AI cost/day: €3.45                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Tab 3: Providers
```
┌─────────────────────────────────────────────────────────────┐
│  PROVIDERS                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Total: 25 | Active: 23 | Pending: 3 | Premium: 0          │
│                                                             │
│  Top listings (by views):                                   │
│  1. Hiša Franko — 1,247 views, 89 clicks                   │
│  2. Hotel Vila Bled — 987 views, 67 clicks                 │
│  3. Restavracija JB — 856 views, 45 clicks                 │
│                                                             │
│  Approval queue:                                            │
│  - Hotel Triglav Bled (pending 2h)                         │
│  - Gostilna AS (pending 5h)                                │
│  - City Hotel Ljubljana (pending 8h) ⚠️                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Tab 4: Monetization
```
┌─────────────────────────────────────────────────────────────┐
│  MONETIZATION                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  MRR: €0 (Beta)                                             │
│  Affiliate revenue: €45 (this month)                        │
│                                                             │
│  Beta progress: 25/30 providers                             │
│  [████████████████████░░░░░]                                │
│                                                             │
│  Sponsorship active: 0                                      │
│  Premium providers: 0                                       │
│                                                             │
│  Revenue projection (when monetized):                       │
│  Conservative: €745/mes                                     │
│  Realistic: €2,235/mes                                      │
│  Optimistic: €4,470/mes                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Tab 5: Technical
```
┌─────────────────────────────────────────────────────────────┐
│  TECHNICAL HEALTH                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Uptime: 99.9% (30 dni)                                    │
│  Avg response: 187ms (p95: 412ms)                          │
│  Error rate: 0.2% (5xx)                                    │
│                                                             │
│  Core Web Vitals:                                           │
│  LCP: 1.8s ✅ | FID: 45ms ✅ | CLS: 0.05 ✅              │
│                                                             │
│  DB:                                                        │
│  Size: 45MB | Connections: 3/50                            │
│  Slow queries: 2/dan                                        │
│                                                             │
│  External services:                                         │
│  Puter API: ✅ (98% success)                               │
│  Stripe: ✅                                                 │
│  OSM: ✅                                                   │
│  SMTP: ✅                                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Incident Response

### 6.1 Incident nivoji

| Nivo | Opis | Response time | Primer |
|------|------|--------------|--------|
| 🔴 **P0** | Sistem ne dela | < 15 min | DB down, aplikacija crash |
| 🟠 **P1** | Ključna funkcija ne dela | < 1 ura | AI nedosegljiv, Stripe ne dela |
| 🟡 **P2** | Delna okvara | < 4 ure | POI ne deluje, email delay |
| 🟢 **P3** | Manjši problem | Naslednji dan | Slow query, cache miss |

### 6.2 Incident proces

```
1. DETECT
   ├── Alert sprožen (monitoring)
   ├── Uporabnik prijava (email)
   └── Manual discovery

         │
         ▼

2. ACKNOWLEDGE
   ├── Confirm incident (reproduce)
   ├── Assign severity (P0-P3)
   ├── Create incident channel (Slack)
   └── Notify stakeholders

         │
         ▼

3. INVESTIGATE
   ├── Check logs (Sentry, DB, Vercel)
   ├── Identify root cause
   ├── Test hypothesis
   └── Document timeline

         │
         ▼

4. MITIGATE
   ├── Quick fix (rollback, restart)
   ├── Communicate to users (status page)
   └── Monitor mitigation

         │
         ▼

5. RESOLVE
   ├── Permanent fix
   ├── Test fix
   ├── Deploy fix
   └── Verify resolution

         │
         ▼

6. POST-MORTEM
   ├── Write incident report (within 48h)
   ├── Root cause analysis
   ├── Preventive measures
   └── Update Risk Register
```

### 6.3 Incident komunikacija

#### Internal
- **Slack**: #incidents channel
- **Email**: team@discoverslovenia.ai
- **SMS**: za P0 incidente

#### External (uporabniki)
- **Status page**: status.discoverslovenia.ai (optional)
- **Email**: za P0/P1 incidente ki vplivajo na uporabnike
- **In-app banner**: za delne izpade

### 6.4 Post-mortem template

```markdown
## Incident Report: [Title]

**Date:** YYYY-MM-DD
**Severity:** P0 | P1 | P2 | P3
**Duration:** X hours Y minutes
**Affected users:** ~X

### Summary
[Kratek opis kaj se je zgodilo]

### Timeline
- HH:MM — Alert sprožen
- HH:MM — Incident potrjen
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — Incident resolved

### Root Cause
[Zakaj se je zgodilo? Tehnična razlaga]

### Impact
- Uporabniki: X affected
- Funkcionalnost: Y ne deluje
- Prihodek: Z izgubljen

### Mitigation
[Kaj smo naredili za rešitev]

### Preventive Measures
- [ ] [Ukrepanje 1]
- [ ] [Ukrepanje 2]
- [ ] Update Risk Register

### Lessons Learned
[Kaj smo se naučili]
```

---

## 7. Monitoring Checklist (pred deploy)

### 7.1 Pred produkcijo

- [ ] **Vercel Analytics** nameščen in prikazuje podatke
- [ ] **Sentry** konfiguriran (DSN v env)
- [ ] **UptimeRobot** monitor na `https://discoverslovenia.ai`
- [ ] **AIUsageLog** tabelo preverjena (deluje)
- [ ] **ListingEvent** tracking preverjen
- [ ] **AnalyticsEvent** tracking preverjen
- [ ] **Alert email** testiran (pošlji test alert)
- [ ] **Stripe webhook** logging preverjen
- [ ] **Error boundary** v React deluje
- [ ] **404/500 pages** custom (ne default Vercel)

### 7.2 Po produkciji (prvi teden)

- [ ] **Daily check**: Vercel Analytics, Sentry, AI logs
- [ ] **Verify**: Vsi AI endpointi delujejo
- [ ] **Verify**: Stripe webhook-i prihajajo
- [ ] **Verify**: Email-i se pošiljajo
- [ ] **First incident drill**: Simuliraj AI izpad

### 7.3 Mesečni pregled

- [ ] **KPI review**: Vse metrike v ciljih?
- [ ] **Alert review**: Ali so alert-i relevantni?
- [ ] **Log review**: Ali loggiramo prave stvari?
- [ ] **Cost review**: AI stroški v budget?
- [ ] **Incident review**: Post-mortemi narejeni?

---

**Konec Observability Plan.**
