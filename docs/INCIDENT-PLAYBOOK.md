# Incident Playbook

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Kaj narediti ko X odpove — hiter referenčni dokument za administratorje

---

## 🚨 Quick Reference

| Kaj odpove | Severity | Prvi korak | Recovery time |
|-----------|---------|-----------|--------------|
| AI (GLM) | P1 | Preveri fallback chain | < 5 min |
| Stripe | P1 | Preveri Stripe status | < 30 min |
| Turso/DB | P0 | Restore iz backup-a | < 1 ura |
| Vercel | P0 | Čakaj na Vercel | < 1 ura |
| OSM (POI) | P2 | Uporabi cache | < 1 ura |
| SMTP (email) | P2 | Preveri SMTP | < 2 uri |
| Wikipedia | P3 | Brez opisa | N/A |

---

## 1. AI (GLM/Puter) izpad

### Simptomi
- AI odgovori počasni (>30s) ali ne pridejo
- AI fallback rate > 15%
- Uporabnik vidi "AI razmišlja..." neskončno

### Diagnoza
```bash
# 1. Preveri AI health
curl https://discoverslovenia.ai/api/ai-health

# 2. Preveri Puter API
curl -H "Authorization: Bearer $PUTER_AUTH_TOKEN" \
  https://api.puter.com/puterai/openai/v1/models

# 3. Preveri AIUsageLog
sqlite3 db/custom.db \
  "SELECT source, COUNT(*) FROM AIUsageLog WHERE created_at > datetime('now', '-1 hour') GROUP BY source;"
```

### Akcije

```
1. PREVERI FALLBACK CHAIN
   ├── Ali z-ai-sdk deluje?
   ├── Ali rule-based fallback deluje?
   └── Uporabnik naj ne vidi error-ja

2. ČE FALLBACK NE DELUJE
   ├── FEATURE_AI_CHAT_ENABLED=false (env)
   ├── FEATURE_AI_SEARCH_ENABLED=false (env)
   ├── Redeploy na Vercel
   └── Prikaži "AI trenutno nedosegljiv" banner

3. ČE PUTER API PADE
   ├── Preklopi na direct GLM API (če imaš ključ)
   ├── Ali preklopi na OpenAI GPT-4o-mini
   └── Posodobi PUTER_AUTH_TOKEN

4. KOMUNICIRAJ
   ├── Email na admin@discoverslovenia.ai
   ├── Banner na homepage (če P0)
   └── Status update ko rešeno
```

### Recovery
- Puter API obnovi → preklopi nazaj
- Ali konfiguriraj nov AI provider
- Post-mortem v 24h

---

## 2. Stripe izpad

### Simptomi
- Checkout ne deluje
- Webhook-i ne prihajajo
- Providerji ne morejo upgradati

### Diagnoza
```bash
# 1. Preveri Stripe status
curl https://status.stripe.com/

# 2. Preveri webhook logs
# (Stripe Dashboard > Developers > Webhooks)

# 3. Preveri naš webhook endpoint
curl -X POST https://discoverslovenia.ai/api/stripe/webhook \
  -H "stripe-signature: test" -d "test"
```

### Akcije

```
1. ČE STRIPE PADE
   ├── FEATURE_PAYMENTS_ENABLED=false (env)
   ├── Redeploy
   ├── Banner: "Plačila trenutno nedosegljiva"
   └── Email providerjem ki čakajo na upgrade

2. ČE WEBHOOK NE DELUJE
   ├── Preveri webhook secret
   ├── Replay missed events (Stripe Dashboard)
   └── Manual sync če potrebno

3. ČE CHECKOUT NE DELUJE
   ├── Preveri STRIPE_SECRET_KEY
   ├── Preveri price IDs
   └── Kontaktiraj Stripe support
```

### Recovery
- Stripe obnovi → re-enable payments
- Replay missed webhooks
- Post-mortem

---

## 3. Turso/DB izpad

### Simptomi
- Vse strani vračajo 500 error
- API vrača "Database connection failed"
- Prisma error v logih

### Diagnoza
```bash
# 1. Preveri Turso status
curl https://status.turso.tech/

# 2. Preveri DB povezavo
bun run -e "const {db} = require('./src/lib/db'); db.listing.count().then(console.log)"

# 3. Preveri DB file (če SQLite)
ls -la db/custom.db
sqlite3 db/custom.db "SELECT COUNT(*) FROM Listing;"
```

### Akcije

```
1. ČE TURSO PADE
   ├── Preklopi na SQLite fallback (če konfigurirano)
   ├── Ali prikaži maintenance page
   └── Čakaj na Turso recovery

2. ČE DB KORUPTIRANA
   ├── BACKUP trenutne (za forenziko)
   ├── RESTORE iz zadnjega backup-a
   ├── Verify integrity
   └── Restart aplikacije

3. ČE DB ZAKLEP (SQLite)
   ├── Preveri aktivne povezave
   ├── Kill zombie procesi
   ├── Restart Vercel funkcije
   └── Preveri da ni concurrent writes
```

