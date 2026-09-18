#!/usr/bin/env bash
# ============================================================================
# migrate-deploy.sh — DEPLOY-MIGR (1.36.1): varna uveljavitev čakajočih
# migracij na produkciji (Neon Postgres) — `prisma migrate deploy` iz klona
# z lokalno SQLITE shemo
# ----------------------------------------------------------------------------
# NAMEN: `prisma migrate deploy` je edini varen način za uveljavitev novih
# migracij (npr. 20260916100000_restrict_money_fks iz 1.36.0) na produkciji.
# Direktni klic `DATABASE_URL=… bun run db:deploy` iz tega klona padne s
# P1012 ("the URL must start with the protocol file:"), ker je schema.prisma
# lokalno sqlite (skip-worktree override za lokalni dev). Skripta zato za čas
# ukaza zamenja shemo na committed POSTGRES verzijo in jo ob izhodu povrne
# (trap EXIT — tudi ob napaki/prekinitvi).
#
# UPORABA:
#   ./migrate-deploy.sh --status "<neon-postgres-url>"   # SAMO status (read-only)
#   ./migrate-deploy.sh "<neon-postgres-url>"            # status → deploy → status
#   (URL dobiš v Vercel ali Render dashboardu → Settings → Environment
#    Variables → DATABASE_URL — UPORABI ISTI URL KOT PRODUKCIJA!)
#
# VARNOST: `migrate deploy` uveljavi SAMO migracije iz prisma/migrations/
# (v zaporedju, transakcijsko). Trenutno čakajoča migracija
# (20260916100000_restrict_money_fks) zgolj zamenja dva FOREIGN KEY
# constrainta (Cascade→Restrict) — sprememba metapodatkov brez prepisa tabel
# in brez dotikanja podatkov; varno ob živem prometu (kratko zaklepanje obeh
# tabel). Neuspešen korak se transakcijsko razveljavi. Prisma v izpisu pokaže
# gostitelja, ne poverilnic.
#
# IZHOD: 0 = vse čakajoče migracije uveljavljene + status sinhron ·
#        1 = napaka (produkcija takrat NI bila spremenjena; --status mode
#            ne spremeni ničesar)
# ============================================================================
source "$(dirname "$0")/lib.sh"

SCHEMA_REL="prisma/schema.prisma"
SCHEMA_ABS="${REPO_ROOT}/${SCHEMA_REL}"
MIGRATIONS_DIR="${REPO_ROOT}/prisma/migrations"

# ── Argumenti: [--status] <url> ────────────────────────────────────────────
STATUS_ONLY=0
if [ "${1:-}" = "--status" ]; then
  STATUS_ONLY=1
  shift
fi
URL="${1:-}"
[ -n "$URL" ] || die "Uporaba: $0 [--status] \"<neon-postgres-url>\"   (iz Vercel/Render env DATABASE_URL)"

# ── Validacija vnosa (pred čimerkoli drugim) ──────────────────────────────
case "$URL" in
  postgres://*|postgresql://*) : ;;
  file:*|sqlite:*)
    die "To je SQLITE url — rabiš PRODUKCIJSKI Postgres URL (Vercel/Render env DATABASE_URL)" ;;
  *)
    die "URL se mora začeti s postgres:// ali postgresql://" ;;
esac

[ -d "$MIGRATIONS_DIR" ] || die "Manjka ${MIGRATIONS_DIR} — si na starem checkoutu (rabiš 1.27.0+)"
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

# ── 1/3: status PRED (read-only — informativno) ───────────────────────────
step "1/3 — Status PRED deployem (read-only; »not yet been applied« = čakajoče migracije)"
STATUS_EXIT=0
DATABASE_URL="$URL" bunx prisma migrate status --schema "$SCHEMA_ABS" || STATUS_EXIT=$?
if [ "$STATUS_EXIT" -ne 0 ]; then
  warn "Status poroča odstopanje (lahko samo čakajoče migracije — glej izpis) ali napako povezave"
  warn "Nadaljujem — morebitna napaka povezave bo padla na deploy koraku (produkcija nedotaknjena)"
fi

if [ "$STATUS_ONLY" = "1" ]; then
  ok "Status-only način — deploy NI bil izveden (produkcija ni bila spremenjena)"
  exit "$STATUS_EXIT"
fi

# ── 2/3: deploy ───────────────────────────────────────────────────────────
step "2/3 — Uveljavljanje čakajočih migracij (prisma migrate deploy)"
if DATABASE_URL="$URL" bunx prisma migrate deploy --schema "$SCHEMA_ABS"; then
  ok "Čakajoče migracije uveljavljene"
else
  die "migrate deploy NI uspel — Prisma neuspele korake transakcijsko razveljavi; preveri izpis zgoraj"
fi

# ── 3/3: status PO (dokaz sinhronosti) ────────────────────────────────────
step "3/3 — Preverjanje sinhronosti (pričakovano: »up to date« / brez »not yet applied«)"
if ! DATABASE_URL="$URL" bunx prisma migrate status --schema "$SCHEMA_ABS"; then
  warn "migrate status poroča odstopanje (deploy je uspel) — preveri izpis zgoraj"
  exit 1
fi
ok "Zgodovina sinhrona — produkcija je na zadnji migraciji"
