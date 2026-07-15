# Discover Slovenia AI — Product Blueprint

> **Status:** DRAFT v1.0
> **Datum:** 2025-01-15
> **Avtor:** Product Team
> **Namen:** Strateški dokument ki vodi vso nadaljnjo implementacijo
> **Pravilo:** Nobena koda ne gre v produkcijo brez skladnosti s tem dokumentom

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

**Konec dokumenta.**

Ta Blueprint je živi dokument — posodablja se z vsako novo fazo. Vse spremembe mora potrditi product owner.
