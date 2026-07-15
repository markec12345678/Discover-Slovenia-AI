# Database Migration Strategy

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Varna in ponovljiva migracijska strategija brez izpadov

---

## 1. Načela migracij

### 1.1 Vsa migracija morajo biti:

| Načelo | Opis | Kako |
|--------|------|------|
| **Idempotentne** | Večkratno poganjanje da isti rezultat | `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` |
| **Reverzibilne** | Imajo rollback plan | Vsaka migracija ima `up()` in `down()` |
| **Atomarne** | Vse ali nič | Transakcije v SQLite |
| **Testirane** | Najprej na staging | Migrate → test → rollback → migrate |
| **Dokumentirane** | Kaj, zakaj, kdaj | Commit message + CHANGELOG |

### 1.2 Pravilo verzioniranja

```
migrations/
├── 2025_01_15_000_add_listing_status.sql
├── 2025_01_15_001_add_sponsorship_table.sql
├── 2025_01_15_002_add_analytics_tables.sql
├── 2025_01_15_003_add_user_saved_itinerary.sql
└── 2025_01_15_004_add_owner_role.sql
```

Format: `YYYY_MM_DD_NNN_opis.sql`

---

## 2. Migracijske faze (za vsako migracijo)

```
1. BACKUP
   └── Backup DB pred vsako migracijo

2. STAGING TEST
   ├── Run migration on staging
   ├── Run tests
   ├── Verify data integrity
   └── Run rollback test

3. PRODUCTION
   ├── Maintenance window (if breaking)
   ├── Run migration
   ├── Verify
   └── Monitor (1h)

4. POST-MIGRATION
   ├── Monitor errors
   ├── Verify feature parity
   └── Document in CHANGELOG
```

---

## 3. Specifične migracije za Fazo 1

### 3.1 Migracija 1: Listing status sistem

```sql
-- 2025_01_15_000_add_listing_status.sql

-- UP
ALTER TABLE Listing ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE Listing ADD COLUMN rejection_reason TEXT;
ALTER TABLE Listing ADD COLUMN submitted_at DATETIME;
ALTER TABLE Listing ADD COLUMN approved_at DATETIME;
ALTER TABLE Listing ADD COLUMN approved_by TEXT;

-- Migriraj obstoječe lokalce na 'published' (da ostanejo vidni)
UPDATE Listing SET status = 'published' WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_listing_status ON Listing(status);

-- DOWN (rollback)
DROP INDEX IF EXISTS idx_listing_status;
ALTER TABLE Listing DROP COLUMN approved_by;
ALTER TABLE Listing DROP COLUMN approved_at;
ALTER TABLE Listing DROP COLUMN submitted_at;
ALTER TABLE Listing DROP COLUMN rejection_reason;
ALTER TABLE Listing DROP COLUMN status;
```

**Rollback test:**
```bash
# 1. Backup
cp db/custom.db db/custom.db.bak

# 2. Migrate
bun run prisma migrate deploy

# 3. Verify
sqlite3 db/custom.db "SELECT status, COUNT(*) FROM Listing GROUP BY status;"
# Pričakovan rezultat: published: 25

# 4. Rollback
bun run prisma migrate resolve --rolled-back 2025_01_15_000_add_listing_status

# 5. Verify rollback
sqlite3 db/custom.db "PRAGMA table_info(Listing);" | grep status
# Pričakovan rezultat: (prazno - stolpec ne obstaja)
```

### 3.2 Migracija 2: Sponsorship tabela

```sql
-- 2025_01_15_001_add_sponsorship_table.sql

-- UP
CREATE TABLE IF NOT EXISTS Sponsorship (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  level TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'EUR',
  status TEXT DEFAULT 'created',
  stripe_payment_id TEXT,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES Listing(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES Owner(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sponsorship_listing ON Sponsorship(listing_id);
CREATE INDEX IF NOT EXISTS idx_sponsorship_owner ON Sponsorship(owner_id);
CREATE INDEX IF NOT EXISTS idx_sponsorship_status ON Sponsorship(status);
CREATE INDEX IF NOT EXISTS idx_sponsorship_ends ON Sponsorship(ends_at);

-- DOWN
DROP TABLE IF EXISTS Sponsorship;
```

### 3.3 Migracija 3: Analytics tabele

```sql
-- 2025_01_15_002_add_analytics_tables.sql

-- UP
CREATE TABLE IF NOT EXISTS AnalyticsEvent (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  metadata TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON AnalyticsEvent(type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON AnalyticsEvent(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON AnalyticsEvent(session_id);

CREATE TABLE IF NOT EXISTS AIUsageLog (
  id TEXT PRIMARY KEY,
  feature TEXT NOT NULL,
  source TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  response_time INTEGER NOT NULL,
  cost_eur REAL DEFAULT 0,
  user_id TEXT,
  session_id TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON AIUsageLog(feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_source ON AIUsageLog(source);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON AIUsageLog(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_success ON AIUsageLog(success);

-- DOWN
DROP TABLE IF EXISTS AIUsageLog;
DROP TABLE IF EXISTS AnalyticsEvent;
```

