# Risk Register

> **Status:** Living document — posodablja se mesečno
> **Datum:** 2025-01-15
> **Namen:** Identifikacija in mitigacija tveganj pred in po lansiranju
> **Pravilo:** Vsako tveganje mora imeti lastnika in datum pregleda

---

## 📊 Risk Matrix

```
         ┌──────────────────────────────────────────┐
         │           PROBABILITY                     │
         │  Low (1)  Medium (2)  High (3)           │
    High ├──────────┬───────────┬────────────┤
   (3)   │   3      │    6      │    9        │ ⚠️ Critical
         │          │           │             │
IMPACT   ├──────────┼───────────┼────────────┤
 Medium  │   2      │    4      │    6        │ 🟡 Moderate
   (2)   │          │           │             │
         ├──────────┼───────────┼────────────┤
    Low  │   1      │    2      │    3        │ 🟢 Low
   (1)   │          │           │             │
         └──────────┴───────────┴────────────┘
```

---

## 📋 Tveganja (po prioriteta)

### 🔴 Critical Risks (Score 6-9)

#### R-001 — GLM API izpad ali rate limit

| Polje | Vrednost |
|-------|---------|
| **ID** | R-001 |
| **Kategorija** | Technical |
| **Opis** | Puter API (GLM) postane nedosegljiv ali preseže rate limit |
| **Impact** | High (3) — AI funkcije ne delujejo |
| **Probability** | Medium (2) — zgodaj se pokažejo omejitve |
| **Score** | **6** ⚠️ |
| **Lastnik** | Engineering Team |
| **Mitigacija** | 3-tier fallback chain (Puter → z-ai-sdk → rule-based) — ADR-006. Cache-first strategija zmanjšuje število klicev — ADR-011. |
| **Contingency** | Preklop na direct GLM API (plačljiv) ali OpenAI GPT-4o-mini ($0.015/1K tokens). Budget: €200/mes za AI |
| **Datum pregleda** | Mesečno |
| **Status** | 🟡 Aktiven |

---

#### R-002 — premalo ponudnikov za monetizacijo

| Polje | Vrednost |
|-------|---------|
| **ID** | R-002 |
| **Kategorija** | Business |
| **Opis** | Ne dosežemo 30 lokalov v razumnem času (3-6 mesecev) |
| **Impact** | High (3) — brez monetizacije, brez prihodka |
| **Probability** | Medium (2) — odvisno od outreach |
| **Score** | **6** ⚠️ |
| **Lastnik** | Product Team |
| **Mitigacija** | Aktivni B2B outreach (email, telefon, srečanja). Demo dashboard za srečanja. Brezplačni prvi mesec. Partnerstvo s turističnimi organizacijami. |
| **Contingency** | Podaljšaj beta brezplačno za vse dokler ne dosežemo 30. Dodatni incentive (npr. brezplačno 6 mesecev za prvih 50). |
| **Datum pregleda** | Tedensko |
| **Status** | 🟡 Aktiven |

---

#### R-003 — AI stroški narastejo pri skaliranju

| Polje | Vrednost |
|-------|---------|
| **ID** | R-003 |
| **Kategorija** | Financial |
| **Opis** | Pri 10K+ uporabnikov/dan AI stroški presežejo budget |
| **Impact** | High (3) — zmanjšana marža |
| **Probability** | Medium (2) — cache ne zmore vsega |
| **Score** | **6** ⚠️ |
| **Lastnik** | Engineering Team |
| **Mitigacija** | Cache-first strategija (24h-90d TTL) — ADR-011. Rate limiting (10/hour/IP za itinerary). Permanent cache za POI. Batch processing za insights. |
| **Contingency** | Preklop na cenejši model (GPT-4o-mini). Povečaj cache TTL. Omeji AI funkcije za free uporabnike. |
| **Datum pregleda** | Mesečno |
| **Status** | 🟡 Aktiven |

