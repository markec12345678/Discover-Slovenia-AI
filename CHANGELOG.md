# Changelog

Vse pomembne spremembe projekta Discover Slovenia AI (prej I Feel Slovenia).

Format temelji na [Keep a Changelog](https://keepachangelog.com/slo/1.1.0/),
in projekt sledi [Semantic Versioning](https://semver.org/lang/sl/).

---

## [1.3.0] — 2026-09-11

### Spremenjeno (Changed)

- **Newsletter → PostgreSQL (P6)**: prijave se shranjujejo v nov model
  `NewsletterSubscriber` (prej `data/newsletter.json` — na Vercelu efemeren,
  podatki so izginevali ob vsakem deployu). Pisalca (`/api/newsletter/subscribe`,
  `/api/email-itinerary`) in bralnik (`/api/admin/leads-dashboard`) so
  preseljeni na DB; `GET /api/newsletter/subscribe` je zdaj admin-zaščiten
  (`x-admin-password`; prej javno izpostavljeno število naročnikov).

### Dokumentacija (P6 — sinhronizacija repozitorija z realnostjo)

- **README**: odstranjena trditev »VLM-verified slikami« (92/105 slik je
  Unsplash), »prva platforma« → »med prvimi«, »najpoštenejši model na trgu«
  umaknjen; Database = Neon PostgreSQL v vseh sekcijah (stack, quickstart,
  env, arhitektura); namišljeni model `AbSubscription` zamenjan z realnim
  `NewsletterSubscriber` (25 modelov); demo računi z izrecnim opozorilom,
  da v pilotni bazi še obstajajo in da gesla rotiraj pred pravim pilotom;
  Docker sekcion označen kot zastarel (SQLite era).
- **.env.example**: `DATABASE_URL` privzeto PostgreSQL (Neon) namesto SQLite
  `file:` (ki pri `postgresql` shemi ne deluje); opozorilo o narekovajih za
  vrednosti z `&`.
- **CONTRIBUTING**: repo URL-ji (stare ime `i-feel-slovenia`) in kontaktni
  email posodobljeni; obljuba o neobstoječi »Contributors sekciji« umaknjena.
- **ADR-016** (nov): PostgreSQL/Neon za dev in produkcijo — nadomešča
  ADR-003 (SQLite/Turso), ki je označen kot nadomeščen.
- **TECHNICAL-SPECIFICATION / DATA-FLOW / SECURITY-REVIEW / SECURITY.md**:
  SQLite/Turso → Neon; rate-limit tabela zdaj odseva dejansko implementirane
  limite; plan limiti poplavljeni (free=1/premium=5/enterprise=∞ normalno;
  3/8 med beta).
- **OUTREACH-TOOLKIT**: »Min 3, VLM-verified« → »Min 1 (priporočamo 3+),
  lastniške fotografije«.
- **PRODUCT-BLUEPRINT**: dodan izrecen drift banner (zamrznjen v1.0 opisuje
  načrt, ne trenutnega stanja).
- **6 ops dokumentov** (BACKUP-RECOVERY, MIGRATION-STRATEGY, INCIDENT-PLAYBOOK,
  OBSERVABILITY-PLAN, SEED-STRATEGY, RISK-REGISTER): drift opozorila —
  sqlite3/Turso postopki so arhivski, produkcija je Neon.
- **GitHub About**: iz opisa repozitorija odstranjena trditev »VLM Verified«.

---

## [1.2.2] — 2026-09-11

### Popravljeno (Fixed) — P4-9 iskreni polish

- **Ocene samo ob pravih mnenjih**: prikaz ratingov pogojen na
  `reviewCount > 0` na 7 mestih (listings, modal, marketplace); iz JSON-LD
  (`aggregateRating` z izmišljenim številom mnenj) odstranjen; destinacijske
  ocene so izrecno označene kot **uredniške ocene**.
- **VLM badge odstranjen** s homepage in footera (trditev o »preverjenih
  slikah« ni držala — Unsplash v seedih); lažni social linki (`href="#"`)
  iz footera odstranjeni.
- **Žive številke**: `/za-ponudnike` prikazuje dejansko število lokalov iz
  baze (ne »25 partnerjev«); neobstoječa featureja (QR Karta, Quality
  Coach) zamenjana z realnima (Povpraševanja gostov, Atribucija
  rezervacij); paketi brez neizvedenih meja; »prva AI platforma« →
  »med prvimi«.
- **UX frikciji**: booking prikaz »čas po dogovoru« namesto »ob 00:00«
  (date-only serializacija) + mikrokopija; onboarding zahteva 1 (ne 3)
  fotografije — client in server usklajeno.
- **Higiena**: 12 neuporabljenih odvisnosti odstranjenih, 5 mrtvih API rut
  (−495 LOC), `tailwind.config.ts` (TW4 CSS-first) izbrisan.

---

## [1.2.1] — 2026-09-10

### Popravljeno (Fixed)

- **CI/CD (P4-7)**: Build job sedaj testira proti `postgres:16-alpine` service
  containerju. CI #65 je padel pri koraku "Prepare Prisma client & test DB" —
  `DATABASE_URL` je bil še SQLite (`file:./db/ci-test.db`), `schema.prisma`
  pa je od Faze 4f `postgresql` → Prisma zavrne `file:` URL. CI #66 zelen.
- **Mešanje jezikov na /de, /en, /it (P4-8)**: te strani so bile delno
  prevedene (navigacija/noga v tujem jeziku, vsebina hardcoded slovenščina).
  Javno je zdaj **samo slovenščina**: stari URL-ji se trajno (308) preusmerijo
  na slovensko pot (`src/proxy.ts`), hreflang alternati so umaknjeni
  (`src/components/seo.tsx`), jezikovni preklopnik se skrije
  (`src/components/language-switcher.tsx`). Infrastruktura (next-intl,
  sporočila, preklopnik) ostaja — ko bodo celoviti prevodi (roadmap C5), se
  jeziki dodajo nazaj v `src/i18n/routing.ts`.

### Spremenjeno (Changed)

- **Iskrena komunikacija (P4-8)**: odstranjene demo/marketing številke brez
  izmerjene podlage — »12.000+ obiskovalcev/mes«, »32 % konverzija v kontakt«,
  »+18 % rast mesečno«, »5.2★ povprečna ocena«, »50+ lokalov« — iz
  `pitch-deck.tsx` in `join-us.tsx`. Namesto izmišljenih pričevanj (Ana K.,
  Marko P., Tina R.) se zdaj oddaja razdelek **Naša obljuba**: samo mnenja z
  dokazano rezervacijo, transparentna provizija (0 % / 12 %), znak
  »Preverjen partner« kot eksplicitna odločitev ekipe.

### Dokumentacija (Docs)

- **SECURITY.md**: revizijski pregled 2026-09-10 — vsi commiti (main +
  master) brez skrivnosti (neodvisno potrjeno čiščenje iz v1.1.0);
  `PUTER_AUTH_TOKEN` ni nastavljen v Vercel env (preverjeno prek APIja) —
  ob ponovni aktivaciji Puter AI generiraj NOV žeton; nov checklist: odstrani
  neuporabljeni legacy `VITE_GEMINI_API_KEY` iz Vercel env. Razdelek "Podatki"
  posodobljen (Neon PostgreSQL, leadi v DB od P4-2).
- **docs/DEPLOYMENT.md**: sinhroniziran s trenutno arhitekturo — Pot B
  (Vercel + Neon) označena kot IZVEDENA, demo SQLite mehanizem (Faza 4e) kot
  zgodovinski/izklopljen, Pot A (Docker) opozorilo o neskladju s postgres
  shemo (zahteva postgres service ali reverz providerja pred uporabo).
- **README.md**: i18n status (javno samo sl), CI opis (postgres service
  container), odstranjena zastarela trditev o demo SQLite bazi na Vercelu.

---

## [1.1.0] — 2026-09-08

### Varnost (Security)

- **PII zaščita**: `/api/orders/[n]` in `/api/bookings/[n]` zahtevata `?email=` ujemanje s kupcem/gostom (prej popolnoma odprta, ugibljivi ID-ji) → 401/404
- **Strežniška validacija cen**: `/api/bookings` prebere ceno, ime izkušnje in kontakt ponudnika iz baze (prej je lahko client rezerviral za €0 s ponarejenim ponudnikom)
- **Rate limiting** (in-memory drseče okno, per-IP) na 16+ javnih poteh: AI endpointi (chat, itinerary, refine, smart-search, translate, ai-story, poi-describe), e-pošta (itinerary, welcome), newsletter, leads, checkout, bookings in admin/verify (brute-force zaščita, 429 po 10 poizkusih)
- **Cron avtentikacija**: vsi 3 cron endpointi zahtevajo CRON_SECRET (Bearer) ali admin geslo — timing-safe primerjava, fail-closed v produkciji
- **owner/auto-tag** zahteva NextAuth sejo (prej odprt AI endpoint)
- **JSON-LD XSS**: `safeJsonLd()` escapira `</script>` v vseh structured-data izpisih
- **E-poštna HTML injekcija**: vsi uporabniški vnosi v e-poštnih predlogah escapani (`escapeHtml`)
- **Varnostni headerji**: CSP, HSTS, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy
- **Timing-safe primerjave** za admin geslo in cron avtentikacijo
- **Čiščenje git zgodovine** (git filter-repo): `.env` (PUTER_AUTH_TOKEN, admin geslo), `db/`, `agent-ctx/`, `tool-results/`, `upload/`, `worklog.md`, `data/newsletter.json`, `aimojalandingpage/` in sandbox ostanki odstranjeni iz VSEH commitov; veja `main` zaščitena proti force-push in brisanju
- **Nove skrivnosti**: NEXTAUTH_SECRET, CRON_SECRET, novo ADMIN_PASSWORD (lokalni `.env`, nikoli v repu) — UPORABNIK MORA ROTIRATI PUTER_AUTH_TOKEN

### Popravljeno (Fixed)

- **sendEmail() hrošč**: admin approve/reject sta klicala e-pošto s pozicijskimi argumenti — sporočila o odobritvi/zavrnitvi nikoli niso bila poslana; popravljen objektni klic
- **trip-timeline crash**: `dayCost is not defined` — runtime napaka ob vsakem generiranem itinererju
- **PageView model manjkal** v Prisma schemi — track-funnel, track-pageview, admin/leads-dashboard in admin/indexing so se sesuli s 500
- **Vseh 53 TypeScript napak odpravljenih** (`tsc --noEmit` → 0 napak); `typescript.ignoreBuildErrors` odstranjen
- **CI workflow pokvarjen** (`branches: ain, develop]`) — CI nikoli ni tekel; popravljen trigger + dodana priprava Prisma klienta/testne baze; prvi zeleni zagon
- **`/api/itinerary/bookings`**: vrne samo objavljene vsebine (prej draft/pending lokalci z kontakti javno vidni)
- **Nerodljive številke** rezervacij/naročil (prava entropija namesto predvidljivih zaporedij)

### Spremenjeno (Changed)

- Repozitorij: github.com/markec12345678/Discover-Slovenia-AI (prej i-feel-slovenia) — 12 tem, zaščitena veja `main`, README CI status značka
- next.config.ts: polno tipiziran build (brez ignoreBuildErrors)

### Odstranjeno (Removed)

- **3.355 vrstic mrtve kode** — 10 neuporabljenih komponent: booking-modal, cart-drawer, checkout-modal, intl-provider, newsletter-capture, qr-partner-card, quality-coach, recommendation-card, recommendation-reasons, wow/trip-timeline
- Z.ai sandbox ostanki: Caddyfile, .zscripts/, examples/websocket, mini-services/

---

## [1.2.0] — 2026-09-10

### Dodano

#### Poslovni model — pivot na provizijo (kot Booking.com)

- **Faza 3c — pivot "ponudniki plačajo"**: turist plača polno ceno neposredno ponudniku;
  platforma obračuna provizijo IZKLJUČNO za rezervacije iz AI kanala
  (`Booking.source = "consultation"`). Rezervacije od drugod ostanejo brez provizije
- **Faza 3d — B2B sinteza**: owner analytics "vrednost AI kanala" (prikazi,
  priporočila, klikovne stopnje) + prenovljena stran `/za-ponudnike`
- **Faza 3e — tedensko poročilo "Vrednost AI kanala"** (cron `weekly-alerts`, B2B flywheel)

#### Provizijski obračun (Faza 4a–4c)

- **4a — provizijski model**: `CommissionInvoice` (idempotentna izdaja na
  koledarski mesec, snapshot stopnje), `/api/owner/commissions` (GET predogled +
  zgodovina, POST `generate` / `mark_paid`), nov zavihek **Provizije** v owner
  dashboardu (KPI, predogled tekočega meseca, zgodovina računov)
- **4b — samodejni mesečni obračun**: cron `/api/cron/commission-invoices`
  (vsak 1. v mesecu, `vercel.json`), e-poštni račun lastniku, deljena logika v
  `src/lib/commissions.ts` (12 % free partnerji / 0 % premium+enterprise)
- **4c — PDF izpis provizijskega računa**: `/api/owner/commissions/invoice-pdf`
  (pdf-lib, vključeni LiberationSans fonti — šumniki delujejo) + realistični
  demo seed (`scripts/seed-demo.ts`: 4 partnerji, 10 listingov, 10 izkušenj,
  6 izdelkov, 5 rezervacij)

#### Faza 5 — kartično plačilo provizijskih računov

- `/api/owner/commissions/checkout` — Stripe Checkout (enkratno plačilo, EUR,
  znesek strežno preverjen iz računa; demo način brez ključev vrne 503 z razlago)
- Webhook `checkout.session.completed` razširjen z `type=commission_invoice`:
  idempotentno označi račun kot plačan (`paidAt`, `stripePaymentId`), audit log,
  potrdilo o plačilu po e-pošti
- Owner dashboard: gumb **"Plačaj s kartico"** (viden samo, kadar Stripe ni v
  demo načinu) + obdelava povratka s Stripa (`?commission=success|cancelled`)

#### Vsebina in engagement (Faza 0–2)

- Faza 0: povezan obstoječi engagement loop, odstranjen lažni UX
- Faza 1: dogodki v načrtih potovanj, AI pakirni seznam, glasovanje skupine,
  PDF izvoz itinererja
- Faza 2: UGC recenzije in javna galerija skupnosti; **"Vprašaj lokalca"**
  (grounded AI Q&A nad bazo lokalov); web push obvestila (VAPID)
- Realne rezervacije izkušenj + potrditvene e-pošte; obnovljen nakupni proces
  tržnice

#### Monetizacija in retencija (Faza 3a–3b)

- Faza 3a: konverzijska pot na 322 SEO straneh + affiliate monetizacija
  (Booking.com, DiscoverCars, Viator, Skyscanner)
- Faza 3b: dnevni push opomniki za shranjena potovanja (cron `daily-trip-push`)
- Faza 3b-2: plačljive konzultacije "Vprašaj lokalca" (freemium B2C) + e-poštna
  dostava s privatno povezavo (`/konzultacija/[token]`)

#### Infrastruktura (Faza 4d–4e)

- **4d — produkcijska namestitev**: Docker + Compose (app + ločen cron vsebnik,
  imenovan volumen, `docker/crontab.template`), `docs/DEPLOYMENT.md`
  (odločitvena analiza Pot A/B), `src/proxy.ts` z varovalko proti neskončni
  standalone zanki (Next.js 16 rewrite loop — 4763 povratnih povezav na 1
  zahtevo prej), `src/lib/sponsorships.ts`
- **4e — Vercel demo runtime DB**: build-time demo SQLite baza
  (`scripts/build-demo-db.sh`: `prisma db push` + seed BREZ super_admin računa —
  varen za javni demo), `src/instrumentation.ts` ob zagonu kopira bazo v
  zapisljivi `/tmp` in preusmeri `DATABASE_URL` (samo na Vercelu, samo za
  `file:` pote, izklop z `DSA_DISABLE_DEMO_DB=1`), `outputFileTracingIncludes`
  vključi `db/` v serverless bundle — vse DB poti (npr. `/api/products`) na
  Vercelu zdaj delujejo; pisanje je per-instanca (demo omejitev, dokumentirano)

### Popravljeno

- **Vercel build padci (30/30 od 15. 7. 2026)**: `prisma generate` zdaj v build
  skripti, `postinstall` hooku IN `next.config.ts` (Vercel poganja lastni build —
  prej klient ni bil generiran → `Module not found: .prisma/client/index-browser`)
- Vercel projekt: `installCommand: bun install` (prej `npm install` → exit 1)
- Vercel-varna build skripta — pogojno kopiranje standalone
  (`scripts/copy-standalone.sh`)
- Podvojen React key v ExperienceModal (BookingSection + ReviewSection)
- webpack dev mode + eksplicitna vrata v dev skripti (OOM stabilnost)

### Spremenjeno

- B2B monetizacija: provizija 12 % na AI-prinesene rezervacije je ZDAJ primarni
  model za free partnerje; Premium (149 €/mes) / Enterprise (499 €/mes)
  naročnina = 0 % provizije + rangirni boost
- `CommissionInvoice` nov atribut `stripePaymentId` (Stripe PaymentIntent za
  uskladitev kartičnih plačil; null = ročno/SEPA)

---

## [1.0.0] — 2026-07-15

### Dodano (Added)

- **AI načrtovalec potovanj** z 3-nivojskim fallback-om (Puter GLM → z-ai-web-dev-sdk → pravila)
- **22 destinacij** v 9 slovenskih regijah z naprednimi filtri (regija, interes, tip, cena, ocena)
- **Interaktivni zemljevid** (Leaflet) z 22 destinacijskimi markerji + POI layer (OpenStreetMap + Wikipedia)
- **Tržnica izdelkov** — 28 slovenskih izdelkov (med, vino, olje, sir, klobase, craft)
- **Tržnica izkušenj** — 28 izkušenj (rafting, kulinarične ture, pohodi, degustacije, wellness)
- **Listings (B2B)** — 25 lokalov (hoteli, restavracije, aktivnosti, transport)
- **Booking panel** — 4 tabi (Nastanitev, Aktivnosti, Hrana, Transport) po vsakem dnevu itinererja
- **Koledar dogodkov** — 30 realnih slovenskih festivalov skozi vse leto
- **Blog** — 16 člankov o slovenskih znamenitostih z markdown vsebino
- **8 zbirk** (Zimski, Poletni, Romantični, Družinski, Kulinarika, Avantura, Eko, Luxury)
- **Owner portal** — registracija, prijava (NextAuth), dashboard z 5 tabi (Lokalci, Izdelki, Izkušnje, Naročnina, Statistika)
- **Admin portal** — geslo-zaščiten dashboard z 3 tabi (Lokali, Leadi, Statistika)
- **Pavšalni oglasni model** — Osnovni (€0), Premium (€149/mes), Enterprise (€499/mes)
- **Beta model** — vse brezplačno do 30 lokalov, samodejni vklop monetizacije
- **Sponzorirana AI priporočila** — premium/enterprise lokalci omenjeni v AI itinererjih
- **Email avtomatizacija** — 5 dvojezičnih (SL/EN) templates (welcome, payment, renewal, lead, admin)
- **Owner Analytics** — KPI (views, clicks, leads, konverzija), ROI izračun, top 5, 30-dnevni trend
- **Multi-language (i18n)** — 4 jeziki (sl/en/de/it) z next-intl
- **SEO** — dinamični metadata, JSON-LD structured data, sitemap.xml (322 URL-jev), robots.txt
- **PWA** — manifest.json, service worker z offline fallback, ikone
- **Pitch deck** — za privabljanje novih ponudnikov z 4 benefiti, 4-koračnim procesom, 3 pričevanji
- **AI priporočila** ("Morda vam je všeč") v product in experience modalih
- **Stripe Subscriptions** — demo mode (production-ready z realnimi ključi)
- **Cron job** za 7-dnevne renewal opomnike
- **Affiliate sistem** — Booking.com, DiscoverCars, Viator, Skyscanner, WorldNomads
- **Redirect model** — uporabnik gre direktno na ponudnikovo stran (ne pobiramo plačil)

### Tehnologije (Technologies)

- Next.js 16 (App Router, Turbopack)
- TypeScript 5.9 (strict mode)
- Tailwind CSS 4 + shadcn/ui (New York)
- Prisma 6 + SQLite
- NextAuth.js v4 (Credentials provider, bcrypt hashing)
- z-ai-web-dev-sdk (GLM) za AI
- Leaflet + OpenStreetMap Overpass API
- next-intl v4 (4 jeziki)
- Nodemailer (email)
- Stripe (plačila)
- Zustand + TanStack React Query (state management)
- Framer Motion (animacije)

### Varnost (Security)

- bcryptjs za hashiranje gesel (10 rund)
- Ownership preverba na vseh B2B API-jih
- GDPR privolitev pri registraciji
- Admin geslo preko env spremenljivke
- `.env` in `data/leads.json` v `.gitignore`

### Infrastruktura (Infrastructure)

- GitHub Actions CI/CD (lint + type check + build)
- GitHub repo: https://github.com/markec12345678/Discover-Slovenia-AI
- README.md (18.7KB temeljita dokumentacija)
- SECURITY.md (varnostna politika)
- LICENSE (MIT)
- CONTRIBUTING.md (prispevni vodič)
- .env.example (konfiguracijska predloga)

---

## Lega

- `Dodano` — nove funkcionalnosti
- `Spremenjeno` — spremembe obstoječih funkcionalnosti
- `Odstranjeno` — odstranjene funkcionalnosti
- `Popravljeno` — popravki napak
- `Varnost` — varnostne popravke
