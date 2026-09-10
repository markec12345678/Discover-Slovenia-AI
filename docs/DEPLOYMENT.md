# DEPLOYMENT — produkcijska namestitev in odločitvena analiza

> **Status (Faza 4f + P4-7, 2026-09-10):** produkcija teče na **Vercel +
> Neon PostgreSQL** (Pot B — IZVEDENA, glej razdelek 4). CI Build job od
> P4-7 testira proti pravemu Postgresu (service container). Dokument vsebuje
> tudi zgodovinsko analizo padcev (Faza 4d) in alternativno Docker pot (Pot A
> — POZOR: trenutno zahteva prilagoditev, glej razdelek 3).

---

## 1. Izvorni vzrok: zakaj so VSI Vercel deploymenti padli (30/30 od 15. 7. 2026)

Diagnoza (GitHub Deployments API + izolirana reprodukcija builda):

| # | Vzrok | Dokaz |
|---|-------|-------|
| 1 | **`prisma generate` se ni izvedel v Vercel buildu.** V package.json ni bilo `postinstall` hooka ne `prisma generate` v build skripti; Vercel namensko ne poganja Prisma generate. | Reprodukcija builda brez generiranega klienta: `Module not found: Can't resolve '.prisma/client/index-browser'` — natanko ta napaka podre build na Vercelu. GitHub CI je zato zelen, ker workflow izrecno poganja `bunx prisma generate` pred buildom. |
| 2 | **SQLite ni združljiv s serverless lambdami.** `db/custom.db` je gitignored (v Vercel build okolju ne obstaja) in lambda datotečni sistem ni trajen — tudi ob uspešnem buildu bi baza med instancami izginjala. | Arhitektura: Prisma `provider = "sqlite"`, `DATABASE_URL=file:...`. |

**Popravek (Faza 4d):**

- `package.json` → `"build": "prisma generate && next build --webpack && …"` in
  `"postinstall": "prisma generate"` — Prisma klient se zdaj generira na vsaki
  platformi (Vercel, Docker, CI, ročno).
- Build je preverjeno **neodvisen od baze**: izoliran build brez `DATABASE_URL`
  in brez baze → exit 0 (vse build-time poizvedbe imajo try/catch fallback,
  dinamične strani se ne prerenderajo).

**Ključna ugotovitev iz časovnika (Faza 4d):** vsi Vercel deploymenti (vseh
30 od 15. 7.) padejo v **0–1 sekundi** po nastanku — pravi build (install +
prevajanje) traja minute. Deployment se torej **sploh ne začne graditi** —
zavrnitev je na nivoju Vercel RAČUNA/PROJEKTA, ne v kodi. Tipični vzroki:
izčrpan build-hours kvota (Hobby plan), zamrznjen/suspendiran račun,
neveljavna produkcjska domena ali pokvarjena projektna nastavitev.

**Potreben korak lastnika (ni dosegljivo iz repozitorija):** odpri Vercel
dashboard → Deployments → zadnji padli deployment → preberi rdeče sporočilo
o napaki (ali poženi spodnji ukaz); preveri tudi Billing/Usage:

```bash
npx vercel inspect dpl_EQPfx2HHG2YyKFKEfa5tSBv4vS1W --logs   # zadnji padli (10:43)
```

Vsa tri popravila spodaj (prisma generate povsod, Vercel-varna build
skripta, config hook) so VSEENO obvezna in E2E dokazana — brez njih bi
build padel TUDI ob odpravi računskе težave (izolirana reprodukcija:
`Module not found: .prisma/client/index-browser`):

1. `prisma generate` v build skripti + `postinstall` hook (package.json);
2. `next.config.ts` sam prigenerira klienta ob nalaganju — pokrije primer,
   ko Vercel poganja lastni `next build` brez našega skripta (E2E
   simulacija: neposreden `next build` brez skripte/postinstalla/generiranega
   klienta/`DATABASE_URL` → exit 0);
