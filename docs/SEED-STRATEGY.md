# Seed Strategy

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Ločevanje development, demo in production seed podatkov

---

## 1. Tri tipi seed podatkov

```
┌─────────────────────────────────────────────────────────────┐
│                    SEED STRATEGIJA                           │
└─────────────────────────────────────────────────────────────┘

  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │  DEVELOPMENT    │  │     DEMO        │  │   PRODUCTION    │
  │     SEED        │  │     SEED        │  │    BOOTSTRAP    │
  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤
  │ - 25 listings   │  │ - 10 listings   │  │ - 0 listings    │
  │ - 28 products   │  │ - 10 products   │  │ - 0 products    │
  │ - 28 experiences│  │ - 10 experiences│  │ - 0 experiences │
  │ - test users    │  │ - real-ish data │  │ - 1 super admin │
  │ - dummy data    │  │ - za demo       │  │ - 1 admin user  │
  └─────────────────┘  └─────────────────┘  └─────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
   bun run db:seed:dev   bun run db:seed:demo   bun run db:seed:prod
```

---

## 2. Development Seed (dev environment)

### 2.1 Namen

- Lokalni razvoj brez prazne baze
- Testiranje funkcionalnosti z realnimi podatki
- Hitri reset za debugging

### 2.2 Vsebina

```typescript
// prisma/seed-dev.ts

import { db } from "@/lib/db";

async function main() {
  console.log("🌱 Seeding development data...");

  // 1. Test ownerji (različni paketi)
  await db.owner.create({
    data: {
      email: "beta-test@demo.si",
      name: "Test Owner",
      businessName: "Test Bled d.o.o.",
      passwordHash: "$2a$10$...", // "test123"
      plan: "free",
      role: "provider",
    },
  });

  await db.owner.create({
    data: {
      email: "premium@demo.si",
      name: "Premium Owner",
      businessName: "Hotel Triglav",
      passwordHash: "$2a$10$...", // "premium123"
      plan: "premium",
      subscriptionStatus: "active",
      role: "provider",
    },
  });

  // 2. Vsi listings (25), products (28), experiences (28)
  // — iz seed-listings.ts in seed-expand.ts

  // 3. Test user (registrirani uporabnik)
  await db.user.create({
    data: {
      email: "user@demo.si",
      name: "Test User",
      passwordHash: "$2a$10$...", // "user123"
      preferences: JSON.stringify({ interests: ["narava", "kultura"] }),
    },
  });

  // 4. Admin user
  // (preko ADMIN_PASSWORD env, ne v bazi)

  console.log("✅ Development seed complete");
  console.log("Test accounts:");
  console.log("  - beta-test@demo.si / test123 (free provider)");
  console.log("  - premium@demo.si / premium123 (premium provider)");
  console.log("  - user@demo.si / user123 (regular user)");
  console.log("  - admin: use ADMIN_PASSWORD env");
}

main().catch(console.error).finally(async () => await db.$disconnect());
```

### 2.3 Paketni JSON script

```json
// package.json
{
  "scripts": {
    "db:seed:dev": "bun run prisma/seed-dev.ts",
    "db:reset:dev": "bun run prisma migrate reset && bun run db:seed:dev"
  }
}
```

### 2.4 Kdaj uporabljati

- `bun run db:reset:dev` — ko želiš čist start
- `bun run db:seed:dev` — ko želiš dodati seed v obstoječo bazo
- **Nikoli v produkciji!**

---

## 3. Demo Seed (za prezentacije)

### 3.1 Namen

- Demo za investorje, partnerje
- Real-look podatki brez testnih userjev
- Manjši obseg (bolj pregledno)

### 3.2 Vsebina

