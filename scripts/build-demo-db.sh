#!/usr/bin/env bash
# =============================================================================
# build-demo-db.sh — Vercel demo SQLite baza (Faza 4e)
# =============================================================================
# Vercel build poganja ta korak SAMO, ko je env VERCEL=1 (ali ročni flag
# DSA_BUILD_DEMO_DB=1 za lokalni test). Ustvari db/demo-seed.db:
#   1. prisma db push  (shema brez podatkov)
#   2. scripts/seed-demo.ts (demо partnerji/listingi/izdelki/rezervacije)
#   3. super_admin demo račun IZPUŠČEN (javen demo brez admin dostopa!)
#
# Runtime: src/instrumentation.ts bazo skopira v /tmp in preusmeri
# DATABASE_URL (glej tam za varovalke in omejitve demo načina).
#
# Docker/VPS (Pot A) in CI ta korak PRESKOČIJO — imajo svojo bazo
# (Dockerfile inicializira /app/db/custom.db iz volumna).
# =============================================================================
set -euo pipefail

if [ -z "${VERCEL:-}" ] && [ -z "${DSA_BUILD_DEMO_DB:-}" ]; then
  echo "[demo-db] preskočen (ni Vercel build / DSA_BUILD_DEMO_DB flag)"
  exit 0
fi

DB_PATH="$(pwd)/db/demo-seed.db"
mkdir -p "$(dirname "$DB_PATH")"
rm -f "$DB_PATH" "$DB_PATH-journal"

echo "[demo-db] ustvarjam shemo → $DB_PATH"
DATABASE_URL="file:$DB_PATH" npx prisma db push --skip-generate

echo "[demo-db] sejem demo podatke (brez super_admin racuna)"
# SKIP_DEMO_ADMIN=1: javni demo NE sme izpostaviti super_admin dostopa
# (demo partnerji z geslom demo1234 ostanejo — varen za predstavitev).
DATABASE_URL="file:$DB_PATH" SKIP_DEMO_ADMIN=1 bun scripts/seed-demo.ts

# Preračunaj velikost za log (portabilno — du ni povsod)
if command -v du >/dev/null 2>&1; then
  echo "[demo-db] končano: $DB_PATH ($(du -h "$DB_PATH" | cut -f1))"
else
  echo "[demo-db] končano: $DB_PATH"
fi
