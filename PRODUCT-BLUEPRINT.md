# Discover Slovenia AI — Product Blueprint

> **Status:** ✅ FROZEN v1.0 — Referenčni dokument
> **Datum zamrznitve:** 2025-01-15
> **Avtor:** Product Team
> **Namen:** Strateški dokument ki vodi vso nadaljnjo implementacijo
> **Pravilo:** Nobena koda ne gre v produkcijo brez skladnosti s tem dokumentom
>
> **Spremembe po zamrznitvi:** Zahtevajo eksplicitno odobritev product owner-ja in version bump (v1.1, v1.2...).

---

## 📑 Kazalo

1. [Vizija in Cilji](#1-vizija-in-cilji)
2. [Visitor Workflow](#2-visitor-workflow)
3. [Provider Workflow](#3-provider-workflow)
4. [Admin Workflow](#4-admin-workflow)
5. [AI Workflow](#5-ai-workflow)
6. [Monetization Workflow](#6-monetization-workflow)
7. [Trust Workflow](#7-trust-workflow)
8. [Lifecycle](#8-lifecycle)
9. [Business Rules](#9-business-rules)
10. [Wireframes](#10-wireframes)
11. [Acceptance Criteria](#11-acceptance-criteria)
12. [User Roles & Permissions](#12-user-roles--permissions)
13. [State Diagrams](#13-state-diagrams)
14. [Error Flows & Fallbacks](#14-error-flows--fallbacks)
15. [KPI Dashboard](#15-kpi-dashboard)
16. [AI Cost Model](#16-ai-cost-model)
17. [Launch Checklist](#17-launch-checklist)

---

## 1. Vizija in Cilji

### 1.1 Vizija

**"Discover Slovenia AI je AI-poganjana turistična platforma ki uporabnikom brezplačno načrtuje popolno potovanje po Sloveniji, lokalcem pa omogoča kontekstualno promocijo v AI priporočilih."**

### 1.2 Ključna diferenciacija

| Konkurent | Model | Discover Slovenia AI |
|-----------|-------|---------------------|
| Booking.com | Transactional — iskanje hotelov | AI-poganjan — celoten itinerar |
| Tripadvisor | Reviews + comparison | AI generira + priporoča |
| Alma (slovenia.info) | Chatbot | Multi-turn + B2B + marketplace |
| Wanderlog | Planner | Specializiran za Slovenijo |

### 1.3 Cilji (12 mesecev)

| Metrika | Cilj | Meritev |
|---------|------|---------|
| Mesečni obiskovalci | 50,000 | Vercel Analytics |
| AI itinererji na mesec | 2,000 | API logs |
| Aktivni ponudniki | 100+ | Baza |
| Premium/Enterprise konverzija | 15% | Stripe |
| Affiliate prihodek | €2,000/mes | Booking/Viator reports |
| MRR (pavšalni oglas) | €3,000/mes | Stripe |

---

## 2. Visitor Workflow

### 2.1 Glavni tok (Happy Path)

```
┌─────────────────────────────────────────────────────────────┐
│                     VISITOR JOURNEY                          │
└─────────────────────────────────────────────────────────────┘

  ┌─────────────┐
  │  Homepage   │
  │             │
  │ "Načrtuj    │
  │  popoln     │
  │  obisk      │
  │  Slovenije  │
  │  z AI —     │
  │  brezplačno"│
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  3 jasne CTA                    │
  │                                 │
  │  ✨ Ustvari AI itinerar         │
  │  🗺️ Raziskuj destinacije       │
  │  🛍️ Izdelki in doživetja       │
  └──────┬──────────┬──────────┬────┘
         │          │          │
         ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │  AI    │ │  Map   │ │Market- │
    │ Planner│ │ Section│ │ place  │
    └───┬────┘ └───┬────┘ └───┬────┘
        │          │          │
        ▼          ▼          ▼
  ┌─────────────────────────────────┐
  │  AI generira itinerar           │
  │                                 │
  │  Dan 1: Bled                    │
  │  ├─ 09:00 Blejski grad          │
  │  ├─ 12:00 Restavracija JB  ⭐   │
  │  └─ 15:00 Vintgar               │
  │                                 │
  │  Dan 2: Bohinj                  │
  │  ├─ ...                         │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─────────────────────────────────┐
  │  Rezultati so strukturirani:    │
  │                                 │
  │  📍 POI (brez oznake)           │
  │  🏨 Lokalci                     │
  │     ├─ Organski (brez oznake)   │
  │     └─ ⭐ Sponzorirano          │
  │  🔗 Affiliate (Booking/Viator)  │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─────────────────────────────────┐
  │  Uporabnik klikne               │
  │                                 │
  │  POI → Wikipedia/AI opis        │
  │  Lokalac → Profil + kontakt     │
  │  Affiliate → Booking.com        │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─────────────────────────────────┐
  │  Konverzija                     │
  │                                 │
  │  Rezervacija / Kontakt / Klick  │
  └─────────────────────────────────┘
```

### 2.2 "10-sekundno pravilo"

Za vsak korak si zastavimo vprašanje: **Kaj želi uporabnik narediti v naslednjih 10 sekundah?**

| Korak | 10-sekundni cilj | Trenutno | Akcija |
|-------|------------------|----------|--------|
| Homepage | Razumeti kaj platforma ponuja | ⚠️ 2 CTA | Dodaj 3. CTA |
| AI Planner | Izpolniti formo | ✅ | — |
| Itinerar rezultat | Razumeti načrt + klikati naprej | ⚠️ Brez oznak | Dodaj transparency labels |
| Lokalac profil | Kontaktirati / obiskati | ✅ | — |
| Affiliate link | Zagnati iskanje na Booking | ✅ | — |

### 2.3 Alternativni tokovi

#### Tok A: "Raziskovalec" (brez AI)
```
Homepage → Destinacije → Izberi Bled → Stvari za narediti → Lokalci → Klik
```

#### Tok B: "Kupuje izdelke"
```
Homepage → Tržnica → Izdelki → Izdelek → Obišči prodajalca
```

#### Tok C: "Chatbot uporabnik"
```
Homepage → Chatbot gumb → "Priporoči romantični vikend" → Odgovor AI → Klik na destinacijo
```

#### Tok D: "Naravnojezikovno iskanje"
```
Homepage → Search ikona → "miren vikend ob reki" → Rezultati → Klik
```

---

## 3. Provider Workflow

### 3.1 Registracijski tok

```
┌─────────────────────────────────────────────────────────────┐
│                    PROVIDER JOURNEY                          │
└─────────────────────────────────────────────────────────────┘

  ┌─────────────┐
  │  Pridruži   │
  │  se         │
  │  (Join Us)  │
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  Registracija                   │
  │                                 │
  │  - Ime podjetja                 │
  │  - Email                        │
  │  - Telefon                      │
  │  - Geslo                        │
  │  - GDPR privolitev              │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  Izbira paketa                  │
  │                                 │
  │  Beta: Vsi brezplačno           │
  │  (do 30 lokalov)                │
  │                                 │
  │  ┌─────────────────────────┐    │
  │  │ FREE (€0/mes)           │    │
  │  │ - 1 lokal               │    │
  │  │ - 5 slik                │    │
  │  │ - brez AI prioritete    │    │
  │  └─────────────────────────┘    │
  │                                 │
  │  Po beti:                       │
  │  ┌─────────────────────────┐    │
  │  │ PREMIUM (€149/mes)      │    │
  │  │ - 5 lokalov             │    │
  │  │ - 20 slik               │    │
  │  │ - AI prioritizacija     │    │
  │  │ - Analytics             │    │
  │  │ - Sponzorirano možnost  │    │
  │  └─────────────────────────┘    │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  Dodaj lokal                    │
  │                                 │
  │  - Osnovni podatki              │
  │  - Naslov                       │
  │  - Kontakt                      │
  │  - Slika                        │
  │  - Opis                         │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  AI Auto-tagging                │
  │                                 │
  │  AI predlaga:                   │
  │  - Kategorija                   │
  │  - Atributi (family, parking)   │
  │  - Tagi                         │
  │                                 │
  │  Lastnik potrdi/uredi           │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  Preview                        │
  │                                 │
  │  Lastnik vidi kako bo izgledalo │
  │  → Uredi ali Oddaj              │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  STATUS: DRAFT → PENDING        │
  │                                 │
  │  "Vaš lokal čaka odobritev      │
  │   (običajno 24-48h)"            │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  ADMIN APPROVAL                 │
  │                                 │
  │  Admin preveri:                 │
  │  - Pravilni kontakti            │
  │  - Primerna vsebina             │
  │  - Realna lokacija              │
  │  - Brez spam-a                  │
  │                                 │
  │  → Approve / Reject / Edit      │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  STATUS: PENDING → APPROVED     │
  │                                 │
  │  Email: "Vaš lokal je objavljen"│
  │  + Link do profila              │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  PUBLISHED                      │
  │                                 │
  │  Lokal je živo na platformi     │
  │  AI ga lahko priporoča          │
  │  (glede na relevanco)           │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  ANALYTICS                      │
  │                                 │
  │  Lastnik vidi:                  │
  │  - Ogledi                       │
  │  - Kliki                        │
  │  - AI priporočila               │
  │  - Kontakti                     │
  │  - ROI (vrednost)               │
  │  - AI Insights                  │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  UPGRADE TO PREMIUM             │
  │                                 │
  │  "Povečaj vidljivost z AI       │
  │   prioritizacijo"               │
  │                                 │
  │  → Stripe checkout              │
  │  → Sponsored badge              │
  │  → 10% boost v AI ranking       │
  └─────────────────────────────────┘
```

### 3.2 Status sistem lokalov

```
DRAFT ────────► PENDING ────────► APPROVED ────────► PUBLISHED ────────► ARCHIVED
  │                │                  │                   │
  │                │                  │                   │
  ▼                ▼                  ▼                   ▼
Lastnik         Admin              Admin              Lastnik/Admin
ureja           preverja           objavi            arhivira
                (Reject → DRAFT)
```

**Pravila statusov:**

| Status | Vidno uporabnikom? | AI priporoča? | Lastnik lahko ureja? |
|--------|-------------------|---------------|---------------------|
| DRAFT | ❌ | ❌ | ✅ |
| PENDING | ❌ | ❌ | ⚠️ Samo dopolnitve |
| APPROVED | ✅ (kmalu) | ❌ (dokler ni published) | ⚠️ Z odobritvijo |
| PUBLISHED | ✅ | ✅ | ✅ (z admin review) |
| REJECTED | ❌ | ❌ | ✅ (popravi in ponovno oddaj) |
| ARCHIVED | ❌ | ❌ | ❌ |

---

## 4. Admin Workflow

### 4.1 Admin tok

```
┌─────────────────────────────────────────────────────────────┐
│                     ADMIN JOURNEY                            │
└─────────────────────────────────────────────────────────────┘

  ┌─────────────┐
  │  Admin      │
  │  Login      │
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  DASHBOARD                      │
  │                                 │
  │  KPIs:                          │
  │  - Skupno lokalov               │
  │  - Pending approval (⚠️ ALERT)  │
  │  - MRR                          │
  │  - AI usage                     │
  │  - Affiliate revenue            │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  PENDING APPROVAL TAB           │
  │                                 │
  │  Seznam lokalov ki čakajo       │
  │                                 │
  │  Za vsak:                       │
  │  - Preview                      │
  │  - Verify kontakti              │
  │  - Verify lokacija              │
  │  - Check slike                  │
  │                                 │
  │  → Approve                      │
  │  → Reject (z razlogom)          │
  │  → Edit (admin popravi)         │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  PUBLISHED LOKALS TAB           │
  │                                 │
  │  Vsi objavljeni lokalci         │
  │                                 │
  │  Filtri:                        │
  │  - Kategorija                   │
  │  - Regija                       │
  │  - Paket (Free/Premium/Ent.)    │
  │  - Status (Active/Expired)      │
  │                                 │
  │  Akcije:                        │
  │  - Featured (poudari)           │
  │  - Sponsored (nastavi)          │
  │  - Archive                      │
  │  - Delete                       │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  SPONSORSHIPS TAB               │
  │                                 │
  │  Aktivna sponzoriranja:         │
  │  - Ponudnik                     │
  │  - Lokal                        │
  │  - Od datuma                    │
  │  - Do datuma                    │
  │  - Cena                         │
  │  - Status (active/expired)      │
  │                                 │
  │  Akcije:                        │
  │  - Podaljšaj                    │
  │  - Prekliči                     │
  │  - Dodaj ročno                  │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  ANALYTICS TAB                  │
  │                                 │
  │  - AI usage (itinererji/dan)    │
  │  - Top priporočeni lokalci     │
  │  - Konverzija (click-through)   │
  │  - Affiliate kliki              │
  │  - MRR trend                    │
  │  - Churn rate                   │
  │  - AI Insights (avtomatski)     │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  CONTENT MODERATION             │
  │                                 │
  │  - Prijave uporabnikov          │
  │  - Avtomatski spam detection    │
  │  - Vsebina za pregled           │
  │  - Zgodovina sprememb           │
  └─────────────────────────────────┘
```

### 4.2 Admin pravice

| Akcija | Admin | Owner |
|--------|-------|-------|
| Approve/Reject lokal | ✅ | ❌ |
| Edit kateregakoli lokalca | ✅ | ⚠️ Samo svoje |
| Delete lokal | ✅ | ⚠️ Samo svoje |
| Set Featured | ✅ | ❌ |
| Set Sponsored | ✅ | ⚠️ Samo plačilo |
| View vse analytics | ✅ | ⚠️ Samo svoje |
| Manage paketi | ✅ | ❌ |
| Manage beta status | ✅ | ❌ |

---

## 5. AI Workflow

### 5.1 AI Pipeline (srce platforme)

```
┌─────────────────────────────────────────────────────────────┐
│                     AI WORKFLOW                              │
└─────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────┐
  │  USER PROMPT                    │
  │                                 │
  │  "3 dni na Bledu z otroki,      │
  │   proračun €400"                │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  INTENT DETECTION               │
  │                                 │
  │  AI razume:                     │
  │  - Destinacija: Bled            │
  │  - Trajanje: 3 dni              │
  │  - Skupina: družina z otroki    │
  │  - Proračun: €400               │
  │  - Interesi: family-friendly    │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  DATABASE SEARCH                │
  │                                 │
  │  Pridobi kandidate:             │
  │  - 22 destinacij                │
  │  - 25 lokalov (status: pub.)    │
  │  - 28 izdelkov                  │
  │  - 28 izkušenj                  │
  │  - Sponzorirani lokalci         │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  RANKING (uteži)                │
  │                                 │
  │  Score = Relevance × 0.60       │
  │        + Rating × 0.20          │
  │        + Distance × 0.10        │
  │        + Premium × 0.10         │
  │                                 │
  │  Primer:                        │
  │  Hotel Triglav Bled:            │
  │  - Relevance: 0.95 (Bled, family)│
  │  - Rating: 4.8/5 = 0.96         │
  │  - Distance: 0.90 (central)     │
  │  - Premium: 1.10 (sponsored)    │
  │  - TOTAL: 0.95×0.6 + 0.96×0.2   │
  │           + 0.90×0.1 + 0.10×0.1 │
  │           = 0.57+0.19+0.09+0.01 │
  │           = 0.86                │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  AI REASONING (GLM)             │
  │                                 │
  │  GLM generira itinerar:         │
  │  - Dan 1: ...                   │
  │  - Dan 2: ...                   │
  │  - Dan 3: ...                   │
  │                                 │
  │  Z uporabo ranked kandidatov    │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  SPONSORED MERGE                │
  │                                 │
  │  - Sponzorirani lokalci so      │
  │    jasno označeni v rezultatih   │
  │  - Največ 1 sponzorirani na dan │
  │  - Vedno + vsaj 1 organski      │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  AFFILIATE MERGE                │
  │                                 │
  │  - Booking.com (hotels)         │
  │  - DiscoverCars (transport)     │
  │  - Viator (experiences)         │
  │  - Skyscanner (flights)         │
  │                                 │
  │  Vse jasno označene: 🔗         │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  TRANSPARENCY LABELS            │
  │                                 │
  │  Za vsak rezultat:              │
  │  - ⭐ Sponzorirano (badge)      │
  │  - 🔗 Affiliate (badge)         │
  │  - Brez oznake = organsko       │
  └──────┬──────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  RETURN TO USER                 │
  │                                 │
  │  Itinerar z:                    │
  │  - Dnevnimi načrti              │
  │  - Vremenom                     │
  │  - Cenami                       │
  │  - Booking panel (affiliate)    │
  │  - Multi-turn refinement        │
  └─────────────────────────────────┘
```

### 5.2 AI Ranking formula (podrobno)

```typescript
interface RankedItem {
  item: Listing | Product | Experience;
  relevanceScore: number;  // 0-1, kako dobro ustreza uporabnikovemu queryju
  ratingScore: number;     // 0-1, rating/5
  distanceScore: number;   // 0-1, bližina drugim lokacijam v itinererju
  premiumBoost: number;    // 0.0 (free) | 0.1 (premium) | 0.1 (sponsored)
  totalScore: number;
}

function calculateScore(item: RankedItem): number {
  const RELEVANCE_WEIGHT = 0.60;
  const RATING_WEIGHT = 0.20;
  const DISTANCE_WEIGHT = 0.10;
  const PREMIUM_WEIGHT = 0.10;

  return (
    item.relevanceScore * RELEVANCE_WEIGHT +
    item.ratingScore * RATING_WEIGHT +
    item.distanceScore * DISTANCE_WEIGHT +
    item.premiumBoost * PREMIUM_WEIGHT
  );
}

// Pravilo: Premium boost je največ 10% — nikoli ne preglasi relevance
```

### 5.3 AI Pravila

| Pravilo | Implementacija |
|---------|---------------|
| AI NIKOLI ne priporoča slabega lokalca samo ker plača | Relevance (60%) vedno dominira nad Premium (10%) |
| Sponzorirani lokalci so jasno označeni | `⭐ Sponzorirano` badge v UI |
| Affiliate povezave so jasno označene | `🔗 Partnerska povezava` badge |
| Največ 1 sponzorirani na dan v itinererju | Logic v `/api/itinerary` |
| Če ni sponzoriranih → samo organski | Normalno |
| Multi-turn refinement ohranja kontekst | History poslana AI-ju |

---

## 6. Monetization Workflow

### 6.1 Dva tokova prihodka

```
┌─────────────────────────────────────────────────────────────┐
│                  MONETIZATION FLOWS                          │
└─────────────────────────────────────────────────────────────┘

  ╔═══════════════════════════════════════════════════════════╗
  ║  TOK 1: AFFILIATE (uporabnik → Booking)                   ║
  ╚═══════════════════════════════════════════════════════════╝

  Visitor ─────► AI ─────► Recommendation ─────► Click
                                                    │
                                                    ▼
                                              Booking.com
                                                    │
                                                    ▼
                                            Affiliate revenue
                                              (5-40%)

  ╔═══════════════════════════════════════════════════════════╗
  ║  TOK 2: PAVŠALNI OGLAS (ponudnik → platforma)             ║
  ╚═══════════════════════════════════════════════════════════╝

  Provider ─────► Register ─────► Premium (€149/mes)
                                       │
                                       ▼
                                  Stripe payment
                                       │
                                       ▼
                                  Sponsored badge
                                       │
                                       ▼
                                  10% AI boost
                                       │
                                       ▼
                                  More visibility
                                       │
                                       ▼
                                  More bookings
```

### 6.2 Paketi

| Paket | Cena/mes | Lokalov | Slik | AI boost | Analytics | Sponsorship |
|-------|---------|---------|------|----------|-----------|-------------|
| **Free** | €0 | 1 | 5 | ❌ | Osnovni | ❌ |
| **Premium** | €149 | 5 | 20 | 10% | Full | ✅ |
| **Enterprise** | €499 | 20 | 50 | 10% + API | Advanced | ✅ + Priority |

### 6.3 Beta → Paid konverzija

```
BETA (0-30 lokalov)
  │
  │ Vsi brezplačno
  │
  ▼
30 lokalov doseženih
  │
  │ Email vsem: "Beta se končuje"
  │ 30-dnevni grace period
  │
  ▼
GRACE PERIOD KONEC
  │
  │ Free paket: 1 lokal ostane
  │ Ostali → arhivirani (razen če upgrade)
  │
  ▼
PAID MODEL AKTIVEN
```

---

## 7. Trust Workflow

### 7.1 Transparency sistem

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUST WORKFLOW                            │
└─────────────────────────────────────────────────────────────┘

  AI odgovor / Recommendation
         │
         ▼
  ┌─────────────────────┐
  │  Je to organsko?    │
  └──────┬──────────────┘
         │
    YES  │  NO
         │
         ▼  ▼
  ┌────────┐  ┌─────────────────┐
  │ BREZ   │  │ Je sponzorirano?│
  │ OZNAKE │  └──────┬──────────┘
  └────────┘         │
                YES  │  NO
                     │
                     ▼  ▼
              ┌────────┐  ┌─────────────────┐
              │ ⭐      │  │ Je affiliate?   │
              │ SPONZ. │  └──────┬──────────┘
              └────────┘         │
                          YES    │  NO
                                 │
                                 ▼  ▼
                          ┌────────┐  ┌────────────┐
                          │ 🔗     │  │ ERROR      │
                          │ AFFIL. │  │ (nikoli)   │
                          └────────┘  └────────────┘
```

### 7.2 Visual badges

| Tip | Badge | Barva | Tooltip |
|-----|-------|-------|---------|
| Organsko | (brez) | — | — |
| Sponzorirano | ⭐ Sponzorirano | Zlata | "Ta ponudnik podpira platformo" |
| Affiliate | 🔗 Partnerska povezava | Modra | "Znova preusmerjeni na partnerja" |
| Featured | ⭐ Featured | Vijolična | "Uredniško poudarjeno" |

### 7.3 Trust principi

1. **Uporabnik nikoli ne plača** — AI je vedno brezplačen
2. **Vedno jasno označeno** — kaj je oglas
3. **AI nikoli ne priporoča slabega** — samo ker plača
4. **Affiliate disclosure** — vedno viden pred klikom
5. **Pravica do zavrnitve** — uporabnik lahko skrije sponzorirano

---

## 8. Lifecycle

### 8.1 Razvojne faze

```
┌─────────────────────────────────────────────────────────────┐
│                      LIFECYCLE                               │
└─────────────────────────────────────────────────────────────┘

  DEVELOPMENT (končano)
  ├─ 9 AI funkcij implementiranih
  ├─ 81 slik pravilnih
  ├─ Rebrand končan
  └─ Blueprint kreiran ← TU SMO
         │
         ▼
  INTERNAL TESTING (1 teden)
  ├─ End-to-end test vseh workflowov
  ├─ Performance test
  ├─ Security audit
  └─ Bug fixing
         │
         ▼
  BETA (2-4 tedne)
  ├─ 25 lokalov aktivnih (že imamo)
  ├─ Pridobiti 5+ novih
  ├─ Zbirati feedback
  └─ Iterativne izboljšave
         │
         ▼
  30 PROVIDERS MILESTONE
  ├─ Beta končana
  ├─ Email vsem ponudnikom
  └─ 30-dnevni grace period
         │
         ▼
  LAUNCH
  ├─ Custom domena
  ├─ Google Search Console
  ├─ Reddit/Facebook distribucija
  └─ Press release
         │
         ▼
  GROWTH (3-6 mesecev)
  ├─ 50,000 monthly visitors
  ├─ 100+ providers
  ├─ 15% premium konverzija
  └─ €3,000 MRR
         │
         ▼
  EXPANSION (6-12 mesecev)
  ├─ Dodatni jeziki (fr, es, ru)
  ├─ Mobile app
  ├─ API za partnerje
  └─ Širitev na Balkan
```

---

## 9. Business Rules

> Ta dokument je **obvezujoč** za vso nadaljnjo implementacijo. Vsaka nova funkcija mora biti skladna s temi pravili.

### 📜 Business Rules v1.0

#### **Rule 1: AI Integrity**
> AI NIKOLI ne sme priporočiti slabega ponudnika samo zato, ker plača.

**Implementacija:**
- Relevance (60%) vedno dominira nad Premium boost (10%)
- Če ponudnik ima rating < 3.5, premium boost se ne uporabi
- AI prompt eksplicitno prepoveduje prioritizacijo plačnikov nad kakovostjo

---

#### **Rule 2: Sponsored Boost Limit**
> Sponsored lahko dobi največ 10% boost v AI ranking.

**Implementacija:**
- `premiumBoost: 0.10` (max)
- Tudi Enterprise paket ne more preseči 10%
- Boost se apply-a na score, ne na pozicijo

---

#### **Rule 3: Transparency Mandatory**
> Vedno mora biti jasno označeno, kaj je oglas.

**Implementacija:**
- `⭐ Sponzorirano` badge za vse plačane prikaze
- `🔗 Partnerska povezava` za affiliate
- Brez oznake = organsko (brezplačno)
- Badge je vedno viden, ne more se skriti

---

#### **Rule 4: User Never Pays**
> Uporabnik nikoli ne plača za uporabo AI.

**Implementacija:**
- AI itinerer: brezplačen
- AI chatbot: brezplačen
- Naravnojezikovno iskanje: brezplačno
- Vse AI funkcije za uporabnike: brezplačne
- Monetizacija samo prek ponudnikov + affiliate

---

#### **Rule 5: Affiliate Disclosure**
> Affiliate povezave so vedno označene.

**Implementacija:**
- `🔗 Partnerska povezava` badge pred klikom
- `rel="sponsored nofollow"` na vseh affiliate linkih
- Footer disclaimer o affiliate programih
- Booking panel vedno prikazuje "Booking.com" logo

---

#### **Rule 6: Admin Approval Required**
> Noben lokal ni objavljen brez admin odobritve.

**Implementacija:**
- Nov lokal: status `PENDING`
- Admin mora approve
- Email obvestilo lastniku ob odobritvi/zavrnitvi
- Reason ob zavrnitvi

---

#### **Rule 7: Beta Limit**
> Beta je brezplačna do 30 lokalov.

**Implementacija:**
- `betaStatus.listingCount` se spremlja
- Ob dosegu 30: email vsem ponudnikom
- 30-dnevni grace period
- Po tem: Free paket (1 lokal) ali plačilo

---

#### **Rule 8: Data Accuracy**
> Vsi podatki morajo biti pravilni ali odstranjeni.

**Implementacija:**
- Slike: VLM preverba
- Kontakti: web-search verifikacija
- Naslovi: Google Maps validacija
- Če ni pravilno → popravi ali izbriši

---

#### **Rule 9: Multi-turn Memory**
> AI si zapomni kontekst pogovora.

**Implementacija:**
- Zgodovina ukazov poslana AI-ju
- "Dodaj več pohodov" razume v kontekstu prejšnjega itinererja
- History badge prikazuje vse spremembe

---

#### **Rule 10: Performance Budget**
> AI odgovor v < 30 sekundah.

**Implementacija:**
- 24h cache za priporočila
- 90-dnevni cache za FAQ
- Permanenten cache za POI opise
- Fallback na deterministične odgovore ob napaki

---

## 10. Wireframes

### 10.1 Homepage (revidiran)

```
┌─────────────────────────────────────────────────────────────┐
│  🏔️ Discover Slovenia AI          🔍  🌙  EN  [Načrtuj]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │   NAČRTUJ POPOLN OBISK SLOVENIJE Z AI               │   │
│  │   — brezplačno —                                    │   │
│  │                                                     │   │
│  │   ┌─────────────────────────────────────────────┐   │   │
│  │   │  ✨ Ustvari AI itinerar                     │   │   │
│  │   └─────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  │   ┌─────────────────┐  ┌─────────────────┐          │   │
│  │   │ 🗺️ Raziskuj     │  │ 🛍️ Izdelki in   │          │   │
│  │   │    destinacije  │  │    doživetja    │          │   │
│  │   └─────────────────┘  └─────────────────┘          │   │
│  │                                                     │   │
│  │   📊 22 destinacij · 25 lokalov · AI načrtovalec    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [Vsebina spodaj: Stats, Zbirke, Destinacije, AI, Map...]  │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 AI Itinerar rezultat (z transparency)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Nazaj                VAŠ 3-DNEVNI ITINERAR    [AI badge]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Dan 1: Bled (sončno, 22°C)                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  09:00-13:00  Blejski grad                          │   │
│  │  📍 POI · €10 · 4 ur                                │   │
│  │  [Brez oznake = organsko]                           │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  12:00-14:00  Restavracija JB         ⭐ SPONZORIRANO│   │
│  │  🏨 Lokalac · €€€ · Ljubljana                        │   │
│  │  "Ta ponudnik podpira platformo"                    │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  15:00-17:00  Vintgar soteska                       │   │
│  │  📍 POI · €5 · 2 uri                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🏨 Nastanitev                       🔗 AFFILIATE    │   │
│  │  Iskanje hotelov v Bledu → Booking.com              │   │
│  │  [Odpri na Booking.com]                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ✨ Prilagodi itinerer z AI                          │   │
│  │  [Dodaj več pohodov] [Ceneje] [Za otroke] [Dež?]   │   │
│  │  [____________________________________________] [➤] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 Owner Dashboard (z vrednost)

```
┌─────────────────────────────────────────────────────────────┐
│  Owner Dashboard        [Moji lokalci] [Izdelki] [Naročnina]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ✨ AI vpogled                                       │   │
│  │  "Vaš lokal je 35% bolj viden poleti. Dodajte       │   │
│  │   zimski izkušnji za uravnotežen promet."           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Vaša statistika (zadnjih 30 dni):                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ 👁️ 1,247 │ │ 👆 89    │ │ 🤖 34    │ │ 📧 5     │      │
│  │ ogledov  │ │ klikov   │ │ AI prih. │ │ kontaktov│      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  VREDNOST VAŠEGA LOKALA                              │   │
│  │                                                     │   │
│  │  €847 (če bi plačali €149/mes za Premium)           │   │
│  │  Vaša investicija: €0 (Beta)                        │   │
│  │                                                     │   │
│  │  [Nadgradi na Premium €149/mes →]                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Beta status: 25/30 lokalov do monetizacije                │
│  [████████████████████░░░░░]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.4 Admin Dashboard (z approval queue)

```
┌─────────────────────────────────────────────────────────────┐
│  Admin Dashboard     [Lokali] [⭐ Pending: 3] [Sponzorstva] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⚠️ 3 LOKALI ČAKAJO NA ODOBRITEV                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Hotel Triglav Bled                  [PENDING]       │   │
│  │  📧 info@hoteltriglavbled.si                         │   │
│  │  📍 Kolodvorska 33, Bled                             │   │
│  │  [Preview] [✅ Approve] [❌ Reject] [✏️ Edit]        │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Restavracija As                     [PENDING]       │   │
│  │  📧 info@gostilnaas.si                               │   │
│  │  📍 Ciril-Metodov trg 3, Ljubljana                  │   │
│  │  [Preview] [✅ Approve] [❌ Reject] [✏️ Edit]        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ✨ AI vpogled v platformo                           │   │
│  │  "Ni premium uporabnikov — visok potencial za       │   │
│  │   monetizacijo. 21.4% CTR je prostor za izboljšave."│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  KPIs:                                                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                       │
│  │  25  │ │  €0  │ │  34  │ │  3 ⭐ │                       │
│  │ lokal│ │ MRR  │ │ AI/d │ │ sponz.│                       │
│  └──────┘ └──────┘ └──────┘ └──────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Acceptance Criteria

> Pred deployem morajo biti vsi kriteriji izpolnjeni.

### 11.1 Visitor Journey
- [ ] Homepage ima 3 jasne CTAs
- [ ] AI itinerar prikazuje transparency badges
- [ ] Affiliate povezave jasno označene
- [ ] Multi-turn refinement deluje
- [ ] Vse AI funkcije brezplačne za uporabnika

### 11.2 Provider Journey
- [ ] Registracija deluje
- [ ] AI auto-tagging integriran
- [ ] Status sistem (Draft → Pending → Approved → Published)
- [ ] Email obvestila ob odobritvi
- [ ] Analytics z ROI prikazom
- [ ] Upgrade na Premium (Stripe)

### 11.3 Admin Journey
- [ ] Pending approval queue
- [ ] Approve/Reject funkcionalnost
- [ ] Sponsorship management
- [ ] Content moderation
- [ ] AI insights dashboard

### 11.4 AI Workflow
- [ ] Ranking z utežmi (60/20/10/10)
- [ ] Sponsored merge (max 1/dan)
- [ ] Affiliate merge z oznakami
- [ ] Transparency labels v UI
- [ ] Multi-turn memory

### 11.5 Monetization
- [ ] Affiliate tok deluje (Booking, Viator, DiscoverCars)
- [ ] Pavšalni oglas (Premium/Enterprise)
- [ ] Beta conversion messaging
- [ ] Stripe checkout
- [ ] Sponsored badge sistem

### 11.6 Trust
- [ ] Vse sponzorirano jasno označeno
- [ ] Vse affiliate jasno označeno
- [ ] Footer disclaimer
- [ ] `rel="sponsored nofollow"` na affiliate

### 11.7 Business Rules
- [ ] Rule 1-10 implementirane
- [ ] AI nikoli ne prioritizira plačnikov nad kakovostjo
- [ ] User nikoli ne plača
- [ ] Admin approval required

---

## 📅 Naslednji koraki

1. **Potrditev Blueprint-a** — uporabnik pregleda in potrdi
2. **Implementacija Priority 1** — Transparency monetizacije
3. **Implementacija Priority 2** — Admin Approval Workflow
4. **Implementacija Priority 3** — Sponsorship Management
5. **Internal Testing** — end-to-end test vseh workflowov
6. **Deploy** — šele ko so vsi acceptance criteria izpolnjeni

---

## 12. User Roles & Permissions

### 12.1 Definicije vlog

| Vloga | Opis | Avtentikacija |
|-------|------|--------------|
| **Visitor** | Anonimni obiskovalec, brez računa | Brez |
| **Registered User** | Registrirani uporabnik (shranjuje itinererje, nastavitve) | NextAuth (email) |
| **Provider (Free)** | Lastnik lokalca na Free paketu | NextAuth + Owner record |
| **Premium Provider** | Lastnik na Premium paketu (€149/mes) | NextAuth + Stripe |
| **Enterprise Provider** | Lastnik na Enterprise paketu (€499/mes) | NextAuth + Stripe |
| **Moderator** | Vsebinski moderator (pregled vsebine, ne monetizacije) | NextAuth + role |
| **Admin** | Poln operativni dostop (odobritve, sponzorstva, statistika) | NextAuth + ADMIN_PASSWORD |
| **Super Admin** | Razvojne funkcije (feature flags, ab testing, db migracije) | NextAuth + SUPER_ADMIN_SECRET |

### 12.2 Permission Matrix

```
┌──────────────────────┬─────────┬──────────┬──────────┬──────────┬──────────┬───────────┬───────┬────────────┐
│ Funkcija             │ Visitor │ Reg. User│ Provider │ Premium  │Enterprise│ Moderator │ Admin │ Super Admin│
├──────────────────────┼─────────┼──────────┼──────────┼──────────┼──────────┼───────────┼───────┼────────────┤
│ AI itinerar          │    ✅   │    ✅    │    ✅    │    ✅    │    ✅    │    ✅     │  ✅   │     ✅     │
│ AI chatbot           │    ✅   │    ✅    │    ✅    │    ✅    │    ✅    │    ✅     │  ✅   │     ✅     │
│ Smart search         │    ✅   │    ✅    │    ✅    │    ✅    │    ✅    │    ✅     │  ✅   │     ✅     │
│ Shranjevanje itiner. │    ❌   │    ✅    │    ✅    │    ✅    │    ✅    │    ✅     │  ✅   │     ✅     │
│ Newsletter           │    ✅   │    ✅    │    ✅    │    ✅    │    ✅    │    ✅     │  ✅   │     ✅     │
├──────────────────────┼─────────┼──────────┼──────────┼──────────┼──────────┼───────────┼───────┼────────────┤
│ Dodaj lokal          │    ❌   │    ❌    │    ✅    │    ✅    │    ✅    │    ❌     │  ✅   │     ✅     │
│ Urejaj svoj lokal    │    ❌   │    ❌    │    ✅    │    ✅    │    ✅    │    ❌     │  ✅   │     ✅     │
│ Dodaj izdelek        │    ❌   │    ❌    │    ✅    │    ✅    │    ✅    │    ❌     │  ✅   │     ✅     │
│ AI auto-tag          │    ❌   │    ❌    │    ✅    │    ✅    │    ✅    │    ❌     │  ✅   │     ✅     │
│ Osebne analytics     │    ❌   │    ❌    │    ✅    │    ✅    │    ✅    │    ❌     │  ✅   │     ✅     │
│ AI insights (owner)  │    ❌   │    ❌    │    ❌    │    ✅    │    ✅    │    ❌     │  ✅   │     ✅     │
│ Sponsored boost      │    ❌   │    ❌    │    ❌    │    ✅    │    ✅    │    ❌     │  ✅   │     ✅     │
│ API dostop           │    ❌   │    ❌    │    ❌    │    ❌    │    ✅    │    ❌     │  ❌   │     ✅     │
├──────────────────────┼─────────┼──────────┼──────────┼──────────┼──────────┼───────────┼───────┼────────────┤
│ Odobri lokal         │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ✅     │  ✅   │     ✅     │
│ Reject lokal         │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ✅     │  ✅   │     ✅     │
│ Edit katerega koli   │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ✅     │  ✅   │     ✅     │
│ Featured (uredniško) │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ✅     │  ✅   │     ✅     │
│ Brisanje vsebine     │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ✅     │  ✅   │     ✅     │
├──────────────────────┼─────────┼──────────┼──────────┼──────────┼──────────┼───────────┼───────┼────────────┤
│ Sponsorship manage   │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ❌     │  ✅   │     ✅     │
│ Paketi & pricing     │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ❌     │  ✅   │     ✅     │
│ Beta status          │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ❌     │  ✅   │     ✅     │
│ Global analytics     │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ❌     │  ✅   │     ✅     │
│ AI insights (admin)  │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ❌     │  ✅   │     ✅     │
├──────────────────────┼─────────┼──────────┼──────────┼──────────┼──────────┼───────────┼───────┼────────────┤
│ Feature flags        │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ❌     │  ❌   │     ✅     │
│ DB migracije         │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ❌     │  ❌   │     ✅     │
│ Sprememba pravil     │    ❌   │    ❌    │    ❌    │    ❌    │    ❌    │    ❌     │  ❌   │     ✅     │
└──────────────────────┴─────────┴──────────┴──────────┴──────────┴──────────┴───────────┴───────┴────────────┘
```

### 12.3 Implementacijske specifikacije

```typescript
// src/lib/auth-guards.ts
type Role = "visitor" | "user" | "provider" | "premium" | "enterprise" | "moderator" | "admin" | "super_admin";

interface Permission {
  resource: "listing" | "product" | "experience" | "sponsorship" | "analytics" | "admin";
  action: "read" | "create" | "update" | "delete" | "approve" | "manage";
  scope: "own" | "all";
}

// Role → Permissions mapping (konstanta)
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  visitor: [
    { resource: "listing", action: "read", scope: "all" },
    // ... samo read na public resource
  ],
  provider: [
    { resource: "listing", action: "create", scope: "own" },
    { resource: "listing", action: "update", scope: "own" },
    { resource: "listing", action: "read", scope: "all" },
  ],
  admin: [
    { resource: "listing", action: "*", scope: "all" },
    { resource: "sponsorship", action: "*", scope: "all" },
    // ... full access
  ],
};

function canPerform(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].some(p =>
    p.resource === perm.resource &&
    (p.action === perm.action || p.action === "*") &&
    p.scope === perm.scope
  );
}
```

### 12.4 Auth implementacija

| Vloga | Kje se določi | Metoda |
|-------|--------------|--------|
| Visitor | Implicitno | Brez avtentikacije |
| Registered User | Pri registraciji | NextAuth credentials |
| Provider | Pri registraciji lastnika | `Owner.plan = "free"` |
| Premium | Po Stripe plačilu | `Owner.plan = "premium"` (webhook) |
| Enterprise | Po Stripe plačilu | `Owner.plan = "enterprise"` (webhook) |
| Moderator | Admin nastavi | `Owner.role = "moderator"` |
| Admin | Preko ADMIN_PASSWORD | Header `x-admin-password` |
| Super Admin | Preko SUPER_ADMIN_SECRET | Env + IP whitelist |

---

## 13. State Diagrams

### 13.1 Listing State Machine

```
                    ┌─────────┐
                    │  DRAFT  │ ◄──── Lastnik ureja
                    └────┬────┘
                         │ oddaj
                         ▼
                    ┌─────────┐
                    │ PENDING │ ◄──── Čaka admin
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         reject         approve   edit
              │          │          │
              ▼          ▼          ▼
        ┌─────────┐ ┌─────────┐ ┌─────────┐
        │REJECTED │ │APPROVED │ │  EDIT   │
        └────┬────┘ └────┬────┘ └────┬────┘
             │           │           │
             │ popravil  │ publish   │ admin
             │           │           │ shrani
             ▼           ▼           ▼
        ┌─────────┐ ┌──────────┐   ┌─────────┐
        │  DRAFT  │ │PUBLISHED │   │ PENDING │
        └─────────┘ └────┬─────┘   └─────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
           expire     archive    admin
              │          │       delete
              ▼          ▼          ▼
        ┌─────────┐ ┌─────────┐ ┌─────────┐
        │ EXPIRED │ │ARCHIVED │ │ DELETED │
        └────┬────┘ └─────────┘ └─────────┘
             │
             │ obnovi
             ▼
        ┌──────────┐
        │PUBLISHED │
        └──────────┘
```

**Listing status vrednosti:**
- `draft` — Lastnik še ureja
- `pending` — Oddan, čaka admin
- `approved` — Admin odobril, še ni objavljen
- `published` — Živo na platformi
- `rejected` — Admin zavrgel (z razlogom)
- `expired` — Paket potekel, ni več viden
- `archived` — Arhiviran (ne aktiven)
- `deleted` — Soft delete

### 13.2 Sponsorship State Machine

```
                    ┌──────────┐
                    │ CREATED  │ ◄──── Lastnik izbere sponzorstvo
                    └────┬─────┘
                         │ Stripe checkout
                         ▼
                    ┌──────────┐
                    │  PAID    │ ◄──── Stripe webhook potrdi
                    └────┬─────┘
                         │ aktiviraj
                         ▼
                    ┌──────────┐
                    │  ACTIVE  │ ◄──── Sponsored badge aktiven
                    └────┬─────┘    AI boost 10% aktiven
                         │
                    ┌────┴─────┐
                    │ 7 dni do │
                    │ poteka   │
                    └────┬─────┘
                         │ email opomnik
                         ▼
                    ┌──────────┐
                    │EXPIRING  │ ◄──── 7 dni pred potekom
                    └────┬─────┘
                         │ datum poteka
                         ▼
                    ┌──────────┐
                    │ EXPIRED  │ ◄──── Badge odstranjen, boost 0
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
          obnovi    prekliči    arhiviraj
              │          │          │
              ▼          ▼          ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  ACTIVE  │ │CANCELLED │ │ARCHIVED  │
        └──────────┘ └──────────┘ └──────────┘
```

### 13.3 Subscription State Machine (Premium/Enterprise)

```
                    ┌──────────┐
                    │   FREE   │ ◄──── Default pri registraciji
                    └────┬─────┘
                         │ upgrade
                         ▼
                    ┌──────────┐
                    │ CHECKOUT │ ◄──── Stripe checkout session
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
           uspeh      prekliči    napaka
              │          │          │
              ▼          ▼          ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ TRIALING │ │  FREE    │ │  ERROR   │
        └────┬─────┘ └──────────┘ └──────────┘
             │ 14 dni trial
             ▼
        ┌──────────┐
        │  ACTIVE  │ ◄──── Plača €149/mes
        └────┬─────┘
             │
        ┌────┴─────┐
        │ plačilo  │
        │ neuspeš. │
        └────┬─────┘
             │ 3 dni grace
             ▼
        ┌──────────┐
        │ PAST_DUE │ ◄──── Čaka na plačilo
        └────┬─────┘
             │
              ┌──────────┼──────────┐
              │          │          │
           plača     prekliči    ne plača
              │          │          │
              ▼          ▼          ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  ACTIVE  │ │CANCELLED │ │DOWNGRADED│
        └──────────┘ │ (konec)  │ │ → FREE   │
                     └──────────┘ └──────────┘
```

### 13.4 AI Request State Machine

```
                    ┌──────────┐
                    │  RECEIVE │ ◄──── User request
                    └────┬─────┘
                         │
                         ▼
                    ┌──────────┐
                    │  CACHE   │ ◄──── Preveri cache (24h)
                    │  CHECK   │
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
           cache     cache      no cache
           hit      stale      miss
              │          │          │
              ▼          ▼          ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  RETURN  │ │REFRESH   │ │  AI CALL │
        │ (cache)  │ │(bg job)  │ │          │
        └──────────┘ └──────────┘ └────┬─────┘
                                          │
                              ┌───────────┼───────────┐
                              │           │           │
                           uspeh       timeout     napaka
                              │           │           │
                              ▼           ▼           ▼
                        ┌──────────┐ ┌──────────┐ ┌──────────┐
                        │  RETURN  │ │ FALLBACK │ │ FALLBACK │
                        │ (cache+) │ │(determ.) │ │(determ.) │
                        └──────────┘ └──────────┘ └──────────┘
```

---

## 14. Error Flows & Fallbacks

### 14.1 AI Service Failures

#### Scenario: GLM (Puter API) nedosegljiv

```
User request → AI call → timeout/napaka
                          │
                          ▼
                    ┌──────────────────────┐
                    │ FALLBACK 1: z-ai-sdk │
                    │ (direct SDK call)    │
                    └──────────┬───────────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
                 uspeh       napaka     timeout
                    │          │          │
                    ▼          ▼          ▼
              ┌─────────┐ ┌──────────────────────┐
              │ RETURN  │ │ FALLBACK 2:          │
              │(cache+) │ │ deterministični      │
              └─────────┘ │ (rule-based) odgovor │
                          └──────────┬───────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │ RETURN      │
                              │ source:     │
                              │ "fallback"  │
                              │ + toast:    │
                              │ "AI deluje  │
                              │ v omejenem  │
                              │ načinu"     │
                              └─────────────┘
```

**Pravila:**
- Timeout: 30s za AI klic
- 3 retry-ji z exponential backoff (1s, 2s, 4s)
- Fallback vedno vrne rezultat (nikoli 500)
- Source badge v UI: `AI` | `fallback`
- Admin email če >10 fallback-ov v 1 uri

#### Scenario: AI vrne neveljaven JSON

```
AI call → JSON parse napaka
          │
          ▼
    ┌──────────────────────┐
    │ 1. Poskusi regex     │
    │    ekstrakcijo JSON  │
    └──────────┬───────────┘
               │
       ┌───────┴───────┐
       │               │
    uspeh           napaka
       │               │
       ▼               ▼
    ┌─────────┐   ┌──────────────────┐
    │ RETURN  │   │ Fallback na      │
    └─────────┘   │ deterministični  │
                  └──────────────────┘
```

### 14.2 External Service Failures

#### Stripe plačilo neuspešno

```
Checkout → Stripe API → napaka
                       │
                       ▼
              ┌────────────────────┐
              │ 1. Retry (3x)      │
              └────────┬───────────┘
                       │
              ┌────────┴───────────┐
              │                    │
           uspeh               napaka
              │                    │
              ▼                    ▼
        ┌─────────┐       ┌──────────────────────┐
        │ Webhook │       │ Toast: "Plačilo      │
        │ → active│       │ neuspešno. Poskusi   │
        └─────────┘       │ znova ali kontaktiraj│
                          │ podporo."            │
                          └──────────────────────┘
```

#### OpenStreetMap (POI) nedosegljiv

```
/api/pois → Overpass API → timeout
                          │
                          ▼
                ┌─────────────────────┐
                │ 1. Preveri cache    │
                │    (data/poi-cache) │
                └─────────┬───────────┘
                          │
                 ┌────────┴───────────┐
                 │                    │
              cache              no cache
                 │                    │
                 ▼                    ▼
           ┌─────────┐       ┌──────────────────┐
           │ RETURN  │       │ RETURN empty     │
           │(cached) │       │ + toast: "POI    │
           └─────────┘       │ trenutno ni na   │
                             │ voljo"           │
                             └──────────────────┘
```

#### Affiliate link pade (Booking.com)

```
User click → Booking.com → timeout/napaka
                          │
                          ▼
                ┌─────────────────────┐
                │ Affiliate link je   │
                │ EXTERNAL — ne moremo│
                │ kontrolirati        │
                └─────────┬───────────┘
                          │
                          ▼
                ┌─────────────────────┐
                │ Tracking: zabeleži  │
                │ klik + status       │
                │ "clicked" (ne       │
                │ "converted")        │
                └─────────────────────┘
```

### 14.3 Database Failures

#### Prisma/SQLite napaka

```
DB query → timeout/locked
          │
          ▼
    ┌─────────────────────┐
    │ 1. Retry (3x, 1s)   │
    └─────────┬───────────┘
              │
     ┌────────┴───────────┐
     │                    │
   uspeh               napaka
     │                    │
     ▼                    ▼
  ┌─────────┐     ┌──────────────────────┐
  │ RETURN  │     │ Fallback na statične │
  └─────────┘     │ podatke (slovenia-   │
                  │ data.ts) + toast     │
                  └──────────────────────┘
```

### 14.4 Rate Limiting

| Endpoint | Limit | Po prekoračitvi |
|----------|-------|-----------------|
| `/api/itinerary` | 10/hour/IP | 429 + retry-after |
| `/api/chat` | 20/hour/IP | 429 + retry-after |
| `/api/smart-search` | 30/hour/IP | 429 + retry-after |
| `/api/owner/auto-tag` | 5/hour/owner | 429 |
| `/api/ai-insights` | 10/hour/admin | 429 |
| `/api/leads` (JoinUs) | 3/hour/IP | 429 (anti-spam) |
| `/api/newsletter/subscribe` | 3/hour/IP | 429 |

**Implementacija:** Uporabljamo memory-based rate limiting (Map v serverless). Za produkcijo: Upstash Redis.

### 14.5 Graceful Degradation tabela

| Komponenta | Popoln izpad | Delni izpad | Vpliv na uporabnika |
|------------|-------------|-------------|---------------------|
| GLM AI | Fallback na rule-based | (ni delnega) | AI badge → "fallback" |
| Stripe | Brez upgrade-ov | Webhook delay | Owner ne more upgradati |
| Overpass (POI) | Brez POI-jev | Samo cached | Zemljevid brez POI |
| Open-Meteo | Brez vremena | (ni delnega) | Itinerar brez vremena |
| Email (SMTP) | Brez obvestil | Delay | Lastnik ne dobi email-a |
| Booking.com | Affiliat ne deluje | (ni delnega) | Booking panel skrit |
| Prisma DB | Static data fallback | Slow queries | Nekatere funkcije onemogočene |

---

## 15. KPI Dashboard

### 15.1 North Star Metrics

```
                    ┌─────────────────────────────┐
                    │      NORTH STAR METRIC      │
                    │                             │
                    │  AI itineraries generated   │
                    │       per month             │
                    │                             │
                    │       Cilj: 2,000/mes       │
                    └─────────────────────────────┘
```

### 15.2 KPI Kategorije

#### 📈 Growth KPIs

| KPI | Formula | Cilj (12 mes) | Frekvenca |
|-----|---------|--------------|-----------|
| Monthly Active Users (MAU) | Unikatni uporabniki/mes | 50,000 | Dnevno |
| AI itineraries/day | Število generiranih itinererjev | 65/day | Dnevno |
| AI chats/day | Število chat sporočil | 100/day | Dnevno |
| Smart searches/day | Naravnojezikovna iskanja | 50/day | Dnevno |
| Newsletter signups/mes | Novi subscriberji | 500/mes | Tedensko |
| Repeat visitors | % return uporabnikov | 25% | Mesečno |

#### 💰 Monetization KPIs

| KPI | Formula | Cilj (12 mes) | Frekvenca |
|-----|---------|--------------|-----------|
| MRR (pavšalni) | Σ aktivne naročnine | €3,000/mes | Dnevno |
| ARR | MRR × 12 | €36,000 | Mesečno |
| Premium conversion | Premium/Σ providers | 15% | Mesečno |
| Enterprise conversion | Enterprise/Σ providers | 5% | Mesečno |
| Affiliate revenue/mes | Σ commissions | €2,000/mes | Mesečno |
| CTR affiliate | Kliki/prikazi | 8% | Tedensko |
| Churn rate | Cancelled/Active | <5% | Mesečno |
| LTV | Povprečna vrednost stranke | €1,500 | Četrtletje |

#### 🤖 AI Performance KPIs

| KPI | Formula | Cilj | Frekvenca |
|-----|---------|------|-----------|
| AI success rate | AI responses/total requests | >90% | Dnevno |
| AI fallback rate | Fallback/total | <10% | Dnevno |
| Avg AI response time | Σ time / count | <15s | Dnevno |
| Multi-turn usage | Refinements/itineraries | 0.4 | Tedensko |
| AI cost per request | Σ cost / count | <€0.015 | Mesečno |
| Search success rate | Results with click/total | >60% | Tedensko |
| CTR AI priporočil | Kliki/prikazi | 12% | Tedensko |

#### 🏪 Provider KPIs

| KPI | Formula | Cilj | Frekvenca |
|-----|---------|------|-----------|
| Aktivni ponudniki | Σ owners s PUBLISHED lokalom | 100 | Dnevno |
| Povprečno lokalov/ponudnika | Σ listings / Σ owners | 2.5 | Mesečno |
| Avg views per listing | Σ views / Σ listings | 500/mes | Tedensko |
| Avg clicks per listing | Σ clicks / Σ listings | 50/mes | Tedensko |
| Avg AI recommendations | Σ ai_recs / Σ listings | 15/mes | Tedensko |
| Provider satisfaction | NPS survey | >50 | Četrtletje |

#### 🛡️ Trust & Quality KPIs

| KPI | Formula | Cilj | Frekvenca |
|-----|---------|------|-----------|
| Avg listing rating | Σ ratings / count | >4.3 | Mesečno |
| Pending approval time | avg(approve - submit) | <24h | Dnevno |
| Rejection rate | Rejected/Submitted | <10% | Tedensko |
| Spam detected | Auto-rejected/total | <5% | Tedensko |
| User reports | Prijave na lokal | <2/1000 | Tedensko |

#### ⚡ Technical KPIs

| KPI | Formula | Cilj | Frekvenca |
|-----|---------|------|-----------|
| Uptime | % dostopnost | 99.5% | Dnevno |
| Avg page load | LCP | <2.5s | Dnevno |
| Error rate | 5xx/total | <0.5% | Dnevno |
| Core Web Vitals | LCP/FID/CLS | All green | Tedensko |
| API response time | p95 | <500ms | Dnevno |
| DB query time | p95 | <100ms | Dnevno |

### 15.3 Dashboard struktura

#### Admin Dashboard — KPI tabs

```
┌─────────────────────────────────────────────────────────────┐
│  Admin Dashboard                                            │
│  [Overview] [Growth] [Monetization] [AI] [Providers] [Tech]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  OVERVIEW (vsi ključni na enem mestu)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  50,234  │ │ 2,041    │ │ €3,127   │ │  98.7%   │      │
│  │ MAU      │ │ AI/mes   │ │ MRR      │ │ Uptime   │      │
│  │ +12%     │ │ +23%     │ │ +€412    │ │          │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  GROWTH (visitor metrics)                                  │
│  - MAU trend chart                                          │
│  - AI usage chart                                           │
│  - Top landing pages                                        │
│  - Traffic sources                                          │
│                                                             │
│  MONETIZATION (revenue)                                    │
│  - MRR chart                                                │
│  - Affiliate revenue                                        │
│  - Conversion funnel                                        │
│  - Churn analysis                                           │
│                                                             │
│  AI (performance)                                           │
│  - Success/fallback rate                                    │
│  - Response time                                            │
│  - Cost per request                                         │
│  - Top queries                                              │
│                                                             │
│  PROVIDERS (B2B)                                           │
│  - Active providers                                         │
│  - Avg views/clicks                                         │
│  - Upgrade funnel                                           │
│  - Satisfaction                                             │
│                                                             │
│  TECH (system health)                                      │
│  - Uptime                                                   │
│  - Error rate                                               │
│  - Response times                                           │
│  - Core Web Vitals                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 16. AI Cost Model

### 16.1 Stroški na AI klic (Puter GLM — brezplačen, vendar z omejitvami)

> **Opomba:** Trenutno uporabljamo Puter API (brezplačni tier). Model predpostavlja prehod na plačani tier pri skaliranju.

| AI funkcija | Input tokens | Output tokens | Čas | Strošek (GLM-4) | Strošek (Puter) |
|-------------|--------------|---------------|------|-----------------|-----------------|
| AI Itinerary | ~3,500 | ~1,500 | ~30s | €0.015 | €0.00 (free) |
| AI Chat | ~1,200 | ~300 | ~5s | €0.004 | €0.00 (free) |
| Smart Search | ~2,000 | ~800 | ~15s | €0.008 | €0.00 (free) |
| AI Refine (multi-turn) | ~2,500 | ~1,000 | ~25s | €0.012 | €0.00 (free) |
| AI Recommendations | ~1,500 | ~100 | ~10s | €0.003 | €0.00 (free) |
| POI Describe | ~200 | ~80 | ~3s | €0.001 | €0.00 (free) |
| Auto-tag | ~400 | ~150 | ~5s | €0.002 | €0.00 (free) |
| AI Insights | ~1,800 | ~600 | ~12s | €0.006 | €0.00 (free) |
| SEO FAQ | ~800 | ~400 | ~8s | €0.003 | €0.00 (free) |
| Translate | ~200 | ~200 | ~3s | €0.001 | €0.00 (free) |

### 16.2 Revenue Projection — 3 scenariji z predpostavkami

> **Pomembno:** Projekcije temeljijo na predpostavkah. Vsaka številka je dokumentirana. Dejanski rezultati se bodo razlikovali.

#### 📋 Skupne predpostavke (za vse scenarije)

| Predpostavka | Vrednost | Vir/Utemeljitev |
|-------------|---------|-----------------|
| AI cost per itinerary | €0.015 | GLM-4 pricing (če plačljiv) |
| AI cost per chat | €0.004 | GLM-4 pricing |
| Cache hit rate | 60% | 24h TTL z stabilnimi query-ji |
| Puter (trenutno) | €0 | Brezplačni tier |
| Affiliate povprečna commission | €2/rezervacija | Booking 5% × €40 povprečno |
| Premium cena | €149/mes | Pavšalni oglas |
| Enterprise cena | €499/mes | Pavšalni oglas + API |
| Affiliate click-through rate | 8% | Industry standard za travel |
| Affiliate conversion rate | 5% | Booking.com povprečje |

---

#### 🟢 Scenarij 1: KONZERVATIVEN (1,000 uporabnikov/dan)

```
┌─────────────────────────────────────────────────────────────┐
│  SCENARIJ 1: KONZERVATIVEN                                  │
│  1,000 visitors/day · 30,000 visitors/month                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PREDPOSTAVKE:                                              │
│  - 5% uporabnikov generira itinerer (50/dan)               │
│  - 10% uporabnikov uporabi chat (100/dan)                  │
│  - 3% uporabnikov išče (30/dan)                            │
│  - 30 providerjev (beta dosežen)                           │
│  - 10% providerjev → premium (3 premium)                   │
│  - 0% enterprise (zgodnja faza)                            │
│  - 2% uporabnikov klikne affiliate (20/dan)               │
│  - 5% affiliate konverzija (1 rezervacija/dan)            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AI STROŠKI (če bi bili plačljivi):                        │
│  Itinerary:  50/day × €0.015 = €0.75/day                   │
│  Chat:      100/day × €0.004 = €0.40/day                   │
│  Search:     30/day × €0.008 = €0.24/day                   │
│  Refine:     15/day × €0.012 = €0.18/day                   │
│  Recommend: 100/day × €0.003 = €0.30/day                   │
│  Other:                       = €0.10/day                  │
│  ─────────────────────────────────────────────              │
│  Total AI cost/day:  €1.97                                  │
│  Total AI cost/month: €59 (Puter: €0)                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PRIHODKI:                                                  │
│  MRR:                                                       │
│  - 3 premium × €149 = €447/mes                             │
│  - 0 enterprise × €499 = €0                                │
│  MRR skupaj: €447/mes                                       │
│                                                             │
│  Affiliate:                                                 │
│  - 1 rezervacija/dan × €2 = €2/day                         │
│  - €60/mes                                                  │
│                                                             │
│  SKUPAJ PRIHODKI: €507/mes                                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ČISTI DOBIČEK: €507 - €59 = €448/mes                       │
│  (S Puter brezplačnim: €507 - €0 = €507/mes)                │
│                                                             │
│  ROI: 858% (ali ∞ s Puter)                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

#### 🟡 Scenarij 2: REALISTIČEN (5,000 uporabnikov/dan)

```
┌─────────────────────────────────────────────────────────────┐
│  SCENARIJ 2: REALISTIČEN                                    │
│  5,000 visitors/day · 150,000 visitors/month                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PREDPOSTAVKE:                                              │
│  - 7% uporabnikov generira itinerer (350/dan)              │
│  - 12% uporabnikov uporabi chat (600/dan)                  │
│  - 5% uporabnikov išče (250/dan)                           │
│  - 60 providerjev                                           │
│  - 12% providerjev → premium (7 premium)                   │
│  - 3% providerjev → enterprise (2 enterprise)              │
│  - 3% uporabnikov klikne affiliate (150/dan)               │
│  - 5% affiliate konverzija (7.5 rezervacije/dan)           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AI STROŠKI (če bi bili plačljivi):                        │
│  Itinerary:  350/day × €0.015 = €5.25/day                  │
│  Chat:       600/day × €0.004 = €2.40/day                  │
│  Search:     250/day × €0.008 = €2.00/day                  │
│  Refine:     100/day × €0.012 = €1.20/day                  │
│  Recommend:  500/day × €0.003 = €1.50/day                  │
│  Other:                        = €0.50/day                  │
│  ─────────────────────────────────────────────              │
│  Total AI cost/day:  €12.85                                 │
│  Total AI cost/month: €385 (Puter: €0)                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PRIHODKI:                                                  │
│  MRR:                                                       │
│  - 7 premium × €149 = €1,043/mes                           │
│  - 2 enterprise × €499 = €998/mes                          │
│  MRR skupaj: €2,041/mes                                     │
│                                                             │
│  Affiliate:                                                 │
│  - 7.5 rezervacije/dan × €2 = €15/day                      │
│  - €450/mes                                                 │
│                                                             │
│  SKUPAJ PRIHODKI: €2,491/mes                                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ČISTI DOBIČEK: €2,491 - €385 = €2,106/mes                  │
│  (S Puter brezplačnim: €2,491 - €0 = €2,491/mes)            │
│                                                             │
│  ROI: 547% (ali ∞ s Puter)                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

#### 🔴 Scenarij 3: OPTIMISTIČEN (10,000 uporabnikov/dan)

```
┌─────────────────────────────────────────────────────────────┐
│  SCENARIJ 3: OPTIMISTIČEN                                   │
│  10,000 visitors/day · 300,000 visitors/month               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PREDPOSTAVKE:                                              │
│  - 10% uporabnikov generira itinerer (1,000/dan)           │
│  - 15% uporabnikov uporabi chat (1,500/dan)                │
│  - 8% uporabnikov išče (800/dan)                           │
│  - 100 providerjev                                          │
│  - 15% providerjev → premium (15 premium)                  │
│  - 5% providerjev → enterprise (5 enterprise)              │
│  - 5% uporabnikov klikne affiliate (500/dan)               │
│  - 5% affiliate konverzija (25 rezervacij/dan)             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AI STROŠKI (če bi bili plačljivi):                        │
│  Itinerary:  1,000/day × €0.015 = €15.00/day               │
│  Chat:       1,500/day × €0.004 = €6.00/day                │
│  Search:       800/day × €0.008 = €6.40/day                │
│  Refine:       300/day × €0.012 = €3.60/day                │
│  Recommend:  1,000/day × €0.003 = €3.00/day                │
│  Other:                          = €1.00/day                │
│  ─────────────────────────────────────────────              │
│  Total AI cost/day:  €35.00                                 │
│  Total AI cost/month: €1,050 (Puter: €0 do limit)           │
│                                                             │
│  ⚠️ Opomba: Pri 10K uporabnikov Puter rate limit           │
│  verjetno dosežen → preklop na plačljiv GLM                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PRIHODKI:                                                  │
│  MRR:                                                       │
│  - 15 premium × €149 = €2,235/mes                          │
│  - 5 enterprise × €499 = €2,495/mes                        │
│  MRR skupaj: €4,730/mes                                     │
│                                                             │
│  Affiliate:                                                 │
│  - 25 rezervacij/dan × €2 = €50/day                        │
│  - €1,500/mes                                               │
│                                                             │
│  SKUPAJ PRIHODKI: €6,230/mes                                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ČISTI DOBIČEK: €6,230 - €1,050 = €5,180/mes                │
│                                                             │
│  ROI: 393%                                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 16.3 Povzetek scenarijev

| Scenarij | Uporabniki/dan | AI cost/mes | Prihodki/mes | Čisti dobitek | ROI |
|----------|---------------|-------------|-------------|--------------|-----|
| 🟢 Konzervativen | 1,000 | €59 | €507 | €448 | 858% |
| 🟡 Realističen | 5,000 | €385 | €2,491 | €2,106 | 547% |
| 🔴 Optimističen | 10,000 | €1,050 | €6,230 | €5,180 | 393% |

> **Zaključek:** Tudi v konzervativnem scenariju je model profitabilen. AI stroški so neznatni (< 17% prihodkov tudi v optimističnem). Glavno tveganje ni AI cost, temveč **pridobivanje uporabnikov in providerjev**.

### 16.4 Ključne predpostavke ki jih moramo validirati

| Predpostavka | Kako validiramo | Kdaj |
|-------------|-----------------|------|
| 5-10% uporabnikov generira itinerer | Analytics tracking | Po 1 mesecu |
| 10-15% providerjev → premium | A/B test pricing | Po 30 providerjih |
| 5% affiliate konverzija | Booking.com stats | Po 100 klikih |
| 60% cache hit rate | AIUsageLog | Po 1 tednu |
| 2-5% click-through na affiliate | AnalyticsEvent | Po 1 mesecu |

### 16.5 Cost Optimization strategije

| Strategija | Prihranek | Implementacija |
|-----------|-----------|---------------|
| **24h cache (priporočila)** | 60% | `data/ai-rec-cache.json` |
| **Permanent cache (POI)** | 95% | `data/poi-descriptions.json` |
| **90-dnevni cache (FAQ)** | 90% | `data/seo-faq-cache.json` |
| **Fallback na rule-based** | 10% | Deterministični odgovori |
| **Rate limiting** | 5% | 10/hour/IP za itinerary |
| **Batch processing** | 15% | AI insights samo 1×/teden |

### 16.6 Cost Alerting

| Alert | Trigger | Akcija |
|-------|---------|--------|
| Daily AI cost > €10 | 1,000+ uporabnikov | Preveri caching |
| Fallback rate > 15% | AI odpoveduje | Preklopi na backup provider |
| AI response time > 30s | Performance | Optimiziraj prompt |
| Cache hit rate < 50% | Slab caching | Preveri cache logiko |

---

## 17. Launch Checklist

> Pred produkcijo morajo biti vsi elementi označeni z ✅.

### 17.1 Legal & Compliance

- [ ] **GDPR** — Politika zasebnosti posodobljena (politika-zasebnosti/page.tsx)
- [ ] **Terms of Service** — Pogoji uporabe posodobljeni (pogoji-uporabe/page.tsx)
- [ ] **Cookie banner** — Implementiran in delujoč
- [ ] **Affiliate disclosure** — Jasno v footer-ju
- [ ] **Sponsored disclosure** — Jasno v AI rezultatih
- [ ] **Impressum** — Kontakt informacije (kontakt/page.tsx)
- [ ] **Data Processing Agreement** — Za premium providerje
- [ ] **Right to be forgotten** — API za brisanje uporabniških podatkov

### 17.2 SEO

- [ ] **robots.txt** — Pravilno konfiguriran (admin/owner/api disallow)
- [ ] **sitemap.xml** — Generiran in dostopen
- [ ] **Google Search Console** — Sitemap oddan
- [ ] **Bing Webmaster Tools** — Sitemap oddan
- [ ] **hreflang** — 4 jeziki (sl/en/de/it) konfigurirani
- [ ] **JSON-LD** — Vsi structured data pravilni
- [ ] **Meta descriptions** — Vse strani imajo unikatne
- [ ] **OG images** — Dynamic OG images delujejo
- [ ] **Canonical URLs** — Vse strani imajo canonical
- [ ] **301 redirects** — Stare URL-je preusmerjene

### 17.3 Performance

- [ ] **Core Web Vitals** — LCP < 2.5s, FID < 100ms, CLS < 0.1
- [ ] **Image optimization** — next/image z lazy loading
- [ ] **Bundle size** — < 200KB initial JS
- [ ] **Font optimization** — next/font z display swap
- [ ] **Code splitting** — Lazy load heavy components
- [ ] **Caching** — 24h cache za AI, static pages revalidated
- [ ] **CDN** — Vercel Edge CDN konfiguriran
- [ ] **Database indexing** — Prisma indeksi na ključnih poljih

### 17.4 Security

- [ ] **HTTPS** — SSL certifikat (Vercel auto)
- [ ] **Security headers** — CSP, HSTS, X-Frame-Options
- [ ] **Rate limiting** — Vsi AI endpointi omejeni
- [ ] **Input validation** — Zod schema za vse API-je
- [ ] **SQL injection** — Prisma parameterized queries
- [ ] **XSS protection** — React auto-escaping, DOMPurify za user content
- [ ] **CSRF protection** — SameSite cookies
- [ ] **Secrets management** — Vsi secrets v env, ne v kodi
- [ ] **ADMIN_PASSWORD** — Močno geslo (min 32 znakov, random)
- [ ] **NEXTAUTH_SECRET** — Generiran random secret
- [ ] **Stripe webhook signature** — Verificiran
- [ ] **Dependency audit** — `bun audit` brez kritičnih ranljivosti

### 17.5 Monitoring & Analytics

- [ ] **Vercel Analytics** — Nameščen
- [ ] **Google Analytics 4** — Nameščen (optional)
- [ ] **Sentry** — Error tracking nameščen
- [ ] **Uptime monitoring** — UptimeRobot ali podobno
- [ ] **AI cost monitoring** — Daily cost logging
- [ ] **Error logging** — Structured logs (pino ali similar)
- [ ] **Performance monitoring** — Web Vitals tracking

### 17.6 Backup & Recovery

- [ ] **Database backup** — Dnevni backup SQLite db
- [ ] **Cache backup** — data/ folder backup (ai-rec, poi, faq cache)
- [ ] **User data export** — GDPR right to data portability
- [ ] **Recovery plan** — Dokumentiran restore postopek
- [ ] **Disaster recovery** — Backup geometry (offsite)

### 17.7 Email

- [ ] **SMTP konfiguriran** — Production SMTP (ne localhost)
- [ ] **Email templates** — Vsi testirani v različnih clientih
- [ ] **SPF record** — DNS konfiguriran
- [ ] **DKIM** — DNS konfiguriran
- [ ] **DMARC** — DNS konfiguriran
- [ ] **Unsubscribe link** — V vseh marketing emailih
- [ ] **Bounce handling** — Spremljanje bounce rate

### 17.8 Payment (Stripe)

- [ ] **Stripe production keys** — Live keys v env
- [ ] **Webhook endpoint** — /api/stripe/webhook
- [ ] **Webhook signature verification** — Testiran
- [ ] **Subscription plans** — Premium €149, Enterprise €499 konfigurirani
- [ ] **Trial period** — 14 dni trial (če implementirano)
- [ ] **Invoice generation** — Avtomatsko
- [ ] **Tax handling** — EU VAT (če potrebno)
- [ ] **Refund process** — Dokumentiran

### 17.9 AI Services

- [ ] **Puter API** — Token aktiven in testiran
- [ ] **z-ai-web-dev-sdk** — Fallback deluje
- [ ] **Rate limits** — Spremljanje Puter omejitev
- [ ] **Fallback chain** — Puter → z-ai-sdk → rule-based
- [ ] **Cache files** — ai-rec, poi, faq cache pravilno nastavljeni
- [ ] **AI cost tracking** — Logging stroškov

### 17.10 External Services

- [ ] **OpenStreetMap** — Overpass API deluje
- [ ] **Open-Meteo** — Weather API deluje
- [ ] **Wikipedia API** — POI descriptions delujejo
- [ ] **Booking.com affiliate** — ID konfiguriran
- [ ] **DiscoverCars affiliate** — ID konfiguriran
- [ ] **Viator affiliate** — ID konfiguriran
- [ ] **Skyscanner affiliate** — ID konfiguriran

### 17.11 Accessibility

- [ ] **WCAG 2.1 AA** — Audit opravljen
- [ ] **Keyboard navigation** — Vse funkcionalnosti dosegljive
- [ ] **Screen reader** — Testirano z NVDA/JAWS
- [ ] **Color contrast** — AA standard izpolnjen
- [ ] **Alt text** — Vse slike imajo alt
- [ ] **ARIA labels** — Pravilno implementirani
- [ ] **Focus indicators** — Vidni na vseh elementih
- [ ] **Mobile accessibility** — Touch targeti min 44px

### 17.12 Browser Compatibility

- [ ] **Chrome** (zadnje 2 verzije)
- [ ] **Firefox** (zadnje 2 verzije)
- [ ] **Safari** (zadnje 2 verzije)
- [ ] **Edge** (zadnje 2 verzije)
- [ ] **Mobile Safari** (iOS 15+)
- [ ] **Mobile Chrome** (Android 10+)

### 17.13 Final Pre-Launch

- [ ] **Staging environment** — Testirano na staging
- [ ] **Load test** — 100 concurrent users
- [ ] **Security scan** — OWASP ZAP ali podobno
- [ ] **Lighthouse audit** — Score > 90 v vseh kategorijah
- [ ] **Manual QA** — Vsi workflow-i testirani
- [ ] **Documentation** — README posodobljen
- [ ] **Support email** — support@discoverslovenia.ai aktiven
- [ ] **Social media** — Pripravljeni accounts
- [ ] **Press kit** — Logos, screenshots, description
- [ ] **Rollback plan** — Kako povrniti na prejšnjo verzijo

---

## 📅 Naslednji koraki

---

**Konec dokumenta.**

Ta Blueprint je živi dokument — posodablja se z vsako novo fazo. Vse spremembe mora potrditi product owner.
