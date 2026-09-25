# Security Review

> **Status:** Living document
> **Datum:** 2026-07-15
> **Namen:** Zadnji varnostni pregled pred produkcijo

> ✅ **Posodobitev 2026-09-08:** izvedena varnostna utrditev **v1.1.0** — PII zaščita (email verifikacija na orders/bookings), strežniška validacija cen, rate limiting na 16+ poteh, cron avtentikacija, timing-safe primerjave, JSON-LD/HTML escapiranje, varnostni headerji (CSP/HSTS/…) in čiščenje skrivnosti iz git zgodovine. Podrobnosti: `CHANGELOG.md` § [1.1.0]. Prej odkrite vrzeli v tem pregledu so naslovljene.
>
> ✅ **Posodobitev 2026-09-16 (revizija #9):** tabela 1.1 in vrstici »Rate
> limiting na auth« / »Brute force protection« usklajeni z DEJANSKIM stanjem
> kode (prejšnje ⚠️ Implementirati je bil dokumentacijski drift — headerji so
> v `next.config.ts` aktivni od v1.1.0, prijavni rate limit pa hibridni
> ip+email). CSP nadalje ostren v **v1.35.0** (odstranjen `unsafe-eval` v
> produkciji, `connect-src` zožen na `'self' blob:`).
>
> ✅ **Posodobitev 2026-09-16 (revizija #10 — adversarial audit poslovnega
> toka, v1.36.0):** 6 ločenih auditov (money-flow, multi-tenant, AI trust
> meje, race conditions, produkcija/framework, impossible states). Zaprto:
> listing DELETE varovalka pred uničenjem finančne evidence sponzorstev (P1);
> `isStripeDemo()` fail-closed (produkcija zahteva `DSA_DEMO_PAYMENTS=1`
> ali prave Stripe ključe — prej je unset ključ tiho aktiviral fake-plačila);
> pogojni statusni prehodi rezervacij (updateMany WHERE status, 409 ob
> současnosti); sponsorship TOCTOU (SERIALIZABLE tx); dnevna kvota konzultacij
> atomarno zahtevana PRED AI klicem (pending vrstica); accountType guard na
> stripe/checkout, stripe/portal, ai-insights (email kolizija User/Owner);
> smart-search wrap+GUARD (edina DB-kontekst AI ruta brez obrambe — ranking
> poisoning); chat currentPage cap+wrap + role whitelist; refine formData
> validacija; pois/describe cache ključ id+hash(imena) + GUARD; commission
> checkout ponovna uporaba odprte Stripe seje + pogojni mark-paid z detekcijo
> dvakratnega plačila; products re-moderacija razširjena na ceno/zalogo/
> prodajalca; admin/sponsorships validacija; cene min 0,01/max 100.000;
> booking „danes" po Europe/Ljubljana; dedup ključ naročil usklajen; prag
> poštnine v centih; poll-vote atomarni upsert; i18n interni marker
> neugibljiv + strip zunanjih x-next-intl-locale; FK Restrict na
> CommissionInvoice.owner in Sponsorship.owner (migracija
> 20260916100000_restrict_money_fks — **pred deployem zagnati
> `DATABASE_URL=<neon> bun run db:deploy`**); Dockerfile provider-guard.
>
> ⚠️ **Znani dolgovi (revizija #10, odloženi namerno — relevantni šele pred
> uvozom pravih plačil):** (D1) preklic rezervacije PO izdanem provizijskem
> računu nima clawbacka/dobropisa; (D2) atribucija „consultation" temelji na
> substring omembi imena v AI odgovoru (največ 5 zadnjih konzultacij) —
> izpustljiva in napihljiva, nadomestiti s persistiranimi partner ID-ji ob
> konzultaciji; (D3) Stripe `async_payment_succeeded` dogodek ni obdelan —
> SEPA plačila provizijskih računov se ne označijo samodejno (kartice delujejo);
> (D4) model zmogljivosti/slotov za izkušnje ne obstaja (sočasne rezervacije
> istega termina so možne po zasnovi); (D5) rate limiter je pomnilniški,
> fiksno-okenski in per-instanca (meja se pomnoži z instancami/hostname-i —
> dokumentirano, načrtovan Upstash); (D6) reviews nimajo unique/capa na
> (izdelek, avtor) brez nakupa.
>
> ✅ **Posodobitev 2026-09-25 (revizija #11 — ISSUE #4 VAL 8, v1.100.0):**
> zaključena §23/§24 preverba (dva read-only audita z dokazi file:line).
> Zaprto: **P1** `importData` leak (surovi kontakt/notes uvoženih rezervacij
> javno vsem s shareId — GET in POST kanal `journey/bookings`); **P1**
> robots.txt dvojni vir (statična datoteka je v produkciji tiho preglasila
> dinamični handler → brez Sitemap direktive in brez Disallow /admin,/owner,
> /api/; v devu 500 konflikt — `public/robots.txt` izbrisan); **P2** claim
> takeover (prevzem anonimne poti zdaj zahteva editToken; prej zadostoval
> javen shareId); **P2** vabila brez roka (PENDING inviteToken 7 dni TTL →
> 410); **P2** admin geslo v localStorage (`admin_token`) → httpOnly HMAC
> session piškotek `dsa_admin_session` (TTL 60 min, ključ iz ADMIN_PASSWORD —
> rotacija gesla razveljavi vse seje; `checkAdmin(request)` = piškotek ALI
> glava, nazaj kompatibilno; nova `/api/admin/logout`); **P3** nepokriti
> rate limiti (weather 60/min — edini javni zunanji-proksi; vsi owner API-ji
> 120/min skupni bucket `owner-api`; user/trips, provider-roi,
> stripe/checkout+portal); timing-safe `editTokenHash`; `X-Robots-Tag:
> noindex` na `/pot/*`; oracle zaprtje (zasebna pot → 404, ne 403).
> **D5 rešen v dokumentaciji**: produkcija = 1 Render instanca (Vercel
> upokojen) → meje držijo nominalno; shared rešitev DOLOČENA (rate-limit.ts
> glava + spodaj §1.7): Upstash Redis REST — 2 env spremenljivki
> (`UPSTASH_REDIS_REST_URL`/`_TOKEN`), `hitLimit` telo → INCR+EXPIRE
> pipeline (~1 s timeout, fail-open na lokalni števec), async podpis
> rateLimit/hitLimit (~50 klicnih mest) — izvedba namensko odložena, dokler
> razširjanje instanc ni realno. Odpri dolgova ostajata: D3 (SEPA async
> plačila — pred uvozom pravih plačil) in D6; D5 prenesen iz "dolga" v
> "določeno rešitev z odloženim terminom". **Provider past (3. zadetek,
> nenamerni UUID commit 1691d29 — nikoli pushan):** `.githooks/pre-commit`
> (verzioniran; `git config core.hooksPath .githooks`) zavrne vsak commit s
> `provider = "sqlite"` v staged shemi.

---

## 1. Security Checklist

### 1.1 HTTP Security Headers

| Header | Vrednost (dejanska, next.config.ts) | Status |
|--------|---------|--------|
| Content-Security-Policy | default-src 'self'; script-src 'self' 'unsafe-inline' (prod; dev doda 'unsafe-eval'); style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' blob: (prod); media-src 'self' blob:; frame-ancestors 'none'; base-uri/form-action/object-src | ✅ Implementirano (v1.1.0; ostrenje v1.35.0) |
| Strict-Transport-Security | max-age=63072000; includeSubDomains | ✅ Implementirano |
| X-Frame-Options | DENY | ✅ Implementirano |
| X-Content-Type-Options | nosniff | ✅ Implementirano |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ Implementirano |
| Permissions-Policy | camera=(), microphone=(), geolocation=(self), payment=() | ✅ Implementirano |

> ⚠️ Trade-off (zavestno, dokumentirano v next.config.ts):
> `script-src 'unsafe-inline'` je potreben za Next.js App Router hydration
> inline skripte (nonce-CSP bi zahteval middleware + konec statične
> optimizacije); `img-src https:` pokriva zunanje slike iz DB (surovi
> `<img>` — gostiteljev ni mogoče enumerirati; meji sta moderacija +
> write-time URL validacija).

**Implementacija:**

```typescript
// next.config.ts
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.puter.com https://overpass-api.de https://api.open-meteo.com https://*.wikipedia.org; frame-ancestors 'none';",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

export default {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};
```

### 1.2 Authentication & Authorization

| Aspekt | Status | Opomba |
|--------|--------|--------|
| Password hashing | ✅ bcrypt (12 rounds) | |
| Session management | ✅ NextAuth JWT | |
| Session expiry | ⚠️ 30 dni (default) | |
| Admin auth | ✅ ADMIN_PASSWORD header | |
| Owner auth | ✅ NextAuth session | |
| Rate limiting na auth | ✅ Hibridni ip+email: 10 poskusov / 15 min (oba providerja) | |
| Brute force protection | ✅ Rate limit (10/15 min) + bcrypt cikla tudi ob neobstoječem računu + timing-izenačitev (DUMMY_HASH) | |
| 2FA | ❌ Ni implementirano | Za admin (kasneje) |

### 1.3 Input Validation

| Endpoint | Validacija | Status |
|----------|-----------|--------|
| `/api/leads` | Zod schema | ✅ |
| `/api/owner/register` | Zod schema | ✅ |
| `/api/owner/listings` | Zod schema | ✅ |
| `/api/itinerary` | Manual | ⚠️ Zod |
| `/api/chat` | Manual | ⚠️ Zod |
| `/api/smart-search` | Manual | ⚠️ Zod |
| `/api/newsletter/subscribe` | Email regex | ✅ |
| All admin endpoints | Admin password | ✅ |

### 1.4 SQL Injection

- ✅ Prisma ORM (parameterized queries)
- ✅ Nikoli raw SQL z user input
- ⚠️ Če uporabljamo `$queryRaw`, vedno parameterized

### 1.5 XSS (Cross-Site Scripting)

- ✅ React avtomatsko escape-a
- ✅ Nikoli `dangerouslySetInnerHTML` z user input
- ⚠️ Email templates — preveri HTML escaping
- ⚠️ Listing descriptions — preveri da se ne render-a kot HTML

### 1.6 CSRF (Cross-Site Request Forgery)

- ✅ NextAuth ima vgrajen CSRF token
- ✅ SameSite=Lax cookies (default)
- ⚠️ Za API routes ki ne uporabljajo NextAuth — preveri

### 1.7 Rate Limiting

Implementirano (v1.1.0+, in-memory per-instanka — na Vercelu deluje per-instanca;
za centralizirano omejitev pred javnim launchem: glej »Pot do centralizacije« spodaj):

| Endpoint | Limit | Implementacija |
|----------|-------|---------------|
| `/api/itinerary` | 10/10min/IP | ✅ In-memory |
| `/api/chat` | 20/10min/IP | ✅ In-memory |
| `/api/smart-search` | 30/10min/IP | ✅ In-memory |
| `/api/owner/auto-tag` | 5/10min | ✅ In-memory |
| `/api/leads` | 10/h/IP | ✅ In-memory |
| `/api/newsletter/subscribe` | 10/h/IP | ✅ In-memory |
| `/api/owner/register` | 10/h/IP | ✅ In-memory |
| Login (owner + user provider) | 10/15min/ip+email | ✅ In-memory (src/lib/auth.ts; 1.28.0 hibrid — prej email-only, DoS vektor) |
| Admin verify + leads-dashboard | 10/10min, 60/10min | ✅ In-memory |

(`⚠️ Dodati` vrstice iz arhiva: `/api/owner/session` je bil izbrisan v P4-9.)

**Implementacija (memory-based):**

```typescript
// src/lib/rate-limit.ts

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return { success: true, remaining: limit - 1, resetIn: windowMs };
  }

  if (entry.count >= limit) {
    return {
      success: false,
      remaining: 0,
      resetIn: entry.resetTime - now,
    };
  }

  entry.count++;
  return {
    success: true,
    remaining: limit - entry.count,
    resetIn: entry.resetTime - now,
  };
}

// Uporaba v API route
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { success, resetIn } = rateLimit(`itinerary:${ip}`, 10, 60 * 60 * 1000);

  if (!success) {
    return NextResponse.json(
      { error: "Preveč zahtevkov. Poskusite kasneje.", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(resetIn / 1000)) },
      }
    );
  }

  // ... normal logic
}
```

**Pot do centralizacije (odložena odločitev — točen načrt, 1.28.0):**

Status: pilot teče na per-instanca limitih (zavedno sprejeto — glej znane
omejitve). Ko bo čas pred javnim prometom, JE brezplačna pot, ki ne zahteva
arhitekturnega predraziskovanja:

1. **Upstash Redis free tier** (10.000 ukazov/dan — za pilot zadostuje):
   samo 2 env spremenljivki (`UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`), dostop prek navadnega `fetch` (REST, 0 novih
   odvisnosti), vzorec fixed-window `INCR` + `EXPIRE`.
2. **Refactor, ki ga takrat zahteva** (točen obseg, da ni raziskovanja):
   `rateLimit()`/`hitLimit()` sta sinhroni → centraliziran števec je omrežni
   klic = async → `rateLimit` postane async in **~79 klicnih mest** v
   `src/app/api/**` dobi `await` (mehansko, enak vzorec povsod); ob napaki
   omrežja fail-open na obstoječi in-memory bucket (strateška odločitev:
   rate limit NI razlog za padec strani).
3. **Zakaj NI implementirano danes**: brez računa pri ponudniku spremembe
   ni mogoče preveriti živo (smo pod zavezo »ne izdaj nepreverjenih
   trditev« — enako pravilo kot pri AI plasteh); async refactor 79 mest brez
   živega store-a bi bil nepreverjena infrastruktura v produkciji.

Zavrnjene alternative (z razlogi):
- **Postgres/Neon kot limit store** — vsaka zahteva bi pisala v DB;
  `connection_limit=1` na Neon poolerju je že pri vzporednem obremenjevanju
  dokumentirano povzročal HTTP 500 (SEO-CACHE incident, 2026-09).
- **Vercel WAF / platformni rate limiting** — plačljivi načrti.

Ublažitvi, ki že živita neodvisno od centralizacije (1.28.0):
- login limit je na **ip+email** hibridu → DoS vektor (blokada žrtvine
  prijave) odstranjen tudi na per-instanca rešitvi;
- admin geslo je timing-safe na VSEH poteh (`checkAdmin`/`verifyCronAuth`).

### 1.8 Secrets Management

| Secret | Kje | Status |
|--------|-----|--------|
| `ADMIN_PASSWORD` | .env (Vercel) | ⚠️ Močno geslo v prod |
| `NEXTAUTH_SECRET` | .env (Vercel) | ⚠️ Generiraj random |
| `PUTER_AUTH_TOKEN` | .env (Vercel) | ✅ |
| `STRIPE_SECRET_KEY` | .env (Vercel) | ⚠️ Production keys |
| `STRIPE_WEBHOOK_SECRET` | .env (Vercel) | ⚠️ |
| `SMTP_PASS` | .env (Vercel) | ⚠️ |
| `CRON_SECRET` | .env (Vercel) | ⚠️ Generiraj random |

**Pravila:**
- ✅ Nikoli v Git
- ✅ Nikoli v client-side kodi
- ✅ `.env.example` brez realnih vrednosti
- ✅ Vercel environment variables

### 1.9 Admin Endpoints

| Zaščita | Status |
|---------|--------|
| Admin password required | ✅ |
| Rate limiting | ⚠️ Dodati |
| IP whitelist (optional) | ❌ Ne (Vercel dynamic IP) |
| Audit log | ⚠️ Dodati |

### 1.10 Upload Validation

| Tip | Validacija | Status |
|------|-----------|--------|
| Listing images | URL only (no upload) | ✅ |
| Product images | URL only | ✅ |
| Owner avatar | URL only | ✅ |
| File uploads | Ni implementirano | N/A |

### 1.11 Dependency Security

```bash
# Pred vsakim deployjem
bun audit

# Če so kritične ranljivosti:
bun update <package>
```

### 1.12 CORS (Cross-Origin Resource Sharing)

- ✅ API routes samo za isti origin
- ✅ Webhook endpoints (Stripe) — signature verification
- ⚠️ Če dodamo API za partnerje — konfiguriraj CORS

---

## 2. Security Audit Checklist (pred deploy)

- [x] Security headers konfigurirani (next.config.ts — od v1.1.0; CSP ostren v1.35.0)
- [ ] Vsi API endpoints imajo input validation (Zod)
- [ ] Rate limiting implementiran na kritičnih endpointih
- [ ] Vsi secrets v Vercel env (ne v kodi)
- [ ] ADMIN_PASSWORD je močan (min 32 znakov, random)
- [ ] NEXTAUTH_SECRET generiran random
- [ ] Stripe webhook signature verification deluje
- [ ] `bun audit` brez kritičnih ranljivosti
- [ ] Email templates escape-a HTML
- [ ] Nikoli `dangerouslySetInnerHTML` z user input
- [ ] HTTPS obvezen (Vercel auto)
- [ ] CSP preprečuje XSS
- [ ] HSTS omogočen
- [ ] X-Frame-Options: DENY (prepreči clickjacking)

---

## 3. Periodični security pregledi

| Pregled | Frekvenca | Lastnik |
|---------|-----------|---------|
| `bun audit` | Tedensko | Engineering |
| Security headers check | Mesečno | Engineering |
| Password policy review | Četrtletno | Engineering |
| Penetration test | Letno | External |
| Dependency update | Mesečno | Engineering |

---

## 4. Incident Response (varnostni)

### 4.1 Če sumiš na napad

```
1. OBLIKUJ INCIDENT (P0)
   ├── Assign severity
   ├── Ustavi napad (block IP, disable endpoint)
   └── Komuniciraj z ekipo

2. FORENZIKA
   ├── Backup trenutnega stanja
   ├── Analiziraj log-e
   ├── Identificiraj ranljivost
   └── Določi obseg

3. MITIGACIJA
   ├── Patch ranljivost
   ├── Notify uporabnike (če PII kompromitiran - GDPR 72h)
   └── Spremeni kompromitirane secret-e

4. POST-MORTEM
   ├── Kaj se je zgodilo?
   ├── Zakaj?
   ├── Kako preprečiti?
   └── Update Risk Register
```

---

**Konec Security Review.**