---

#### R-004 — Stripe izpad ali webhook napake

| Polje | Vrednost |
|-------|---------|
| **ID** | R-004 |
| **Kategorija** | Technical |
| **Opis** | Stripe API nedosegljiv ali webhook-i ne pridejo do nas |
| **Impact** | High (3) — providerji ne morejo plačati |
| **Probability** | Low (1) — Stripe je zelo zanesljiv |
| **Score** | **3** 🟡 |
| **Lastnik** | Engineering Team |
| **Mitigacija** | Webhook signature verification. Retry logika (3x). Logging vseh webhook eventov. Stripe dashboard monitoring. |
| **Contingency** | Ročna obravnava v Stripe dashboard. Email podpori. Grace period za providerje (3 dni). |
| **Datum pregleda** | Tedensko |
| **Status** | 🟡 Aktiven |

---

### 🟡 Moderate Risks (Score 4-6)

#### R-005 — Zlonamerni vnosi (spam, neprimerna vsebina)

| Polje | Vrednost |
|-------|---------|
| **ID** | R-005 |
| **Kategorija** | Trust & Safety |
| **Opis** | Providerji oddajajo spam, napačne podatke ali neprimerno vsebino |
| **Impact** | Medium (2) — slab ugled platforme |
| **Probability** | Medium (2) — konkurenca ali trol-i |
| **Score** | **4** 🟡 |
| **Lastnik** | Moderator Team |
| **Mitigacija** | Admin approval required (ADR-010). AI spam detection. Email verification. Rate limiting na /api/leads. Report button za uporabnike. |
| **Contingency** | Hitra moderacija (24h SLA). Ban sistem za ponavljajoče se kršitelje. |
| **Datum pregleda** | Tedensko |
| **Status** | 🟡 Aktiven |

---

#### R-006 — Konkurenca (Alma, Booking, Tripadvisor)

