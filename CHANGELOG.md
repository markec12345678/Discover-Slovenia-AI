# Changelog

Vse pomembne spremembe projekta Discover Slovenia AI (prej I Feel Slovenia).

Format temelji na [Keep a Changelog](https://keepachangelog.com/slo/1.1.0/),
in projekt sledi [Semantic Versioning](https://semver.org/lang/sl/).

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
