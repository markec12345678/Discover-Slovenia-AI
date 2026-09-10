# DEPLOYMENT — produkcijska namestitev in odločitvena analiza

> **Status (Faza 4d, 2026-09-10):** odkrit in popravljen izvorni vzrok
> propadanja vseh dosedanjih deploymentov; dodana Docker/Compose produkcijska
> pot (E2E dokazana) in jasen postopek za Vercel + hosted Postgres.

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

**Kaj to pomeni za Vercel:** build bo sedaj zelen. A **runtime baze še vedno
ne more delovati** na serverless (vzrok #2) — za Vercel je obvezna migracija
na hosted Postgres (Pot B spodaj). Brez nje bodo dinamične strani prazne oziroma
napake.

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

## 3. POT A (PRIPOROČENA): lastni strežnik + Docker Compose

Aplikacija (Next.js standalone + SQLite + cron) v dveh vsebnikih; podatki v
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

## 4. POT B: ostanek na Vercelu + hosted Postgres (Neon/Supabase)

Za primer, ko je serverless zaželen kljub SQLite arhitekturi:

1. Ustvari hosted Postgres (npr. [Neon](https://neon.tech) free tier) →
   connection string.
2. `prisma/schema.prisma`: `provider = "postgresql"`.
3. Migracija obstoječih podatkov: izvozi SQLite tabele → uvoz v Postgres
   (skripta po tabelah glede na SetNull vrstni red; glej tudi
   `docs/MIGRATION-STRATEGY.md`).
4. `bunx prisma db push` proti Neon URL (nova shema) + seed.
5. Vercel → Project Settings → Environment Variables:
   `DATABASE_URL` (Neon), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
   `ADMIN_PASSWORD`, `CRON_SECRET`, `SMTP_*`, `PUTER_*` …
6. Push na `main` — build je zdaj zelen (prisma generate v build skripti).
   Vercel croni iz `vercel.json` se izvajajo avtomatično.

**Pozor (iskreno):** korak 3 (migracija podatkov) ni trivialen in Pot B
uvaja novo odvisnost/strošek DB servisa. Za trenutno fazo projekta je Pot A
cenejša, enostavnejša in popolnoma pod nadzorom.

---

## 5. Matrika okoljskih spremenljivk (produkcija)

| Skupina | Spremenljivke | Obvezno | Opomba |
|---|---|---|---|
| Baza | `DATABASE_URL` | DA | Pot A: `file:/app/db/custom.db`; Pot B: Neon/Supabase URL |
| Auth | `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | DA | URL = javna domena (HTTPS) |
| Admin | `ADMIN_PASSWORD`, `ADMIN_EMAIL` | DA | močno geslo (min 32 znakov) |
| Cron | `CRON_SECRET` | DA | Bearer za vse /api/cron/* |
| E-pošta | `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | za e-pošto | brez SMTP: console fallback |
| AI | `PUTER_AUTH_TOKEN`, `PUTER_BASE_URL`, `PUTER_MODEL` | za AI konzultacije | |
| Plačila | `STRIPE_*` | ne | demo mode brez ključev |
| Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | ne | |

---

## 6. Zgodovina sprememb (Faza 4d)

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
