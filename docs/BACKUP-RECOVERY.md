# Backup Recovery Test Plan

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Preveriti da backup ne obstaja samo, ampak da lahko iz njega obnovimo sistem

---

## 1. Pravilo

> **"Backup ki ni bil testiran za obnovo, ni backup — je le upanje."**

---

## 2. Kaj backup-iramo

| Komponenta | Kje | Frekvenca | Retention |
|-----------|-----|-----------|-----------|
| **SQLite DB** | `db/custom.db` | Dnevno (cron) | 30 dni |
| **Cache datoteke** | `data/*.json` | Dnevno | 7 dni |
| **Leads** | `data/leads.json` | Dnevno | 365 dni |
| **Newsletter** | `data/newsletter.json` | Dnevno | 365 dni |
| **Prisma migrations** | `prisma/migrations/` | Git (vsak commit) | Permanent |
| **Source code** | GitHub | Vsak push | Permanent |
| **Environment vars** | Vercel | Ob spremembi | Permanent |

---

## 3. Backup procedure

### 3.1 Avtomatski dnevni backup (cron)

```typescript
// src/app/api/cron/backup/route.ts
// Poganja se dnevno ob 02:00

import { promises as fs } from "fs";
import path from "path";
import { execSync } from "child_process";

export async function GET(request: Request) {
  // Auth check
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const date = new Date().toISOString().split("T")[0];
  const backupDir = "db/backups";
  await fs.mkdir(backupDir, { recursive: true });

  // 1. SQLite backup (VACUUM INTO = konsistentna kopija)
  const dbBackup = path.join(backupDir, `db_${date}.db`);
  execSync(`sqlite3 db/custom.db "VACUUM INTO '${dbBackup}'"`);

  // 2. Data folder backup
  const dataBackup = path.join(backupDir, `data_${date}.tar.gz`);
  execSync(`tar -czf ${dataBackup} data/`);

  // 3. Cleanup starih backup-ov (>30 dni)
  const backups = await fs.readdir(backupDir);
  for (const file of backups) {
    const filePath = path.join(backupDir, file);
    const stat = await fs.stat(filePath);
    const ageDays = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 30) {
      await fs.unlink(filePath);
      console.log(`Deleted old backup: ${file}`);
    }
  }

  // 4. Upload na external storage (Vercel Blob / S3)
  // (TODO: implementiraj ko preideš na produkcijo)

  return Response.json({
    success: true,
    dbBackup,
    dataBackup,
    timestamp: new Date().toISOString(),
  });
}
```

### 3.2 Vercel cron konfiguracija

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/backup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

---

## 4. Recovery Test Plan

### 4.1 Test scenariji

| Test | Kaj preverjamo | Frekvenca |
|------|---------------|-----------|
| **T1: DB restore** | Ali lahko obnovimo SQLite iz backup-a? | Mesečno |
| **T2: Data restore** | Ali lahko obnovimo data/ folder? | Mesečno |
| **T3: Full restore** | Ali lahko obnovimo cel sistem? | Četrtletno |
| **T4: Point-in-time** | Ali lahko obnovimo na določen čas? | Četrtletno |
| **T5: External restore** | Ali backup deluje z drugo napravo? | Četrtletno |

### 4.2 T1: DB restore test

```bash
#!/bin/bash
# scripts/test-db-restore.sh

echo "=== TEST: DB Restore ==="

# 1. Backup trenutne baze
cp db/custom.db db/custom.db.pre-test
echo "✓ Trenutna baza backup-ana"

# 2. Zabeleži število zapisov
ORIGINAL_COUNT=$(sqlite3 db/custom.db "SELECT COUNT(*) FROM Listing;")
echo "✓ Original listing count: $ORIGINAL_COUNT"

# 3. Poišči najnovejši backup
LATEST_BACKUP=$(ls -t db/backups/db_*.db 2>/dev/null | head -1)
if [ -z "$LATEST_BACKUP" ]; then
  echo "❌ Ni backup-a za test"
  exit 1
fi
echo "✓ Najnovejši backup: $LATEST_BACKUP"

# 4. Obnovi iz backup-a
cp "$LATEST_BACKUP" db/custom.db
echo "✓ Baza obnovljena"

# 5. Preveri integriteto
RESTORED_COUNT=$(sqlite3 db/custom.db "SELECT COUNT(*) FROM Listing;")
echo "✓ Restored listing count: $RESTORED_COUNT"

if [ "$ORIGINAL_COUNT" != "$RESTORED_COUNT" ]; then
  echo "❌ ŠTEVILO SE NE UJEMA! Original: $ORIGINAL_COUNT, Restored: $RESTORED_COUNT"
  # Restore original
  cp db/custom.db.pre-test db/custom.db
  exit 1
fi

# 6. Preveri Prisma client
bun run -e "const {db} = require('./src/lib/db'); db.listing.count().then(c => console.log('Prisma count:', c))"

# 7. Cleanup
cp db/custom.db.pre-test db/custom.db
rm db/custom.db.pre-test

echo "✅ TEST PASSED: DB restore deluje pravilno"
```

### 4.3 T3: Full restore test

