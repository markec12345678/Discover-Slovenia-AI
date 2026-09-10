# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: (varnostni hardening) |
| 1.0.x   | :x: (glej "Security Hardening 1.1" spodaj) |

## Reporting a Vulnerability

Odkrili ste varnostno ranljivost? **Ne odpirajte javnega issue-a!**

Pošljite podatke na: **security@discoverslovenia.ai**

V emailu navedite:
- Opis ranljivosti
- Koraki za reprodukcijo
- Možen vpliv
- Predlagana rešitev (non-obvezno)

### Časovni okvir odgovora

| Korak | Čas |
|-------|-----|
| Potrditev prejema | 48 ur |
| Prva ocena | 5 delovnih dni |
| Popravek | 30 delovnih dni (kritične: 7 dni) |
| Javna objava | Po popravku |

## Security Hardening v1.1 (2026-07)

Popravljeni varnostni sajti, najdeni v 1.0:

| Popravek | Podrobnosti |
|----------|-------------|
| PII zaščita | `/api/orders/[id]` in `/api/bookings/[id]` zahtevata `?email=` ujemanje s kupcem/gostom (prej popolnoma odprta) |
| Rate limiting | Nov `src/lib/rate-limit.ts` — in-memory per-IP limiti na 13+ javnih AI/write/admin endpointih |
| Cron auth | `/api/cron/renewal-reminders` sedaj zahteva `CRON_SECRET` (Bearer) ali admin geslo; vsi cron endpointi uporabljajo timing-safe primerjavo |
| Timing-safe | `checkAdmin()` in cron primerjave uporabljajo `crypto.timingSafeEqual` |
| Email HTML injection | `/api/email-itinerary` vsi uporabniški vnosi escapani + payload omejen (max 14 dni, 20 priporočil/nasvetov) |
| JSON-LD XSS | `safeJsonLd()` escapira `<`, `>`, `&` v vseh structured-data blokih (6 datotek) |
| Server-side cene | `/api/bookings` prebere ceno, ime in providerja iz DB — client vrednosti se ne zaupajo |
| Nerodljivi ID-ji | orderNumber/bookingNumber vsebujeta `crypto.randomBytes` entropijo (prej ugibljivi timestamp) |
| Owner auto-tag | zahteva NextAuth sejo (prej odprt AI endpoint) |
| Published filter | `/api/itinerary/bookings` vrača samo `status: "published"` vsebine |
| Security headerji | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy v `next.config.ts` |
| Git higiena | `.env`, `db/`, `tool-results/`, `upload/`, `agent-ctx/`, `worklog.md`, `data/newsletter.json` odstranjeni iz sledenja |
| Bug: sendEmail | admin approve/reject emaila (pozicijski klic → objektni podpis) — prej nikoli pravilno dostavljeni |
| Secrets | `NEXTAUTH_SECRET` + `CRON_SECRET` dodani v `.env`; novo močno `ADMIN_PASSWORD` |

## ⚠️ Kritično — stanje po revizijskem pregledu (2026-09-10)

1. **PUTER_AUTH_TOKEN — zgodovina čista, token NI v aktivni uporabi.**
   Zgodovina je bila očiščena z `git filter-repo` v v1.1.0 (2026-09-08).
   Neodvisen revizijski pregled 2026-09-10 (**vseh 137 commitov, obe veji
   `main` + `master`**; vzorci: JWT `eyJ…`, `AIza…`, `ghp_…`, `github_pat_…`,
   `AKIA…`, `xox…`, `sk-…`, `npg_…`, `whsec_…`, URL-ji z
   `<user>:<geslo>@`) **ni našel nobene skrivnosti**. Prek Vercel APIja je
   potrjeno, da `PUTER_AUTH_TOKEN` ni nastavljen v produkcijskem okolju —
   torej nekdanji (javno vidljiv) žeton ni nikjer v uporabi.
   **Dejanje lastnika, če/ko boš AI znova aktiviral prek Puterja:** generiraj
   NOV žeton; žetona, ki je bil kdaj javen, nikoli ne ponovno uporabi
   (obravnavaj ga kot kompromitiranega).
2. ~~Počisti git zgodovino~~ — **OPRAVLJENO** (v1.1.0, `git filter-repo`) in
   neodvisno preverjeno (2026-09-10, glej točko 1). Navodila ostajajo za
   morebitno prihodnjo izpostavitev:
   ```bash
   # lokalno (bodi previden!)
   pip install git-filter-repo
   git filter-repo --invert-paths --path .env --path db/ --path tool-results/ --path upload/ --path agent-ctx/ --path worklog.md
   git push --force
   ```