### Recovery procedure
```bash
# 1. Backup korumpirane baze
cp db/custom.db db/custom.db.corrupt-$(date +%s)

# 2. Poišči zadnji dober backup
ls -lt db/backups/db_*.db | head -5

# 3. Restore
./scripts/recover-from-backup.sh db/backups/db_2025_01_14.db

# 4. Verify
sqlite3 db/custom.db "SELECT COUNT(*) FROM Listing;"
sqlite3 db/custom.db "PRAGMA integrity_check;"

# 5. Restart
# (Vercel: redeploy)
```

---

## 4. Vercel izpad

### Simptomi
- Spletna stran nedosegljiva
- Vse API-ji vračajo timeout
- 502/503 error

### Diagnoza
```bash
# 1. Preveri Vercel status
curl https://www.vercelstatus.com/

# 2. Preveri deploy
# (Vercel Dashboard > Deployments)
```

### Akcije

```
1. ČE VERCEL PADE
   ├── Ne moremo narediti veliko
   ├── Komuniciraj z uporabniki (social media)
   ├── Pripravi maintenance page (na backup hostingu)
   └── Čakaj na Vercel recovery

2. ČE DEPLOY NEUSPEŠEN
   ├── Rollback na prejšnji deploy
   ├── Preveri build log
   ├── Fix napako
   └── Re-deploy

3. ČE FEATURE FLAG USTAVI APLIKACIJO
   ├── Disable flag preko Vercel env
   ├── Redeploy
   └── Fix problem
```

### Recovery
- Vercel obnovi → monitor 1 uro
- Ali premakni na backup hosting (Netlify, Railway)

---

## 5. OpenStreetMap (POI) izpad

### Simptomi
- POI-ji se ne prikazujejo na zemljevidu
- /api/pois vrača timeout

### Diagnoza
```bash
# Preveri Overpass API
curl "https://overpass-api.de/api/status"
```

### Akcije

```
1. PREVERI CACHE
   ├── Ali imamo cached POI data?
   ├── data/poi-descriptions.json
   └── Uporabi cache kot fallback

2. ČE CACHE PRAZEN
   ├── Prikaži samo destinacijske markerje (brez POI)
   ├── Banner: "POI podatki trenutno nedosegljivi"
   └── Retry vsakih 5 minut

3. ČE OVERPASS TRAJNO PADE
   ├── Preklopi na alternativni Overpass server
   ├── Ali uporabi drug POI provider (Google Places - plačljiv)
   └── Disable POI layer
```

---

## 6. SMTP (email) izpad

### Simptomi
- Email-i se ne pošiljajo
- Ownerji ne dobijo obvestil
- Newsletter ne deluje

### Diagnoza
```bash
# Preveri SMTP
bun run -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransporter({host: process.env.SMTP_HOST, port: 587});
t.verify().then(console.log).catch(console.error);
"

# Preveri bounce rate
# (SMTP provider dashboard)
```

### Akcije

```
1. ČE SMTP NE DELUJE
   ├── Preveri SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
   ├── Preveri SPF/DKIM/DMARC DNS zapise
   ├── Preklopi na backup SMTP (Resend, SendGrid)
   └── Queue email-i (pošlji ko SMTP obnovi)

2. ČE EMAIL-I KONČAJO V SPAM
   ├── Preverj DKIM signature
   ├── Preveri SPF record
   ├── Preveri DMARC policy
   ├── Test z Mail-Tester (https://www.mail-tester.com/)
   └── Kontaktiraj SMTP provider
```

---

## 7. Wikipedia API izpad

### Simptomi
- POI modal ne prikaže Wikipedia opisa
- AI opisi se generirajo namesto tega

### Akcija
- AI opisi (POI Describe) prevzamejo — to je fallback
- Cache (poi-descriptions.json) za že obiskane POI-je
- Ni kritično (P3)

---

## 8. Komunikacijski plan

### Notranja komunikacija

| Severity | Kanal | Response time |
|---------|-------|--------------|
| P0 | SMS + Email | < 15 min |
| P1 | Email + Slack | < 1 ura |
| P2 | Slack | < 4 ure |
| P3 | Log only | Naslednji dan |

### Zunanja komunikacija (uporabniki)

| Severity | Kaj | Kje |
|---------|-----|-----|
| P0 | Maintenance banner | Homepage |
| P0 | Status update | status.discoverslovenia.ai (ko postavi) |
| P1 | Toast notification | In-app |
| P2 | Email (če provider affected) | Email |
| P3 | Ni komunikacije | — |

---

## 9. Post-Mortem Template

```markdown
## Incident Report: [Title]

**Date:** YYYY-MM-DD HH:MM
**Severity:** P0 | P1 | P2 | P3
**Duration:** Xh Ym
**Affected:** X uporabnikov

### Summary
[Kratek opis]

### Timeline
- HH:MM — [dogodek]
- HH:MM — [odziv]
- HH:MM — [rešitev]

### Root Cause
[Zakaj]

### Impact
- Uporabniki: X
- Funkcionalnost: Y
- Prihodek: Z

### Mitigation
[Kaj smo naredili]

### Prevention
- [ ] [Ukrepanje 1]
- [ ] [Ukrepanje 2]
- [ ] Update Risk Register

### Lessons Learned
[Kaj smo se naučili]
```

---

**Konec Incident Playbook.**