### 3.4 Migracija 4: User + SavedItinerary

```sql
-- 2025_01_15_003_add_user_saved_itinerary.sql

-- UP
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  preferences TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS SavedItinerary (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  itinerary TEXT NOT NULL,
  form_data TEXT NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_saved_itinerary_user ON SavedItinerary(user_id);

-- DOWN
DROP TABLE IF EXISTS SavedItinerary;
DROP TABLE IF EXISTS User;
```

### 3.5 Migracija 5: Owner role

```sql
-- 2025_01_15_004_add_owner_role.sql

-- UP
ALTER TABLE Owner ADD COLUMN role TEXT DEFAULT 'provider';
CREATE INDEX IF NOT EXISTS idx_owner_role ON Owner(role);

-- DOWN
DROP INDEX IF EXISTS idx_owner_role;
ALTER TABLE Owner DROP COLUMN role;
```

---

## 4. Strategija za produkcijo (zero-downtime)

### 4.1 Pravila

1. **Brez breaking changes** v produkcijskih migracijah
2. **Additive only** — samo dodajanje stolpcev/tabel
3. **Backward compatible** — stara koda mora delovati z novo shemo
4. **Staged rollout** — najprej shema, potem koda

### 4.2 Postopek za produkcijo

```
KORAK 1: Pripravi novo shemo (additive only)
         └── Dodaj stolpce z default vrednostmi
         └── Ne odstrani starših stolpcev

KORAK 2: Deploy nove kode ki uporablja novo shemo
         └── Stara koda še vedno deluje (ignorira nove stolpce)
         └── Nova koda uporablja nove stolpce

KORAK 3: Po 1 tednu (ko vsi uporabniki prešli)
         └── Migracija ki odstrani stare stolpce (če potrebno)

KORAK 4: Verify + monitor
```

### 4.3 Primer: listing status (zero-downtime)

```
FAZA 1 (sedaj):
  - ALTER TABLE Listing ADD COLUMN status DEFAULT 'draft'
  - UPDATE Listing SET status = 'published' WHERE 1=1
  - Stara koda: ne uporablja 'status' (ignorira)
  - Nova koda: preverja 'status' = 'published'

FAZA 2 (po deployu):
  - Nova koda zahteva 'status' = 'published'
  - Vsi lokalci že imajo 'status' = 'published'

FAZA 3 (po 1 tednu):
  - Dodaj NOT NULL constraint (če želimo)
```

---

## 5. Backup pred migracijo

### 5.1 Avtomatski backup

```bash
# scripts/backup-before-migration.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="db/backups"
mkdir -p $BACKUP_DIR

# SQLite backup (VACUUM INTO = konsistentna kopija)
sqlite3 db/custom.db "VACUUM INTO '$BACKUP_DIR/custom_$DATE.db'"

# Cache backup
cp -r data/ $BACKUP_DIR/data_$DATE/

echo "✅ Backup created: $BACKUP_DIR/custom_$DATE.db"
echo "Last 5 backups:"
ls -lt $BACKUP_DIR/*.db | head -5
```

### 5.2 Restore procedure

```bash
# scripts/restore-from-backup.sh
#!/bin/bash
BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore-from-backup.sh <backup_file>"
  exit 1
fi

# Stop app (prepreči konflikte)
# (Vercel: deploy maintenance page)

# Backup current (za vsak slučaj)
cp db/custom.db db/custom.db.pre-restore

# Restore
cp $BACKUP_FILE db/custom.db

# Verify
sqlite3 db/custom.db "SELECT COUNT(*) FROM Listing;"
echo "✅ Restored from $BACKUP_FILE"

# Restart app
```

---

## 6. Migracijski checklist

Pred vsako produksijsko migracijo:

- [ ] Backup narejen in verificiran
- [ ] Migracija testirana na staging
- [ ] Rollback testiran na staging
- [ ] Koda kompatibilna z novo shemo
- [ ] Koda kompatibilna s staro shemo (backward compat)
- [ ] Monitoring pripravljen (error rate, response time)
- [ ] Maintenance page pripravljen (če potrebno)
- [ ] Komunikacijski plan (kdo obveščen)
- [ ] Rollback plan dokumentiran
- [ ] Post-migracije verify skripta pripravljena

---

## 7. Tools

| Tool | Namembnost |
|------|-----------|
| `prisma migrate dev` | Razvoj (ustvari + aplicira) |
| `prisma migrate deploy` | Produkcija (samo aplicira) |
| `prisma migrate resolve` | Manual resolve/rollback |
| `prisma migrate status` | Preveri stanje |
| `prisma studio` | Vizualni pregled podatkov |
| `sqlite3` CLI | Direktni DB dostop |

---

**Konec Database Migration Strategy.**