| Polje | Vrednost |
|-------|---------|
| **ID** | R-006 |
| **Kategorija** | Business |
| **Opis** | Slovenska turistična organizacija (Alma) ali Booking izboljšajo AI funkcije |
| **Impact** | High (3) — izguba uporabnikov |
| **Probability** | Low (1) — veliki igralci so počasni |
| **Score** | **3** 🟡 |
| **Lastnik** | Product Team |
| **Mitigacija** | Diferenciacija: multi-turn + B2B + marketplace (Alma nima). Hitrost inovacije (majhna ekipa = hitri. Specializacija za Slovenijo. |
| **Contingency** | Poudari B2B (pavšalni oglas) kjer veliki igralci ne tekmujejo. Partnerstvo s STB. |
| **Datum pregleda** | Četrtletno |
| **Status** | 🟡 Aktiven |

---

#### R-007 — SEO ne prinaša prometa

| Polje | Vrednost |
|-------|---------|
| **ID** | R-007 |
| **Kategorija** | Growth |
| **Opis** | Google ne indeksira ali ne rankira dovolj visoko |
| **Impact** | High (3) — brez organskega prometa |
| **Probability** | Medium (2) — SEO potrebuje čas |
| **Score** | **6** ⚠️ |
| **Lastnik** | Marketing Team |
| **Mitigacija** | 322 programmatic SEO landing pages. hreflang (4 jeziki). JSON-LD structured data. Sitemap submission v GSC. Backlink outreach (Reddit, guest posts). |
| **Contingency** | Plačljivi oglasi (Google Ads). Social media distribucija. Content marketing (blog). |
| **Datum pregleda** | Mesečno |
| **Status** | 🟡 Aktiven |

---

#### R-008 — GDPR / pravna neskladnost

| Polje | Vrednost |
|-------|---------|
| **ID** | R-008 |
| **Kategorija** | Legal |
| **Opis** | GDPR kršitev (piškotki, podatki, pravica do pozabe) |
| **Impact** | High (3) — denarne kazni, ugled |
| **Probability** | Low (1) — implementirano |
| **Score** | **3** 🟡 |
| **Lastnik** | Legal/Compliance |
| **Mitigacija** | Politika zasebnosti posodobljena. Cookie banner. Affiliate disclosure. Right to be forgotten API. DPA za premium providerje. |
| **Contingency** | Pravni svetovanje. Hitra odstranitev podatkov na zahtevo. |
| **Datum pregleda** | Četrtletno |
| **Status** | 🟢 Mitigirano |

---

#### R-009 — Performance problemi pri skaliranju

| Polje | Vrednost |
|-------|---------|
| **ID** | R-009 |
| **Kategorija** | Technical |
| **Opis** | Pri 10K+ uporabnikih aplikacija postane počasna |
| **Impact** | Medium (2) — slab UX, izguba uporabnikov |
| **Probability** | Medium (2) — brez optimizacije |
| **Score** | **4** 🟡 |
| **Lastnik** | Engineering Team |
| **Mitigacija** | Edge CDN (Vercel). Image optimization (next/image). Code splitting. Database indexing. Caching (24h). Rate limiting. |
| **Contingency** | Premik na Turso (edge DB). Redis za cache. Read replicas. |
| **Datum pregleda** | Mesečno |
| **Status** | 🟡 Aktiven |

---

#### R-010 — DB poškodba ali izguba podatkov

| Polje | Vrednost |
|-------|---------|
| **ID** | R-010 |
| **Kategorija** | Technical |
| **Opis** | SQLite/Turso DB poškodovana ali izgubljena |
| **Impact** | High (3) — izguba vseh podatkov |
| **Probability** | Low (1) — Turso je repliciran |
| **Score** | **3** 🟡 |
| **Lastnik** | Engineering Team |
| **Mitigacija** | Dnevni backup SQLite db. Turso avtomatska replikacija. `data/` folder backup (cache, leads). Recovery plan dokumentiran. |
| **Contingency** | Restore iz zadnjega backup-a. Turso point-in-time recovery. |
| **Datum pregleda** | Tedensko |
| **Status** | 🟢 Mitigirano |

---

### 🟢 Low Risks (Score 1-3)

#### R-011 — Affiliate program spremeni pogoje

| Polje | Vrednost |
|-------|---------|
| **ID** | R-011 |
| **Kategorija** | Financial |
| **Opis** | Booking/Viator znižajo commission ali prekinejo program |
| **Impact** | Medium (2) — zmanjšan prihodek |
| **Probability** | Low (1) — stabilni programi |
| **Score** | **2** 🟢 |
| **Lastnik** | Business Team |
| **Mitigacija** | Diversifikacija (4 affiliate partnerji). Pavšalni oglas kot primarni prihodek. |
| **Contingency** | Preklop na alternativne affiliate programe (Expedia, GetYourGuide). |
| **Datum pregleda** | Četrtletno |
| **Status** | 🟢 Low |

---

#### R-012 — Email dostavljivost (SPF/DKIM)

| Polje | Vrednost |
|-------|---------|
| **ID** | R-012 |
| **Kategorija** | Technical |
| **Opis** | Email-i končajo v spam mapi |
| **Impact** | Medium (2) — providerji ne dobijo obvestil |
| **Probability** | Low (1) — SPF/DKIM konfigurirana |
| **Score** | **2** 🟢 |
| **Lastnik** | Engineering Team |
| **Mitigacija** | SPF, DKIM, DMARC DNS zapisi. Testiranje z Mail-Tester. Brezplačni SMTP (začetek), polni SMTP kasneje. |
| **Contingency** | Preklop na SendGrid/Resend (boljša dostavljivost). |
| **Datum pregleda** | Mesečno |
| **Status** | 🟢 Mitigirano |

---

#### R-013 — Browser kompatibilnost

| Polje | Vrednost |
|-------|---------|
| **ID** | R-013 |
| **Kategorija** | Technical |
| **Opis** | Aplikacija ne deluje v starejših brskalnikih |
| **Impact** | Low (1) — majhen % uporabnikov |
| **Probability** | Low (1) — modern stack |
| **Score** | **1** 🟢 |
| **Lastnik** | Engineering Team |
| **Mitigacija** | Testiranje v Chrome, Firefox, Safari, Edge (zadnje 2 verzije). Polyfills za starejše. |
| **Contingency** | "Vaš brskalnik ni podprt" banner z linkom za upgrade. |
| **Datum pregleda** | Ob vsakem release |
| **Status** | 🟢 Low |

---

#### R-014 — Osebne podatke uporabnikov kompromitirani

| Polje | Vrednost |
|-------|---------|
| **ID** | R-014 |
| **Kategorija** | Security |
| **Opis** |SQL injection, XSS ali druga ranljivost izkoriščena |
| **Impact** | High (3) — GDPR kršitev, ugled |
| **Probability** | Low (1) — Prisma + React auto-escape |
| **Score** | **3** 🟡 |
| **Lastnik** | Engineering Team |
| **Mitigacija** | Prisma parameterized queries. React auto-escaping. CSP headers. Rate limiting. Input validation (Zod). Dependency audit. |
| **Contingency** | Incident response plan. Obvesti uporabnike v 72h (GDPR). Security audit. |
| **Datum pregleda** | Četrtletno |
| **Status** | 🟢 Mitigirano |

---

#### R-015 — Cold start na serverless

| Polje | Vrednost |
|-------|---------|
| **ID** | R-015 |
| **Kategorija** | Performance |
| **Opis** | Prvi request po idle času je počasen (cold start) |
| **Impact** | Low (1) — samo prvi request |
| **Probability** | Medium (2) — Vercel serverless |
| **Score** | **2** 🟢 |
| **Lastnik** | Engineering Team |
| **Mitigacija** | Edge runtime za hitre endpointe. Cache za statične strani. Warm-up cron job. |
| **Contingency** | Preklop na Vercel Pro (več allociranih instanc). |
| **Datum pregleda** | Mesečno |
| **Status** | 🟢 Low |

---

## 📈 Risk Trend Analysis

| Risk ID | Trenutni score | Trend | Napoved |
|---------|---------------|-------|---------|
| R-001 (GLM izpad) | 6 | ➡️ Stabilen | Z caching stabilen |
| R-002 (Premalo providerjev) | 6 | ⬇️ Izboljšuje se | Z outreach se zmanjšuje |
| R-003 (AI stroški) | 6 | ⬇️ Izboljšuje se | Cache zmanjšuje |
| R-007 (SEO promet) | 6 | ➡️ Stabilen | Čas (3-6 mesecev) |
| R-005 (Spam) | 4 | ➡️ Stabilen | Z moderacijo pod kontrolo |
| R-009 (Performance) | 4 | ⬇️ Izboljšuje se | Z optimizacijo |

---

## 🔄 Risk Review proces

### Mesečni pregled

1. Pregled vseh tveganj s statusom 🟡 Aktiven
2. Posodobitev probability in impact ocen
3. Preverjanje mitigacije (ali deluje?)
4. Identifikacija novih tveganj
5. Posodobitev Risk Register dokumenta

### Četrtletni pregled

1. Pregled vseh tveganj (tudi 🟢 Low)
2. Dodajanje novih tveganj iz retrospektiv
3. Re-evalvacija mitigacije strategij
4. Posodobitev contingency načrtov

### Trigger-based pregled

- **Incident**: Kadar se tveganje uresniči → takojšen pregled
- **New feature**: Pred dodajanjem nove funkcije → identifikacija novih tveganj
- **Scale milestone**: Pri 1K, 5K, 10K uporabnikih → re-evalvacija

---

**Konec Risk Register.**
