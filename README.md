# 🇸🇮 Discover Slovenia AI

> **AI potovalni concierge za Slovenijo in jadransko regijo (SI · HR · ME · AL).**
> Načrtovanje večdnevnih potovanj iz naravnega jezika, odkrivanje 125.446 krajev,
> orkestracija čez ponudnike (transferji, nastanitve, hrana, bencin) in ena časovnica
> potovanja — s sistemom, ki vedno iskreno pokaže, kaj je dejansko živo in kaj ni.

[![CI](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql)](https://neon.tech/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

| | |
|---|---|
| **Live aplikacija** | <https://i-feel-slovenia.onrender.com> (Render, primarna) · <https://i-feel-slovenia.vercel.app> (Vercel, sekundarna) |
| **Dokumentacija** | [docs/](docs/) · [CHANGELOG.md](CHANGELOG.md) · [SECURITY.md](SECURITY.md) |
| **Stanje** | v1.73.0 · 1541/1541 testov · lint 0 · tsc 0 (`src/`; sledi git `main`) |

**Kazalo:** [Trenutno stanje](#trenutno-stanje) · [Kaj lahko uporabnik počne](#kaj-lahko-uporabnik-počne) ·
[Geografska pokritost](#geografska-pokritost) · [Journey orkestracija](#journey-orkestracija) ·
[Iskrenost podatkov](#iskrenost-podatkov) · [Providerji](#providerji) · [Booking status](#booking-status) ·
[Glavne poti](#glavne-poti) · [Tehnologija](#tehnologija) · [Hitri začetek](#hitri-začetek) ·
[Konfiguracija](#konfiguracija-env) · [Deployment](#deployment) · [Poslovni model](#poslovni-model) ·
[Dokumentacija](#dokumentacija) · [Razvojna zgodovina](#razvojna-zgodovina)

---

## Trenutno stanje

### 🔴 Danes živi (live)

| Zmožnost | Vir |
|---|---|
| AI načrtovanje potovanj v slovenščini in angleščini (multi-turn, fallback veriga, nikoli 500) | OpenRouter → Gemini → Puter → z-ai |
| Odkrivanje krajev: **125.446 krajev v 4 državah** | Foursquare OS Places (lokalna množica, Apache-2.0) |
| Živi POI sloj po viewportu zemljevida | OpenStreetMap Overpass API |
| Uradna turistična vsebina (RAG) | slovenia.info `llms.txt` (STO) |
| Transfer odkrivanje z objavljenimi realnimi cenami | KiwiTaxi partner feed (CSV) |
| Živo vreme (trenutno + dnevna napoved; po dnevih poti v MY TRIP) | Open-Meteo (brez ključa) |
| **38 kuriranih destinacij** v 4 državah + EN različice | lastni destinacijski register |
| Journey orkestracija, MY TRIP časovnica, natisljivi potrditveni dokument | lastna koda |
| Zunanje booking predaje (`/go`) in affiliate preusmeritve | 16-provider omrežje |
| Lastna tržnica (partnerji, izdelki, izkušnje) z lastnim checkoutom | lastna baza + Stripe (demo mode brez ključev) |

### 🟡 Pripravljeno, čaka na aktivacijo ponudnika

- **7 API adapterjev je kodirano-pripravljenih** (Viator, GetYourGuide, Tiqets, Booking,
  Skyscanner, Airalo, Travelpayouts) — vrata so živo preverjena, vsak adapter je priklopljen
  v **iskreno praznem stanju**, dokler poverilnica ni v env. To NI aktivna API integracija.
- **Booking arhitektura** — `JourneyBooking` stanjski model, potrditvena validacija,
  provider-agnostic registracija resolverjev — zamrznjena v stanju „activation ready".
- **Ni še aktivirano:** API booking, webhook ingest ponudnikov, živi citati/rezervacije,
  odpovedi in refundacije.

### Meje, ki jih sistem izrecno ločuje

- **Odkrivanje ≠ rezervacija** — rezultat iskanja ni potrjena rezervacija.
- **Affiliate preusmeritev ≠ inventar** — globoka povezava ni hotelska/letalska zaloga.
- **Zunanja rezervacija ≠ potrjena rezervacija** — številka rezervacije pomeni
  „Zunanja rezervacija", dokler provider ne vrne svoje.
- **Znana cena ≠ živi citat** — objavljena „od"-cena iz feeda ni potrjena cena ob poizvedbi.

---

## Kaj lahko uporabnik počne

- **AI načrtovanje potovanj** — naravni jezik (SL/EN), izboljšave v pogovoru; vhodi:
  besedilo, fotografija/screenshot (VLM), PDF, shranjene točke Google Maps.
- **Odkrivanje destinacij** — 38 kuriranih profilov s filtri po **državi, regiji, tipu,
  ceni (€–€€€) in oceni (★)**; programske podstrani (things-to-do, itinerary,
  best-time-to-visit, guide).
- **Interaktivni zemljevid** — Leaflet + OSM; FSQ sloj 125.446 krajev (nastanitve,
  restavracije, atrakcije, plaže, bencinske črpalke) in transfer rute KiwiTaxi.
- **Večdnevni itinererji z deterministično validacijo** — OSRM realne cestne razdalje/časi,
  odpiralni časi, cik-cak opozorila, 2-opt optimizacija zaporedja, „preveri tuj načrt"
  (10 pravil, 0 AI žetonov), zvočni povzetek (TTS), pogovor z načrtom.
- **Journey načrtovanje čez ponudnike** — prihod → transfer → nastanitev →
  znamenitosti (odprti viri po 4 državah) → hrana → bencin → dogodki v enem
  načrtu, ki upošteva dejanske zmogljivosti virov.
- **MY TRIP** — ena časovnica po dneh; vsaka postavka nosi realni status
  (Zunanja rezervacija / Samo informacija); **živa dnevna napoved po dnevih
  potovanja** (Open-Meteo — čip pri vsakem dnevu z realnim datumom; pretekli
  dnevi/dnevi čez ~16-dnevni horizont vira iskreno brez čipa, vir izrecno
  naveden); **pas zdravja virov** (katere vire ni bilo mogoče doseči ob
  generiranju — imena iz registra, „nič izmišljenega", ostalo potovanje
  deluje; zdravo stanje = brez pasa, ne tiska se); natisljivi
  potrditveni dokument (čipi vremena in pas zdravja se ne tiskajo).
- **Na poti (Go Mode)** — Now&Next sopotnik MED potovanjem: živa ura, naslednja
  postanka načrta, razdalja in smer do nje (GPS, premica — izrecno ne vozna),
  **živo vreme pri naslednji postanki** (Open-Meteo: trenutno stanje + današnja
  napoved, vir in čas meritve izrecno navedena), **navigacijski handoff**
  (gumb „Navigiraj": na mobilnem geo: URI → sistemski izbirnik navigacijskih
  aplikacij — Google Maps, Waze, Organic …; na namizju Google Maps URL; cilj
  so realne koordinate postanka, ne iskanje po imenu), opravljanje z enim
  klikom, prihodnji dnevi; načrt je shranjen na napravi in deluje tudi brez
  signala (vreme je edina plast, ki potrebuje signal — ob izpadu iskrena
  opomba).
- **Transferji** — odkrivanje iz objavljenega KiwiTaxi feeda z realnimi cenami;
  rezervacija prek zunanje predaje `/go`.
- **Najem avtomobilov** — odkrivanje prek affiliate sloja z zunanjim handoffom
  (ni lastni inventar).
- **Dogodki** — koledar dogodkov (slovenski viri).
- **Tržnica** — lokalni partnerji, izdelki in izkušnje z lastnim checkoutom;
  B2B portala za ponudnike (`/owner`) in administratorje (`/admin`).
- **Slovensko + angleško izkušnja** — SL privzeto, EN na jedru lijaka (`/en/…`).
- **PWA** — načrti brez povezave (aktivno Go Mode potovanje tudi na splošni offline
  strani), pameten pakirni seznam z razlogi, proračun na osebo,
  ICS/QR deljenje.

Vsaka zmožnost zgoraj je preverjena v kodi; zmožnost, ki obstaja samo v načrtu,
ni navedena.

---

## Geografska pokritost

**Odkrivanje (discovery) — 4 države (FSQ OS Places, snapshot 2025-02-06):**

| Regija | Krajev | Stanje |
|---|---:|---|
| Slovenija | 18.010 | Live |
| Hrvaška | 88.331 | Live |
| Črna gora | 10.285 | Live |
| Albanija | 8.820 | Live |
| **Skupaj** | **125.446** | Live |

OSM sloj je geografsko nevtralen (po viewportu), torej pokriva vse štiri države.

**Kurirana/provider plast — odvisna od vira (NE enako globoko povsod):**

| Plast | Pokritost |
|---|---|
| Destinacijski register (kurirani profili) | 38 destinacij v 4 državah (SI 22 · HR 8 · ME 4 · AL 4) |
| Transferji (KiwiTaxi feed) | Rute, ki se dotikajo Slovenije (iz/v SI) + regionalne rute, kjer feed dejansko vsebuje podatke; kjer jih ni (npr. Dubrovnik, Kotor, Tirana) → iskreno „ni transfernih rut" |
| Uradna vsebina STO (RAG) | samo Slovenija |
| Dogodki | samo Slovenija |
| Fallback načrtovalnik (AI odpoved) | privzeto slovenski bazen; regionalne destinacije samo na izrecno željo |
| AI supply kontekst | slovenski bbox (~4 deg²); regija samo izrecno |

Platforma **ne trdi** enake globine journey/provider pokritosti v vseh štirih državah —
plast je točno taka, kot jo dejansko nosi vir.

---

## Journey orkestracija

```
Uporabnikova želja (naravni jezik)
        ↓
Destinacija / čas / preference (38-destinacijski register, 4 države)
        ↓
Provider capability registry (16 ponudnikov, zmogljivosti po viru)
        ↓
Dejansko dostopni viri (4 viri PRODUCTION_ACTIVE; preostali iskreno prazni)
        ↓
Validacija (geo-koherenca, realni časi, cik-cak, duplikati)
        ↓
Journey produkti (transferji, nastanitve, znamenitosti, hrana, bencin, dogodki)
        ↓
Itinerer + MY TRIP (časovnica po dneh, status vsake postavke)
        ↓
Na poti / Go Mode (Now&Next na napravi: GPS razdalja/smer, opravljeni postanki)
        ↓
Zunanja predaja (/go) ali — po aktivaciji — API booking
```

Sistem uporablja **provider capability registry** (`src/lib/supply/registry.ts` +
strojno berljiva `production-matrix.ts`): ne predpostavlja, da ima vsak ponudnik
enake zmogljivosti. Cene, razpoložljivost in vrsta dostopa so klasificirane po viru
(LIVE_PRICE / FROM_PRICE / UNKNOWN / NOT_SUPPORTED), matrika in register pa sta
testovno zaklenjena proti driftu (ena resnica).

---

## Iskrenost podatkov

To je tehnično pravilo sistema, ne marketinška obljuba:

| Ločevanje | Pomen |
|---|---|
| Inventar vs affiliate | povezava do partnerja NI zaloga sob/sedežev/avtov |
| Znana cena vs „od"-cena | objavljena spodnja meja NI živi citat |
| Razpoložljivost vs unknown | brez dokaza nikoli „available" — vedno „neznano" |
| Zunanja vs potrjena rezervacija | št. rezervacije overi šele provider |
| Provider potrditev vs stanje klienta | klient nikoli ne „izmisli" potrditve |

**Manjkajoči podatki ponudnika se prikažejo kot nedosegljivi/neznani — nikoli izmišljeni.**
Vsak adapter je fail-closed: manjkajoča poverilnica = prazna plast + jasna opomba
(not-configured / partner-approval-required), nikoli napaka in nikoli lažni podatki.

---

## Providerji

| Provider | Zmožnost | Vrsta dostopa | Stanje |
|---|---|---|---|
| **FSQ** (Open Places) | odkrivanje krajev (4 države) | odprti podatki (lokalna množica) | **PRODUCTION_ACTIVE** |
| **OSM** | odkrivanje POI (viewport) | odprti podatki (žive poizvedbe) | **PRODUCTION_ACTIVE** |
| **STO** (slovenia.info) | uradna vsebina (RAG) | statična vsebina | **PRODUCTION_ACTIVE** |
| **KiwiTaxi** | transfer odkrivanje | partner CSV feed + affiliate | **PRODUCTION_ACTIVE** (rezervacija zunanja) |
| Viator | izleti/aktivnosti (API) | affiliate deep-link | CODE_READY / NOT_CONFIGURED |
| GetYourGuide | izleti/aktivnosti (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Tiqets | vstopnice (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Booking | nastanitve (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Skyscanner | leti (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED (izhodišče = produktna vrzel) |
| Airalo | eSIM (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Travelpayouts | podatkovni API | search API | CODE_READY / NOT_CONFIGURED (self-serve) |
| DiscoverCars | najem avtov | affiliate deep-link | CONTRACT_VERIFIED / BLOCKED (B4B pogodba) |
| Omio | transport | affiliate deep-link | CONTRACT_VERIFIED / PARTNER_APPROVAL_REQUIRED |
| WorldNomads | zavarovanje | affiliate only | CONTRACT_VERIFIED (brez API) |
| SafetyWing | zavarovanje | affiliate only | CONTRACT_VERIFIED (brez API) |
| Lastna tržnica | partnerji/izdelki/izkušnje | direktni booking | CODE_READY (geo sloj supply zemljevida še manjka) |

Stanja so izpeljana iz [`src/lib/supply/production-matrix.ts`](src/lib/supply/production-matrix.ts)
(strojno berljiva matrika življenjskega cikla; človeška različica s runbooki:
[docs/PROVIDER-APPLICATIONS.md](docs/PROVIDER-APPLICATIONS.md)).
Affiliate preusmeritev ≠ živi inventar — dokler ključ ni v env, adapterji strežejo
iskreno prazne sloje.

---

## Booking status

**Aktivno danes:**
- Zunanje booking predaje prek `/go/[provider]` (transferji, najem, affiliate cilji)
  — uporabnik rezervira pri ponudniku; platforma ne predstavlja, da je rezervacija
  potrjena.
- Affiliate preusmeritve (Viator, Booking, DiscoverCars, Skyscanner, …).
- Lastna tržnica: checkout izkušenj/izdelkov prek Stripe (v produkciji brez ključev
  fail-closed zaprt; demo veja samo z izrecnim okoljskim stikalom).

**Pripravljeno (arhitektura, NE predstavljati kot produkcijsko aktivno):**
- 7 provider API adapterjev (CODE_READY) — aktivacija samo z realno poverilnico,
  brez spremembe kode.
- `JourneyBooking` stanjski model + potrditvena validacija (številko rezervacije
  overi provider, ne klient).

**Ni še aktivirano:**
- API booking pri ponudnikih, webhook ingest, živi citat/rezervacija življenjski cikel,
  odpovedi/refundacije.

---

## Glavne poti

| Pot | Namen |
|---|---|
| `/` | domača stran — AI lijak |
| `/nacrtuj` | AI načrtovalnik itinererjev (jezik/slika/PDF/Maps → načrt) |
| `/potovanje` | journey načrtovalnik čez ponudnike (prihod/transfer/nastanitev/znamenitosti/hrana/bencin) + MY TRIP s potrditvenim dokumentom (postavke po dneh, skupna cena §16) in pasom zdravja virov (§22 — samo ob odpovedi vira) |
| `/na-poti` | Go Mode — Now&Next sopotnik med potovanjem (GPS razdalje, opravljeni postanki; načrt na napravi — HTML v PLANS cache, LRU-varno) |
| `/destinacije` | 38 destinacij s filtri (država/regija + čipi interesa; tip/cena/ocena v zložljivih „Več filtrov"), razvrščanjem (priporočeno/ocena/cena) in ceno (≈ €) na kartici |
| `/destinacija/[slug]` | hub destinacije + programske podstrani |
| `/zemljevid` | interaktivni zemljevid (FSQ + OSM + transfer plasti) |
| `/moja-potovanja` | shranjena potovanja, naročila, deljene poti |
| `/trznica` · `/lokali` · `/dozivetja` | tržnica lokalnih partnerjev |
| `/dogodki` | koledar dogodkov |
| `/vodici` | ADRIA vodniki (SL + EN) |
| `/konzultacija` | globoke AI konzultacije (freemium) |
| `/primerjava` | iskrena primerjava AI načrtovalcev |
| `/slovenia-pass` | digitalni potni list z značkami |
| `/vir-podatkov` | transparentnost virov (supply) |
| `/pot/[shareId]` | deljeno potovanje |
| `/go/[provider]` | zunanja booking predaja |
| `/za-ponudnike` · `/owner` · `/admin` | B2B portali |

Angleščina živi na `/en/…` (jedro lijaka: načrtuj, destinacije, zemljevid, potovanje,
na poti, vodici, info strani); ostale poti so slovenske. Polni API: `/api/journey/plan`,
`/api/journey/bookings`, `/api/itinerary`, `/api/chat`, `/api/cron/*` in ostali
endpointi v `src/app/api/`.

---

## Tehnologija

| Plast | Tehnologija |
|---|---|
| Framework | Next.js 16 (App Router, RSC + API Routes) |
| Jezik | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + shadcn/ui + Framer Motion |
| Podatki | Prisma 6 + PostgreSQL (Neon) — 30 modelov |
| Avtentikacija | NextAuth.js v4 (JWT seje, `tokenVersion` invalidacija) |
| i18n | next-intl — SL privzeti + EN whitelist |
| AI | OpenRouter → Gemini → Puter → z-ai-web-dev-sdk fallback veriga (circuit breakerji, vizija: Gemini → z-ai) |
| Zemljevid | Leaflet + OSM Overpass; FSQ OS Places lokalna množica |
| Plačila | Stripe (checkout + webhooki; fail-closed brez ključev) |
| Zagon / CI | bun · GitHub Actions (lint, typecheck, build) |
| Deploy | Render (primarni) + Vercel (sekundarni) |

---

## Hitri začetek

```bash
git clone https://github.com/markec12345678/Discover-Slovenia-AI.git
cd Discover-Slovenia-AI
bun install

cp .env.example .env
# uredi .env — OBVEZNO:
#   DATABASE_URL   (PostgreSQL, npr. brezplačni Neon; SQLite URL NE deluje)
#   ADMIN_PASSWORD (naključno, min 32 znakov)
#   NEXTAUTH_SECRET (openssl rand -base64 32)
#   CRON_SECRET    (cron endpointi so brez njega fail-closed 401)

bun run db:push          # shema v bazo (prisma generate teče v postinstall)
bun run db:seed:demo     # (opcija) demo partnerji/listingi/rezervacije
bun run dev              # http://localhost:3000
```

Podatkovni množici **FSQ (125.446 krajev)** in **KiwiTaxi transfer feed** sta
že v repozitoriju (`data/fsq-places/`, `data/kiwitaxi-routes.json`) — brez
dodatnih prenosov. Osvežitev feedov: `bun run fsq:ingest` / `bun run kiwitaxi:ingest`
(runbook v [`src/lib/supply/providers/fsq/dataset.ts`](src/lib/supply/providers/fsq/dataset.ts)).

Preverjanje:

```bash
bun test                 # 1511 testov
bun run lint             # eslint
bunx tsc --noEmit        # tipi
```

Demo računi (samo lokalni seed; fiksni gesli veljata le z
`DEV_FIXED_DEMO_PASSWORDS=1`): `tina@demo.discoverslovenia.si` /
`marko@demo.discoverslovenia.si` — geslo `demo1234`. Admin portal `/admin`
se overi z `ADMIN_PASSWORD` env (ne prek NextAuth).

---

## Konfiguracija (env)

Kategorije — celoten seznam z navodili je v [`.env.example`](.env.example):

- **Baza** — `DATABASE_URL` (PostgreSQL/Neon; shema je `postgresql`)
- **Avtentikacija / admin** — `ADMIN_PASSWORD`, `NEXTAUTH_*`
- **Cron** — `CRON_SECRET` (obvezno v produkciji; brez njega 401)
- **AI** — `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `PUTER_AUTH_TOKEN`
  (strežniški env, nikoli `NEXT_PUBLIC_`)
- **Provider poverilnice** — `VIATOR_API_KEY`, `GETYOURGUIDE_API_TOKEN`,
  `TIQETS_API_KEY`, `BOOKING_API_KEY`, `SKYSCANNER_API_KEY`,
  `AIRALO_CLIENT_ID`/`AIRALO_CLIENT_SECRET`, `TRAVELPAYOUTS_TOKEN` (vsaka manjkajoča =
  iskreno prazen sloj, brez napak)
- **Affiliate** — partner ID-ji (npr. `KIWITAXI_PAP_ID`, `BOOKING_AFFILIATE_ID`,
  `VIATOR_AFFILIATE_URL`)
- **Plačila** — `STRIPE_*` (brez ključev so produkcijski plačilni tokovi zaprti —
  fail-closed; demo veja samo z `DSA_DEMO_PAYMENTS=1`)
- **Lokalna množica** — `FSQ_PLACES_DIR` (privzeto `./data/fsq-places`)
- **Opcijsko** — SMTP, web push (VAPID), ranking uteži

> **Skrivnosti nikoli ne smejo priti v repozitorij.** Vsa poverilnica so
> strežniški env (glej [SECURITY.md](SECURITY.md)).

---

## Deployment

- **Render (primarna produkcija):** push na `main` → <https://i-feel-slovenia.onrender.com>
- **Vercel (sekundarna):** push na `main` → <https://i-feel-slovenia.vercel.app>
- **Baza:** Neon PostgreSQL (pooler, `connection_limit=1`); migracije na produkcijo:
  `./scripts/ops/migrate-deploy.sh "<neon-url>"`
- **CI (GitHub Actions):** lint + typecheck + build proti `postgres:16-alpine`
- **Cron (8 opravil, `vercel.json`, Bearer `CRON_SECRET`):**

| Urnik (UTC) | Endpoint | Opis |
|---|---|---|
| `0 6 * * *` | `/api/cron/daily-trip-push` | dnevni push opomniki |
| `0 7 * * *` | `/api/cron/recalculate-status` | preračun statusov |
| `0 8 1 * *` | `/api/cron/commission-invoices` | mesečni obračun provizij |
| `0 8 * * 1` | `/api/cron/weekly-alerts` | tedensko B2B poročilo |
| `0 9 * * *` | `/api/cron/renewal-reminders` | opomniki obnov |
| `0 10 * * *` | `/api/cron/draft-reminders` | nudge osnutkov |
| `30 7 * * 2` | `/api/cron/sto-reingest` | osvežitev STO virov |
| `30 7 * * 3` | `/api/cron/kiwitaxi-reingest` | osvežitev KT feeda |

- **Po deployu:** `bash scripts/verify/production-smoke.sh` (varni GET preverki,
  cron fail-closed, markerji verzije)
- Podrobni postopki, runbooki in okvare: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Poslovni model

- **B2C:** brezplačno — AI načrtovalec, klepet, iskanje, „vprašaj lokalca"; plačljive
  so le globoke konzultacije (freemium).
- **B2B (primarni):** provizija **12 % izključno na rezervacijah iz AI kanala**,
  **0 % na direktnih rezervacijah** (free); premium €149/mes in enterprise €499/mes
  (0 %). Mesečni obračun + računi (cron) + kartično plačilo (Stripe).
- **Affiliate:** provizije prek `/go` omrežja (Viator, Booking, DiscoverCars,
  Skyscanner, WorldNomads, SafetyWing, …).
- **Beta:** vsi paketi brezplačni do 30 lokalov.

---

## Dokumentacija

**Produkt**
[PRODUCT-BLUEPRINT.md](PRODUCT-BLUEPRINT.md) ·
[TECHNICAL-SPECIFICATION.md](TECHNICAL-SPECIFICATION.md) ·
[docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md) ·
[docs/COMPETITIVE-ANALYSIS-MINDTRIP.md](docs/COMPETITIVE-ANALYSIS-MINDTRIP.md) ·
[docs/OUTREACH-TOOLKIT.md](docs/OUTREACH-TOOLKIT.md) ·
[docs/PILOT-TEST-PROTOCOL.md](docs/PILOT-TEST-PROTOCOL.md) ·
[docs/PILOT-VALIDATION-GATE.md](docs/PILOT-VALIDATION-GATE.md)

**Arhitektura**
[docs/ADR.md](docs/ADR.md) ·
[docs/DATA-FLOW.md](docs/DATA-FLOW.md) ·
[docs/DATA-LAYERS-RAG.md](docs/DATA-LAYERS-RAG.md) ·
[docs/ANALYTICS-EVENTS.md](docs/ANALYTICS-EVENTS.md) ·
[docs/FEATURE-FLAGS.md](docs/FEATURE-FLAGS.md)

**Providerji in journey**
[docs/TASK-53-ALL-PROVIDERS-READY.md](docs/TASK-53-ALL-PROVIDERS-READY.md) ·
[docs/PROVIDER-APPLICATIONS.md](docs/PROVIDER-APPLICATIONS.md) ·
[docs/TASK-58-FULL-PROVIDER-JOURNEY.md](docs/TASK-58-FULL-PROVIDER-JOURNEY.md) ·
[docs/TASK-58-JOURNEY-AUDIT.md](docs/TASK-58-JOURNEY-AUDIT.md) ·
[docs/TASK-58-MY-TRIP-ACCEPTANCE.md](docs/TASK-58-MY-TRIP-ACCEPTANCE.md) ·
[docs/TRAVEL-SUPPLY-MAP-AUDIT.md](docs/TRAVEL-SUPPLY-MAP-AUDIT.md)

**Operacije**
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) ·
[docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md) ·
[docs/INCIDENT-PLAYBOOK.md](docs/INCIDENT-PLAYBOOK.md) ·
[docs/OBSERVABILITY-PLAN.md](docs/OBSERVABILITY-PLAN.md) ·
[docs/MIGRATION-STRATEGY.md](docs/MIGRATION-STRATEGY.md) ·
[docs/SEED-STRATEGY.md](docs/SEED-STRATEGY.md) ·
[docs/VERSIONING.md](docs/VERSIONING.md)

**Varnost**
[SECURITY.md](SECURITY.md) ·
[docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) ·
[docs/ACCESSIBILITY-REVIEW.md](docs/ACCESSIBILITY-REVIEW.md)

**Validacija / auditi**
[docs/TASK-49-PRODUCT-READINESS-AUDIT.md](docs/TASK-49-PRODUCT-READINESS-AUDIT.md) ·
[docs/TASK-51-GEOGRAPHIC-COHERENCE.md](docs/TASK-51-GEOGRAPHIC-COHERENCE.md) ·
[docs/TASK-56-P2-HARDENING.md](docs/TASK-56-P2-HARDENING.md) ·
[CHANGELOG.md](CHANGELOG.md)

Varnostni mechanismi v kratkem: vsa vsebina skozi moderacijo
(draft → pending → published, re-moderacija ob spremembi), `tokenVersion`
invalidacija sej ob resetu gesla, lastniški dostopi (IDOR/BOLA), Stripe webhook
podpis + dedup, prompt-injection ovojnica (`SYSTEM_DATA_GUARD`), fail-closed cron,
rate limiting na občutljivih poteh.

---

## Razvojna zgodovina

Podrobna zgodovina implementacije (naloge, auditi, odločitve, živi dokazi) se vodi
ločeno od tega README-ja: [CHANGELOG.md](CHANGELOG.md) (vse verzije po Keep a
Changelog), [docs/](docs/) (dokumentacija nalog in auditov) ter git zgodovina.
Pravila za razvoj in prispevke: [AGENTS.md](AGENTS.md) · [CONTRIBUTING.md](CONTRIBUTING.md).
Trenutna verzija: **1.73.0**.

---

## License

MIT — see [LICENSE](LICENSE)
