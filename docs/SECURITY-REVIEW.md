# Security Review

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Zadnji varnostni pregled pred produkcijo

---

## 1. Security Checklist

### 1.1 HTTP Security Headers

| Header | Vrednost | Status |
|--------|---------|--------|
| Content-Security-Policy | strict | ⚠️ Implementirati |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | ⚠️ Implementirati |
| X-Frame-Options | DENY | ⚠️ Implementirati |
| X-Content-Type-Options | nosniff | ⚠️ Implementirati |
| Referrer-Policy | strict-origin-when-cross-origin | ⚠️ Implementirati |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | ⚠️ Implementirati |

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
| Rate limiting na auth | ⚠️ Dodati | 5 poskusov/IP |
| Brute force protection | ⚠️ Dodati | Lockout po 5 napakah |
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
| `/api/newsletter` | Email regex | ✅ |
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

| Endpoint | Limit | Implementacija |
|----------|-------|---------------|
| `/api/itinerary` | 10/hour/IP | ⚠️ Dodati |
| `/api/chat` | 20/hour/IP | ⚠️ Dodati |
| `/api/smart-search` | 30/hour/IP | ⚠️ Dodati |
| `/api/owner/auto-tag` | 5/hour/owner | ⚠️ Dodati |
| `/api/leads` | 3/hour/IP | ⚠️ Dodati |
| `/api/newsletter` | 3/hour/IP | ⚠️ Dodati |
| `/api/owner/register` | 5/hour/IP | ⚠️ Dodati |
| `/api/owner/session` (login) | 10/hour/IP | ⚠️ Dodati |

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

- [ ] Security headers konfigurirani (next.config.ts)
- [ ] Vsi API endpoints imajo input validation (Zod)
- [ ] Rate limiting implementiran na kritičnih endpointih
- [ ] Vsi secrets v Vercel env (ne v kodi)
- [ ] ADMIN_PASSWORD je močan (ne discoverslovenia2025 v prod)
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