```typescript
// prisma/seed-demo.ts

async function main() {
  console.log("🎭 Seeding demo data...");

  // 1. 10 najboljših listings (featured)
  const demoListings = [
    "Hotel Vila Bled",
    "Hiša Franko",
    "Restavracija JB",
    "Gostilna AS",
    "Hotel Triglav Bled",
    "Grand Hotel Portorož",
    "Stara trta",
    "Penzion Berc",
    "Vogel Cable Car",
    "Soča Rafting Bovec",
  ];

  // 2. 10 izbranih products
  const demoProducts = [
    "Cviček 0.75l — Dolenjska",
    "Tolminski sir 1kg",
    "Kranjska klobasa (par) — zaščitena",
    "Prekmurska gibanica (cel pekač)",
    "Bučno olje ekstra 250ml — Lendava",
    // ...
  ];

  // 3. 10 izbranih experiences
  const demoExperiences = [
    "Sprehod po Blejskem otoku s pletno vožnjo",
    "Rafting na Soči — adrenalinski pol dan",
    "Degustacija vina v Vipavski dolini",
    // ...
  ];

  // 4. Brez testnih userjev
  // (admin preko ADMIN_PASSWORD)

  console.log("✅ Demo seed complete");
  console.log("Demo data: 10 listings, 10 products, 10 experiences");
}

main().catch(console.error).finally(async () => await db.$disconnect());
```

### 3.3 Paketni JSON script

```json
{
  "scripts": {
    "db:seed:demo": "bun run prisma/seed-demo.ts"
  }
}
```

### 3.4 Kdaj uporabljati

- Pred demo predstavitvijo
- Na staging environmentu
- Za testiranje UI brez testnih podatkov

---

## 4. Production Bootstrap (začetna konfiguracija)

### 4.1 Namen

- Minimalna konfiguracija za delujočo produkcijo
- Brez testnih podatkov
- Samo admin dostop + sistemski podatki

### 4.2 Vsebina

```typescript
// prisma/seed-prod.ts

async function main() {
  console.log("🚀 Bootstrapping production...");

  // 1. NE ustvari nobenega ownerja
  // (pravi providerji se bodo registrirali)

  // 2. NE ustvari nobenega listinga
  // (providerji bodo dodali svoje)

  // 3. Ustvari samo sistemske podatke

  // a) Beta status
  await db.betaStatus.upsert({
    where: { id: "main" },
    update: {},
    create: {
      id: "main",
      listingCount: 0,
      threshold: 30,
      monetizationEnabled: false,
    },
  });

  // b) Affiliate config (če v bazi)
  // (trenutno v static code — affiliate.ts)

  // c) Destinacije (če v bazi)
  // (trenutno v static code — slovenia-data.ts)

  console.log("✅ Production bootstrap complete");
  console.log("System ready for first provider registration");
}

main().catch(console.error).finally(async () => await db.$disconnect());
```

### 4.3 Paketni JSON script

```json
{
  "scripts": {
    "db:seed:prod": "bun run prisma/seed-prod.ts"
  }
}
```

### 4.4 Kdaj uporabljati

- Ob prvem deployu v produkcijo
- Po popolnem resetu produkcije
- **Nikoli v dev!** (potrebuješ testne podatke)

---

## 5. Migration med okolji

### 5.1 Dev → Staging

```bash
# 1. Dump dev baze
sqlite3 db/custom.db ".dump" > staging-dump.sql

# 2. Sanitiziraj (odstrani test userje, hash password)
# (ročno ali skripta)

# 3. Import na staging
# (Vercel: turso db dump + restore)
```

### 5.2 Staging → Production

```
NIKOLI!

Produkcija ima svoje podatke.
Samo admini lahko ročno dodajajofeatured listings če želijo.
```

---

## 6. Seed skripte registracija

```json
// package.json (končno)
{
  "scripts": {
    "db:push": "prisma db push",
    "db:migrate:dev": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:migrate:status": "prisma migrate status",
    "db:seed:dev": "bun run prisma/seed-dev.ts",
    "db:seed:demo": "bun run prisma/seed-demo.ts",
    "db:seed:prod": "bun run prisma/seed-prod.ts",
    "db:reset:dev": "prisma migrate reset && bun run db:seed:dev",
    "db:studio": "prisma studio"
  }
}
```

---

## 7. Pravila

1. **Dev seed** je lahko kakršenkoli (testni podatki, dummy data)
2. **Demo seed** je real-look (brez "Test" v imenih)
3. **Production bootstrap** je minimalen (samo sistemski podatki)
4. **Nikoli** ne seedaj testnih userjev v produkcijo
5. **Vedno** dokumentiraj testna gesla v dev (ne v produkcijo!)
6. **Password hashe** v seed-u so za dev samo (bcrypt z fixed salt)

---

**Konec Seed Strategy.**
