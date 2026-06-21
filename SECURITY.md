# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

Odkrili ste varnostno ranljivost? **Ne odpirajte javnega issue-a!**

Pošljite podatke na: **security@ifeelslovenia.si**

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

## Known Security Measures

### Avtentikacija
- **NextAuth.js v4** z JWT session strategy
- **bcryptjs** za hashiranje gesel (12 rounds)
- **Credentials provider** — gesla se nikoli ne shranjujejo v plain text

### Avtorizacija
- **Owner API-ji** — preverjajo `getServerSession` + ownership (403 če ni lastnik)
- **Admin API-ji** — preverjajo `x-admin-password` header
- Plan limiti (free=3, premium=10, enterprise=∞)

### Podatki
- **SQLite lokalna baza** — ni izpostavljena internetu
- **Leadi** shranjeni v `data/leads.json` (v `.gitignore`)
- **GDPR** — owner registracija zahteva privolitev
- **Brez baze uporabniških gesel** — samo hash-i

### API Varnost
- **Server-side price verification** — client ne more manipulirati cen
- **Input validacija** na vseh API-jih
- **Rate limiting** priporočeno za production (glej Roadmap)
- **CORS** — konfiguriraj za production domain

### Stripe
- **Demo mode** — `sk_test_demo_placeholder` (ne processira pravih plačil)
- **Webhook signature verification** — v production mode
- **Customer Portal** — za upravljanje naročnin

### Environment Variables
- `.env` je v `.gitignore`
- `.env.example` vsebuje samo placeholder vrednosti
- **Nikoli ne commit-aj** pravih ključev

## Production Checklist

Pred deploy-em na production:

- [ ] Zamenjaj `ADMIN_PASSWORD` z močnim geslom
- [ ] Zamenjaj `NEXTAUTH_SECRET` z naključnim stringom (min 32 znakov)
- [ ] Nastavi prave Stripe ključe (`sk_live_*`)
- [ ] Nastavi pravi SMTP strežnik
- [ ] Konfiguriraj CORS za production domain
- [ ] Omogoči HTTPS (Vercel avtomatsko)
- [ ] Dodaj rate limiting (npr. `@upstash/ratelimit`)
- [ ] Backup baze (dnevno)
- [ ] Monitoring (Sentry, LogRocket)

## Responsible Disclosure

Cenimo odgovorno prijavo varnostnih ranljivosti. Za legitimne poročila ponujamo:
- Javno priznanje (na željo)
- Mestno v "Security Hall of Fame"
- Brezplačno Premium naročnino (3 mesece)

---

**Zadnja posodobitev:** 2025
