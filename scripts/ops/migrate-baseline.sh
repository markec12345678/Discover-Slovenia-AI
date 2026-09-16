#!/usr/bin/env bash
# ============================================================================
# migrate-baseline.sh — MIGR-HISTORY (1.27.1): enkratna uvedba migration
# baseline-a na produkciji (Neon Postgres)
# ----------------------------------------------------------------------------
# NAMEN: označi baseline migracijo 20260916000000_baseline kot ŽE UPORABLJENO
# v produkciji (shema tam že obstaja od prej) in preveri sinhronost — šele
# po tem so db:deploy vrata (prisma migrate deploy) varna za uporabo.
#
# ZAKO SKRIPTA (in ne ročni ukaz iz DEPLOYMENT.md 4a): lokalni klon ima
# schema.prisma na sqlite (skip-worktree override za lokalni dev) — direktni
# klic `DATABASE_URL=… bunx prisma migrate resolve` iz takega klona padne s
# P1012 ("the URL must start with the protocol file:"). Skripta zato za čas
# ukaza zamenja shemo na committed POSTGRES verzijo in jo ob izhodu povrne
# (trap EXIT — tudi ob napaki/prekinitvi).
#
# UPORABA:
#   ./migrate-baseline.sh "<neon-postgres-url>"
#   (URL dobiš v Vercel ali Render dashboardu → Settings → Environment
#    Variables → DATABASE_URL)
#
# VARNOST: `migrate resolve --applied` NE spreminja podatkovne sheme — vstavi
# le eno vrstico v _prisma_migrations tabelo (ustvari jo, če še ne obstaja).
# Varno izvesti ob živem prometu. Prisma v izpisu pokaže gostitelja, ne
# poverilnic.
#
# IZHOD: 0 = baseline označen + status sinhron · 1 = napaka (produkcija takrat
#        NI bila spremenjena — resolve je enovrstični vnos)
# ============================================================================
source "$(dirname "$0")/lib.sh"

MIGRATION_ID="20260916000000_baseline"
SCHEMA_REL="prisma/schema.prisma"
MIGRATION_FILE="${REPO_ROOT}/prisma/migrations/${MIGRATION_ID}/migration.sql"

URL="${1:-}"
[ -n "$URL" ] || die "Uporaba: $0 \"<neon-postgres-url>\"   (iz Vercel/Render env DATABASE_URL)"

# ── Validacija vnosa (pred čimerkoli drugim) ──────────────────────────────
case "$URL" in
  postgres://*|postgresql://*) : ;;
  file:*|sqlite:*)
    die "To je SQLITE url — rabiš PRODUKCIJSKI Postgres URL (Vercel/Render env DATABASE_URL)" ;;
  *)
    die "URL se mora začeti s postgres:// ali postgresql://" ;;
esac

[ -f "$MIGRATION_FILE" ] || die "Manjka prisma/migrations/${MIGRATION_ID}/migration.sql — si na starem checkoutu (rabiš 1.27.0+)"
git -C "$REPO_ROOT" show "HEAD:${SCHEMA_REL}" >/dev/null 2>&1 || die "Committed ${SCHEMA_REL} ni dosegljiv (git)"

# ── Zamenjava sqlite → postgres shema (trap povrne) ───────────────────────
BACKUP="$(mktemp)"
cp "${REPO_ROOT}/${SCHEMA_REL}" "$BACKUP"
restore_schema() {
  cp "$BACKUP" "${REPO_ROOT}/${SCHEMA_REL}"
  rm -f "$BACKUP"
}
trap restore_schema EXIT

if cmp -s "$BACKUP" <(git -C "$REPO_ROOT" show "HEAD:${SCHEMA_REL}"); then
  info "Lokalna shema je že committed postgres verzija (svež klon) — zamenjava ni potrebna"
else
  info "Zamenjujem lokalno sqlite shemo → committed postgres (povrnjena bo ob izhodu)"
  git -C "$REPO_ROOT" show "HEAD:${SCHEMA_REL}" > "${REPO_ROOT}/${SCHEMA_REL}"
fi

# ── 1/2: resolve ──────────────────────────────────────────────────────────
step "1/2 — Označevanje baseline-a kot uporabljenega (${MIGRATION_ID})"
if DATABASE_URL="$URL" bunx prisma migrate resolve --applied "$MIGRATION_ID"; then
  ok "Baseline zabeležen v _prisma_migrations"
else
  die "migrate resolve NI uspel — produkcija ni spremenjena; preveri URL in dostop"
fi

# ── 2/2: status (dokaz sinhronosti) ───────────────────────────────────────
step "2/2 — Preverjanje sinhronosti (pričakovano: »up to date«)"
if DATABASE_URL="$URL" bunx prisma migrate status; then
  ok "Zgodovina sinhrona — db:deploy vrata (bun run db:deploy) so zdaj varna"
else
  warn "migrate status poroča odstopanje (resolve je uspel) — preveri izpis zgoraj"
  exit 1
fi
