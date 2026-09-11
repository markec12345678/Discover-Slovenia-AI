# Changelog

Vse pomembne spremembe projekta Discover Slovenia AI (prej I Feel Slovenia).

Format temelji na [Keep a Changelog](https://keepachangelog.com/slo/1.1.0/),
in projekt sledi [Semantic Versioning](https://semver.org/lang/sl/).

---

## [1.6.0] — 2026-09-11

### Spremenjeno (FW3 — AI-first hierarhija UX refaktor, `0742a1a`)

> Strateška sprememba identitete: »velik turistični portal z AI funkcijo« →
> »AI travel product z ogromnim ekosistemom za njim«. Načelo: **ne zmanjšuj
> funkcionalnosti — zmanjšaj kognitivno obremenitev** (progresivno razkrivanje,
> uporabnikov predlog). Vrata: tsc 0, eslint 0, agent-browser E2E (intent chip →
> /nacrtuj → avto-generacija z razčlenjenimi interesi; vsi novi ruti 200;
> mobilni 390 px hierarhični meni, sticky footer, 0 horizontalnega scrolla;
> legacy hash preusmeritve; 0 konzolnih napak).

- **Homepage: 22 sekcij → 8 vsebinskih blokov** — hero AI concierge,
  »tvoj naslednji korak« (vračajoči uporabniki + demo scenariji), trust
  statistike, 6 priljubljenih destinacij (+ CTA na vseh 22), priljubljene AI
  poti, doživetja, hub »Razišči Slovenijo«, rezervacije. HTML se je med
  E2E skrčil z ~992 KB na ~447 KB.
- **Hero: 6 intent chipov** (miren vikend, romantika, družina, hrana & vino,
  avantura, brez gužve) + gumb »Sestavi mojo pot« — submit prenese željo na
  `/nacrtuj` prek sessionStorage; planner jo ob mountu prevzame in zgenerira
  itinerer (razčlenitev naravnega jezika v days/interese/severno/skupino).
- **Navigacija: 6 povezav → 4 glavne** (Destinacije, Doživetja, Zemljevid,
  Vodiči) + primarni CTA »Načrtuj z AI« + diskretni »Za ponudnike«; mobilni
  meni s sekundarno skupino (Dogodki, Lokali, Tržnica, Slovenia Pass, Moja
  potovanja); nov prop `solid` za strani brez fotografskega heroja.
- **9 novih strani** (ASCII poti — Next.js 16 ne poveže percent-encoded URL-jev
  z ne-ASCII mapami, ugotovljeno s testom): `/nacrtuj` (planner + kviz +
  skupnostne poti), `/destinacije` (22 + filtri + zbirke), `/dozivetja`
  (kategorije + izkušnje), `/dogodki`, `/zemljevid`, `/lokali`, `/vodici`
  (blog + vprašaj lokalca), `/trznica`, `/slovenia-pass`.
- **MarketplaceSection: prop `defaultTab`** — `/dozivetja` pine zavihek
  »Izkušnje« (SSR preverjeno `data-state="active"`).
- **DestinationsSection: featured način** — 6 kartic brez filtrov + CTA
  »Razišči vseh 22 destinacij«.
- **B2B ločeno od turista**: `JoinUs` + `PitchDeck` preseljena na
  `/za-ponudnike` (Navigation solid + popravljen podvojen naslov); turistov
  glavni tok jih ne vidi več.
- **LegacyHashRedirect**: varnostna mreža za podedovane `#anchor` povezave
  (stari e-maili, kazalniki, chat odgovori) — dekodiranje percent-encoded
  hasha, deluje ob mountu in ob `hashchange`; ohrani query parametre.
- **WishlistSheet cross-page**: namen se prenese prek sessionStorage na
  `/trznica` (enak vzorec kot heroQuery → `/nacrtuj`).
- **SEO**: sitemap — hash sekcije zamenjane za prave strani (11 novih URL-jev);
  SearchAction JSON-LD usmerjen na `/destinacije?q=`; footer povezane na
  absolutne poti; vsa notranja »/#načrtuj« sklica posodobljena (15 datotek:
  SSG destinacijske strani, moja-potovanja, shared-trip, chat fallbacki,
  e-mail predloga).
- **i18n**: novi ključi `nav.experiences/guides/marketplace/pass/trips` v
  vseh štirih jezikih; CTA »Načrtuj z AI«.

## [1.5.0] — 2026-09-11

### Dodano (FW2 — UX quick wins iz primerjalne analize Mindtrip.ai, `629da01`)

> Vzorci, ki so 2026 standard AI travel produktov. Vrata: tsc 0, eslint 0,
> agent-browser E2E (wishlist tok, chat persistenca čez reload, place cards,
> QR, lightbox, booking → Moja potovanja, sponsorship vrata, push/test) +
> mobilni 390 px brez horizontalnega scrolla.

- **Place cards v AI konzultacijah**: priporočeni partnerji (izkušnje/izdelki/lokalci)
  se v odgovoru konzultacije prikažejo kot vizualne kartice — server-side obogatitev
  iz `published` DB vsebine (slika, ocena, cena, CTA na things-to-do) z iskrenim
  besedilnim fallbackom za neujemajoča imena.
- **Persistenca AI chat zgodovine** (`dai:chat-history`, FIFO 40, defenzivno branje)
  + gumb »Počisti pogovor«.
- **Priljubljene (wishlist)**: srčki na karticah tržnice in modalih (`localStorage`,
  FIFO 60) + WishlistSheet v navigaciji z odpiranjem pripadajočega modal.
- **QR koda deljene poti**: inline preklop v vrstici Deli + print-only QR blok na
  `/pot/[shareId]` (ob tisku povezava nazaj na živo stran).
- **Sponzorstva v owner nadzorni plošči**: Moja sponzorstva + nakupni tok (demo:
  takojšnja aktivacija; Stripe: redirect). P3a-2 vrata `emailVerified` ostajajo
  aktivna — iskren 403 toast.
- **Celozaslonski lightbox galerije** (izkušnje + izdelki): tipkovnica, števec,
  thumbnail list, pravilna plastovitost nad modalom.
- **Moja naročila in rezervacije**: lokalno sledenje (`dai:my-orders` /
  `dai:my-bookings`, FIFO 50) + javni lookup API, prikaz v `/moja-potovanja`.

### Popravljeno (FW2)

- **Mrtvi gumb »Pošlji testno obvestilo« (404 v produkciji)**: nov `/api/push/test`
  (rate limit 5/h; endpoint mora obstajati v DB — ni poljubni relay; ključi iz DB;
  VAPID 503 iskreno) + `.gitignore` negacija — gol vzorec `test` bi izključil ruto
  iz deploya (verjetni vzrok izvirnega 404).

---

## [1.4.1] — 2026-09-11

### Varnost (FW1 — kritične najdbe auditov R2/R3, `08e8369`)

> E2E adversarial testi na Neonu (s cleanup skriptami): atribuirani unpaid booking
> NE vstopi v provizijsko osnovo; dedup 409 kljub porabljeni zalogi; agregirani
> payload 2×2 > 3 → 400; pretečeni cancel → 400; providerEmail tuji → 400;
> dvoumen lead → fail-closed. Skripte: `fix-wave1-backfill` + `fw1-test-setup/cleanup`.

- 🔴 **Commission inflation (R3)**: `Booking.paymentStatus` (unpaid|paid|refunded);
  provizijska osnova (lib/commissions + owner GET + invoice-pdf) šteje IZKLJUČNO
  plačane rezervacije — anonimni API obiskovalec ne more več ustvarjati provizijske
  obveznosti ponudniku. Seeded demo rezervacije so backfillane na `paid` (dashboard
  showcase ostane živ). Zgornja meja `bookingDate`: 18 mesecev.
- 🔴 **Marketplace stock (R2)**: checkout agregira količine po `productId`, atomarno
  pogojno dekrementira zalogo + `saleCount` v SERIALIZABLE transakciji s P2034
  retry — overselling nemogoč tudi ob sočasnosti; dedup naročil (isti kupec + ista
  košarika v 10 min → 409 s številko prvega naročila pred stock-checkom).
- 🟠 **providerEmail cross-tenant (R3)**: experience POST/PUT zahtevata
  `providerEmail === owner.email`; lastništvo rezervacij IZKLJUČNO prek
  `Experience.ownerId` (OR-veja odstranjena).
- 🟠 **Owner cancel = evazija provizije (R3)**: preklic POTRDJENE rezervacije samo
  PRED datumom izvedbe (po preteku samo `complete`); vsak prehod v AuditLog
  (`BOOKING_STATUS_CHANGED`).
- 🟠 **Public API leak (R3)**: javni odgovori (listings/experiences/products/
  collections + detajli) sanitizirani prek `lib/public-fields.ts` — `ownerEmail`,
  `ownerId`, `rejectionReason`, `approvedBy`, `submittedAt`, `approvedAt`,
  `draftNudge*`, `aiRecommendations` odstranjeni (števci social-proof ostajajo
  namerno javni).
- 🟠 **Re-moderacija poslovnih polj (R2)**: `contentChanged` zajema sedaj tudi
  ceno, trajanje, velikost skupine, meeting point, naslov in kontakt ponudnika.
- 🟠 **daily-trip-push unpublished (R3)**: filter `status:'published'` — javni push
  ne pošilje več pending/zavrnjenih izkušenj turistom.
- 🟠 **Lead routing fail-closed (R2)**: email lastniku SAMO ob nedvoumnem
  (normaliziran exact) ujemanju `businessName` z natanko enim ownerjem; 0 ali 2+
  zadetkov → brez samodejnega emaila (ročna obdelava).

---

## [1.4.0] — 2026-09-11

### Varnost (P7 — globoki audit + popravki P0–P2)

- **Upokojitev demo računov v produkciji (P0)**: `admin@demo` (super_admin) izbrisan;
  ana/marko/tina/luka imajo rotirana naključna gesla + razveljavljene seje. Vsa javno
  dokumentirana gesla na produkciji vračajo 401 (preverjeno). Seed fiksnih gesel samo
  lokalno SQLite z `DEV_FIXED_DEMO_PASSWORDS=1`.
- **`mark_paid` provizijskega računa (P0)**: lastnik ne more več označiti svoj račun
  za plačan brez dokaza o plačilu — 403, kadar Stripe ni v demo načinu.
- **`/api/checkout` (P1)**: fail-closed 501 v produkciji (prej: napačen
  `status="paid"` + lažen `stripeSessionId` tudi s pravimi ključi).
- **Stripe webhook (P1)**: dedup marker `ProcessedStripeEvent` se ob napaki obdelave
  umakne — Stripe retry znova obdela (prej: učinek plačila za vedno izgubljen).
- **Provizijska osnova (P1)**: preklicane rezervacije izključene
  (`confirmed`/`completed`); brisanje izkušnje z rezervacijami zavrnjeno (400).
- **Atribucija (P1)**: `source=consultation` samo, če je konzultacija dejansko
  priporočila to izkušnjo/ponudnika (ujemanje imen + vsebine odgovora).
- **AI stroškovna zloraba (P1)**: `/api/ai-health` rate limit 12/10 min;
  `/api/recommendations/*` rate limit 60/10 min + in-memory cache (FS cache na
  Vercelu read-only → prej AI klic na vsak javni GET).
- **Odstranjena osirotela javni ruti (P1)**: `/api/seo/faq` (neavtoriziran AI) in
  `/api/email/welcome` (neavtoriziran email relay).
- **P2 paket**: timing-safe `track-funnel`, validacija weather lat/lng,
  `payment_status="paid"` obvezen pri commission/sponsorship webhookih, sponsorship
  dup-check, idempotentna cron (renewal-reminders claim, commission-invoices P2002),
  login timing izenačen (dummy bcrypt), `[EMAIL DEMO]` redakcija URL-jev z žetoni v
  produkciji, `max_tokens` na AI klicih.

### Spremenjeno (P8 — responsive + atomarna booking deduplikacija)

- **Atomarna booking deduplikacija (P1)**: TOCTOU (`findFirst` → `create`) zamenjan
  s SERIALIZABLE transakcijo + retry na P2034 (PostgreSQL; SQLite lokalno privzeta
  raven). Sočasna duplikatna requesta ustvarita natanko ENO rezervacijo — E2E dokaz:
  200 + 409 z isto številko, 1 vrstica v DB; bookingCount se poveča enkrat; emaila
  se pošljeta samo na zmagovalni (200) poti — 409 pot se vrne prej pošiljanja.
- **`issueCommissionInvoice()` (P2)**: P2002 konflikt → vrne obstoječi račun
  (`duplicate`) namesto 500.
- **Responsive 390 px**: homepage 70,2k → 48,7k px (−30 %); dvostolpčni mobilni
  gridi (destinacije, tržnica, lokali, blog, zbirke), row-layout dogodkov,
  kompakcija kartic, beta-banner/footer odmiki za sticky CTA + chat FAB,
  `env(safe-area-inset-bottom)` na avtentikacijskih straneh. Desktop nespremenjen.

### Dokumentacija (P9 — code freeze)

- **README**: status CODE FREEZE READY + deploy runbook po rate-limit okni
  (Redeploy, brez praznega commita) + 16-točkovni produkcjski smoke checklist.
- **`requireOwnership()`**: admin/super_admin/moderator bypass dokumentiran v kodi
  (P7-B: 0 klicalcev → past za prihodnji razvoj, ne aktivna ranljivost).
- **`scripts/verify/production-smoke.sh`**: avtomatizirani del smoke checklista
  (markerji, anti-enumeracija, cron × 6 z napačnim/pravim secretom, commit status;
  opciono booking E2E z dokazom 409 dedup in newsletter).
- **`scripts/db/p9-smoke-cleanup.ts`**: idempotenten cleanup smoke zapisov.
- **Znane odložene postavke** (zavedno, pred javnim launchem): centralizirani rate
  limiting (per-instance zdaj), realni Stripe Checkout po pilotu, prompt-injection
  ovijanje na preostalih AI poteh.

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