3. **Rate limiter je in-memory** — na Vercelu deluje per-instanca; za robustno produkcijo migriraj na `@upstash/ratelimit` (načrt: `docs/SECURITY-REVIEW.md` §1.7).
4. **Datotečne shrambe** — leadi so od P4-2 (2026-09-10) shranjeni v
   PostgreSQL (model `Lead`) — serverless-varno. Še vedno datotečno (demo,
   na Vercelu se ne ohranja): `data/newsletter.json` (prijava na novice) —
   znana omejitev, roadmap. AI cache JSON-i (`data/ai-rec-cache.json` itd.)
   so read-only fallback vsebina, varno.

## Known Security Measures

### Avtentikacija
- **NextAuth.js v4** z JWT session strategy
- **bcryptjs** za hashiranje gesel (10 rounds pri registraciji)
- **Credentials provider** — gesla se nikoli ne shranjujejo v plain text

### Avtorizacija
- **Owner API-ji** — preverjajo `getServerSession` + ownership (403 če ni lastnik)
- **Admin API-ji** — preverjajo `x-admin-password` header (timing-safe, rate-limited)
- Plan limiti (free=3, premium=10, enterprise=∞)

### Podatki
- **PostgreSQL (Neon, pooler)** v produkciji — dostopna izključno prek `DATABASE_URL` (skrivnost)
- **Leadi** shranjeni v PostgreSQL (model `Lead`, P4-2) — vpogled/upravljanje v `/admin` (zavihek Leadi)
- **GDPR** — owner registracija zahteva privolitev
- **Brez baze uporabniških gesel** — samo hash-i

### API Varnost
- **Server-side price verification** — izdelki (DB cene) in izkušnje (DB cene)
- **Input validacija** — zod pri owner CRUD + ročna validacija na ostalih endpointih
- **Rate limiting** — in-memory, per-IP (13+ endpointov)
- **Security headerji** — CSP/HSTS/nosniff/frame-deny (glej `next.config.ts`)

### Stripe
- **Demo mode** — `sk_test_demo_placeholder` (ne processira pravih plačil; demo self-upgrade deluje samo brez produkcijskih ključev)
- **Webhook signature verification** — v production mode
- **Customer Portal** — za upravljanje naročnin

### Environment Variables
- `.env` je v `.gitignore` in NI več sledjen v gitu (od v1.1)
- `.env.example` vsebuje samo placeholder vrednosti
- **Nikoli ne commit-aj** pravih ključev — glej "Kritično" zgoraj za čiščenje zgodovine

## Production Checklist

Pred deploy-em na production:

- [x] Zamenjaj `ADMIN_PASSWORD` z močnim geslom *(narejeno v v1.1)*
- [x] Zamenjaj `NEXTAUTH_SECRET` z naključnim stringom *(narejeno v v1.1)*
- [x] **Git zgodovina** — očiščena (v1.1.0) + neodvisno preverjena 2026-09-10: brez skrivnosti
- [x] **`PUTER_AUTH_TOKEN` ni v uporabi** (ni v Vercel env) — ob ponovni aktivaciji Puter AI generiraj NOV žeton (stari obravnavaj kot kompromitiranega)
- [ ] Odstrani neuporabljeni `VITE_GEMINI_API_KEY` iz Vercel env (legacy iz predhodnje faze; `VITE_` spremenljivke so lahko vidne client-side ob buildu)
- [ ] Nastavi prave Stripe ključe (`sk_live_*`)
- [ ] Nastavi pravi SMTP strežnik
- [ ] Migriraj rate limiting na Upstash (per-instanca ni dovolj)
- [ ] Omogoči HTTPS (Vercel avtomatsko) — HSTS headerji že nastavljeni
- [ ] Backup baze (dnevno)
- [ ] Monitoring (Sentry, LogRocket)

## Responsible Disclosure

Cenimo odgovorno prijavo varnostnih ranljivosti. Za legitimna poročila ponujamo:
- Javno priznanje (na željo)
- Mesto v "Security Hall of Fame"
- Brezplačno Premium naročnino (3 mesece)

---

**Zadnja posodobitev:** 2026-09-10 (revizijski pregled zgodovine + stanje po P4-2)