```bash
#!/bin/bash
# scripts/test-full-restore.sh

echo "=== TEST: Full System Restore ==="

# 1. Ustvari test environment
mkdir -p /tmp/restore-test
cp -r . /tmp/restore-test/
cd /tmp/restore-test

# 2. Pobriši bazo in data
rm -f db/custom.db
rm -rf data/

# 3. Obnovi iz backup-a
LATEST_DB=$(ls -t db/backups/db_*.db | head -1)
LATEST_DATA=$(ls -t db/backups/data_*.tar.gz | head -1)

cp "$LATEST_DB" db/custom.db
tar -xzf "$LATEST_DATA" -C .

# 4. Run Prisma generate
bun run prisma generate

# 5. Start app (na drugem portu)
PORT=3001 bun run dev &

# 6. Test endpoints
sleep 5
curl -s http://localhost:3001/api/listings | jq '.listings | length'
curl -s http://localhost:3001/api/products | jq '.products | length'

# 7. Cleanup
kill %1
cd ..
rm -rf /tmp/restore-test

echo "✅ TEST PASSED: Full restore deluje"
```

---

## 5. Recovery procedure (za produkcijo)

### 5.1 Kdaj obnoviti

- DB korupcija
- Heker napad
- Kritična napaka v kodi
- Izguba podatkov
- Disaster recovery

### 5.2 Koraki obnovitve

```
1. OBLIKUJ INCIDENT
   ├── Assign severity (P0)
   ├── Komuniciraj z ekipo
   └── Upostavi maintenance page

2. IDENTIFICIRAJ PROBLEM
   ├── Kaj je narobe?
   ├── Od kdaj?
   └── Kateri backup potrebujemo?

3. BACKUP TRENUTNEGA STANJA
   ├── (tudi če je korumpirano — za forenziko)
   └── cp db/custom.db db/custom.db.broken-$(date +%s)

4. OBNOVI IZ BACKUP-A
   ├── Izberi ustrezen backup
   ├── cp <backup> db/custom.db
   └── Verify integrity

5. RESTART APLIKACIJE
   ├── Vercel: redeploy
   └── Verify endpoints

6. POST-RECOVERY
   ├── Monitor 1 uro
   ├── Komuniciraj z uporabniki
   └── Post-mortem (v 48h)
```

### 5.3 Recovery skripta

```bash
#!/bin/bash
# scripts/recover-from-backup.sh

BACKUP_FILE=$1
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./recover-from-backup.sh <backup_file>"
  echo "Available backups:"
  ls -lt db/backups/db_*.db | head -5
  exit 1
fi

echo "⚠️  RECOVERY MODE"
echo "Backup file: $BACKUP_FILE"
read -p "Ali si prepričan? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Preklicano"
  exit 0
fi

# 1. Backup trenutnega (za forenziko)
BROKEN_BACKUP="db/custom.db.broken-$(date +%s)"
cp db/custom.db "$BROKEN_BACKUP"
echo "✓ Trenutno stanje backup-ano: $BROKEN_BACKUP"

# 2. Restore
cp "$BACKUP_FILE" db/custom.db
echo "✓ DB obnovljena iz $BACKUP_FILE"

# 3. Verify
echo "Listing count:"
sqlite3 db/custom.db "SELECT COUNT(*) FROM Listing;"
echo "Product count:"
sqlite3 db/custom.db "SELECT COUNT(*) FROM Product;"

echo ""
echo "✅ Recovery complete"
echo "💡 Restart aplikacije: bun run dev"
```

---

## 6. Backup monitoring

### 6.1 Alert-i

| Alert | Trigger | Akcija |
|-------|---------|--------|
| Backup ni ustvarjen | Ni novega backup-a v 24h | Email |
| Backup prevelik | DB size > 500MB | Preveri in cleanup |
| Restore test neuspešen | Test fails | Email + SMS |
| Backup corrupt | Integrity check fails | Email + SMS |

### 6.2 Monitoring skripta

```typescript
// src/app/api/cron/check-backup/route.ts
// Poganja se vsako uro

export async function GET() {
  const backupDir = "db/backups";
  const files = await fs.readdir(backupDir);

  const latestBackup = files
    .filter((f) => f.startsWith("db_"))
    .sort()
    .reverse()[0];

  if (!latestBackup) {
    await sendAlert({
      level: "critical",
      title: "Ni backup-a",
      message: "V zadnjih 24h ni bil ustvarjen backup",
    });
    return;
  }

  const backupTime = (await fs.stat(path.join(backupDir, latestBackup))).mtime;
  const ageHours = (Date.now() - backupTime.getTime()) / (1000 * 60 * 60);

  if (ageHours > 25) {
    await sendAlert({
      level: "warning",
      title: "Zastarel backup",
      message: `Zadnji backup je star ${ageHours.toFixed(1)} ur`,
    });
  }
}
```

---

## 7. Test schedule

| Test | Frekvenca | Lastnik | Naslednji test |
|------|-----------|---------|----------------|
| T1: DB restore | Mesečno | Engineering | 2025-02-15 |
| T2: Data restore | Mesečno | Engineering | 2025-02-15 |
| T3: Full restore | Četrtletno | Engineering | 2025-04-15 |
| T4: Point-in-time | Četrtletno | Engineering | 2025-04-15 |
| T5: External restore | Četrtletno | Engineering | 2025-04-15 |

---

## 8. Recovery checklist

- [ ] Backup skripta deluje (cron)
- [ ] Backup se generira dnevno
- [ ] T1 test (DB restore) opravljen
- [ ] T2 test (data restore) opravljen
- [ ] T3 test (full restore) opravljen
- [ ] Recovery skripta dokumentirana
- [ ] Ekipa ve za recovery procedure
- [ ] External storage konfiguriran (Vercel Blob/S3)
- [ ] Backup monitoring aktiven

---

**Konec Backup Recovery Test Plan.**