3. `scripts/copy-standalone.sh` — pogojno kopiranje standalone (na Vercelu
   ni potrebno, na VPS/Docker obvezno).

A tudi ob zelenem buildu **runtime baze ne more delovati** na serverless
(vzrok #2 — SQLite) — za Vercel je bila obvezna migracija na hosted Postgres
(Pot B spodaj). **To se je zgodilo:** Faza 4f (2026-09-10) — produkcija
živi na Neon PostgreSQL (glej razdelek 4).

---

## 2. Najdena in odpravljena napaka standalone produkcije (VPS pot)

Med E2E preverjanjem `next build` + `bun .next/standalone/server.js` je bila
odkrita **neskončna zanka**:

- Simptom: vse dinamične strani (`/`, `/o-strani`, `/destinacija/…`, celo 404)
  obvisijo brez odgovora; statika in API poti delujejo.
- Merjeno z `NODE_DEBUG=http,net`: en HTTP zahteva je sprožila **4763 odhodnih
  povezav nazaj na lastno vrata** (`localhost:3111`).
- Vzrok: Next.js 16 v standalone načinu interne `rewrite` posreduje prek HTTP
  nazaj na isti strežnik; notranji klic **ponovno vstopi v proxy/middleware**,
  ki spet izda rewrite → spet forward → zanka.

**Popravek (dvojen):**

1. `src/middleware.ts` → **`src/proxy.ts`** (uradna Next.js 16 konvencija;
   stara je deprecated) z **varovalko** na začetku:

   ```ts
   // 0. VAROVALKA proti standalone zanki (Next.js 16)
   if (request.headers.get(HEADER_LOCALE)) {
     return NextResponse.next();
   }
   ```

   Prvi prehod nastavi `x-next-intl-locale` header, ki preživi round-trip —
   notranji ponovni vstop ga zazna in se takoj spusti naprej, zanka se prekine.
   V dev/Vercel okoljih se header ob prvem vstopu še ni nastavil, zato
   varovalka nikoli ne sproži (obnašanje nespremenjeno).

2. `next build --webpack` namesto privzetega Turbopack builda:
   - enak bundler kot dev (`--webpack` v dev skripti),
   - webpack build **ulovi neveljavne route exporte** (Turbopack jih spregleda —
     odkrili in popravili smo `activateSponsorship` izvožen iz route datoteke,
     premaknjen v `src/lib/sponsorships.ts`),
   - build skripta doda še `interception-route-rewrite-manifest.js` v
     standalone (manjkal v tracer izpisu).

**E2E dokaz (standalone, produkcija):** `/` 200, `/o-strani` 200,
`/destinacija/bohinj/things-to-do` 200 **z vsebino iz baze** („Penzion Bohinj
Ezerca"), `/en` 200 z `lang="en"` (i18n), 404 pot → pravilen 404, cron API →
401, 10/10 zaporednih zahtev 200, prisma:error 0.

---

## 3. POT A: lastni strežnik + Docker Compose — trenutno ZAHTEVA PRILAGODITEV

> ⚠️ **Omejitev po Fazi 4f (2026-09-10):** `prisma/schema.prisma` je sedaj
> `provider = "postgresql"` (Neon v produkciji). DockerCompose nastavitev v
> repu (`Dockerfile`, `docker-compose.yml`) še vedno pričakuje SQLite
> (`DATABASE_URL=file:/app/db/custom.db`) — PRED uporabo Poti A jo je treba
> prilagoditi: bodisi dodajte `postgres` service v `docker-compose.yml`
> (priporočeno — enaka arhitektura kot produkcija), bodisi začasno preklopite
> provider nazaj na `sqlite`. Shema ni vezana na bazo do roke — `prisma db
> push` zgradi tabele na katerikoli izbrani bazi.

Aplikacija (Next.js standalone + cron) v dveh vsebnikih; podatki v
named volumenu. Ni odvisnosti od zunanjih DB storitev, ni stroškov.

**Datoteke (vse v repozitoriju):** `Dockerfile`, `docker-compose.yml`,
`docker/cron.Dockerfile`, `docker/crontab.template`, `docker/cron-entrypoint.sh`,
`.dockerignore`.

### Postopek

```bash
# 1. Pripravi okoljske spremenljivke (skrivnosti generiraj glej .env.example)
cp .env.example .env.docker
#    izpolji: NEXTAUTH_SECRET, NEXTAUTH_URL=https://tvoja-domena.si,
#             ADMIN_PASSWORD, ADMIN_EMAIL, CRON_SECRET, SMTP_* (za e-pošto),
#             PUTER_* (AI konzultacije), Stripe/Web-push po želji

# 2. Zagon (build + app + cron)
docker compose up -d --build

# 3. Preveri
docker compose ps                # app: healthy, cron: running
docker compose logs -f app       # ✓ Ready
curl -f http://localhost:3000/   # 200

# 4. (opcija) demo podatki za prvi vtis
docker compose run --rm migrate bun scripts/seed-demo.ts
```

### Vsakodnevno vzdrževanje

```bash
docker compose run --rm migrate            # sinhronizacija sheme po pull-u
docker compose up -d --build               # nadgradnja na novo verzijo
docker compose logs cron                   # izidi cron klicev (sent/issued/…)
```

- **Baza:** volumen `dsa-data` (SQLite). Inicializacija s shemo se zgodi
  samodejno ob prvem zagonu (prazen volumen prejme preddatirano bazo iz slike).
- **Backup:** glej `docs/BACKUP-RECOVERY.md` (backup je datoteka v volumenu —
  enostavno `sqlite3 .backup` ali copy ob ustavljenem app vsebniku).
- **HTTPS:** pred aplikacijo postavi reverse proxy (Caddy — samodejni Let's
  Encrypt; nginx). V `.env.docker` nastavi `NEXTAUTH_URL=https://…`.

### Cron urniki (enaki vercel.json, UTC)

| Urnik (UTC) | Končna točka | Opis |
|---|---|---|
| `0 6 * * *` | `/api/cron/daily-trip-push` | dnevni push opomniki potovanj |
| `0 7 * * *` | `/api/cron/recalculate-status` | preracun statusov |
| `0 8 * * 1` | `/api/cron/weekly-alerts` | tedensko B2B poročilo |
| `0 8 1 * *` | `/api/cron/commission-invoices` | mesečni obračun provizij |
| `0 9 * * *` | `/api/cron/renewal-reminders` | opomniki obnov |

Vsak klic je Bearer zaščiten s `CRON_SECRET` (brez njega API vrne 401 —
fail-closed, E2E dokazano).

### Alternativa brez Dockerja (systemd + host cron)

```bash
bun install && bun run build
sudo systemctl enable --now discoverslovenia   # unit z ExecStart=bun /opt/DSA/.next/standalone/server.js
sudo crontab -e   # vrstice iz docker/crontab.template z URL-jem http://localhost:3000
```

(Obvezno: `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT`, `DATABASE_URL`
kot absolutna pot, vse skrivnosti v EnvironmentFile.)

---

## 4. POT B: Vercel + hosted Postgres — ✅ IZVEDENA (produkcija od 2026-09-10)

Produkcija (`i-feel-slovenia.vercel.app`) teče po tej poti (Faza 4f):

1. ~~Ustvari hosted Postgres (npr. [Neon](https://neon.tech) free tier) →
   connection string.~~ **Narejeno** — Neon PostgreSQL (pooler,
   `connection_limit=1`).
2. ~~`prisma/schema.prisma`: `provider = "postgresql"`.~~ **Narejeno**
   (Faza 4f, komentar v shemi).
3. ~~Migracija obstoječih podatkov: izvozi SQLite tabele → uvoz v Postgres
   (skripta po tabelah glede na SetNull vrstni red; glej tudi
   `docs/MIGRATION-STRATEGY.md`).~~ **Narejeno** (demo baseline: Owner 5 /
   Listing 10 / Product 6 / Experience 10 / Booking 5).
4. ~~`bunx prisma db push` proti Neon URL (nova shema) + seed.~~ **Narejeno.**
5. ~~Vercel → Project Settings → Environment Variables: `DATABASE_URL`
   (Neon), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_PASSWORD`, `CRON_SECRET`,
   `ADMIN_EMAIL` …~~ **Narejeno** (preverjeno prek Vercel APIja 2026-09-10;
   `PUTER_AUTH_TOKEN` ni nastavljen — AI teče v fallback načinu; legacy
   `VITE_GEMINI_API_KEY` čaka na odstranitev).
6. ~~Push na `main` — build je zelen (prisma generate v build skripti).
   Vercel croni iz `vercel.json` se izvajajo avtomatično.~~ **Narejeno.**
7. CI (P4-7, 2026-09-10): Build job testira proti `postgres:16-alpine`
   service containerju — ista arhitektura kot produkcija (prej SQLite
   `ci-test.db`, kar je podrlo CI #65 po prehodu na postgresql shemo).

**Zakaj je bila Pot B izbrana kljub odvisnosti na DB servis:** Vercel
integracija (push → deploy), brez vzdrževanja strežnika, Neon free tier
zadosti za pilo fazo. Trade-off (iskreno): morebitni stroški/limiti Neona ob
rasti in odvisnost od zunanjega servisa — takrat presoja Pot A (z lastnim
Postgresom v Docker Compose, glej opombo v razdelku 3).

---

## 5. Matrika okoljskih spremenljivk (produkcija)

| Skupina | Spremenljivke | Obvezno | Opomba |
|---|---|---|---|
| Baza | `DATABASE_URL` | DA | Produkcija (Pot B): Neon URL; Pot A: `file:/app/db/custom.db` (glej opombo v razdelku 3) |
| Auth | `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | DA | URL = javna domena (HTTPS) |
| Admin | `ADMIN_PASSWORD`, `ADMIN_EMAIL` | DA | močno geslo (min 32 znakov) |
| Cron | `CRON_SECRET` | DA | Bearer za vse /api/cron/* |
| E-pošta | `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | za e-pošto | brez SMTP: console fallback |
| AI | `PUTER_AUTH_TOKEN`, `PUTER_BASE_URL`, `PUTER_MODEL` | za AI konzultacije | |
| Plačila | `STRIPE_*` | ne | demo mode brez ključev |
| Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | ne | |

---

## 6. VERCEL DEMO NAČIN (Faza 4e) — ZGODOVINSKO, nadomeščeno s Fazo 4f

> Ta mehanizem (SQLite demo baza zgrajena med buildom) je **neaktiven od
> Faze 4f**: `scripts/build-demo-db.sh` se samodejno preskoči, ko je v shemi
> `provider = "postgresql"`, `DATABASE_URL` na Vercelu pa kaže na Neon (ni
> `file:` sheme → tudi `src/instrumentation.ts` se umakne). Razdelek
> ostaja kot dokumentacija mehanizma, če se SQLite demo kdaj vrne (npr.
> offline predstavitev).

Zgodovinsko (Faza 4e, pred Neonom): za javni demo na
`i-feel-slovenia.vercel.app` (brez hosted Postgresa) je bila implementirana
**demo baza zgrajena med buildom**:

| Korak | Kje | Kaj naredi |
|---|---|---|
| 1. Build | `scripts/build-demo-db.sh` (samo, ko je `VERCEL=1`) | `prisma db push` + `seed-demo.ts` (BREZ super_admin računa — `SKIP_DEMO_ADMIN=1`) → `db/demo-seed.db` |
| 2. Bundle | `next.config.ts` → `outputFileTracingIncludes: {"/\**": ["./db/\**"]}` | nft tracer vključi `db/` v serverless bundle |
| 3. Zagon | `src/instrumentation.ts` (1× na instanco) | skopira `db/demo-seed.db` → `/tmp/dsa-demo.db`, preusmeri `DATABASE_URL` |
| 4. Runtime | `src/lib/db.ts` | absolutna `/tmp` pot — SQLite v zapisljivem območju |

**Varovalke (kdaj se NE aktivira):** ni Vercel (`VERCEL≠1`) · `DATABASE_URL`
ni `file:` shema (hosted Postgres — Pot B) · `DSA_DISABLE_DEMO_DB=1` ·
seed datoteka manjka.

**Omejitve (iskreno):**

- **Pisanje je per-instanca in EPHEMERNO** — rezervacije/računi/prijava
  obiskovalcev javnega demo se NE ohranjajo med hladnimi zagoni in so lahko
  nedosledni med vzporednimi instancami. Za prave podatke uporabite Pot A
  (Docker) ali Pot B (hosted Postgres).
- Demo partnerji (geslo `demo1234`, domena `@demo.discoverslovenia.si`) so
  NAMENOMO javni — obiskovalcem omogočajo ogled owner dashboarda. Super_admin
  račun v javnem buildu NE obstaja.
- Brez SMTP/AI ključev e-pošta pada v console fallback, AI pa v pravila
  (SMTP ostaja demo tudi po Fazi 4f — glej docs/PILOT-TEST-PROTOCOL.md,
  znana omejitev #1).

Preklop na Pot B (izvedeno — Faza 4f): nastavite `DATABASE_URL` na Postgres
URL v Vercel env (instrumentation se samodejno umakne — ne `file:` shema) in
spremenite `provider` v `prisma/schema.prisma` (glej razdelek 4).

---

## 7. Zgodovina sprememb (Faza 4d)

- `package.json`: `prisma generate` v build skripti + `postinstall`; build
  prek `--webpack`; kopiranje `interception-route-rewrite-manifest.js` v
  standalone.
- `src/middleware.ts` → `src/proxy.ts` z varovalko proti standalone zanki
  (detajli v razdelku 2).
- `src/lib/sponsorships.ts` (NOV): `activateSponsorship` prestavljen iz route
  datoteke (fix neveljavnega route exporta, ki ga je ulovil webpack build).
- `Dockerfile`, `docker-compose.yml`, `docker/*`, `.dockerignore` (NOVI):
  produkcijska pot A.
- E2E: Vercel-simulacija builda (brez DB, brez generate) exit 0; standalone
  runtime E2E (razdelek 2).

### Faza 4f + P4-7 (2026-09-10)

- **Faza 4f — Neon PostgreSQL v produkciji** (Pot B izvedena, glej razdelek 4):
  `prisma/schema.prisma` → `provider = "postgresql"`; `DATABASE_URL` (Neon
  pooler) v Vercel env; demo SQLite mehanizem (razdelek 6) se samodejno
  izklopi; migracija demo podatkov narejena.
- **P4-7 — CI/CD popravek**: Build job testira proti `postgres:16-alpine`
  service containerju (prej `file:./db/ci-test.db` → fail CI #65, ker Prisma
  zavrne `file:` URL pri postgresql providerju). CI #66 zelen.
- `Dockerfile`/`docker-compose.yml` (Pot A) trenutno neskladni s postgres
  shemo — glej opombo v razdelku 3.

### Faza 4e + 5 (2026-09-10)

- `scripts/build-demo-db.sh` + `src/instrumentation.ts` + `outputFileTracingIncludes`
  (NOVI): Vercel demo runtime DB (razdelek 6) — odpravljeno 500 `/api/products`
  in prazne DB sekcije na produkciji.
- `seed-demo.ts`: `SKIP_DEMO_ADMIN=1` (javni build brez super_admin).
- `package.json`: prenosljive poti (ne več `/home/z/Discover-Slovenia-AI`),
  `db:seed:demo` sedaj sam izvede `prisma db push`.
- Faza 5: `/api/owner/commissions/checkout` (Stripe enkratno plačilo) + webhook
  `type=commission_invoice` + potrdilo po e-pošti + gumb v dashboardu.
